/**
 * GRIDx Third-Party Integration API Gateway
 * NamPower Tender Compliance — External Vendor API
 *
 * This module provides:
 * 1. Partner (API Client) management — onboarding, API key generation, sandbox/production
 * 2. REST API for external vending — token purchase, balance inquiry, transaction status
 * 3. ISO 8583 message format support — financial system integration
 * 4. Webhook management — event notifications to partners
 * 5. Rate limiting per partner — abuse prevention
 * 6. Full audit trail — every API call logged
 */
var express = require('express');
var router = express.Router();
var crypto = require('crypto');
var db = require('../config/db');
var authMw = require('../admin/authMiddllware');
var authenticateToken = authMw.authenticateToken;

// ─── AUTO-MIGRATE: Integration tables ──────────────────────────────────────

var INTEGRATION_TABLES = [
  // API Partners (external vendors connecting to GRIDx)
  "CREATE TABLE IF NOT EXISTS ApiPartners (" +
  "  id INT AUTO_INCREMENT PRIMARY KEY," +
  "  partnerId VARCHAR(50) NOT NULL UNIQUE," +
  "  name VARCHAR(150) NOT NULL," +
  "  type ENUM('Bank','MobileMoneyProvider','RetailPOS','ATMNetwork','OnlinePortal','Government','Other') DEFAULT 'Other'," +
  "  contactName VARCHAR(100)," +
  "  contactEmail VARCHAR(150)," +
  "  contactPhone VARCHAR(30)," +
  "  apiKey VARCHAR(64) NOT NULL UNIQUE," +
  "  apiSecret VARCHAR(128) NOT NULL," +
  "  environment ENUM('Sandbox','Production') DEFAULT 'Sandbox'," +
  "  status ENUM('Pending','Active','Suspended','Revoked') DEFAULT 'Pending'," +
  "  permissions VARCHAR(500) DEFAULT 'vend,balance,status'," +
  "  rateLimitPerMinute INT DEFAULT 60," +
  "  rateLimitPerDay INT DEFAULT 10000," +
  "  ipWhitelist VARCHAR(500)," +
  "  webhookUrl VARCHAR(500)," +
  "  webhookSecret VARCHAR(128)," +
  "  webhookEvents VARCHAR(500) DEFAULT 'transaction.completed,transaction.reversed'," +
  "  totalTransactions INT DEFAULT 0," +
  "  totalRevenue DECIMAL(14,2) DEFAULT 0," +
  "  lastActivityAt DATETIME," +
  "  sandboxApprovedAt DATETIME," +
  "  productionApprovedAt DATETIME," +
  "  approvedBy VARCHAR(100)," +
  "  notes TEXT," +
  "  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP," +
  "  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
  "  INDEX idx_apiKey (apiKey)," +
  "  INDEX idx_status (status)," +
  "  INDEX idx_type (type)" +
  ")",

  // API Request Log (audit trail for every external API call)
  "CREATE TABLE IF NOT EXISTS ApiRequestLog (" +
  "  id INT AUTO_INCREMENT PRIMARY KEY," +
  "  partnerId VARCHAR(50) NOT NULL," +
  "  partnerName VARCHAR(150)," +
  "  endpoint VARCHAR(200) NOT NULL," +
  "  method VARCHAR(10) NOT NULL," +
  "  requestBody TEXT," +
  "  responseStatus INT," +
  "  responseBody TEXT," +
  "  ipAddress VARCHAR(45)," +
  "  environment ENUM('Sandbox','Production') DEFAULT 'Production'," +
  "  processingTimeMs INT," +
  "  errorMessage VARCHAR(500)," +
  "  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP," +
  "  INDEX idx_partnerId (partnerId)," +
  "  INDEX idx_endpoint (endpoint)," +
  "  INDEX idx_created (created_at)" +
  ")",

  // Webhook Delivery Log
  "CREATE TABLE IF NOT EXISTS WebhookDeliveryLog (" +
  "  id INT AUTO_INCREMENT PRIMARY KEY," +
  "  partnerId VARCHAR(50) NOT NULL," +
  "  event VARCHAR(100) NOT NULL," +
  "  webhookUrl VARCHAR(500) NOT NULL," +
  "  payload TEXT," +
  "  responseStatus INT," +
  "  responseBody TEXT," +
  "  attempts INT DEFAULT 1," +
  "  deliveredAt DATETIME," +
  "  status ENUM('Pending','Delivered','Failed','Retrying') DEFAULT 'Pending'," +
  "  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP," +
  "  INDEX idx_partnerId (partnerId)," +
  "  INDEX idx_event (event)" +
  ")",

  // Rate Limit Tracking
  "CREATE TABLE IF NOT EXISTS ApiRateLimits (" +
  "  id INT AUTO_INCREMENT PRIMARY KEY," +
  "  partnerId VARCHAR(50) NOT NULL," +
  "  windowStart DATETIME NOT NULL," +
  "  requestCount INT DEFAULT 1," +
  "  UNIQUE KEY uk_partner_window (partnerId, windowStart)" +
  ")"
];

var migrated = 0;
INTEGRATION_TABLES.forEach(function(sql) {
  db.query(sql, function(err) {
    if (err) console.log('[Integration] Migration error:', err.message);
    migrated++;
    if (migrated === INTEGRATION_TABLES.length) {
      console.log('[Integration] All API gateway tables migrated successfully');
      // Add channel column to VendingTransactions if not exists
      db.query("SHOW COLUMNS FROM VendingTransactions LIKE 'channel'", function(err, rows) {
        if (!err && (!rows || rows.length === 0)) {
          db.query("ALTER TABLE VendingTransactions ADD COLUMN channel VARCHAR(20) DEFAULT 'POS'", function(alterErr) {
            if (!alterErr) console.log('[Integration] Added VendingTransactions.channel column');
          });
        }
      });
    }
  });
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateApiKey() {
  return 'gx_' + crypto.randomBytes(24).toString('hex');
}

function generateApiSecret() {
  return crypto.randomBytes(48).toString('hex');
}

function generatePartnerId(name) {
  var prefix = name.replace(/[^A-Za-z]/g, '').substring(0, 4).toUpperCase();
  var rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return 'PTR-' + prefix + '-' + rand;
}

function generateWebhookSecret() {
  return 'whsec_' + crypto.randomBytes(32).toString('hex');
}

function logApiRequest(partnerId, partnerName, endpoint, method, reqBody, resStatus, resBody, ip, env, timeMs, errorMsg) {
  db.query(
    'INSERT INTO ApiRequestLog (partnerId, partnerName, endpoint, method, requestBody, responseStatus, responseBody, ipAddress, environment, processingTimeMs, errorMessage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [partnerId, partnerName, endpoint, method,
     typeof reqBody === 'object' ? JSON.stringify(reqBody) : reqBody,
     resStatus,
     typeof resBody === 'object' ? JSON.stringify(resBody) : resBody,
     ip, env, timeMs, errorMsg]
  );
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

function round2(n) {
  return Math.round(parseFloat(n) * 100) / 100;
}


// ═══════════════════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS — Partner Management (requires admin auth)
// ═══════════════════════════════════════════════════════════════════════════

// GET /partners — List all API partners
router.get('/partners', authenticateToken, function(req, res) {
  var sql = 'SELECT id, partnerId, name, type, contactName, contactEmail, contactPhone, ' +
    'apiKey, environment, status, permissions, rateLimitPerMinute, rateLimitPerDay, ' +
    'ipWhitelist, webhookUrl, webhookEvents, totalTransactions, totalRevenue, ' +
    'lastActivityAt, sandboxApprovedAt, productionApprovedAt, approvedBy, notes, created_at ' +
    'FROM ApiPartners ORDER BY created_at DESC';
  db.query(sql, function(err, results) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, data: results || [] });
  });
});

// GET /partners/:id — Single partner detail
router.get('/partners/:id', authenticateToken, function(req, res) {
  db.query('SELECT * FROM ApiPartners WHERE id = ?', [req.params.id], function(err, rows) {
    if (err) return res.status(500).json({ error: err.message });
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Partner not found' });
    res.json({ success: true, data: rows[0] });
  });
});

// POST /partners — Register new API partner
router.post('/partners', authenticateToken, function(req, res) {
  var name = req.body.name;
  var type = req.body.type || 'Other';
  var contactName = req.body.contactName || '';
  var contactEmail = req.body.contactEmail || '';
  var contactPhone = req.body.contactPhone || '';
  var permissions = req.body.permissions || 'vend,balance,status';
  var rateLimitPerMinute = req.body.rateLimitPerMinute || 60;
  var rateLimitPerDay = req.body.rateLimitPerDay || 10000;
  var ipWhitelist = req.body.ipWhitelist || '';
  var webhookUrl = req.body.webhookUrl || '';
  var notes = req.body.notes || '';

  if (!name) return res.status(400).json({ error: 'Partner name is required' });

  var partnerId = generatePartnerId(name);
  var apiKey = generateApiKey();
  var apiSecret = generateApiSecret();
  var webhookSecret = webhookUrl ? generateWebhookSecret() : null;

  var sql = 'INSERT INTO ApiPartners (partnerId, name, type, contactName, contactEmail, contactPhone, ' +
    'apiKey, apiSecret, permissions, rateLimitPerMinute, rateLimitPerDay, ipWhitelist, ' +
    'webhookUrl, webhookSecret, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

  db.query(sql, [partnerId, name, type, contactName, contactEmail, contactPhone,
    apiKey, apiSecret, permissions, rateLimitPerMinute, rateLimitPerDay,
    ipWhitelist, webhookUrl, webhookSecret, notes],
    function(err, result) {
      if (err) return res.status(500).json({ error: err.message });

      logAudit('API partner registered: ' + name, 'INTEGRATION',
        'Partner ID: ' + partnerId + ', Type: ' + type + ', Environment: Sandbox',
        getOperatorName(req), null, req.ip);

      res.json({
        success: true,
        data: {
          id: result.insertId,
          partnerId: partnerId,
          name: name,
          type: type,
          apiKey: apiKey,
          apiSecret: apiSecret,
          webhookSecret: webhookSecret,
          environment: 'Sandbox',
          status: 'Pending',
        }
      });
    }
  );
});

// PUT /partners/:id — Update partner
router.put('/partners/:id', authenticateToken, function(req, res) {
  var fields = [];
  var params = [];
  var allowed = ['name', 'type', 'contactName', 'contactEmail', 'contactPhone',
    'permissions', 'rateLimitPerMinute', 'rateLimitPerDay', 'ipWhitelist',
    'webhookUrl', 'webhookEvents', 'notes'];

  allowed.forEach(function(f) {
    if (req.body[f] !== undefined) {
      fields.push(f + ' = ?');
      params.push(req.body[f]);
    }
  });

  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
  params.push(req.params.id);

  db.query('UPDATE ApiPartners SET ' + fields.join(', ') + ' WHERE id = ?', params, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logAudit('API partner updated', 'INTEGRATION', 'Partner ID: ' + req.params.id, getOperatorName(req), null, req.ip);
    res.json({ success: true });
  });
});

// POST /partners/:id/approve — Move partner from Pending→Active or Sandbox→Production
router.post('/partners/:id/approve', authenticateToken, function(req, res) {
  var targetEnv = req.body.environment || 'Sandbox';
  var operatorName = getOperatorName(req);

  db.query('SELECT * FROM ApiPartners WHERE id = ?', [req.params.id], function(err, rows) {
    if (err) return res.status(500).json({ error: err.message });
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Partner not found' });

    var partner = rows[0];
    var updateSql, updateParams;

    if (targetEnv === 'Production') {
      updateSql = 'UPDATE ApiPartners SET status = "Active", environment = "Production", productionApprovedAt = NOW(), approvedBy = ? WHERE id = ?';
      updateParams = [operatorName, req.params.id];
    } else {
      updateSql = 'UPDATE ApiPartners SET status = "Active", environment = "Sandbox", sandboxApprovedAt = NOW(), approvedBy = ? WHERE id = ?';
      updateParams = [operatorName, req.params.id];
    }

    db.query(updateSql, updateParams, function(updateErr) {
      if (updateErr) return res.status(500).json({ error: updateErr.message });
      logAudit('API partner approved for ' + targetEnv + ': ' + partner.name, 'INTEGRATION',
        'Partner: ' + partner.partnerId + ', Approved by: ' + operatorName, operatorName, null, req.ip);
      res.json({ success: true, environment: targetEnv });
    });
  });
});

// POST /partners/:id/suspend — Suspend a partner
router.post('/partners/:id/suspend', authenticateToken, function(req, res) {
  var reason = req.body.reason || '';
  db.query('UPDATE ApiPartners SET status = "Suspended" WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logAudit('API partner suspended', 'INTEGRATION', 'ID: ' + req.params.id + ', Reason: ' + reason, getOperatorName(req), null, req.ip);
    res.json({ success: true });
  });
});

// POST /partners/:id/revoke — Revoke partner credentials
router.post('/partners/:id/revoke', authenticateToken, function(req, res) {
  db.query('UPDATE ApiPartners SET status = "Revoked" WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logAudit('API partner revoked', 'INTEGRATION', 'ID: ' + req.params.id, getOperatorName(req), null, req.ip);
    res.json({ success: true });
  });
});

// POST /partners/:id/regenerate-keys — Generate new API keys
router.post('/partners/:id/regenerate-keys', authenticateToken, function(req, res) {
  var newKey = generateApiKey();
  var newSecret = generateApiSecret();

  db.query('UPDATE ApiPartners SET apiKey = ?, apiSecret = ? WHERE id = ?',
    [newKey, newSecret, req.params.id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAudit('API keys regenerated', 'INTEGRATION', 'ID: ' + req.params.id, getOperatorName(req), null, req.ip);
      res.json({ success: true, apiKey: newKey, apiSecret: newSecret });
    }
  );
});


// ═══════════════════════════════════════════════════════════════════════════
// API REQUEST LOG & ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

// GET /api-log — API request history
router.get('/api-log', authenticateToken, function(req, res) {
  var partnerId = req.query.partnerId;
  var limit = parseInt(req.query.limit) || 100;
  var sql = 'SELECT * FROM ApiRequestLog';
  var params = [];

  if (partnerId) {
    sql += ' WHERE partnerId = ?';
    params.push(partnerId);
  }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  db.query(sql, params, function(err, results) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, data: results || [] });
  });
});

// GET /api-stats — Aggregated API usage stats
router.get('/api-stats', authenticateToken, function(req, res) {
  var queries = {
    totalPartners: 'SELECT COUNT(*) as count FROM ApiPartners',
    activePartners: 'SELECT COUNT(*) as count FROM ApiPartners WHERE status = "Active"',
    todayRequests: 'SELECT COUNT(*) as count FROM ApiRequestLog WHERE DATE(created_at) = CURDATE()',
    todayErrors: 'SELECT COUNT(*) as count FROM ApiRequestLog WHERE DATE(created_at) = CURDATE() AND responseStatus >= 400',
    partnersByType: 'SELECT type, COUNT(*) as count FROM ApiPartners GROUP BY type',
    recentActivity: 'SELECT partnerId, partnerName, endpoint, responseStatus, processingTimeMs, created_at FROM ApiRequestLog ORDER BY created_at DESC LIMIT 10',
  };

  var results = {};
  var done = 0;
  var keys = Object.keys(queries);

  keys.forEach(function(key) {
    db.query(queries[key], function(err, rows) {
      if (err) {
        results[key] = null;
      } else if (key === 'partnersByType' || key === 'recentActivity') {
        results[key] = rows || [];
      } else {
        results[key] = rows && rows[0] ? rows[0].count : 0;
      }
      done++;
      if (done === keys.length) {
        res.json({ success: true, data: results });
      }
    });
  });
});

// GET /webhook-log — Webhook delivery history
router.get('/webhook-log', authenticateToken, function(req, res) {
  var limit = parseInt(req.query.limit) || 50;
  db.query('SELECT * FROM WebhookDeliveryLog ORDER BY created_at DESC LIMIT ?', [limit], function(err, results) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, data: results || [] });
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// EXTERNAL API — Partner-facing endpoints (authenticated via API key)
// ═══════════════════════════════════════════════════════════════════════════

// Middleware: Authenticate partner via API key
function authenticatePartner(req, res, next) {
  var startTime = Date.now();
  req._apiStartTime = startTime;

  // Accept API key via header or query param
  var apiKey = req.headers['x-api-key'] || req.query.api_key;
  if (!apiKey) {
    return res.status(401).json({
      error: 'Missing API key. Include X-Api-Key header or api_key query parameter.',
      code: 'AUTH_MISSING_KEY'
    });
  }

  db.query('SELECT * FROM ApiPartners WHERE apiKey = ?', [apiKey], function(err, rows) {
    if (err) return res.status(500).json({ error: 'Internal error', code: 'INTERNAL_ERROR' });
    if (!rows || rows.length === 0) {
      return res.status(401).json({ error: 'Invalid API key', code: 'AUTH_INVALID_KEY' });
    }

    var partner = rows[0];

    // Check status
    if (partner.status !== 'Active') {
      return res.status(403).json({
        error: 'Partner account is ' + partner.status + '. Contact support.',
        code: 'PARTNER_' + partner.status.toUpperCase()
      });
    }

    // IP whitelist check (if configured)
    if (partner.ipWhitelist && partner.ipWhitelist.trim()) {
      var allowed = partner.ipWhitelist.split(',').map(function(ip) { return ip.trim(); });
      var clientIp = req.ip || req.connection.remoteAddress || '';
      if (allowed.indexOf(clientIp) === -1 && allowed.indexOf('*') === -1) {
        return res.status(403).json({ error: 'IP not whitelisted', code: 'IP_NOT_ALLOWED' });
      }
    }

    req.partner = partner;
    next();
  });
}

// Rate limit check (per-minute window)
function checkRateLimit(req, res, next) {
  var partner = req.partner;
  var windowStart = new Date();
  windowStart.setSeconds(0, 0);
  var windowStr = windowStart.toISOString().substring(0, 19).replace('T', ' ');

  db.query(
    'INSERT INTO ApiRateLimits (partnerId, windowStart, requestCount) VALUES (?, ?, 1) ' +
    'ON DUPLICATE KEY UPDATE requestCount = requestCount + 1',
    [partner.partnerId, windowStr],
    function(err) {
      if (err) return next(); // Allow on error

      db.query('SELECT requestCount FROM ApiRateLimits WHERE partnerId = ? AND windowStart = ?',
        [partner.partnerId, windowStr], function(err2, rows) {
          if (err2) return next();
          var count = (rows && rows[0]) ? rows[0].requestCount : 0;
          if (count > partner.rateLimitPerMinute) {
            return res.status(429).json({
              error: 'Rate limit exceeded. Max ' + partner.rateLimitPerMinute + ' requests per minute.',
              code: 'RATE_LIMIT_EXCEEDED',
              retryAfter: 60
            });
          }
          // Set rate limit headers
          res.set('X-RateLimit-Limit', String(partner.rateLimitPerMinute));
          res.set('X-RateLimit-Remaining', String(Math.max(0, partner.rateLimitPerMinute - count)));
          next();
        }
      );
    }
  );
}

// Log API request after response
function logApiResponse(req, res, statusCode, body) {
  var elapsed = Date.now() - (req._apiStartTime || Date.now());
  var partner = req.partner || {};
  logApiRequest(
    partner.partnerId || 'unknown',
    partner.name || 'unknown',
    req.originalUrl || req.url,
    req.method,
    req.body,
    statusCode,
    body,
    req.ip,
    partner.environment || 'Production',
    elapsed,
    statusCode >= 400 ? (body && body.error) || '' : null
  );

  // Update partner stats
  if (partner.partnerId && statusCode < 400) {
    db.query('UPDATE ApiPartners SET lastActivityAt = NOW(), totalTransactions = totalTransactions + 1 WHERE partnerId = ?', [partner.partnerId]);
  }
}


// ──── REST API: Purchase Electricity Token ────────────────────────────────

router.post('/external/vend', authenticatePartner, checkRateLimit, function(req, res) {
  var meterNo = req.body.meterNo || req.body.meter_number;
  var amount = parseFloat(req.body.amount);
  var idempotencyKey = req.body.idempotencyKey || req.body.reference_id;
  var partner = req.partner;

  // Validate permissions
  if ((partner.permissions || '').indexOf('vend') === -1) {
    var errResp = { error: 'Partner does not have vend permission', code: 'PERMISSION_DENIED' };
    logApiResponse(req, res, 403, errResp);
    return res.status(403).json(errResp);
  }

  if (!meterNo || !amount || amount <= 0) {
    var errResp2 = { error: 'meterNo and positive amount are required', code: 'INVALID_REQUEST' };
    logApiResponse(req, res, 400, errResp2);
    return res.status(400).json(errResp2);
  }

  // Sandbox mode — return simulated response
  if (partner.environment === 'Sandbox') {
    var sandboxToken = '';
    for (var i = 0; i < 20; i++) sandboxToken += Math.floor(Math.random() * 10);
    var sandboxResp = {
      success: true,
      sandbox: true,
      data: {
        transactionId: 'SBX-' + Date.now().toString(36).toUpperCase(),
        refNo: 'SBX-REF-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
        token: sandboxToken,
        meterNo: meterNo,
        amount: amount,
        kWh: round2(amount / 1.68),
        currency: 'NAD',
        timestamp: new Date().toISOString(),
        partner: partner.partnerId,
        environment: 'Sandbox',
        breakdown: {
          vat: round2(amount * 0.15 / 1.15),
          fixedCharge: 8.50,
          relLevy: 2.40,
          energyCost: round2(amount - (amount * 0.15 / 1.15) - 8.50 - 2.40)
        }
      }
    };
    logApiResponse(req, res, 200, sandboxResp);
    return res.json(sandboxResp);
  }

  // PRODUCTION — Use the real vend engine
  // Idempotency check
  if (idempotencyKey) {
    db.query('SELECT id, refNo, token, amount, kWh, status FROM VendingTransactions WHERE idempotencyKey = ?', [idempotencyKey], function(err, existing) {
      if (err) {
        var errResp3 = { error: 'Internal error', code: 'INTERNAL_ERROR' };
        logApiResponse(req, res, 500, errResp3);
        return res.status(500).json(errResp3);
      }
      if (existing && existing.length > 0) {
        var dupResp = {
          success: true,
          duplicate: true,
          message: 'Transaction already processed (idempotency key matched)',
          data: {
            transactionId: existing[0].id,
            refNo: existing[0].refNo,
            token: existing[0].token,
            meterNo: meterNo,
            amount: existing[0].amount,
            kWh: existing[0].kWh,
            status: existing[0].status,
            partner: partner.partnerId
          }
        };
        logApiResponse(req, res, 200, dupResp);
        return res.json(dupResp);
      }
      doExternalVend(meterNo, amount, partner, idempotencyKey, req, res);
    });
  } else {
    doExternalVend(meterNo, amount, partner, null, req, res);
  }
});

function doExternalVend(meterNo, totalAmount, partner, idempotencyKey, req, res) {
  // Get tariff config
  db.query('SELECT * FROM TariffConfig LIMIT 1', function(err, configRows) {
    if (err) {
      var errResp = { error: 'Internal error', code: 'INTERNAL_ERROR' };
      logApiResponse(req, res, 500, errResp);
      return res.status(500).json(errResp);
    }
    var config = (configRows && configRows[0]) || { vatRate: 15, fixedCharge: 8.50, relLevy: 2.40, arrearsPercentage: 25, arrearsMode: 'auto-deduct', minPurchase: 5 };

    if (totalAmount < parseFloat(config.minPurchase || 5)) {
      var errResp2 = { error: 'Amount below minimum purchase of N$' + (config.minPurchase || 5), code: 'BELOW_MINIMUM' };
      logApiResponse(req, res, 400, errResp2);
      return res.status(400).json(errResp2);
    }

    // Look up customer
    db.query('SELECT * FROM VendingCustomers WHERE meterNo = ?', [meterNo], function(custErr, custRows) {
      if (custErr || !custRows || custRows.length === 0) {
        var errResp3 = { error: 'Meter number not found: ' + meterNo, code: 'METER_NOT_FOUND' };
        logApiResponse(req, res, 404, errResp3);
        return res.status(404).json(errResp3);
      }

      var customer = custRows[0];
      if (customer.status === 'Suspended') {
        var errResp4 = { error: 'Customer account is suspended', code: 'ACCOUNT_SUSPENDED' };
        logApiResponse(req, res, 403, errResp4);
        return res.status(403).json(errResp4);
      }

      // Calculate charges (same logic as internal vend)
      var vatRate = parseFloat(config.vatRate) || 15;
      var fixedCharge = parseFloat(config.fixedCharge) || 8.50;
      var relLevy = parseFloat(config.relLevy) || 2.40;
      var vat = round2(totalAmount * vatRate / (100 + vatRate));
      var energyCost = round2(totalAmount - vat - fixedCharge - relLevy);
      var arrearsDeducted = 0;

      if (config.arrearsMode === 'auto-deduct' && customer.arrears > 0) {
        var arrearsMax = round2(totalAmount * parseFloat(config.arrearsPercentage || 25) / 100);
        arrearsDeducted = Math.min(arrearsMax, parseFloat(customer.arrears));
        energyCost = round2(energyCost - arrearsDeducted);
      }

      // Calculate kWh based on tariff group
      db.query('SELECT * FROM TariffGroups WHERE name = ?', [customer.tariffGroup || 'Residential'], function(tgErr, tgRows) {
        var rate = 1.68;
        if (!tgErr && tgRows && tgRows.length > 0 && tgRows[0].type === 'Flat' && tgRows[0].flatRate) {
          rate = parseFloat(tgRows[0].flatRate);
        }
        var kWh = round2(energyCost / rate);

        // Generate token and ref
        var token = '';
        for (var i = 0; i < 20; i++) token += Math.floor(Math.random() * 10);
        var ts = Date.now().toString(36).toUpperCase();
        var rand = Math.random().toString(36).substring(2, 6).toUpperCase();
        var refNo = 'TXN-' + ts + '-' + rand;

        // Insert transaction
        var txnSql = 'INSERT INTO VendingTransactions (refNo, idempotencyKey, meterNo, customerName, amount, vatAmount, fixedCharge, relLevy, arrearsDeducted, energyAmount, kWh, token, vendorName, operator, status, channel) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "Completed", "API")';
        var txnParams = [refNo, idempotencyKey, meterNo, customer.name,
          totalAmount, vat, fixedCharge, relLevy, arrearsDeducted, energyCost, kWh,
          token, partner.name, 'API:' + partner.name];

        db.query(txnSql, txnParams, function(txnErr, txnResult) {
          if (txnErr) {
            var errResp5 = { error: 'Transaction failed', code: 'TRANSACTION_FAILED' };
            logApiResponse(req, res, 500, errResp5);
            return res.status(500).json(errResp5);
          }

          var txnId = txnResult.insertId;

          // Insert line items
          var lineItems = [
            [txnId, refNo, 'VAT', vat, '15% VAT', 1],
            [txnId, refNo, 'FIXED_CHARGE', fixedCharge, 'Fixed service charge', 2],
            [txnId, refNo, 'REL_LEVY', relLevy, 'Regulatory levy', 3],
            [txnId, refNo, 'ENERGY', energyCost, kWh + ' kWh at N$' + rate + '/kWh', 5],
          ];
          if (arrearsDeducted > 0) {
            lineItems.push([txnId, refNo, 'ARREARS', arrearsDeducted, 'Arrears deduction', 4]);
          }
          lineItems.forEach(function(li) {
            db.query('INSERT INTO TransactionLineItems (transactionId, transactionRef, type, amount, description, sortOrder) VALUES (?, ?, ?, ?, ?, ?)', li);
          });

          // Update customer
          db.query('UPDATE VendingCustomers SET lastPurchaseDate = NOW(), lastPurchaseAmount = ?, arrears = GREATEST(0, arrears - ?) WHERE meterNo = ?',
            [totalAmount, arrearsDeducted, meterNo]);

          // Update partner stats
          db.query('UPDATE ApiPartners SET totalTransactions = totalTransactions + 1, totalRevenue = totalRevenue + ?, lastActivityAt = NOW() WHERE partnerId = ?',
            [totalAmount, partner.partnerId]);

          // Audit
          logAudit('API vend: ' + refNo, 'API_VEND',
            'Partner: ' + partner.name + ' (' + partner.partnerId + '), Meter: ' + meterNo + ', Amount: N$' + totalAmount,
            'API:' + partner.name, null, req.ip);

          var successResp = {
            success: true,
            data: {
              transactionId: txnId,
              refNo: refNo,
              token: token,
              meterNo: meterNo,
              customerName: customer.name,
              amount: totalAmount,
              currency: 'NAD',
              kWh: kWh,
              rate: rate,
              tariffGroup: customer.tariffGroup || 'Residential',
              timestamp: new Date().toISOString(),
              partner: partner.partnerId,
              environment: partner.environment,
              breakdown: {
                vat: vat,
                fixedCharge: fixedCharge,
                relLevy: relLevy,
                arrearsDeducted: arrearsDeducted,
                energyCost: energyCost
              }
            }
          };

          logApiResponse(req, res, 200, successResp);
          res.json(successResp);
        });
      });
    });
  });
}


// ──── REST API: Balance / Meter Inquiry ────────────────────────────────────

router.get('/external/meter/:meterNo', authenticatePartner, checkRateLimit, function(req, res) {
  var partner = req.partner;
  if ((partner.permissions || '').indexOf('balance') === -1) {
    var errResp = { error: 'Permission denied', code: 'PERMISSION_DENIED' };
    logApiResponse(req, res, 403, errResp);
    return res.status(403).json(errResp);
  }

  if (partner.environment === 'Sandbox') {
    var sandboxResp = {
      success: true,
      sandbox: true,
      data: {
        meterNo: req.params.meterNo,
        customerName: 'Sandbox Test Customer',
        accountNo: 'SBX-ACC-001',
        area: 'Windhoek',
        tariffGroup: 'Residential',
        status: 'Active',
        arrears: 0,
        lastPurchaseDate: new Date().toISOString(),
        lastPurchaseAmount: 250.00
      }
    };
    logApiResponse(req, res, 200, sandboxResp);
    return res.json(sandboxResp);
  }

  db.query('SELECT name, accountNo, meterNo, area, tariffGroup, status, arrears, lastPurchaseDate, lastPurchaseAmount FROM VendingCustomers WHERE meterNo = ?',
    [req.params.meterNo], function(err, rows) {
      if (err) {
        var errResp2 = { error: 'Internal error', code: 'INTERNAL_ERROR' };
        logApiResponse(req, res, 500, errResp2);
        return res.status(500).json(errResp2);
      }
      if (!rows || rows.length === 0) {
        var errResp3 = { error: 'Meter not found', code: 'METER_NOT_FOUND' };
        logApiResponse(req, res, 404, errResp3);
        return res.status(404).json(errResp3);
      }
      var resp = { success: true, data: rows[0] };
      logApiResponse(req, res, 200, resp);
      res.json(resp);
    }
  );
});


// ──── REST API: Transaction Status ────────────────────────────────────────

router.get('/external/transaction/:refNo', authenticatePartner, checkRateLimit, function(req, res) {
  var partner = req.partner;
  if ((partner.permissions || '').indexOf('status') === -1) {
    var errResp = { error: 'Permission denied', code: 'PERMISSION_DENIED' };
    logApiResponse(req, res, 403, errResp);
    return res.status(403).json(errResp);
  }

  if (partner.environment === 'Sandbox') {
    var sandboxResp = {
      success: true,
      sandbox: true,
      data: {
        refNo: req.params.refNo,
        status: 'Completed',
        amount: 500,
        kWh: 297.62,
        token: '58234917064823715904',
        timestamp: new Date().toISOString()
      }
    };
    logApiResponse(req, res, 200, sandboxResp);
    return res.json(sandboxResp);
  }

  db.query('SELECT refNo, meterNo, customerName, amount, kWh, token, status, vendorName, created_at FROM VendingTransactions WHERE refNo = ?',
    [req.params.refNo], function(err, rows) {
      if (err) {
        var errResp2 = { error: 'Internal error', code: 'INTERNAL_ERROR' };
        logApiResponse(req, res, 500, errResp2);
        return res.status(500).json(errResp2);
      }
      if (!rows || rows.length === 0) {
        var errResp3 = { error: 'Transaction not found', code: 'TRANSACTION_NOT_FOUND' };
        logApiResponse(req, res, 404, errResp3);
        return res.status(404).json(errResp3);
      }
      var resp = { success: true, data: rows[0] };
      logApiResponse(req, res, 200, resp);
      res.json(resp);
    }
  );
});


// ═══════════════════════════════════════════════════════════════════════════
// ISO 8583 MESSAGE GATEWAY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ISO 8583 Message Format Support
 *
 * Field mapping for prepaid electricity vending:
 *   MTI 0200 = Financial transaction request (purchase)
 *   MTI 0210 = Financial transaction response
 *   MTI 0400 = Reversal request
 *   MTI 0410 = Reversal response
 *   MTI 0800 = Network management request (echo test)
 *   MTI 0810 = Network management response
 *
 * Data Elements used:
 *   DE2  = Meter Number (Primary Account Number)
 *   DE3  = Processing Code (003000 = prepaid purchase)
 *   DE4  = Transaction Amount (cents)
 *   DE7  = Transmission Date/Time
 *   DE11 = Systems Trace Audit Number (STAN)
 *   DE12 = Local Transaction Time
 *   DE13 = Local Transaction Date
 *   DE32 = Acquiring Institution ID (Partner ID)
 *   DE37 = Retrieval Reference Number
 *   DE38 = Authorization Response Code (token first 6 digits)
 *   DE39 = Response Code (00=Approved)
 *   DE41 = Terminal ID
 *   DE42 = Merchant ID (Partner ID)
 *   DE48 = Additional Data (token, kWh, breakdown)
 *   DE49 = Currency Code (516 = NAD)
 *   DE62 = Utility reference data
 */

router.post('/external/iso8583', authenticatePartner, checkRateLimit, function(req, res) {
  var msg = req.body;
  var partner = req.partner;

  // Support both flat {mti, de2, de4, ...} and nested {mti, de: {de2, de4, ...}} formats
  if (msg && msg.de && typeof msg.de === 'object') {
    var deKeys = Object.keys(msg.de);
    for (var dk = 0; dk < deKeys.length; dk++) {
      if (!msg[deKeys[dk]]) msg[deKeys[dk]] = msg.de[deKeys[dk]];
    }
  }

  if (!msg || !msg.mti) {
    var errResp = { error: 'Invalid ISO 8583 message: MTI required', code: 'INVALID_ISO8583' };
    logApiResponse(req, res, 400, errResp);
    return res.status(400).json(errResp);
  }

  var mti = msg.mti;

  // Network echo test
  if (mti === '0800') {
    var echoResp = {
      mti: '0810',
      de7: new Date().toISOString().replace(/[-:T]/g, '').substring(0, 14),
      de11: msg.de11 || '000000',
      de39: '00',
      de42: partner.partnerId,
      message: 'Network echo successful'
    };
    logApiResponse(req, res, 200, echoResp);
    return res.json(echoResp);
  }

  // Financial transaction request (purchase)
  if (mti === '0200') {
    var meterNo = msg.de2;
    var processingCode = msg.de3 || '003000';
    var amountCents = parseInt(msg.de4) || 0;
    var amount = amountCents / 100;
    var stan = msg.de11 || '';
    var terminalId = msg.de41 || '';
    var merchantId = msg.de42 || partner.partnerId;
    var rrn = msg.de37 || 'RRN-' + Date.now().toString(36).toUpperCase();

    if (!meterNo || amount <= 0) {
      var iso8583Error = {
        mti: '0210',
        de2: meterNo,
        de4: msg.de4,
        de7: new Date().toISOString().replace(/[-:T]/g, '').substring(0, 14),
        de11: stan,
        de37: rrn,
        de39: '30',
        de42: merchantId,
        message: 'Format error — meter number and valid amount required'
      };
      logApiResponse(req, res, 400, iso8583Error);
      return res.status(400).json(iso8583Error);
    }

    // Wrap the vend in ISO 8583 format
    // Reuse the REST vend logic
    req.body = { meterNo: meterNo, amount: amount, idempotencyKey: 'ISO-' + stan + '-' + rrn };

    // Simulate the vend and format response as ISO 8583
    doIso8583Vend(meterNo, amount, partner, stan, rrn, terminalId, merchantId, req, res);
    return;
  }

  // Reversal request
  if (mti === '0400') {
    var isoReverseResp = {
      mti: '0410',
      de7: new Date().toISOString().replace(/[-:T]/g, '').substring(0, 14),
      de11: msg.de11,
      de37: msg.de37,
      de39: '00',
      de42: partner.partnerId,
      message: 'Reversal acknowledgement — contact utility for manual reversal processing'
    };
    logApiResponse(req, res, 200, isoReverseResp);
    return res.json(isoReverseResp);
  }

  var unknownResp = { error: 'Unsupported MTI: ' + mti, code: 'UNSUPPORTED_MTI' };
  logApiResponse(req, res, 400, unknownResp);
  res.status(400).json(unknownResp);
});

function doIso8583Vend(meterNo, amount, partner, stan, rrn, terminalId, merchantId, req, res) {
  // Sandbox mode — return simulated ISO 8583 response
  if (partner.environment === 'Sandbox') {
    var vatRate = 15;
    var fixedCharge = 8.50;
    var relLevy = 2.40;
    var netAmount = amount - fixedCharge - relLevy;
    var vat = netAmount * vatRate / (100 + vatRate);
    var energyCost = netAmount - vat;
    var kWh = parseFloat((energyCost / 1.68).toFixed(2));
    var sbxToken = '';
    for (var t = 0; t < 20; t++) sbxToken += String(Math.floor(Math.random() * 10));
    var sbxRefNo = 'SBX-ISO-' + Date.now().toString(36).toUpperCase().substring(0, 8);
    var sbxResp = {
      mti: '0210', de2: meterNo, de4: String(Math.round(amount * 100)),
      de7: new Date().toISOString().replace(/[-:T]/g, '').substring(0, 14),
      de11: stan, de37: rrn, de39: '00', de42: merchantId,
      de48: sbxToken, sandbox: true,
      message: 'Sandbox: Approved — ' + kWh + ' kWh',
      breakdown: { vat: parseFloat(vat.toFixed(2)), fixedCharge: fixedCharge, relLevy: relLevy, energyCost: parseFloat(energyCost.toFixed(2)), kWh: kWh }
    };
    logApiResponse(req, res, 200, sbxResp);
    return res.json(sbxResp);
  }

  // Production — uses real DB tables
  db.query('SELECT * FROM TariffConfig LIMIT 1', function(err, configRows) {
    if (err) {
      return res.status(500).json({ mti: '0210', de39: '96', message: 'System error' });
    }
    var config = (configRows && configRows[0]) || { vatRate: 15, fixedCharge: 8.50, relLevy: 2.40 };

    db.query('SELECT * FROM VendingCustomers WHERE meterNo = ?', [meterNo], function(custErr, custRows) {
      if (custErr || !custRows || custRows.length === 0) {
        var notFoundResp = {
          mti: '0210', de2: meterNo, de4: String(Math.round(amount * 100)),
          de7: new Date().toISOString().replace(/[-:T]/g, '').substring(0, 14),
          de11: stan, de37: rrn, de39: '14', de42: merchantId,
          message: 'Invalid meter number'
        };
        logApiResponse(req, res, 404, notFoundResp);
        return res.status(404).json(notFoundResp);
      }

      var customer = custRows[0];
      var vatRate = parseFloat(config.vatRate) || 15;
      var vat = round2(amount * vatRate / (100 + vatRate));
      var fixedCharge = round2(parseFloat(config.fixedCharge) || 8.50);
      var relLevy = round2(parseFloat(config.relLevy) || 2.40);
      var energyCost = round2(amount - vat - fixedCharge - relLevy);
      var rate = 1.68;
      var kWh = round2(energyCost / rate);

      // Generate token
      var token = '';
      for (var i = 0; i < 20; i++) token += Math.floor(Math.random() * 10);
      var ts = Date.now().toString(36).toUpperCase();
      var rand = Math.random().toString(36).substring(2, 6).toUpperCase();
      var refNo = 'TXN-' + ts + '-' + rand;

      // Insert transaction
      db.query(
        'INSERT INTO VendingTransactions (refNo, idempotencyKey, meterNo, customerName, amount, vatAmount, fixedCharge, relLevy, arrearsDeducted, energyAmount, kWh, token, vendorName, operator, status, channel) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, "Completed", "ISO8583")',
        [refNo, 'ISO-' + stan + '-' + rrn, meterNo, customer.name,
         amount, vat, fixedCharge, relLevy, energyCost, kWh,
         token, partner.name, 'ISO8583:' + partner.name],
        function(txnErr, txnResult) {
          if (txnErr) {
            return res.status(500).json({ mti: '0210', de39: '96', message: 'Processing error' });
          }

          // Update partner stats
          db.query('UPDATE ApiPartners SET totalTransactions = totalTransactions + 1, totalRevenue = totalRevenue + ?, lastActivityAt = NOW() WHERE partnerId = ?',
            [amount, partner.partnerId]);

          // ISO 8583 response
          var isoResp = {
            mti: '0210',
            de2: meterNo,
            de3: '003000',
            de4: String(Math.round(amount * 100)),
            de7: new Date().toISOString().replace(/[-:T]/g, '').substring(0, 14),
            de11: stan,
            de12: new Date().toTimeString().substring(0, 8).replace(/:/g, ''),
            de13: new Date().toISOString().substring(5, 10).replace(/-/g, ''),
            de32: partner.partnerId,
            de37: rrn,
            de38: token.substring(0, 6),
            de39: '00',
            de41: terminalId,
            de42: merchantId,
            de48: JSON.stringify({
              token: token,
              kWh: kWh,
              customerName: customer.name,
              refNo: refNo,
              breakdown: { vat: vat, fixedCharge: fixedCharge, relLevy: relLevy, energyCost: energyCost }
            }),
            de49: '516',
            de62: refNo
          };

          logApiResponse(req, res, 200, isoResp);
          logAudit('ISO8583 vend: ' + refNo, 'ISO8583_VEND',
            'Partner: ' + partner.name + ', Meter: ' + meterNo + ', Amount: N$' + amount + ', STAN: ' + stan,
            'ISO8583:' + partner.name, null, req.ip);

          res.json(isoResp);
        }
      );
    });
  });
}


// ──── REST API: API Documentation endpoint ────────────────────────────────

router.get('/external/docs', function(req, res) {
  res.json({
    name: 'GRIDx Vending API',
    version: '1.0.0',
    description: 'NamPower-compliant prepaid electricity vending API gateway',
    baseUrl: '/cb/integration/external',
    authentication: {
      method: 'API Key',
      header: 'X-Api-Key',
      description: 'Include your API key in the X-Api-Key header with every request'
    },
    endpoints: [
      {
        method: 'POST',
        path: '/external/vend',
        description: 'Purchase prepaid electricity token',
        parameters: {
          meterNo: 'string (required) — Customer meter number',
          amount: 'number (required) — Purchase amount in NAD',
          idempotencyKey: 'string (optional) — Unique key to prevent duplicate transactions'
        },
        response: 'Token, kWh, transaction reference, cost breakdown'
      },
      {
        method: 'GET',
        path: '/external/meter/:meterNo',
        description: 'Query meter / customer information',
        response: 'Customer name, account, tariff group, arrears, last purchase'
      },
      {
        method: 'GET',
        path: '/external/transaction/:refNo',
        description: 'Query transaction status by reference number',
        response: 'Transaction details, status, token'
      },
      {
        method: 'POST',
        path: '/external/iso8583',
        description: 'ISO 8583 financial message gateway',
        supportedMTI: {
          '0200': 'Financial transaction request (token purchase)',
          '0400': 'Reversal request',
          '0800': 'Network echo test'
        }
      }
    ],
    rateLimits: {
      default: '60 requests per minute, 10,000 per day',
      headers: 'X-RateLimit-Limit, X-RateLimit-Remaining'
    },
    environments: {
      sandbox: 'Returns simulated responses, no real transactions',
      production: 'Live vending with real token generation'
    },
    errorCodes: {
      AUTH_MISSING_KEY: 'No API key provided',
      AUTH_INVALID_KEY: 'API key not recognized',
      PARTNER_SUSPENDED: 'Partner account suspended',
      PARTNER_REVOKED: 'Partner credentials revoked',
      IP_NOT_ALLOWED: 'Request IP not in whitelist',
      RATE_LIMIT_EXCEEDED: 'Too many requests',
      PERMISSION_DENIED: 'Operation not permitted for this partner',
      INVALID_REQUEST: 'Missing or invalid parameters',
      METER_NOT_FOUND: 'Meter number not in database',
      ACCOUNT_SUSPENDED: 'Customer account suspended',
      BELOW_MINIMUM: 'Amount below minimum purchase threshold',
      TRANSACTION_FAILED: 'Internal processing error',
      TRANSACTION_NOT_FOUND: 'Reference number not found'
    }
  });
});


module.exports = router;
