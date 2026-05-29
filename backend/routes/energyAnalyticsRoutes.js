/**
 * Energy Analytics Routes — regional summaries, substation aggregation,
 * power-flow mapping, and SSE real-time streaming for the GRIDx dashboard.
 */
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken } = require('../admin/authMiddllware');

// ─── Helpers ──────────────────────────────────────────────────────────
function queryAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

function queryOne(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows && rows.length > 0 ? rows[0] : null);
    });
  });
}

function runExec(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

// ─── SubstationConfig auto-create & seed ──────────────────────────────
async function ensureSubstationConfig() {
  await runExec(`
    CREATE TABLE IF NOT EXISTS SubstationConfig (
      id INT AUTO_INCREMENT PRIMARY KEY,
      drn VARCHAR(50) NOT NULL,
      name VARCHAR(100),
      type ENUM('distribution', 'primary') DEFAULT 'distribution',
      parent_substation_id INT DEFAULT NULL,
      lat DOUBLE,
      lng DOUBLE,
      power_rating_kva INT DEFAULT 0,
      district VARCHAR(100),
      city VARCHAR(100) DEFAULT 'Windhoek',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const count = await queryOne(`SELECT COUNT(*) AS cnt FROM SubstationConfig`);
  if (count && count.cnt > 0) return;

  // Seed Windhoek substations
  const primaries = [
    { drn: 'SUB-VE-001', name: 'Van Eck Primary Substation',  type: 'primary', lat: -22.5411, lng: 17.0644, rating: 0, district: 'Central' },
    { drn: 'SUB-BW-001', name: 'Brakwater Substation',        type: 'primary', lat: -22.5205, lng: 17.0733, rating: 0, district: 'North' },
    { drn: 'SUB-AU-001', name: 'Auas Substation',             type: 'primary', lat: -22.5891, lng: 17.0815, rating: 0, district: 'South' },
  ];

  for (const p of primaries) {
    await runExec(
      `INSERT INTO SubstationConfig (drn, name, type, lat, lng, power_rating_kva, district, city) VALUES (?, ?, ?, ?, ?, ?, ?, 'Windhoek')`,
      [p.drn, p.name, p.type, p.lat, p.lng, p.rating, p.district]
    );
  }

  // Fetch inserted primary IDs
  const vanEck    = await queryOne(`SELECT id FROM SubstationConfig WHERE drn = 'SUB-VE-001'`);
  const brakwater = await queryOne(`SELECT id FROM SubstationConfig WHERE drn = 'SUB-BW-001'`);
  const auas      = await queryOne(`SELECT id FROM SubstationConfig WHERE drn = 'SUB-AU-001'`);

  const distributions = [
    { drn: 'SUB-ER-001', name: 'Eros Distribution',               lat: -22.5638, lng: 17.0853, parent: vanEck.id,    district: 'Eros' },
    { drn: 'SUB-KH-001', name: 'Khomasdal Distribution',          lat: -22.5511, lng: 17.0412, parent: vanEck.id,    district: 'Khomasdal' },
    { drn: 'SUB-KT-001', name: 'Katutura Distribution',           lat: -22.5263, lng: 17.0544, parent: vanEck.id,    district: 'Katutura' },
    { drn: 'SUB-SI-001', name: 'Southern Industrial Distribution', lat: -22.5903, lng: 17.0688, parent: auas.id,      district: 'Southern Industrial' },
    { drn: 'SUB-NI-001', name: 'Northern Industrial Distribution', lat: -22.5457, lng: 17.0511, parent: brakwater.id, district: 'Northern Industrial' },
    { drn: 'SUB-OL-001', name: 'Olympia Distribution',            lat: -22.5791, lng: 17.0789, parent: auas.id,      district: 'Olympia' },
    { drn: 'SUB-DP-001', name: 'Dorado Park Distribution',        lat: -22.5844, lng: 17.0522, parent: auas.id,      district: 'Dorado Park' },
    { drn: 'SUB-WN-001', name: 'Wanaheda Distribution',           lat: -22.5344, lng: 17.0433, parent: vanEck.id,    district: 'Wanaheda' },
    { drn: 'SUB-PP-001', name: 'Pioneers Park Distribution',      lat: -22.5733, lng: 17.0611, parent: vanEck.id,    district: 'Pioneers Park' },
    { drn: 'SUB-RC-001', name: 'Rocky Crest Distribution',        lat: -22.5688, lng: 17.0411, parent: brakwater.id, district: 'Rocky Crest' },
    { drn: 'SUB-WW-001', name: 'Windhoek West Distribution',      lat: -22.5677, lng: 17.0755, parent: vanEck.id,    district: 'Windhoek West' },
    { drn: 'SUB-WNR-001', name: 'Windhoek North Distribution',    lat: -22.5550, lng: 17.0725, parent: brakwater.id, district: 'Windhoek North' },
    { drn: 'SUB-CBD-001', name: 'Windhoek CBD Distribution',      lat: -22.5609, lng: 17.0658, parent: vanEck.id,    district: 'Windhoek CBD' },
    { drn: 'SUB-AC-001', name: 'Academia Distribution',           lat: -22.5823, lng: 17.0783, parent: auas.id,      district: 'Academia' },
    { drn: 'SUB-LW-001', name: 'Ludwigsdorf Distribution',        lat: -22.5612, lng: 17.0877, parent: vanEck.id,    district: 'Ludwigsdorf' },
    { drn: 'SUB-KW-001', name: 'Klein Windhoek Distribution',     lat: -22.5713, lng: 17.0912, parent: vanEck.id,    district: 'Klein Windhoek' },
    { drn: 'SUB-SH-001', name: 'Suiderhof Distribution',          lat: -22.5888, lng: 17.0777, parent: auas.id,      district: 'Suiderhof' },
    { drn: 'SUB-OT-001', name: 'Otjomuise Distribution',          lat: -22.5555, lng: 17.0299, parent: brakwater.id, district: 'Otjomuise' },
    { drn: 'SUB-HP-001', name: 'Hochland Park Distribution',      lat: -22.5745, lng: 17.0510, parent: vanEck.id,    district: 'Hochland Park' },
    { drn: 'SUB-PR-001', name: 'Prosperita Distribution',         lat: -22.5750, lng: 17.0380, parent: vanEck.id,    district: 'Prosperita' },
    { drn: 'SUB-AV-001', name: 'Avis Distribution',               lat: -22.5580, lng: 17.0900, parent: vanEck.id,    district: 'Avis' },
    { drn: 'SUB-AB-001', name: 'Auasblick Distribution',          lat: -22.5900, lng: 17.0880, parent: auas.id,      district: 'Auasblick' },
  ];

  for (const d of distributions) {
    await runExec(
      `INSERT INTO SubstationConfig (drn, name, type, parent_substation_id, lat, lng, power_rating_kva, district, city) VALUES (?, ?, 'distribution', ?, ?, ?, 0, ?, 'Windhoek')`,
      [d.drn, d.name, d.parent, d.lat, d.lng, d.district]
    );
  }

  console.log('[EnergyAnalytics] SubstationConfig seeded with 25 Windhoek substations');
}

// Run on module load (non-blocking)
ensureSubstationConfig().catch(err => {
  console.warn('[EnergyAnalytics] SubstationConfig init skipped:', err.message);
});

// ─── 1. Regional Summary ─────────────────────────────────────────────
router.get('/regional-summary', authenticateToken, async (req, res) => {
  try {
    // Get all meters grouped by region (LocationName)
    const meters = await queryAll(`
      SELECT
        mli.LocationName AS region,
        mli.DRN,
        mli.Lat,
        mli.Longitude AS lng,
        mli.Status
      FROM MeterLocationInfoTable mli
      ORDER BY mli.LocationName, mli.DRN
    `);

    if (!meters.length) return res.json([]);

    // Latest power reading per DRN (single efficient query)
    const latestPower = await queryAll(`
      SELECT mp.DRN, mp.voltage, mp.current, mp.active_power, mp.reactive_power,
             mp.apparent_power, mp.temperature, mp.frequency, mp.power_factor, mp.record_time
      FROM MeteringPower mp
      INNER JOIN (
        SELECT DRN, MAX(date_time) AS max_dt
        FROM MeteringPower
        GROUP BY DRN
      ) latest ON mp.DRN = latest.DRN AND mp.date_time = latest.max_dt
    `);

    // Latest net energy per DRN
    const latestEnergy = await queryAll(`
      SELECT mne.DRN, mne.import_energy_wh, mne.export_energy_wh, mne.net_energy_wh
      FROM MeterNetEnergy mne
      INNER JOIN (
        SELECT DRN, MAX(created_at) AS max_dt
        FROM MeterNetEnergy
        GROUP BY DRN
      ) latest ON mne.DRN = latest.DRN AND mne.created_at = latest.max_dt
    `);

    // Index by DRN for fast lookup
    const powerMap = {};
    latestPower.forEach(r => { powerMap[r.DRN] = r; });
    const energyMap = {};
    latestEnergy.forEach(r => { energyMap[r.DRN] = r; });

    // Group meters by region
    const regionMap = {};
    meters.forEach(m => {
      const region = m.region || 'Unknown';
      if (!regionMap[region]) {
        regionMap[region] = { region, meters: [], online: 0, offline: 0 };
      }
      const isOnline = m.Status === '1' || m.Status === 1 || String(m.Status).toLowerCase() === 'active';
      regionMap[region].meters.push(m.DRN);
      if (isOnline) regionMap[region].online++;
      else regionMap[region].offline++;
    });

    // Aggregate per region
    const result = Object.values(regionMap).map(r => {
      let totalActivePower = 0, totalReactivePower = 0, totalApparentPower = 0;
      let voltageSum = 0, pfSum = 0, freqSum = 0, powerCount = 0;
      let totalImport = 0, totalExport = 0, totalNet = 0;

      r.meters.forEach(drn => {
        const pw = powerMap[drn];
        if (pw) {
          totalActivePower += parseFloat(pw.active_power) || 0;
          totalReactivePower += parseFloat(pw.reactive_power) || 0;
          totalApparentPower += parseFloat(pw.apparent_power) || 0;
          voltageSum += parseFloat(pw.voltage) || 0;
          pfSum += parseFloat(pw.power_factor) || 0;
          freqSum += parseFloat(pw.frequency) || 0;
          powerCount++;
        }
        const en = energyMap[drn];
        if (en) {
          totalImport += parseFloat(en.import_energy_wh) || 0;
          totalExport += parseFloat(en.export_energy_wh) || 0;
          totalNet += parseFloat(en.net_energy_wh) || 0;
        }
      });

      return {
        region: r.region,
        meterCount: r.meters.length,
        online: r.online,
        offline: r.offline,
        power: {
          total_active_power: +totalActivePower.toFixed(2),
          total_reactive_power: +totalReactivePower.toFixed(2),
          total_apparent_power: +totalApparentPower.toFixed(2),
          avg_voltage: powerCount ? +(voltageSum / powerCount).toFixed(2) : 0,
          avg_power_factor: powerCount ? +(pfSum / powerCount).toFixed(3) : 0,
          avg_frequency: powerCount ? +(freqSum / powerCount).toFixed(4) : 0,
        },
        energy: {
          total_import_wh: +totalImport.toFixed(2),
          total_export_wh: +totalExport.toFixed(2),
          net_energy_wh: +totalNet.toFixed(2),
          direction: totalNet >= 0 ? 'net_importing' : 'net_exporting',
        },
        meterDRNs: r.meters,
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 2. Substations ──────────────────────────────────────────────────
router.get('/substations', authenticateToken, async (req, res) => {
  try {
    // Get all transformers/substations
    const substations = await queryAll(`
      SELECT ti.id, ti.DRN, ti.Name, ti.LocationName, ti.Type, ti.pLat, ti.pLng,
             ti.Status, ti.PowerSupply, ti.powerRating, ti.city
      FROM TransformerInformation ti
      ORDER BY ti.DRN
    `);

    if (!substations.length) return res.json([]);

    // Get all meter DRNs mapped to their transformer
    const meterTransformerMap = await queryAll(`
      SELECT DRN, TransformerDRN FROM MeterProfileReal WHERE TransformerDRN IS NOT NULL AND TransformerDRN != ''
    `);

    // Group meter DRNs by transformer DRN
    const txMeterMap = {};
    meterTransformerMap.forEach(m => {
      if (!txMeterMap[m.TransformerDRN]) txMeterMap[m.TransformerDRN] = [];
      txMeterMap[m.TransformerDRN].push(m.DRN);
    });

    // Latest power per DRN
    const latestPower = await queryAll(`
      SELECT mp.DRN, mp.active_power
      FROM MeteringPower mp
      INNER JOIN (
        SELECT DRN, MAX(date_time) AS max_dt
        FROM MeteringPower
        GROUP BY DRN
      ) latest ON mp.DRN = latest.DRN AND mp.date_time = latest.max_dt
    `);
    const powerMap = {};
    latestPower.forEach(r => { powerMap[r.DRN] = parseFloat(r.active_power) || 0; });

    // Latest net energy per DRN
    const latestEnergy = await queryAll(`
      SELECT mne.DRN, mne.import_energy_wh, mne.export_energy_wh, mne.net_energy_wh
      FROM MeterNetEnergy mne
      INNER JOIN (
        SELECT DRN, MAX(created_at) AS max_dt
        FROM MeterNetEnergy
        GROUP BY DRN
      ) latest ON mne.DRN = latest.DRN AND mne.created_at = latest.max_dt
    `);
    const energyMap = {};
    latestEnergy.forEach(r => { energyMap[r.DRN] = r; });

    const result = substations.map(sub => {
      const connectedDRNs = txMeterMap[sub.DRN] || [];
      let totalActivePower = 0;
      let totalImport = 0, totalExport = 0, totalNet = 0;

      connectedDRNs.forEach(drn => {
        totalActivePower += powerMap[drn] || 0;
        const en = energyMap[drn];
        if (en) {
          totalImport += parseFloat(en.import_energy_wh) || 0;
          totalExport += parseFloat(en.export_energy_wh) || 0;
          totalNet += parseFloat(en.net_energy_wh) || 0;
        }
      });

      return {
        id: sub.id,
        drn: sub.DRN,
        name: sub.Name,
        locationName: sub.LocationName,
        type: sub.Type,
        lat: parseFloat(sub.pLat) || 0,
        lng: parseFloat(sub.pLng) || 0,
        status: sub.Status,
        powerSupply: sub.PowerSupply,
        powerRating: sub.powerRating,
        city: sub.city,
        connectedMeters: connectedDRNs,
        meterCount: connectedDRNs.length,
        aggregatedPower: {
          total_active_power: +totalActivePower.toFixed(2),
          total_import_wh: +totalImport.toFixed(2),
          total_export_wh: +totalExport.toFixed(2),
          net_energy_wh: +totalNet.toFixed(2),
          direction: totalNet >= 0 ? 'net_importing' : 'net_exporting',
        },
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 3. Power Flow ───────────────────────────────────────────────────
router.get('/power-flow', authenticateToken, async (req, res) => {
  try {
    // All meters with location + profile info
    const meters = await queryAll(`
      SELECT
        mli.DRN,
        mli.Lat AS lat,
        mli.Longitude AS lng,
        mli.LocationName,
        mli.Status,
        mpr.TransformerDRN
      FROM MeterLocationInfoTable mli
      LEFT JOIN MeterProfileReal mpr ON mli.DRN = mpr.DRN
      ORDER BY mli.DRN
    `);

    if (!meters.length) return res.json([]);

    // Latest power per DRN
    const latestPower = await queryAll(`
      SELECT mp.DRN, mp.active_power, mp.voltage, mp.current, mp.power_factor
      FROM MeteringPower mp
      INNER JOIN (
        SELECT DRN, MAX(date_time) AS max_dt
        FROM MeteringPower
        GROUP BY DRN
      ) latest ON mp.DRN = latest.DRN AND mp.date_time = latest.max_dt
    `);
    const powerMap = {};
    latestPower.forEach(r => { powerMap[r.DRN] = r; });

    // Latest energy per DRN
    const latestEnergy = await queryAll(`
      SELECT mne.DRN, mne.import_energy_wh, mne.export_energy_wh
      FROM MeterNetEnergy mne
      INNER JOIN (
        SELECT DRN, MAX(created_at) AS max_dt
        FROM MeterNetEnergy
        GROUP BY DRN
      ) latest ON mne.DRN = latest.DRN AND mne.created_at = latest.max_dt
    `);
    const energyMap = {};
    latestEnergy.forEach(r => { energyMap[r.DRN] = r; });

    const result = meters.map(m => {
      const pw = powerMap[m.DRN] || {};
      const en = energyMap[m.DRN] || {};
      const activePower = parseFloat(pw.active_power) || 0;
      const isOnline = m.Status === '1' || m.Status === 1 || String(m.Status).toLowerCase() === 'active';

      return {
        drn: m.DRN,
        lat: parseFloat(m.lat) || 0,
        lng: parseFloat(m.lng) || 0,
        locationName: m.LocationName || '',
        transformerDRN: m.TransformerDRN || '',
        active_power: +activePower.toFixed(2),
        voltage: +(parseFloat(pw.voltage) || 0).toFixed(2),
        current: +(parseFloat(pw.current) || 0).toFixed(3),
        power_factor: +(parseFloat(pw.power_factor) || 0).toFixed(3),
        import_energy_wh: +(parseFloat(en.import_energy_wh) || 0).toFixed(2),
        export_energy_wh: +(parseFloat(en.export_energy_wh) || 0).toFixed(2),
        direction: activePower >= 0 ? 'importing' : 'exporting',
        online: isOnline,
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 4. Substation Config (with hierarchy) ──────────────────────────
router.get('/substation-config', authenticateToken, async (req, res) => {
  try {
    const subs = await queryAll(`
      SELECT sc.*, ps.name AS parent_name, ps.lat AS parent_lat, ps.lng AS parent_lng
      FROM SubstationConfig sc
      LEFT JOIN SubstationConfig ps ON sc.parent_substation_id = ps.id
      ORDER BY sc.type DESC, sc.name
    `);
    res.json(subs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 5. SSE — real-time power updates ────────────────────────────────
router.get('/sse', authenticateToken, (req, res) => {
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable NGINX buffering
  });
  res.flushHeaders();

  // Send initial connection event
  res.write(`event: connected\ndata: ${JSON.stringify({ message: 'SSE connected', time: new Date().toISOString() })}\n\n`);

  const intervalId = setInterval(async () => {
    try {
      // Fetch power readings that arrived in the last 10 seconds
      const readings = await queryAll(`
        SELECT
          mp.DRN,
          mp.voltage,
          mp.current,
          mp.active_power,
          mp.reactive_power,
          mp.apparent_power,
          mp.power_factor,
          mp.frequency,
          mp.temperature,
          mp.record_time,
          mp.date_time
        FROM MeteringPower mp
        WHERE mp.date_time >= NOW() - INTERVAL 10 SECOND
        ORDER BY mp.date_time DESC
      `);

      if (readings.length > 0) {
        const payload = readings.map(r => ({
          drn: r.DRN,
          voltage: +(parseFloat(r.voltage) || 0).toFixed(2),
          current: +(parseFloat(r.current) || 0).toFixed(3),
          active_power: +(parseFloat(r.active_power) || 0).toFixed(2),
          reactive_power: +(parseFloat(r.reactive_power) || 0).toFixed(2),
          apparent_power: +(parseFloat(r.apparent_power) || 0).toFixed(2),
          power_factor: +(parseFloat(r.power_factor) || 0).toFixed(3),
          frequency: +(parseFloat(r.frequency) || 0).toFixed(4),
          temperature: +(parseFloat(r.temperature) || 0).toFixed(1),
          direction: (parseFloat(r.active_power) || 0) >= 0 ? 'importing' : 'exporting',
          timestamp: r.date_time,
        }));

        res.write(`event: power-update\ndata: ${JSON.stringify(payload)}\n\n`);
      }
    } catch (err) {
      // Send error event but keep connection alive
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
    }
  }, 5000);

  // Clean up on disconnect
  req.on('close', () => {
    clearInterval(intervalId);
  });
});

// ─── 6. Reverse-Geocode meters missing Suburb ────────────────────────
router.get('/reverse-geocode', authenticateToken, async (req, res) => {
  const GMAPS_KEY = 'AIzaSyCdPt-Y9HoyNJF5I-sbyuS4n6U1KhKaIzk';
  const DELAY_MS  = 200;

  try {
    const meters = await queryAll(`
      SELECT DRN, Lat, Longitude
      FROM MeterLocationInfoTable
      WHERE (Suburb IS NULL OR Suburb = '')
        AND Lat IS NOT NULL AND Lat != 0
        AND Longitude IS NOT NULL AND Longitude != 0
    `);

    let geocoded = 0;
    let errors   = 0;

    for (const meter of meters) {
      const lat = parseFloat(meter.Lat);
      const lng = parseFloat(meter.Longitude);
      if (isNaN(lat) || isNaN(lng)) { errors++; continue; }

      try {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GMAPS_KEY}`;
        const resp = await fetch(url);
        const data = await resp.json();

        if (data.status !== 'OK' || !data.results || !data.results.length) {
          errors++;
        } else {
          // Walk through all results' address_components to find suburb
          const SUBURB_TYPES = ['sublocality_level_1', 'sublocality', 'neighborhood', 'locality'];
          let suburb = null;

          outer:
          for (const result of data.results) {
            for (const wantedType of SUBURB_TYPES) {
              for (const comp of result.address_components) {
                if (comp.types.includes(wantedType)) {
                  suburb = comp.long_name;
                  break outer;
                }
              }
            }
          }

          if (suburb) {
            await runExec(
              `UPDATE MeterLocationInfoTable SET Suburb = ? WHERE DRN = ?`,
              [suburb, meter.DRN]
            );
            geocoded++;
          } else {
            errors++;
          }
        }
      } catch (fetchErr) {
        console.error(`[reverse-geocode] DRN ${meter.DRN}:`, fetchErr.message);
        errors++;
      }

      // Rate-limit: 200 ms between calls
      await new Promise(r => setTimeout(r, DELAY_MS));
    }

    res.json({ geocoded, errors, total: meters.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 7. Meter Detail — comprehensive single-meter snapshot ───────────
router.get('/meter-detail/:drn', authenticateToken, async (req, res) => {
  const { drn } = req.params;
  if (!drn) return res.status(400).json({ error: 'DRN required' });

  try {
    const [
      locationRow,
      profileRow,
      latestPower,
      latestEnergy,
      latestMains,
      latestHeater,
      lastSeenRow,
      cellularRow,
      otaRow,
      stsRow,
      netMeteringRow,
    ] = await Promise.all([
      // MeterLocationInfoTable
      queryOne(
        `SELECT DRN, LocationName, Lat, Longitude, Status, Suburb, Type
         FROM MeterLocationInfoTable WHERE DRN = ? LIMIT 1`,
        [drn]
      ),
      // MeterProfileReal
      queryOne(
        `SELECT Name, Surname, StreetName, HouseNumber, City, Region,
                TransformerDRN, SIMNumber, tariff_type
         FROM MeterProfileReal WHERE DRN = ? LIMIT 1`,
        [drn]
      ),
      // MeteringPower — latest record
      queryOne(
        `SELECT active_power, reactive_power, apparent_power, voltage,
                current, power_factor, frequency, temperature, date_time
         FROM MeteringPower WHERE DRN = ?
         ORDER BY date_time DESC LIMIT 1`,
        [drn]
      ),
      // MeterNetEnergy — latest record
      queryOne(
        `SELECT import_energy_wh, export_energy_wh, net_energy_wh, created_at
         FROM MeterNetEnergy WHERE DRN = ?
         ORDER BY created_at DESC LIMIT 1`,
        [drn]
      ),
      // MeterMainsStateTable — latest
      queryOne(
        `SELECT * FROM MeterMainsStateTable WHERE DRN = ?
         ORDER BY date_time DESC LIMIT 1`,
        [drn]
      ),
      // MeterHeaterStateTable — latest
      queryOne(
        `SELECT * FROM MeterHeaterStateTable WHERE DRN = ?
         ORDER BY date_time DESC LIMIT 1`,
        [drn]
      ),
      // MeterLastSeen
      queryOne(
        `SELECT last_seen, last_topic, message_count
         FROM MeterLastSeen WHERE DRN = ? LIMIT 1`,
        [drn]
      ),
      // MeterCellularNetworkProperties — latest
      queryOne(
        `SELECT signal_strength, service_provider, sim_phone_number, IMEU, date_time
         FROM MeterCellularNetworkProperties WHERE DRN = ?
         ORDER BY date_time DESC LIMIT 1`,
        [drn]
      ),
      // MeterOTAStatus
      queryOne(
        `SELECT firmware_version, status AS ota_status, updated_at
         FROM MeterOTAStatus WHERE DRN = ? LIMIT 1`,
        [drn]
      ),
      // STSTokesInfo — latest token
      queryOne(
        `SELECT token_amount, token_time
         FROM STSTokesInfo WHERE DRN = ?
         ORDER BY token_time DESC LIMIT 1`,
        [drn]
      ),
      // MeterNetMeteringConfig
      queryOne(
        `SELECT * FROM MeterNetMeteringConfig WHERE DRN = ? LIMIT 1`,
        [drn]
      ),
    ]);

    // Derive online status from Status field or last_seen recency
    const statusFlag = locationRow ? String(locationRow.Status) : '0';
    const isOnline = statusFlag === '1' || statusFlag.toLowerCase() === 'active';

    // Determine mains state from the latest row (column names may vary)
    const mainsState = latestMains
      ? (latestMains.mains_state ?? latestMains.state ?? latestMains.MainsState ?? null)
      : null;
    const heaterState = latestHeater
      ? (latestHeater.heater_state ?? latestHeater.state ?? latestHeater.HeaterState ?? null)
      : null;

    // Net metering flow direction
    const activePower  = parseFloat(latestPower?.active_power)  || 0;
    const importEnergy = parseFloat(latestEnergy?.import_energy_wh) || 0;
    const exportEnergy = parseFloat(latestEnergy?.export_energy_wh) || 0;
    const netFlow = activePower >= 0 ? 'importing' : 'exporting';

    const detail = {
      identification: {
        drn,
        name:     profileRow?.Name    ?? null,
        surname:  profileRow?.Surname ?? null,
        address: profileRow
          ? [profileRow.HouseNumber, profileRow.StreetName, profileRow.City].filter(Boolean).join(', ')
          : null,
        gps: locationRow
          ? { lat: parseFloat(locationRow.Lat) || 0, lng: parseFloat(locationRow.Longitude) || 0 }
          : null,
        region:      profileRow?.Region      ?? locationRow?.LocationName ?? null,
        suburb:      locationRow?.Suburb     ?? null,
        meterType:   locationRow?.Type       ?? null,
        tariffType:  profileRow?.tariff_type ?? null,
        transformerDRN: profileRow?.TransformerDRN ?? null,
      },
      electrical: {
        mainsStatus:    mainsState,
        relayStatus:    heaterState,
        online:         isOnline,
        signalStrength: cellularRow?.signal_strength ?? null,
        lastSeen:       lastSeenRow?.last_seen        ?? null,
        lastTopic:      lastSeenRow?.last_topic       ?? null,
        messageCount:   lastSeenRow?.message_count    ?? null,
      },
      energy: {
        creditBalance:  stsRow?.token_amount ?? null,
        lastTokenTime:  stsRow?.token_time   ?? null,
        activeTariff:   profileRow?.tariff_type ?? null,
        totalImport:    importEnergy,
        totalExport:    exportEnergy,
        netEnergy:      parseFloat(latestEnergy?.net_energy_wh) || 0,
      },
      live: {
        voltage:        +(parseFloat(latestPower?.voltage)       || 0).toFixed(2),
        current:        +(parseFloat(latestPower?.current)       || 0).toFixed(3),
        activePower:    +(parseFloat(latestPower?.active_power)  || 0).toFixed(2),
        reactivePower:  +(parseFloat(latestPower?.reactive_power)|| 0).toFixed(2),
        apparentPower:  +(parseFloat(latestPower?.apparent_power)|| 0).toFixed(2),
        frequency:      +(parseFloat(latestPower?.frequency)     || 0).toFixed(4),
        powerFactor:    +(parseFloat(latestPower?.power_factor)  || 0).toFixed(3),
        temperature:    +(parseFloat(latestPower?.temperature)   || 0).toFixed(1),
        recordedAt:     latestPower?.date_time ?? null,
      },
      netMetering: {
        importPower:      activePower >= 0 ? +activePower.toFixed(2) : 0,
        exportPower:      activePower <  0 ? +Math.abs(activePower).toFixed(2) : 0,
        netFlowDirection: netFlow,
        dailyImport:      importEnergy,
        dailyExport:      exportEnergy,
        config:           netMeteringRow ?? null,
      },
      communication: {
        mqttStatus:       isOnline ? 'connected' : 'disconnected',
        firmwareVersion:  otaRow?.firmware_version ?? null,
        otaStatus:        otaRow?.ota_status       ?? null,
        lastOtaUpdate:    otaRow?.updated_at       ?? null,
        simNumber:        cellularRow?.sim_phone_number ?? profileRow?.SIMNumber ?? null,
        networkOperator:  cellularRow?.service_provider ?? null,
        imei:             cellularRow?.IMEU ?? null,
      },
    };

    res.json(detail);
  } catch (err) {
    console.error('[meter-detail]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── 8. District Stats — aggregated per suburb ───────────────────────
router.get('/district-stats', authenticateToken, async (req, res) => {
  try {
    // All meters with suburb + status
    const meters = await queryAll(`
      SELECT DRN, Suburb, Status
      FROM MeterLocationInfoTable
      ORDER BY Suburb
    `);

    if (!meters.length) return res.json([]);

    // Latest power per DRN
    const latestPower = await queryAll(`
      SELECT mp.DRN, mp.active_power, mp.voltage
      FROM MeteringPower mp
      INNER JOIN (
        SELECT DRN, MAX(date_time) AS max_dt
        FROM MeteringPower
        GROUP BY DRN
      ) latest ON mp.DRN = latest.DRN AND mp.date_time = latest.max_dt
    `);
    const powerMap = {};
    latestPower.forEach(r => { powerMap[r.DRN] = r; });

    // Latest net energy per DRN
    const latestEnergy = await queryAll(`
      SELECT mne.DRN, mne.import_energy_wh, mne.export_energy_wh
      FROM MeterNetEnergy mne
      INNER JOIN (
        SELECT DRN, MAX(created_at) AS max_dt
        FROM MeterNetEnergy
        GROUP BY DRN
      ) latest ON mne.DRN = latest.DRN AND mne.created_at = latest.max_dt
    `);
    const energyMap = {};
    latestEnergy.forEach(r => { energyMap[r.DRN] = r; });

    // Group by suburb
    const districtMap = {};
    for (const meter of meters) {
      const district = meter.Suburb || 'Unknown';
      if (!districtMap[district]) {
        districtMap[district] = {
          district,
          meterCount: 0,
          online: 0,
          offline: 0,
          totalLoad: 0,
          totalExport: 0,
          voltageSum: 0,
          voltageCount: 0,
          totalImport: 0,
        };
      }
      const d = districtMap[district];
      d.meterCount++;

      const isOnline = String(meter.Status) === '1' || String(meter.Status).toLowerCase() === 'active';
      if (isOnline) d.online++; else d.offline++;

      const pw = powerMap[meter.DRN];
      if (pw) {
        const ap = parseFloat(pw.active_power) || 0;
        if (ap >= 0) d.totalLoad += ap;
        else d.totalExport += Math.abs(ap);
        const v = parseFloat(pw.voltage) || 0;
        if (v > 0) { d.voltageSum += v; d.voltageCount++; }
      }

      const en = energyMap[meter.DRN];
      if (en) {
        d.totalImport  += parseFloat(en.import_energy_wh) || 0;
        d.totalExport  += parseFloat(en.export_energy_wh) || 0;
      }
    }

    const result = Object.values(districtMap).map(d => ({
      district:    d.district,
      meterCount:  d.meterCount,
      online:      d.online,
      offline:     d.offline,
      totalLoad:   +d.totalLoad.toFixed(2),
      totalExport: +d.totalExport.toFixed(2),
      netDemand:   +(d.totalLoad - d.totalExport).toFixed(2),
      avgVoltage:  d.voltageCount ? +(d.voltageSum / d.voltageCount).toFixed(2) : 0,
    }));

    result.sort((a, b) => b.meterCount - a.meterCount);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 9. Suburb Boundaries — static polygon data for map overlay ──────
const WINDHOEK_SUBURBS = {
  'Eros': [
    { lat: -22.555, lng: 17.085 }, { lat: -22.555, lng: 17.105 },
    { lat: -22.570, lng: 17.105 }, { lat: -22.570, lng: 17.085 },
  ],
  'Khomasdal': [
    { lat: -22.540, lng: 17.048 }, { lat: -22.540, lng: 17.068 },
    { lat: -22.558, lng: 17.068 }, { lat: -22.558, lng: 17.048 },
  ],
  'Katutura': [
    { lat: -22.520, lng: 17.055 }, { lat: -22.520, lng: 17.078 },
    { lat: -22.540, lng: 17.078 }, { lat: -22.540, lng: 17.055 },
  ],
  'Wanaheda': [
    { lat: -22.520, lng: 17.040 }, { lat: -22.520, lng: 17.058 },
    { lat: -22.535, lng: 17.058 }, { lat: -22.535, lng: 17.040 },
  ],
  'Dorado Park': [
    { lat: -22.558, lng: 17.068 }, { lat: -22.558, lng: 17.085 },
    { lat: -22.572, lng: 17.085 }, { lat: -22.572, lng: 17.068 },
  ],
  'Olympia': [
    { lat: -22.558, lng: 17.060 }, { lat: -22.558, lng: 17.073 },
    { lat: -22.570, lng: 17.073 }, { lat: -22.570, lng: 17.060 },
  ],
  'Southern Industrial': [
    { lat: -22.580, lng: 17.065 }, { lat: -22.580, lng: 17.090 },
    { lat: -22.600, lng: 17.090 }, { lat: -22.600, lng: 17.065 },
  ],
  'Northern Industrial': [
    { lat: -22.535, lng: 17.075 }, { lat: -22.535, lng: 17.095 },
    { lat: -22.550, lng: 17.095 }, { lat: -22.550, lng: 17.075 },
  ],
  'Pioneers Park': [
    { lat: -22.585, lng: 17.055 }, { lat: -22.585, lng: 17.072 },
    { lat: -22.600, lng: 17.072 }, { lat: -22.600, lng: 17.055 },
  ],
  'Academia': [
    { lat: -22.600, lng: 17.070 }, { lat: -22.600, lng: 17.090 },
    { lat: -22.615, lng: 17.090 }, { lat: -22.615, lng: 17.070 },
  ],
  'Ludwigsdorf': [
    { lat: -22.550, lng: 17.095 }, { lat: -22.550, lng: 17.115 },
    { lat: -22.565, lng: 17.115 }, { lat: -22.565, lng: 17.095 },
  ],
  'Klein Windhoek': [
    { lat: -22.562, lng: 17.090 }, { lat: -22.562, lng: 17.110 },
    { lat: -22.578, lng: 17.110 }, { lat: -22.578, lng: 17.090 },
  ],
  'Suiderhof': [
    { lat: -22.575, lng: 17.055 }, { lat: -22.575, lng: 17.070 },
    { lat: -22.590, lng: 17.070 }, { lat: -22.590, lng: 17.055 },
  ],
  'Rocky Crest': [
    { lat: -22.565, lng: 17.040 }, { lat: -22.565, lng: 17.058 },
    { lat: -22.580, lng: 17.058 }, { lat: -22.580, lng: 17.040 },
  ],
  'Otjomuise': [
    { lat: -22.545, lng: 17.030 }, { lat: -22.545, lng: 17.048 },
    { lat: -22.565, lng: 17.048 }, { lat: -22.565, lng: 17.030 },
  ],
  'Hochland Park': [
    { lat: -22.570, lng: 17.073 }, { lat: -22.570, lng: 17.090 },
    { lat: -22.585, lng: 17.090 }, { lat: -22.585, lng: 17.073 },
  ],
  'Prosperita': [
    { lat: -22.545, lng: 17.095 }, { lat: -22.545, lng: 17.108 },
    { lat: -22.555, lng: 17.108 }, { lat: -22.555, lng: 17.095 },
  ],
  'Avis': [
    { lat: -22.555, lng: 17.105 }, { lat: -22.555, lng: 17.120 },
    { lat: -22.570, lng: 17.120 }, { lat: -22.570, lng: 17.105 },
  ],
  'Auasblick': [
    { lat: -22.590, lng: 17.090 }, { lat: -22.590, lng: 17.105 },
    { lat: -22.605, lng: 17.105 }, { lat: -22.605, lng: 17.090 },
  ],
  'Windhoek CBD': [
    { lat: -22.558, lng: 17.078 }, { lat: -22.558, lng: 17.092 },
    { lat: -22.572, lng: 17.092 }, { lat: -22.572, lng: 17.078 },
  ],
};

router.get('/suburb-boundaries', authenticateToken, (req, res) => {
  res.json(WINDHOEK_SUBURBS);
});

module.exports = router;
