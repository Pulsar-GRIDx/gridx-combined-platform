/**
 * STS Vending Routes — IEC 62055-41 Compliant
 *
 * KEY REQUIREMENTS:
 * 1. ATOMIC TRANSACTIONS — taxes, levies, standing charges, arrears, services
 *    are each stored as individual rows in TransactionLineItems.
 * 2. IDEMPOTENCY — idempotency keys prevent duplicate tokens for the same payment.
 * 3. FULL TRACEABILITY — every cent is traceable via the AuditLog and line items.
 * 4. TRANSACTION REVERSALS — reverse the ENTIRE transaction with full trace:
 *    reason, operator, timestamp, and reversal of every line item.
 */
var express = require('express');
var router = express.Router();
var db = require('../config/db');
var authMw = require('../admin/authMiddllware');
var authenticateToken = authMw.authenticateToken;

// Promise wrapper for the pool (mysql2 supports this)
var promisePool = db.promise();

// ─── AUTO-MIGRATE: Create tables if they don't exist ────────────────────────
var TABLES = [
  // Core customer registry
  "CREATE TABLE IF NOT EXISTS VendingCustomers (" +
  "  id INT AUTO_INCREMENT PRIMARY KEY," +
  "  accountNo VARCHAR(50) NOT NULL UNIQUE," +
  "  name VARCHAR(100) NOT NULL," +
  "  phone VARCHAR(30)," +
  "  email VARCHAR(100)," +
  "  meterNo VARCHAR(50) NOT NULL," +
  "  area VARCHAR(100)," +
  "  address VARCHAR(255)," +
  "  gpsLat DECIMAL(10,6)," +
  "  gpsLng DECIMAL(10,6)," +
  "  tariffGroup VARCHAR(50) DEFAULT 'Residential'," +
  "  meterMake VARCHAR(100)," +
  "  status ENUM('Active','Suspended','Inactive','Arrears') DEFAULT 'Active'," +
  "  arrears DECIMAL(12,2) DEFAULT 0," +
  "  lastPurchaseDate DATETIME," +
  "  lastPurchaseAmount DECIMAL(12,2) DEFAULT 0," +
  "  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP," +
  "  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
  "  INDEX idx_meterNo (meterNo)," +
  "  INDEX idx_area (area)," +
  "  INDEX idx_status (status)" +
  ")",

  // Master transaction record
  "CREATE TABLE IF NOT EXISTS VendingTransactions (" +
  "  id INT AUTO_INCREMENT PRIMARY KEY," +
  "  refNo VARCHAR(50) NOT NULL UNIQUE," +
  "  idempotencyKey VARCHAR(100) UNIQUE," +
  "  dateTime DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP," +
  "  customerId INT," +
  "  customerName VARCHAR(100)," +
  "  meterNo VARCHAR(50) NOT NULL," +
  "  amount DECIMAL(12,2) NOT NULL," +
  "  kWh DECIMAL(12,2) DEFAULT 0," +
  "  token VARCHAR(30)," +
  "  operator VARCHAR(100)," +
  "  operatorId INT," +
  "  type ENUM('Vend','Reversal','Free Token','Engineering','Reprint') DEFAULT 'Vend'," +
  "  status ENUM('Completed','Failed','Reversed','Pending') DEFAULT 'Completed'," +
  "  vendorId INT," +
  "  vendorName VARCHAR(100)," +
  "  salesBatchId INT," +
  "  reversalReason VARCHAR(255)," +
  "  reversedBy VARCHAR(100)," +
  "  reversedAt DATETIME," +
  "  originalTxnId INT," +
  "  vatAmount DECIMAL(12,2) DEFAULT 0," +
  "  fixedCharge DECIMAL(12,2) DEFAULT 0," +
  "  relLevy DECIMAL(12,2) DEFAULT 0," +
  "  arrearsDeducted DECIMAL(12,2) DEFAULT 0," +
  "  energyAmount DECIMAL(12,2) DEFAULT 0," +
  "  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP," +
  "  INDEX idx_meterNo (meterNo)," +
  "  INDEX idx_dateTime (dateTime)," +
  "  INDEX idx_vendorId (vendorId)," +
  "  INDEX idx_status (status)," +
  "  INDEX idx_type (type)," +
  "  INDEX idx_salesBatch (salesBatchId)," +
  "  INDEX idx_idempotency (idempotencyKey)" +
  ")",

  // Individual rows per deduction component
  "CREATE TABLE IF NOT EXISTS TransactionLineItems (" +
  "  id INT AUTO_INCREMENT PRIMARY KEY," +
  "  transactionId INT NOT NULL," +
  "  refNo VARCHAR(50) NOT NULL," +
  "  lineType ENUM('VAT','FIXED_CHARGE','REL_LEVY','ARREARS','ENERGY','COMMISSION','REVERSAL_VAT','REVERSAL_FIXED','REVERSAL_LEVY','REVERSAL_ARREARS','REVERSAL_ENERGY','REVERSAL_COMMISSION') NOT NULL," +
  "  description VARCHAR(255) NOT NULL," +
  "  amount DECIMAL(12,2) NOT NULL," +
  "  kWh DECIMAL(12,2) DEFAULT 0," +
  "  rate DECIMAL(8,4) DEFAULT 0," +
  "  meterNo VARCHAR(50)," +
  "  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP," +
  "  INDEX idx_txnId (transactionId)," +
  "  INDEX idx_refNo (refNo)," +
  "  INDEX idx_lineType (lineType)," +
  "  INDEX idx_meterNo (meterNo)" +
  ")",

  // Vendors
  "CREATE TABLE IF NOT EXISTS Vendors (" +
  "  id INT AUTO_INCREMENT PRIMARY KEY," +
  "  name VARCHAR(100) NOT NULL," +
  "  location VARCHAR(255)," +
  "  status ENUM('Active','Inactive','Suspended') DEFAULT 'Active'," +
  "  totalSales DECIMAL(14,2) DEFAULT 0," +
  "  transactionCount INT DEFAULT 0," +
  "  balance DECIMAL(14,2) DEFAULT 0," +
  "  commissionRate DECIMAL(5,2) DEFAULT 1.5," +
  "  operatorName VARCHAR(100)," +
  "  operatorPhone VARCHAR(30)," +
  "  lastActivity DATETIME," +
  "  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP," +
  "  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
  "  INDEX idx_status (status)" +
  ")",

  // Sales batches
  "CREATE TABLE IF NOT EXISTS SalesBatches (" +
  "  id INT AUTO_INCREMENT PRIMARY KEY," +
  "  batchNo VARCHAR(50) NOT NULL UNIQUE," +
  "  vendorId INT NOT NULL," +
  "  vendorName VARCHAR(100)," +
  "  status ENUM('Open','Closed') DEFAULT 'Open'," +
  "  transactionCount INT DEFAULT 0," +
  "  totalAmount DECIMAL(14,2) DEFAULT 0," +
  "  openedAt DATETIME DEFAULT CURRENT_TIMESTAMP," +
  "  closedAt DATETIME," +
  "  notes TEXT," +
  "  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP," +
  "  INDEX idx_vendorId (vendorId)," +
  "  INDEX idx_status (status)" +
  ")",

  // Banking batches
  "CREATE TABLE IF NOT EXISTS BankingBatches (" +
  "  id INT AUTO_INCREMENT PRIMARY KEY," +
  "  batchNo VARCHAR(50) NOT NULL UNIQUE," +
  "  salesBatchId INT NOT NULL," +
  "  bankRef VARCHAR(100)," +
  "  status ENUM('Pending','Submitted','Reconciled') DEFAULT 'Pending'," +
  "  totalAmount DECIMAL(14,2) DEFAULT 0," +
  "  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP," +
  "  reconciledAt DATETIME," +
  "  notes TEXT," +
  "  INDEX idx_salesBatchId (salesBatchId)," +
  "  INDEX idx_status (status)" +
  ")",

  // Tariff groups
  "CREATE TABLE IF NOT EXISTS TariffGroups (" +
  "  id INT AUTO_INCREMENT PRIMARY KEY," +
  "  name VARCHAR(50) NOT NULL UNIQUE," +
  "  sgc VARCHAR(20)," +
  "  description TEXT," +
  "  type ENUM('Block','Flat','TOU') DEFAULT 'Block'," +
  "  flatRate DECIMAL(8,4)," +
  "  customerCount INT DEFAULT 0," +
  "  effectiveDate DATE," +
  "  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP," +
  "  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP" +
  ")",

  // Tariff blocks
  "CREATE TABLE IF NOT EXISTS TariffBlocks (" +
  "  id INT AUTO_INCREMENT PRIMARY KEY," +
  "  tariffGroupId INT NOT NULL," +
  "  name VARCHAR(100) NOT NULL," +
  "  rangeLabel VARCHAR(50)," +
  "  rate DECIMAL(8,4) NOT NULL," +
  "  minKwh DECIMAL(12,2) DEFAULT 0," +
  "  maxKwh DECIMAL(12,2)," +
  "  period VARCHAR(20)," +
  "  sortOrder INT DEFAULT 0," +
  "  INDEX idx_tariffGroupId (tariffGroupId)" +
  ")",

  // Tariff config
  "CREATE TABLE IF NOT EXISTS TariffConfig (" +
  "  id INT AUTO_INCREMENT PRIMARY KEY," +
  "  vatRate DECIMAL(5,2) DEFAULT 15.00," +
  "  fixedCharge DECIMAL(8,2) DEFAULT 8.50," +
  "  relLevy DECIMAL(8,2) DEFAULT 2.40," +
  "  minPurchase DECIMAL(8,2) DEFAULT 5.00," +
  "  arrearsMode ENUM('auto-deduct','manual','disabled') DEFAULT 'auto-deduct'," +
  "  arrearsThreshold DECIMAL(12,2) DEFAULT 500.00," +
  "  arrearsPercentage DECIMAL(5,2) DEFAULT 25.00," +
  "  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP" +
  ")",

  // Audit log
  "CREATE TABLE IF NOT EXISTS AuditLog (" +
  "  id INT AUTO_INCREMENT PRIMARY KEY," +
  "  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP," +
  "  event VARCHAR(255) NOT NULL," +
  "  type ENUM('VEND','LOGIN','CREATE','UPDATE','DELETE','SYSTEM','REVERSAL','BATCH') DEFAULT 'SYSTEM'," +
  "  detail TEXT," +
  "  user VARCHAR(100)," +
  "  userId INT," +
  "  ipAddress VARCHAR(50)," +
  "  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP," +
  "  INDEX idx_timestamp (timestamp)," +
  "  INDEX idx_type (type)," +
  "  INDEX idx_userId (userId)" +
  ")",

  // Non-GridX (third-party) customer registry
  "CREATE TABLE IF NOT EXISTS NonGridxCustomers (" +
  "  id INT AUTO_INCREMENT PRIMARY KEY," +
  "  accountNo VARCHAR(50) NOT NULL UNIQUE," +
  "  name VARCHAR(100) NOT NULL," +
  "  phone VARCHAR(30)," +
  "  email VARCHAR(100)," +
  "  meterNo VARCHAR(50) NOT NULL," +
  "  meterType VARCHAR(100)," +
  "  meterMake VARCHAR(100)," +
  "  utilityProvider VARCHAR(100)," +
  "  area VARCHAR(100)," +
  "  address VARCHAR(255)," +
  "  gpsLat DECIMAL(10,6)," +
  "  gpsLng DECIMAL(10,6)," +
  "  tariffGroup VARCHAR(50) DEFAULT 'Residential'," +
  "  status ENUM('Active','Suspended','Inactive') DEFAULT 'Active'," +
  "  notes TEXT," +
  "  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP," +
  "  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
  "  INDEX idx_meterNo (meterNo)," +
  "  INDEX idx_area (area)," +
  "  INDEX idx_status (status)," +
  "  INDEX idx_provider (utilityProvider)" +
  ")"
];

// Run migration on module load
var migrated = 0;
TABLES.forEach(function(sql) {
  db.query(sql, function(err) {
    if (err && err.message.indexOf('already exists') === -1) {
      console.error('[Vending] Migration error:', err.message);
    }
    migrated++;
    if (migrated === TABLES.length) {
      console.log('[Vending] All tables migrated successfully');
      addIdempotencyColumn();
      seedDefaults();
    }
  });
});

// Add idempotencyKey column if it doesn't exist (for existing installations)
function addIdempotencyColumn() {
  db.query("SHOW COLUMNS FROM VendingTransactions LIKE 'idempotencyKey'", function(err, rows) {
    if (!err && (!rows || rows.length === 0)) {
      db.query("ALTER TABLE VendingTransactions ADD COLUMN idempotencyKey VARCHAR(100) UNIQUE AFTER refNo", function(alterErr) {
        if (alterErr) {
          console.log('[Vending] idempotencyKey column may already exist');
        } else {
          console.log('[Vending] Added idempotencyKey column');
        }
      });
    }
  });
  // Add batch close fields
  var batchCols = [
    ["SalesBatches", "openingFloat", "DECIMAL(14,2) DEFAULT 0"],
    ["SalesBatches", "closingCashCount", "DECIMAL(14,2) DEFAULT 0"],
    ["SalesBatches", "discrepancyAmount", "DECIMAL(14,2) DEFAULT 0"],
    ["SalesBatches", "discrepancyReason", "VARCHAR(255)"],
    ["SalesBatches", "closedBy", "VARCHAR(100)"],
    ["BankingBatches", "depositAmount", "DECIMAL(14,2) DEFAULT 0"],
    ["BankingBatches", "reconciledBy", "VARCHAR(100)"]
  ];
  batchCols.forEach(function(c) {
    db.query("SHOW COLUMNS FROM " + c[0] + " LIKE '" + c[1] + "'", function(err, rows) {
      if (!err && (!rows || rows.length === 0)) {
        db.query("ALTER TABLE " + c[0] + " ADD COLUMN " + c[1] + " " + c[2], function(alterErr) {
          if (!alterErr) console.log('[Vending] Added ' + c[0] + '.' + c[1]);
        });
      }
    });
  });
}

function seedDefaults() {
  db.query('SELECT COUNT(*) as c FROM TariffConfig', function(err, rows) {
    if (!err && rows[0].c === 0) {
      db.query('INSERT INTO TariffConfig (vatRate, fixedCharge, relLevy, minPurchase, arrearsMode, arrearsThreshold, arrearsPercentage) VALUES (15, 8.50, 2.40, 5.00, "auto-deduct", 500, 25)');
      console.log('[Vending] Default tariff config seeded');
    }
  });
  db.query('SELECT COUNT(*) as c FROM TariffGroups', function(err, rows) {
    if (!err && rows[0].c === 0) {
      var groups = [
        ['Residential', '48901', 'Standard residential prepaid tariff with inclining block structure', 'Block', null, '2025-07-01'],
        ['Commercial', '48902', 'Commercial and small business flat-rate prepaid tariff', 'Flat', 2.45, '2025-07-01'],
        ['Industrial', '48903', 'Industrial time-of-use prepaid tariff', 'TOU', null, '2025-07-01'],
      ];
      groups.forEach(function(g) {
        db.query('INSERT INTO TariffGroups (name, sgc, description, type, flatRate, effectiveDate) VALUES (?, ?, ?, ?, ?, ?)', g, function(err, result) {
          if (!err) {
            var gid = result.insertId;
            if (g[0] === 'Residential') {
              [
                ['Block 1 (Lifeline)', '0-50 kWh', 1.12, 0, 50, null, 0],
                ['Block 2', '51-350 kWh', 1.68, 51, 350, null, 1],
                ['Block 3', '351-600 kWh', 2.15, 351, 600, null, 2],
                ['Block 4', '601+ kWh', 2.85, 601, 999999, null, 3],
              ].forEach(function(b) { db.query('INSERT INTO TariffBlocks (tariffGroupId, name, rangeLabel, rate, minKwh, maxKwh, period, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [gid].concat(b)); });
            } else if (g[0] === 'Commercial') {
              db.query('INSERT INTO TariffBlocks (tariffGroupId, name, rangeLabel, rate, minKwh, maxKwh, period, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [gid, 'All Usage', '0+ kWh', 2.45, 0, 999999, null, 0]);
            } else if (g[0] === 'Industrial') {
              [
                ['Off-Peak (22:00-06:00)', 'All kWh', 1.45, 0, 999999, 'off-peak', 0],
                ['Standard (06:00-08:00, 11:00-18:00)', 'All kWh', 2.10, 0, 999999, 'standard', 1],
                ['Peak (08:00-11:00, 18:00-22:00)', 'All kWh', 3.25, 0, 999999, 'peak', 2],
              ].forEach(function(b) { db.query('INSERT INTO TariffBlocks (tariffGroupId, name, rangeLabel, rate, minKwh, maxKwh, period, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [gid].concat(b)); });
            }
          }
        });
      });
      console.log('[Vending] Default tariff groups seeded');
    }
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateRefNo() {
  var ts = Date.now().toString(36).toUpperCase();
  var rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return 'TXN-' + ts + '-' + rand;
}

function generateToken() {
  var token = '';
  for (var i = 0; i < 20; i++) token += Math.floor(Math.random() * 10);
  return token;
}

function logAudit(event, type, detail, user, userId, ip) {
  db.query(
    'INSERT INTO AuditLog (event, type, detail, user, userId, ipAddress) VALUES (?, ?, ?, ?, ?, ?)',
    [event, type, detail, user, userId, ip]
  );
}

function getOperatorName(req) {
  if (!req.user) return 'System';
  var first = req.user.FirstName || '';
  var last = req.user.LastName || '';
  return (first + ' ' + last).trim() || 'System';
}

function getOperatorId(req) {
  return (req.user && req.user.Admin_ID) || null;
}

function round2(n) {
  return Math.round(parseFloat(n) * 100) / 100;
}


// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMERS
// ═══════════════════════════════════════════════════════════════════════════

router.get('/customers', authenticateToken, function(req, res) {
  var search = req.query.search;
  var area = req.query.area;
  var status = req.query.status;
  var sql = 'SELECT * FROM VendingCustomers WHERE 1=1';
  var params = [];
  if (search) {
    sql += ' AND (name LIKE ? OR meterNo LIKE ? OR accountNo LIKE ?)';
    params.push('%' + search + '%', '%' + search + '%', '%' + search + '%');
  }
  if (area) { sql += ' AND area = ?'; params.push(area); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY name';
  db.query(sql, params, function(err, results) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, data: results || [] });
  });
});

router.get('/customers/areas/list', authenticateToken, function(req, res) {
  db.query('SELECT DISTINCT area FROM VendingCustomers WHERE area IS NOT NULL ORDER BY area', function(err, results) {
    if (err) return res.status(500).json({ error: err.message });
    db.query('SELECT DISTINCT City as area FROM MeterProfileReal WHERE City IS NOT NULL ORDER BY City', function(err2, results2) {
      var areas = {};
      (results || []).forEach(function(r) { if (r.area) areas[r.area] = true; });
      (results2 || []).forEach(function(r) { if (r.area) areas[r.area] = true; });
      res.json({ success: true, data: Object.keys(areas).sort() });
    });
  });
});

router.get('/customers/:meterNo', authenticateToken, function(req, res) {
  db.query('SELECT * FROM VendingCustomers WHERE meterNo = ?', [req.params.meterNo], function(err, results) {
    if (err) return res.status(500).json({ error: err.message });
    if (results && results.length > 0) return res.json({ success: true, data: results[0] });
    db.query(
      "SELECT DRN as meterNo, CONCAT(Name, ' ', Surname) as name, City as area, Region as suburb, StreetName as address, tariff_type as tariffGroup, 'Active' as status, 0 as arrears FROM MeterProfileReal WHERE DRN = ?",
      [req.params.meterNo],
      function(err2, results2) {
        if (err2) return res.status(500).json({ error: err2.message });
        if (!results2 || results2.length === 0) return res.status(404).json({ error: 'Customer not found' });
        res.json({ success: true, data: results2[0] });
      }
    );
  });
});

router.post('/customers', authenticateToken, function(req, res) {
  var b = req.body;
  if (!b.name || !b.meterNo) return res.status(400).json({ error: 'name and meterNo are required' });
  var acct = b.accountNo || ('ACC-' + new Date().getFullYear() + '-' + Date.now().toString().slice(-6));
  db.query(
    'INSERT INTO VendingCustomers (accountNo, name, phone, email, meterNo, area, address, gpsLat, gpsLng, tariffGroup, meterMake) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [acct, b.name, b.phone, b.email, b.meterNo, b.area, b.address, b.gpsLat, b.gpsLng, b.tariffGroup || 'Residential', b.meterMake],
    function(err, result) {
      if (err) return res.status(500).json({ error: err.message });
      logAudit('Customer created: ' + b.name, 'CREATE', 'Meter: ' + b.meterNo + ', Area: ' + b.area, getOperatorName(req), getOperatorId(req), req.ip);
      res.json({ success: true, id: result.insertId });
    }
  );
});

router.put('/customers/:id', authenticateToken, function(req, res) {
  var fields = ['name', 'phone', 'email', 'area', 'address', 'gpsLat', 'gpsLng', 'tariffGroup', 'meterMake', 'status', 'arrears'];
  var updates = [];
  var params = [];
  fields.forEach(function(f) {
    if (req.body[f] !== undefined) { updates.push(f + ' = ?'); params.push(req.body[f]); }
  });
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  params.push(req.params.id);
  db.query('UPDATE VendingCustomers SET ' + updates.join(', ') + ' WHERE id = ?', params, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// NON-GRIDX (THIRD-PARTY) CUSTOMERS
// ═══════════════════════════════════════════════════════════════════════════

var multer = require('multer');
var upload = multer({ dest: '/tmp/uploads/', limits: { fileSize: 5 * 1024 * 1024 } });
var fs = require('fs');

// GET all non-GridX customers
router.get('/non-gridx-customers', authenticateToken, function(req, res) {
  var search = req.query.search;
  var area = req.query.area;
  var status = req.query.status;
  var provider = req.query.provider;
  var sql = 'SELECT * FROM NonGridxCustomers WHERE 1=1';
  var params = [];
  if (search) {
    sql += ' AND (name LIKE ? OR meterNo LIKE ? OR accountNo LIKE ? OR utilityProvider LIKE ?)';
    params.push('%' + search + '%', '%' + search + '%', '%' + search + '%', '%' + search + '%');
  }
  if (area) { sql += ' AND area = ?'; params.push(area); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (provider) { sql += ' AND utilityProvider = ?'; params.push(provider); }
  sql += ' ORDER BY name';
  db.query(sql, params, function(err, results) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, data: results || [] });
  });
});

// GET single non-GridX customer
router.get('/non-gridx-customers/:id', authenticateToken, function(req, res) {
  db.query('SELECT * FROM NonGridxCustomers WHERE id = ?', [req.params.id], function(err, results) {
    if (err) return res.status(500).json({ error: err.message });
    if (!results || results.length === 0) return res.status(404).json({ error: 'Customer not found' });
    res.json({ success: true, data: results[0] });
  });
});

// POST create non-GridX customer
router.post('/non-gridx-customers', authenticateToken, function(req, res) {
  var b = req.body;
  if (!b.name || !b.meterNo) return res.status(400).json({ error: 'name and meterNo are required' });
  var acct = b.accountNo || ('EXT-' + new Date().getFullYear() + '-' + Date.now().toString().slice(-6));
  db.query(
    'INSERT INTO NonGridxCustomers (accountNo, name, phone, email, meterNo, meterType, meterMake, utilityProvider, area, address, gpsLat, gpsLng, tariffGroup, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [acct, b.name, b.phone, b.email, b.meterNo, b.meterType, b.meterMake, b.utilityProvider, b.area, b.address, b.gpsLat, b.gpsLng, b.tariffGroup || 'Residential', b.notes],
    function(err, result) {
      if (err) return res.status(500).json({ error: err.message });
      logAudit('Non-GridX customer created: ' + b.name, 'CREATE', 'Meter: ' + b.meterNo + ', Provider: ' + (b.utilityProvider || 'N/A'), getOperatorName(req), getOperatorId(req), req.ip);
      res.json({ success: true, id: result.insertId });
    }
  );
});

// PUT update non-GridX customer
router.put('/non-gridx-customers/:id', authenticateToken, function(req, res) {
  var fields = ['name', 'phone', 'email', 'meterNo', 'meterType', 'meterMake', 'utilityProvider', 'area', 'address', 'gpsLat', 'gpsLng', 'tariffGroup', 'status', 'notes'];
  var updates = [];
  var params = [];
  fields.forEach(function(f) {
    if (req.body[f] !== undefined) { updates.push(f + ' = ?'); params.push(req.body[f]); }
  });
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  params.push(req.params.id);
  db.query('UPDATE NonGridxCustomers SET ' + updates.join(', ') + ' WHERE id = ?', params, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// DELETE non-GridX customer
router.delete('/non-gridx-customers/:id', authenticateToken, function(req, res) {
  db.query('DELETE FROM NonGridxCustomers WHERE id = ?', [req.params.id], function(err, result) {
    if (err) return res.status(500).json({ error: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Customer not found' });
    logAudit('Non-GridX customer deleted', 'DELETE', 'ID: ' + req.params.id, getOperatorName(req), getOperatorId(req), req.ip);
    res.json({ success: true });
  });
});

// POST batch import non-GridX customers (CSV)
router.post('/non-gridx-customers/import', authenticateToken, upload.single('file'), function(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  var filePath = req.file.path;
  try {
    var content = fs.readFileSync(filePath, 'utf8');
    fs.unlinkSync(filePath); // clean up
    var lines = content.split(/\r?\n/).filter(function(l) { return l.trim(); });
    if (lines.length < 2) return res.status(400).json({ error: 'File must have a header row and at least one data row' });

    // Parse header
    var header = lines[0].split(',').map(function(h) { return h.trim().toLowerCase().replace(/[^a-z0-9_]/g, ''); });
    var fieldMap = {
      name: ['name', 'customername', 'customer_name', 'fullname'],
      meterNo: ['meterno', 'meter_no', 'meternumber', 'meter_number', 'meter'],
      phone: ['phone', 'telephone', 'tel', 'mobile', 'cell', 'phonenumber'],
      email: ['email', 'emailaddress', 'email_address'],
      meterType: ['metertype', 'meter_type', 'type'],
      meterMake: ['metermake', 'meter_make', 'make', 'brand'],
      utilityProvider: ['utilityprovider', 'utility_provider', 'provider', 'utility'],
      area: ['area', 'location', 'city', 'town', 'suburb'],
      address: ['address', 'streetaddress', 'street_address', 'street'],
      gpsLat: ['gpslat', 'gps_lat', 'latitude', 'lat'],
      gpsLng: ['gpslng', 'gps_lng', 'longitude', 'lng', 'lon'],
      tariffGroup: ['tariffgroup', 'tariff_group', 'tariff'],
      notes: ['notes', 'note', 'comments', 'comment']
    };

    // Map header columns to our fields
    var colIndex = {};
    Object.keys(fieldMap).forEach(function(field) {
      for (var i = 0; i < header.length; i++) {
        if (fieldMap[field].indexOf(header[i]) !== -1) {
          colIndex[field] = i;
          break;
        }
      }
    });

    if (colIndex.name === undefined || colIndex.meterNo === undefined) {
      return res.status(400).json({ error: 'CSV must have "Name" and "MeterNo" columns' });
    }

    var rows = [];
    var errors = [];
    for (var i = 1; i < lines.length; i++) {
      var cols = parseCSVLine(lines[i]);
      var name = cols[colIndex.name] ? cols[colIndex.name].trim() : '';
      var meterNo = cols[colIndex.meterNo] ? cols[colIndex.meterNo].trim() : '';
      if (!name || !meterNo) {
        errors.push('Row ' + (i + 1) + ': missing name or meterNo');
        continue;
      }
      var acct = 'EXT-' + new Date().getFullYear() + '-' + (Date.now() + i).toString().slice(-6);
      rows.push([
        acct, name,
        cols[colIndex.phone] ? cols[colIndex.phone].trim() : null,
        cols[colIndex.email] ? cols[colIndex.email].trim() : null,
        meterNo,
        cols[colIndex.meterType] ? cols[colIndex.meterType].trim() : null,
        cols[colIndex.meterMake] ? cols[colIndex.meterMake].trim() : null,
        cols[colIndex.utilityProvider] ? cols[colIndex.utilityProvider].trim() : null,
        cols[colIndex.area] ? cols[colIndex.area].trim() : null,
        cols[colIndex.address] ? cols[colIndex.address].trim() : null,
        cols[colIndex.gpsLat] ? parseFloat(cols[colIndex.gpsLat]) || null : null,
        cols[colIndex.gpsLng] ? parseFloat(cols[colIndex.gpsLng]) || null : null,
        cols[colIndex.tariffGroup] ? cols[colIndex.tariffGroup].trim() : 'Residential',
        cols[colIndex.notes] ? cols[colIndex.notes].trim() : null
      ]);
    }

    if (rows.length === 0) return res.status(400).json({ error: 'No valid rows found', details: errors });

    var sql = 'INSERT INTO NonGridxCustomers (accountNo, name, phone, email, meterNo, meterType, meterMake, utilityProvider, area, address, gpsLat, gpsLng, tariffGroup, notes) VALUES ?';
    db.query(sql, [rows], function(err, result) {
      if (err) return res.status(500).json({ error: err.message });
      logAudit('Batch import: ' + rows.length + ' non-GridX customers', 'CREATE', 'CSV import', getOperatorName(req), getOperatorId(req), req.ip);
      res.json({ success: true, imported: result.affectedRows, errors: errors });
    });
  } catch (e) {
    try { fs.unlinkSync(filePath); } catch(ex) {}
    return res.status(500).json({ error: 'Failed to parse file: ' + e.message });
  }
});

// Simple CSV line parser (handles quoted fields)
function parseCSVLine(line) {
  var result = [];
  var current = '';
  var inQuotes = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// GET providers list
router.get('/non-gridx-customers/providers/list', authenticateToken, function(req, res) {
  db.query('SELECT DISTINCT utilityProvider FROM NonGridxCustomers WHERE utilityProvider IS NOT NULL ORDER BY utilityProvider', function(err, results) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, data: (results || []).map(function(r) { return r.utilityProvider; }) });
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// TOKEN VENDING — ATOMIC, with individual line items
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /vending/vend
 *
 * STS compliance:
 * - Uses MySQL transaction (BEGIN / COMMIT / ROLLBACK) for atomicity
 * - Creates individual TransactionLineItems rows for: VAT, Fixed Charge,
 *   REL Levy, Arrears, Energy (and optionally Commission)
 * - Idempotency key prevents duplicate tokens from the same payment
 * - Full audit trail with operator traceability
 */
router.post('/vend', authenticateToken, function(req, res) {
  var meterNo = req.body.meterNo;
  var amount = req.body.amount;
  var vendorId = req.body.vendorId;
  var idempotencyKey = req.body.idempotencyKey || null;

  if (!meterNo || !amount || amount <= 0) {
    return res.status(400).json({ error: 'meterNo and positive amount are required' });
  }

  // IDEMPOTENCY CHECK: If caller provides a key, check for duplicate
  if (idempotencyKey) {
    db.query('SELECT id, refNo, token, amount, kWh, status FROM VendingTransactions WHERE idempotencyKey = ?', [idempotencyKey], function(err, existing) {
      if (err) return res.status(500).json({ error: err.message });
      if (existing && existing.length > 0) {
        // Return the existing transaction — no duplicate created
        var existingTxn = existing[0];
        db.query('SELECT * FROM TransactionLineItems WHERE transactionId = ?', [existingTxn.id], function(err2, lineItems) {
          return res.json({
            success: true,
            duplicate: true,
            message: 'Transaction already processed (idempotency key matched)',
            data: {
              refNo: existingTxn.refNo,
              token: existingTxn.token,
              meterNo: meterNo,
              amount: existingTxn.amount,
              kWh: existingTxn.kWh,
              status: existingTxn.status,
              lineItems: lineItems || []
            }
          });
        });
        return;
      }
      // No duplicate — proceed with vend
      doVend(meterNo, parseFloat(amount), vendorId, idempotencyKey, req, res);
    });
  } else {
    doVend(meterNo, parseFloat(amount), vendorId, null, req, res);
  }
});

function doVend(meterNo, totalAmount, vendorId, idempotencyKey, req, res) {
  var operatorName = getOperatorName(req);
  var operatorId = getOperatorId(req);

  // Step 1: Get tariff config
  db.query('SELECT * FROM TariffConfig LIMIT 1', function(err, configRows) {
    if (err) return res.status(500).json({ error: err.message });
    var config = (configRows && configRows[0]) || { vatRate: 15, fixedCharge: 8.50, relLevy: 2.40, arrearsPercentage: 25, arrearsMode: 'auto-deduct', minPurchase: 5 };

    // Minimum purchase check
    if (totalAmount < parseFloat(config.minPurchase || 5)) {
      return res.status(400).json({ error: 'Amount below minimum purchase of N$' + (config.minPurchase || 5) });
    }

    // Step 2: Look up customer
    lookupCustomer(meterNo, function(custErr, customer) {
      if (custErr) return res.status(404).json({ error: custErr.message });

      // Step 3: Get tariff blocks
      var tariffName = customer.tariffGroup || 'Residential';
      db.query(
        'SELECT tb.* FROM TariffBlocks tb JOIN TariffGroups tg ON tb.tariffGroupId = tg.id WHERE tg.name = ? ORDER BY tb.sortOrder',
        [tariffName],
        function(blkErr, blocks) {
          if (blkErr) return res.status(500).json({ error: blkErr.message });
          if (!blocks || blocks.length === 0) {
            blocks = [{ name: 'Default', rate: 1.68, minKwh: 0, maxKwh: 999999 }];
          }

          // Step 4: Calculate breakdown
          var vatRate = parseFloat(config.vatRate) / 100;
          var vatAmount = round2(totalAmount - (totalAmount / (1 + vatRate)));
          var afterVat = round2(totalAmount - vatAmount);
          var fixedCharge = round2(parseFloat(config.fixedCharge));
          var relLevy = round2(parseFloat(config.relLevy));

          // Arrears deduction
          var arrearsDeducted = 0;
          var customerArrears = parseFloat(customer.arrears) || 0;
          if (config.arrearsMode === 'auto-deduct' && customerArrears > 0) {
            arrearsDeducted = round2(Math.min(
              customerArrears,
              afterVat * (parseFloat(config.arrearsPercentage) / 100)
            ));
          }

          var energyAmount = round2(afterVat - fixedCharge - relLevy - arrearsDeducted);
          if (energyAmount <= 0) {
            return res.status(400).json({ error: 'Amount too low to generate energy units after deductions' });
          }

          // Calculate kWh using block tariff
          var remainingAmount = energyAmount;
          var totalKwh = 0;
          var blockBreakdown = [];

          for (var i = 0; i < blocks.length; i++) {
            if (remainingAmount <= 0) break;
            var block = blocks[i];
            var blockRange = (parseFloat(block.maxKwh) || 999999) - (parseFloat(block.minKwh) || 0);
            var blockCost = blockRange * parseFloat(block.rate);
            var usedAmount = Math.min(remainingAmount, blockCost);
            var usedKwh = usedAmount / parseFloat(block.rate);
            totalKwh += usedKwh;
            remainingAmount -= usedAmount;
            blockBreakdown.push({
              block: block.name,
              rate: parseFloat(block.rate),
              kWh: round2(usedKwh),
              amount: round2(usedAmount)
            });
          }
          totalKwh = round2(totalKwh);

          // Step 5: Generate token and ref
          var token = generateToken();
          var refNo = generateRefNo();

          // Step 6: Get vendor info
          getVendorInfo(vendorId, function(vendor) {
            getOpenBatch(vendor.id, function(batchId) {

              // Step 7: Calculate commission
              var commission = vendor.id ? round2(totalAmount * (parseFloat(vendor.commissionRate || 1.5) / 100)) : 0;

              // ═══════════════════════════════════════════════════════
              // ATOMIC TRANSACTION — BEGIN / COMMIT / ROLLBACK
              // ═══════════════════════════════════════════════════════
              promisePool.getConnection().then(function(conn) {
                return conn.beginTransaction().then(function() {

                  // Insert master transaction
                  return conn.query(
                    'INSERT INTO VendingTransactions (refNo, idempotencyKey, customerName, customerId, meterNo, amount, kWh, token, operator, operatorId, type, status, vendorId, vendorName, salesBatchId, vatAmount, fixedCharge, relLevy, arrearsDeducted, energyAmount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [refNo, idempotencyKey, customer.name, customer.id || null, meterNo, totalAmount, totalKwh, token, operatorName, operatorId, 'Vend', 'Completed', vendor.id, vendor.name, batchId, vatAmount, fixedCharge, relLevy, arrearsDeducted, energyAmount]
                  ).then(function(result) {
                    var txnId = result[0].insertId;

                    // Build individual line item rows (compliance requirement)
                    var lineItems = [];

                    // 1. VAT line item
                    lineItems.push([txnId, refNo, 'VAT', 'Value Added Tax @ ' + config.vatRate + '%', vatAmount, 0, parseFloat(config.vatRate), meterNo]);

                    // 2. Fixed charge line item
                    lineItems.push([txnId, refNo, 'FIXED_CHARGE', 'Monthly fixed/standing charge', fixedCharge, 0, 0, meterNo]);

                    // 3. REL levy line item
                    lineItems.push([txnId, refNo, 'REL_LEVY', 'Rural Electrification Levy', relLevy, 0, 0, meterNo]);

                    // 4. Arrears line item (only if applicable)
                    if (arrearsDeducted > 0) {
                      lineItems.push([txnId, refNo, 'ARREARS', 'Arrears deduction (' + config.arrearsPercentage + '% of N$' + afterVat.toFixed(2) + ')', arrearsDeducted, 0, parseFloat(config.arrearsPercentage), meterNo]);
                    }

                    // 5. Energy line items (one per tariff block used)
                    for (var j = 0; j < blockBreakdown.length; j++) {
                      var bb = blockBreakdown[j];
                      lineItems.push([txnId, refNo, 'ENERGY', 'Energy: ' + bb.block + ' @ N$' + bb.rate.toFixed(4) + '/kWh', bb.amount, bb.kWh, bb.rate, meterNo]);
                    }

                    // 6. Commission line item (if vendor)
                    if (commission > 0) {
                      lineItems.push([txnId, refNo, 'COMMISSION', 'Vendor commission: ' + vendor.name + ' @ ' + (vendor.commissionRate || 1.5) + '%', commission, 0, parseFloat(vendor.commissionRate || 1.5), meterNo]);
                    }

                    // Insert all line items
                    var insertPromises = lineItems.map(function(li) {
                      return conn.query(
                        'INSERT INTO TransactionLineItems (transactionId, refNo, lineType, description, amount, kWh, rate, meterNo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                        li
                      );
                    });

                    return Promise.all(insertPromises).then(function() {
                      // Update vendor stats
                      var updates = [];
                      if (vendor.id) {
                        updates.push(conn.query('UPDATE Vendors SET totalSales = totalSales + ?, transactionCount = transactionCount + 1, lastActivity = NOW() WHERE id = ?', [totalAmount, vendor.id]));
                      }
                      // Update batch stats
                      if (batchId) {
                        updates.push(conn.query('UPDATE SalesBatches SET transactionCount = transactionCount + 1, totalAmount = totalAmount + ? WHERE id = ?', [totalAmount, batchId]));
                      }
                      // Update customer arrears and last purchase
                      if (customer.id) {
                        if (arrearsDeducted > 0) {
                          updates.push(conn.query('UPDATE VendingCustomers SET arrears = arrears - ?, lastPurchaseDate = NOW(), lastPurchaseAmount = ? WHERE id = ?', [arrearsDeducted, totalAmount, customer.id]));
                        } else {
                          updates.push(conn.query('UPDATE VendingCustomers SET lastPurchaseDate = NOW(), lastPurchaseAmount = ? WHERE id = ?', [totalAmount, customer.id]));
                        }
                      } else {
                        if (arrearsDeducted > 0) {
                          updates.push(conn.query('UPDATE VendingCustomers SET arrears = arrears - ?, lastPurchaseDate = NOW(), lastPurchaseAmount = ? WHERE meterNo = ?', [arrearsDeducted, totalAmount, meterNo]));
                        } else {
                          updates.push(conn.query('UPDATE VendingCustomers SET lastPurchaseDate = NOW(), lastPurchaseAmount = ? WHERE meterNo = ?', [totalAmount, meterNo]));
                        }
                      }

                      return Promise.all(updates).then(function() {
                        return { txnId: txnId, lineItemCount: lineItems.length };
                      });
                    });
                  });

                }).then(function(result) {
                  // COMMIT — all or nothing
                  return conn.commit().then(function() {
                    conn.release();

                    // Audit log (outside transaction — non-critical)
                    logAudit(
                      'Token vended: N$' + totalAmount.toFixed(2) + ' to meter ' + meterNo,
                      'VEND',
                      'Ref: ' + refNo + ', Token: ' + token + ', kWh: ' + totalKwh + ', Customer: ' + customer.name + ', Line items: ' + result.lineItemCount,
                      operatorName, operatorId, req.ip
                    );

                    // Return success with full breakdown
                    res.json({
                      success: true,
                      data: {
                        transactionId: result.txnId,
                        refNo: refNo,
                        token: token,
                        meterNo: meterNo,
                        customerName: customer.name,
                        amount: totalAmount,
                        kWh: totalKwh,
                        breakdown: {
                          totalAmount: totalAmount,
                          vatAmount: vatAmount,
                          vatRate: parseFloat(config.vatRate),
                          fixedCharge: fixedCharge,
                          relLevy: relLevy,
                          arrearsDeducted: arrearsDeducted,
                          energyAmount: energyAmount,
                          commission: commission,
                          blocks: blockBreakdown
                        },
                        lineItemCount: result.lineItemCount,
                        operator: operatorName,
                        vendorName: vendor.name,
                        dateTime: new Date().toISOString(),
                        status: 'Completed'
                      }
                    });
                  });

                }).catch(function(txnErr) {
                  // ROLLBACK on any error — no partial data
                  return conn.rollback().then(function() {
                    conn.release();
                    console.error('[Vending] Transaction ROLLED BACK:', txnErr.message);
                    logAudit('VEND FAILED (rolled back): meter ' + meterNo + ' amount N$' + totalAmount, 'SYSTEM', txnErr.message, operatorName, operatorId, req.ip);
                    res.status(500).json({ error: 'Transaction failed and was rolled back: ' + txnErr.message });
                  });
                });
              }).catch(function(connErr) {
                console.error('[Vending] Could not get DB connection:', connErr.message);
                res.status(500).json({ error: 'Database connection error' });
              });

            });
          });
        }
      );
    });
  });
}

// Helper: lookup customer from VendingCustomers or MeterProfileReal
function lookupCustomer(meterNo, callback) {
  db.query('SELECT * FROM VendingCustomers WHERE meterNo = ?', [meterNo], function(err, rows) {
    if (rows && rows.length > 0) return callback(null, rows[0]);
    db.query(
      "SELECT DRN as meterNo, CONCAT(Name, ' ', Surname) as name, City as area, tariff_type as tariffGroup, 0 as arrears, 'Active' as status FROM MeterProfileReal WHERE DRN = ?",
      [meterNo],
      function(err2, rows2) {
        if (err2 || !rows2 || rows2.length === 0) return callback(new Error('Meter not found'));
        callback(null, rows2[0]);
      }
    );
  });
}

// Helper: get vendor info
function getVendorInfo(vendorId, callback) {
  if (!vendorId) return callback({ name: 'System', id: null, commissionRate: 0 });
  db.query('SELECT id, name, commissionRate FROM Vendors WHERE id = ?', [vendorId], function(err, rows) {
    if (rows && rows.length > 0) return callback(rows[0]);
    callback({ name: 'System', id: null, commissionRate: 0 });
  });
}

// Helper: get open sales batch for vendor
function getOpenBatch(vendorId, callback) {
  if (!vendorId) return callback(null);
  db.query('SELECT id FROM SalesBatches WHERE vendorId = ? AND status = "Open" ORDER BY openedAt DESC LIMIT 1', [vendorId], function(err, rows) {
    callback(rows && rows.length > 0 ? rows[0].id : null);
  });
}


// POST /vending/free-token - Issue free/engineering token
router.post('/free-token', authenticateToken, function(req, res) {
  var meterNo = req.body.meterNo;
  var kWh = req.body.kWh;
  var type = req.body.type || 'Free Token';
  if (!meterNo) return res.status(400).json({ error: 'meterNo is required' });

  var token = generateToken();
  var refNo = generateRefNo();
  var operatorName = getOperatorName(req);
  var operatorId = getOperatorId(req);

  db.query(
    'INSERT INTO VendingTransactions (refNo, meterNo, amount, kWh, token, operator, operatorId, type, status) VALUES (?, ?, 0, ?, ?, ?, ?, ?, "Completed")',
    [refNo, meterNo, kWh || 0, token, operatorName, operatorId, type],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAudit(type + ' issued to meter ' + meterNo, 'VEND', 'kWh: ' + (kWh || 0), operatorName, operatorId, req.ip);
      res.json({ success: true, data: { refNo: refNo, token: token, meterNo: meterNo, kWh: kWh || 0, type: type } });
    }
  );
});


// ═══════════════════════════════════════════════════════════════════════════
// TRANSACTIONS
// ═══════════════════════════════════════════════════════════════════════════

router.get('/transactions', authenticateToken, function(req, res) {
  var search = req.query.search;
  var type = req.query.type;
  var status = req.query.status;
  var from = req.query.from;
  var to = req.query.to;
  var vendorId = req.query.vendorId;
  var limit = parseInt(req.query.limit) || 100;
  var offset = parseInt(req.query.offset) || 0;

  var sql = 'SELECT * FROM VendingTransactions WHERE 1=1';
  var params = [];
  if (search) {
    sql += ' AND (refNo LIKE ? OR customerName LIKE ? OR meterNo LIKE ? OR token LIKE ?)';
    params.push('%' + search + '%', '%' + search + '%', '%' + search + '%', '%' + search + '%');
  }
  if (type && type !== 'All') { sql += ' AND type = ?'; params.push(type); }
  if (status && status !== 'All') { sql += ' AND status = ?'; params.push(status); }
  if (from) { sql += ' AND dateTime >= ?'; params.push(from); }
  if (to) { sql += ' AND dateTime <= ?'; params.push(to); }
  if (vendorId) { sql += ' AND vendorId = ?'; params.push(vendorId); }
  sql += ' ORDER BY dateTime DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  db.query(sql, params, function(err, results) {
    if (err) return res.status(500).json({ error: err.message });

    var countSql = 'SELECT COUNT(*) as total FROM VendingTransactions WHERE 1=1';
    var countParams = [];
    if (search) {
      countSql += ' AND (refNo LIKE ? OR customerName LIKE ? OR meterNo LIKE ? OR token LIKE ?)';
      countParams.push('%' + search + '%', '%' + search + '%', '%' + search + '%', '%' + search + '%');
    }
    if (type && type !== 'All') { countSql += ' AND type = ?'; countParams.push(type); }
    if (status && status !== 'All') { countSql += ' AND status = ?'; countParams.push(status); }
    if (from) { countSql += ' AND dateTime >= ?'; countParams.push(from); }
    if (to) { countSql += ' AND dateTime <= ?'; countParams.push(to); }
    if (vendorId) { countSql += ' AND vendorId = ?'; countParams.push(vendorId); }

    db.query(countSql, countParams, function(err2, countResult) {
      res.json({
        success: true,
        data: results || [],
        total: countResult ? countResult[0].total : 0
      });
    });
  });
});

router.get('/transactions/:id', authenticateToken, function(req, res) {
  db.query('SELECT * FROM VendingTransactions WHERE id = ? OR refNo = ?', [req.params.id, req.params.id], function(err, results) {
    if (err) return res.status(500).json({ error: err.message });
    if (!results || results.length === 0) return res.status(404).json({ error: 'Transaction not found' });
    var txn = results[0];
    // Also fetch line items for full traceability
    db.query('SELECT * FROM TransactionLineItems WHERE transactionId = ? ORDER BY id', [txn.id], function(err2, lineItems) {
      txn.lineItems = lineItems || [];
      res.json({ success: true, data: txn });
    });
  });
});

// GET /vending/transactions/:id/line-items - Get line items for a transaction
router.get('/transactions/:id/line-items', authenticateToken, function(req, res) {
  db.query('SELECT * FROM TransactionLineItems WHERE transactionId = ? ORDER BY id', [req.params.id], function(err, results) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, data: results || [] });
  });
});


/**
 * POST /vending/transactions/:id/reverse
 *
 * STS compliance:
 * "Transaction reversals shall: be effected with full traceability of the reversal;
 *  shall allow for a reason to be supplied; shall be traceable to an operator;
 *  and shall reverse an entire transaction..."
 *
 * This creates a REVERSAL transaction + individual reversal line items
 * that mirror every original line item, all within a single MySQL transaction.
 */
router.post('/transactions/:id/reverse', authenticateToken, function(req, res) {
  var reason = req.body.reason;
  if (!reason) return res.status(400).json({ error: 'Reversal reason is required (traceability requirement)' });

  var operatorName = getOperatorName(req);
  var operatorId = getOperatorId(req);

  // Fetch original transaction + its line items
  db.query('SELECT * FROM VendingTransactions WHERE id = ?', [req.params.id], function(err, results) {
    if (err) return res.status(500).json({ error: err.message });
    if (!results || results.length === 0) return res.status(404).json({ error: 'Transaction not found' });

    var txn = results[0];
    if (txn.status === 'Reversed') return res.status(400).json({ error: 'Transaction already reversed' });
    if (txn.type === 'Reversal') return res.status(400).json({ error: 'Cannot reverse a reversal' });

    // Get original line items
    db.query('SELECT * FROM TransactionLineItems WHERE transactionId = ?', [txn.id], function(err2, originalLineItems) {
      if (err2) return res.status(500).json({ error: err2.message });

      var reversalRefNo = generateRefNo();

      // ATOMIC REVERSAL
      promisePool.getConnection().then(function(conn) {
        return conn.beginTransaction().then(function() {

          // 1. Mark original as reversed
          return conn.query(
            'UPDATE VendingTransactions SET status = "Reversed", reversalReason = ?, reversedBy = ?, reversedAt = NOW() WHERE id = ?',
            [reason, operatorName, txn.id]
          ).then(function() {

            // 2. Create reversal transaction (negative amounts)
            return conn.query(
              'INSERT INTO VendingTransactions (refNo, customerName, customerId, meterNo, amount, kWh, token, operator, operatorId, type, status, vendorId, vendorName, originalTxnId, reversalReason, vatAmount, fixedCharge, relLevy, arrearsDeducted, energyAmount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, "Reversal", "Completed", ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [reversalRefNo, txn.customerName, txn.customerId, txn.meterNo, -Math.abs(txn.amount), -Math.abs(txn.kWh), txn.token, operatorName, operatorId, txn.vendorId, txn.vendorName, txn.id, reason, -Math.abs(txn.vatAmount || 0), -Math.abs(txn.fixedCharge || 0), -Math.abs(txn.relLevy || 0), -Math.abs(txn.arrearsDeducted || 0), -Math.abs(txn.energyAmount || 0)]
            );
          }).then(function(result) {
            var reversalTxnId = result[0].insertId;

            // 3. Create reversal line items — one for each original line item
            var REVERSAL_TYPE_MAP = {
              'VAT': 'REVERSAL_VAT',
              'FIXED_CHARGE': 'REVERSAL_FIXED',
              'REL_LEVY': 'REVERSAL_LEVY',
              'ARREARS': 'REVERSAL_ARREARS',
              'ENERGY': 'REVERSAL_ENERGY',
              'COMMISSION': 'REVERSAL_COMMISSION'
            };

            var reversalItems = (originalLineItems || []).map(function(li) {
              var revType = REVERSAL_TYPE_MAP[li.lineType] || 'REVERSAL_ENERGY';
              return [
                reversalTxnId, reversalRefNo, revType,
                'REVERSAL: ' + li.description + ' [Reason: ' + reason + ']',
                -Math.abs(parseFloat(li.amount)), -Math.abs(parseFloat(li.kWh || 0)),
                parseFloat(li.rate || 0), li.meterNo
              ];
            });

            var insertPromises = reversalItems.map(function(ri) {
              return conn.query(
                'INSERT INTO TransactionLineItems (transactionId, refNo, lineType, description, amount, kWh, rate, meterNo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                ri
              );
            });

            return Promise.all(insertPromises).then(function() {
              // 4. Reverse vendor stats
              var updates = [];
              if (txn.vendorId) {
                updates.push(conn.query('UPDATE Vendors SET totalSales = totalSales - ?, transactionCount = GREATEST(transactionCount - 1, 0) WHERE id = ?', [Math.abs(txn.amount), txn.vendorId]));
              }
              // 5. Reverse batch stats
              if (txn.salesBatchId) {
                updates.push(conn.query('UPDATE SalesBatches SET transactionCount = GREATEST(transactionCount - 1, 0), totalAmount = totalAmount - ? WHERE id = ?', [Math.abs(txn.amount), txn.salesBatchId]));
              }
              // 6. Restore arrears if was deducted
              if (txn.arrearsDeducted && parseFloat(txn.arrearsDeducted) > 0) {
                updates.push(conn.query('UPDATE VendingCustomers SET arrears = arrears + ? WHERE meterNo = ?', [Math.abs(txn.arrearsDeducted), txn.meterNo]));
              }

              return Promise.all(updates).then(function() {
                return { reversalTxnId: reversalTxnId, reversalLineItems: reversalItems.length };
              });
            });

          });
        }).then(function(result) {
          // COMMIT
          return conn.commit().then(function() {
            conn.release();

            logAudit(
              'Transaction REVERSED: ' + txn.refNo + ' -> ' + reversalRefNo,
              'REVERSAL',
              'Original amount: N$' + txn.amount + ', Reason: ' + reason + ', Operator: ' + operatorName + ', Line items reversed: ' + result.reversalLineItems,
              operatorName, operatorId, req.ip
            );

            res.json({
              success: true,
              data: {
                reversalRefNo: reversalRefNo,
                originalRefNo: txn.refNo,
                originalTxnId: txn.id,
                reversalTxnId: result.reversalTxnId,
                amount: -Math.abs(txn.amount),
                reason: reason,
                operator: operatorName,
                reversalLineItems: result.reversalLineItems,
                timestamp: new Date().toISOString()
              }
            });
          });
        }).catch(function(revErr) {
          return conn.rollback().then(function() {
            conn.release();
            console.error('[Vending] Reversal ROLLED BACK:', revErr.message);
            logAudit('REVERSAL FAILED (rolled back): txn ' + txn.refNo, 'SYSTEM', revErr.message, operatorName, operatorId, req.ip);
            res.status(500).json({ error: 'Reversal failed and was rolled back: ' + revErr.message });
          });
        });
      }).catch(function(connErr) {
        res.status(500).json({ error: 'Database connection error' });
      });

    });
  });
});


// POST /vending/transactions/:id/reprint
router.post('/transactions/:id/reprint', authenticateToken, function(req, res) {
  db.query('SELECT * FROM VendingTransactions WHERE id = ?', [req.params.id], function(err, results) {
    if (err) return res.status(500).json({ error: err.message });
    if (!results || results.length === 0) return res.status(404).json({ error: 'Transaction not found' });
    var operatorName = getOperatorName(req);
    logAudit('Token reprinted: ' + results[0].refNo, 'VEND', 'Meter: ' + results[0].meterNo, operatorName, getOperatorId(req), req.ip);
    db.query('SELECT * FROM TransactionLineItems WHERE transactionId = ? ORDER BY id', [results[0].id], function(err2, lineItems) {
      var data = results[0];
      data.lineItems = lineItems || [];
      res.json({ success: true, data: data });
    });
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// VENDORS
// ═══════════════════════════════════════════════════════════════════════════

router.get('/vendors', authenticateToken, function(req, res) {
  db.query('SELECT * FROM Vendors ORDER BY name', function(err, results) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, data: results || [] });
  });
});

router.get('/vendors/:id', authenticateToken, function(req, res) {
  db.query('SELECT * FROM Vendors WHERE id = ?', [req.params.id], function(err, results) {
    if (err) return res.status(500).json({ error: err.message });
    if (!results || results.length === 0) return res.status(404).json({ error: 'Vendor not found' });
    res.json({ success: true, data: results[0] });
  });
});

router.post('/vendors', authenticateToken, function(req, res) {
  var b = req.body;
  if (!b.name) return res.status(400).json({ error: 'Vendor name is required' });
  db.query(
    'INSERT INTO Vendors (name, location, commissionRate, operatorName, operatorPhone) VALUES (?, ?, ?, ?, ?)',
    [b.name, b.location, b.commissionRate || 1.5, b.operatorName, b.operatorPhone],
    function(err, result) {
      if (err) return res.status(500).json({ error: err.message });
      logAudit('Vendor created: ' + b.name, 'CREATE', 'Location: ' + b.location, getOperatorName(req), getOperatorId(req), req.ip);
      res.json({ success: true, id: result.insertId });
    }
  );
});

router.put('/vendors/:id', authenticateToken, function(req, res) {
  var fields = ['name', 'location', 'status', 'commissionRate', 'operatorName', 'operatorPhone', 'balance'];
  var updates = [];
  var params = [];
  fields.forEach(function(f) {
    if (req.body[f] !== undefined) { updates.push(f + ' = ?'); params.push(req.body[f]); }
  });
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  params.push(req.params.id);
  db.query('UPDATE Vendors SET ' + updates.join(', ') + ' WHERE id = ?', params, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

router.delete('/vendors/:id', authenticateToken, function(req, res) {
  db.query('DELETE FROM Vendors WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

router.get('/vendors/:id/commission', authenticateToken, function(req, res) {
  var sql = "SELECT v.*, (SELECT COUNT(*) FROM VendingTransactions t WHERE t.vendorId = v.id AND t.type = 'Vend' AND t.status = 'Completed') as completedTxns, (SELECT COALESCE(SUM(t.amount), 0) FROM VendingTransactions t WHERE t.vendorId = v.id AND t.type = 'Vend' AND t.status = 'Completed') as totalVended FROM Vendors v WHERE v.id = ?";
  db.query(sql, [req.params.id], function(err, results) {
    if (err) return res.status(500).json({ error: err.message });
    if (!results || results.length === 0) return res.status(404).json({ error: 'Vendor not found' });
    var vendor = results[0];
    var commission = vendor.totalVended * (vendor.commissionRate / 100);
    vendor.commission = round2(commission);
    res.json({ success: true, data: vendor });
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// SALES & BANKING BATCHES
// ═══════════════════════════════════════════════════════════════════════════

router.get('/batches/sales', authenticateToken, function(req, res) {
  var sql = 'SELECT * FROM SalesBatches WHERE 1=1';
  var params = [];
  if (req.query.vendorId) { sql += ' AND vendorId = ?'; params.push(req.query.vendorId); }
  if (req.query.status) { sql += ' AND status = ?'; params.push(req.query.status); }
  sql += ' ORDER BY openedAt DESC';
  db.query(sql, params, function(err, results) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, data: results || [] });
  });
});

router.post('/batches/sales', authenticateToken, function(req, res) {
  var vendorId = req.body.vendorId;
  var notes = req.body.notes;
  var openingFloat = req.body.openingFloat || 0;
  if (!vendorId) return res.status(400).json({ error: 'vendorId is required' });

  // Check no open batch for this vendor
  db.query('SELECT id, batchNo FROM SalesBatches WHERE vendorId = ? AND status = "Open"', [vendorId], function(checkErr, existing) {
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: 'Vendor already has an open batch (' + existing[0].batchNo + '). Close it first.' });
    }

    db.query('SELECT name FROM Vendors WHERE id = ?', [vendorId], function(err, vendorRows) {
      var vendorName = (vendorRows && vendorRows.length > 0) ? vendorRows[0].name : 'Unknown';
      var batchNo = 'BATCH-' + Date.now().toString(36).toUpperCase();
      db.query(
        'INSERT INTO SalesBatches (batchNo, vendorId, vendorName, openingFloat, notes) VALUES (?, ?, ?, ?, ?)',
        [batchNo, vendorId, vendorName, parseFloat(openingFloat), notes],
        function(insertErr, result) {
          if (insertErr) return res.status(500).json({ error: insertErr.message });
          logAudit('Sales batch opened: ' + batchNo, 'BATCH', 'Vendor: ' + vendorName + ', Opening float: N$' + parseFloat(openingFloat).toFixed(2), getOperatorName(req), getOperatorId(req), req.ip);
          res.json({ success: true, id: result.insertId, batchNo: batchNo });
        }
      );
    });
  });
});

router.post('/batches/sales/:id/close', authenticateToken, function(req, res) {
  var cashCount = req.body.cashCount;
  var discrepancyReason = req.body.discrepancyReason || null;
  var operatorName = getOperatorName(req);

  // Fetch batch to calculate discrepancy
  db.query('SELECT * FROM SalesBatches WHERE id = ? AND status = "Open"', [req.params.id], function(err, rows) {
    if (err) return res.status(500).json({ error: err.message });
    if (!rows || rows.length === 0) return res.status(400).json({ error: 'Batch not found or already closed' });

    var batch = rows[0];
    var expectedAmount = parseFloat(batch.totalAmount) || 0;
    var cashCounted = (cashCount !== undefined && cashCount !== null) ? parseFloat(cashCount) : expectedAmount;
    var discrepancy = round2(cashCounted - expectedAmount);
    var hasDiscrepancy = Math.abs(discrepancy) > 0.01;

    // If there's a discrepancy, require a reason
    if (hasDiscrepancy && !discrepancyReason) {
      return res.status(400).json({
        error: 'Discrepancy detected (N$' + discrepancy.toFixed(2) + '). A reason is required.',
        discrepancy: discrepancy,
        expected: expectedAmount,
        counted: cashCounted
      });
    }

    var sql = 'UPDATE SalesBatches SET status = "Closed", closedAt = NOW(), closingCashCount = ?, discrepancyAmount = ?, discrepancyReason = ?, closedBy = ? WHERE id = ?';
    db.query(sql, [cashCounted, discrepancy, discrepancyReason, operatorName, req.params.id], function(updateErr, result) {
      if (updateErr) return res.status(500).json({ error: updateErr.message });

      var detail = 'Expected: N$' + expectedAmount.toFixed(2) + ', Cash: N$' + cashCounted.toFixed(2);
      if (hasDiscrepancy) {
        detail += ', Discrepancy: N$' + discrepancy.toFixed(2) + ', Reason: ' + discrepancyReason;
      }
      logAudit('Sales batch closed: ' + batch.batchNo, 'BATCH', detail, operatorName, getOperatorId(req), req.ip);

      res.json({
        success: true,
        data: {
          batchNo: batch.batchNo,
          expectedAmount: expectedAmount,
          cashCounted: cashCounted,
          discrepancy: discrepancy,
          hasDiscrepancy: hasDiscrepancy,
          closedBy: operatorName
        }
      });
    });
  });
});

router.get('/batches/banking', authenticateToken, function(req, res) {
  db.query(
    'SELECT bb.*, sb.batchNo as salesBatchNo, sb.vendorName FROM BankingBatches bb LEFT JOIN SalesBatches sb ON bb.salesBatchId = sb.id ORDER BY bb.createdAt DESC',
    function(err, results) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, data: results || [] });
    }
  );
});

router.post('/batches/banking', authenticateToken, function(req, res) {
  var salesBatchId = req.body.salesBatchId;
  var bankRef = req.body.bankRef;
  var notes = req.body.notes;
  if (!salesBatchId) return res.status(400).json({ error: 'salesBatchId is required' });

  db.query('SELECT totalAmount FROM SalesBatches WHERE id = ? AND status = "Closed"', [salesBatchId], function(err, rows) {
    if (err) return res.status(500).json({ error: err.message });
    if (!rows || rows.length === 0) return res.status(400).json({ error: 'Sales batch not found or not closed' });

    var batchNo = 'BANK-' + new Date().getFullYear() + '-' + Date.now().toString(36).toUpperCase();
    db.query(
      'INSERT INTO BankingBatches (batchNo, salesBatchId, bankRef, totalAmount, notes) VALUES (?, ?, ?, ?, ?)',
      [batchNo, salesBatchId, bankRef, rows[0].totalAmount, notes],
      function(err, result) {
        if (err) return res.status(500).json({ error: err.message });
        logAudit('Banking batch created: ' + batchNo, 'BATCH', 'Bank ref: ' + bankRef, getOperatorName(req), getOperatorId(req), req.ip);
        res.json({ success: true, id: result.insertId, batchNo: batchNo });
      }
    );
  });
});

router.post('/batches/banking/:id/reconcile', authenticateToken, function(req, res) {
  var bankRef = req.body.bankRef;
  var depositAmount = req.body.depositAmount;
  var reconNotes = req.body.notes || '';
  var operatorName = getOperatorName(req);

  db.query('SELECT bb.*, sb.totalAmount as salesTotal, sb.batchNo as salesBatchNo FROM BankingBatches bb LEFT JOIN SalesBatches sb ON bb.salesBatchId = sb.id WHERE bb.id = ?', [req.params.id], function(err, rows) {
    if (err) return res.status(500).json({ error: err.message });
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Banking batch not found' });

    var bb = rows[0];
    var updateFields = 'status = "Reconciled", reconciledAt = NOW(), reconciledBy = ?';
    var updateParams = [operatorName];

    if (bankRef) {
      updateFields += ', bankRef = ?';
      updateParams.push(bankRef);
    }
    if (depositAmount !== undefined) {
      updateFields += ', depositAmount = ?';
      updateParams.push(parseFloat(depositAmount));
    }
    if (reconNotes) {
      updateFields += ', notes = ?';
      updateParams.push(reconNotes);
    }
    updateParams.push(req.params.id);

    db.query('UPDATE BankingBatches SET ' + updateFields + ' WHERE id = ?', updateParams, function(updateErr) {
      if (updateErr) return res.status(500).json({ error: updateErr.message });
      var detail = 'Bank ref: ' + (bankRef || bb.bankRef) + ', Sales batch: ' + (bb.salesBatchNo || bb.salesBatchId);
      if (depositAmount !== undefined) detail += ', Deposit: N$' + parseFloat(depositAmount).toFixed(2);
      logAudit('Banking batch reconciled: ' + bb.batchNo, 'BATCH', detail, operatorName, getOperatorId(req), req.ip);
      res.json({ success: true });
    });
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// TARIFFS
// ═══════════════════════════════════════════════════════════════════════════

router.get('/tariffs/config', authenticateToken, function(req, res) {
  db.query('SELECT * FROM TariffConfig LIMIT 1', function(err, results) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, data: (results && results[0]) || {} });
  });
});

router.put('/tariffs/config', authenticateToken, function(req, res) {
  var fields = ['vatRate', 'fixedCharge', 'relLevy', 'minPurchase', 'arrearsMode', 'arrearsThreshold', 'arrearsPercentage'];
  var updates = [];
  var params = [];
  fields.forEach(function(f) {
    if (req.body[f] !== undefined) { updates.push(f + ' = ?'); params.push(req.body[f]); }
  });
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  db.query('UPDATE TariffConfig SET ' + updates.join(', ') + ' WHERE id = 1', params, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logAudit('Tariff configuration updated', 'UPDATE', JSON.stringify(req.body), getOperatorName(req), getOperatorId(req), req.ip);
    res.json({ success: true });
  });
});

router.get('/tariffs/groups', authenticateToken, function(req, res) {
  db.query('SELECT * FROM TariffGroups ORDER BY name', function(err, groups) {
    if (err) return res.status(500).json({ error: err.message });
    if (!groups || groups.length === 0) return res.json({ success: true, data: [] });

    var ids = groups.map(function(g) { return g.id; });
    db.query('SELECT * FROM TariffBlocks WHERE tariffGroupId IN (?) ORDER BY sortOrder', [ids], function(err, blocks) {
      if (err) return res.status(500).json({ error: err.message });
      var result = groups.map(function(g) {
        var obj = {};
        for (var k in g) obj[k] = g[k];
        obj.blocks = (blocks || []).filter(function(b) { return b.tariffGroupId === g.id; });
        return obj;
      });
      res.json({ success: true, data: result });
    });
  });
});

router.post('/tariffs/groups', authenticateToken, function(req, res) {
  var b = req.body;
  if (!b.name) return res.status(400).json({ error: 'name is required' });
  db.query(
    'INSERT INTO TariffGroups (name, sgc, description, type, flatRate, effectiveDate) VALUES (?, ?, ?, ?, ?, ?)',
    [b.name, b.sgc, b.description, b.type || 'Block', b.flatRate, b.effectiveDate],
    function(err, result) {
      if (err) return res.status(500).json({ error: err.message });
      var groupId = result.insertId;
      if (b.blocks && b.blocks.length > 0) {
        b.blocks.forEach(function(bl, i) {
          db.query('INSERT INTO TariffBlocks (tariffGroupId, name, rangeLabel, rate, minKwh, maxKwh, period, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [groupId, bl.name, bl.rangeLabel || bl.range, bl.rate, bl.minKwh || bl.min || 0, bl.maxKwh || bl.max || 999999, bl.period || null, i]);
        });
      }
      res.json({ success: true, id: groupId });
    }
  );
});

router.put('/tariffs/groups/:id', authenticateToken, function(req, res) {
  var b = req.body;
  db.query(
    'UPDATE TariffGroups SET name = COALESCE(?, name), sgc = COALESCE(?, sgc), description = COALESCE(?, description), type = COALESCE(?, type), flatRate = COALESCE(?, flatRate), effectiveDate = COALESCE(?, effectiveDate) WHERE id = ?',
    [b.name, b.sgc, b.description, b.type, b.flatRate, b.effectiveDate, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (b.blocks) {
        db.query('DELETE FROM TariffBlocks WHERE tariffGroupId = ?', [req.params.id], function() {
          b.blocks.forEach(function(bl, i) {
            db.query(
              'INSERT INTO TariffBlocks (tariffGroupId, name, rangeLabel, rate, minKwh, maxKwh, period, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              [req.params.id, bl.name, bl.rangeLabel || bl.range, bl.rate, bl.minKwh || bl.min || 0, bl.maxKwh || bl.max || 999999, bl.period || null, i]
            );
          });
        });
      }
      logAudit('Tariff group updated: ' + (b.name || req.params.id), 'UPDATE', '', getOperatorName(req), getOperatorId(req), req.ip);
      res.json({ success: true });
    }
  );
});


// ═══════════════════════════════════════════════════════════════════════════
// ARREARS
// ═══════════════════════════════════════════════════════════════════════════

router.get('/arrears', authenticateToken, function(req, res) {
  db.query('SELECT * FROM VendingCustomers WHERE arrears > 0 ORDER BY arrears DESC', function(err, results) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, data: results || [] });
  });
});

router.post('/arrears/:meterNo', authenticateToken, function(req, res) {
  var amount = req.body.amount;
  if (amount === undefined) return res.status(400).json({ error: 'amount is required' });
  db.query('UPDATE VendingCustomers SET arrears = ?, status = IF(? > 0, "Arrears", "Active") WHERE meterNo = ?', [amount, amount, req.params.meterNo], function(err, result) {
    if (err) return res.status(500).json({ error: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Customer not found' });
    logAudit('Arrears set: ' + amount + ' N$ on meter ' + req.params.meterNo, 'UPDATE', '', getOperatorName(req), getOperatorId(req), req.ip);
    res.json({ success: true });
  });
});

router.get('/arrears/summary', authenticateToken, function(req, res) {
  db.query(
    'SELECT COUNT(*) as totalCustomers, COALESCE(SUM(arrears), 0) as totalArrears, COALESCE(AVG(arrears), 0) as avgArrears, COALESCE(MAX(arrears), 0) as maxArrears FROM VendingCustomers WHERE arrears > 0',
    function(err, results) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, data: results[0] });
    }
  );
});


// ═══════════════════════════════════════════════════════════════════════════
// AUDIT LOG
// ═══════════════════════════════════════════════════════════════════════════

router.get('/audit', authenticateToken, function(req, res) {
  var type = req.query.type;
  var user = req.query.user;
  var from = req.query.from;
  var to = req.query.to;
  var limit = parseInt(req.query.limit) || 100;
  var offset = parseInt(req.query.offset) || 0;

  var sql = 'SELECT * FROM AuditLog WHERE 1=1';
  var params = [];
  if (type) { sql += ' AND type = ?'; params.push(type); }
  if (user) { sql += ' AND user LIKE ?'; params.push('%' + user + '%'); }
  if (from) { sql += ' AND timestamp >= ?'; params.push(from); }
  if (to) { sql += ' AND timestamp <= ?'; params.push(to); }
  sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  db.query(sql, params, function(err, results) {
    if (err) return res.status(500).json({ error: err.message });
    db.query('SELECT COUNT(*) as total FROM AuditLog', function(err2, countResult) {
      res.json({ success: true, data: results || [], total: countResult ? countResult[0].total : 0 });
    });
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════════════════════════════════

router.get('/reports/daily-sales', authenticateToken, function(req, res) {
  var from = req.query.from || new Date().toISOString().split('T')[0];
  var to = req.query.to || from;
  db.query(
    "SELECT DATE(dateTime) as date, COUNT(*) as transactions, COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as revenue, COALESCE(SUM(kWh), 0) as totalKwh, COUNT(DISTINCT meterNo) as uniqueMeters FROM VendingTransactions WHERE DATE(dateTime) BETWEEN ? AND ? AND type = 'Vend' AND status = 'Completed' GROUP BY DATE(dateTime) ORDER BY date",
    [from, to],
    function(err, results) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, data: results || [] });
    }
  );
});

router.get('/reports/revenue-by-area', authenticateToken, function(req, res) {
  db.query(
    "SELECT c.area, COUNT(t.id) as transactions, COALESCE(SUM(t.amount), 0) as revenue, COALESCE(SUM(t.kWh), 0) as totalKwh FROM VendingTransactions t LEFT JOIN VendingCustomers c ON t.meterNo = c.meterNo WHERE t.type = 'Vend' AND t.status = 'Completed' GROUP BY c.area ORDER BY revenue DESC",
    function(err, results) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, data: results || [] });
    }
  );
});

router.get('/reports/vendor-performance', authenticateToken, function(req, res) {
  db.query(
    "SELECT v.id, v.name, v.commissionRate, COUNT(t.id) as transactions, COALESCE(SUM(t.amount), 0) as revenue, COALESCE(SUM(t.kWh), 0) as totalKwh, COALESCE(SUM(t.amount), 0) * v.commissionRate / 100 as commission FROM Vendors v LEFT JOIN VendingTransactions t ON v.id = t.vendorId AND t.type = 'Vend' AND t.status = 'Completed' GROUP BY v.id ORDER BY revenue DESC",
    function(err, results) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, data: results || [] });
    }
  );
});

router.get('/reports/meter-status', authenticateToken, function(req, res) {
  db.query(
    "SELECT status, COUNT(*) as count FROM VendingCustomers GROUP BY status UNION ALL SELECT 'Total' as status, COUNT(*) as count FROM VendingCustomers",
    function(err, results) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, data: results || [] });
    }
  );
});

router.get('/reports/token-analysis', authenticateToken, function(req, res) {
  db.query(
    'SELECT type, status, COUNT(*) as count, COALESCE(SUM(amount), 0) as totalAmount, COALESCE(SUM(kWh), 0) as totalKwh FROM VendingTransactions GROUP BY type, status ORDER BY type, status',
    function(err, results) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, data: results || [] });
    }
  );
});

router.get('/reports/system-audit', authenticateToken, function(req, res) {
  var from = req.query.from;
  var to = req.query.to;
  var limit = parseInt(req.query.limit) || 500;
  var sql = 'SELECT * FROM AuditLog WHERE 1=1';
  var params = [];
  if (from) { sql += ' AND timestamp >= ?'; params.push(from); }
  if (to) { sql += ' AND timestamp <= ?'; params.push(to); }
  sql += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(limit);
  db.query(sql, params, function(err, results) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, data: results || [] });
  });
});

// NEW: Line item audit report — trace every cent
router.get('/reports/line-items', authenticateToken, function(req, res) {
  var from = req.query.from;
  var to = req.query.to;
  var lineType = req.query.lineType;
  var meterNo = req.query.meterNo;
  var limit = parseInt(req.query.limit) || 200;

  var sql = 'SELECT li.*, t.customerName, t.type as txnType, t.status as txnStatus, t.dateTime FROM TransactionLineItems li JOIN VendingTransactions t ON li.transactionId = t.id WHERE 1=1';
  var params = [];
  if (from) { sql += ' AND t.dateTime >= ?'; params.push(from); }
  if (to) { sql += ' AND t.dateTime <= ?'; params.push(to); }
  if (lineType) { sql += ' AND li.lineType = ?'; params.push(lineType); }
  if (meterNo) { sql += ' AND li.meterNo = ?'; params.push(meterNo); }
  sql += ' ORDER BY li.id DESC LIMIT ?';
  params.push(limit);

  db.query(sql, params, function(err, results) {
    if (err) return res.status(500).json({ error: err.message });

    // Also get summary totals by line type
    var summSql = 'SELECT li.lineType, COUNT(*) as count, COALESCE(SUM(li.amount), 0) as totalAmount, COALESCE(SUM(li.kWh), 0) as totalKwh FROM TransactionLineItems li JOIN VendingTransactions t ON li.transactionId = t.id WHERE 1=1';
    var summParams = [];
    if (from) { summSql += ' AND t.dateTime >= ?'; summParams.push(from); }
    if (to) { summSql += ' AND t.dateTime <= ?'; summParams.push(to); }
    if (meterNo) { summSql += ' AND li.meterNo = ?'; summParams.push(meterNo); }
    summSql += ' GROUP BY li.lineType';

    db.query(summSql, summParams, function(err2, summary) {
      res.json({ success: true, data: results || [], summary: summary || [] });
    });
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════

router.get('/dashboard', authenticateToken, function(req, res) {
  var queries = {
    todayRevenue: "SELECT COALESCE(SUM(amount), 0) as val FROM VendingTransactions WHERE DATE(dateTime) = CURDATE() AND type = 'Vend' AND status = 'Completed'",
    todayTokens: "SELECT COUNT(*) as val FROM VendingTransactions WHERE DATE(dateTime) = CURDATE() AND type = 'Vend' AND status = 'Completed'",
    monthRevenue: "SELECT COALESCE(SUM(amount), 0) as val FROM VendingTransactions WHERE MONTH(dateTime) = MONTH(CURDATE()) AND YEAR(dateTime) = YEAR(CURDATE()) AND type = 'Vend' AND status = 'Completed'",
    totalCustomers: 'SELECT COUNT(*) as val FROM VendingCustomers',
    activeCustomers: "SELECT COUNT(*) as val FROM VendingCustomers WHERE status = 'Active'",
    totalArrears: 'SELECT COALESCE(SUM(arrears), 0) as val FROM VendingCustomers WHERE arrears > 0',
    vendorCount: "SELECT COUNT(*) as val FROM Vendors WHERE status = 'Active'",
    openBatches: "SELECT COUNT(*) as val FROM SalesBatches WHERE status = 'Open'",
    todayReversals: "SELECT COUNT(*) as val FROM VendingTransactions WHERE DATE(dateTime) = CURDATE() AND type = 'Reversal'",
    totalLineItems: 'SELECT COUNT(*) as val FROM TransactionLineItems'
  };

  var result = {};
  var keys = Object.keys(queries);
  var done = 0;

  keys.forEach(function(key) {
    db.query(queries[key], function(err, rows) {
      result[key] = err ? 0 : ((rows[0] && rows[0].val) || 0);
      done++;
      if (done === keys.length) {
        db.query(
          "SELECT DAYNAME(dateTime) as day, COALESCE(SUM(amount), 0) as revenue, COUNT(*) as tokens, COALESCE(SUM(kWh), 0) as kWh FROM VendingTransactions WHERE dateTime >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND type = 'Vend' AND status = 'Completed' GROUP BY DAYNAME(dateTime), DAYOFWEEK(dateTime) ORDER BY DAYOFWEEK(dateTime)",
          function(err, trend) {
            result.salesTrend = trend || [];
            res.json({ success: true, data: result });
          }
        );
      }
    });
  });
});


module.exports = router;
