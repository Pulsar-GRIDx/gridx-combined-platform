'use strict';

/**
 * GridX Consumption Sync Service
 *
 * Merges MeteringPower and MeterCumulativeEnergyUsage readings that arrive at
 * different timestamps, verifies the meter has a registered UUID in the GridX
 * PostgreSQL database, then publishes the combined array to the local EMQX
 * MQTT broker on the topic  meters/<DRN>/data.
 *
 * Merge strategy
 * ──────────────
 * Per-DRN in-memory buffer holds the most recent power reading and the most
 * recent energy reading.  When a new reading arrives the buffer is updated and
 * a sync attempt is made:
 *
 *   1. If BOTH types are present AND their record_time values are within
 *      MATCH_WINDOW_MS of each other → merge, publish, clear buffer.
 *   2. If BOTH types are present but the gap is too large → the OLDER reading
 *      is stale and will never find a match; discard it so that the newer
 *      reading can be paired with the next incoming reading of the opposite
 *      type.
 *   3. If only ONE type is present → nothing to do yet; wait for the other.
 *
 * record_time normalisation
 * ─────────────────────────
 * Meters send record_time as Unix epoch seconds (< 1e12) or epoch ms
 * (≥ 1e12).  Both are normalised to a Unix-second integer before publishing.
 */

const { Pool } = require('pg');
const mqtt = require('mqtt');

// ----- configuration -------------------------------------------------------

const MATCH_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

// ----- PostgreSQL connection pool (UUID lookup only) -----------------------

let _pool = null;

function getPool() {
  if (_pool) return _pool;

  _pool = new Pool({
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT, 10) || 5432,
    user: process.env.DATABASE_USERNAME || 'gridx',
    password: 'dmVyeWNhbWVyYXZhc3RtYXJyaWVkZm9ybXN0cmVldHN0cnVjdHVyZWhhcmR0dWJlZWRnZXN0cmFuZ2VybGltaXRlZGJyb3VnaHRwbGVudHlncmF2aXR5b3V0c2lkZWluZHVzdA==',
    database: process.env.DATABASE_NAME || 'gridxdb',
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  _pool.on('error', (err) => {
    console.error('[GridX PG] Unexpected pool error:', err.message);
  });

  return _pool;
}

const SCHEMA = 'gridxschema';

// ----- MQTT client (singleton, reconnects automatically) -------------------

const MQTT_BROKER = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';

let _mqttClient = null;

function getMqttClient() {
  if (_mqttClient) return _mqttClient;

  _mqttClient = mqtt.connect(MQTT_BROKER, {
    username: process.env.MQTT_USERNAME || 'gridxadmin',
    password: 'YnJva2V3aGVuZXZlcm51bWVyYWxuZXZlcm1pZ2h0Y291cnNlZW50aXJlbHlzb3VuZGU=',
    clientId: `gridx-sync-${process.pid}`,
    clean: true,
    reconnectPeriod: 5_000,
    connectTimeout: 10_000,
  });

  _mqttClient.on('connect', () => {
    console.log('[GridX MQTT] Connected to broker:', MQTT_BROKER);
  });

  _mqttClient.on('error', (err) => {
    console.error('[GridX MQTT] Client error:', err.message);
  });

  _mqttClient.on('reconnect', () => {
    console.log('[GridX MQTT] Reconnecting to broker…');
  });

  return _mqttClient;
}

// Eagerly open the MQTT connection when this module is first loaded so the
// client is ready before the first reading arrives.
getMqttClient();

// ----- helpers -------------------------------------------------------------

/**
 * Normalise a meter record_time value to Unix seconds (integer).
 * Meters may send Unix seconds (< 1e12) or Unix milliseconds (≥ 1e12).
 */
function toUnixSeconds(recordTime) {
  const n = Number(recordTime);
  if (Number.isNaN(n) || n <= 0) return Math.floor(Date.now() / 1000);
  return n < 1e12 ? Math.floor(n) : Math.floor(n / 1000);
}

/**
 * Look up the UUID for a meter by its DRN (stored in customer_number).
 * Returns the UUID string, or null if not found.
 */
async function findMeterProfileId(drn) {
  const pool = getPool();
  let result;
  try {
    result = await pool.query(
      `SELECT id FROM "${SCHEMA}"."meter_profile" WHERE drn = $1 LIMIT 1`,
      [String(drn)]
    );
  } catch (pgErr) {
    console.error(`[GridX PG] UUID lookup failed for DRN ${drn}:`, pgErr.message);
    throw pgErr;
  }
  if (result.rows.length === 0) {
    console.warn(`[GridX MQTT] DRN ${drn} has no registered profile in meter_profile – skipping publish.`);
    return null;
  }
  return result.rows[0].id;
}

/**
 * Build and publish the merged data array to  meters/<DRN>/data.
 *
 * Payload array order (matches the documented data contract):
 *   [drn, active_energy, reactive_energy, units, voltage, current,
 *    active_power, reactive_power, apparent_power, temperature,
 *    frequency, power_factor, record_time, source]
 */
function formatTimestamp(date) {
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const year   = date.getFullYear();
  const month  = pad(date.getMonth() + 1);
  const day    = pad(date.getDate());
  const hours  = pad(date.getHours());
  const mins   = pad(date.getMinutes());
  const secs   = pad(date.getSeconds());
  const ms     = pad(date.getMilliseconds(), 3);
  const tzOff  = -date.getTimezoneOffset();
  const tzSign = tzOff >= 0 ? '+' : '-';
  const tzH    = pad(Math.floor(Math.abs(tzOff) / 60));
  const tzM    = pad(Math.abs(tzOff) % 60);
  return `${year}-${month}-${day} ${hours}:${mins}:${secs}.${ms} ${tzSign}${tzH}${tzM}`;
}

function publishToMqtt(drn, power, energy) {
  // Use the current wall-clock time as the record_time (time of publishing).
  const record_time = formatTimestamp(new Date());

  const payload = [
    energy.active_energy   ?? 0,
    energy.reactive_energy ?? 0,
    String(energy.units ?? 'kWh'),
    power.voltage          ?? 0,
    power.current          ?? 0,
    power.active_power     ?? 0,
    power.reactive_power   ?? 0,
    power.apparent_power   ?? 0,
    power.temperature      ?? energy.meter_reset ?? 0,
    power.frequency        ?? 0,
    power.power_factor     ?? 0,
    record_time,
    String(power.source ?? energy.source ?? 0),
  ];

  const topic = `meters/${drn}/data`;
  const client = getMqttClient();

  console.log(`[GridX MQTT] Publishing to ${topic}`, payload);

  return new Promise((resolve, reject) => {
    client.publish(topic, JSON.stringify(payload), { qos: 1, retain: false }, (err) => {
      if (err) {
        console.error(`[GridX MQTT] Publish failed for ${topic}:`, err.message);
        return reject(err);
      }
      console.log(`[GridX MQTT] Published successfully to ${topic}`);
      resolve();
    });
  });
}

// ----- in-memory buffer ----------------------------------------------------

/**
 * @type {Map<string, { power: object|null, energy: object|null }>}
 */
const _buffer = new Map();

function getSlot(drn) {
  if (!_buffer.has(drn)) {
    _buffer.set(drn, { power: null, energy: null });
  }
  return _buffer.get(drn);
}

/**
 * Attempt to merge and sync for a given DRN.
 * Called after either slot is updated.
 */
async function trySync(drn) {
  const slot = _buffer.get(drn);
  if (!slot || !slot.power || !slot.energy) {
    console.log(`[GridX MQTT] Buffer for DRN ${drn}: power=${!!slot?.power}, energy=${!!slot?.energy} – waiting for both readings.`);
    return;
  }

  const powerTs  = toUnixSeconds(slot.power.record_time);
  const energyTs = toUnixSeconds(slot.energy.record_time);
  const gap = Math.abs(powerTs - energyTs) * 1000; // convert to ms for comparison

  console.log(`[GridX MQTT] DRN ${drn} – gap between readings: ${(gap / 1000).toFixed(1)}s (window: ${MATCH_WINDOW_MS / 1000}s)`);

  if (gap > MATCH_WINDOW_MS) {
    // The two readings are too far apart – discard whichever is older so the
    // newer one can be paired with the NEXT reading of the opposite type.
    if (powerTs < energyTs) {
      console.warn(`[GridX MQTT] DRN ${drn} – power reading too old (gap ${(gap/1000).toFixed(1)}s), discarding it.`);
      slot.power = null;
    } else {
      console.warn(`[GridX MQTT] DRN ${drn} – energy reading too old (gap ${(gap/1000).toFixed(1)}s), discarding it.`);
      slot.energy = null;
    }
    return;
  }

  // Both readings are within the acceptance window – merge and publish.
  const { power, energy } = slot;

  // Clear the buffer slot immediately to prevent duplicate publishes if
  // trySync is re-entered for the same DRN before this async call completes.
  _buffer.delete(drn);

  console.log(`[GridX MQTT] DRN ${drn} – readings matched, looking up PG profile…`);

  try {
    const meterProfileId = await findMeterProfileId(drn);
    if (!meterProfileId) {
      // findMeterProfileId already logged the reason.
      return;
    }
    console.log(`[GridX MQTT] DRN ${drn} – profile found (${meterProfileId}), publishing…`);
    await publishToMqtt(drn, power, energy);
  } catch (err) {
    console.error(`[GridX MQTT] Failed to sync DRN ${drn}:`, err.message);
    // Re-buffer so the next incoming reading can trigger another attempt.
    _buffer.set(drn, { power, energy });
  }
}

// ----- public API ----------------------------------------------------------

/**
 * Called after a MeteringPower row is successfully written to MySQL.
 * If a previous power reading is still buffered (no matching energy arrived
 * yet), it is always replaced by this newer one – latest wins.
 *
 * @param {string|number} drn
 * @param {object} powerData  – the meterPowerModel instance that was inserted
 */
function onPowerReading(drn, powerData) {
  const slot = getSlot(String(drn));
  if (slot.power) {
    console.log(`[GridX MQTT] DRN ${drn} – replacing buffered power reading with newer one (record_time: ${powerData.record_time}).`);
  }
  slot.power = { ...powerData };
  trySync(String(drn)).catch((err) =>
    console.error(`[GridX MQTT] trySync error (power) for DRN ${drn}:`, err.message)
  );
}

/**
 * Called after a MeterCumulativeEnergyUsage row is successfully written to MySQL.
 * If a previous energy reading is still buffered (no matching power arrived
 * yet), it is always replaced by this newer one – latest wins.
 *
 * @param {string|number} drn
 * @param {object} energyData – the meterEnergyModel instance that was inserted
 */
function onEnergyReading(drn, energyData) {
  const slot = getSlot(String(drn));
  if (slot.energy) {
    console.log(`[GridX MQTT] DRN ${drn} – replacing buffered energy reading with newer one (record_time: ${energyData.record_time}).`);
  }
  slot.energy = { ...energyData };
  trySync(String(drn)).catch((err) =>
    console.error(`[GridX MQTT] trySync error (energy) for DRN ${drn}:`, err.message)
  );
}

module.exports = { onPowerReading, onEnergyReading };
