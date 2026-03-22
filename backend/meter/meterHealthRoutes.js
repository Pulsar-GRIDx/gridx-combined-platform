const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Create health table if it doesn't exist
const createTableSQL = `
CREATE TABLE IF NOT EXISTS meter_health (
  id INT AUTO_INCREMENT PRIMARY KEY,
  drn VARCHAR(50) NOT NULL,
  health_score TINYINT UNSIGNED DEFAULT 0,
  uart_errors INT UNSIGNED DEFAULT 0,
  relay_mismatches INT UNSIGNED DEFAULT 0,
  power_anomalies INT UNSIGNED DEFAULT 0,
  voltage DECIMAL(8,3) DEFAULT 0,
  current_a DECIMAL(8,3) DEFAULT 0,
  active_power DECIMAL(10,3) DEFAULT 0,
  frequency DECIMAL(6,3) DEFAULT 0,
  power_factor DECIMAL(5,2) DEFAULT 0,
  temperature DECIMAL(5,1) DEFAULT 0,
  mains_state TINYINT DEFAULT 0,
  mains_control TINYINT DEFAULT 0,
  geyser_state TINYINT DEFAULT 0,
  geyser_control TINYINT DEFAULT 0,
  firmware VARCHAR(20) DEFAULT '',
  uptime_seconds INT UNSIGNED DEFAULT 0,
  meter_timestamp DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_drn (drn),
  INDEX idx_created (created_at),
  INDEX idx_drn_created (drn, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

db.query(createTableSQL, (err) => {
  if (err) {
    console.error('Failed to create meter_health table:', err.message);
  } else {
    console.log('meter_health table ready');
  }
});

/**
 * POST /meterHealth/MeterLog/:drn
 * Receives diagnostic/health data from ESP32 via SIM800 HTTP POST
 */
router.post('/:drn', (req, res) => {
  const drn = req.params.drn;
  const {
    health_score = 0,
    uart_errors = 0,
    relay_mismatches = 0,
    power_anomalies = 0,
    voltage = 0,
    current = 0,
    active_power = 0,
    frequency = 0,
    power_factor = 0,
    temperature = 0,
    mains_state = 0,
    mains_control = 0,
    geyser_state = 0,
    geyser_control = 0,
    firmware = '',
    uptime = 0,
    timestamp,
  } = req.body;

  const ts = timestamp || Math.floor(Date.now() / 1000);

  db.query(
    `INSERT INTO meter_health
       (drn, health_score, uart_errors, relay_mismatches, power_anomalies,
        voltage, current_a, active_power, frequency, power_factor, temperature,
        mains_state, mains_control, geyser_state, geyser_control,
        firmware, uptime_seconds, meter_timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?))`,
    [
      drn,
      health_score,
      uart_errors,
      relay_mismatches,
      power_anomalies,
      voltage,
      current,
      active_power,
      frequency,
      power_factor,
      temperature,
      mains_state,
      mains_control,
      geyser_state,
      geyser_control,
      firmware,
      uptime,
      ts,
    ],
    (err) => {
      if (err) {
        console.error(`Error inserting health data for ${drn}:`, err.message);
        return res.status(500).json({ success: false, message: err.message });
      }

      // Return pending commands via checkUpdates (same pattern as meterPower)
      try {
        const meterRequest = require('../hardware/middleware/updateMeterRequest');
        meterRequest.checkUpdates(drn, (err2, data) => {
          if (err2) {
            return res.status(201).json({ success: true, message: 'Health data stored' });
          }
          return res.status(201).json(data || {});
        });
      } catch (e) {
        return res.status(201).json({ success: true, message: 'Health data stored' });
      }
    }
  );
});

/**
 * GET /meter-health/:drn
 * Returns the latest health record for a meter
 */
router.get('/:drn', (req, res) => {
  const drn = req.params.drn;

  db.query(
    `SELECT * FROM meter_health WHERE drn = ? ORDER BY created_at DESC LIMIT 1`,
    [drn],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ success: false, message: err.message });
      }
      res.json({
        success: true,
        data: rows.length > 0 ? rows[0] : null,
      });
    }
  );
});

/**
 * GET /meter-health/:drn/history
 * Returns health history (default 72 records = ~3 days at 1hr interval)
 */
router.get('/:drn/history', (req, res) => {
  const drn = req.params.drn;
  const limit = Math.min(parseInt(req.query.limit, 10) || 72, 500);

  db.query(
    `SELECT * FROM meter_health WHERE drn = ? ORDER BY created_at DESC LIMIT ?`,
    [drn, limit],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ success: false, message: err.message });
      }
      res.json({ success: true, data: rows, total: rows.length });
    }
  );
});

module.exports = router;
