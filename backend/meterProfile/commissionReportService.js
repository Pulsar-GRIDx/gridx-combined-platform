const db = require('../config/db');

// Create the commission reports table if it doesn't exist
const createTableSQL = `
CREATE TABLE IF NOT EXISTS MeterCommissionReport (
  id INT AUTO_INCREMENT PRIMARY KEY,
  DRN VARCHAR(50) NOT NULL,
  report_type ENUM('measurement', 'load', 'api', 'auto_calibration', 'full_system', 'commissioning') NOT NULL,
  overall_passed BOOLEAN NOT NULL DEFAULT FALSE,

  -- Measurement test fields
  voltage_expected DOUBLE NULL,
  voltage_measured DOUBLE NULL,
  voltage_error DOUBLE NULL,
  voltage_passed BOOLEAN NULL,
  current_expected DOUBLE NULL,
  current_measured DOUBLE NULL,
  current_error DOUBLE NULL,
  current_passed BOOLEAN NULL,
  power_expected DOUBLE NULL,
  power_measured DOUBLE NULL,
  power_error DOUBLE NULL,
  power_passed BOOLEAN NULL,
  sample_count INT NULL,
  attempts INT NULL,

  -- Load test fields
  load_off_current DOUBLE NULL,
  load_off_passed BOOLEAN NULL,
  load_on_current DOUBLE NULL,
  load_on_passed BOOLEAN NULL,

  -- API test fields
  api_tests_passed INT NULL,
  api_tests_total INT NULL,

  -- Full system test fields
  measurement_test_passed BOOLEAN NULL,
  load_test_passed BOOLEAN NULL,
  api_test_passed BOOLEAN NULL,

  -- Commissioning fields
  sim_number VARCHAR(20) NULL,
  region VARCHAR(100) NULL,
  sub_region VARCHAR(100) NULL,
  area VARCHAR(255) NULL,
  gps_latitude DOUBLE NULL,
  gps_longitude DOUBLE NULL,
  street_name VARCHAR(200) NULL,
  erf_number VARCHAR(50) NULL,
  owner_name VARCHAR(100) NULL,
  owner_surname VARCHAR(100) NULL,
  owner_phone VARCHAR(20) NULL,
  owner_email VARCHAR(100) NULL,
  firmware_version VARCHAR(20) NULL,
  nextion_connected BOOLEAN NULL,
  gsm_registered BOOLEAN NULL,

  -- Raw report data (JSON)
  report_data JSON NULL,

  -- Metadata
  tester_app_version VARCHAR(20) NULL,
  date_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_drn (DRN),
  INDEX idx_drn_type (DRN, report_type),
  INDEX idx_date (date_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

// Initialize table on module load
db.query(createTableSQL, (err) => {
  if (err) {
    console.error('Failed to create MeterCommissionReport table:', err.message);
  } else {
    console.log('MeterCommissionReport table ready');
  }
});

// Migration: add commissioning columns if they don't exist
const migrationColumns = [
  "ALTER TABLE MeterCommissionReport MODIFY COLUMN report_type ENUM('measurement', 'load', 'api', 'auto_calibration', 'full_system', 'commissioning') NOT NULL",
  "ALTER TABLE MeterCommissionReport ADD COLUMN sim_number VARCHAR(20) NULL AFTER api_test_passed",
  "ALTER TABLE MeterCommissionReport ADD COLUMN region VARCHAR(100) NULL AFTER sim_number",
  "ALTER TABLE MeterCommissionReport ADD COLUMN sub_region VARCHAR(100) NULL AFTER region",
  "ALTER TABLE MeterCommissionReport ADD COLUMN area VARCHAR(255) NULL AFTER sub_region",
  "ALTER TABLE MeterCommissionReport ADD COLUMN gps_latitude DOUBLE NULL AFTER area",
  "ALTER TABLE MeterCommissionReport ADD COLUMN gps_longitude DOUBLE NULL AFTER gps_latitude",
  "ALTER TABLE MeterCommissionReport ADD COLUMN street_name VARCHAR(200) NULL AFTER gps_longitude",
  "ALTER TABLE MeterCommissionReport ADD COLUMN erf_number VARCHAR(50) NULL AFTER street_name",
  "ALTER TABLE MeterCommissionReport ADD COLUMN owner_name VARCHAR(100) NULL AFTER erf_number",
  "ALTER TABLE MeterCommissionReport ADD COLUMN owner_surname VARCHAR(100) NULL AFTER owner_name",
  "ALTER TABLE MeterCommissionReport ADD COLUMN owner_phone VARCHAR(20) NULL AFTER owner_surname",
  "ALTER TABLE MeterCommissionReport ADD COLUMN owner_email VARCHAR(100) NULL AFTER owner_phone",
  "ALTER TABLE MeterCommissionReport ADD COLUMN firmware_version VARCHAR(20) NULL AFTER owner_email",
  "ALTER TABLE MeterCommissionReport ADD COLUMN nextion_connected BOOLEAN NULL AFTER firmware_version",
  "ALTER TABLE MeterCommissionReport ADD COLUMN gsm_registered BOOLEAN NULL AFTER nextion_connected",
  "ALTER TABLE MeterCommissionReport ADD COLUMN report_data JSON NULL AFTER gsm_registered",
  "ALTER TABLE MeterCommissionReport ADD COLUMN tester_app_version VARCHAR(20) NULL AFTER report_data",
];

migrationColumns.forEach(sql => {
  db.query(sql, (err) => {
    if (err && !err.message.includes('Duplicate column')) {
      // Silently ignore duplicate column errors
      if (!err.message.includes('duplicate') && !err.message.includes('Duplicate')) {
        console.log('Migration note:', err.message);
      }
    }
  });
});

// Save a commission report
exports.saveReport = (reportData) => {
  const sql = `INSERT INTO MeterCommissionReport SET ?`;
  return new Promise((resolve, reject) => {
    db.query(sql, reportData, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
};

// Get all commission reports for a meter (newest first)
exports.getReportsByDRN = (DRN) => {
  const sql = `SELECT * FROM MeterCommissionReport WHERE DRN = ? ORDER BY date_time DESC`;
  return new Promise((resolve, reject) => {
    db.query(sql, [DRN], (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
};

// Get latest commission report for a meter
exports.getLatestReportByDRN = (DRN) => {
  const sql = `SELECT * FROM MeterCommissionReport WHERE DRN = ? ORDER BY date_time DESC LIMIT 1`;
  return new Promise((resolve, reject) => {
    db.query(sql, [DRN], (err, results) => {
      if (err) reject(err);
      else resolve(results.length > 0 ? results[0] : null);
    });
  });
};

// Get a single report by ID
exports.getReportById = (id) => {
  const sql = `SELECT * FROM MeterCommissionReport WHERE id = ?`;
  return new Promise((resolve, reject) => {
    db.query(sql, [id], (err, results) => {
      if (err) reject(err);
      else resolve(results.length > 0 ? results[0] : null);
    });
  });
};
