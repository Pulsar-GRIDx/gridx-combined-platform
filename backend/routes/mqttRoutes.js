/**
 * MQTT Routes — REST endpoints for sending MQTT commands to meters
 * and checking MQTT status. Includes token, auth numbers, health, relay logs.
 */
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../admin/authMiddllware');
const mqttHandler = require('../services/mqttHandler');
const db = require('../config/db');

// ═══════════════════════════════════════════════════════════════════════
// DB helpers
// ═══════════════════════════════════════════════════════════════════════

function queryAll(sql, params) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err); else resolve(results || []);
    });
  });
}

function queryOne(sql, params) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err); else resolve(results && results.length > 0 ? results[0] : null);
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════
// GENERIC COMMAND
// ═══════════════════════════════════════════════════════════════════════

/**
 * POST /mqtt/command/:drn
 * Send a control command to a specific meter via MQTT
 * Body: { "mc": 1 } or { "tk": "token..." } etc.
 */
router.post('/mqtt/command/:drn', authenticateToken, (req, res) => {
  try {
    const drn = req.params.drn;
    const command = req.body;

    if (!command || Object.keys(command).length === 0) {
      return res.status(400).json({ error: 'Command body required' });
    }

    mqttHandler.publishCommand(drn, command);
    res.json({
      success: true,
      message: `Command sent to ${drn} via MQTT`,
      command,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// TOKEN MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════

/**
 * POST /mqtt/send-token/:drn
 * Send a prepaid electricity token to the meter via MQTT
 * Body: { "token": "12345678901234567890" }
 */
router.post('/mqtt/send-token/:drn', authenticateToken, (req, res) => {
  try {
    const drn = req.params.drn;
    const { token } = req.body;

    if (!token || !/^\d{20}$/.test(token)) {
      return res.status(400).json({ error: 'Token must be exactly 20 digits' });
    }

    // Use QoS 1 for critical token delivery
    mqttHandler.publishCommand(drn, { type: 'token', token }, 1);

    res.json({
      success: true,
      message: `Token sent to ${drn} via MQTT`,
      drn,
      token_length: token.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// AUTHORIZED NUMBERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * POST /mqtt/auth-numbers/:drn/add
 * Add an authorized phone number to the meter
 * Body: { "number": "+264812345678" }
 */
router.post('/mqtt/auth-numbers/:drn/add', authenticateToken, (req, res) => {
  try {
    const drn = req.params.drn;
    const { number } = req.body;

    if (!number || number.length < 8) {
      return res.status(400).json({ error: 'Phone number must be at least 8 digits' });
    }

    mqttHandler.publishCommand(drn, { type: 'auth_number_add', number });
    res.json({ success: true, message: `Add number command sent to ${drn}`, number });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /mqtt/auth-numbers/:drn/remove
 * Remove an authorized phone number from the meter
 * Body: { "number": "+264812345678" }
 */
router.post('/mqtt/auth-numbers/:drn/remove', authenticateToken, (req, res) => {
  try {
    const drn = req.params.drn;
    const { number } = req.body;

    if (!number || number.length < 8) {
      return res.status(400).json({ error: 'Phone number must be at least 8 digits' });
    }

    mqttHandler.publishCommand(drn, { type: 'auth_number_remove', number });
    res.json({ success: true, message: `Remove number command sent to ${drn}`, number });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /mqtt/auth-numbers/:drn
 * Get the last-known authorized numbers for a meter (from DB cache)
 */
router.get('/mqtt/auth-numbers/:drn', authenticateToken, async (req, res) => {
  try {
    const drn = req.params.drn;
    const rows = await queryAll('SELECT phone_number, updated_at FROM MeterAuthorizedNumbers WHERE drn = ? ORDER BY id', [drn]);

    res.json({
      success: true,
      drn,
      numbers: rows.map(r => r.phone_number),
      updated_at: rows.length > 0 ? rows[0].updated_at : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /mqtt/auth-numbers/:drn/sync
 * Request the meter to publish its current authorized numbers list
 */
router.post('/mqtt/auth-numbers/:drn/sync', authenticateToken, (req, res) => {
  try {
    const drn = req.params.drn;
    mqttHandler.publishCommand(drn, { type: 'auth_number_list' });
    res.json({ success: true, message: `Auth number list request sent to ${drn}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// HEALTH REPORT
// ═══════════════════════════════════════════════════════════════════════

/**
 * GET /mqtt/health/:drn
 * Get the latest health report for a meter
 */
router.get('/mqtt/health/:drn', authenticateToken, async (req, res) => {
  try {
    const drn = req.params.drn;
    const row = await queryOne(
      'SELECT * FROM MeterHealthReport WHERE DRN = ? ORDER BY created_at DESC LIMIT 1',
      [drn]
    );

    if (!row) {
      return res.json({ success: true, drn, health: null, message: 'No health report available' });
    }

    res.json({ success: true, drn, health: row });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /mqtt/health/:drn/history
 * Get health report history for a meter (last 50)
 */
router.get('/mqtt/health/:drn/history', authenticateToken, async (req, res) => {
  try {
    const drn = req.params.drn;
    const rows = await queryAll(
      'SELECT * FROM MeterHealthReport WHERE DRN = ? ORDER BY created_at DESC LIMIT 50',
      [drn]
    );
    res.json({ success: true, drn, reports: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// RELAY LOGS
// ═══════════════════════════════════════════════════════════════════════

/**
 * GET /mqtt/relay-logs/:drn
 * Get relay event log for a meter (last 50 events)
 */
router.get('/mqtt/relay-logs/:drn', authenticateToken, async (req, res) => {
  try {
    const drn = req.params.drn;
    const rows = await queryAll(
      'SELECT * FROM MeterRelayEvents WHERE DRN = ? ORDER BY created_at DESC LIMIT 50',
      [drn]
    );
    res.json({ success: true, drn, events: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /mqtt/relay-logs/:drn/request
 * Request the meter to publish its current relay logs
 */
router.post('/mqtt/relay-logs/:drn/request', authenticateToken, (req, res) => {
  try {
    const drn = req.params.drn;
    mqttHandler.publishCommand(drn, { type: 'relay_log_request' });
    res.json({ success: true, message: `Relay log request sent to ${drn}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// LOAD CONTROL (mains + geyser via MQTT)
// ═══════════════════════════════════════════════════════════════════════

/**
 * POST /mqtt/load-control/:drn
 * Send load control command (mains/geyser) via MQTT
 * Body: { "mc": 1 } and/or { "ms": 1 } and/or { "gc": 1 } and/or { "gs": 1 }
 */
router.post('/mqtt/load-control/:drn', authenticateToken, (req, res) => {
  try {
    const drn = req.params.drn;
    const { mc, ms, gc, gs } = req.body;

    if (mc === undefined && ms === undefined && gc === undefined && gs === undefined) {
      return res.status(400).json({ error: 'At least one control parameter required (mc, ms, gc, gs)' });
    }

    const cmd = {};
    if (mc !== undefined) cmd.mc = parseInt(mc);
    if (ms !== undefined) cmd.ms = parseInt(ms);
    if (gc !== undefined) cmd.gc = parseInt(gc);
    if (gs !== undefined) cmd.gs = parseInt(gs);

    mqttHandler.publishCommand(drn, cmd);
    res.json({ success: true, message: `Load control sent to ${drn}`, command: cmd });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// CREDIT TRANSFER (meter-to-meter unit transfer via MQTT)
// ═══════════════════════════════════════════════════════════════════════

/**
 * POST /mqtt/credit-transfer/:drn
 * Transfer units from one meter to another
 * Body: { "target_meter": "1234", "watt_hours": 1000 }
 * The source meter (drn) generates an offline token for the target meter
 */
router.post('/mqtt/credit-transfer/:drn', authenticateToken, (req, res) => {
  try {
    const drn = req.params.drn;
    const { target_meter, watt_hours } = req.body;

    if (!target_meter || target_meter.length < 4) {
      return res.status(400).json({ error: 'target_meter is required (min 4 digits)' });
    }

    if (!watt_hours || watt_hours <= 0 || watt_hours > 50000) {
      return res.status(400).json({ error: 'watt_hours must be between 1 and 50000' });
    }

    const whInt = parseInt(watt_hours);

    // Create a transfer record in the database
    db.query('INSERT INTO CreditTransfers SET ?', {
      source_drn: drn,
      target_drn: target_meter,
      watt_hours: whInt,
      status: 'pending',
    }, (err, result) => {
      if (err) {
        console.error('[CreditTransfer] DB insert error:', err.message);
        return res.status(500).json({ error: 'Failed to create transfer record' });
      }

      const transferId = result.insertId;

      // Send MQTT command to source meter
      mqttHandler.publishCommand(drn, {
        type: 'credit_transfer',
        target_meter: target_meter,
        watt_hours: whInt,
      });

      res.json({
        success: true,
        transfer_id: transferId,
        message: `Credit transfer command sent to meter ${drn}`,
        target_meter,
        watt_hours: whInt,
      });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /mqtt/credit-transfer/:drn/status/:id
 * Poll for transfer status — returns current state of the two-phase transfer
 */
router.get('/mqtt/credit-transfer/:drn/status/:id', authenticateToken, (req, res) => {
  const { drn, id } = req.params;
  db.query(
    'SELECT * FROM CreditTransfers WHERE id = ? AND source_drn = ?',
    [id, drn],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!rows || rows.length === 0) return res.status(404).json({ error: 'Transfer not found' });
      const t = rows[0];
      res.json({
        transfer_id: t.id,
        source_drn: t.source_drn,
        target_drn: t.target_drn,
        watt_hours: t.watt_hours,
        token: t.token,
        status: t.status,
        error_detail: t.error_detail,
        source_ack_at: t.source_ack_at,
        target_ack_at: t.target_ack_at,
        created_at: t.created_at,
      });
    }
  );
});

// ═══════════════════════════════════════════════════════════════════════
// STATUS & TEST
// ═══════════════════════════════════════════════════════════════════════

/**
 * GET /mqtt/status
 * Check MQTT connection status
 */
router.get('/mqtt/status', authenticateToken, (req, res) => {
  const client = mqttHandler.getClient();
  res.json({
    connected: client ? client.connected : false,
    broker: process.env.MQTT_BROKER || 'mqtt://localhost:1883',
  });
});

/**
 * POST /mqtt/test-publish
 * Publish a test message to verify MQTT pipeline
 */
router.post('/mqtt/test-publish', authenticateToken, (req, res) => {
  try {
    const client = mqttHandler.getClient();
    if (!client || !client.connected) {
      return res.status(503).json({ error: 'MQTT client not connected' });
    }
    const drn = req.body.drn || 'TEST-0001';
    const testData = [0.5, 230.1, 115.0, 12.3, 115.7, 25.0, 50.0, 0.99, Math.floor(Date.now()/1000)];
    client.publish(`gx/${drn}/power`, JSON.stringify(testData), { qos: 0 }, (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, message: `Test message published to gx/${drn}/power`, data: testData });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
