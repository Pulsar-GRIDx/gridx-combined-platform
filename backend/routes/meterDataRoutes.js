/**
 * Meter Data Routes — endpoints for real-time meter telemetry,
 * energy readings, load control, and location data.
 * These query the same gridx DB that the ESP32 meters post to.
 */
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken } = require('../admin/authMiddllware');
const mqttHandler = require('../services/mqttHandler');

// Helper: run a query and return first row
function queryOne(sql, params) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows && rows.length > 0 ? rows[0] : null);
    });
  });
}

// Helper: run a query and return all rows
function queryAll(sql, params) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

// ─── POWER DATA ────────────────────────────────────────────
// GET /meterPower/getLastUpdate/:id
router.get('/meterPower/getLastUpdate/:id', authenticateToken, async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT * FROM MeteringPower WHERE DRN = ? ORDER BY date_time DESC LIMIT 1`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ message: 'No power data found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /meterPower/getMeterByDRN/:id — all power readings for a DRN
router.get('/meterPower/getMeterByDRN/:id', authenticateToken, async (req, res) => {
  try {
    const rows = await queryAll(
      `SELECT * FROM MeteringPower WHERE DRN = ? ORDER BY date_time DESC LIMIT 500`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ENERGY DATA ───────────────────────────────────────────
// GET /meterEnergy/getLastUpdate/:id
router.get('/meterEnergy/getLastUpdate/:id', authenticateToken, async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT * FROM MeterCumulativeEnergyUsage WHERE DRN = ? ORDER BY date_time DESC LIMIT 1`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ message: 'No energy data found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /meterEnergy/getMeterByDRN/:id
router.get('/meterEnergy/getMeterByDRN/:id', authenticateToken, async (req, res) => {
  try {
    const rows = await queryAll(
      `SELECT * FROM MeterCumulativeEnergyUsage WHERE DRN = ? ORDER BY date_time DESC LIMIT 500`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── LOAD CONTROL STATE ───────────────────────────────────
// GET /meterLoadControl/getLastUpdate/:id
router.get('/meterLoadControl/getLastUpdate/:id', authenticateToken, async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT * FROM MeterLoadControl WHERE DRN = ? ORDER BY date_time DESC LIMIT 1`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ message: 'No load control data found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── MAINS CONTROL (Enable/Disable) ──────────────────────
// GET /meterMainsControl/getLastUpdate/:id
router.get('/meterMainsControl/getLastUpdate/:id', authenticateToken, async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT * FROM MeterMainsControlTable WHERE DRN = ? ORDER BY date_time DESC LIMIT 1`,
      [req.params.id]
    );
    if (!row) return res.json({ DRN: req.params.id, state: null, processed: null });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /meterMainsControl/update/:id — send enable/disable command
router.post('/meterMainsControl/update/:id', authenticateToken, async (req, res) => {
  try {
    const { user, state, reason } = req.body;
    const DRN = req.params.id;
    await new Promise((resolve, reject) => {
      db.query(
        `INSERT INTO MeterMainsControlTable (DRN, user, state, processed, reason)
         VALUES (?, ?, ?, '0', ?)`,
        [DRN, user || 'Admin', state, reason || 'Remote control'],
        (err, result) => err ? reject(err) : resolve(result)
      );
    });

    // Also publish MQTT command to meter
    try { mqttHandler.publishCommand(DRN, { mc: parseInt(state) }); }
    catch (e) { console.error('[MeterData] MQTT mains publish error:', e.message); }

    res.json({ success: true, message: `Mains ${state == 1 ? 'enabled' : 'disabled'} command sent`, mqtt_sent: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── HEATER CONTROL (Enable/Disable) ─────────────────────
// GET /meterHeaterControl/getLastUpdate/:id
router.get('/meterHeaterControl/getLastUpdate/:id', authenticateToken, async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT * FROM MeterHeaterControlTable WHERE DRN = ? ORDER BY date_time DESC LIMIT 1`,
      [req.params.id]
    );
    if (!row) return res.json({ DRN: req.params.id, state: null, processed: null });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /meterHeaterControl/update/:id — send enable/disable command
router.post('/meterHeaterControl/update/:id', authenticateToken, async (req, res) => {
  try {
    const { user, state, reason } = req.body;
    const DRN = req.params.id;
    await new Promise((resolve, reject) => {
      db.query(
        `INSERT INTO MeterHeaterControlTable (DRN, user, state, processed, reason)
         VALUES (?, ?, ?, '0', ?)`,
        [DRN, user || 'Admin', state, reason || 'Remote control'],
        (err, result) => err ? reject(err) : resolve(result)
      );
    });

    // Also publish MQTT command to meter
    try { mqttHandler.publishCommand(DRN, { gc: parseInt(state) }); }
    catch (e) { console.error('[MeterData] MQTT heater publish error:', e.message); }

    res.json({ success: true, message: `Heater ${state == 1 ? 'enabled' : 'disabled'} command sent`, mqtt_sent: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── MAINS STATE (read-only feedback) ────────────────────
router.get('/meterMainsState/getLastUpdate/:id', authenticateToken, async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT * FROM MeterMainsStateTable WHERE DRN = ? ORDER BY date_time DESC LIMIT 1`,
      [req.params.id]
    );
    res.json(row || { DRN: req.params.id, state: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── HEATER STATE (read-only feedback) ───────────────────
router.get('/meterHeaterState/getLastUpdate/:id', authenticateToken, async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT * FROM MeterHeaterStateTable WHERE DRN = ? ORDER BY date_time DESC LIMIT 1`,
      [req.params.id]
    );
    res.json(row || { DRN: req.params.id, state: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /meterMainsState/update/:id — send mains state on/off command
router.post('/meterMainsState/update/:id', authenticateToken, async (req, res) => {
  try {
    const { user, state, reason } = req.body;
    const DRN = req.params.id;
    await new Promise((resolve, reject) => {
      db.query(
        `INSERT INTO MeterMainsStateTable (DRN, user, state, processed, reason)
         VALUES (?, ?, ?, '0', ?)`,
        [DRN, user || 'Admin', state, reason || 'Remote control'],
        (err, result) => err ? reject(err) : resolve(result)
      );
    });
    // Publish MQTT command to meter — ms = mains state (relay on/off)
    try { mqttHandler.publishCommand(DRN, { ms: parseInt(state) }); }
    catch (e) { console.error('[MeterData] MQTT mains state publish error:', e.message); }

    res.json({ success: true, message: `Mains state ${state == 1 ? 'ON' : 'OFF'} command sent`, mqtt_sent: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /meterHeaterState/update/:id — send heater state on/off command
router.post('/meterHeaterState/update/:id', authenticateToken, async (req, res) => {
  try {
    const { user, state, reason } = req.body;
    const DRN = req.params.id;
    await new Promise((resolve, reject) => {
      db.query(
        `INSERT INTO MeterHeaterStateTable (DRN, user, state, processed, reason)
         VALUES (?, ?, ?, '0', ?)`,
        [DRN, user || 'Admin', state, reason || 'Remote control'],
        (err, result) => err ? reject(err) : resolve(result)
      );
    });

    // Publish MQTT command to meter — gs = geyser state (relay on/off)
    try { mqttHandler.publishCommand(DRN, { gs: parseInt(state) }); }
    catch (e) { console.error('[MeterData] MQTT heater state publish error:', e.message); }

    res.json({ success: true, message: `Heater state ${state == 1 ? 'ON' : 'OFF'} command sent`, mqtt_sent: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── METER CONFIGURATION COMMANDS ───────────────────────
// POST /meterResetBLE/update/:id — reset BLE PIN
router.post('/meterResetBLE/update/:id', authenticateToken, async (req, res) => {
  try {
    const { state, processed } = req.body;
    const DRN = req.params.id;
    const userName = req.user ? (req.user.Email || 'Admin') : 'Admin';
    await new Promise((resolve, reject) => {
      db.query(
        `INSERT INTO BLEReset (DRN, user, processed, reason)
         VALUES (?, ?, ?, ?)`,
        [DRN, userName, processed != null ? processed : 0, 'BLE PIN reset via platform'],
        (err, result) => err ? reject(err) : resolve(result)
      );
    });
    res.json({ success: true, message: 'Reset BLE PIN command sent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /meterResetAuthNumber/update/:id — clear authorized numbers
router.post('/meterResetAuthNumber/update/:id', authenticateToken, async (req, res) => {
  try {
    const { state, processed } = req.body;
    const DRN = req.params.id;
    const userName = req.user ? (req.user.Email || 'Admin') : 'Admin';
    await new Promise((resolve, reject) => {
      db.query(
        `INSERT INTO ResetAuthNumbers (DRN, user, processed, reason)
         VALUES (?, ?, ?, ?)`,
        [DRN, userName, processed != null ? processed : 0, 'Auth numbers cleared via platform'],
        (err, result) => err ? reject(err) : resolve(result)
      );
    });
    res.json({ success: true, message: 'Clear Authorized Numbers command sent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /meterReset/update/:id — restart meter
router.post('/meterReset/update/:id', authenticateToken, async (req, res) => {
  try {
    const { state, processed } = req.body;
    const DRN = req.params.id;
    const userName = req.user ? (req.user.Email || 'Admin') : 'Admin';
    await new Promise((resolve, reject) => {
      db.query(
        `INSERT INTO \`Reset\` (DRN, user, processed, reason)
         VALUES (?, ?, ?, ?)`,
        [DRN, userName, processed != null ? processed : 0, 'Meter restart via platform'],
        (err, result) => err ? reject(err) : resolve(result)
      );
    });
    res.json({ success: true, message: 'Restart Meter command sent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CELL NETWORK ────────────────────────────────────────
router.get('/meterCellNetwork/getLastUpdate/:id', authenticateToken, async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT * FROM MeterCellularNetworkProperties WHERE DRN = ? ORDER BY date_time DESC LIMIT 1`,
      [req.params.id]
    );
    res.json(row || { DRN: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── METER LOCATIONS (for map) ───────────────────────────
router.get('/meterLocation/getAll', authenticateToken, async (req, res) => {
  try {
    const rows = await queryAll(`SELECT * FROM MeterLocationInfoTable`);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── TRANSFORMERS (for map) ──────────────────────────────
router.get('/transformer/getAll', authenticateToken, async (req, res) => {
  try {
    const rows = await queryAll(`SELECT * FROM TransformerInformation`);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── METER LOCATIONS BY TRANSFORMER ──────────────────────
router.get('/meterLocation/getMeterByTrans/:drn', authenticateToken, async (req, res) => {
  try {
    const rows = await queryAll(
      `SELECT ml.* FROM MeterLocationInfoTable ml
       JOIN MeterProfileReal mpr ON ml.DRN = mpr.DRN
       WHERE mpr.TransformerDRN = ?`,
      [req.params.drn]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── METER PROFILE BY DRN ───────────────────────────────
router.get('/meterDataByDRN/:id', authenticateToken, async (req, res) => {
  try {
    const profile = await queryOne(
      `SELECT * FROM MeterProfileReal WHERE DRN = ?`,
      [req.params.id]
    );
    if (!profile) return res.status(404).json({ message: 'Meter not found' });
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── METER LOCATION BY DRN ─────────────────────────────
router.get('/meterLocation/:id', authenticateToken, async (req, res) => {
  try {
    const loc = await queryOne(
      `SELECT * FROM MeterLocationInfoTable WHERE DRN = ?`,
      [req.params.id]
    );
    if (!loc) return res.status(404).json({ message: 'Location not found' });
    res.json(loc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── NOTIFICATIONS BY DRN ───────────────────────────────
router.get('/notificationsByDRN/:id', authenticateToken, async (req, res) => {
  try {
    const rows = await queryAll(
      `SELECT * FROM MeterNotifications WHERE DRN = ? ORDER BY date_time DESC LIMIT 50`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── WEEKLY/MONTHLY ENERGY DATA ─────────────────────────
router.get('/meterWeekAndMonthData/:id', authenticateToken, async (req, res) => {
  try {
    const DRN = req.params.id;

    // Last 7 days of daily energy
    const weekly = await queryAll(
      `SELECT DATE(date_time) as date,
              MAX(CAST(units AS DECIMAL(10,2))) - MIN(CAST(units AS DECIMAL(10,2))) as daily_usage,
              AVG(CAST(active_energy AS DECIMAL(10,2))) as avg_energy,
              COUNT(*) as readings
       FROM MeterCumulativeEnergyUsage
       WHERE DRN = ? AND date_time >= NOW() - INTERVAL 7 DAY
       GROUP BY DATE(date_time) ORDER BY date`,
      [DRN]
    );

    // Last 30 days of daily energy
    const monthly = await queryAll(
      `SELECT DATE(date_time) as date,
              MAX(CAST(units AS DECIMAL(10,2))) - MIN(CAST(units AS DECIMAL(10,2))) as daily_usage,
              AVG(CAST(active_energy AS DECIMAL(10,2))) as avg_energy,
              COUNT(*) as readings
       FROM MeterCumulativeEnergyUsage
       WHERE DRN = ? AND date_time >= NOW() - INTERVAL 30 DAY
       GROUP BY DATE(date_time) ORDER BY date`,
      [DRN]
    );

    // Last 7 days of power averages
    const powerWeekly = await queryAll(
      `SELECT DATE(date_time) as date,
              AVG(CAST(active_power AS DECIMAL(10,2))) as avg_power,
              MAX(CAST(active_power AS DECIMAL(10,2))) as peak_power,
              AVG(CAST(voltage AS DECIMAL(10,2))) as avg_voltage,
              AVG(CAST(current AS DECIMAL(10,4))) as avg_current
       FROM MeteringPower
       WHERE DRN = ? AND date_time >= NOW() - INTERVAL 7 DAY
       GROUP BY DATE(date_time) ORDER BY date`,
      [DRN]
    );

    res.json({ weekly, monthly, powerWeekly });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── STS TOKEN INFO BY DRN ──────────────────────────────
router.get('/stsTokensByDRN/:id', authenticateToken, async (req, res) => {
  try {
    const rows = await queryAll(
      `SELECT * FROM STSTokesInfo WHERE DRN = ? ORDER BY date_time DESC LIMIT 50`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AREA POWER & REVENUE SUMMARY (for Dashboard bar chart) ──
router.get('/areaSummary', authenticateToken, async (req, res) => {
  try {
    // Area-level power consumption (last 24h)
    const areaPower = await queryAll(
      `SELECT COALESCE(ml.LocationName, pr.City, 'Unknown') AS area,
              COUNT(DISTINCT mp.DRN) AS meter_count,
              ROUND(SUM(mp.active_power), 2) AS total_power_w,
              ROUND(AVG(mp.active_power), 2) AS avg_power_w,
              ROUND(AVG(mp.voltage), 1) AS avg_voltage
       FROM MeteringPower mp
       LEFT JOIN MeterLocationInfoTable ml ON mp.DRN = ml.DRN
       LEFT JOIN MeterProfileReal pr ON mp.DRN = pr.DRN
       WHERE mp.date_time >= DATE_SUB(NOW(), INTERVAL 1 DAY)
       GROUP BY area
       ORDER BY total_power_w DESC`
    );

    // Area-level revenue from STS tokens (last 24h)
    const areaRevenue = await queryAll(
      `SELECT COALESCE(ml.LocationName, pr.City, 'Unknown') AS area,
              COUNT(*) AS token_count,
              ROUND(SUM(CAST(st.token_amount AS DECIMAL(10,2))), 2) AS total_revenue
       FROM STSTokesInfo st
       LEFT JOIN MeterLocationInfoTable ml ON st.DRN = ml.DRN
       LEFT JOIN MeterProfileReal pr ON st.DRN = pr.DRN
       WHERE st.date_time >= DATE_SUB(NOW(), INTERVAL 1 DAY)
       GROUP BY area
       ORDER BY total_revenue DESC`
    );

    res.json({ areaPower, areaRevenue });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── METER DAILY POWER (this week + last week for bar chart) ──
router.get('/meterDailyPower/:id', authenticateToken, async (req, res) => {
  try {
    const DRN = req.params.id;
    const rows = await queryAll(
      `SELECT DATE(date_time) AS day,
              ROUND(AVG(CAST(active_power AS DECIMAL(10,2))), 2) AS avg_power,
              ROUND(MAX(CAST(active_power AS DECIMAL(10,2))), 2) AS peak_power,
              COUNT(*) AS readings
       FROM MeteringPower
       WHERE DRN = ? AND date_time >= DATE_SUB(NOW(), INTERVAL 14 DAY)
       GROUP BY DATE(date_time)
       ORDER BY day`,
      [DRN]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CALIBRATION ────────────────────────────────────────────
// POST /calibrate/:drn — send calibration command to a single meter
// action: "auto" (start auto-calibration), "verify" (check accuracy), "exercise" (exercise load switch)
router.post('/calibrate/:drn', authenticateToken, async (req, res) => {
  try {
    const DRN = req.params.drn;
    const { action, user } = req.body;

    if (!action || !['auto', 'verify', 'exercise'].includes(action)) {
      return res.status(400).json({ error: 'action must be one of: auto, verify, exercise' });
    }

    // Log the calibration command
    await new Promise((resolve, reject) => {
      db.query(
        `INSERT INTO MeterCalibrationLog (DRN, action, requested_by, status)
         VALUES (?, ?, ?, 'pending')`,
        [DRN, action, user || 'Admin'],
        (err, result) => err ? reject(err) : resolve(result)
      );
    });

    // Send MQTT command to meter
    try {
      mqttHandler.publishCommand(DRN, { type: 'calibrate', action }, 1);
    } catch (e) {
      console.error('[MeterData] MQTT calibrate publish error:', e.message);
      return res.status(500).json({ error: 'MQTT publish failed: ' + e.message });
    }

    res.json({
      success: true,
      message: `Calibration '${action}' command sent to ${DRN}`,
      mqtt_sent: true,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /calibration-log/:drn — get calibration history for a meter
router.get('/calibration-log/:drn', authenticateToken, async (req, res) => {
  try {
    const rows = await queryAll(
      `SELECT * FROM MeterCalibrationLog WHERE DRN = ? ORDER BY created_at DESC LIMIT 50`,
      [req.params.drn]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /hourly-energy/:drn — get latest hourly energy usage for a meter
router.get('/hourly-energy/:drn', authenticateToken, async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT * FROM MeterHourlyEnergy WHERE DRN = ? ORDER BY created_at DESC LIMIT 1`,
      [req.params.drn]
    );
    if (!row) {
      return res.json({ success: true, data: null, sums: [] });
    }
    // Parse JSON hourly_data and return as "sums" for backward compat with existing app
    let sums = row.hourly_data;
    if (typeof sums === 'string') { try { sums = JSON.parse(sums); } catch (e) { sums = []; } }
    if (!Array.isArray(sums)) sums = [];
    res.json({
      success: true,
      sums,
      cumulative: row.cumulative,
      peak_power: row.peak_power,
      total: row.total,
      record_time: row.record_time,
      created_at: row.created_at,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /hourlyEnergyByDRN — get hourly energy for the authenticated meter (used by Android app)
// Accepts DRN from JWT token (customer auth: DRN field, hardware auth: meterDRN/drn field)
router.get('/hourlyEnergyByDRN', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(403).json({ error: 'No token' });

  const jwt = require('jsonwebtoken');
  const secret = process.env.ACCESS_TOKEN_SECRET || process.env.SECRET_KEY;
  let drn;
  try {
    const decoded = jwt.verify(token, secret);
    drn = decoded.DRN || decoded.meterDRN || decoded.drn;
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  if (!drn) return res.status(400).json({ error: 'No DRN in token' });

  // First try MeterHourlyEnergy (MQTT energy_usage data from meter)
  db.query(
    `SELECT * FROM MeterHourlyEnergy WHERE DRN = ? ORDER BY created_at DESC LIMIT 1`,
    [drn], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });

      if (rows && rows.length > 0) {
        let sums = rows[0].hourly_data;
        if (typeof sums === 'string') { try { sums = JSON.parse(sums); } catch (e) { sums = []; } }
        if (!Array.isArray(sums)) sums = [];
        return res.json({ sums, cumulative: rows[0].cumulative, peak_power: rows[0].peak_power, total: rows[0].total });
      }

      // Fallback: calculate from MeteringPower table (real-time power readings)
      db.query(
        `SELECT HOUR(date_time) as hour, ROUND(AVG(active_power), 0) as avgPower
         FROM MeteringPower WHERE DRN = ? AND DATE(date_time) = CURDATE()
         GROUP BY HOUR(date_time) ORDER BY hour`,
        [drn], (err2, rows2) => {
          if (err2) return res.status(500).json({ error: err2.message });
          const sums = new Array(24).fill(0);
          (rows2 || []).forEach(r => { sums[r.hour] = r.avgPower; });
          const total = sums.reduce((a, b) => a + b, 0);
          const peak = Math.max(...sums);
          res.json({ sums, total, peak_power: peak });
        }
      );
    }
  );
});

// POST /hourly-energy/:drn/request — request fresh hourly data from meter via MQTT
router.post('/hourly-energy/:drn/request', authenticateToken, async (req, res) => {
  try {
    mqttHandler.publishCommand(req.params.drn, { type: 'energy_usage_request' });
    res.json({ success: true, message: 'Energy usage request sent to meter' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /weeklyTotalEnergyByDRN — weekly energy for Android app (current week + last week)
// Returns { lastweek: [Mon..Sun], currentweek: [Mon..Sun] } in Wh
router.get('/weeklyTotalEnergyByDRN', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(403).json({ error: 'No token' });

  const jwt = require('jsonwebtoken');
  const secret = process.env.ACCESS_TOKEN_SECRET || process.env.SECRET_KEY;
  let drn;
  try {
    const decoded = jwt.verify(token, secret);
    drn = decoded.DRN || decoded.meterDRN || decoded.drn;
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  if (!drn) return res.status(400).json({ error: 'No DRN in token' });

  // Get daily average power for current week and last week
  // DAYOFWEEK: 1=Sun,2=Mon..7=Sat; we map to Mon=0..Sun=6
  const sql = `
    SELECT DATE(date_time) as day,
           ROUND(AVG(CAST(active_power AS DECIMAL(10,2))), 0) as avgPower,
           DAYOFWEEK(date_time) as dow
    FROM MeteringPower
    WHERE DRN = ?
      AND date_time >= DATE_SUB(CURDATE(), INTERVAL (WEEKDAY(CURDATE()) + 7) DAY)
    GROUP BY DATE(date_time)
    ORDER BY day`;

  db.query(sql, [drn], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const currentweek = new Array(7).fill(0);
    const lastweek = new Array(7).fill(0);

    const now = new Date();
    // Monday of current week
    const currentMonday = new Date(now);
    currentMonday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    currentMonday.setHours(0, 0, 0, 0);
    // Monday of last week
    const lastMonday = new Date(currentMonday);
    lastMonday.setDate(currentMonday.getDate() - 7);

    (rows || []).forEach(r => {
      const d = new Date(r.day);
      d.setHours(0, 0, 0, 0);
      // Map DAYOFWEEK (1=Sun..7=Sat) to index (Mon=0..Sun=6)
      const idx = (r.dow + 5) % 7;
      if (d >= currentMonday) {
        currentweek[idx] = parseInt(r.avgPower, 10) || 0;
      } else if (d >= lastMonday) {
        lastweek[idx] = parseInt(r.avgPower, 10) || 0;
      }
    });

    res.json({ lastweek, currentweek });
  });
});

// GET /monthlyEnergyByDRN — monthly energy for Android app (this year + last year)
// Returns { Last: [Jan..Dec], Current: [Jan..Dec] } in Wh
router.get('/monthlyEnergyByDRN', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(403).json({ error: 'No token' });

  const jwt = require('jsonwebtoken');
  const secret = process.env.ACCESS_TOKEN_SECRET || process.env.SECRET_KEY;
  let drn;
  try {
    const decoded = jwt.verify(token, secret);
    drn = decoded.DRN || decoded.meterDRN || decoded.drn;
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  if (!drn) return res.status(400).json({ error: 'No DRN in token' });

  const currentYear = new Date().getFullYear();
  const lastYear = currentYear - 1;

  const sql = `
    SELECT YEAR(date_time) as yr, MONTH(date_time) as mo,
           ROUND(AVG(CAST(active_power AS DECIMAL(10,2))), 0) as avgPower
    FROM MeteringPower
    WHERE DRN = ?
      AND YEAR(date_time) IN (?, ?)
    GROUP BY YEAR(date_time), MONTH(date_time)
    ORDER BY yr, mo`;

  db.query(sql, [drn, lastYear, currentYear], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const Current = new Array(12).fill(0);
    const Last = new Array(12).fill(0);

    (rows || []).forEach(r => {
      const idx = r.mo - 1; // 0-based month index
      if (r.yr === currentYear) {
        Current[idx] = parseInt(r.avgPower, 10) || 0;
      } else if (r.yr === lastYear) {
        Last[idx] = parseInt(r.avgPower, 10) || 0;
      }
    });

    res.json({ Last, Current });
  });
});

module.exports = router;
