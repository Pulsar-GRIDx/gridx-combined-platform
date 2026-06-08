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

const fs = require('fs');
const path = require('path');

const TOPICS = [
  'gx/+/power',
  'gx/+/energy',
  'gx/+/tou_status',
  'gx/+/cellular',
  'gx/+/load',
  'gx/+/token',
  'gx/+/ack',
  'gx/+/health',
  'gx/+/relay_log',
  'gx/+/auth_numbers',
  'gx/+/energy_usage',
  'gx/+/net_energy',
  'gx/+/hourly_energy',
  'gx/+/daily_energy',
  'gx/+/thd',
  'gx/+/emergency',
  'gx/+/ota/req',
  'gx/+/nextion/req',
];

// ==================== Server-Side Hourly Energy Tracker ====================
// Server-side hourly energy tracking using SERVER time.
// Tracks cumulative import/export from net_energy readings + power direction from power readings.
// On hour rollover, computes deltas and writes to MeterHourlyEnergyServer (separate from ESP32 data).
const serverHourlyState = {};
const powerDirectionState = {};

function serverRecordPowerDirection(drn, active_power) {
  if (!powerDirectionState[drn]) {
    powerDirectionState[drn] = { importing: 0, exporting: 0, lastPower: active_power };
  }
  const pd = powerDirectionState[drn];
  pd.lastPower = active_power;
  if (active_power >= 0) pd.importing++;
  else pd.exporting++;
}

function serverHourlyTrack(drn, import_wh, export_wh) {
  const now = new Date();
  const currentHour = now.getHours();
  const currentDate = now.toISOString().split('T')[0];

  if (!serverHourlyState[drn]) {
    serverHourlyState[drn] = {
      hour: currentHour, date: currentDate,
      firstImport: import_wh, firstExport: export_wh,
      lastImport: import_wh, lastExport: export_wh,
      readings: 1
    };
    return;
  }

  const s = serverHourlyState[drn];

  if (currentHour !== s.hour || currentDate !== s.date) {
    if (s.readings >= 2) {
      const impDelta = Math.max(0, Math.round(s.lastImport - s.firstImport));
      const expDelta = Math.max(0, Math.round(s.lastExport - s.firstExport));
      const netWh = impDelta - expDelta;

      const pd = powerDirectionState[drn] || { importing: 0, exporting: 0 };
      const totalPowerReadings = pd.importing + pd.exporting;
      const dominantDir = totalPowerReadings === 0 ? 'unknown'
        : pd.importing >= pd.exporting ? 'import' : 'export';
      const dirConfidence = totalPowerReadings === 0 ? 0
        : Math.round(Math.max(pd.importing, pd.exporting) / totalPowerReadings * 100);

      db.query(
        `INSERT INTO MeterHourlyEnergyServer
           (DRN, date, hour, import_wh, export_wh, net_wh, dominant_direction, direction_confidence, power_readings, energy_readings, record_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UNIX_TIMESTAMP())
         ON DUPLICATE KEY UPDATE
           import_wh = VALUES(import_wh), export_wh = VALUES(export_wh),
           net_wh = VALUES(net_wh), dominant_direction = VALUES(dominant_direction),
           direction_confidence = VALUES(direction_confidence),
           power_readings = VALUES(power_readings), energy_readings = VALUES(energy_readings),
           record_time = VALUES(record_time)`,
        [drn, s.date, s.hour, impDelta, expDelta, netWh, dominantDir, dirConfidence, totalPowerReadings, s.readings],
        (err) => {
          if (err) console.error('[HOURLY-SERVER] upsert error:', err.message);
          else console.log(`[HOURLY-SERVER] ${drn} ${s.date} h${String(s.hour).padStart(2,'0')}: imp=${impDelta}Wh exp=${expDelta}Wh net=${netWh}Wh dir=${dominantDir}(${dirConfidence}%) (${s.readings} energy, ${totalPowerReadings} power readings)`);
        }
      );
    }
    s.hour = currentHour;
    s.date = currentDate;
    s.firstImport = import_wh;
    s.firstExport = export_wh;
    s.lastImport = import_wh;
    s.lastExport = export_wh;
    s.readings = 1;
    if (powerDirectionState[drn]) {
      powerDirectionState[drn].importing = 0;
      powerDirectionState[drn].exporting = 0;
    }
  } else {
    s.lastImport = import_wh;
    s.lastExport = export_wh;
    s.readings++;
  }
}

function bootstrapServerHourly() {
  const currentHour = new Date().getHours();
  db.query(
    `SELECT DRN, min_import_wh, min_export_wh, max_import_wh, max_export_wh, reading_count
     FROM MeterNetEnergyHourly
     WHERE date = CURDATE() AND hour = ?`,
    [currentHour],
    (err, rows) => {
      if (err) return console.error('[HOURLY-SERVER] Bootstrap error:', err.message);
      if (!rows || rows.length === 0) return console.log('[HOURLY-SERVER] No data to bootstrap for current hour');
      rows.forEach(r => {
        serverHourlyState[r.DRN] = {
          hour: currentHour,
          date: new Date().toISOString().split('T')[0],
          firstImport: r.min_import_wh,
          firstExport: r.min_export_wh,
          lastImport: r.max_import_wh,
          lastExport: r.max_export_wh,
          readings: r.reading_count || 1
        };
      });
      console.log(`[HOURLY-SERVER] Bootstrapped ${rows.length} meter(s) for hour ${currentHour}`);
    }
  );
}

// ==================== MQTT OTA State ====================

const FIRMWARE_DIR = path.join(__dirname, '..', 'hardware', 'files', 'Data');
let firmwareCache = null;  // { path, data, size, mtime }
let nextionCache = null;   // { path, data, size, mtime }
const activeOtaSessions = {};  // { drn: { data: Buffer, size: number, hash: string, version: string } }

function loadFirmware(firmwarePath) {
  try {
    const stat = fs.statSync(firmwarePath);
    if (firmwareCache && firmwareCache.path === firmwarePath && firmwareCache.mtime === stat.mtimeMs) {
      return firmwareCache;
    }
    const data = fs.readFileSync(firmwarePath);
    firmwareCache = { path: firmwarePath, data, size: data.length, mtime: stat.mtimeMs };
    console.log(`[OTA] Firmware loaded: ${firmwarePath} (${data.length} bytes)`);
    return firmwareCache;
  } catch (err) {
    console.error(`[OTA] Failed to load firmware: ${err.message}`);
    return null;
  }
}

function getFirmwareInfo() {
  const infoPath = path.join(FIRMWARE_DIR, 'fw_latest.json');
  try {
    const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
    return info;
  } catch (err) {
    console.error(`[OTA] Failed to read fw_latest.json: ${err.message}`);
    return null;
  }
}

function loadNextionTft(tftPath) {
  try {
    const stat = fs.statSync(tftPath);
    if (nextionCache && nextionCache.path === tftPath && nextionCache.mtime === stat.mtimeMs) {
      return nextionCache;
    }
    const data = fs.readFileSync(tftPath);
    nextionCache = { path: tftPath, data, size: data.length, mtime: stat.mtimeMs };
    console.log(`[Nextion] TFT loaded: ${tftPath} (${data.length} bytes)`);
    return nextionCache;
  } catch (err) {
    console.error(`[Nextion] Failed to load TFT: ${err.message}`);
    return null;
  }
}

function getNextionInfo() {
  const infoPath = path.join(FIRMWARE_DIR, 'nextion_latest.json');
  try {
    return JSON.parse(fs.readFileSync(infoPath, 'utf8'));
  } catch (err) {
    return null;
  }
}

function handleNextionRequest(drn, buf) {
  let msg;
  try {
    msg = JSON.parse(buf.toString());
  } catch (e) {
    console.error(`[Nextion] Invalid JSON from ${drn}:`, buf.toString());
    return;
  }

  const action = msg.action;

  if (action === 'chunk') {
    const offset = msg.offset || 0;
    const requestedSize = msg.size || 4096;

    const tftPath = path.join(FIRMWARE_DIR, 'nextion.tft');
    const tft = loadNextionTft(tftPath);
    if (!tft) {
      console.error(`[Nextion] No TFT file for chunk request from ${drn}`);
      return;
    }

    const remaining = tft.size - offset;
    if (remaining <= 0) {
      console.log(`[Nextion] ${drn}: offset ${offset} beyond TFT size ${tft.size}`);
      return;
    }
    const chunkSize = Math.min(requestedSize, remaining);

    // Binary response: [4B offset BE][4B length BE][data]
    const header = Buffer.alloc(8);
    header.writeUInt32BE(offset, 0);
    header.writeUInt32BE(chunkSize, 4);
    const chunkData = tft.data.slice(offset, offset + chunkSize);
    const response = Buffer.concat([header, chunkData]);

    const dataTopic = `gx/${drn}/nextion/data`;
    mqttClient.publish(dataTopic, response, { qos: 1 }, (err) => {
      if (err) {
        console.error(`[Nextion] Publish failed for ${drn} offset ${offset}:`, err.message);
        return;
      }
      const progress = Math.round(((offset + chunkSize) / tft.size) * 100);
      if (progress % 10 === 0 || offset === 0 || offset + chunkSize >= tft.size) {
        console.log(`[Nextion] ${drn}: chunk offset=${offset} size=${chunkSize} progress=${progress}%`);
      }
    });

  } else if (action === 'complete') {
    console.log(`[Nextion] ${drn}: TFT update completed successfully!`);
  } else if (action === 'error') {
    console.error(`[Nextion] ${drn}: TFT error: ${msg.detail || 'unknown'}`);
  }
}

function handleOtaRequest(drn, buf) {
  let msg;
  try {
    msg = JSON.parse(buf.toString());
  } catch (e) {
    console.error(`[OTA] Invalid JSON from ${drn}:`, buf.toString());
    return;
  }

  const action = msg.action;

  if (action === 'chunk') {
    const offset = msg.offset || 0;
    const requestedSize = msg.size || 1024;

    // Use per-device cached firmware to prevent mid-OTA version mismatch
    let fwData, fwSize;
    if (activeOtaSessions[drn]) {
      fwData = activeOtaSessions[drn].data;
      fwSize = activeOtaSessions[drn].size;
    } else {
      // Fallback: no session cache (backwards compatible for devices that skip start)
      const fwInfo = getFirmwareInfo();
      if (!fwInfo) {
        console.error(`[OTA] No firmware info available for chunk request from ${drn}`);
        return;
      }
      const fwPath = path.join(FIRMWARE_DIR, 'firmware.bin');
      const fw = loadFirmware(fwPath);
      if (!fw) {
        console.error(`[OTA] Cannot serve chunk: firmware not loaded`);
        return;
      }
      fwData = fw.data;
      fwSize = fw.size;
      console.warn(`[OTA] ${drn}: serving chunk without session cache (no active OTA session)`);
    }

    const remaining = fwSize - offset;
    if (remaining <= 0) {
      console.log(`[OTA] ${drn}: requested offset ${offset} beyond firmware size ${fwSize}`);
      return;
    }
    const chunkSize = Math.min(requestedSize, remaining);

    // Build binary response: [4 bytes offset BE][4 bytes length BE][data]
    const header = Buffer.alloc(8);
    header.writeUInt32BE(offset, 0);
    header.writeUInt32BE(chunkSize, 4);
    const chunkData = fwData.slice(offset, offset + chunkSize);
    const response = Buffer.concat([header, chunkData]);

    const dataTopic = `gx/${drn}/ota/data`;
    mqttClient.publish(dataTopic, response, { qos: 1 }, (err) => {
      if (err) {
        console.error(`[OTA] Publish failed for ${drn} offset ${offset}:`, err.message);
        return;
      }
      const progress = Math.round(((offset + chunkSize) / fwSize) * 100);
      if (progress % 5 === 0 || offset === 0 || offset + chunkSize >= fwSize) {
        console.log(`[OTA] ${drn}: chunk offset=${offset} size=${chunkSize} progress=${progress}%`);
      }
    });

  } else if (action === 'check') {
    // Device is requesting an OTA check — send start command if update available
    console.log(`[OTA] ${drn}: OTA check requested`);
    const fwInfo = getFirmwareInfo();
    if (!fwInfo) {
      console.error(`[OTA] No firmware info available for check from ${drn}`);
      return;
    }
    const fwPath = path.join(FIRMWARE_DIR, 'firmware.bin');
    const fw = loadFirmware(fwPath);
    if (!fw) {
      console.error(`[OTA] Cannot check: firmware not loaded`);
      return;
    }

    // Cache firmware for this device's OTA session to prevent mid-download version mismatch
    activeOtaSessions[drn] = { data: fw.data, size: fw.size, hash: fwInfo.hash, version: fwInfo.version };
    console.log(`[OTA] Cached firmware for ${drn} session: v${fwInfo.version}, ${fw.size} bytes`);

    // Always send OTA start — device-side version comparison decides whether to apply
    console.log(`[OTA] Sending OTA start to ${drn}: v${fwInfo.version}, ${fw.size} bytes`);
    publishCommand(drn, {
      type: 'ota_mqtt',
      action: 'start',
      version: fwInfo.version,
      size: fw.size,
      hash: fwInfo.hash,
      chunk_size: 1024,
    }, 1);

  } else if (action === 'complete') {
    delete activeOtaSessions[drn];
    console.log(`[OTA] ${drn}: OTA completed successfully! (session cache cleared)`);
  } else if (action === 'error') {
    delete activeOtaSessions[drn];
    console.error(`[OTA] ${drn}: OTA error: ${msg.detail || 'unknown'} (session cache cleared)`);
  }
}

function startMqttOta(drn, hash) {
  const fwInfo = getFirmwareInfo();
  if (!fwInfo) {
    throw new Error('No firmware info available (fw_latest.json)');
  }

  const fwPath = path.join(FIRMWARE_DIR, 'firmware.bin');
  const fw = loadFirmware(fwPath);
  if (!fw) {
    throw new Error('Failed to load firmware binary');
  }

  // Cache firmware for this device's OTA session to prevent mid-download version mismatch
  activeOtaSessions[drn] = { data: fw.data, size: fw.size, hash: fwInfo.hash, version: fwInfo.version };
  console.log(`[OTA] Cached firmware for ${drn} session: v${fwInfo.version}, ${fw.size} bytes`);

  const cmd = {
    type: 'ota_mqtt',
    action: 'start',
    version: fwInfo.version,
    size: fw.size,
    hash: hash || fwInfo.hash,
    chunk_size: 1024,
  };

  publishCommand(drn, cmd, 1);
  console.log(`[OTA] MQTT OTA start command sent to ${drn}: v${fwInfo.version}, ${fw.size} bytes`);
  return cmd;
}

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

  db.query(`CREATE TABLE IF NOT EXISTS MeterHourlyEnergy (
    id INT AUTO_INCREMENT PRIMARY KEY,
    DRN VARCHAR(50) NOT NULL,
    hourly_data JSON,
    cumulative INT,
    peak_power INT,
    total INT,
    record_time INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_drn (DRN),
    INDEX idx_created (created_at)
  )`, (err) => { if (err) console.error('[MQTT] MeterHourlyEnergy table error:', err.message); });

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

  // New relay events table used by the MQTT handler and web API
  db.query(`CREATE TABLE IF NOT EXISTS meter_relay_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    drn VARCHAR(20) NOT NULL,
    relay_index TINYINT DEFAULT 0,
    entry_type TINYINT DEFAULT 0,
    state TINYINT,
    control TINYINT,
    reason_code TINYINT DEFAULT 0,
    reason_text VARCHAR(255) DEFAULT '',
    trigger_type TINYINT DEFAULT 0,
    meter_timestamp DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_drn (drn),
    INDEX idx_meter_timestamp (meter_timestamp)
  )`, (err) => { if (err) console.error('[MQTT] meter_relay_events table error:', err.message); });

  db.query(`CREATE TABLE IF NOT EXISTS CreditTransfers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    source_drn VARCHAR(50) NOT NULL,
    target_drn VARCHAR(50) NOT NULL,
    watt_hours INT NOT NULL,
    token VARCHAR(255),
    status ENUM('pending','token_generated','forwarded','completing','completed','failed') DEFAULT 'pending',
    source_ack_at TIMESTAMP NULL,
    target_ack_at TIMESTAMP NULL,
    error_detail VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_source (source_drn),
    INDEX idx_target (target_drn),
    INDEX idx_status (status)
  )`, (err) => { if (err) console.error('[MQTT] CreditTransfers table error:', err.message); });

  // Live status tracking — updated on every MQTT message from a meter
  db.query(`CREATE TABLE IF NOT EXISTS MeterLastSeen (
    DRN VARCHAR(50) PRIMARY KEY,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_topic VARCHAR(30),
    message_count INT UNSIGNED DEFAULT 1,
    INDEX idx_last_seen (last_seen)
  )`, (err) => { if (err) console.error('[MQTT] MeterLastSeen table error:', err.message); });

  db.query(`CREATE TABLE IF NOT EXISTS MeterCalibrationLog (
    id INT AUTO_INCREMENT PRIMARY KEY,
    DRN VARCHAR(50) NOT NULL,
    action ENUM('auto','verify','exercise') NOT NULL,
    requested_by VARCHAR(100) DEFAULT 'Admin',
    status ENUM('pending','completed','failed') DEFAULT 'pending',
    result VARCHAR(100),
    voltage FLOAT,
    current_val FLOAT,
    active_power FLOAT,
    reactive_power FLOAT,
    apparent_power FLOAT,
    frequency FLOAT,
    power_factor FLOAT,
    temperature FLOAT,
    deviation_pct FLOAT,
    health_score INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    INDEX idx_drn (DRN),
    INDEX idx_status (status)
  )`, (err) => { if (err) console.error('[MQTT] MeterCalibrationLog table error:', err.message); });

  db.query(`CREATE TABLE IF NOT EXISTS MeterTOUConfig (
    id INT AUTO_INCREMENT PRIMARY KEY,
    DRN VARCHAR(50) NOT NULL UNIQUE,
    mode TINYINT DEFAULT 0,
    dsm_enabled TINYINT DEFAULT 0,
    current_period VARCHAR(20),
    active_tariff_index TINYINT,
    monthly_consumption_wh INT UNSIGNED DEFAULT 0,
    config_json JSON,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_drn (DRN)
  )`, (err) => { if (err) console.error('[MQTT] MeterTOUConfig table error:', err.message); });

  db.query(`CREATE TABLE IF NOT EXISTS MeterNetEnergy (
    id INT AUTO_INCREMENT PRIMARY KEY,
    DRN VARCHAR(50) NOT NULL,
    import_energy_wh FLOAT,
    export_energy_wh FLOAT,
    net_energy_wh FLOAT,
    record_time INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_drn (DRN),
    INDEX idx_created (created_at)
  )`, (err) => { if (err) console.error('[MQTT] MeterNetEnergy table error:', err.message); });

  db.query(`CREATE TABLE IF NOT EXISTS MeterNetEnergyHourly (
    id INT AUTO_INCREMENT PRIMARY KEY,
    DRN VARCHAR(50) NOT NULL,
    date DATE NOT NULL,
    hour TINYINT NOT NULL,
    min_import_wh FLOAT DEFAULT 0,
    max_import_wh FLOAT DEFAULT 0,
    min_export_wh FLOAT DEFAULT 0,
    max_export_wh FLOAT DEFAULT 0,
    reading_count INT DEFAULT 0,
    UNIQUE KEY idx_drn_date_hour (DRN, date, hour)
  )`, (err) => { if (err) console.error('[MQTT] MeterNetEnergyHourly table error:', err.message); });

  db.query(`CREATE TABLE IF NOT EXISTS MeterNetEnergyDaily (
    id INT AUTO_INCREMENT PRIMARY KEY,
    DRN VARCHAR(50) NOT NULL,
    date DATE NOT NULL,
    min_import_wh FLOAT DEFAULT 0,
    max_import_wh FLOAT DEFAULT 0,
    min_export_wh FLOAT DEFAULT 0,
    max_export_wh FLOAT DEFAULT 0,
    reading_count INT DEFAULT 0,
    UNIQUE KEY idx_drn_date (DRN, date)
  )`, (err) => { if (err) console.error('[MQTT] MeterNetEnergyDaily table error:', err.message); });

  db.query(`CREATE TABLE IF NOT EXISTS MeterHourlyEnergyActual (
    id INT AUTO_INCREMENT PRIMARY KEY,
    DRN VARCHAR(50) NOT NULL,
    date DATE NOT NULL,
    hour TINYINT NOT NULL,
    import_wh INT UNSIGNED DEFAULT 0,
    export_wh INT UNSIGNED DEFAULT 0,
    active_wh INT UNSIGNED DEFAULT 0,
    record_time INT UNSIGNED DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY idx_drn_date_hour (DRN, date, hour)
  )`, (err) => { if (err) console.error('[MQTT] MeterHourlyEnergyActual table error:', err.message); });

  db.query(`CREATE TABLE IF NOT EXISTS MeterDailyEnergyActual (
    id INT AUTO_INCREMENT PRIMARY KEY,
    DRN VARCHAR(50) NOT NULL,
    date DATE NOT NULL,
    import_wh INT UNSIGNED DEFAULT 0,
    export_wh INT UNSIGNED DEFAULT 0,
    active_wh INT UNSIGNED DEFAULT 0,
    record_time INT UNSIGNED DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY idx_drn_date (DRN, date)
  )`, (err) => { if (err) console.error('[MQTT] MeterDailyEnergyActual table error:', err.message); });

  db.query(`CREATE TABLE IF NOT EXISTS MeterHourlyEnergyServer (
    id INT AUTO_INCREMENT PRIMARY KEY,
    DRN VARCHAR(50) NOT NULL,
    date DATE NOT NULL,
    hour TINYINT NOT NULL,
    import_wh INT DEFAULT 0,
    export_wh INT DEFAULT 0,
    net_wh INT DEFAULT 0,
    dominant_direction VARCHAR(10) DEFAULT 'unknown',
    direction_confidence TINYINT DEFAULT 0,
    power_readings INT DEFAULT 0,
    energy_readings INT DEFAULT 0,
    record_time INT UNSIGNED DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY idx_drn_date_hour (DRN, date, hour)
  )`, (err) => { if (err) console.error('[MQTT] MeterHourlyEnergyServer table error:', err.message); });

  db.query(`CREATE TABLE IF NOT EXISTS MeterTHD (
    id INT AUTO_INCREMENT PRIMARY KEY,
    DRN VARCHAR(50) NOT NULL,
    thd_voltage FLOAT DEFAULT 0,
    thd_current FLOAT DEFAULT 0,
    distortion_va FLOAT DEFAULT 0,
    displacement_pf FLOAT DEFAULT 0,
    record_time INT UNSIGNED DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_drn (DRN),
    INDEX idx_drn_time (DRN, created_at)
  )`, (err) => { if (err) console.error('[MQTT] MeterTHD table error:', err.message); });

  db.query(`CREATE TABLE IF NOT EXISTS SummaryDataUsage (
    id INT AUTO_INCREMENT PRIMARY KEY,
    DRN VARCHAR(50) NOT NULL,
    usage_date DATE NOT NULL,
    usage_hour TINYINT NOT NULL,
    msg_count INT DEFAULT 0,
    payload_bytes BIGINT DEFAULT 0,
    estimated_bytes BIGINT DEFAULT 0,
    power_msgs INT DEFAULT 0,
    energy_msgs INT DEFAULT 0,
    net_energy_msgs INT DEFAULT 0,
    cellular_msgs INT DEFAULT 0,
    load_msgs INT DEFAULT 0,
    token_msgs INT DEFAULT 0,
    health_msgs INT DEFAULT 0,
    other_msgs INT DEFAULT 0,
    UNIQUE KEY uq_drn_date_hour (DRN, usage_date, usage_hour),
    KEY idx_date (usage_date),
    KEY idx_drn (DRN)
  ) ENGINE=InnoDB`, (err) => { if (err) console.error('[MQTT] SummaryDataUsage table error:', err.message); });

  db.query(`CREATE TABLE IF NOT EXISTS DataCostConfig (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cost_per_mb DECIMAL(10,4) NOT NULL DEFAULT 0.50,
    currency VARCHAR(10) DEFAULT 'NAD',
    overhead_multiplier DECIMAL(4,2) DEFAULT 1.50,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`, (err) => {
    if (err) console.error('[MQTT] DataCostConfig table error:', err.message);
    else {
      db.query(`INSERT IGNORE INTO DataCostConfig (id, cost_per_mb, currency) VALUES (1, 0.50, 'NAD')`, () => {});
    }
  });

  db.query(`CREATE TABLE IF NOT EXISTS SuburbDailyEnergy (
    id INT AUTO_INCREMENT PRIMARY KEY,
    suburb VARCHAR(100) NOT NULL,
    energy_date DATE NOT NULL,
    consumption_wh DECIMAL(14, 2) DEFAULT 0,
    meter_count INT DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY idx_suburb_date (suburb, energy_date),
    INDEX idx_date (energy_date)
  )`, (err) => { if (err) console.error('[MQTT] SuburbDailyEnergy table error:', err.message); });
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
    const qos1Topics = ['gx/+/hourly_energy', 'gx/+/daily_energy'];
    const qos0Topics = TOPICS.filter(t => !qos1Topics.includes(t));
    mqttClient.subscribe(qos0Topics, { qos: 0 }, (err) => {
      if (err) console.error('[MQTT] Subscribe error (qos0):', err.message);
    });
    mqttClient.subscribe(qos1Topics, { qos: 1 }, (err) => {
      if (err) console.error('[MQTT] Subscribe error (qos1):', err.message);
      else console.log('[MQTT] Subscribed to:', TOPICS.join(', '));
    });
    bootstrapServerHourly();
  });

  mqttClient.on('message', (topic, message) => {
    try { handleMessage(topic, message); }
    catch (err) { console.error('[MQTT] Message handling error:', err.message); }
  });

  mqttClient.on('error', (err) => console.error('[MQTT] Connection error:', err.message));
  mqttClient.on('reconnect', () => console.log('[MQTT] Reconnecting...'));

  setInterval(flushDataUsage, 60 * 1000);

  return mqttClient;
}

// ==================== Data Usage Tracking ====================
const TRANSPORT_OVERHEAD = 118; // TCP/IP (60) + TLS (29) + MQTT header+topic (~29)
const dataUsageCounters = {}; // { "DRN:YYYY-MM-DD:HH": { msg_count, payload_bytes, estimated_bytes, power, energy, net_energy, cellular, load, token, health, other } }

function trackDataUsage(drn, type, payloadBytes) {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const hour = now.getHours();
  const key = `${drn}:${dateStr}:${hour}`;
  if (!dataUsageCounters[key]) {
    dataUsageCounters[key] = { drn, date: dateStr, hour, msg_count: 0, payload_bytes: 0, estimated_bytes: 0, power: 0, energy: 0, net_energy: 0, cellular: 0, load: 0, token: 0, health: 0, other: 0 };
  }
  const c = dataUsageCounters[key];
  c.msg_count++;
  c.payload_bytes += payloadBytes;
  c.estimated_bytes += payloadBytes + TRANSPORT_OVERHEAD;
  const typeMap = { power: 'power', energy: 'energy', net_energy: 'net_energy', cellular: 'cellular', load: 'load', token: 'token', health: 'health' };
  c[typeMap[type] || 'other']++;
}

function flushDataUsage() {
  const keys = Object.keys(dataUsageCounters);
  if (keys.length === 0) return;
  const batch = keys.map(k => dataUsageCounters[k]);
  keys.forEach(k => delete dataUsageCounters[k]);
  for (const c of batch) {
    db.query(
      `INSERT INTO SummaryDataUsage (DRN, usage_date, usage_hour, msg_count, payload_bytes, estimated_bytes, power_msgs, energy_msgs, net_energy_msgs, cellular_msgs, load_msgs, token_msgs, health_msgs, other_msgs)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         msg_count = msg_count + VALUES(msg_count),
         payload_bytes = payload_bytes + VALUES(payload_bytes),
         estimated_bytes = estimated_bytes + VALUES(estimated_bytes),
         power_msgs = power_msgs + VALUES(power_msgs),
         energy_msgs = energy_msgs + VALUES(energy_msgs),
         net_energy_msgs = net_energy_msgs + VALUES(net_energy_msgs),
         cellular_msgs = cellular_msgs + VALUES(cellular_msgs),
         load_msgs = load_msgs + VALUES(load_msgs),
         token_msgs = token_msgs + VALUES(token_msgs),
         health_msgs = health_msgs + VALUES(health_msgs),
         other_msgs = other_msgs + VALUES(other_msgs)`,
      [c.drn, c.date, c.hour, c.msg_count, c.payload_bytes, c.estimated_bytes, c.power, c.energy, c.net_energy, c.cellular, c.load, c.token, c.health, c.other],
      (err) => { if (err) console.error('[MQTT] DataUsage flush error:', err.message); }
    );
  }
}

// ==================== Message Router ====================

function handleMessage(topic, buf) {
  const parts = topic.split('/');
  if (parts.length < 3 || parts[0] !== 'gx') return;

  const drn = parts[1];
  const type = parts[2];

  // Handle OTA chunk requests: gx/{drn}/ota/req
  if (type === 'ota' && parts[3] === 'req') {
    handleOtaRequest(drn, buf);
    return;
  }

  // Handle Nextion TFT chunk requests: gx/{drn}/nextion/req
  if (type === 'nextion' && parts[3] === 'req') {
    handleNextionRequest(drn, buf);
    return;
  }

  if (parts.length !== 3) return;

  trackDataUsage(drn, type, buf.length);

  // Update last-seen timestamp for live/offline tracking
  db.query(
    `INSERT INTO MeterLastSeen (DRN, last_seen, last_topic, message_count)
     VALUES (?, NOW(), ?, 1)
     ON DUPLICATE KEY UPDATE last_seen = NOW(), last_topic = ?, message_count = message_count + 1`,
    [drn, type, type],
    (err) => { if (err) console.error('[MQTT] MeterLastSeen update error:', err.message); }
  );

  // JSON-only topics (ack, health, auth_numbers, energy_usage, emergency)
  // Note: relay_log moved to binary path (0x06)
  if (['ack', 'health', 'auth_numbers', 'energy_usage', 'emergency', 'tou_status'].includes(type)) {
    try {
      const data = JSON.parse(buf.toString());
      switch (type) {
        case 'ack':          handleAckJson(drn, data); break;
        case 'health':       handleHealthJson(drn, data); break;
        case 'auth_numbers': handleAuthNumbersJson(drn, data); break;
        case 'energy_usage': handleEnergyUsageJson(drn, data); break;
        case 'emergency':    handleEmergencyJson(drn, data); break;
        case 'tou_status':   handleTouStatusJson(drn, data); break;
      }
    } catch (e) {
      console.error(`[MQTT] Invalid JSON on ${topic}:`, e.message);
    }
    return;
  }

  const firstByte = buf[0];

  // Binary payloads start with type byte 0x01-0x09
  if ((firstByte >= 0x01 && firstByte <= 0x09) || firstByte === 0x0B) {
    console.log(`[MQTT] ${type} from ${drn} (binary, ${buf.length}B)`);
    switch (type) {
      case 'power':         handlePowerBin(drn, buf); break;
      case 'energy':        handleEnergyBin(drn, buf); break;
      case 'cellular':      handleCellularBin(drn, buf); break;
      case 'load':          handleLoadBin(drn, buf); break;
      case 'token':         handleTokenBin(drn, buf); break;
      case 'relay_log':     handleRelayLogBin(drn, buf); break;
      case 'net_energy':    handleNetEnergyBin(drn, buf); break;
      case 'hourly_energy': handleHourlyEnergyBin(drn, buf); break;
      case 'daily_energy':  handleDailyEnergyBin(drn, buf); break;
      case 'thd':           handleThdBin(drn, buf); break;
      default:              console.warn(`[MQTT] Unknown type: ${type}`);
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
  const active_power = buf.readFloatLE(9);
  serverRecordPowerDirection(drn, active_power);
  db.query('INSERT INTO MeteringPower SET ?', {
    DRN: drn,
    current:        buf.readFloatLE(1),
    voltage:        buf.readFloatLE(5),
    active_power:   active_power,
    reactive_power: buf.readFloatLE(13),
    apparent_power: buf.readFloatLE(17),
    temperature:    buf.readFloatLE(21),
    frequency:      buf.readFloatLE(25),
    power_factor:   buf.readFloatLE(29),
    record_time:    buf.readUInt32LE(33),
    source: 1,
  }, (err) => { if (err) console.error('[MQTT] Power insert error:', err.message); });
}

function updateSuburbDailyEnergy(drn) {
  const query = `
    INSERT INTO SuburbDailyEnergy (suburb, energy_date, consumption_wh, meter_count)
    SELECT
      mli.LocationName,
      CURDATE(),
      COALESCE(
        SUM(COALESCE(last_r.final_power, 0) - COALESCE(first_r.initial_power, 0)),
        0
      ),
      COUNT(DISTINCT mli.DRN)
    FROM MeterLocationInfoTable mli
    LEFT JOIN (
      SELECT DRN, MIN(CAST(active_energy AS DECIMAL(10,2))) AS initial_power
      FROM MeterCumulativeEnergyUsage WHERE DATE(date_time) = CURDATE() GROUP BY DRN
    ) first_r ON first_r.DRN = mli.DRN
    LEFT JOIN (
      SELECT DRN, MAX(CAST(active_energy AS DECIMAL(10,2))) AS final_power
      FROM MeterCumulativeEnergyUsage WHERE DATE(date_time) = CURDATE() GROUP BY DRN
    ) last_r ON last_r.DRN = mli.DRN
    WHERE mli.LocationName = (SELECT LocationName FROM MeterLocationInfoTable WHERE DRN = ? LIMIT 1)
    GROUP BY mli.LocationName
    ON DUPLICATE KEY UPDATE
      consumption_wh = VALUES(consumption_wh),
      meter_count = VALUES(meter_count)
  `;
  db.query(query, [drn], (err) => {
    if (err) console.error('[MQTT] SuburbDailyEnergy update error:', err.message);
  });
}

function handleEnergyBin(drn, buf) {
  if (buf.length < 23) return console.error('[MQTT] Energy packet too short:', buf.length);
  const tamperState = buf.readUInt8(13);
  const activeEnergy = buf.readFloatLE(1);
  const units = buf.readFloatLE(9);
  db.query('INSERT INTO MeterCumulativeEnergyUsage SET ?', {
    DRN: drn,
    active_energy:   activeEnergy,
    reactive_energy: buf.readFloatLE(5),
    units:           units,
    tamper_state:    tamperState,
    tamp_time:       buf.readUInt32LE(14),
    meter_reset:     buf.readUInt8(18),
    record_time:     buf.readUInt32LE(19),
    source: 1,
  }, (err) => {
    if (err) console.error('[MQTT] Energy insert error:', err.message);
    else updateSuburbDailyEnergy(drn);
  });
  checkTamperStateChange(drn, tamperState, activeEnergy, units);
}

function checkTamperStateChange(drn, newState, activeEnergy, units) {
  db.query('SELECT last_tamper_state FROM MeterTamperStateTracker WHERE DRN = ?', [drn], (err, rows) => {
    if (err) return;
    const prevState = rows && rows.length > 0 ? rows[0].last_tamper_state : -1;
    if (prevState === -1) {
      db.query('INSERT INTO MeterTamperStateTracker (DRN, last_tamper_state) VALUES (?, ?)', [drn, newState]);
      if (newState === 1) {
        db.query('INSERT INTO MeterTamperEvents (DRN, previous_state, new_state, active_energy, units) VALUES (?, 0, 1, ?, ?)', [drn, activeEnergy, units]);
        console.log(`[Tamper] NEW tamper detected on ${drn}`);
      }
    } else if (prevState !== newState) {
      db.query('UPDATE MeterTamperStateTracker SET last_tamper_state = ?, last_changed_at = NOW() WHERE DRN = ?', [newState, drn]);
      db.query('INSERT INTO MeterTamperEvents (DRN, previous_state, new_state, active_energy, units) VALUES (?, ?, ?, ?, ?)', [drn, prevState, newState, activeEnergy, units]);
      console.log(`[Tamper] State change on ${drn}: ${prevState} → ${newState}`);
    }
  });
}

function handleNetEnergyBin(drn, buf) {
  if (buf.length < 17) return console.error('[MQTT] NetEnergy packet too short:', buf.length);
  const import_energy = buf.readFloatLE(1);
  const export_energy = buf.readFloatLE(5);
  const net_energy    = buf.readFloatLE(9);
  const record_time   = buf.readUInt32LE(13);

  // Server-side hourly tracking — uses server clock, not ESP32 time
  serverHourlyTrack(drn, import_energy, export_energy);

  db.query('INSERT INTO MeterNetEnergy SET ?', {
    DRN: drn,
    import_energy_wh: import_energy,
    export_energy_wh: export_energy,
    net_energy_wh: net_energy,
    record_time: record_time,
  }, (err) => {
    if (err) console.error('[MQTT] NetEnergy insert error:', err.message);
  });

  db.query(
    `INSERT INTO MeterNetEnergyHourly (DRN, date, hour, min_import_wh, max_import_wh, min_export_wh, max_export_wh, reading_count)
     VALUES (?, CURDATE(), HOUR(NOW()), ?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE
       min_import_wh = LEAST(min_import_wh, VALUES(min_import_wh)),
       max_import_wh = GREATEST(max_import_wh, VALUES(max_import_wh)),
       min_export_wh = LEAST(min_export_wh, VALUES(min_export_wh)),
       max_export_wh = GREATEST(max_export_wh, VALUES(max_export_wh)),
       reading_count = reading_count + 1`,
    [drn, import_energy, import_energy, export_energy, export_energy],
    (err) => { if (err) console.error('[MQTT] NetEnergy hourly upsert error:', err.message); }
  );

  db.query(
    `INSERT INTO MeterNetEnergyDaily (DRN, date, min_import_wh, max_import_wh, min_export_wh, max_export_wh, reading_count)
     VALUES (?, CURDATE(), ?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE
       min_import_wh = LEAST(min_import_wh, VALUES(min_import_wh)),
       max_import_wh = GREATEST(max_import_wh, VALUES(max_import_wh)),
       min_export_wh = LEAST(min_export_wh, VALUES(min_export_wh)),
       max_export_wh = GREATEST(max_export_wh, VALUES(max_export_wh)),
       reading_count = reading_count + 1`,
    [drn, import_energy, import_energy, export_energy, export_energy],
    (err) => { if (err) console.error('[MQTT] NetEnergy daily upsert error:', err.message); }
  );
}

function handleHourlyEnergyBin(drn, buf) {
  if (buf.length < 18) return console.error('[MQTT] HourlyEnergy packet too short:', buf.length);
  const hour        = buf.readUInt8(1);
  const record_time = buf.readUInt32LE(2);
  const import_wh   = buf.readUInt32LE(6);
  const export_wh   = buf.readUInt32LE(10);
  const active_wh   = buf.readUInt32LE(14);

  const currentHour = new Date().getHours();
  const storeDate = hour > currentHour
    ? `DATE_SUB(CURDATE(), INTERVAL 1 DAY)`
    : `CURDATE()`;

  console.log(`[MQTT] HourlyEnergy from ${drn}: hr=${hour} import=${import_wh}Wh export=${export_wh}Wh active=${active_wh}Wh${hour > currentHour ? ' (stored as yesterday)' : ''}`);

  db.query(
    `INSERT INTO MeterHourlyEnergyActual (DRN, date, hour, import_wh, export_wh, active_wh, record_time)
     VALUES (?, ${storeDate}, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       import_wh = VALUES(import_wh),
       export_wh = VALUES(export_wh),
       active_wh = VALUES(active_wh),
       record_time = VALUES(record_time)`,
    [drn, hour, import_wh, export_wh, active_wh, record_time],
    (err) => { if (err) console.error('[MQTT] HourlyEnergyActual upsert error:', err.message); }
  );
}

function handleDailyEnergyBin(drn, buf) {
  if (buf.length < 17) return console.error('[MQTT] DailyEnergy packet too short:', buf.length);
  const record_time = buf.readUInt32LE(1);
  const import_wh   = buf.readUInt32LE(5);
  const export_wh   = buf.readUInt32LE(9);
  const active_wh   = buf.readUInt32LE(13);

  console.log(`[MQTT] DailyEnergy from ${drn}: import=${import_wh}Wh export=${export_wh}Wh active=${active_wh}Wh`);

  db.query(
    `INSERT INTO MeterDailyEnergyActual (DRN, date, import_wh, export_wh, active_wh, record_time)
     VALUES (?, CURDATE(), ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       import_wh = VALUES(import_wh),
       export_wh = VALUES(export_wh),
       active_wh = VALUES(active_wh),
       record_time = VALUES(record_time)`,
    [drn, import_wh, export_wh, active_wh, record_time],
    (err) => { if (err) console.error('[MQTT] DailyEnergyActual upsert error:', err.message); }
  );
}

function handleThdBin(drn, buf) {
  if (buf.length < 21) return console.error('[MQTT] THD packet too short:', buf.length);
  const thd_voltage      = buf.readFloatLE(1);
  const thd_current      = buf.readFloatLE(5);
  const distortion_va    = buf.readFloatLE(9);
  const displacement_pf  = buf.readFloatLE(13);
  const record_time      = buf.readUInt32LE(17);

  console.log(`[MQTT] THD from ${drn}: V=${thd_voltage.toFixed(2)}% I=${thd_current.toFixed(2)}% D=${distortion_va.toFixed(1)}VA DPF=${displacement_pf.toFixed(3)}`);

  db.query(
    `INSERT INTO MeterTHD (DRN, thd_voltage, thd_current, distortion_va, displacement_pf, record_time)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [drn, thd_voltage, thd_current, distortion_va, displacement_pf, record_time],
    (err) => { if (err) console.error('[MQTT] THD insert error:', err.message); }
  );
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

  console.log(`[MQTT] Token from ${drn} (binary): id=${tid.value}, method=${method}, amount=${amt}, cls=${cls}`);
  db.query('INSERT INTO STSTokesInfo SET ?', {
    DRN: drn, token_id: tid.value, token_cls: cls, submission_Method: method,
    display_msg: msg.value, display_auth_result: auth, display_token_result: tres,
    display_validation_result: vres, token_time: ttime, token_amount: amt,
  }, (err) => {
    if (err) console.error('[MQTT] Token insert error:', err.message);
    else console.log(`[MQTT] Token stored for ${drn}: ${tid.value}`);
  });
}

function handleRelayLogBin(drn, buf) {
  // Binary format: [0x06][u32 timestamp LE][u8 relay_index][u8 entry_type]
  //                [u8 state][u8 control][u8 reason][u8 trigger][lstr reason_text]
  if (buf.length < 12) return console.error('[MQTT] Relay log packet too short:', buf.length);
  let off = 1;
  const timestamp = buf.readUInt32LE(off); off += 4;
  const relay_index = buf.readUInt8(off++);
  const entry_type = buf.readUInt8(off++);
  const state = buf.readUInt8(off++);
  const control = buf.readUInt8(off++);
  const reason = buf.readUInt8(off++);
  const trigger = buf.readUInt8(off++);
  const rt = readLStr(buf, off);

  console.log(`[MQTT] Relay event from ${drn}: idx=${relay_index} state=${state} ctrl=${control} reason=${reason} '${rt.value}'`);

  // Insert into meter_relay_events (the table the web API reads from)
  db.query(
    `INSERT INTO meter_relay_events
       (drn, relay_index, entry_type, state, control, reason_code, reason_text, trigger_type, meter_timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?))`,
    [drn, relay_index, entry_type, state, control, reason, rt.value, trigger, timestamp],
    (err) => { if (err) console.error('[MQTT] Relay event insert error:', err.message); }
  );

  // Update MeterLoadControl for immediate state visibility
  // relay_index: 0 = mains, 1 = geyser
  db.query(
    'SELECT geyser_state, geyser_control, mains_state, mains_control FROM MeterLoadControl WHERE DRN = ? ORDER BY date_time DESC LIMIT 1',
    [drn],
    (err, rows) => {
      const prev = (!err && rows && rows.length > 0) ? rows[0] : { geyser_state: 0, geyser_control: 0, mains_state: 0, mains_control: 0 };
      const isMains = relay_index === 0;
      const isGeyser = relay_index === 1;
      db.query('INSERT INTO MeterLoadControl SET ?', {
        DRN: drn,
        geyser_state:   isGeyser ? state : prev.geyser_state,
        geyser_control: isGeyser ? control : prev.geyser_control,
        mains_state:    isMains ? state : prev.mains_state,
        mains_control:  isMains ? control : prev.mains_control,
      }, (err2) => {
        if (err2) console.error('[MQTT] Relay LoadControl insert error:', err2.message);
        else console.log(`[MQTT] Relay log updated MeterLoadControl for ${drn}`);
      });
    }
  );
}

// ==================== JSON Handlers (new MQTT topics) ====================

function handleAckJson(drn, data) {
  console.log(`[MQTT] ACK from ${drn}: type=${data.type}, status=${data.status}${data.detail ? ', detail=' + data.detail : ''}${data.amount !== undefined ? ', amount=' + data.amount : ''}`);

  // On successful geyser control ACK (gc = control enable/disable, gs = relay state on/off)
  // ESP32 sends type: "gc" or "gs", detail: "enabled"/"disabled" or "on"/"off"
  if ((data.type === 'gc' || data.type === 'gs' || data.type === 'geyser_control') && data.status === 'ok') {
    const geyserState = (data.detail === 'on' || data.detail === 'enabled') ? 1 : 0;
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

      // Find the transfer record to get source_drn and watt_hours
      db.query(
        'SELECT id, source_drn, watt_hours FROM CreditTransfers WHERE target_drn = ? AND status IN (?, ?) ORDER BY created_at DESC LIMIT 1',
        [drn, 'token_generated', 'forwarded'],
        (err, rows) => {
          if (err) {
            console.error('[MQTT] CreditTransfer lookup error:', err.message);
            return;
          }
          if (!rows || rows.length === 0) {
            console.error('[MQTT] No matching transfer record found for target:', drn);
            return;
          }

          const transfer = rows[0];
          const sourceDrn = transfer.source_drn;
          const wattHours = transfer.watt_hours;

          // Update status to 'completing' (waiting for source deduction)
          db.query(
            'UPDATE CreditTransfers SET status = ?, target_ack_at = NOW() WHERE id = ?',
            ['completing', transfer.id],
            (err) => { if (err) console.error('[MQTT] CreditTransfer completing update error:', err.message); }
          );

          // Send credit_deduct command to source meter
          try {
            publishCommand(sourceDrn, {
              type: 'credit_deduct',
              watt_hours: wattHours,
              target_meter: drn,
              transfer_id: transfer.id,
            }, 1);
            console.log(`[MQTT] Sent credit_deduct to source ${sourceDrn}: ${wattHours} Wh`);
          } catch (pubErr) {
            console.error(`[MQTT] Failed to send credit_deduct to ${sourceDrn}:`, pubErr.message);
          }
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

  // On credit_deduct ACK from source meter — credit was deducted, transfer is complete
  if (data.type === 'credit_deduct') {
    if (data.status === 'ok') {
      console.log(`[MQTT] Credit deduct ACK: source=${drn} deducted successfully`);
      db.query(
        'UPDATE CreditTransfers SET status = ? WHERE source_drn = ? AND status = ? ORDER BY created_at DESC LIMIT 1',
        ['completed', drn, 'completing'],
        (err) => {
          if (err) console.error('[MQTT] CreditTransfer complete update error:', err.message);
          else console.log(`[MQTT] Credit transfer from ${drn} marked COMPLETED`);
        }
      );
    } else {
      console.error(`[MQTT] Credit deduct failed on source ${drn}: ${data.detail || 'unknown'}`);
      db.query(
        'UPDATE CreditTransfers SET status = ?, error_detail = ? WHERE source_drn = ? AND status = ? ORDER BY created_at DESC LIMIT 1',
        ['failed', 'Source deduction failed: ' + (data.detail || 'unknown'), drn, 'completing'],
        (err) => { if (err) console.error('[MQTT] CreditTransfer fail update error:', err.message); }
      );
    }
  }

  // On successful mains control ACK (mc = control enable/disable, ms = relay state on/off)
  // ESP32 sends type: "mc" or "ms", detail: "enabled"/"disabled" or "on"/"off"
  if ((data.type === 'mc' || data.type === 'ms' || data.type === 'mains_control') && data.status === 'ok') {
    const mainsState = (data.detail === 'on' || data.detail === 'enabled') ? 1 : 0;
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

  // On calibration ACK — log results from auto-calibrate or verify
  if ((data.type === 'calibrate' || data.type === 'cal') && data.status === 'ok') {
    console.log(`[MQTT] Calibration ACK from ${drn}: detail=${data.detail}`);

    const updateData = { status: 'completed' };

    if (data.readings) {
      updateData.voltage = data.readings.voltage || null;
      updateData.current_val = data.readings.current || null;
      updateData.active_power = data.readings.active_power || null;
      updateData.reactive_power = data.readings.reactive_power || null;
      updateData.apparent_power = data.readings.apparent_power || null;
      updateData.frequency = data.readings.frequency || null;
      updateData.power_factor = data.readings.power_factor || null;
      updateData.temperature = data.readings.temperature || null;
      updateData.deviation_pct = data.readings.deviation_pct || null;
      updateData.result = data.readings.result || data.detail;
      updateData.health_score = data.readings.health_score || null;
    } else {
      updateData.result = data.detail || 'ok';
    }

    // Update the most recent pending calibration log for this meter
    db.query(
      `UPDATE MeterCalibrationLog SET status = ?, result = ?, voltage = ?, current_val = ?,
       active_power = ?, reactive_power = ?, apparent_power = ?, frequency = ?,
       power_factor = ?, temperature = ?, deviation_pct = ?, health_score = ?,
       completed_at = NOW()
       WHERE DRN = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
      [
        updateData.status, updateData.result || 'ok',
        updateData.voltage || null, updateData.current_val || null,
        updateData.active_power || null, updateData.reactive_power || null,
        updateData.apparent_power || null, updateData.frequency || null,
        updateData.power_factor || null, updateData.temperature || null,
        updateData.deviation_pct || null, updateData.health_score || null,
        drn,
      ],
      (err) => {
        if (err) console.error('[MQTT] Calibration log update error:', err.message);
        else console.log(`[MQTT] Calibration log updated for ${drn}: ${updateData.result}`);
      }
    );
  }

  if ((data.type === 'calibrate' || data.type === 'cal') && data.status === 'error') {
    console.error(`[MQTT] Calibration error from ${drn}: ${data.detail}`);
    db.query(
      `UPDATE MeterCalibrationLog SET status = 'failed', result = ?, completed_at = NOW()
       WHERE DRN = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
      [data.detail || 'unknown error', drn],
      (err) => { if (err) console.error('[MQTT] Calibration log fail update error:', err.message); }
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
    const ts = evt.timestamp || Math.floor(Date.now() / 1000);
    db.query(
      `INSERT INTO meter_relay_events
         (drn, relay_index, entry_type, state, control, reason_code, reason_text, trigger_type, meter_timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?))`,
      [
        drn,
        evt.relay_index != null ? evt.relay_index : 0,
        evt.entry_type != null ? evt.entry_type : 0,
        evt.state != null ? evt.state : 0,
        evt.control != null ? evt.control : 0,
        evt.reason != null ? evt.reason : 0,
        evt.reason_text || '',
        evt.trigger != null ? evt.trigger : 0,
        ts,
      ],
      (err) => { if (err) console.error('[MQTT] Relay event insert error:', err.message); }
    );
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

function handleEnergyUsageJson(drn, data) {
  const hourly = data.hourly;
  if (!Array.isArray(hourly) || hourly.length !== 24) {
    return console.error('[MQTT] energy_usage: invalid hourly array');
  }
  console.log(`[MQTT] Hourly energy from ${drn}: total=${data.total}Wh, peak=${data.peak_power}W`);

  db.query('INSERT INTO MeterHourlyEnergy SET ?', {
    DRN: drn,
    hourly_data: JSON.stringify(hourly),
    cumulative: data.cumulative || 0,
    peak_power: data.peak_power || 0,
    total: data.total || 0,
    record_time: data.ts || Math.floor(Date.now() / 1000),
  }, (err) => { if (err) console.error('[MQTT] HourlyEnergy insert error:', err.message); });
}

function handleEmergencyJson(drn, data) {
  const code = data.emergency_code;
  const ts = data.timestamp || Math.floor(Date.now() / 1000);
  console.log(`[MQTT] Emergency from ${drn}: code=${code}`);

  db.query('INSERT INTO MeterEmergencyResponse SET ?', {
    DRN: drn,
    emergency_code: code,
    timestamp: ts,
  }, (err) => {
    if (err) {
      // Table might have different name — try legacy table
      db.query('INSERT INTO EmergencyResponse SET ?', {
        DRN: drn,
        emergency_code: code,
        timestamp: ts,
      }, (err2) => {
        if (err2) console.error('[MQTT] Emergency insert error:', err2.message);
      });
    }
  });
}

function handleTouStatusJson(drn, data) {
  console.log(`[MQTT] TOU status from ${drn}: mode=${data.mode}, period=${data.current_period}`);
  db.query(
    `INSERT INTO MeterTOUConfig (DRN, mode, dsm_enabled, current_period, active_tariff_index, monthly_consumption_wh, config_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE mode = VALUES(mode), dsm_enabled = VALUES(dsm_enabled), current_period = VALUES(current_period),
     active_tariff_index = VALUES(active_tariff_index), monthly_consumption_wh = VALUES(monthly_consumption_wh), config_json = VALUES(config_json)`,
    [drn, data.mode || 0, data.dsm ? 1 : 0, data.current_period || 'STANDARD',
     data.active_tariff_index || 0, data.monthly_consumption_wh || 0, JSON.stringify(data)],
    (err) => { if (err) console.error('[MQTT] TOU status upsert error:', err.message); }
  );
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
      }, (err) => {
        if (err) console.error('[MQTT] Energy insert error:', err.message);
        else updateSuburbDailyEnergy(drn);
      });
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
      console.log(`[MQTT] Token from ${drn}: id=${record.token_id}, method=${record.submission_Method}, amount=${record.token_amount}`);
      db.query('INSERT INTO STSTokesInfo SET ?', record, (err) => {
        if (err) console.error('[MQTT] Token insert error:', err.message);
        else console.log(`[MQTT] Token stored for ${drn}: ${record.token_id}`);
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

module.exports = { init, publishCommand, getClient, startMqttOta, getFirmwareInfo };
