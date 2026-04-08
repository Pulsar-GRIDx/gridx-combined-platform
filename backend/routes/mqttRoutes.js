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
    const { token, amount, kWh } = req.body;

    if (!token || !/^\d{20}$/.test(token)) {
      return res.status(400).json({ error: 'Token must be exactly 20 digits' });
    }

    // Use QoS 1 for critical token delivery
    mqttHandler.publishCommand(drn, { type: 'token', token }, 1);

    // Log to VendingTransactions so it appears in Vending & Credit Transfer History
    const operatorName = req.user ? ((req.user.FirstName || '') + ' ' + (req.user.LastName || '')).trim() || 'System' : 'System';
    const operatorId = (req.user && req.user.Admin_ID) || null;
    const refNo = 'TXN-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();

    db.query(
      'INSERT INTO VendingTransactions (refNo, meterNo, amount, kWh, token, operator, operatorId, type, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, "Completed")',
      [refNo, drn, amount || 0, kWh || 0, token, operatorName, operatorId, 'MQTT Token Send'],
      (err) => {
        if (err) console.error('[MQTT] VendingTransaction log error:', err.message);
      }
    );

    res.json({
      success: true,
      message: `Token sent to ${drn} via MQTT`,
      drn,
      token_length: token.length,
      refNo,
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

/**
 * POST /mqtt/relay-logs/:drn/test
 * Insert a test relay event directly into the database to validate the pipeline
 * Also publishes via MQTT to test the full path
 */
router.post('/mqtt/relay-logs/:drn/test', authenticateToken, async (req, res) => {
  try {
    const drn = req.params.drn;
    const now = Math.floor(Date.now() / 1000);
    const testEvent = {
      DRN: drn,
      event_timestamp: now,
      relay_index: req.body.relay_index != null ? req.body.relay_index : 1,
      entry_type: req.body.entry_type != null ? req.body.entry_type : 0,
      state: req.body.state != null ? req.body.state : 0,
      control: 1,
      reason: req.body.reason != null ? req.body.reason : 5,
      reason_text: req.body.reason_text || 'Test event from dashboard',
      trigger_val: 1,
    };

    // Direct DB insert
    await new Promise((resolve, reject) => {
      db.query('INSERT INTO MeterRelayEvents SET ?', testEvent, (err, result) => {
        if (err) reject(err); else resolve(result);
      });
    });

    // Also try MQTT self-publish to test the handler path
    try {
      const client = mqttHandler.getClient();
      if (client && client.connected) {
        const topic = `gx/${drn}/relay_log`;
        const payload = JSON.stringify({ events: [{
          timestamp: now, relay_index: testEvent.relay_index,
          entry_type: testEvent.entry_type, state: testEvent.state,
          control: testEvent.control, reason: testEvent.reason,
          reason_text: 'MQTT self-test', trigger: 1,
        }]});
        client.publish(topic, payload, { qos: 0 });
        console.log(`[MQTT] Test relay event published to ${topic}`);
      }
    } catch (mqttErr) {
      console.error('[MQTT] Test self-publish error:', mqttErr.message);
    }

    res.json({ success: true, message: `Test relay event inserted for ${drn}`, event: testEvent });
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

/**
 * GET /mqtt/credit-transfers
 * List all credit transfers (admin view) with optional filters
 * Query params: status, source_drn, target_drn, from, to, limit, offset
 */
router.get('/mqtt/credit-transfers', authenticateToken, (req, res) => {
  const { status, source_drn, target_drn, from, to, limit = 100, offset = 0 } = req.query;
  let sql = 'SELECT * FROM CreditTransfers WHERE 1=1';
  const params = [];

  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (source_drn) { sql += ' AND source_drn = ?'; params.push(source_drn); }
  if (target_drn) { sql += ' AND target_drn = ?'; params.push(target_drn); }
  if (from) { sql += ' AND created_at >= ?'; params.push(from); }
  if (to) { sql += ' AND created_at <= ?'; params.push(to + ' 23:59:59'); }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  db.query(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    // Also get summary counts
    db.query(
      `SELECT status, COUNT(*) as count FROM CreditTransfers GROUP BY status`,
      (err2, counts) => {
        const summary = {};
        if (!err2 && counts) counts.forEach(r => { summary[r.status] = r.count; });
        res.json({ transfers: rows || [], summary });
      }
    );
  });
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

// ═══════════════════════════════════════════════════════════════════════
// LIVE STATUS — meter online/offline based on MQTT last-seen
// ═══════════════════════════════════════════════════════════════════════

/**
 * GET /mqtt/live-status
 * Returns live/offline meter counts and per-meter status.
 * A meter is "live" if it sent an MQTT message within the last 5 minutes.
 * Query: ?threshold=300 (seconds, default 300 = 5 min)
 */
router.get('/mqtt/live-status', authenticateToken, async (req, res) => {
  try {
    const thresholdSec = parseInt(req.query.threshold) || 300;

    const [summary] = await Promise.all([
      queryAll(
        `SELECT
           COUNT(*) as totalTracked,
           SUM(CASE WHEN last_seen >= NOW() - INTERVAL ? SECOND THEN 1 ELSE 0 END) as liveCount,
           SUM(CASE WHEN last_seen < NOW() - INTERVAL ? SECOND THEN 1 ELSE 0 END) as offlineCount
         FROM MeterLastSeen`,
        [thresholdSec, thresholdSec]
      ),
    ]);

    const meters = await queryAll(
      `SELECT DRN, last_seen, last_topic, message_count,
              CASE WHEN last_seen >= NOW() - INTERVAL ? SECOND THEN 'live' ELSE 'offline' END as status
       FROM MeterLastSeen ORDER BY last_seen DESC`,
      [thresholdSec]
    );

    const s = summary[0] || {};
    res.json({
      success: true,
      threshold_seconds: thresholdSec,
      totalTracked: s.totalTracked || 0,
      liveCount: parseInt(s.liveCount) || 0,
      offlineCount: parseInt(s.offlineCount) || 0,
      meters,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// DASHBOARD STATS — aggregated MQTT-logged data for dashboard
// ═══════════════════════════════════════════════════════════════════════

/**
 * GET /mqtt/dashboard-stats
 * Single endpoint returning all dashboard KPIs from MQTT-logged data:
 *   - Live/offline counts, total meters
 *   - System power (latest from all meters)
 *   - Today's energy consumption
 *   - Today's token count and revenue
 *   - Hourly power breakdown (24h)
 *   - Recent token entries
 */
router.get('/mqtt/dashboard-stats', authenticateToken, async (req, res) => {
  try {
    const thresholdSec = parseInt(req.query.threshold) || 300;

    // Run all queries in parallel
    const [
      liveStatus,
      totalMeters,
      systemPower,
      todayEnergy,
      todayTokens,
      hourlyPower,
      recentTokens,
      hourlyTokenCounts,
      remainingUnits,
      hourlyEnergy,
    ] = await Promise.allSettled([
      // 1. Live/offline from MeterLastSeen
      queryAll(
        `SELECT
           COUNT(*) as totalTracked,
           SUM(CASE WHEN last_seen >= NOW() - INTERVAL ? SECOND THEN 1 ELSE 0 END) as liveCount,
           SUM(CASE WHEN last_seen < NOW() - INTERVAL ? SECOND THEN 1 ELSE 0 END) as offlineCount
         FROM MeterLastSeen`,
        [thresholdSec, thresholdSec]
      ),
      // 2. Total registered meters
      queryAll('SELECT COUNT(DISTINCT DRN) as total FROM MeterProfileReal', []),
      // 3. System-wide power (avg of latest reading per meter in last 10 min)
      queryAll(
        `SELECT
           ROUND(AVG(p.active_power), 1) as avgPower,
           ROUND(MAX(p.active_power), 1) as peakPower,
           ROUND(AVG(p.voltage), 1) as avgVoltage,
           ROUND(AVG(p.current), 3) as avgCurrent,
           ROUND(AVG(p.power_factor), 2) as avgPF,
           COUNT(DISTINCT p.DRN) as reportingMeters
         FROM MeteringPower p
         INNER JOIN (
           SELECT DRN, MAX(id) as maxId FROM MeteringPower
           WHERE date_time >= NOW() - INTERVAL 10 MINUTE
           GROUP BY DRN
         ) latest ON p.DRN = latest.DRN AND p.id = latest.maxId`,
        []
      ),
      // 4. Today's total energy consumption (delta of active_energy per meter today)
      queryAll(
        `SELECT
           ROUND(COALESCE(SUM(delta), 0), 2) as totalKwh,
           COUNT(*) as metersReporting
         FROM (
           SELECT DRN,
             CAST(MAX(active_energy) AS DECIMAL(12,2)) - CAST(MIN(active_energy) AS DECIMAL(12,2)) as delta
           FROM MeterCumulativeEnergyUsage
           WHERE DATE(date_time) = CURDATE()
           GROUP BY DRN
           HAVING delta > 0
         ) d`,
        []
      ),
      // 5. Today's tokens (count + revenue from STSTokesInfo)
      queryAll(
        `SELECT
           COUNT(*) as tokenCount,
           ROUND(COALESCE(SUM(token_amount), 0), 2) as totalRevenue
         FROM STSTokesInfo
         WHERE DATE(date_time) = CURDATE()`,
        []
      ),
      // 6. Hourly power (24h breakdown)
      queryAll(
        `SELECT
           HOUR(date_time) as hour,
           ROUND(AVG(active_power), 2) as avgPower,
           ROUND(SUM(active_power), 2) as totalPower,
           COUNT(*) as readings
         FROM MeteringPower
         WHERE DATE(date_time) = CURDATE()
         GROUP BY HOUR(date_time)
         ORDER BY hour`,
        []
      ),
      // 7. Recent token entries (last 30)
      queryAll(
        `SELECT id, DRN, token_id, token_cls, submission_Method, display_msg,
                display_auth_result, display_token_result, display_validation_result,
                token_time, token_amount, date_time
         FROM STSTokesInfo
         ORDER BY id DESC LIMIT 30`,
        []
      ),
      // 8. Hourly token counts for today
      queryAll(
        `SELECT
           HOUR(date_time) as hour,
           COUNT(*) as count,
           ROUND(COALESCE(SUM(token_amount), 0), 2) as revenue
         FROM STSTokesInfo
         WHERE DATE(date_time) = CURDATE()
         GROUP BY HOUR(date_time)
         ORDER BY hour`,
        []
      ),
      // 9. Total remaining units (credits) across all meters — latest reading per meter
      queryAll(
        `SELECT ROUND(COALESCE(SUM(latest_units), 0), 2) as totalRemainingUnits,
                COUNT(*) as metersWithUnits
         FROM (
           SELECT e.DRN, e.units as latest_units
           FROM MeterCumulativeEnergyUsage e
           INNER JOIN (SELECT DRN, MAX(id) as maxId FROM MeterCumulativeEnergyUsage GROUP BY DRN) m
             ON e.DRN = m.DRN AND e.id = m.maxId
           WHERE e.units > 0
         ) u`,
        []
      ),
      // 10. Hourly energy consumption for today (kWh per hour from power readings)
      queryAll(
        `SELECT
           HOUR(date_time) as hour,
           ROUND(AVG(active_power) / 1000, 3) as kWh
         FROM MeteringPower
         WHERE DATE(date_time) = CURDATE()
         GROUP BY HOUR(date_time)
         ORDER BY hour`,
        []
      ),
    ]);

    // Build 24-hour array for hourly power
    const hourlyPowerArr = new Array(24).fill(0);
    if (hourlyPower.status === 'fulfilled') {
      hourlyPower.value.forEach(row => {
        hourlyPowerArr[row.hour] = row.avgPower || 0;
      });
    }

    // Build 24-hour array for hourly tokens
    const hourlyTokenArr = new Array(24).fill(0);
    if (hourlyTokenCounts.status === 'fulfilled') {
      hourlyTokenCounts.value.forEach(row => {
        hourlyTokenArr[row.hour] = { count: row.count, revenue: row.revenue };
      });
    }

    const live = liveStatus.status === 'fulfilled' ? liveStatus.value[0] || {} : {};
    const total = totalMeters.status === 'fulfilled' ? totalMeters.value[0] || {} : {};
    const power = systemPower.status === 'fulfilled' ? systemPower.value[0] || {} : {};
    const energy = todayEnergy.status === 'fulfilled' ? todayEnergy.value[0] || {} : {};
    const tokens = todayTokens.status === 'fulfilled' ? todayTokens.value[0] || {} : {};
    const units = remainingUnits.status === 'fulfilled' ? remainingUnits.value[0] || {} : {};

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      kpis: {
        totalMeters: parseInt(total.total) || 0,
        liveMeters: parseInt(live.liveCount) || 0,
        offlineMeters: parseInt(live.offlineCount) || 0,
        totalTracked: parseInt(live.totalTracked) || 0,
        systemLoad: power.avgPower ? Math.min(100, Math.round((power.avgPower / 5000) * 100)) : 0,
      },
      power: {
        avgPower: parseFloat(power.avgPower) || 0,
        peakPower: parseFloat(power.peakPower) || 0,
        avgVoltage: parseFloat(power.avgVoltage) || 0,
        avgCurrent: parseFloat(power.avgCurrent) || 0,
        avgPF: parseFloat(power.avgPF) || 0,
        reportingMeters: parseInt(power.reportingMeters) || 0,
      },
      energy: {
        todayKwh: parseFloat(energy.totalKwh) || 0,
        metersReporting: parseInt(energy.metersReporting) || 0,
      },
      tokens: {
        todayCount: parseInt(tokens.tokenCount) || 0,
        todayRevenue: parseFloat(tokens.totalRevenue) || 0,
      },
      hourlyPower: hourlyPowerArr,
      hourlyTokens: hourlyTokenArr,
      recentTokens: recentTokens.status === 'fulfilled' ? recentTokens.value : [],
      credits: {
        totalRemainingUnits: parseFloat(units.totalRemainingUnits) || 0,
        metersWithUnits: parseInt(units.metersWithUnits) || 0,
      },
      hourlyEnergy: (() => {
        const arr = new Array(24).fill(0);
        if (hourlyEnergy.status === 'fulfilled') {
          hourlyEnergy.value.forEach(row => { arr[row.hour] = parseFloat(row.kWh) || 0; });
        }
        return arr;
      })(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Meter Health Report (computed from MQTT power/energy data) =====
router.get('/mqtt/meter-health/:drn', authenticateToken, async (req, res) => {
  const drn = req.params.drn;
  try {
    // First check if we have actual health reports from ESP32
    const existing = await queryAll(
      'SELECT * FROM MeterHealthReport WHERE DRN = ? ORDER BY created_at DESC LIMIT 1', [drn]
    );
    if (existing.length > 0) {
      return res.json({ success: true, source: 'mqtt', data: existing[0] });
    }

    // Compute health from existing MQTT power/energy data
    const [powerStats, energyStats, lastSeen, loadStats] = await Promise.all([
      queryAll(
        `SELECT
           ROUND(AVG(CAST(active_power AS DECIMAL(10,2))), 2) as avgPower,
           ROUND(MAX(CAST(active_power AS DECIMAL(10,2))), 2) as maxPower,
           ROUND(AVG(CAST(voltage AS DECIMAL(10,2))), 2) as avgVoltage,
           ROUND(AVG(CAST(current AS DECIMAL(10,4))), 4) as avgCurrent,
           ROUND(AVG(CAST(frequency AS DECIMAL(10,3))), 3) as avgFrequency,
           ROUND(AVG(CAST(power_factor AS DECIMAL(10,3))), 3) as avgPF,
           ROUND(AVG(CAST(temperature AS DECIMAL(10,1))), 1) as avgTemp,
           COUNT(*) as readings,
           ROUND(STDDEV(CAST(voltage AS DECIMAL(10,2))), 2) as voltageStdDev,
           ROUND(STDDEV(CAST(active_power AS DECIMAL(10,2))), 2) as powerStdDev
         FROM MeteringPower
         WHERE DRN = ? AND date_time >= NOW() - INTERVAL 24 HOUR`, [drn]
      ),
      queryAll(
        `SELECT
           ROUND(MAX(CAST(active_energy AS DECIMAL(12,2))) - MIN(CAST(active_energy AS DECIMAL(12,2))), 2) as dayEnergy,
           ROUND(MAX(CAST(units AS DECIMAL(12,2))), 2) as remainingUnits
         FROM MeterCumulativeEnergyUsage
         WHERE DRN = ? AND date_time >= NOW() - INTERVAL 24 HOUR`, [drn]
      ),
      queryAll('SELECT last_seen, message_count FROM MeterLastSeen WHERE DRN = ?', [drn]),
      queryAll(
        `SELECT geyser_state, geyser_control, mains_state, mains_control
         FROM MeterLoadControl WHERE DRN = ? ORDER BY date_time DESC LIMIT 1`, [drn]
      ),
    ]);

    const pw = powerStats[0] || {};
    const en = energyStats[0] || {};
    const ls = lastSeen[0] || {};
    const ld = loadStats[0] || {};

    // Compute health score (0-100)
    let score = 100;
    const issues = [];

    // Voltage check (should be ~220-240V)
    const v = parseFloat(pw.avgVoltage) || 0;
    if (v > 0 && (v < 200 || v > 260)) { score -= 15; issues.push(`Voltage ${v.toFixed(1)}V outside normal range`); }
    else if (v > 0 && (v < 210 || v > 250)) { score -= 5; issues.push(`Voltage ${v.toFixed(1)}V slightly off`); }

    // Power factor (should be close to 1.0)
    const pf = parseFloat(pw.avgPF) || 0;
    if (pf > 0 && pf < 0.7) { score -= 10; issues.push(`Low power factor: ${pf.toFixed(2)}`); }

    // Temperature check
    const temp = parseFloat(pw.avgTemp) || 0;
    if (temp > 60) { score -= 20; issues.push(`High temperature: ${temp.toFixed(1)}C`); }
    else if (temp > 45) { score -= 5; issues.push(`Elevated temperature: ${temp.toFixed(1)}C`); }

    // Voltage stability (high stddev = fluctuating)
    const vStd = parseFloat(pw.voltageStdDev) || 0;
    if (vStd > 15) { score -= 10; issues.push(`Voltage unstable (stddev: ${vStd.toFixed(1)}V)`); }

    // Data freshness
    if (ls.last_seen) {
      const minsSinceUpdate = (Date.now() - new Date(ls.last_seen).getTime()) / 60000;
      if (minsSinceUpdate > 30) { score -= 15; issues.push(`No data for ${Math.round(minsSinceUpdate)} min`); }
      else if (minsSinceUpdate > 10) { score -= 5; issues.push(`Last update ${Math.round(minsSinceUpdate)} min ago`); }
    } else {
      score -= 25; issues.push('No communication detected');
    }

    // Reading count check
    const readings = parseInt(pw.readings) || 0;
    if (readings < 10) { score -= 10; issues.push(`Low reading count: ${readings} in 24h`); }

    score = Math.max(0, Math.min(100, score));

    res.json({
      success: true,
      source: 'computed',
      data: {
        DRN: drn,
        health_score: score,
        voltage: parseFloat(pw.avgVoltage) || 0,
        current_val: parseFloat(pw.avgCurrent) || 0,
        active_power: parseFloat(pw.avgPower) || 0,
        frequency: parseFloat(pw.avgFrequency) || 0,
        power_factor: parseFloat(pw.avgPF) || 0,
        temperature: parseFloat(pw.avgTemp) || 0,
        mains_state: ld.mains_state != null ? ld.mains_state : null,
        mains_control: ld.mains_control != null ? ld.mains_control : null,
        geyser_state: ld.geyser_state != null ? ld.geyser_state : null,
        geyser_control: ld.geyser_control != null ? ld.geyser_control : null,
        readings_24h: readings,
        voltage_stddev: parseFloat(pw.voltageStdDev) || 0,
        day_energy_kwh: parseFloat(en.dayEnergy) || 0,
        remaining_units: parseFloat(en.remainingUnits) || 0,
        last_seen: ls.last_seen || null,
        message_count: ls.message_count || 0,
        issues,
        created_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[Health] Error computing health for', drn, err.message);
    res.status(500).json({ error: 'Failed to compute health report' });
  }
});

// Health history (from computed snapshots or existing records)
router.get('/mqtt/meter-health/:drn/history', authenticateToken, async (req, res) => {
  const drn = req.params.drn;
  const limit = parseInt(req.query.limit) || 72;
  try {
    const history = await queryAll(
      'SELECT * FROM MeterHealthReport WHERE DRN = ? ORDER BY created_at DESC LIMIT ?', [drn, limit]
    );
    res.json({ success: true, data: history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Relay Events (from MQTT relay_log data) =====
router.get('/mqtt/relay-events/:drn', authenticateToken, async (req, res) => {
  const drn = req.params.drn;
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  const relay = req.query.relay;
  const type = req.query.type;

  try {
    let where = 'DRN = ?';
    const params = [drn];
    if (relay !== undefined && relay !== '') { where += ' AND relay_index = ?'; params.push(parseInt(relay)); }
    if (type !== undefined && type !== '') { where += ' AND entry_type = ?'; params.push(parseInt(type)); }

    const [events, countResult] = await Promise.all([
      queryAll(`SELECT * FROM MeterRelayEvents WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]),
      queryAll(`SELECT COUNT(*) as total FROM MeterRelayEvents WHERE ${where}`, params),
    ]);

    res.json({ success: true, data: events, total: countResult[0]?.total || 0, limit, offset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/mqtt/relay-events/:drn/summary', authenticateToken, async (req, res) => {
  const drn = req.params.drn;
  const hours = parseInt(req.query.hours) || 168;
  try {
    const [summary, byRelay] = await Promise.all([
      queryAll(
        `SELECT
           reason_text, COUNT(*) as count
         FROM MeterRelayEvents
         WHERE DRN = ? AND created_at >= NOW() - INTERVAL ? HOUR
         GROUP BY reason_text ORDER BY count DESC`, [drn, hours]
      ),
      queryAll(
        `SELECT
           relay_index, entry_type, COUNT(*) as count
         FROM MeterRelayEvents
         WHERE DRN = ? AND created_at >= NOW() - INTERVAL ? HOUR
         GROUP BY relay_index, entry_type`, [drn, hours]
      ),
    ]);
    res.json({ success: true, reasons: summary, breakdown: byRelay });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== MQTT Activity Logs (recent power/energy/relay readings for a meter) =====
router.get('/mqtt/activity-log/:drn', authenticateToken, async (req, res) => {
  const drn = req.params.drn;
  const limit = parseInt(req.query.limit) || 20;
  try {
    const [power, energy, relays] = await Promise.allSettled([
      queryAll(
        `SELECT id, voltage, current, active_power, power_factor, temperature, frequency, date_time
         FROM MeteringPower WHERE DRN = ? ORDER BY id DESC LIMIT ?`, [drn, limit]
      ),
      queryAll(
        `SELECT id, active_energy, reactive_energy, units, tamper_state, date_time
         FROM MeterCumulativeEnergyUsage WHERE DRN = ? ORDER BY id DESC LIMIT ?`, [drn, limit]
      ),
      queryAll(
        `SELECT id, relay_index, entry_type, state, reason_text, created_at
         FROM MeterRelayEvents WHERE DRN = ? ORDER BY id DESC LIMIT ?`, [drn, limit]
      ),
    ]);
    res.json({
      success: true,
      power: power.status === 'fulfilled' ? power.value : [],
      energy: energy.status === 'fulfilled' ? energy.value : [],
      relays: relays.status === 'fulfilled' ? relays.value : [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== All Meters Health Summary (for scatter chart) =====
router.get('/mqtt/meters-health-summary', authenticateToken, async (req, res) => {
  try {
    const meters = await queryAll(
      `SELECT
         m.DRN,
         CONCAT(m.Name, ' ', m.Surname) as meter_name,
         m.Region as suburb,
         m.StreetName as street_name,
         ls.last_seen,
         ls.message_count,
         ROUND(AVG(CAST(p.voltage AS DECIMAL(10,2))), 2) as avgVoltage,
         ROUND(AVG(CAST(p.active_power AS DECIMAL(10,2))), 2) as avgPower,
         ROUND(AVG(CAST(p.power_factor AS DECIMAL(10,3))), 3) as avgPF,
         ROUND(AVG(CAST(p.temperature AS DECIMAL(10,1))), 1) as avgTemp,
         ROUND(STDDEV(CAST(p.voltage AS DECIMAL(10,2))), 2) as voltageStdDev,
         ROUND(STDDEV(CAST(p.active_power AS DECIMAL(10,2))), 2) as powerStdDev,
         COUNT(p.id) as readings24h,
         ROUND(COALESCE(e.remaining_units, 0), 2) as remainingUnits
       FROM MeterProfileReal m
       LEFT JOIN MeterLastSeen ls ON m.DRN = ls.DRN
       LEFT JOIN MeteringPower p ON m.DRN = p.DRN AND p.date_time >= NOW() - INTERVAL 24 HOUR
       LEFT JOIN (
         SELECT e1.DRN, e1.units as remaining_units
         FROM MeterCumulativeEnergyUsage e1
         INNER JOIN (SELECT DRN, MAX(id) as maxId FROM MeterCumulativeEnergyUsage GROUP BY DRN) e2
           ON e1.DRN = e2.DRN AND e1.id = e2.maxId
       ) e ON m.DRN = e.DRN
       GROUP BY m.DRN`, []
    );

    // Compute health score for each meter
    const result = meters.map(m => {
      let score = 100;
      let status = 'healthy';
      const flags = [];

      const v = parseFloat(m.avgVoltage) || 0;
      if (v > 0 && (v < 200 || v > 260)) { score -= 15; flags.push('voltage_out_of_range'); }
      else if (v > 0 && (v < 210 || v > 250)) { score -= 5; }

      const pf = parseFloat(m.avgPF) || 0;
      if (pf > 0 && pf < 0.7) { score -= 10; flags.push('low_power_factor'); }

      const temp = parseFloat(m.avgTemp) || 0;
      if (temp > 60) { score -= 20; flags.push('overheating'); }
      else if (temp > 45) { score -= 5; flags.push('elevated_temp'); }

      const vStd = parseFloat(m.voltageStdDev) || 0;
      if (vStd > 15) { score -= 10; flags.push('voltage_unstable'); }

      const pStd = parseFloat(m.powerStdDev) || 0;
      if (pStd > 500) { score -= 5; flags.push('power_fluctuation'); }

      if (m.last_seen) {
        const mins = (Date.now() - new Date(m.last_seen).getTime()) / 60000;
        if (mins > 60) { score -= 20; flags.push('offline'); }
        else if (mins > 10) { score -= 5; flags.push('intermittent'); }
      } else {
        score -= 30; flags.push('no_communication');
      }

      const readings = parseInt(m.readings24h) || 0;
      if (readings < 5) { score -= 10; flags.push('low_data'); }

      score = Math.max(0, Math.min(100, score));
      if (score < 50) status = 'suspicious';
      else if (score < 75) status = 'warning';

      return {
        drn: m.DRN,
        name: m.meter_name || m.DRN,
        suburb: m.suburb || '',
        healthScore: score,
        status,
        flags,
        avgVoltage: v,
        avgPower: parseFloat(m.avgPower) || 0,
        avgPF: pf,
        temperature: temp,
        voltageStdDev: vStd,
        powerStdDev: pStd,
        readings24h: readings,
        remainingUnits: parseFloat(m.remainingUnits) || 0,
        lastSeen: m.last_seen,
        messageCount: parseInt(m.message_count) || 0,
      };
    });

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[HealthSummary] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
