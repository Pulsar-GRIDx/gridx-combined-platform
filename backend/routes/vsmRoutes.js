/**
 * STS VSM Testing Routes
 * Provides endpoints for key management, server-side token generation,
 * and comparison with the VSM hardware module
 */
var express = require('express');
var router = express.Router();
var connection = require('../config/db');
var auth = require('../admin/authMiddllware');

/* ─── Table migration ─── */
var tableCreated = false;
function ensureTable(cb) {
  if (tableCreated) return cb();
  connection.query(
    'CREATE TABLE IF NOT EXISTS VsmVendingKeys (' +
    '  id INT AUTO_INCREMENT PRIMARY KEY,' +
    '  keyName VARCHAR(100) NOT NULL,' +
    '  keyType VARCHAR(50) NOT NULL,' +
    '  sgc VARCHAR(20),' +
    '  krn INT DEFAULT 1,' +
    '  ti INT DEFAULT 0,' +
    '  keyValue TEXT NOT NULL,' +
    '  decoderKeyHex TEXT,' +
    '  supplyGroupCode VARCHAR(20),' +
    '  isActive TINYINT DEFAULT 1,' +
    '  notes TEXT,' +
    '  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,' +
    '  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' +
    ') ENGINE=InnoDB',
    function(err) {
      if (err) return cb(err);
      connection.query(
        'CREATE TABLE IF NOT EXISTS VsmTestLog (' +
        '  id INT AUTO_INCREMENT PRIMARY KEY,' +
        '  testType VARCHAR(50) NOT NULL,' +
        '  meterNo VARCHAR(50),' +
        '  amount DECIMAL(12,2),' +
        '  serverToken VARCHAR(30),' +
        '  vsmToken VARCHAR(30),' +
        '  matched TINYINT,' +
        '  requestPayload TEXT,' +
        '  serverResponse TEXT,' +
        '  vsmResponse TEXT,' +
        '  dataFlow TEXT,' +
        '  notes TEXT,' +
        '  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP' +
        ') ENGINE=InnoDB',
        function(err2) {
          if (!err2) tableCreated = true;
          cb(err2);
        }
      );
    }
  );
}

/* ─── GET /vsm/keys — List all vending keys ─── */
router.get('/vsm/keys', auth.authenticateToken, function(req, res) {
  ensureTable(function(err) {
    if (err) return res.status(500).json({ error: err.message });
    connection.query(
      'SELECT * FROM VsmVendingKeys ORDER BY isActive DESC, updated_at DESC',
      function(err, rows) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, keys: rows || [] });
      }
    );
  });
});

/* ─── POST /vsm/keys — Add or update a vending key ─── */
router.post('/vsm/keys', auth.authenticateToken, function(req, res) {
  ensureTable(function(err) {
    if (err) return res.status(500).json({ error: err.message });
    var b = req.body;
    if (!b.keyName || !b.keyType || !b.keyValue) {
      return res.status(400).json({ error: 'keyName, keyType, and keyValue are required' });
    }
    if (b.id) {
      connection.query(
        'UPDATE VsmVendingKeys SET keyName=?, keyType=?, sgc=?, krn=?, ti=?, keyValue=?, decoderKeyHex=?, supplyGroupCode=?, isActive=?, notes=? WHERE id=?',
        [b.keyName, b.keyType, b.sgc || null, b.krn || 1, b.ti || 0, b.keyValue, b.decoderKeyHex || null, b.supplyGroupCode || null, b.isActive !== undefined ? b.isActive : 1, b.notes || null, b.id],
        function(err2, result) {
          if (err2) return res.status(500).json({ error: err2.message });
          res.json({ success: true, message: 'Key updated', id: b.id });
        }
      );
    } else {
      connection.query(
        'INSERT INTO VsmVendingKeys (keyName, keyType, sgc, krn, ti, keyValue, decoderKeyHex, supplyGroupCode, isActive, notes) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [b.keyName, b.keyType, b.sgc || null, b.krn || 1, b.ti || 0, b.keyValue, b.decoderKeyHex || null, b.supplyGroupCode || null, b.isActive !== undefined ? b.isActive : 1, b.notes || null],
        function(err2, result) {
          if (err2) return res.status(500).json({ error: err2.message });
          res.json({ success: true, message: 'Key added', id: result.insertId });
        }
      );
    }
  });
});

/* ─── DELETE /vsm/keys/:id — Remove a key ─── */
router.delete('/vsm/keys/:id', auth.authenticateToken, function(req, res) {
  ensureTable(function(err) {
    if (err) return res.status(500).json({ error: err.message });
    connection.query('DELETE FROM VsmVendingKeys WHERE id=?', [req.params.id], function(err2) {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ success: true, message: 'Key deleted' });
    });
  });
});

/* ─── POST /vsm/server-generate — Generate token using server implementation ─── */
router.post('/vsm/server-generate', auth.authenticateToken, function(req, res) {
  var b = req.body;
  var meterNo = b.meterNo;
  var amount = parseFloat(b.amount) || 0;
  var tokenId = b.tokenId;

  if (!meterNo || !amount) {
    return res.status(400).json({ error: 'meterNo and amount are required' });
  }

  var dataFlow = [];
  dataFlow.push({
    step: 1,
    label: 'POS Request',
    direction: 'outbound',
    timestamp: new Date().toISOString(),
    data: { meterNo: meterNo, amount: amount, tokenId: tokenId || 'auto' }
  });

  // Step 2: Look up meter/customer
  connection.query(
    'SELECT DRN, Name, Surname, City, Region FROM MeterProfileReal WHERE DRN = ? LIMIT 1',
    [meterNo],
    function(err, meterRows) {
      var meter = (meterRows && meterRows[0]) || { DRN: meterNo, Name: 'Unknown', Surname: '' };
      dataFlow.push({
        step: 2,
        label: 'Customer Lookup',
        direction: 'internal',
        timestamp: new Date().toISOString(),
        data: { found: !!(meterRows && meterRows[0]), customer: meter.Name + ' ' + meter.Surname, drn: meter.DRN }
      });

      // Step 3: Fetch tariff config
      connection.query('SELECT * FROM TariffConfig LIMIT 1', function(err2, configRows) {
        var config = (configRows && configRows[0]) || { vatRate: 15, fixedCharge: 0, relLevy: 0, arrearsPercentage: 0 };
        dataFlow.push({
          step: 3,
          label: 'Tariff Configuration',
          direction: 'internal',
          timestamp: new Date().toISOString(),
          data: {
            vatRate: config.vatRate,
            fixedCharge: config.fixedCharge,
            relLevy: config.relLevy,
            arrearsPercentage: config.arrearsPercentage
          }
        });

        // Step 4: Calculate breakdown
        var vatRate = parseFloat(config.vatRate || 15) / 100;
        var vatAmount = Math.round((amount - (amount / (1 + vatRate))) * 100) / 100;
        var afterVat = Math.round((amount - vatAmount) * 100) / 100;
        var fixedCharge = parseFloat(config.fixedCharge) || 0;
        var relLevy = parseFloat(config.relLevy) || 0;
        var energyAmount = Math.round((afterVat - fixedCharge - relLevy) * 100) / 100;
        if (energyAmount < 0) energyAmount = 0;

        dataFlow.push({
          step: 4,
          label: 'Tariff Calculation',
          direction: 'internal',
          timestamp: new Date().toISOString(),
          data: {
            amountTendered: amount,
            vatAmount: vatAmount,
            afterVat: afterVat,
            fixedCharge: fixedCharge,
            relLevy: relLevy,
            energyAmount: energyAmount
          }
        });

        // Step 5: Fetch tariff blocks for kWh calculation
        connection.query(
          'SELECT * FROM TariffBlocks ORDER BY sortOrder ASC',
          function(err3, blocks) {
            blocks = blocks || [];
            var totalKwh = 0;
            var remaining = energyAmount;
            var blockBreakdown = [];

            if (blocks.length > 0) {
              for (var i = 0; i < blocks.length && remaining > 0; i++) {
                var block = blocks[i];
                var rate = parseFloat(block.rate) || 1;
                var blockRange = (parseFloat(block.maxKwh) || 999999) - (parseFloat(block.minKwh) || 0);
                var blockCost = blockRange * rate;
                var usedAmount = Math.min(remaining, blockCost);
                var usedKwh = Math.round((usedAmount / rate) * 100) / 100;
                totalKwh += usedKwh;
                remaining -= usedAmount;
                blockBreakdown.push({ block: block.name || ('Block ' + (i + 1)), rate: rate, kwh: usedKwh, cost: usedAmount });
              }
            } else {
              var defaultRate = 1.68;
              totalKwh = Math.round((energyAmount / defaultRate) * 100) / 100;
              blockBreakdown.push({ block: 'Default', rate: defaultRate, kwh: totalKwh, cost: energyAmount });
            }

            dataFlow.push({
              step: 5,
              label: 'kWh Calculation',
              direction: 'internal',
              timestamp: new Date().toISOString(),
              data: { totalKwh: totalKwh, blocks: blockBreakdown }
            });

            // Step 6: Generate token (server implementation — random 20 digits)
            var token = '';
            for (var j = 0; j < 20; j++) token += Math.floor(Math.random() * 10);

            dataFlow.push({
              step: 6,
              label: 'Token Generation (Server)',
              direction: 'internal',
              timestamp: new Date().toISOString(),
              data: {
                method: 'Random 20-digit numeric',
                encryption: 'None (placeholder)',
                token: token,
                note: 'Server generates random token — replace with STS-compliant encryption'
              }
            });

            // Step 7: Final output
            var refNo = 'VSM-TEST-' + Date.now().toString(36).toUpperCase();
            dataFlow.push({
              step: 7,
              label: 'Final Token Output',
              direction: 'response',
              timestamp: new Date().toISOString(),
              data: {
                token: token,
                refNo: refNo,
                meterNo: meterNo,
                amount: amount,
                kWh: totalKwh,
                energyAmount: energyAmount
              }
            });

            // Log to DB
            ensureTable(function() {
              connection.query(
                'INSERT INTO VsmTestLog (testType, meterNo, amount, serverToken, requestPayload, serverResponse, dataFlow) VALUES (?,?,?,?,?,?,?)',
                ['server-generate', meterNo, amount, token, JSON.stringify(b), JSON.stringify({ token: token, refNo: refNo }), JSON.stringify(dataFlow)],
                function() { /* fire and forget */ }
              );
            });

            res.json({
              success: true,
              token: token,
              refNo: refNo,
              meterNo: meterNo,
              customerName: meter.Name + ' ' + meter.Surname,
              amount: amount,
              kWh: totalKwh,
              breakdown: {
                vatAmount: vatAmount,
                fixedCharge: fixedCharge,
                relLevy: relLevy,
                energyAmount: energyAmount
              },
              dataFlow: dataFlow
            });
          }
        );
      });
    }
  );
});

/* ─── POST /vsm/log-comparison — Log a VSM vs Server comparison ─── */
router.post('/vsm/log-comparison', auth.authenticateToken, function(req, res) {
  ensureTable(function(err) {
    if (err) return res.status(500).json({ error: err.message });
    var b = req.body;
    connection.query(
      'INSERT INTO VsmTestLog (testType, meterNo, amount, serverToken, vsmToken, matched, requestPayload, serverResponse, vsmResponse, dataFlow, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      ['comparison', b.meterNo, b.amount, b.serverToken, b.vsmToken, b.matched ? 1 : 0, JSON.stringify(b.request || {}), JSON.stringify(b.serverResponse || {}), JSON.stringify(b.vsmResponse || {}), JSON.stringify(b.dataFlow || []), b.notes || null],
      function(err2, result) {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json({ success: true, id: result.insertId });
      }
    );
  });
});

/* ─── GET /vsm/test-history — Get recent test logs ─── */
router.get('/vsm/test-history', auth.authenticateToken, function(req, res) {
  ensureTable(function(err) {
    if (err) return res.status(500).json({ error: err.message });
    var limit = parseInt(req.query.limit) || 50;
    connection.query(
      'SELECT * FROM VsmTestLog ORDER BY created_at DESC LIMIT ?',
      [limit],
      function(err2, rows) {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json({ success: true, logs: rows || [] });
      }
    );
  });
});

module.exports = router;
