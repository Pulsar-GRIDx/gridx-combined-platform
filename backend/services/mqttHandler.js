/**
 * MQTT Handler — Bridges MQTT telemetry from ESP32 meters to MySQL.
 * Subscribes to gx/{drn}/{type} topics and parses binary packed payloads.
 * Also provides publishCommand() for sending JSON control commands to meters.
 *
 * Binary Protocol (all little-endian):
 *   0x01 Power  (37B): type(1) current(f32) voltage(f32) active(f32) reactive(f32)
 *                       apparent(f32) temp(f32) freq(f32) pf(f32) epoch(u32)
 *   0x02 Energy (23B): type(1) active_Wh(f32) reactive_Wh(f32) credit_Wh(f32)
 *                       tamper(u8) tamper_ts(u32) resets(u8) epoch(u32)
 *   0x03 Cellular(var): type(1) rssi(i16) operator(lstr) phone(lstr) imei(lstr) epoch(u32)
 *   0x04 Load    (5B): type(1) geyser_state(u8) geyser_ctrl(u8) mains_state(u8) mains_ctrl(u8)
 *   0x05 Token  (var): type(1) token_id(lstr) cls(u8) method(u8) msg(lstr) auth(u8)
 *                       token_result(u8) validation(u8) time(u32) amount(f32)
 *   lstr = 1-byte length prefix + string bytes
 */
const mqtt = require('mqtt');
const http = require('http');
const db = require('../config/db');

let mqttClient = null;

const TOPICS = [
  'gx/+/power',
  'gx/+/energy',
  'gx/+/cellular',
  'gx/+/load',
  'gx/+/token',
  'gx/+/ack',
  'gx/+/health',
  'gx/+/relay_log',
  'gx/+/auth_numbers',
];

// ==================== Binary Parser Helpers ====================

function readLStr(buf, offset) {
  const len = buf.readUInt8(offset);
  const value = buf.toString('utf8', offset + 1, offset + 1 + len);
  return { value, bytesRead: 1 + len };
}

// ==================== EMQX REST API ====================

function emqxApi(method, path, body) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from('gridxadmin:gridx2026').toString('base64');
    const options = {
      hostname: '127.0.0.1',
      port: 18083,
      path: `/api/v5${path}`,
      method,
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', (e) => reject(e));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function fixEmqxAuth() {
  try {
    console.log('[MQTT] Fixing EMQX authorization settings...');
    await emqxApi('PUT', '/authorization/settings', { no_match: 'allow', deny_action: 'ignore' });

    const sources = await emqxApi('GET', '/authorization/sources');
    if (Array.isArray(sources.data)) {
      for (const src of sources.data) {
        if (src.type === 'http' && src.enable !== false) {
          await emqxApi('PUT', `/authorization/sources/${src.type}`, { ...src, enable: false });
        }
      }
    }

    const authBackends = await emqxApi('GET', '/authentication');
    if (Array.isArray(authBackends.data)) {
      for (const b of authBackends.data) {
        if (b.mechanism === 'password_based' && b.backend === 'http' && b.enable !== false) {
          await emqxApi('PUT', `/authentication/${b.id}`, { ...b, enable: false });
        }
      }
      const builtIn = authBackends.data.find(b => b.backend === 'built_in_database');
      if (builtIn && !builtIn.enable) {
        await emqxApi('PUT', `/authentication/${builtIn.id}`, { ...builtIn, enable: true });
      }
    }

    const users = await emqxApi('GET', '/authentication/password_based:built_in_database/users?page=1&limit=100');
    if (users.data && users.data.data) {
      if (!users.data.data.some(u => u.user_id === 'gridx-backend')) {
        await emqxApi('POST', '/authentication/password_based:built_in_database/users',
          { user_id: 'gridx-backend', password: 'gridx-mqtt-2026', is_superuser: true });
      }
      if (!users.data.data.some(u => u.user_id === 'gridx-meter')) {
        await emqxApi('POST', '/authentication/password_based:built_in_database/users',
          { user_id: 'gridx-meter', password: 'meter-mqtt-2026', is_superuser: false });
      }
    }
    console.log('[MQTT] EMQX authorization fix complete');
  } catch (err) {
    console.error('[MQTT] EMQX fix error (non-fatal):', err.message);
  }
}

// ==================== Table Initialization ====================

function ensureTables() {
  // MeterAuthorizedNumbers already exists with (drn, phone_number) schema — no need to create

  db.query(`CREATE TABLE IF NOT EXISTS MeterHealthReport (
    id INT AUTO_INCREMENT PRIMARY KEY,
    DRN VARCHAR(50) NOT NULL,
    health_score INT,
    uart_errors INT, relay_mismatches INT, power_anomalies INT,
    voltage FLOAT, current_val FLOAT, active_power FLOAT,
    frequency FLOAT, power_factor FLOAT, temperature FLOAT,
    mains_state TINYINT, mains_control TINYINT,
    geyser_state TINYINT, geyser_control TINYINT,
    firmware VARCHAR(20), uptime INT,
    record_time INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_drn (DRN)
  )`, (err) => { if (err) console.error('[MQTT] MeterHealthReport table error:', err.message); });

  db.query(`CREATE TABLE IF NOT EXISTS MeterRelayEvents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    DRN VARCHAR(50) NOT NULL,
    event_timestamp INT,
    relay_index TINYINT,
    entry_type TINYINT,
    state TINYINT,
    control TINYINT,
    reason TINYINT,
    reason_text VARCHAR(64),
    trigger_val TINYINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_drn (DRN)
  )`, (err) => { if (err) console.error('[MQTT] MeterRelayEvents table error:', err.message); });

  db.query(`CREATE TABLE IF NOT EXISTS CreditTransfers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    source_drn VARCHAR(50) NOT NULL,
    target_drn VARCHAR(50) NOT NULL,
    watt_hours INT NOT NULL,
    token VARCHAR(255),
    status ENUM('pending','token_generated','forwarded','completed','failed') DEFAULT 'pending',
    source_ack_at TIMESTAMP NULL,
    target_ack_at TIMESTAMP NULL,
    error_detail VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_source (source_drn),
    INDEX idx_target (target_drn),
    INDEX idx_status (status)
  )`, (err) => { if (err) console.error('[MQTT] CreditTransfers table error:', err.message); });
}

// ==================== Init ====================

async function init() {
  await fixEmqxAuth();
  ensureTables();

  const brokerUrl = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
  mqttClient = mqtt.connect(brokerUrl, {
    clientId: `gridx-backend-${Date.now()}`,
    clean: true,
    reconnectPeriod: 5000,
    username: process.env.MQTT_USER || 'gridx-backend',
    password: process.env.MQTT_PASS || 'gridx-mqtt-2026',
  });

  mqttClient.on('connect', () => {
    console.log('[MQTT] Connected to broker:', brokerUrl);
    mqttClient.subscribe(TOPICS, { qos: 0 }, (err) => {
      if (err) console.error('[MQTT] Subscribe error:', err.message);
      else console.log('[MQTT] Subscribed to:', TOPICS.join(', '));
    });
  });

  mqttClient.on('message', (topic, message) => {
    try { handleMessage(topic, message); }
    catch (err) { console.error('[MQTT] Message handling error:', err.message); }
  });

  mqttClient.on('error', (err) => console.error('[MQTT] Connection error:', err.message));
  mqttClient.on('reconnect', () => console.log('[MQTT] Reconnecting...'));

  return mqttClient;
}

// ==================== Message Router ====================

function handleMessage(topic, buf) {
  const parts = topic.split('/');
  if (parts.length !== 3 || parts[0] !== 'gx') return;

  const drn = parts[1];
  const type = parts[2];

  // JSON-only topics (ack, health, relay_log, auth_numbers)
  if (['ack', 'health', 'relay_log', 'auth_numbers'].includes(type)) {
    try {
      const data = JSON.parse(buf.toString());
      switch (type) {
        case 'ack':          handleAckJson(drn, data); break;
        case 'health':       handleHealthJson(drn, data); break;
        case 'relay_log':    handleRelayLogJson(drn, data); break;
        case 'auth_numbers': handleAuthNumbersJson(drn, data); break;
      }
    } catch (e) {
      console.error(`[MQTT] Invalid JSON on ${topic}:`, e.message);
    }
    return;
  }

  const firstByte = buf[0];

  // Binary payloads start with type byte 0x01-0x05
  if (firstByte >= 0x01 && firstByte <= 0x05) {
    console.log(`[MQTT] ${type} from ${drn} (binary, ${buf.length}B)`);
    switch (type) {
      case 'power':    handlePowerBin(drn, buf); break;
      case 'energy':   handleEnergyBin(drn, buf); break;
      case 'cellular': handleCellularBin(drn, buf); break;
      case 'load':     handleLoadBin(drn, buf); break;
      case 'token':    handleTokenBin(drn, buf); break;
      default:         console.warn(`[MQTT] Unknown type: ${type}`);
    }
    return;
  }

  // Legacy JSON fallback
  try {
    const data = JSON.parse(buf.toString());
    console.log(`[MQTT] ${type} from ${drn} (JSON fallback)`);
    handleJsonMessage(drn, type, data);
  } catch (e) {
    console.error(`[MQTT] Invalid payload on ${topic}`);
  }
}

// ==================== Binary Handlers ====================

function handlePowerBin(drn, buf) {
  if (buf.length < 37) return console.error('[MQTT] Power packet too short:', buf.length);
  db.query('INSERT INTO MeteringPower SET ?', {
    DRN: drn,
    current:        buf.readFloatLE(1),
    voltage:        buf.readFloatLE(5),
    active_power:   buf.readFloatLE(9),
    reactive_power: buf.readFloatLE(13),
    apparent_power: buf.readFloatLE(17),
    temperature:    buf.readFloatLE(21),
    frequency:      buf.readFloatLE(25),
    power_factor:   buf.readFloatLE(29),
    record_time:    buf.readUInt32LE(33),
    source: 1,
  }, (err) => { if (err) console.error('[MQTT] Power insert error:', err.message); });
}

function handleEnergyBin(drn, buf) {
  if (buf.length < 23) return console.error('[MQTT] Energy packet too short:', buf.length);
  db.query('INSERT INTO MeterCumulativeEnergyUsage SET ?', {
    DRN: drn,
    active_energy:   buf.readFloatLE(1),
    reactive_energy: buf.readFloatLE(5),
    units:           buf.readFloatLE(9),
    tamper_state:    buf.readUInt8(13),
    tamp_time:       buf.readUInt32LE(14),
    meter_reset:     buf.readUInt8(18),
    record_time:     buf.readUInt32LE(19),
    source: 1,
  }, (err) => { if (err) console.error('[MQTT] Energy insert error:', err.message); });
}

function handleCellularBin(drn, buf) {
  if (buf.length < 10) return console.error('[MQTT] Cellular packet too short:', buf.length);
  let off = 1;
  const rssi = buf.readInt16LE(off); off += 2;
  const op = readLStr(buf, off); off += op.bytesRead;
  const ph = readLStr(buf, off); off += ph.bytesRead;
  const im = readLStr(buf, off); off += im.bytesRead;
  const epoch = buf.readUInt32LE(off);

  db.query('INSERT INTO MeterCellularNetworkProperties SET ?', {
    DRN: drn, signal_strength: rssi, service_provider: op.value,
    sim_phone_number: ph.value, IMEU: im.value, record_time: epoch,
  }, (err) => { if (err) console.error('[MQTT] Cellular insert error:', err.message); });
}

function handleLoadBin(drn, buf) {
  if (buf.length < 5) return console.error('[MQTT] Load packet too short:', buf.length);
  db.query('INSERT INTO MeterLoadControl SET ?', {
    DRN: drn,
    geyser_state:   buf.readUInt8(1),
    geyser_control: buf.readUInt8(2),
    mains_state:    buf.readUInt8(3),
    mains_control:  buf.readUInt8(4),
  }, (err) => { if (err) console.error('[MQTT] Load insert error:', err.message); });
}

function handleTokenBin(drn, buf) {
  if (buf.length < 15) return console.error('[MQTT] Token packet too short:', buf.length);
  let off = 1;
  const tid = readLStr(buf, off); off += tid.bytesRead;
  const cls = buf.readUInt8(off++);
  const method = buf.readUInt8(off++);
  const msg = readLStr(buf, off); off += msg.bytesRead;
  const auth = buf.readUInt8(off++);
  const tres = buf.readUInt8(off++);
  const vres = buf.readUInt8(off++);
  const ttime = buf.readUInt32LE(off); off += 4;
  const amt = buf.readFloatLE(off);

  db.query('INSERT INTO STSTokesInfo SET ?', {
    DRN: drn, token_id: tid.value, token_cls: cls, submission_Method: method,
    display_msg: msg.value, display_auth_result: auth, display_token_result: tres,
    display_validation_result: vres, token_time: ttime, token_amount: amt,
  }, (err) => { if (err) console.error('[MQTT] Token insert error:', err.message); });
}

// ==================== JSON Handlers (new MQTT topics) ====================

function handleAckJson(drn, data) {
  console.log(`[MQTT] ACK from ${drn}: type=${data.type}, status=${data.status}${data.detail ? ', detail=' + data.detail : ''}${data.amount !== undefined ? ', amount=' + data.amount : ''}`);

  // On successful geyser control ACK, immediately update MeterLoadControl
  // so the app can poll and see the new state without waiting 15 min for the load topic
  if (data.type === 'geyser_control' && data.status === 'ok') {
    const geyserState = data.detail === 'on' ? 1 : 0;
    // Get last known mains values to build a complete record
    db.query(
      'SELECT mains_state, mains_control FROM MeterLoadControl WHERE DRN = ? ORDER BY date_time DESC LIMIT 1',
      [drn],
      (err, rows) => {
        const mainsState = (!err && rows && rows.length > 0) ? rows[0].mains_state : 0;
        const mainsControl = (!err && rows && rows.length > 0) ? rows[0].mains_control : 0;
        db.query('INSERT INTO MeterLoadControl SET ?', {
          DRN: drn,
          geyser_state: geyserState,
          geyser_control: geyserState,
          mains_state: mainsState,
          mains_control: mainsControl,
        }, (err2) => {
          if (err2) console.error('[MQTT] ACK LoadControl insert error:', err2.message);
          else console.log(`[MQTT] ACK updated MeterLoadControl: geyser_state=${geyserState} for ${drn}`);
        });
      }
    );

    // Also keep GeyserConfig in sync
    db.query('UPDATE GeyserConfig SET geyser_state = ? WHERE DRN = ?', [geyserState, drn], (err) => {
      if (err) console.error('[MQTT] ACK GeyserConfig update error:', err.message);
    });

    // Insert into MeterHeaterStateTable so "Last turned ON/OFF" on home page updates
    db.query('INSERT INTO MeterHeaterStateTable SET ?', {
      DRN: drn,
      user: 'MQTT_ACK',
      state: geyserState,
      processed: '1',
      reason: data.detail === 'on' ? 'MQTT geyser ON confirmed' : 'MQTT geyser OFF confirmed',
    }, (err) => {
      if (err) console.error('[MQTT] ACK HeaterState insert error:', err.message);
    });

    // Mark pending heater control commands as processed
    db.query(
      'UPDATE MeterHeaterControlTable SET processed = 1 WHERE DRN = ? AND processed = 0',
      [drn],
      (err) => { if (err) console.error('[MQTT] ACK HeaterControl processed update error:', err.message); }
    );

    // Mark pending heater state commands as processed
    db.query(
      'UPDATE MeterHeaterStateTable SET processed = 1 WHERE DRN = ? AND processed = 0',
      [drn],
      (err) => { if (err) console.error('[MQTT] ACK HeaterState processed update error:', err.message); }
    );
  }

  // On successful credit_transfer ACK from source meter — token was generated
  // Forward the token to the target meter automatically
  if (data.type === 'credit_transfer') {
    if (data.status === 'ok' && data.token && data.target_meter) {
      console.log(`[MQTT] Credit transfer ACK: source=${drn}, target=${data.target_meter}, token=${data.token}, wh=${data.watt_hours}`);

      // Update transfer record: status = token_generated
      db.query(
        'UPDATE CreditTransfers SET status = ?, token = ?, source_ack_at = NOW() WHERE source_drn = ? AND target_drn = ? AND status = ? ORDER BY created_at DESC LIMIT 1',
        ['token_generated', data.token, drn, data.target_meter, 'pending'],
        (err) => {
          if (err) console.error('[MQTT] CreditTransfer update error:', err.message);
        }
      );

      // Forward the token to the target meter
      const targetDrn = data.target_meter;
      try {
        publishCommand(targetDrn, {
          type: 'credit_accept',
          token: data.token,
          source_meter: drn,
          watt_hours: data.watt_hours,
        }, 1); // QoS 1 for reliability
        console.log(`[MQTT] Forwarded credit token to target meter ${targetDrn}`);

        // Update status to 'forwarded'
        db.query(
          'UPDATE CreditTransfers SET status = ? WHERE source_drn = ? AND target_drn = ? AND status = ? ORDER BY created_at DESC LIMIT 1',
          ['forwarded', drn, targetDrn, 'token_generated'],
          (err) => {
            if (err) console.error('[MQTT] CreditTransfer forward update error:', err.message);
          }
        );
      } catch (pubErr) {
        console.error(`[MQTT] Failed to forward token to ${targetDrn}:`, pubErr.message);
        db.query(
          'UPDATE CreditTransfers SET status = ?, error_detail = ? WHERE source_drn = ? AND target_drn = ? AND status = ? ORDER BY created_at DESC LIMIT 1',
          ['failed', 'MQTT publish to target failed: ' + pubErr.message, drn, targetDrn, 'token_generated'],
          (err) => { if (err) console.error('[MQTT] CreditTransfer fail update error:', err.message); }
        );
      }
    } else if (data.status === 'error') {
      console.error(`[MQTT] Credit transfer failed on source ${drn}: ${data.detail || 'unknown'}`);
      db.query(
        'UPDATE CreditTransfers SET status = ?, error_detail = ?, source_ack_at = NOW() WHERE source_drn = ? AND status = ? ORDER BY created_at DESC LIMIT 1',
        ['failed', data.detail || 'Source meter rejected transfer', drn, 'pending'],
        (err) => { if (err) console.error('[MQTT] CreditTransfer fail update error:', err.message); }
      );
    }
  }

  // On credit_accept ACK from target meter — credit was applied
  if (data.type === 'credit_accept') {
    if (data.status === 'ok') {
      console.log(`[MQTT] Credit accept ACK: target=${drn} applied credit successfully`);
      db.query(
        'UPDATE CreditTransfers SET status = ?, target_ack_at = NOW() WHERE target_drn = ? AND status IN (?, ?) ORDER BY created_at DESC LIMIT 1',
        ['completed', drn, 'token_generated', 'forwarded'],
        (err) => {
          if (err) console.error('[MQTT] CreditTransfer complete update error:', err.message);
          else console.log(`[MQTT] Credit transfer to ${drn} marked COMPLETED`);
        }
      );
    } else {
      console.error(`[MQTT] Credit accept failed on target ${drn}: ${data.detail || 'unknown'}`);
      db.query(
        'UPDATE CreditTransfers SET status = ?, error_detail = ?, target_ack_at = NOW() WHERE target_drn = ? AND status IN (?, ?) ORDER BY created_at DESC LIMIT 1',
        ['failed', 'Target meter rejected: ' + (data.detail || 'unknown'), drn, 'token_generated', 'forwarded'],
        (err) => { if (err) console.error('[MQTT] CreditTransfer fail update error:', err.message); }
      );
    }
  }

  // On successful mains control ACK, same pattern
  if (data.type === 'mains_control' && data.status === 'ok') {
    const mainsState = data.detail === 'on' ? 1 : 0;
    db.query(
      'SELECT geyser_state, geyser_control FROM MeterLoadControl WHERE DRN = ? ORDER BY date_time DESC LIMIT 1',
      [drn],
      (err, rows) => {
        const geyserState = (!err && rows && rows.length > 0) ? rows[0].geyser_state : 0;
        const geyserControl = (!err && rows && rows.length > 0) ? rows[0].geyser_control : 0;
        db.query('INSERT INTO MeterLoadControl SET ?', {
          DRN: drn,
          geyser_state: geyserState,
          geyser_control: geyserControl,
          mains_state: mainsState,
          mains_control: mainsState,
        }, (err2) => {
          if (err2) console.error('[MQTT] ACK LoadControl insert error:', err2.message);
          else console.log(`[MQTT] ACK updated MeterLoadControl: mains_state=${mainsState} for ${drn}`);
        });
      }
    );

    // Insert into MeterMainsStateTable so relay state UI updates
    db.query('INSERT INTO MeterMainsStateTable SET ?', {
      DRN: drn,
      user: 'MQTT_ACK',
      state: mainsState,
      processed: '1',
      reason: data.detail === 'on' ? 'MQTT mains ON confirmed' : 'MQTT mains OFF confirmed',
    }, (err) => {
      if (err) console.error('[MQTT] ACK MainsState insert error:', err.message);
    });

    // Mark pending mains control commands as processed
    db.query(
      'UPDATE MeterMainsControlTable SET processed = 1 WHERE DRN = ? AND processed = 0',
      [drn],
      (err) => { if (err) console.error('[MQTT] ACK MainsControl processed update error:', err.message); }
    );

    // Mark pending mains state commands as processed
    db.query(
      'UPDATE MeterMainsStateTable SET processed = 1 WHERE DRN = ? AND processed = 0',
      [drn],
      (err) => { if (err) console.error('[MQTT] ACK MainsState processed update error:', err.message); }
    );
  }
}

function handleHealthJson(drn, data) {
  console.log(`[MQTT] Health from ${drn}: score=${data.health_score}, uptime=${data.uptime}s`);
  db.query('INSERT INTO MeterHealthReport SET ?', {
    DRN: drn,
    health_score: data.health_score || 0,
    uart_errors: data.uart_errors || 0,
    relay_mismatches: data.relay_mismatches || 0,
    power_anomalies: data.power_anomalies || 0,
    voltage: data.voltage || 0,
    current_val: data.current || 0,
    active_power: data.active_power || 0,
    frequency: data.frequency || 0,
    power_factor: data.power_factor || 0,
    temperature: data.temperature || 0,
    mains_state: data.mains_state != null ? data.mains_state : 0,
    mains_control: data.mains_control != null ? data.mains_control : 0,
    geyser_state: data.geyser_state != null ? data.geyser_state : 0,
    geyser_control: data.geyser_control != null ? data.geyser_control : 0,
    firmware: data.firmware || '',
    uptime: data.uptime || 0,
    record_time: data.timestamp || Math.floor(Date.now() / 1000),
  }, (err) => { if (err) console.error('[MQTT] Health insert error:', err.message); });
}

function handleRelayLogJson(drn, data) {
  const events = data.events;
  if (!Array.isArray(events)) return console.error('[MQTT] relay_log: missing events array');
  console.log(`[MQTT] Relay log from ${drn}: ${events.length} events`);

  for (const evt of events) {
    db.query('INSERT INTO MeterRelayEvents SET ?', {
      DRN: drn,
      event_timestamp: evt.timestamp || 0,
      relay_index: evt.relay_index != null ? evt.relay_index : 0,
      entry_type: evt.entry_type != null ? evt.entry_type : 0,
      state: evt.state != null ? evt.state : 0,
      control: evt.control != null ? evt.control : 0,
      reason: evt.reason != null ? evt.reason : 0,
      reason_text: evt.reason_text || '',
      trigger_val: evt.trigger != null ? evt.trigger : 0,
    }, (err) => { if (err) console.error('[MQTT] Relay event insert error:', err.message); });
  }

  // Also update MeterLoadControl from the latest relay events for immediate state visibility
  // relay_index: 0 = mains, 1 = geyser
  const latestGeyser = [...events].reverse().find(e => e.relay_index === 1);
  const latestMains  = [...events].reverse().find(e => e.relay_index === 0);
  if (latestGeyser || latestMains) {
    db.query(
      'SELECT geyser_state, geyser_control, mains_state, mains_control FROM MeterLoadControl WHERE DRN = ? ORDER BY date_time DESC LIMIT 1',
      [drn],
      (err, rows) => {
        const prev = (!err && rows && rows.length > 0) ? rows[0] : { geyser_state: 0, geyser_control: 0, mains_state: 0, mains_control: 0 };
        db.query('INSERT INTO MeterLoadControl SET ?', {
          DRN: drn,
          geyser_state:   latestGeyser ? (latestGeyser.state != null ? latestGeyser.state : prev.geyser_state) : prev.geyser_state,
          geyser_control: latestGeyser ? (latestGeyser.control != null ? latestGeyser.control : prev.geyser_control) : prev.geyser_control,
          mains_state:    latestMains ? (latestMains.state != null ? latestMains.state : prev.mains_state) : prev.mains_state,
          mains_control:  latestMains ? (latestMains.control != null ? latestMains.control : prev.mains_control) : prev.mains_control,
        }, (err2) => {
          if (err2) console.error('[MQTT] Relay LoadControl insert error:', err2.message);
          else console.log(`[MQTT] Relay log updated MeterLoadControl for ${drn}`);
        });
      }
    );
  }
}

function handleAuthNumbersJson(drn, data) {
  const numbers = data.numbers;
  if (!Array.isArray(numbers)) return console.error('[MQTT] auth_numbers: missing numbers array');
  console.log(`[MQTT] Auth numbers from ${drn}: ${numbers.length} numbers`);

  // Existing table uses (drn, phone_number) rows — delete old and insert fresh
  db.query('DELETE FROM MeterAuthorizedNumbers WHERE drn = ?', [drn], (err) => {
    if (err) return console.error('[MQTT] Auth numbers delete error:', err.message);
    if (numbers.length === 0) return;
    const values = numbers.map(n => [drn, n]);
    db.query('INSERT INTO MeterAuthorizedNumbers (drn, phone_number) VALUES ?', [values], (err2) => {
      if (err2) console.error('[MQTT] Auth numbers insert error:', err2.message);
    });
  });
}

// ==================== Legacy JSON Fallback ====================

function handleJsonMessage(drn, type, data) {
  switch (type) {
    case 'power': {
      if (!Array.isArray(data) || data.length < 9) return;
      db.query('INSERT INTO MeteringPower SET ?', {
        DRN: drn, current: data[0], voltage: data[1], active_power: data[2],
        reactive_power: data[3], apparent_power: data[4], temperature: data[5],
        frequency: data[6], power_factor: data[7], record_time: data[8], source: 1,
      }, (err) => { if (err) console.error('[MQTT] Power insert error:', err.message); });
      break;
    }
    case 'energy': {
      if (!Array.isArray(data) || data.length < 7) return;
      db.query('INSERT INTO MeterCumulativeEnergyUsage SET ?', {
        DRN: drn, active_energy: data[0], reactive_energy: data[1], units: data[2],
        tamper_state: data[3], tamp_time: data[4], meter_reset: data[5],
        record_time: data[6], source: 1,
      }, (err) => { if (err) console.error('[MQTT] Energy insert error:', err.message); });
      break;
    }
    case 'cellular': {
      if (!Array.isArray(data) || data.length < 5) return;
      db.query('INSERT INTO MeterCellularNetworkProperties SET ?', {
        DRN: drn, signal_strength: data[0], service_provider: data[1],
        sim_phone_number: data[2], IMEU: data[3], record_time: data[4],
      }, (err) => { if (err) console.error('[MQTT] Cellular insert error:', err.message); });
      break;
    }
    case 'load': {
      if (!Array.isArray(data) || data.length < 4) return;
      db.query('INSERT INTO MeterLoadControl SET ?', {
        DRN: drn, geyser_state: data[0], geyser_control: data[1],
        mains_state: data[2], mains_control: data[3],
      }, (err) => { if (err) console.error('[MQTT] Load insert error:', err.message); });
      break;
    }
    case 'token': {
      let record;
      if (Array.isArray(data) && data.length >= 9) {
        record = { DRN: drn, token_id: data[0], token_cls: data[1], submission_Method: data[2],
          display_msg: data[3], display_auth_result: data[4], display_token_result: data[5],
          display_validation_result: data[6], token_time: data[7], token_amount: data[8] };
      } else if (typeof data === 'object' && !Array.isArray(data)) {
        record = { DRN: drn, ...data };
      } else return;
      db.query('INSERT INTO STSTokesInfo SET ?', record, (err) => {
        if (err) console.error('[MQTT] Token insert error:', err.message);
      });
      break;
    }
  }
}

// ==================== Command Publishing ====================

function publishCommand(drn, command, qos = 0) {
  if (!mqttClient || !mqttClient.connected) {
    throw new Error('MQTT client not connected');
  }
  const topic = `gx/${drn}/cmd`;
  const payload = JSON.stringify(command);
  mqttClient.publish(topic, payload, { qos }, (err) => {
    if (err) console.error(`[MQTT] Publish error to ${topic}:`, err.message);
    else console.log(`[MQTT] Command sent to ${drn} (QoS ${qos}):`, payload);
  });
}

function getClient() {
  return mqttClient;
}

module.exports = { init, publishCommand, getClient };
