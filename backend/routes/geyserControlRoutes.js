/**
 * Geyser Control Routes — API-driven geyser scheduling, timer, and manual control.
 * Backend acts as single source of truth; commands are synced to ESP32 via MQTT.
 *
 * Endpoints:
 *   POST   /geyser/control/:drn         — Turn geyser ON/OFF
 *   GET    /geyser/status/:drn          — Get current geyser state
 *   POST   /geyser/timer/:drn           — Start/stop timer
 *   GET    /geyser/schedules/:drn       — List schedules
 *   POST   /geyser/schedules/:drn       — Create schedule
 *   DELETE /geyser/schedules/:drn/:id   — Delete schedule
 *   GET    /geyser/config/:drn          — Full config (mode + timer + schedules)
 *   PUT    /geyser/config/:drn          — Update mode
 */

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken } = require('../admin/authMiddllware');
const mqttHandler = require('../services/mqttHandler');

// ═══════════════════════════════════════════════════════════════════════════
// DB HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function queryAll(sql, params) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results || []);
    });
  });
}

function queryOne(sql, params) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results && results.length > 0 ? results[0] : null);
    });
  });
}

function execute(sql, params) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// TABLE INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

const CREATE_GEYSER_CONFIG = `
  CREATE TABLE IF NOT EXISTS GeyserConfig (
    id INT AUTO_INCREMENT PRIMARY KEY,
    DRN VARCHAR(50) NOT NULL UNIQUE,
    mode ENUM('manual','timer','schedule') DEFAULT 'manual',
    timer_hours TINYINT UNSIGNED DEFAULT 0,
    timer_minutes TINYINT UNSIGNED DEFAULT 0,
    timer_active TINYINT(1) DEFAULT 0,
    timer_started_at TIMESTAMP NULL,
    geyser_state TINYINT(1) DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`;

const CREATE_GEYSER_SCHEDULES = `
  CREATE TABLE IF NOT EXISTS GeyserSchedules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    DRN VARCHAR(50) NOT NULL,
    start_hour TINYINT UNSIGNED NOT NULL,
    start_minute TINYINT UNSIGNED NOT NULL,
    end_hour TINYINT UNSIGNED NOT NULL,
    end_minute TINYINT UNSIGNED NOT NULL,
    days JSON NOT NULL,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_drn (DRN),
    INDEX idx_active (DRN, is_active)
  )`;

function ensureTables() {
  db.query(CREATE_GEYSER_CONFIG, (err) => {
    if (err) console.error('[GeyserControl] Error creating GeyserConfig table:', err.message);
    else console.log('[GeyserControl] GeyserConfig table ready');
  });
  db.query(CREATE_GEYSER_SCHEDULES, (err) => {
    if (err) console.error('[GeyserControl] Error creating GeyserSchedules table:', err.message);
    else console.log('[GeyserControl] GeyserSchedules table ready');
  });
}

ensureTables();

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Ensure GeyserConfig row exists for a DRN
// ═══════════════════════════════════════════════════════════════════════════

async function ensureConfig(drn) {
  let config = await queryOne('SELECT * FROM GeyserConfig WHERE DRN = ?', [drn]);
  if (!config) {
    await execute('INSERT INTO GeyserConfig (DRN) VALUES (?)', [drn]);
    config = await queryOne('SELECT * FROM GeyserConfig WHERE DRN = ?', [drn]);
  }
  return config;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Publish MQTT command to ESP32
// ═══════════════════════════════════════════════════════════════════════════

function sendMqttCommand(drn, command) {
  try {
    mqttHandler.publishCommand(drn, command);
    return true;
  } catch (err) {
    console.error(`[GeyserControl] MQTT publish error for ${drn}:`, err.message);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Sync all active schedules to ESP32
// ═══════════════════════════════════════════════════════════════════════════

async function syncSchedulesToDevice(drn) {
  const schedules = await queryAll(
    'SELECT id, start_hour, start_minute, end_hour, end_minute, days FROM GeyserSchedules WHERE DRN = ? AND is_active = 1 ORDER BY start_hour, start_minute',
    [drn]
  );

  const scheduleData = schedules.map(s => ({
    id: s.id,
    start_hour: s.start_hour,
    start_minute: s.start_minute,
    end_hour: s.end_hour,
    end_minute: s.end_minute,
    days: typeof s.days === 'string' ? JSON.parse(s.days) : s.days,
  }));

  sendMqttCommand(drn, {
    type: 'geyser_schedule_sync',
    mode: 'schedule',
    schedules: scheduleData,
  });

  return scheduleData;
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /geyser/control/:drn — Turn geyser ON/OFF
// ═══════════════════════════════════════════════════════════════════════════

router.post('/geyser/control/:drn', authenticateToken, async (req, res) => {
  try {
    const drn = req.params.drn;
    const { action } = req.body; // "on" or "off"

    if (!action || !['on', 'off'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Use "on" or "off".' });
    }

    const state = action === 'on' ? 1 : 0;

    // Update config
    await ensureConfig(drn);
    await execute(
      'UPDATE GeyserConfig SET mode = ?, geyser_state = ?, timer_active = 0 WHERE DRN = ?',
      ['manual', state, drn]
    );

    // Record in heater control table
    await execute(
      'INSERT INTO MeterHeaterControlTable (DRN, state, processed, reason) VALUES (?, ?, 0, ?)',
      [drn, state, `API manual ${action}`]
    );

    // Send MQTT command to ESP32
    const mqttSent = sendMqttCommand(drn, {
      type: 'geyser_control',
      action: action,
    });

    res.json({
      success: true,
      message: `Geyser ${action.toUpperCase()} command sent`,
      drn,
      state,
      mqtt_sent: mqttSent,
    });
  } catch (err) {
    console.error('[GeyserControl] control error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /geyser/status/:drn — Get current geyser state
// ═══════════════════════════════════════════════════════════════════════════

router.get('/geyser/status/:drn', authenticateToken, async (req, res) => {
  try {
    const drn = req.params.drn;

    // Get latest load control data from MQTT telemetry
    const loadState = await queryOne(
      'SELECT geyser_state, geyser_control, mains_state, mains_control, date_time FROM MeterLoadControl WHERE DRN = ? ORDER BY date_time DESC LIMIT 1',
      [drn]
    );

    // Get config
    const config = await ensureConfig(drn);

    res.json({
      success: true,
      drn,
      geyser_state: loadState ? loadState.geyser_state : null,
      geyser_control: loadState ? loadState.geyser_control : null,
      mains_state: loadState ? loadState.mains_state : null,
      last_report: loadState ? loadState.date_time : null,
      config: {
        mode: config.mode,
        timer_hours: config.timer_hours,
        timer_minutes: config.timer_minutes,
        timer_active: config.timer_active,
        timer_started_at: config.timer_started_at,
        geyser_state: config.geyser_state,
        updated_at: config.updated_at,
      },
    });
  } catch (err) {
    console.error('[GeyserControl] status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /geyser/timer/:drn — Start/stop timer
// ═══════════════════════════════════════════════════════════════════════════

router.post('/geyser/timer/:drn', authenticateToken, async (req, res) => {
  try {
    const drn = req.params.drn;
    const { action, hours, minutes } = req.body; // action: "start" or "stop"

    if (!action || !['start', 'stop'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Use "start" or "stop".' });
    }

    await ensureConfig(drn);

    if (action === 'start') {
      const h = parseInt(hours) || 0;
      const m = parseInt(minutes) || 0;

      if (h === 0 && m === 0) {
        return res.status(400).json({ error: 'Timer duration must be greater than 0.' });
      }
      if (h > 23 || m > 59) {
        return res.status(400).json({ error: 'Invalid time values. Hours: 0-23, Minutes: 0-59.' });
      }

      await execute(
        'UPDATE GeyserConfig SET mode = ?, timer_hours = ?, timer_minutes = ?, timer_active = 1, timer_started_at = NOW(), geyser_state = 1 WHERE DRN = ?',
        ['timer', h, m, drn]
      );

      sendMqttCommand(drn, {
        type: 'geyser_timer',
        action: 'start',
        hours: h,
        minutes: m,
      });
    } else {
      // Stop timer
      await execute(
        'UPDATE GeyserConfig SET timer_active = 0, geyser_state = 0 WHERE DRN = ?',
        [drn]
      );

      sendMqttCommand(drn, {
        type: 'geyser_timer',
        action: 'stop',
      });
    }

    const config = await queryOne('SELECT * FROM GeyserConfig WHERE DRN = ?', [drn]);

    res.json({
      success: true,
      message: `Timer ${action} command sent`,
      drn,
      config: {
        mode: config.mode,
        timer_hours: config.timer_hours,
        timer_minutes: config.timer_minutes,
        timer_active: config.timer_active,
        timer_started_at: config.timer_started_at,
      },
    });
  } catch (err) {
    console.error('[GeyserControl] timer error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /geyser/schedules/:drn — List active schedules
// ═══════════════════════════════════════════════════════════════════════════

router.get('/geyser/schedules/:drn', authenticateToken, async (req, res) => {
  try {
    const drn = req.params.drn;
    const schedules = await queryAll(
      'SELECT id, start_hour, start_minute, end_hour, end_minute, days, is_active, created_at FROM GeyserSchedules WHERE DRN = ? AND is_active = 1 ORDER BY start_hour, start_minute',
      [drn]
    );

    // Parse JSON days field
    const parsed = schedules.map(s => ({
      ...s,
      days: typeof s.days === 'string' ? JSON.parse(s.days) : s.days,
    }));

    res.json({ success: true, drn, schedules: parsed });
  } catch (err) {
    console.error('[GeyserControl] list schedules error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /geyser/schedules/:drn — Create schedule
// ═══════════════════════════════════════════════════════════════════════════

router.post('/geyser/schedules/:drn', authenticateToken, async (req, res) => {
  try {
    const drn = req.params.drn;
    const { start_hour, start_minute, end_hour, end_minute, days } = req.body;

    // Validate
    if (start_hour == null || start_minute == null || end_hour == null || end_minute == null || !days) {
      return res.status(400).json({ error: 'Missing required fields: start_hour, start_minute, end_hour, end_minute, days' });
    }

    if (!Array.isArray(days) || days.length !== 7) {
      return res.status(400).json({ error: 'days must be an array of 7 integers (0 or 1)' });
    }

    const startTotal = start_hour * 60 + start_minute;
    const endTotal = end_hour * 60 + end_minute;
    if (startTotal >= endTotal) {
      return res.status(400).json({ error: 'Start time must be before end time' });
    }

    if (!days.some(d => d === 1)) {
      return res.status(400).json({ error: 'At least one day must be selected' });
    }

    // Insert schedule
    const result = await execute(
      'INSERT INTO GeyserSchedules (DRN, start_hour, start_minute, end_hour, end_minute, days) VALUES (?, ?, ?, ?, ?, ?)',
      [drn, start_hour, start_minute, end_hour, end_minute, JSON.stringify(days)]
    );

    // Update config to schedule mode
    await ensureConfig(drn);
    await execute('UPDATE GeyserConfig SET mode = ? WHERE DRN = ?', ['schedule', drn]);

    // Sync all schedules to device
    const syncedSchedules = await syncSchedulesToDevice(drn);

    res.json({
      success: true,
      message: 'Schedule created and synced to device',
      id: result.insertId,
      drn,
      schedules: syncedSchedules,
    });
  } catch (err) {
    console.error('[GeyserControl] create schedule error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE /geyser/schedules/:drn/:id — Delete schedule
// ═══════════════════════════════════════════════════════════════════════════

router.delete('/geyser/schedules/:drn/:id', authenticateToken, async (req, res) => {
  try {
    const { drn, id } = req.params;

    const existing = await queryOne(
      'SELECT * FROM GeyserSchedules WHERE id = ? AND DRN = ?',
      [id, drn]
    );

    if (!existing) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    // Soft delete
    await execute('UPDATE GeyserSchedules SET is_active = 0 WHERE id = ?', [id]);

    // Check if any schedules remain
    const remaining = await queryAll(
      'SELECT id FROM GeyserSchedules WHERE DRN = ? AND is_active = 1',
      [drn]
    );

    // If no schedules left, revert to manual mode
    if (remaining.length === 0) {
      await execute('UPDATE GeyserConfig SET mode = ? WHERE DRN = ?', ['manual', drn]);
    }

    // Sync remaining schedules to device
    const syncedSchedules = await syncSchedulesToDevice(drn);

    res.json({
      success: true,
      message: 'Schedule deleted',
      drn,
      remaining_schedules: syncedSchedules,
    });
  } catch (err) {
    console.error('[GeyserControl] delete schedule error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /geyser/config/:drn — Full config (mode + timer + schedules)
// ═══════════════════════════════════════════════════════════════════════════

router.get('/geyser/config/:drn', authenticateToken, async (req, res) => {
  try {
    const drn = req.params.drn;

    const config = await ensureConfig(drn);
    const schedules = await queryAll(
      'SELECT id, start_hour, start_minute, end_hour, end_minute, days, is_active FROM GeyserSchedules WHERE DRN = ? AND is_active = 1 ORDER BY start_hour, start_minute',
      [drn]
    );

    const parsedSchedules = schedules.map(s => ({
      ...s,
      days: typeof s.days === 'string' ? JSON.parse(s.days) : s.days,
    }));

    // Get latest device-reported state
    const loadState = await queryOne(
      'SELECT geyser_state, geyser_control, date_time FROM MeterLoadControl WHERE DRN = ? ORDER BY date_time DESC LIMIT 1',
      [drn]
    );

    res.json({
      success: true,
      drn,
      mode: config.mode,
      geyser_state: config.geyser_state,
      device_reported_state: loadState ? loadState.geyser_state : null,
      last_device_report: loadState ? loadState.date_time : null,
      timer: {
        hours: config.timer_hours,
        minutes: config.timer_minutes,
        active: config.timer_active,
        started_at: config.timer_started_at,
      },
      schedules: parsedSchedules,
      updated_at: config.updated_at,
    });
  } catch (err) {
    console.error('[GeyserControl] config error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /geyser/config/:drn — Update mode
// ═══════════════════════════════════════════════════════════════════════════

router.put('/geyser/config/:drn', authenticateToken, async (req, res) => {
  try {
    const drn = req.params.drn;
    const { mode } = req.body;

    if (!mode || !['manual', 'timer', 'schedule'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid mode. Use "manual", "timer", or "schedule".' });
    }

    await ensureConfig(drn);
    await execute('UPDATE GeyserConfig SET mode = ? WHERE DRN = ?', [mode, drn]);

    // Send mode change to device
    sendMqttCommand(drn, {
      type: 'geyser_mode',
      mode: mode,
    });

    // If switching to schedule, sync schedules to device
    if (mode === 'schedule') {
      await syncSchedulesToDevice(drn);
    }

    const config = await queryOne('SELECT * FROM GeyserConfig WHERE DRN = ?', [drn]);

    res.json({
      success: true,
      message: `Mode changed to ${mode}`,
      drn,
      config: {
        mode: config.mode,
        geyser_state: config.geyser_state,
        timer_active: config.timer_active,
        updated_at: config.updated_at,
      },
    });
  } catch (err) {
    console.error('[GeyserControl] config update error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
