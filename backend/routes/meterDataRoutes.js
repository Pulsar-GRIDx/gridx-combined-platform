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
    // Publish MQTT command to meter
    try { mqttHandler.publishCommand(DRN, { mc: parseInt(state) }); }
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

    // Publish MQTT command to meter
    try { mqttHandler.publishCommand(DRN, { gc: parseInt(state) }); }
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

module.exports = router;
