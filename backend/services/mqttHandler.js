/**
 * MQTT Handler — Bridges MQTT telemetry from ESP32 meters to MySQL.
 * Subscribes to gx/{drn}/{type} topics and inserts into the same tables
 * as the HTTP API endpoints. Also provides publishCommand() for sending
 * control commands back to meters.
 */
const mqtt = require('mqtt');
const http = require('http');
const db = require('../config/db');

let mqttClient = null;

// Topic patterns
const TOPICS = [
  'gx/+/power',
  'gx/+/energy',
  'gx/+/cellular',
  'gx/+/load',
  'gx/+/token',
];

// EMQX REST API helper
function emqxApi(method, path, body) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from('gridxadmin:gridx2026').toString('base64');
    const options = {
      hostname: '127.0.0.1',
      port: 18083,
      path: `/api/v5${path}`,
      method: method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, data: data }); }
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

    // 1. Set authorization no_match to allow
    const settingsResult = await emqxApi('PUT', '/authorization/settings', {
      no_match: 'allow',
      deny_action: 'ignore'
    });
    console.log('[MQTT] Authorization settings:', settingsResult.status);

    // 2. Get current authorization sources and disable HTTP ones
    const sources = await emqxApi('GET', '/authorization/sources');
    if (sources.data && Array.isArray(sources.data)) {
      for (const src of sources.data) {
        if (src.type === 'http' && src.enable !== false) {
          console.log('[MQTT] Disabling HTTP authorization source...');
          const disableResult = await emqxApi('PUT', `/authorization/sources/${src.type}`, {
            ...src,
            enable: false
          });
          console.log('[MQTT] HTTP authz disable result:', disableResult.status);
        }
      }
    }

    // 3. Get auth backends and disable HTTP ones
    const authBackends = await emqxApi('GET', '/authentication');
    if (authBackends.data && Array.isArray(authBackends.data)) {
      for (const backend of authBackends.data) {
        if (backend.mechanism === 'password_based' && backend.backend === 'http' && backend.enable !== false) {
          console.log('[MQTT] Disabling HTTP auth backend:', backend.id);
          const disableResult = await emqxApi('PUT', `/authentication/${backend.id}`, {
            ...backend,
            enable: false
          });
          console.log('[MQTT] HTTP auth disable result:', disableResult.status);
        }
      }
    }

    // 4. Ensure built-in database auth is enabled
    const authCheck = await emqxApi('GET', '/authentication');
    if (authCheck.data && Array.isArray(authCheck.data)) {
      const builtIn = authCheck.data.find(b => b.backend === 'built_in_database');
      if (builtIn && !builtIn.enable) {
        console.log('[MQTT] Enabling built-in database auth...');
        await emqxApi('PUT', `/authentication/${builtIn.id}`, {
          ...builtIn,
          enable: true
        });
      }
      console.log('[MQTT] Auth backends:', authCheck.data.map(b => `${b.id}(${b.enable ? 'ON' : 'OFF'})`).join(', '));
    }

    // 5. Verify users exist
    const users = await emqxApi('GET', '/authentication/password_based:built_in_database/users?page=1&limit=100');
    if (users.data && users.data.data) {
      console.log('[MQTT] Built-in users:', users.data.data.map(u => u.user_id).join(', '));
      
      // Check if gridx-backend exists
      const hasBackend = users.data.data.some(u => u.user_id === 'gridx-backend');
      if (!hasBackend) {
        console.log('[MQTT] Creating gridx-backend user...');
        await emqxApi('POST', '/authentication/password_based:built_in_database/users', {
          user_id: 'gridx-backend',
          password: 'gridx-mqtt-2026',
          is_superuser: true
        });
      }
      
      const hasMeter = users.data.data.some(u => u.user_id === 'gridx-meter');
      if (!hasMeter) {
        console.log('[MQTT] Creating gridx-meter user...');
        await emqxApi('POST', '/authentication/password_based:built_in_database/users', {
          user_id: 'gridx-meter',
          password: 'meter-mqtt-2026',
          is_superuser: false
        });
      }
    }

    console.log('[MQTT] EMQX authorization fix complete');
  } catch (err) {
    console.error('[MQTT] EMQX fix error (non-fatal):', err.message);
  }
}

async function init() {
  // Fix EMQX auth/authz settings before connecting
  await fixEmqxAuth();

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
      if (err) {
        console.error('[MQTT] Subscribe error:', err.message);
      } else {
        console.log('[MQTT] Subscribed to:', TOPICS.join(', '));
      }
    });
  });

  mqttClient.on('message', (topic, message) => {
    try {
      handleMessage(topic, message.toString());
    } catch (err) {
      console.error('[MQTT] Message handling error:', err.message);
    }
  });

  mqttClient.on('error', (err) => {
    console.error('[MQTT] Connection error:', err.message);
  });

  mqttClient.on('reconnect', () => {
    console.log('[MQTT] Reconnecting...');
  });

  return mqttClient;
}

function handleMessage(topic, payload) {
  const parts = topic.split('/');
  if (parts.length !== 3 || parts[0] !== 'gx') return;

  const drn = parts[1];
  const type = parts[2];

  let data;
  try {
    data = JSON.parse(payload);
  } catch (e) {
    console.error(`[MQTT] Invalid JSON on ${topic}:`, payload);
    return;
  }

  console.log(`[MQTT] ${type} from ${drn}`);

  switch (type) {
    case 'power':   handlePower(drn, data); break;
    case 'energy':  handleEnergy(drn, data); break;
    case 'cellular': handleCellular(drn, data); break;
    case 'load':    handleLoad(drn, data); break;
    case 'token':   handleToken(drn, data); break;
    default:        console.warn(`[MQTT] Unknown type: ${type}`);
  }
}

function handlePower(drn, data) {
  if (!Array.isArray(data) || data.length < 9) {
    console.error('[MQTT] Invalid power data format');
    return;
  }
  const record = {
    DRN: drn,
    current: data[0],
    voltage: data[1],
    active_power: data[2],
    reactive_power: data[3],
    apparent_power: data[4],
    temperature: data[5],
    frequency: data[6],
    power_factor: data[7],
    record_time: data[8],
    source: 1,
  };
  db.query('INSERT INTO MeteringPower SET ?', record, (err) => {
    if (err) console.error('[MQTT] Power insert error:', err.message);
  });
}

function handleEnergy(drn, data) {
  if (!Array.isArray(data) || data.length < 7) {
    console.error('[MQTT] Invalid energy data format');
    return;
  }
  const record = {
    DRN: drn,
    active_energy: data[0],
    reactive_energy: data[1],
    units: data[2],
    tamper_state: data[3],
    tamp_time: data[4],
    meter_reset: data[5],
    record_time: data[6],
    source: 1,
  };
  db.query('INSERT INTO MeterCumulativeEnergyUsage SET ?', record, (err) => {
    if (err) console.error('[MQTT] Energy insert error:', err.message);
  });
}

function handleCellular(drn, data) {
  if (!Array.isArray(data) || data.length < 5) {
    console.error('[MQTT] Invalid cellular data format');
    return;
  }
  const record = {
    DRN: drn,
    signal_strength: data[0],
    service_provider: data[1],
    sim_phone_number: data[2],
    IMEU: data[3],
    record_time: data[4],
  };
  db.query('INSERT INTO MeterCellularNetworkProperties SET ?', record, (err) => {
    if (err) console.error('[MQTT] Cellular insert error:', err.message);
  });
}

function handleLoad(drn, data) {
  if (!Array.isArray(data) || data.length < 4) {
    console.error('[MQTT] Invalid load data format');
    return;
  }
  const record = {
    DRN: drn,
    geyser_state: data[0],
    geyser_control: data[1],
    mains_state: data[2],
    mains_control: data[3],
  };
  db.query('INSERT INTO MeterLoadControl SET ?', record, (err) => {
    if (err) console.error('[MQTT] Load insert error:', err.message);
  });
}

function handleToken(drn, data) {
  let record;
  if (Array.isArray(data) && data.length >= 9) {
    record = {
      DRN: drn,
      token_id: data[0],
      token_cls: data[1],
      submission_Method: data[2],
      display_msg: data[3],
      display_auth_result: data[4],
      display_token_result: data[5],
      display_validation_result: data[6],
      token_time: data[7],
      token_amount: data[8],
    };
  } else if (typeof data === 'object' && !Array.isArray(data)) {
    record = { DRN: drn, ...data };
  } else {
    console.error('[MQTT] Invalid token data format');
    return;
  }
  db.query('INSERT INTO STSTokesInfo SET ?', record, (err) => {
    if (err) console.error('[MQTT] Token insert error:', err.message);
  });
}

function publishCommand(drn, command) {
  if (!mqttClient || !mqttClient.connected) {
    throw new Error('MQTT client not connected');
  }
  const topic = `gx/${drn}/cmd`;
  const payload = JSON.stringify(command);
  mqttClient.publish(topic, payload, { qos: 0 }, (err) => {
    if (err) {
      console.error(`[MQTT] Publish error to ${topic}:`, err.message);
    } else {
      console.log(`[MQTT] Command sent to ${drn}:`, payload);
    }
  });
}

function getClient() {
  return mqttClient;
}

module.exports = { init, publishCommand, getClient };
