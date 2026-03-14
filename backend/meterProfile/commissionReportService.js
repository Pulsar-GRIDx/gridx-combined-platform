const db = require('../config/db');

// Create the commission reports table if it doesn't exist
const createTableSQL = `
CREATE TABLE IF NOT EXISTS MeterCommissionReport (
  id INT AUTO_INCREMENT PRIMARY KEY,
  DRN VARCHAR(50) NOT NULL,
  report_type ENUM('measurement', 'load', 'api', 'auto_calibration', 'full_system') NOT NULL,
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
