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
  "  name VARCHAR(100) NOT NULL UNIQUE," +
  "  sgc VARCHAR(20)," +
  "  description TEXT," +
  "  type ENUM('Block','Flat','TOU') DEFAULT 'Block'," +
  "  billingType ENUM('prepaid','postpaid') DEFAULT 'prepaid'," +
  "  flatRate DECIMAL(8,4)," +
  "  peakRate DECIMAL(8,4)," +
  "  standardRate DECIMAL(8,4)," +
  "  offPeakRate DECIMAL(8,4)," +
  "  capacityCharge DECIMAL(8,2)," +
  "  demandCharge DECIMAL(8,2)," +
  "  networkAccessCharge DECIMAL(8,2)," +
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

  // Tariff config (with itemized regulatory levies)
  "CREATE TABLE IF NOT EXISTS TariffConfig (" +
  "  id INT AUTO_INCREMENT PRIMARY KEY," +
  "  vatRate DECIMAL(5,2) DEFAULT 15.00," +
  "  fixedCharge DECIMAL(8,2) DEFAULT 8.50," +
  "  relLevy DECIMAL(8,2) DEFAULT 2.40," +
  "  ecbLevy DECIMAL(8,4) DEFAULT 0.0212," +
  "  nefLevy DECIMAL(8,4) DEFAULT 0.0160," +
  "  laSurcharge DECIMAL(8,4) DEFAULT 0.1200," +
  "  minPurchase DECIMAL(8,2) DEFAULT 5.00," +
  "  arrearsMode ENUM('auto-deduct','manual','disabled') DEFAULT 'auto-deduct'," +
  "  arrearsThreshold DECIMAL(12,2) DEFAULT 500.00," +
  "  arrearsPercentage DECIMAL(5,2) DEFAULT 25.00," +
  "  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP" +
  ")",

  // TOU schedule: defines time periods per tariff group per day
  "CREATE TABLE IF NOT EXISTS TariffTOUSchedule (" +
  "  id INT AUTO_INCREMENT PRIMARY KEY," +
  "  tariffGroupId INT NOT NULL," +
  "  dayOfWeek TINYINT NOT NULL," +
  "  startHour TINYINT NOT NULL," +
  "  endHour TINYINT NOT NULL," +
  "  period VARCHAR(20) NOT NULL," +
  "  INDEX idx_group_day (tariffGroupId, dayOfWeek)" +
  ")",

  // DSM configuration per meter
  "CREATE TABLE IF NOT EXISTS MeterDSMConfig (" +
  "  id INT AUTO_INCREMENT PRIMARY KEY," +
  "  drn VARCHAR(20) NOT NULL UNIQUE," +
  "  dsmEnabled TINYINT(1) DEFAULT 0," +
  "  geyserPeakAction ENUM('off','on','schedule') DEFAULT 'off'," +
  "  geyserScheduleStart TINYINT DEFAULT 17," +
  "  geyserScheduleEnd TINYINT DEFAULT 20," +
  "  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
  "  INDEX idx_drn (drn)" +
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
  // Add regulatory levy columns and tariff group fields if missing
  var levyCols = [
    ["TariffConfig", "ecbLevy", "DECIMAL(8,4) DEFAULT 0.0212"],
    ["TariffConfig", "nefLevy", "DECIMAL(8,4) DEFAULT 0.0160"],
    ["TariffConfig", "laSurcharge", "DECIMAL(8,4) DEFAULT 0.1200"],
    ["TariffGroups", "billingType", "ENUM('prepaid','postpaid') DEFAULT 'prepaid'"],
    ["TariffGroups", "peakRate", "DECIMAL(8,4)"],
    ["TariffGroups", "standardRate", "DECIMAL(8,4)"],
    ["TariffGroups", "offPeakRate", "DECIMAL(8,4)"],
    ["TariffGroups", "capacityCharge", "DECIMAL(8,2)"],
    ["TariffGroups", "demandCharge", "DECIMAL(8,2)"],
    ["TariffGroups", "networkAccessCharge", "DECIMAL(8,2)"],
  ];
  db.query("ALTER TABLE TariffGroups MODIFY COLUMN name VARCHAR(100) NOT NULL", function() {});
  levyCols.forEach(function(c) {
    db.query("SHOW COLUMNS FROM " + c[0] + " LIKE '" + c[1] + "'", function(err, rows) {
      if (!err && (!rows || rows.length === 0)) {
        db.query("ALTER TABLE " + c[0] + " ADD COLUMN " + c[1] + " " + c[2], function(alterErr) {
          if (!alterErr) console.log('[Vending] Added ' + c[0] + '.' + c[1]);
        });
      }
    });
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
      db.query('INSERT INTO TariffConfig (vatRate, fixedCharge, relLevy, ecbLevy, nefLevy, laSurcharge, minPurchase, arrearsMode, arrearsThreshold, arrearsPercentage) VALUES (15, 8.50, 2.40, 0.0212, 0.0160, 0.1200, 5.00, "auto-deduct", 500, 25)');
      console.log('[Vending] Default tariff config seeded');
    }
  });
  db.query('SELECT COUNT(*) as c FROM TariffGroups', function(err, rows) {
    if (!err && rows[0].c === 0) {
      // All 27 official Windhoek 2024 ECB tariff categories
      // [name, sgc, description, type, billingType, flatRate, peakRate, standardRate, offPeakRate, capacityCharge, demandCharge, networkAccessCharge, effectiveDate]
      var windhoekTariffs = [
        ['Business <=75A EL20', 'EL20', 'Business TOU tariff for supply <=75A', 'TOU', 'postpaid', null, 2.67, 2.17, 1.68, null, null, null, '2025-07-01'],
        ['Departmental', 'DEPT', 'Departmental TOU tariff', 'TOU', 'postpaid', null, 2.17, 1.67, 1.18, 22.90, null, null, '2025-07-01'],
        ['Departmental Demand TOU', 'DEPT-D', 'Departmental demand TOU with kVA charges', 'TOU', 'postpaid', null, 2.17, 1.67, 1.18, null, 147.00, 77.00, '2025-07-01'],
        ['Departmental Non-Demand TOU', 'DEPT-ND', 'Departmental non-demand TOU tariff', 'TOU', 'postpaid', null, 2.12, 1.62, 1.13, 22.90, null, null, '2025-07-01'],
        ['Floodlights', 'FLOOD', 'Floodlights flat-rate tariff', 'Flat', 'postpaid', 2.46, null, null, null, null, null, null, '2025-07-01'],
        ['General <=75A', 'GEN75', 'General flat-rate tariff for supply <=75A', 'Flat', 'postpaid', 2.15, null, null, null, 17.40, null, null, '2025-07-01'],
        ['General >75A Flat', 'GEN75F', 'General flat-rate tariff for supply >75A', 'Flat', 'postpaid', 2.15, null, null, null, 26.80, null, null, '2025-07-01'],
        ['General >75A TOU', 'GEN75T', 'General TOU tariff for supply >75A', 'TOU', 'postpaid', null, 2.67, 2.17, 1.68, 26.80, null, null, '2025-07-01'],
        ['General Demand TOU KVA', 'GENDK', 'General demand TOU with kVA charges', 'TOU', 'postpaid', null, 2.67, 2.17, 1.68, null, 147.00, 77.00, '2025-07-01'],
        ['General Prepaid', 'GENPP', 'General prepaid flat-rate tariff', 'Flat', 'prepaid', 3.48, null, null, null, null, null, null, '2025-07-01'],
        ['Industrial Demand TOU KVA', 'INDDK', 'Industrial demand TOU with kVA charges', 'TOU', 'postpaid', null, 2.42, 1.92, 1.43, null, 147.00, 77.00, '2025-07-01'],
        ['Industrial Demand TOU KVA MV', 'INDDM', 'Industrial demand TOU MV with kVA charges', 'TOU', 'postpaid', null, 2.42, 1.92, 1.43, null, 136.00, 71.00, '2025-07-01'],
        ['Industrial Non-Demand TOU', 'INDND', 'Industrial non-demand TOU tariff', 'TOU', 'postpaid', null, 2.35, 1.85, 1.36, 26.80, null, null, '2025-07-01'],
        ['Net Metering Flat', 'NETF', 'Net metering flat-rate for solar customers', 'Flat', 'postpaid', 1.24, null, null, null, null, null, null, '2025-07-01'],
        ['Net Metering TOU', 'NETT', 'Net metering TOU for solar customers', 'TOU', 'postpaid', null, 1.77, 1.32, 0.88, null, null, null, '2025-07-01'],
        ['Old Age Homes Demand', 'OAHD', 'Old age homes demand TOU tariff', 'TOU', 'postpaid', null, 2.04, 1.54, 1.05, null, 93.00, 51.00, '2025-07-01'],
        ['Old Age Homes Non-Demand', 'OAHND', 'Old age homes non-demand flat tariff', 'Flat', 'postpaid', 1.32, null, null, null, 7.40, null, null, '2025-07-01'],
        ['Residential Prepaid', 'RESPP', 'Standard residential prepaid flat-rate tariff', 'Flat', 'prepaid', 2.32, null, null, null, null, null, null, '2025-07-01'],
        ['Residential Up to 20A', 'RES20', 'Residential postpaid up to 20A supply', 'Flat', 'postpaid', 1.57, null, null, null, 10.90, null, null, '2025-07-01'],
        ['Residential with Business Consent', 'RESBC', 'Residential with business consent tariff', 'Flat', 'postpaid', 1.57, null, null, null, 13.20, null, null, '2025-07-01'],
        ['Residential Postpaid Over 20A', 'RES20P', 'Residential postpaid over 20A supply', 'Flat', 'postpaid', 1.57, null, null, null, 13.20, null, null, '2025-07-01'],
        ['Social Prepaid (Pensioner)', 'SOCPP', 'Social/pensioner prepaid with block tariff', 'Block', 'prepaid', null, null, null, null, null, null, null, '2025-07-01'],
        ['Social Services 3 Phase Flat', 'SOC3F', 'Social services 3-phase flat tariff', 'Flat', 'postpaid', 1.45, null, null, null, 27.20, null, null, '2025-07-01'],
        ['Social Services 3 Phase TOU', 'SOC3T', 'Social services 3-phase TOU tariff', 'TOU', 'postpaid', null, 2.35, 1.85, 1.36, 27.20, null, null, '2025-07-01'],
        ['Social Services Demand TOU KVA', 'SOCDK', 'Social services demand TOU with kVA charges', 'TOU', 'postpaid', null, 2.23, 1.73, 1.24, null, 145.00, 68.00, '2025-07-01'],
        ['Social Services Prepaid', 'SOCSP', 'Social services prepaid flat-rate tariff', 'Flat', 'prepaid', 2.41, null, null, null, null, null, null, '2025-07-01'],
        ['Reseller Residential', 'RESEL', 'Reseller residential tariff', 'Flat', 'postpaid', 1.63, null, null, null, 13.80, null, null, '2025-07-01'],
      ];
      var insertSql = 'INSERT INTO TariffGroups (name, sgc, description, type, billingType, flatRate, peakRate, standardRate, offPeakRate, capacityCharge, demandCharge, networkAccessCharge, effectiveDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
      windhoekTariffs.forEach(function(g) {
        db.query(insertSql, g, function(err, result) {
          if (!err) {
            var gid = result.insertId;
            var name = g[0];
            if (g[3] === 'TOU') {
              [
                ['Off-Peak', 'All kWh', g[8], 0, 999999, 'off-peak', 0],
                ['Standard', 'All kWh', g[7], 0, 999999, 'standard', 1],
                ['Peak', 'All kWh', g[6], 0, 999999, 'peak', 2],
              ].forEach(function(b) { db.query('INSERT INTO TariffBlocks (tariffGroupId, name, rangeLabel, rate, minKwh, maxKwh, period, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [gid].concat(b)); });
              // Seed Windhoek 2024 TOU schedule for TOU categories
              for (var d = 1; d <= 5; d++) {
                [[0,6,'off-peak'],[6,7,'standard'],[7,10,'peak'],[10,17,'standard'],[17,21,'peak'],[21,22,'standard'],[22,24,'off-peak']].forEach(function(s) {
                  db.query('INSERT INTO TariffTOUSchedule (tariffGroupId, dayOfWeek, startHour, endHour, period) VALUES (?, ?, ?, ?, ?)', [gid, d, s[0], s[1], s[2]]);
                });
              }
              // Saturday: standard at 7-12 and 18-20, off-peak rest
              [[0,7,'off-peak'],[7,12,'standard'],[12,18,'off-peak'],[18,20,'standard'],[20,24,'off-peak']].forEach(function(s) {
                db.query('INSERT INTO TariffTOUSchedule (tariffGroupId, dayOfWeek, startHour, endHour, period) VALUES (?, ?, ?, ?, ?)', [gid, 6, s[0], s[1], s[2]]);
              });
              // Sunday: all off-peak
              db.query('INSERT INTO TariffTOUSchedule (tariffGroupId, dayOfWeek, startHour, endHour, period) VALUES (?, ?, ?, ?, ?)', [gid, 0, 0, 24, 'off-peak']);
            } else if (name === 'Social Prepaid (Pensioner)') {
              [
                ['Block 1', '0-200 kWh', 1.52, 0, 200, null, 0],
                ['Block 2', '201+ kWh', 2.32, 201, 999999, null, 1],
              ].forEach(function(b) { db.query('INSERT INTO TariffBlocks (tariffGroupId, name, rangeLabel, rate, minKwh, maxKwh, period, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [gid].concat(b)); });
            } else if (g[3] === 'Flat' && g[5]) {
              db.query('INSERT INTO TariffBlocks (tariffGroupId, name, rangeLabel, rate, minKwh, maxKwh, period, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [gid, 'All Usage', '0+ kWh', g[5], 0, 999999, null, 0]);
            }
          }
        });
      });
      console.log('[Vending] All 27 Windhoek 2024 tariff categories seeded');
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

// Search customers across VendingCustomers and MeterProfileReal
router.get('/customers/search/lookup', authenticateToken, function(req, res) {
  var q = req.query.q;
  if (!q || q.trim().length < 2) return res.json({ success: true, data: [] });
  q = q.trim();
  var pattern = '%' + q + '%';

  // Search VendingCustomers first
  db.query(
    'SELECT *, "vending" as source FROM VendingCustomers WHERE meterNo LIKE ? OR name LIKE ? OR accountNo LIKE ? LIMIT 10',
    [pattern, pattern, pattern],
    function(err, vendingResults) {
      if (err) return res.status(500).json({ error: err.message });

      // Also search MeterProfileReal
      db.query(
        "SELECT DRN as meterNo, CONCAT(Name, ' ', Surname) as name, City as area, Region as suburb, StreetName as address, tariff_type as tariffGroup, 'Active' as status, 0 as arrears, 'gridx' as source FROM MeterProfileReal WHERE DRN LIKE ? OR Name LIKE ? OR Surname LIKE ? LIMIT 10",
        [pattern, pattern, pattern],
        function(err2, profileResults) {
          if (err2) return res.status(500).json({ error: err2.message });

          // Merge results, VendingCustomers first, deduplicate by meterNo
          var seen = {};
          var merged = [];
          (vendingResults || []).forEach(function(r) {
            if (!seen[r.meterNo]) { seen[r.meterNo] = true; merged.push(r); }
          });
          (profileResults || []).forEach(function(r) {
            if (!seen[r.meterNo]) { seen[r.meterNo] = true; merged.push(r); }
          });

          res.json({ success: true, data: merged });
        }
      );
    }
  );
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

function getCurrentTOUPeriod(tariffGroupId, callback) {
  var now = new Date();
  var dow = now.getDay(); // 0=Sun
  var hour = now.getHours();
  db.query(
    'SELECT period FROM TariffTOUSchedule WHERE tariffGroupId = ? AND dayOfWeek = ? AND startHour <= ? AND endHour > ? LIMIT 1',
    [tariffGroupId, dow, hour, hour],
    function(err, rows) {
      if (err || !rows || rows.length === 0) return callback(null, 'standard');
      callback(null, rows[0].period);
    }
  );
}

function doVend(meterNo, totalAmount, vendorId, idempotencyKey, req, res) {
  var operatorName = getOperatorName(req);
  var operatorId = getOperatorId(req);

  // Step 1: Get tariff config
  db.query('SELECT * FROM TariffConfig LIMIT 1', function(err, configRows) {
    if (err) return res.status(500).json({ error: err.message });
    var config = (configRows && configRows[0]) || { vatRate: 15, fixedCharge: 8.50, relLevy: 2.40, ecbLevy: 0.0212, nefLevy: 0.0160, laSurcharge: 0.1200, arrearsPercentage: 25, arrearsMode: 'auto-deduct', minPurchase: 5 };

    // Minimum purchase check
    if (totalAmount < parseFloat(config.minPurchase || 5)) {
      return res.status(400).json({ error: 'Amount below minimum purchase of N$' + (config.minPurchase || 5) });
    }

    // Step 2: Look up customer
    lookupCustomer(meterNo, function(custErr, customer) {
      if (custErr) return res.status(404).json({ error: custErr.message });

      // Step 3: Get tariff group and blocks
      var tariffName = customer.tariffGroup || 'Prepaid Residential';
      db.query(
        'SELECT tg.id as groupId, tg.type as groupType, tg.flatRate, tb.* FROM TariffBlocks tb JOIN TariffGroups tg ON tb.tariffGroupId = tg.id WHERE tg.name = ? ORDER BY tb.sortOrder',
        [tariffName],
        function(blkErr, rawBlocks) {
          if (blkErr) return res.status(500).json({ error: blkErr.message });
          if (!rawBlocks || rawBlocks.length === 0) {
            // Fallback: try partial name match
            db.query(
              'SELECT tg.id as groupId, tg.type as groupType, tg.flatRate, tb.* FROM TariffBlocks tb JOIN TariffGroups tg ON tb.tariffGroupId = tg.id WHERE tg.name LIKE ? ORDER BY tb.sortOrder',
              ['%' + tariffName + '%'],
              function(blkErr2, rawBlocks2) {
                if (!rawBlocks2 || rawBlocks2.length === 0) {
                  rawBlocks2 = [{ groupId: 0, groupType: 'Flat', name: 'Default', rate: 1.68, minKwh: 0, maxKwh: 999999 }];
                }
                processVend(rawBlocks2);
              }
            );
            return;
          }
          processVend(rawBlocks);
        }
      );

      function processVend(rawBlocks) {
        var groupType = rawBlocks[0].groupType || 'Block';
        var groupId = rawBlocks[0].groupId;

        function doCalc(blocks, touPeriod) {
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

          // Calculate kWh based on tariff type
          var remainingAmount = energyAmount;
          var totalKwh = 0;
          var blockBreakdown = [];

          if (groupType === 'TOU') {
            // TOU: use the rate for the current period
            var touBlock = blocks.find(function(b) { return b.period === touPeriod; }) || blocks[0];
            var rate = parseFloat(touBlock.rate);
            totalKwh = round2(remainingAmount / rate);
            blockBreakdown.push({
              block: touBlock.name + ' (' + (touPeriod || 'standard').toUpperCase() + ')',
              rate: rate,
              kWh: totalKwh,
              amount: round2(remainingAmount),
              period: touPeriod
            });
          } else if (groupType === 'Flat') {
            var flatRate = parseFloat(blocks[0].rate) || parseFloat(rawBlocks[0].flatRate) || 2.45;
            totalKwh = round2(remainingAmount / flatRate);
            blockBreakdown.push({
              block: blocks[0].name || 'Flat Rate',
              rate: flatRate,
              kWh: totalKwh,
              amount: round2(remainingAmount)
            });
          } else {
            // Block tariff (inclining)
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
          }

          // Compute per-kWh regulatory levies
          var ecbLevyAmount = round2(totalKwh * parseFloat(config.ecbLevy || 0));
          var nefLevyAmount = round2(totalKwh * parseFloat(config.nefLevy || 0));
          var laSurchargeAmount = round2(totalKwh * parseFloat(config.laSurcharge || 0));

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

                    // 4. ECB levy line item (per kWh)
                    if (ecbLevyAmount > 0) {
                      lineItems.push([txnId, refNo, 'REL_LEVY', 'ECB Levy @ N$' + parseFloat(config.ecbLevy).toFixed(4) + '/kWh x ' + totalKwh + ' kWh', ecbLevyAmount, totalKwh, parseFloat(config.ecbLevy), meterNo]);
                    }

                    // 5. NEF levy line item (per kWh)
                    if (nefLevyAmount > 0) {
                      lineItems.push([txnId, refNo, 'REL_LEVY', 'NEF Levy @ N$' + parseFloat(config.nefLevy).toFixed(4) + '/kWh x ' + totalKwh + ' kWh', nefLevyAmount, totalKwh, parseFloat(config.nefLevy), meterNo]);
                    }

                    // 6. LA Surcharge line item (per kWh)
                    if (laSurchargeAmount > 0) {
                      lineItems.push([txnId, refNo, 'REL_LEVY', 'LA Surcharge @ N$' + parseFloat(config.laSurcharge).toFixed(4) + '/kWh x ' + totalKwh + ' kWh', laSurchargeAmount, totalKwh, parseFloat(config.laSurcharge), meterNo]);
                    }

                    // 7. Arrears line item (only if applicable)
                    if (arrearsDeducted > 0) {
                      lineItems.push([txnId, refNo, 'ARREARS', 'Arrears deduction (' + config.arrearsPercentage + '% of N$' + afterVat.toFixed(2) + ')', arrearsDeducted, 0, parseFloat(config.arrearsPercentage), meterNo]);
                    }

                    // 8. Energy line items (one per tariff block used)
                    for (var j = 0; j < blockBreakdown.length; j++) {
                      var bb = blockBreakdown[j];
                      lineItems.push([txnId, refNo, 'ENERGY', 'Energy: ' + bb.block + ' @ N$' + bb.rate.toFixed(4) + '/kWh', bb.amount, bb.kWh, bb.rate, meterNo]);
                    }

                    // 9. Commission line item (if vendor)
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

                    // Return success with full Windhoek-compliant breakdown
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
                        tariffType: groupType,
                        touPeriod: touPeriod || null,
                        breakdown: {
                          totalAmount: totalAmount,
                          vatAmount: vatAmount,
                          vatRate: parseFloat(config.vatRate),
                          fixedCharge: fixedCharge,
                          relLevy: relLevy,
                          ecbLevy: ecbLevyAmount,
                          nefLevy: nefLevyAmount,
                          laSurcharge: laSurchargeAmount,
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
        } // end doCalc

        // Resolve TOU period if applicable, then calculate
        if (groupType === 'TOU') {
          getCurrentTOUPeriod(groupId, function(err, period) {
            doCalc(rawBlocks, period);
          });
        } else {
          doCalc(rawBlocks, null);
        }
      } // end processVend
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
  var fields = ['vatRate', 'fixedCharge', 'relLevy', 'ecbLevy', 'nefLevy', 'laSurcharge', 'minPurchase', 'arrearsMode', 'arrearsThreshold', 'arrearsPercentage'];
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
    'INSERT INTO TariffGroups (name, sgc, description, type, billingType, flatRate, peakRate, standardRate, offPeakRate, capacityCharge, demandCharge, networkAccessCharge, effectiveDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [b.name, b.sgc, b.description, b.type || 'Block', b.billingType || 'prepaid', b.flatRate, b.peakRate, b.standardRate, b.offPeakRate, b.capacityCharge, b.demandCharge, b.networkAccessCharge, b.effectiveDate],
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
    'UPDATE TariffGroups SET name = COALESCE(?, name), sgc = COALESCE(?, sgc), description = COALESCE(?, description), type = COALESCE(?, type), billingType = COALESCE(?, billingType), flatRate = COALESCE(?, flatRate), peakRate = COALESCE(?, peakRate), standardRate = COALESCE(?, standardRate), offPeakRate = COALESCE(?, offPeakRate), capacityCharge = COALESCE(?, capacityCharge), demandCharge = COALESCE(?, demandCharge), networkAccessCharge = COALESCE(?, networkAccessCharge), effectiveDate = COALESCE(?, effectiveDate) WHERE id = ?',
    [b.name, b.sgc, b.description, b.type, b.billingType, b.flatRate, b.peakRate, b.standardRate, b.offPeakRate, b.capacityCharge, b.demandCharge, b.networkAccessCharge, b.effectiveDate, req.params.id],
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


// Delete tariff group
router.delete('/tariffs/groups/:id', authenticateToken, function(req, res) {
  db.query('DELETE FROM TariffBlocks WHERE tariffGroupId = ?', [req.params.id], function() {
    db.query('DELETE FROM TariffTOUSchedule WHERE tariffGroupId = ?', [req.params.id], function() {
      db.query('DELETE FROM TariffGroups WHERE id = ?', [req.params.id], function(err, result) {
        if (err) return res.status(500).json({ error: err.message });
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Tariff group not found' });
        logAudit('Tariff group deleted: ' + req.params.id, 'DELETE', '', getOperatorName(req), getOperatorId(req), req.ip);
        res.json({ success: true });
      });
    });
  });
});


// Re-seed Windhoek 2024 tariff categories
router.post('/tariffs/seed-windhoek', authenticateToken, function(req, res) {
  seedDefaults();
  logAudit('Windhoek 2024 tariffs re-seeded', 'SYSTEM', '', getOperatorName(req), getOperatorId(req), req.ip);
  res.json({ success: true, message: 'Windhoek 2024 tariff categories seeded (27 categories). Existing categories not affected.' });
});

// ═══════════════════════════════════════════════════════════════════════════
// TOU SCHEDULES
// ═══════════════════════════════════════════════════════════════════════════

// Get TOU schedule for a tariff group
router.get('/tariffs/groups/:id/tou-schedule', authenticateToken, function(req, res) {
  db.query('SELECT * FROM TariffTOUSchedule WHERE tariffGroupId = ? ORDER BY dayOfWeek, startHour', [req.params.id], function(err, results) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, data: results || [] });
  });
});

// Set TOU schedule for a tariff group (replaces entire schedule)
router.put('/tariffs/groups/:id/tou-schedule', authenticateToken, function(req, res) {
  var schedule = req.body.schedule;
  if (!schedule || !Array.isArray(schedule)) return res.status(400).json({ error: 'schedule array is required' });

  db.query('DELETE FROM TariffTOUSchedule WHERE tariffGroupId = ?', [req.params.id], function(delErr) {
    if (delErr) return res.status(500).json({ error: delErr.message });

    if (schedule.length === 0) return res.json({ success: true, inserted: 0 });

    var values = schedule.map(function(s) {
      return [req.params.id, s.dayOfWeek, s.startHour, s.endHour, s.period];
    });

    var sql = 'INSERT INTO TariffTOUSchedule (tariffGroupId, dayOfWeek, startHour, endHour, period) VALUES ?';
    db.query(sql, [values], function(err, result) {
      if (err) return res.status(500).json({ error: err.message });
      logAudit('TOU schedule updated for group ' + req.params.id, 'UPDATE', schedule.length + ' periods', getOperatorName(req), getOperatorId(req), req.ip);
      res.json({ success: true, inserted: result.affectedRows });
    });
  });
});

// Get current TOU period for a tariff group
router.get('/tariffs/groups/:id/current-period', authenticateToken, function(req, res) {
  getCurrentTOUPeriod(parseInt(req.params.id), function(err, period) {
    res.json({ success: true, data: { period: period, timestamp: new Date().toISOString() } });
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// PUSH TARIFF TO METERS (via MQTT)
// ═══════════════════════════════════════════════════════════════════════════

var mqttHandler;
try { mqttHandler = require('../services/mqttHandler'); } catch(e) { mqttHandler = null; }

// Push tariff config to a specific meter
router.post('/tariffs/push/:drn', authenticateToken, function(req, res) {
  if (!mqttHandler) return res.status(500).json({ error: 'MQTT handler not available' });

  var drn = req.params.drn;
  var tariffGroupName = req.body.tariffGroup;

  if (!tariffGroupName) return res.status(400).json({ error: 'tariffGroup name is required' });

  // Lookup the group and its blocks
  db.query(
    'SELECT tg.id, tg.type, tg.flatRate, tb.rate, tb.period, tb.sortOrder FROM TariffGroups tg LEFT JOIN TariffBlocks tb ON tb.tariffGroupId = tg.id WHERE tg.name = ? ORDER BY tb.sortOrder',
    [tariffGroupName],
    function(err, rows) {
      if (err) return res.status(500).json({ error: err.message });
      if (!rows || rows.length === 0) return res.status(404).json({ error: 'Tariff group not found' });

      var groupType = rows[0].type;
      var command;

      if (groupType === 'TOU') {
        // Send TOU mode with rates per period
        var rates = {};
        rows.forEach(function(r) { if (r.period) rates[r.period] = parseFloat(r.rate); });
        command = {
          type: 'tou_config',
          mode: 'tou',
          rates: rates,
          group: tariffGroupName
        };
        // Also send the schedule
        db.query('SELECT dayOfWeek, startHour, endHour, period FROM TariffTOUSchedule WHERE tariffGroupId = ? ORDER BY dayOfWeek, startHour', [rows[0].id], function(schErr, schedule) {
          if (!schErr && schedule && schedule.length > 0) {
            command.schedule = schedule;
          }
          try {
            mqttHandler.publishCommand(drn, command, 1);
            logAudit('TOU tariff pushed to meter ' + drn, 'UPDATE', 'Group: ' + tariffGroupName, getOperatorName(req), getOperatorId(req), req.ip);
            res.json({ success: true, command: command });
          } catch(e) {
            res.status(500).json({ error: e.message });
          }
        });
        return;
      }

      // Flat or Block mode
      if (groupType === 'Flat') {
        command = {
          type: 'tou_config',
          mode: 'flat',
          rate: parseFloat(rows[0].flatRate || rows[0].rate),
          group: tariffGroupName
        };
      } else {
        command = {
          type: 'tou_config',
          mode: 'flat',
          rate: parseFloat(rows[0].rate),
          group: tariffGroupName
        };
      }

      try {
        mqttHandler.publishCommand(drn, command, 1);
        logAudit('Tariff pushed to meter ' + drn, 'UPDATE', 'Group: ' + tariffGroupName + ', Mode: ' + command.mode, getOperatorName(req), getOperatorId(req), req.ip);
        res.json({ success: true, command: command });
      } catch(e) {
        res.status(500).json({ error: e.message });
      }
    }
  );
});

// Push tariff to ALL meters of a type
router.post('/tariffs/push-all', authenticateToken, function(req, res) {
  if (!mqttHandler) return res.status(500).json({ error: 'MQTT handler not available' });

  var tariffGroupName = req.body.tariffGroup;
  if (!tariffGroupName) return res.status(400).json({ error: 'tariffGroup name is required' });

  db.query('SELECT DRN FROM MeterProfileReal WHERE tariff_type = ? OR tariff_type IS NULL', [tariffGroupName], function(err, meters) {
    if (err) return res.status(500).json({ error: err.message });
    if (!meters || meters.length === 0) return res.json({ success: true, pushed: 0, message: 'No meters found for this tariff group' });

    var pushed = 0;
    var errors = [];
    meters.forEach(function(m) {
      // For each meter, call the push endpoint internally
      db.query(
        'SELECT tg.type, tg.flatRate, tb.rate FROM TariffGroups tg LEFT JOIN TariffBlocks tb ON tb.tariffGroupId = tg.id WHERE tg.name = ? ORDER BY tb.sortOrder LIMIT 1',
        [tariffGroupName],
        function(err2, rows) {
          if (err2 || !rows || rows.length === 0) {
            errors.push(m.DRN);
            return;
          }
          var rate = parseFloat(rows[0].flatRate || rows[0].rate);
          try {
            mqttHandler.publishCommand(m.DRN, { type: 'tou_config', mode: rows[0].type === 'TOU' ? 'tou' : 'flat', rate: rate, group: tariffGroupName }, 1);
            pushed++;
          } catch(e) {
            errors.push(m.DRN);
          }
        }
      );
    });

    setTimeout(function() {
      logAudit('Bulk tariff push: ' + tariffGroupName, 'UPDATE', 'Pushed to ' + pushed + '/' + meters.length + ' meters', getOperatorName(req), getOperatorId(req), req.ip);
      res.json({ success: true, pushed: pushed, total: meters.length, errors: errors });
    }, 500);
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// DSM CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

// Get DSM config for a meter
router.get('/dsm/:drn', authenticateToken, function(req, res) {
  db.query('SELECT * FROM MeterDSMConfig WHERE drn = ?', [req.params.drn], function(err, results) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, data: (results && results[0]) || { drn: req.params.drn, dsmEnabled: 0, geyserPeakAction: 'off' } });
  });
});

// Get DSM config for all meters
router.get('/dsm', authenticateToken, function(req, res) {
  db.query('SELECT d.*, m.Name, m.Surname, m.City FROM MeterDSMConfig d LEFT JOIN MeterProfileReal m ON d.drn = m.DRN ORDER BY d.drn', function(err, results) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, data: results || [] });
  });
});

// Update DSM config for a meter
router.put('/dsm/:drn', authenticateToken, function(req, res) {
  var b = req.body;
  var drn = req.params.drn;
  db.query(
    'INSERT INTO MeterDSMConfig (drn, dsmEnabled, geyserPeakAction, geyserScheduleStart, geyserScheduleEnd) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE dsmEnabled = VALUES(dsmEnabled), geyserPeakAction = VALUES(geyserPeakAction), geyserScheduleStart = VALUES(geyserScheduleStart), geyserScheduleEnd = VALUES(geyserScheduleEnd)',
    [drn, b.dsmEnabled ? 1 : 0, b.geyserPeakAction || 'off', b.geyserScheduleStart || 17, b.geyserScheduleEnd || 20],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });

      // Push DSM config to meter via MQTT
      if (mqttHandler) {
        try {
          mqttHandler.publishCommand(drn, {
            type: 'tou_dsm',
            enabled: b.dsmEnabled ? 1 : 0,
            peak_action: b.geyserPeakAction || 'off',
            start_hour: b.geyserScheduleStart || 17,
            end_hour: b.geyserScheduleEnd || 20
          }, 1);
        } catch(e) {
          console.error('[DSM] MQTT push error:', e.message);
        }
      }

      logAudit('DSM config updated for ' + drn, 'UPDATE', 'Enabled: ' + (b.dsmEnabled ? 'Yes' : 'No') + ', Geyser: ' + (b.geyserPeakAction || 'off'), getOperatorName(req), getOperatorId(req), req.ip);
      res.json({ success: true });
    }
  );
});


// ═══════════════════════════════════════════════════════════════════════════
// MOBILE APP — TARIFF INFO & TOKEN PREVIEW
// ═══════════════════════════════════════════════════════════════════════════

router.get('/tariff-info/:drn', authenticateToken, function(req, res) {
  var drn = req.params.drn;
  lookupCustomer(drn, function(custErr, customer) {
    var tariffName = (customer && customer.tariffGroup) || 'Residential Prepaid';

    db.query('SELECT * FROM TariffConfig LIMIT 1', function(err, configRows) {
      if (err) return res.status(500).json({ error: err.message });
      var config = (configRows && configRows[0]) || {};

      db.query(
        'SELECT tg.*, GROUP_CONCAT(tb.name ORDER BY tb.sortOrder) as blockNames, GROUP_CONCAT(tb.rate ORDER BY tb.sortOrder) as blockRates FROM TariffGroups tg LEFT JOIN TariffBlocks tb ON tb.tariffGroupId = tg.id WHERE tg.name = ? GROUP BY tg.id',
        [tariffName],
        function(tgErr, tgRows) {
          if (tgErr) return res.status(500).json({ error: tgErr.message });
          var tariffGroup = (tgRows && tgRows[0]) || null;

          if (!tariffGroup) {
            db.query(
              'SELECT tg.*, GROUP_CONCAT(tb.name ORDER BY tb.sortOrder) as blockNames, GROUP_CONCAT(tb.rate ORDER BY tb.sortOrder) as blockRates FROM TariffGroups tg LEFT JOIN TariffBlocks tb ON tb.tariffGroupId = tg.id WHERE tg.name LIKE ? GROUP BY tg.id LIMIT 1',
              ['%' + tariffName + '%'],
              function(e2, r2) {
                tariffGroup = (r2 && r2[0]) || null;
                finishTariffInfo();
              }
            );
          } else {
            finishTariffInfo();
          }

          function finishTariffInfo() {
            var now = new Date();
            var dow = now.getDay();
            var hour = now.getHours();
            var currentPeriod = 'standard';
            var nextPeriodChange = null;

            if (tariffGroup && tariffGroup.type === 'TOU') {
              db.query(
                'SELECT * FROM TariffTOUSchedule WHERE tariffGroupId = ? ORDER BY dayOfWeek, startHour',
                [tariffGroup.id],
                function(sErr, schedule) {
                  if (!sErr && schedule && schedule.length > 0) {
                    var currentSlot = schedule.find(function(s) {
                      return s.dayOfWeek === dow && s.startHour <= hour && s.endHour > hour;
                    });
                    if (currentSlot) currentPeriod = currentSlot.period;

                    var nextSlot = schedule.find(function(s) {
                      return (s.dayOfWeek === dow && s.startHour > hour) ||
                             (s.dayOfWeek > dow) ||
                             (s.dayOfWeek === 0 && dow === 6);
                    });
                    if (nextSlot) {
                      var hoursUntil = nextSlot.startHour - hour;
                      if (nextSlot.dayOfWeek !== dow) hoursUntil += (nextSlot.dayOfWeek - dow) * 24;
                      if (hoursUntil < 0) hoursUntil += 168;
                      nextPeriodChange = {
                        period: nextSlot.period,
                        hoursUntil: hoursUntil,
                        startHour: nextSlot.startHour
                      };
                    }
                  }
                  sendResponse();
                }
              );
            } else {
              sendResponse();
            }

            function sendResponse() {
              var currentRate = 0;
              if (tariffGroup) {
                if (tariffGroup.type === 'TOU') {
                  if (currentPeriod === 'peak') currentRate = parseFloat(tariffGroup.peakRate || 0);
                  else if (currentPeriod === 'off-peak') currentRate = parseFloat(tariffGroup.offPeakRate || 0);
                  else currentRate = parseFloat(tariffGroup.standardRate || 0);
                } else if (tariffGroup.type === 'Flat') {
                  currentRate = parseFloat(tariffGroup.flatRate || 0);
                }
              }

              res.json({
                success: true,
                data: {
                  drn: drn,
                  tariffGroup: tariffGroup ? {
                    id: tariffGroup.id,
                    name: tariffGroup.name,
                    sgc: tariffGroup.sgc,
                    description: tariffGroup.description,
                    type: tariffGroup.type,
                    billingType: tariffGroup.billingType,
                    flatRate: tariffGroup.flatRate,
                    peakRate: tariffGroup.peakRate,
                    standardRate: tariffGroup.standardRate,
                    offPeakRate: tariffGroup.offPeakRate,
                    effectiveDate: tariffGroup.effectiveDate
                  } : null,
                  currentRate: currentRate,
                  currentPeriod: currentPeriod,
                  nextPeriodChange: nextPeriodChange,
                  config: {
                    vatRate: config.vatRate,
                    fixedCharge: config.fixedCharge,
                    ecbLevy: config.ecbLevy,
                    nefLevy: config.nefLevy,
                    laSurcharge: config.laSurcharge,
                    relLevy: config.relLevy
                  }
                }
              });
            }
          }
        }
      );
    });
  });
});

router.post('/token-preview', authenticateToken, function(req, res) {
  var meterNo = req.body.meterNo;
  var totalAmount = parseFloat(req.body.amount);

  if (!meterNo || !totalAmount || totalAmount <= 0) {
    return res.status(400).json({ error: 'meterNo and positive amount are required' });
  }

  db.query('SELECT * FROM TariffConfig LIMIT 1', function(err, configRows) {
    if (err) return res.status(500).json({ error: err.message });
    var config = (configRows && configRows[0]) || { vatRate: 15, fixedCharge: 8.50, relLevy: 2.40, ecbLevy: 0.0212, nefLevy: 0.0160, laSurcharge: 0.1200, arrearsPercentage: 25, arrearsMode: 'auto-deduct', minPurchase: 5 };

    lookupCustomer(meterNo, function(custErr, customer) {
      var tariffName = (customer && customer.tariffGroup) || 'Residential Prepaid';
      var customerArrears = (customer && parseFloat(customer.arrears)) || 0;

      db.query(
        'SELECT tg.id as groupId, tg.type as groupType, tg.flatRate, tg.peakRate, tg.standardRate, tg.offPeakRate, tb.* FROM TariffBlocks tb JOIN TariffGroups tg ON tb.tariffGroupId = tg.id WHERE tg.name = ? ORDER BY tb.sortOrder',
        [tariffName],
        function(blkErr, rawBlocks) {
          if (!rawBlocks || rawBlocks.length === 0) {
            db.query(
              'SELECT tg.id as groupId, tg.type as groupType, tg.flatRate, tg.peakRate, tg.standardRate, tg.offPeakRate, tb.* FROM TariffBlocks tb JOIN TariffGroups tg ON tb.tariffGroupId = tg.id WHERE tg.name LIKE ? ORDER BY tb.sortOrder',
              ['%' + tariffName + '%'],
              function(e2, r2) {
                if (!r2 || r2.length === 0) {
                  r2 = [{ groupId: 0, groupType: 'Flat', name: 'Default', rate: 2.32, minKwh: 0, maxKwh: 999999 }];
                }
                calcPreview(r2);
              }
            );
            return;
          }
          calcPreview(rawBlocks);
        }
      );

      function calcPreview(rawBlocks) {
        var groupType = rawBlocks[0].groupType || 'Flat';
        var groupId = rawBlocks[0].groupId;

        function doCalc(blocks, touPeriod) {
          var vatRate = parseFloat(config.vatRate) / 100;
          var vatAmount = round2(totalAmount - (totalAmount / (1 + vatRate)));
          var afterVat = round2(totalAmount - vatAmount);
          var fixedCharge = round2(parseFloat(config.fixedCharge));
          var relLevy = round2(parseFloat(config.relLevy));

          var arrearsDeducted = 0;
          if (config.arrearsMode === 'auto-deduct' && customerArrears > 0) {
            arrearsDeducted = round2(Math.min(customerArrears, afterVat * (parseFloat(config.arrearsPercentage) / 100)));
          }

          var energyAmount = round2(afterVat - fixedCharge - relLevy - arrearsDeducted);
          if (energyAmount <= 0) {
            return res.status(400).json({ error: 'Amount too low after deductions' });
          }

          var totalKwh = 0;
          var blockBreakdown = [];

          if (groupType === 'TOU') {
            var touBlock = blocks.find(function(b) { return b.period === touPeriod; }) || blocks[0];
            var rate = parseFloat(touBlock.rate);
            totalKwh = round2(energyAmount / rate);
            blockBreakdown.push({ block: touBlock.name + ' (' + (touPeriod || 'standard').toUpperCase() + ')', rate: rate, kWh: totalKwh, amount: round2(energyAmount) });
          } else if (groupType === 'Flat') {
            var flatRate = parseFloat(blocks[0].rate) || parseFloat(rawBlocks[0].flatRate) || 2.32;
            totalKwh = round2(energyAmount / flatRate);
            blockBreakdown.push({ block: 'Flat Rate', rate: flatRate, kWh: totalKwh, amount: round2(energyAmount) });
          } else {
            var remaining = energyAmount;
            for (var i = 0; i < blocks.length && remaining > 0; i++) {
              var block = blocks[i];
              var blockRange = (parseFloat(block.maxKwh) || 999999) - (parseFloat(block.minKwh) || 0);
              var blockCost = blockRange * parseFloat(block.rate);
              var usedAmount = Math.min(remaining, blockCost);
              var usedKwh = usedAmount / parseFloat(block.rate);
              totalKwh += usedKwh;
              remaining -= usedAmount;
              blockBreakdown.push({ block: block.name, rate: parseFloat(block.rate), kWh: round2(usedKwh), amount: round2(usedAmount) });
            }
            totalKwh = round2(totalKwh);
          }

          var ecbLevyAmount = round2(totalKwh * parseFloat(config.ecbLevy || 0));
          var nefLevyAmount = round2(totalKwh * parseFloat(config.nefLevy || 0));
          var laSurchargeAmount = round2(totalKwh * parseFloat(config.laSurcharge || 0));

          res.json({
            success: true,
            data: {
              totalAmount: totalAmount,
              tariffGroup: tariffName,
              tariffType: groupType,
              currentPeriod: touPeriod || null,
              breakdown: {
                vatAmount: vatAmount,
                vatRate: parseFloat(config.vatRate),
                fixedCharge: fixedCharge,
                relLevy: relLevy,
                arrearsDeducted: arrearsDeducted,
                ecbLevy: ecbLevyAmount,
                ecbLevyRate: parseFloat(config.ecbLevy || 0),
                nefLevy: nefLevyAmount,
                nefLevyRate: parseFloat(config.nefLevy || 0),
                laSurcharge: laSurchargeAmount,
                laSurchargeRate: parseFloat(config.laSurcharge || 0),
                energyAmount: energyAmount,
                totalKwh: totalKwh,
                blocks: blockBreakdown
              }
            }
          });
        }

        if (groupType === 'TOU') {
          getCurrentTOUPeriod(groupId, function(err, period) {
            doCalc(rawBlocks, period);
          });
        } else {
          doCalc(rawBlocks, null);
        }
      }
    });
  });
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
