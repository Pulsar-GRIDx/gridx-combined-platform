/**
 * NamPower STS Vending Routes
 * Handles token vending, customer lookup, tariff calculations,
 * transaction history, reversals, vendor management, batch management,
 * tariff configuration, arrears, and audit logging.
 */
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken } = require('../admin/authMiddllware');

// ─── AUTO-MIGRATE: Create tables if they don't exist ────────────────────────
const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS VendingCustomers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  accountNo VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(30),
  email VARCHAR(100),
  meterNo VARCHAR(50) NOT NULL,
  area VARCHAR(100),
  address VARCHAR(255),
  gpsLat DECIMAL(10,6),
  gpsLng DECIMAL(10,6),
  tariffGroup VARCHAR(50) DEFAULT 'Residential',
  meterMake VARCHAR(100),
  status ENUM('Active','Suspended','Inactive','Arrears') DEFAULT 'Active',
  arrears DECIMAL(12,2) DEFAULT 0,
  lastPurchaseDate DATETIME,
  lastPurchaseAmount DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_meterNo (meterNo),
  INDEX idx_area (area),
  INDEX idx_status (status)
);

CREATE TABLE IF NOT EXISTS VendingTransactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  refNo VARCHAR(50) NOT NULL UNIQUE,
  dateTime DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  customerId INT,
  customerName VARCHAR(100),
  meterNo VARCHAR(50) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  kWh DECIMAL(12,2) DEFAULT 0,
  token VARCHAR(30),
  operator VARCHAR(100),
  operatorId INT,
  type ENUM('Vend','Reversal','Free Token','Engineering','Reprint') DEFAULT 'Vend',
  status ENUM('Completed','Failed','Reversed','Pending') DEFAULT 'Completed',
  vendorId INT,
  vendorName VARCHAR(100),
  salesBatchId INT,
  reversalReason VARCHAR(255),
  reversedBy VARCHAR(100),
  reversedAt DATETIME,
  originalTxnId INT,
  vatAmount DECIMAL(12,2) DEFAULT 0,
  fixedCharge DECIMAL(12,2) DEFAULT 0,
  relLevy DECIMAL(12,2) DEFAULT 0,
  arrearsDeducted DECIMAL(12,2) DEFAULT 0,
  energyAmount DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_meterNo (meterNo),
  INDEX idx_dateTime (dateTime),
  INDEX idx_vendorId (vendorId),
  INDEX idx_status (status),
  INDEX idx_type (type),
  INDEX idx_salesBatch (salesBatchId)
);

CREATE TABLE IF NOT EXISTS Vendors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  location VARCHAR(255),
  status ENUM('Active','Inactive','Suspended') DEFAULT 'Active',
  totalSales DECIMAL(14,2) DEFAULT 0,
  transactionCount INT DEFAULT 0,
  balance DECIMAL(14,2) DEFAULT 0,
  commissionRate DECIMAL(5,2) DEFAULT 1.5,
  operatorName VARCHAR(100),
  operatorPhone VARCHAR(30),
  lastActivity DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status)
);

CREATE TABLE IF NOT EXISTS SalesBatches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  batchNo VARCHAR(50) NOT NULL UNIQUE,
  vendorId INT NOT NULL,
  vendorName VARCHAR(100),
  status ENUM('Open','Closed') DEFAULT 'Open',
  transactionCount INT DEFAULT 0,
  totalAmount DECIMAL(14,2) DEFAULT 0,
  openedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  closedAt DATETIME,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_vendorId (vendorId),
  INDEX idx_status (status)
);

CREATE TABLE IF NOT EXISTS BankingBatches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  batchNo VARCHAR(50) NOT NULL UNIQUE,
  salesBatchId INT NOT NULL,
  bankRef VARCHAR(100),
  status ENUM('Pending','Submitted','Reconciled') DEFAULT 'Pending',
  totalAmount DECIMAL(14,2) DEFAULT 0,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  reconciledAt DATETIME,
  notes TEXT,
  INDEX idx_salesBatchId (salesBatchId),
  INDEX idx_status (status)
);

CREATE TABLE IF NOT EXISTS TariffGroups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  sgc VARCHAR(20),
  description TEXT,
  type ENUM('Block','Flat','TOU') DEFAULT 'Block',
  flatRate DECIMAL(8,4),
  customerCount INT DEFAULT 0,
  effectiveDate DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS TariffBlocks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tariffGroupId INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  rangeLabel VARCHAR(50),
  rate DECIMAL(8,4) NOT NULL,
  minKwh DECIMAL(12,2) DEFAULT 0,
  maxKwh DECIMAL(12,2),
  period VARCHAR(20),
  sortOrder INT DEFAULT 0,
  INDEX idx_tariffGroupId (tariffGroupId)
);

CREATE TABLE IF NOT EXISTS TariffConfig (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vatRate DECIMAL(5,2) DEFAULT 15.00,
  fixedCharge DECIMAL(8,2) DEFAULT 8.50,
  relLevy DECIMAL(8,2) DEFAULT 2.40,
  minPurchase DECIMAL(8,2) DEFAULT 5.00,
  arrearsMode ENUM('auto-deduct','manual','disabled') DEFAULT 'auto-deduct',
  arrearsThreshold DECIMAL(12,2) DEFAULT 500.00,
  arrearsPercentage DECIMAL(5,2) DEFAULT 25.00,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS AuditLog (
  id INT AUTO_INCREMENT PRIMARY KEY,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  event VARCHAR(255) NOT NULL,
  type ENUM('VEND','LOGIN','CREATE','UPDATE','DELETE','SYSTEM','REVERSAL','BATCH') DEFAULT 'SYSTEM',
  detail TEXT,
  user VARCHAR(100),
  userId INT,
  ipAddress VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_timestamp (timestamp),
  INDEX idx_type (type),
  INDEX idx_userId (userId)
);
`;

// Run migration on module load
const statements = MIGRATION_SQL.split(/;\s*\n/).filter(s => s.trim().length > 10);
let migrated = 0;
statements.forEach(sql => {
  db.query(sql + ';', (err) => {
    if (err && !err.message.includes('already exists')) {
      console.error('Migration error:', err.message);
    } else {
      migrated++;
      if (migrated === statements.length) {
        console.log('[Vending] All tables migrated successfully');
        seedDefaults();
      }
    }
  });
});

function seedDefaults() {
  // Seed default tariff config if empty
  db.query('SELECT COUNT(*) as c FROM TariffConfig', (err, rows) => {
    if (!err && rows[0].c === 0) {
      db.query('INSERT INTO TariffConfig (vatRate, fixedCharge, relLevy, minPurchase, arrearsMode, arrearsThreshold, arrearsPercentage) VALUES (15, 8.50, 2.40, 5.00, "auto-deduct", 500, 25)');
      console.log('[Vending] Default tariff config seeded');
    }
  });
  // Seed default tariff groups if empty
  db.query('SELECT COUNT(*) as c FROM TariffGroups', (err, rows) => {
    if (!err && rows[0].c === 0) {
      const groups = [
        ['Residential', '48901', 'Standard residential prepaid tariff with inclining block structure', 'Block', null, '2025-07-01'],
        ['Commercial', '48902', 'Commercial and small business flat-rate prepaid tariff', 'Flat', 2.45, '2025-07-01'],
        ['Industrial', '48903', 'Industrial time-of-use prepaid tariff', 'TOU', null, '2025-07-01'],
      ];
      groups.forEach(g => {
        db.query('INSERT INTO TariffGroups (name, sgc, description, type, flatRate, effectiveDate) VALUES (?, ?, ?, ?, ?, ?)', g, (err, result) => {
          if (!err) {
            const gid = result.insertId;
            if (g[0] === 'Residential') {
              [
                ['Block 1 (Lifeline)', '0-50 kWh', 1.12, 0, 50, null, 0],
                ['Block 2', '51-350 kWh', 1.68, 51, 350, null, 1],
                ['Block 3', '351-600 kWh', 2.15, 351, 600, null, 2],
                ['Block 4', '601+ kWh', 2.85, 601, 999999, null, 3],
              ].forEach(b => db.query('INSERT INTO TariffBlocks (tariffGroupId, name, rangeLabel, rate, minKwh, maxKwh, period, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [gid, ...b]));
            } else if (g[0] === 'Commercial') {
              db.query('INSERT INTO TariffBlocks (tariffGroupId, name, rangeLabel, rate, minKwh, maxKwh, period, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [gid, 'All Usage', '0+ kWh', 2.45, 0, 999999, null, 0]);
            } else if (g[0] === 'Industrial') {
              [
                ['Off-Peak (22:00-06:00)', 'All kWh', 1.45, 0, 999999, 'off-peak', 0],
                ['Standard (06:00-08:00, 11:00-18:00)', 'All kWh', 2.10, 0, 999999, 'standard', 1],
                ['Peak (08:00-11:00, 18:00-22:00)', 'All kWh', 3.25, 0, 999999, 'peak', 2],
              ].forEach(b => db.query('INSERT INTO TariffBlocks (tariffGroupId, name, rangeLabel, rate, minKwh, maxKwh, period, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [gid, ...b]));
            }
          }
        });
      });
      console.log('[Vending] Default tariff groups seeded');
    }
  });
}

// Helper: Generate unique ref number
function generateRefNo() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `TXN-${ts}-${rand}`;
}

// Helper: Generate 20-digit STS-style token
function generateToken() {
  let token = '';
  for (let i = 0; i < 20; i++) token += Math.floor(Math.random() * 10);
  return token;
}

// Helper: Log audit event
function logAudit(event, type, detail, user, userId, ip) {
  db.query(
    'INSERT INTO AuditLog (event, type, detail, user, userId, ipAddress) VALUES (?, ?, ?, ?, ?, ?)',
    [event, type, detail, user, userId, ip]
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMERS
// ═══════════════════════════════════════════════════════════════════════════

// GET /vending/customers - List all customers
router.get('/customers', authenticateToken, (req, res) => {
  const { search, area, status } = req.query;
  let sql = 'SELECT * FROM VendingCustomers WHERE 1=1';
  const params = [];
  if (search) {
    sql += ' AND (name LIKE ? OR meterNo LIKE ? OR accountNo LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (area) { sql += ' AND area = ?'; params.push(area); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY name';
  db.query(sql, params, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, data: results || [] });
  });
});

// GET /vending/customers/:meterNo - Get customer by meter number
router.get('/customers/:meterNo', authenticateToken, (req, res) => {
  // First try VendingCustomers, fall back to MeterProfileReal
  db.query('SELECT * FROM VendingCustomers WHERE meterNo = ?', [req.params.meterNo], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results && results.length > 0) {
      return res.json({ success: true, data: results[0] });
    }
    // Fallback: lookup from MeterProfileReal
    db.query(
      `SELECT DRN as meterNo, CONCAT(Name, ' ', Surname) as name, City as area,
              Region as suburb, StreetName as address, tariff_type as tariffGroup,
              'Active' as status, 0 as arrears
       FROM MeterProfileReal WHERE DRN = ?`,
      [req.params.meterNo],
      (err2, results2) => {
        if (err2) return res.status(500).json({ error: err2.message });
        if (!results2 || results2.length === 0) {
          return res.status(404).json({ error: 'Customer not found' });
        }
        res.json({ success: true, data: results2[0] });
      }
    );
  });
});

// POST /vending/customers - Create customer
router.post('/customers', authenticateToken, (req, res) => {
  const { accountNo, name, phone, email, meterNo, area, address, gpsLat, gpsLng, tariffGroup, meterMake } = req.body;
  if (!name || !meterNo) return res.status(400).json({ error: 'name and meterNo are required' });
  const acct = accountNo || `ACC-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
  db.query(
    'INSERT INTO VendingCustomers (accountNo, name, phone, email, meterNo, area, address, gpsLat, gpsLng, tariffGroup, meterMake) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [acct, name, phone, email, meterNo, area, address, gpsLat, gpsLng, tariffGroup || 'Residential', meterMake],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      logAudit(`Customer created: ${name}`, 'CREATE', `Meter: ${meterNo}, Area: ${area}`, (req.user && req.user.Username) || 'System', (req.user && req.user.Admin_ID), req.ip);
      res.json({ success: true, id: result.insertId });
    }
  );
});

// PUT /vending/customers/:id - Update customer
router.put('/customers/:id', authenticateToken, (req, res) => {
  const fields = ['name', 'phone', 'email', 'area', 'address', 'gpsLat', 'gpsLng', 'tariffGroup', 'meterMake', 'status', 'arrears'];
  const updates = [];
  const params = [];
  fields.forEach(f => {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); }
  });
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  params.push(req.params.id);
  db.query(`UPDATE VendingCustomers SET ${updates.join(', ')} WHERE id = ?`, params, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// GET /vending/customers/areas/list - Get unique areas
router.get('/customers/areas/list', authenticateToken, (req, res) => {
  db.query('SELECT DISTINCT area FROM VendingCustomers WHERE area IS NOT NULL ORDER BY area', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    // Also get from MeterProfileReal
    db.query('SELECT DISTINCT City as area FROM MeterProfileReal WHERE City IS NOT NULL ORDER BY City', (err2, results2) => {
      const areas = new Set();
      (results || []).forEach(r => areas.add(r.area));
      (results2 || []).forEach(r => areas.add(r.area));
      res.json({ success: true, data: [...areas].sort() });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN VENDING
// ═══════════════════════════════════════════════════════════════════════════

// POST /vending/vend - Vend a token (core STS vending operation)
router.post('/vend', authenticateToken, (req, res) => {
  const { meterNo, amount, vendorId } = req.body;
  if (!meterNo || !amount || amount <= 0) {
    return res.status(400).json({ error: 'meterNo and positive amount are required' });
  }

  // 1. Get tariff config
  db.query('SELECT * FROM TariffConfig LIMIT 1', (err, configRows) => {
    if (err) return res.status(500).json({ error: err.message });
    const config = configRows[0] || { vatRate: 15, fixedCharge: 8.50, relLevy: 2.40, arrearsPercentage: 25, arrearsMode: 'auto-deduct' };

    // 2. Look up customer
    const lookupCustomer = (callback) => {
      db.query('SELECT * FROM VendingCustomers WHERE meterNo = ?', [meterNo], (err, rows) => {
        if (rows && rows.length > 0) return callback(null, rows[0]);
        // Fallback to MeterProfileReal
        db.query(
          `SELECT DRN as meterNo, CONCAT(Name, ' ', Surname) as name, City as area,
                  tariff_type as tariffGroup, 0 as arrears, 'Active' as status
           FROM MeterProfileReal WHERE DRN = ?`,
          [meterNo],
          (err2, rows2) => {
            if (err2 || !rows2 || rows2.length === 0) return callback(new Error('Meter not found'));
            callback(null, rows2[0]);
          }
        );
      });
    };

    lookupCustomer((err, customer) => {
      if (err) return res.status(404).json({ error: err.message });

      // 3. Get tariff group blocks
      const tariffName = customer.tariffGroup || 'Residential';
      db.query(
        `SELECT tb.* FROM TariffBlocks tb
         JOIN TariffGroups tg ON tb.tariffGroupId = tg.id
         WHERE tg.name = ? ORDER BY tb.sortOrder`,
        [tariffName],
        (err, blocks) => {
          if (err) return res.status(500).json({ error: err.message });
          if (!blocks || blocks.length === 0) {
            // Default: flat rate 1.68
            blocks = [{ name: 'Default', rate: 1.68, minKwh: 0, maxKwh: 999999 }];
          }

          // 4. Calculate breakdown
          const totalAmount = parseFloat(amount);
          const vatRate = parseFloat(config.vatRate) / 100;
          const vatAmount = totalAmount - (totalAmount / (1 + vatRate));
          const afterVat = totalAmount - vatAmount;
          const fixedCharge = parseFloat(config.fixedCharge);
          const relLevy = parseFloat(config.relLevy);

          // Arrears deduction
          let arrearsDeducted = 0;
          const customerArrears = parseFloat(customer.arrears) || 0;
          if (config.arrearsMode === 'auto-deduct' && customerArrears > 0) {
            arrearsDeducted = Math.min(
              customerArrears,
              afterVat * (parseFloat(config.arrearsPercentage) / 100)
            );
          }

          const energyAmount = afterVat - fixedCharge - relLevy - arrearsDeducted;
          if (energyAmount <= 0) {
            return res.status(400).json({ error: 'Amount too low to generate energy units after deductions' });
          }

          // Calculate kWh using block tariff
          let remainingAmount = energyAmount;
          let totalKwh = 0;
          const blockBreakdown = [];

          for (const block of blocks) {
            if (remainingAmount <= 0) break;
            const blockRange = (block.maxKwh || 999999) - (block.minKwh || 0);
            const blockCost = blockRange * parseFloat(block.rate);
            const usedAmount = Math.min(remainingAmount, blockCost);
            const usedKwh = usedAmount / parseFloat(block.rate);
            totalKwh += usedKwh;
            remainingAmount -= usedAmount;
            blockBreakdown.push({
              block: block.name,
              rate: parseFloat(block.rate),
              kWh: Math.round(usedKwh * 100) / 100,
              amount: Math.round(usedAmount * 100) / 100,
            });
          }

          // 5. Generate token
          const token = generateToken();
          const refNo = generateRefNo();

          // Get vendor info
          const getVendor = (callback) => {
            if (!vendorId) return callback(null, { name: 'System', id: null });
            db.query('SELECT id, name FROM Vendors WHERE id = ?', [vendorId], (err, rows) => {
              callback(null, rows && rows.length > 0 ? rows[0] : { name: 'System', id: null });
            });
          };

          // Get open sales batch for vendor
          const getOpenBatch = (vid, callback) => {
            if (!vid) return callback(null, null);
            db.query('SELECT id FROM SalesBatches WHERE vendorId = ? AND status = "Open" ORDER BY openedAt DESC LIMIT 1', [vid], (err, rows) => {
              callback(null, rows && rows.length > 0 ? rows[0].id : null);
            });
          };

          getVendor((err, vendor) => {
            getOpenBatch(vendor.id, (err, batchId) => {
              const operatorName = req.user ? `${req.user.FirstName || ''} ${req.user.LastName || ''}`.trim() : 'System';

              // 6. Insert transaction
              db.query(
                `INSERT INTO VendingTransactions
                 (refNo, customerName, meterNo, amount, kWh, token, operator, operatorId, type, status, vendorId, vendorName, salesBatchId, vatAmount, fixedCharge, relLevy, arrearsDeducted, energyAmount)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Vend', 'Completed', ?, ?, ?, ?, ?, ?, ?, ?)`,
                [refNo, customer.name, meterNo, totalAmount, Math.round(totalKwh * 100) / 100, token, operatorName, (req.user && req.user.Admin_ID), vendor.id, vendor.name, batchId, Math.round(vatAmount * 100) / 100, fixedCharge, relLevy, Math.round(arrearsDeducted * 100) / 100, Math.round(energyAmount * 100) / 100],
                (err, result) => {
                  if (err) return res.status(500).json({ error: err.message });

                  // Update vendor stats
                  if (vendor.id) {
                    db.query('UPDATE Vendors SET totalSales = totalSales + ?, transactionCount = transactionCount + 1, lastActivity = NOW() WHERE id = ?', [totalAmount, vendor.id]);
                  }
                  // Update batch stats
                  if (batchId) {
                    db.query('UPDATE SalesBatches SET transactionCount = transactionCount + 1, totalAmount = totalAmount + ? WHERE id = ?', [totalAmount, batchId]);
                  }
                  // Update customer arrears
                  if (arrearsDeducted > 0) {
                    db.query('UPDATE VendingCustomers SET arrears = arrears - ?, lastPurchaseDate = NOW(), lastPurchaseAmount = ? WHERE meterNo = ?', [arrearsDeducted, totalAmount, meterNo]);
                  } else {
                    db.query('UPDATE VendingCustomers SET lastPurchaseDate = NOW(), lastPurchaseAmount = ? WHERE meterNo = ?', [totalAmount, meterNo]);
                  }

                  // Audit log
                  logAudit(
                    `Token vended: ${totalAmount.toFixed(2)} N$ to meter ${meterNo}`,
                    'VEND',
                    `Customer: ${customer.name}, kWh: ${totalKwh.toFixed(2)}, Token: ${token}`,
                    operatorName, (req.user && req.user.Admin_ID), req.ip
                  );

                  // 7. Return response
                  res.json({
                    success: true,
                    data: {
                      refNo,
                      token,
                      meterNo,
                      customerName: customer.name,
                      amount: totalAmount,
                      kWh: Math.round(totalKwh * 100) / 100,
                      breakdown: {
                        totalAmount,
                        vatAmount: Math.round(vatAmount * 100) / 100,
                        fixedCharge,
                        relLevy,
                        arrearsDeducted: Math.round(arrearsDeducted * 100) / 100,
                        energyAmount: Math.round(energyAmount * 100) / 100,
                        blocks: blockBreakdown,
                      },
                      operator: operatorName,
                      vendorName: vendor.name,
                      dateTime: new Date().toISOString(),
                      status: 'Completed',
                    },
                  });
                }
              );
            });
          });
        }
      );
    });
  });
});

// POST /vending/free-token - Issue free/engineering token
router.post('/free-token', authenticateToken, (req, res) => {
  const { meterNo, kWh, type } = req.body;
  if (!meterNo) return res.status(400).json({ error: 'meterNo is required' });
  const token = generateToken();
  const refNo = generateRefNo();
  const txnType = type || 'Free Token';
  const operatorName = req.user ? `${req.user.FirstName || ''} ${req.user.LastName || ''}`.trim() : 'Admin System';

  db.query(
    `INSERT INTO VendingTransactions (refNo, meterNo, amount, kWh, token, operator, operatorId, type, status)
     VALUES (?, ?, 0, ?, ?, ?, ?, ?, 'Completed')`,
    [refNo, meterNo, kWh || 0, token, operatorName, (req.user && req.user.Admin_ID), txnType],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      logAudit(`${txnType} issued to meter ${meterNo}`, 'VEND', `kWh: ${kWh || 0}`, operatorName, (req.user && req.user.Admin_ID), req.ip);
      res.json({ success: true, data: { refNo, token, meterNo, kWh: kWh || 0, type: txnType } });
    }
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// TRANSACTIONS
// ═══════════════════════════════════════════════════════════════════════════

// GET /vending/transactions - List transactions with filtering
router.get('/transactions', authenticateToken, (req, res) => {
  const { search, type, status, from, to, vendorId, limit = 100, offset = 0 } = req.query;
  let sql = 'SELECT * FROM VendingTransactions WHERE 1=1';
  const params = [];
  if (search) {
    sql += ' AND (refNo LIKE ? OR customerName LIKE ? OR meterNo LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (type && type !== 'All') { sql += ' AND type = ?'; params.push(type); }
  if (status && status !== 'All') { sql += ' AND status = ?'; params.push(status); }
  if (from) { sql += ' AND dateTime >= ?'; params.push(from); }
  if (to) { sql += ' AND dateTime <= ?'; params.push(to); }
  if (vendorId) { sql += ' AND vendorId = ?'; params.push(vendorId); }
  sql += ' ORDER BY dateTime DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  db.query(sql, params, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    // Get total count
    let countSql = 'SELECT COUNT(*) as total FROM VendingTransactions WHERE 1=1';
    const countParams = [];
    if (search) {
      countSql += ' AND (refNo LIKE ? OR customerName LIKE ? OR meterNo LIKE ?)';
      countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (type && type !== 'All') { countSql += ' AND type = ?'; countParams.push(type); }
    if (status && status !== 'All') { countSql += ' AND status = ?'; countParams.push(status); }
    if (from) { countSql += ' AND dateTime >= ?'; countParams.push(from); }
    if (to) { countSql += ' AND dateTime <= ?'; countParams.push(to); }
    if (vendorId) { countSql += ' AND vendorId = ?'; countParams.push(vendorId); }

    db.query(countSql, countParams, (err2, countResult) => {
      res.json({
        success: true,
        data: results || [],
        total: countResult ? countResult[0].total : 0,
      });
    });
  });
});

// GET /vending/transactions/:id - Get single transaction
router.get('/transactions/:id', authenticateToken, (req, res) => {
  db.query('SELECT * FROM VendingTransactions WHERE id = ? OR refNo = ?', [req.params.id, req.params.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!results || results.length === 0) return res.status(404).json({ error: 'Transaction not found' });
    res.json({ success: true, data: results[0] });
  });
});

// POST /vending/transactions/:id/reverse - Reverse a transaction
router.post('/transactions/:id/reverse', authenticateToken, (req, res) => {
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: 'Reversal reason is required' });

  db.query('SELECT * FROM VendingTransactions WHERE id = ?', [req.params.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!results || results.length === 0) return res.status(404).json({ error: 'Transaction not found' });

    const txn = results[0];
    if (txn.status === 'Reversed') return res.status(400).json({ error: 'Transaction already reversed' });
    if (txn.type === 'Reversal') return res.status(400).json({ error: 'Cannot reverse a reversal' });

    const operatorName = req.user ? `${req.user.FirstName || ''} ${req.user.LastName || ''}`.trim() : 'System';
    const reversalRefNo = generateRefNo();

    // Mark original as reversed
    db.query(
      'UPDATE VendingTransactions SET status = "Reversed", reversalReason = ?, reversedBy = ?, reversedAt = NOW() WHERE id = ?',
      [reason, operatorName, txn.id],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });

        // Create reversal transaction
        db.query(
          `INSERT INTO VendingTransactions (refNo, customerName, meterNo, amount, kWh, token, operator, operatorId, type, status, vendorId, vendorName, originalTxnId, reversalReason)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Reversal', 'Completed', ?, ?, ?, ?)`,
          [reversalRefNo, txn.customerName, txn.meterNo, -Math.abs(txn.amount), -Math.abs(txn.kWh), txn.token, operatorName, (req.user && req.user.Admin_ID), txn.vendorId, txn.vendorName, txn.id, reason],
          (err) => {
            if (err) return res.status(500).json({ error: err.message });

            // Update vendor stats
            if (txn.vendorId) {
              db.query('UPDATE Vendors SET totalSales = totalSales - ?, transactionCount = transactionCount - 1 WHERE id = ?', [Math.abs(txn.amount), txn.vendorId]);
            }

            // Restore arrears if was deducted
            if (txn.arrearsDeducted > 0) {
              db.query('UPDATE VendingCustomers SET arrears = arrears + ? WHERE meterNo = ?', [txn.arrearsDeducted, txn.meterNo]);
            }

            logAudit(
              `Transaction reversed: ${txn.refNo}`,
              'REVERSAL',
              `Amount: ${txn.amount} N$, Reason: ${reason}`,
              operatorName, (req.user && req.user.Admin_ID), req.ip
            );

            res.json({ success: true, data: { reversalRefNo, originalRefNo: txn.refNo } });
          }
        );
      }
    );
  });
});

// POST /vending/transactions/:id/reprint - Reprint token receipt
router.post('/transactions/:id/reprint', authenticateToken, (req, res) => {
  db.query('SELECT * FROM VendingTransactions WHERE id = ?', [req.params.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!results || results.length === 0) return res.status(404).json({ error: 'Transaction not found' });
    const operatorName = req.user ? `${req.user.FirstName || ''} ${req.user.LastName || ''}`.trim() : 'System';
    logAudit(`Token reprinted: ${results[0].refNo}`, 'VEND', `Meter: ${results[0].meterNo}`, operatorName, (req.user && req.user.Admin_ID), req.ip);
    res.json({ success: true, data: results[0] });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// VENDORS
// ═══════════════════════════════════════════════════════════════════════════

// GET /vending/vendors - List all vendors
router.get('/vendors', authenticateToken, (req, res) => {
  db.query('SELECT * FROM Vendors ORDER BY name', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, data: results || [] });
  });
});

// GET /vending/vendors/:id - Get single vendor
router.get('/vendors/:id', authenticateToken, (req, res) => {
  db.query('SELECT * FROM Vendors WHERE id = ?', [req.params.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!results || results.length === 0) return res.status(404).json({ error: 'Vendor not found' });
    res.json({ success: true, data: results[0] });
  });
});

// POST /vending/vendors - Create vendor
router.post('/vendors', authenticateToken, (req, res) => {
  const { name, location, commissionRate, operatorName, operatorPhone } = req.body;
  if (!name) return res.status(400).json({ error: 'Vendor name is required' });
  db.query(
    'INSERT INTO Vendors (name, location, commissionRate, operatorName, operatorPhone) VALUES (?, ?, ?, ?, ?)',
    [name, location, commissionRate || 1.5, operatorName, operatorPhone],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      const opName = req.user ? `${req.user.FirstName || ''} ${req.user.LastName || ''}`.trim() : 'System';
      logAudit(`Vendor created: ${name}`, 'CREATE', `Location: ${location}`, opName, (req.user && req.user.Admin_ID), req.ip);
      res.json({ success: true, id: result.insertId });
    }
  );
});

// PUT /vending/vendors/:id - Update vendor
router.put('/vendors/:id', authenticateToken, (req, res) => {
  const fields = ['name', 'location', 'status', 'commissionRate', 'operatorName', 'operatorPhone', 'balance'];
  const updates = [];
  const params = [];
  fields.forEach(f => {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); }
  });
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  params.push(req.params.id);
  db.query(`UPDATE Vendors SET ${updates.join(', ')} WHERE id = ?`, params, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// DELETE /vending/vendors/:id - Delete vendor
router.delete('/vendors/:id', authenticateToken, (req, res) => {
  db.query('DELETE FROM Vendors WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// GET /vending/vendors/:id/commission - Get vendor commission summary
router.get('/vendors/:id/commission', authenticateToken, (req, res) => {
  const { from, to } = req.query;
  let sql = `SELECT v.*,
             (SELECT COUNT(*) FROM VendingTransactions t WHERE t.vendorId = v.id AND t.type = 'Vend' AND t.status = 'Completed') as completedTxns,
             (SELECT COALESCE(SUM(t.amount), 0) FROM VendingTransactions t WHERE t.vendorId = v.id AND t.type = 'Vend' AND t.status = 'Completed') as totalVended
             FROM Vendors v WHERE v.id = ?`;
  db.query(sql, [req.params.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!results || results.length === 0) return res.status(404).json({ error: 'Vendor not found' });
    const vendor = results[0];
    const commission = vendor.totalVended * (vendor.commissionRate / 100);
    res.json({ success: true, data: { ...vendor, commission: Math.round(commission * 100) / 100 } });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SALES & BANKING BATCHES
// ═══════════════════════════════════════════════════════════════════════════

// GET /vending/batches/sales - List sales batches
router.get('/batches/sales', authenticateToken, (req, res) => {
  const { vendorId, status } = req.query;
  let sql = 'SELECT * FROM SalesBatches WHERE 1=1';
  const params = [];
  if (vendorId) { sql += ' AND vendorId = ?'; params.push(vendorId); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY openedAt DESC';
  db.query(sql, params, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, data: results || [] });
  });
});

// POST /vending/batches/sales - Create sales batch
router.post('/batches/sales', authenticateToken, (req, res) => {
  const { vendorId, notes } = req.body;
  if (!vendorId) return res.status(400).json({ error: 'vendorId is required' });

  db.query('SELECT name FROM Vendors WHERE id = ?', [vendorId], (err, vendorRows) => {
    const vendorName = vendorRows && vendorRows.length > 0 ? vendorRows[0].name : 'Unknown';
    const batchNo = `BATCH-${Date.now().toString(36).toUpperCase()}`;
    db.query(
      'INSERT INTO SalesBatches (batchNo, vendorId, vendorName, notes) VALUES (?, ?, ?, ?)',
      [batchNo, vendorId, vendorName, notes],
      (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        logAudit(`Sales batch opened: ${batchNo}`, 'BATCH', `Vendor: ${vendorName}`, (req.user && req.user.Username) || 'System', (req.user && req.user.Admin_ID), req.ip);
        res.json({ success: true, id: result.insertId, batchNo });
      }
    );
  });
});

// POST /vending/batches/sales/:id/close - Close sales batch
router.post('/batches/sales/:id/close', authenticateToken, (req, res) => {
  db.query('UPDATE SalesBatches SET status = "Closed", closedAt = NOW() WHERE id = ? AND status = "Open"', [req.params.id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    if (result.affectedRows === 0) return res.status(400).json({ error: 'Batch not found or already closed' });
    logAudit(`Sales batch closed: #${req.params.id}`, 'BATCH', '', (req.user && req.user.Username) || 'System', (req.user && req.user.Admin_ID), req.ip);
    res.json({ success: true });
  });
});

// GET /vending/batches/banking - List banking batches
router.get('/batches/banking', authenticateToken, (req, res) => {
  db.query(
    `SELECT bb.*, sb.batchNo as salesBatchNo, sb.vendorName
     FROM BankingBatches bb
     LEFT JOIN SalesBatches sb ON bb.salesBatchId = sb.id
     ORDER BY bb.createdAt DESC`,
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, data: results || [] });
    }
  );
});

// POST /vending/batches/banking - Create banking batch
router.post('/batches/banking', authenticateToken, (req, res) => {
  const { salesBatchId, bankRef, notes } = req.body;
  if (!salesBatchId) return res.status(400).json({ error: 'salesBatchId is required' });

  db.query('SELECT totalAmount FROM SalesBatches WHERE id = ? AND status = "Closed"', [salesBatchId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!rows || rows.length === 0) return res.status(400).json({ error: 'Sales batch not found or not closed' });

    const batchNo = `BANK-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;
    db.query(
      'INSERT INTO BankingBatches (batchNo, salesBatchId, bankRef, totalAmount, notes) VALUES (?, ?, ?, ?, ?)',
      [batchNo, salesBatchId, bankRef, rows[0].totalAmount, notes],
      (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        logAudit(`Banking batch created: ${batchNo}`, 'BATCH', `Bank ref: ${bankRef}`, (req.user && req.user.Username) || 'System', (req.user && req.user.Admin_ID), req.ip);
        res.json({ success: true, id: result.insertId, batchNo });
      }
    );
  });
});

// POST /vending/batches/banking/:id/reconcile - Reconcile banking batch
router.post('/batches/banking/:id/reconcile', authenticateToken, (req, res) => {
  db.query('UPDATE BankingBatches SET status = "Reconciled", reconciledAt = NOW() WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    logAudit(`Banking batch reconciled: #${req.params.id}`, 'BATCH', '', (req.user && req.user.Username) || 'System', (req.user && req.user.Admin_ID), req.ip);
    res.json({ success: true });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TARIFFS
// ═══════════════════════════════════════════════════════════════════════════

// GET /vending/tariffs/config - Get tariff system config
router.get('/tariffs/config', authenticateToken, (req, res) => {
  db.query('SELECT * FROM TariffConfig LIMIT 1', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, data: results[0] || {} });
  });
});

// PUT /vending/tariffs/config - Update tariff system config
router.put('/tariffs/config', authenticateToken, (req, res) => {
  const fields = ['vatRate', 'fixedCharge', 'relLevy', 'minPurchase', 'arrearsMode', 'arrearsThreshold', 'arrearsPercentage'];
  const updates = [];
  const params = [];
  fields.forEach(f => {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); }
  });
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  db.query(`UPDATE TariffConfig SET ${updates.join(', ')} WHERE id = 1`, params, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    const opName = req.user ? `${req.user.FirstName || ''} ${req.user.LastName || ''}`.trim() : 'System';
    logAudit('Tariff configuration updated', 'UPDATE', JSON.stringify(req.body), opName, (req.user && req.user.Admin_ID), req.ip);
    res.json({ success: true });
  });
});

// GET /vending/tariffs/groups - List tariff groups with blocks
router.get('/tariffs/groups', authenticateToken, (req, res) => {
  db.query('SELECT * FROM TariffGroups ORDER BY name', (err, groups) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!groups || groups.length === 0) return res.json({ success: true, data: [] });

    const ids = groups.map(g => g.id);
    db.query('SELECT * FROM TariffBlocks WHERE tariffGroupId IN (?) ORDER BY sortOrder', [ids], (err, blocks) => {
      if (err) return res.status(500).json({ error: err.message });
      const result = groups.map(g => ({
        ...g,
        blocks: (blocks || []).filter(b => b.tariffGroupId === g.id),
      }));
      res.json({ success: true, data: result });
    });
  });
});

// POST /vending/tariffs/groups - Create tariff group
router.post('/tariffs/groups', authenticateToken, (req, res) => {
  const { name, sgc, description, type, flatRate, effectiveDate, blocks } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  db.query(
    'INSERT INTO TariffGroups (name, sgc, description, type, flatRate, effectiveDate) VALUES (?, ?, ?, ?, ?, ?)',
    [name, sgc, description, type || 'Block', flatRate, effectiveDate],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      const groupId = result.insertId;
      if (blocks && blocks.length > 0) {
        const values = blocks.map((b, i) => [groupId, b.name, b.rangeLabel || b.range, b.rate, b.minKwh || b.min || 0, b.maxKwh || b.max || 999999, b.period || null, i]);
        values.forEach(v => {
          db.query('INSERT INTO TariffBlocks (tariffGroupId, name, rangeLabel, rate, minKwh, maxKwh, period, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', v);
        });
      }
      res.json({ success: true, id: groupId });
    }
  );
});

// PUT /vending/tariffs/groups/:id - Update tariff group
router.put('/tariffs/groups/:id', authenticateToken, (req, res) => {
  const { name, sgc, description, type, flatRate, effectiveDate, blocks } = req.body;
  db.query(
    'UPDATE TariffGroups SET name = COALESCE(?, name), sgc = COALESCE(?, sgc), description = COALESCE(?, description), type = COALESCE(?, type), flatRate = COALESCE(?, flatRate), effectiveDate = COALESCE(?, effectiveDate) WHERE id = ?',
    [name, sgc, description, type, flatRate, effectiveDate, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      if (blocks) {
        // Replace all blocks
        db.query('DELETE FROM TariffBlocks WHERE tariffGroupId = ?', [req.params.id], () => {
          blocks.forEach((b, i) => {
            db.query(
              'INSERT INTO TariffBlocks (tariffGroupId, name, rangeLabel, rate, minKwh, maxKwh, period, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              [req.params.id, b.name, b.rangeLabel || b.range, b.rate, b.minKwh || b.min || 0, b.maxKwh || b.max || 999999, b.period || null, i]
            );
          });
        });
      }
      const opName = req.user ? `${req.user.FirstName || ''} ${req.user.LastName || ''}`.trim() : 'System';
      logAudit(`Tariff group updated: ${name || req.params.id}`, 'UPDATE', '', opName, (req.user && req.user.Admin_ID), req.ip);
      res.json({ success: true });
    }
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ARREARS
// ═══════════════════════════════════════════════════════════════════════════

// GET /vending/arrears - Get customers with arrears
router.get('/arrears', authenticateToken, (req, res) => {
  db.query('SELECT * FROM VendingCustomers WHERE arrears > 0 ORDER BY arrears DESC', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, data: results || [] });
  });
});

// POST /vending/arrears/:meterNo - Set arrears for a customer
router.post('/arrears/:meterNo', authenticateToken, (req, res) => {
  const { amount } = req.body;
  if (amount === undefined) return res.status(400).json({ error: 'amount is required' });
  db.query('UPDATE VendingCustomers SET arrears = ?, status = IF(? > 0, "Arrears", "Active") WHERE meterNo = ?', [amount, amount, req.params.meterNo], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Customer not found' });
    const opName = req.user ? `${req.user.FirstName || ''} ${req.user.LastName || ''}`.trim() : 'System';
    logAudit(`Arrears set: ${amount} N$ on meter ${req.params.meterNo}`, 'UPDATE', '', opName, (req.user && req.user.Admin_ID), req.ip);
    res.json({ success: true });
  });
});

// GET /vending/arrears/summary - Get arrears summary
router.get('/arrears/summary', authenticateToken, (req, res) => {
  db.query(
    `SELECT COUNT(*) as totalCustomers, COALESCE(SUM(arrears), 0) as totalArrears,
            COALESCE(AVG(arrears), 0) as avgArrears, COALESCE(MAX(arrears), 0) as maxArrears
     FROM VendingCustomers WHERE arrears > 0`,
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, data: results[0] });
    }
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT LOG
// ═══════════════════════════════════════════════════════════════════════════

// GET /vending/audit - Get audit log
router.get('/audit', authenticateToken, (req, res) => {
  const { type, user, from, to, limit = 100, offset = 0 } = req.query;
  let sql = 'SELECT * FROM AuditLog WHERE 1=1';
  const params = [];
  if (type) { sql += ' AND type = ?'; params.push(type); }
  if (user) { sql += ' AND user LIKE ?'; params.push(`%${user}%`); }
  if (from) { sql += ' AND timestamp >= ?'; params.push(from); }
  if (to) { sql += ' AND timestamp <= ?'; params.push(to); }
  sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));
  db.query(sql, params, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    db.query('SELECT COUNT(*) as total FROM AuditLog', (err2, countResult) => {
      res.json({ success: true, data: results || [], total: countResult ? countResult[0].total : 0 });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════════════════════════════════

// GET /vending/reports/daily-sales - Daily sales report
router.get('/reports/daily-sales', authenticateToken, (req, res) => {
  const { from, to } = req.query;
  const dateFrom = from || new Date().toISOString().split('T')[0];
  const dateTo = to || dateFrom;
  db.query(
    `SELECT DATE(dateTime) as date, COUNT(*) as transactions,
            COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as revenue,
            COALESCE(SUM(kWh), 0) as totalKwh,
            COUNT(DISTINCT meterNo) as uniqueMeters
     FROM VendingTransactions
     WHERE DATE(dateTime) BETWEEN ? AND ? AND type = 'Vend' AND status = 'Completed'
     GROUP BY DATE(dateTime) ORDER BY date`,
    [dateFrom, dateTo],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, data: results || [] });
    }
  );
});

// GET /vending/reports/revenue-by-area - Revenue by area
router.get('/reports/revenue-by-area', authenticateToken, (req, res) => {
  db.query(
    `SELECT c.area, COUNT(t.id) as transactions, COALESCE(SUM(t.amount), 0) as revenue,
            COALESCE(SUM(t.kWh), 0) as totalKwh
     FROM VendingTransactions t
     LEFT JOIN VendingCustomers c ON t.meterNo = c.meterNo
     WHERE t.type = 'Vend' AND t.status = 'Completed'
     GROUP BY c.area ORDER BY revenue DESC`,
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, data: results || [] });
    }
  );
});

// GET /vending/reports/vendor-performance - Vendor performance
router.get('/reports/vendor-performance', authenticateToken, (req, res) => {
  db.query(
    `SELECT v.id, v.name, v.commissionRate,
            COUNT(t.id) as transactions, COALESCE(SUM(t.amount), 0) as revenue,
            COALESCE(SUM(t.kWh), 0) as totalKwh,
            COALESCE(SUM(t.amount), 0) * v.commissionRate / 100 as commission
     FROM Vendors v
     LEFT JOIN VendingTransactions t ON v.id = t.vendorId AND t.type = 'Vend' AND t.status = 'Completed'
     GROUP BY v.id ORDER BY revenue DESC`,
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, data: results || [] });
    }
  );
});

// GET /vending/reports/meter-status - Meter status report
router.get('/reports/meter-status', authenticateToken, (req, res) => {
  db.query(
    `SELECT status, COUNT(*) as count FROM VendingCustomers GROUP BY status
     UNION ALL
     SELECT 'Total' as status, COUNT(*) as count FROM VendingCustomers`,
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, data: results || [] });
    }
  );
});

// GET /vending/reports/token-analysis - Token analysis
router.get('/reports/token-analysis', authenticateToken, (req, res) => {
  db.query(
    `SELECT type, status, COUNT(*) as count, COALESCE(SUM(amount), 0) as totalAmount, COALESCE(SUM(kWh), 0) as totalKwh
     FROM VendingTransactions GROUP BY type, status ORDER BY type, status`,
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, data: results || [] });
    }
  );
});

// GET /vending/reports/system-audit - System audit (alias for audit log)
router.get('/reports/system-audit', authenticateToken, (req, res) => {
  const { from, to, limit = 500 } = req.query;
  let sql = 'SELECT * FROM AuditLog WHERE 1=1';
  const params = [];
  if (from) { sql += ' AND timestamp >= ?'; params.push(from); }
  if (to) { sql += ' AND timestamp <= ?'; params.push(to); }
  sql += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(parseInt(limit));
  db.query(sql, params, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, data: results || [] });
  });
});

// GET /vending/dashboard - Dashboard summary for vending
router.get('/dashboard', authenticateToken, (req, res) => {
  const queries = {
    todayRevenue: `SELECT COALESCE(SUM(amount), 0) as val FROM VendingTransactions WHERE DATE(dateTime) = CURDATE() AND type = 'Vend' AND status = 'Completed'`,
    todayTokens: `SELECT COUNT(*) as val FROM VendingTransactions WHERE DATE(dateTime) = CURDATE() AND type = 'Vend' AND status = 'Completed'`,
    monthRevenue: `SELECT COALESCE(SUM(amount), 0) as val FROM VendingTransactions WHERE MONTH(dateTime) = MONTH(CURDATE()) AND YEAR(dateTime) = YEAR(CURDATE()) AND type = 'Vend' AND status = 'Completed'`,
    totalCustomers: `SELECT COUNT(*) as val FROM VendingCustomers`,
    activeCustomers: `SELECT COUNT(*) as val FROM VendingCustomers WHERE status = 'Active'`,
    totalArrears: `SELECT COALESCE(SUM(arrears), 0) as val FROM VendingCustomers WHERE arrears > 0`,
    vendorCount: `SELECT COUNT(*) as val FROM Vendors WHERE status = 'Active'`,
    openBatches: `SELECT COUNT(*) as val FROM SalesBatches WHERE status = 'Open'`,
  };

  const result = {};
  const keys = Object.keys(queries);
  let done = 0;

  keys.forEach(key => {
    db.query(queries[key], (err, rows) => {
      result[key] = err ? 0 : ((rows[0] && rows[0].val) || 0);
      done++;
      if (done === keys.length) {
        // Get weekly sales trend
        db.query(
          `SELECT DAYNAME(dateTime) as day, COALESCE(SUM(amount), 0) as revenue, COUNT(*) as tokens, COALESCE(SUM(kWh), 0) as kWh
           FROM VendingTransactions
           WHERE dateTime >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND type = 'Vend' AND status = 'Completed'
           GROUP BY DAYNAME(dateTime), DAYOFWEEK(dateTime) ORDER BY DAYOFWEEK(dateTime)`,
          (err, trend) => {
            result.salesTrend = trend || [];
            res.json({ success: true, data: result });
          }
        );
      }
    });
  });
});

module.exports = router;
