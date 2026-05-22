const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken } = require('../admin/authMiddllware');

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

// ─── POWER 15-MIN (per meter, today) ───────────────────────────────
router.get('/power15min/:drn', authenticateToken, async (req, res) => {
  try {
    const rows = await queryAll(
      `SELECT slot, avg_power, peak_power, avg_voltage, avg_current, avg_pf, avg_reactive, avg_apparent, avg_frequency, readings
       FROM SummaryPower15Min WHERE DRN = ? AND summary_date = CURDATE() ORDER BY slot`,
      [req.params.drn]
    );
    const arr = [];
    for (let i = 0; i < 96; i++) {
      const h = Math.floor(i / 4);
      const q = i % 4;
      arr.push({
        time: String(h).padStart(2, '0') + ':' + String(q * 15).padStart(2, '0'),
        power: 0, peak: 0, voltage: 0, current: 0, pf: 0,
        reactive: 0, apparent: 0, frequency: 0,
      });
    }
    rows.forEach(row => {
      const idx = row.slot;
      if (idx >= 0 && idx < 96) {
        arr[idx].power = parseFloat(row.avg_power) || 0;
        arr[idx].peak = parseFloat(row.peak_power) || 0;
        arr[idx].voltage = parseFloat(row.avg_voltage) || 0;
        arr[idx].current = parseFloat(row.avg_current) || 0;
        arr[idx].pf = parseFloat(row.avg_pf) || 0;
        arr[idx].reactive = parseFloat(row.avg_reactive) || 0;
        arr[idx].apparent = parseFloat(row.avg_apparent) || 0;
        arr[idx].frequency = parseFloat(row.avg_frequency) || 0;
      }
    });
    res.json(arr);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POWER 15-MIN (per meter, specific date) ───────────────────────
router.get('/power15min/:drn/:date', authenticateToken, async (req, res) => {
  try {
    const rows = await queryAll(
      `SELECT slot, avg_power, peak_power, avg_voltage, avg_current, avg_pf, avg_reactive, avg_apparent, avg_frequency
       FROM SummaryPower15Min WHERE DRN = ? AND summary_date = ? ORDER BY slot`,
      [req.params.drn, req.params.date]
    );
    const arr = [];
    for (let i = 0; i < 96; i++) {
      const h = Math.floor(i / 4);
      const q = i % 4;
      arr.push({
        time: String(h).padStart(2, '0') + ':' + String(q * 15).padStart(2, '0'),
        power: 0, peak: 0, voltage: 0, current: 0, pf: 0,
        reactive: 0, apparent: 0, frequency: 0,
      });
    }
    rows.forEach(row => {
      const idx = row.slot;
      if (idx >= 0 && idx < 96) {
        arr[idx].power = parseFloat(row.avg_power) || 0;
        arr[idx].peak = parseFloat(row.peak_power) || 0;
        arr[idx].voltage = parseFloat(row.avg_voltage) || 0;
        arr[idx].current = parseFloat(row.avg_current) || 0;
        arr[idx].pf = parseFloat(row.avg_pf) || 0;
        arr[idx].reactive = parseFloat(row.avg_reactive) || 0;
        arr[idx].apparent = parseFloat(row.avg_apparent) || 0;
        arr[idx].frequency = parseFloat(row.avg_frequency) || 0;
      }
    });
    res.json(arr);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── THD 15-MIN (per meter, today) ─────────────────────────────────
router.get('/thd15min/:drn', authenticateToken, async (req, res) => {
  try {
    const rows = await queryAll(
      `SELECT slot, avg_thd_voltage, avg_thd_current, avg_distortion_va, avg_displacement_pf
       FROM SummaryTHD15Min WHERE DRN = ? AND summary_date = CURDATE() ORDER BY slot`,
      [req.params.drn]
    );
    const arr = [];
    for (let i = 0; i < 96; i++) {
      const h = Math.floor(i / 4);
      const q = i % 4;
      arr.push({
        time: String(h).padStart(2, '0') + ':' + String(q * 15).padStart(2, '0'),
        thdV: 0, thdI: 0, distVA: 0, dispPF: 0,
      });
    }
    rows.forEach(row => {
      const idx = row.slot;
      if (idx >= 0 && idx < 96) {
        arr[idx].thdV = parseFloat(row.avg_thd_voltage) || 0;
        arr[idx].thdI = parseFloat(row.avg_thd_current) || 0;
        arr[idx].distVA = parseFloat(row.avg_distortion_va) || 0;
        arr[idx].dispPF = parseFloat(row.avg_displacement_pf) || 0;
      }
    });
    res.json(arr);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DAILY ENERGY (per meter, last N days) ─────────────────────────
router.get('/daily-energy/:drn', authenticateToken, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const rows = await queryAll(
      `SELECT summary_date as date, energy_delta_kwh as kwh, units_delta as units, start_energy, end_energy
       FROM SummaryDailyEnergy WHERE DRN = ? AND summary_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       ORDER BY summary_date`,
      [req.params.drn, days]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── MONTHLY ENERGY (per meter, current & last year) ───────────────
router.get('/monthly-energy/:drn', authenticateToken, async (req, res) => {
  try {
    const rows = await queryAll(
      `SELECT summary_year as year, summary_month as month, energy_kwh as kwh, last_energy
       FROM SummaryMonthlyEnergy WHERE DRN = ? AND summary_year >= YEAR(CURDATE()) - 1
       ORDER BY summary_year, summary_month`,
      [req.params.drn]
    );
    const currentYear = Array(12).fill(0);
    const lastYear = Array(12).fill(0);
    const thisYear = new Date().getFullYear();
    rows.forEach(r => {
      const idx = r.month - 1;
      if (r.year === thisYear) currentYear[idx] = parseFloat(r.kwh) || 0;
      else if (r.year === thisYear - 1) lastYear[idx] = parseFloat(r.kwh) || 0;
    });
    res.json({ currentYear, lastYear });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── MONTHLY ENERGY (system-wide, all meters aggregated) ───────────
router.get('/monthly-energy-total', authenticateToken, async (req, res) => {
  try {
    const rows = await queryAll(
      `SELECT summary_year as year, summary_month as month, ROUND(SUM(energy_kwh), 3) as total_kwh
       FROM SummaryMonthlyEnergy WHERE summary_year >= YEAR(CURDATE()) - 1
       GROUP BY summary_year, summary_month ORDER BY summary_year, summary_month`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DASHBOARD KPIs ────────────────────────────────────────────────
router.get('/kpi', authenticateToken, async (req, res) => {
  try {
    const rows = await queryAll(`SELECT kpi_key, kpi_value, updated_at FROM SummaryDashboardKPI`);
    const kpi = {};
    rows.forEach(r => { kpi[r.kpi_key] = parseFloat(r.kpi_value) || 0; });
    kpi.updated_at = rows.length ? rows[0].updated_at : null;
    res.json(kpi);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SYSTEM HOURLY POWER (aggregated across all meters, today) ─────
router.get('/system-power-hourly', authenticateToken, async (req, res) => {
  try {
    const rows = await queryAll(
      `SELECT
        FLOOR(slot / 4) as hour,
        ROUND(SUM(avg_power), 2) as total_power,
        ROUND(AVG(avg_power), 2) as avg_power,
        ROUND(MAX(peak_power), 2) as peak_power,
        ROUND(AVG(avg_voltage), 2) as avg_voltage,
        SUM(readings) as readings
       FROM SummaryPower15Min WHERE summary_date = CURDATE()
       GROUP BY FLOOR(slot / 4) ORDER BY hour`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DATA USAGE: per meter, today hourly ──────────────────────────
router.get('/data-usage/meter/:drn/today', authenticateToken, async (req, res) => {
  try {
    const config = await queryOne(`SELECT cost_per_mb, currency, overhead_multiplier FROM DataCostConfig WHERE id = 1`);
    const costPerMb = config ? parseFloat(config.cost_per_mb) : 0.50;
    const currency = config ? config.currency : 'NAD';
    const rows = await queryAll(
      `SELECT usage_hour as hour, msg_count, payload_bytes, estimated_bytes,
              power_msgs, energy_msgs, net_energy_msgs, cellular_msgs, load_msgs, token_msgs, health_msgs, other_msgs
       FROM SummaryDataUsage WHERE DRN = ? AND usage_date = CURDATE() ORDER BY usage_hour`,
      [req.params.drn]
    );
    const hourly = [];
    let totalBytes = 0, totalMsgs = 0;
    for (let h = 0; h < 24; h++) {
      const r = rows.find(x => x.hour === h);
      const bytes = r ? Number(r.estimated_bytes) : 0;
      const msgs = r ? Number(r.msg_count) : 0;
      totalBytes += bytes;
      totalMsgs += msgs;
      hourly.push({
        hour: h, label: String(h).padStart(2, '0') + ':00',
        bytes, msgs,
        kb: +(bytes / 1024).toFixed(2),
        cost: +((bytes / (1024 * 1024)) * costPerMb).toFixed(4),
        breakdown: r ? { power: r.power_msgs, energy: r.energy_msgs, net_energy: r.net_energy_msgs, cellular: r.cellular_msgs, load: r.load_msgs, token: r.token_msgs, health: r.health_msgs, other: r.other_msgs } : null,
      });
    }
    res.json({
      drn: req.params.drn, date: new Date().toISOString().split('T')[0], currency,
      costPerMb,
      totalBytes, totalKb: +(totalBytes / 1024).toFixed(2), totalMb: +(totalBytes / (1024 * 1024)).toFixed(4),
      totalCost: +((totalBytes / (1024 * 1024)) * costPerMb).toFixed(4),
      totalMsgs,
      hourly,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DATA USAGE: per meter, daily for last N days ─────────────────
router.get('/data-usage/meter/:drn/daily', authenticateToken, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const config = await queryOne(`SELECT cost_per_mb, currency FROM DataCostConfig WHERE id = 1`);
    const costPerMb = config ? parseFloat(config.cost_per_mb) : 0.50;
    const currency = config ? config.currency : 'NAD';
    const rows = await queryAll(
      `SELECT usage_date as date, SUM(msg_count) as msgs, SUM(payload_bytes) as payload_bytes, SUM(estimated_bytes) as estimated_bytes,
              SUM(power_msgs) as power, SUM(energy_msgs) as energy, SUM(net_energy_msgs) as net_energy,
              SUM(cellular_msgs) as cellular, SUM(load_msgs) as load_m, SUM(token_msgs) as token_m, SUM(health_msgs) as health, SUM(other_msgs) as other
       FROM SummaryDataUsage WHERE DRN = ? AND usage_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY usage_date ORDER BY usage_date`,
      [req.params.drn, days]
    );
    const daily = rows.map(r => {
      const bytes = Number(r.estimated_bytes);
      return {
        date: r.date, msgs: Number(r.msgs), bytes,
        kb: +(bytes / 1024).toFixed(2), mb: +(bytes / (1024 * 1024)).toFixed(4),
        cost: +((bytes / (1024 * 1024)) * costPerMb).toFixed(4),
        breakdown: { power: Number(r.power), energy: Number(r.energy), net_energy: Number(r.net_energy), cellular: Number(r.cellular), load: Number(r.load_m), token: Number(r.token_m), health: Number(r.health), other: Number(r.other) },
      };
    });
    const totalBytes = daily.reduce((s, d) => s + d.bytes, 0);
    res.json({ drn: req.params.drn, currency, costPerMb, days, totalBytes, totalMb: +(totalBytes / (1024 * 1024)).toFixed(4), totalCost: +((totalBytes / (1024 * 1024)) * costPerMb).toFixed(4), daily });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DATA USAGE: network-wide summary (admin) ────────────────────
router.get('/data-usage/network/today', authenticateToken, async (req, res) => {
  try {
    const config = await queryOne(`SELECT cost_per_mb, currency FROM DataCostConfig WHERE id = 1`);
    const costPerMb = config ? parseFloat(config.cost_per_mb) : 0.50;
    const currency = config ? config.currency : 'NAD';
    const rows = await queryAll(
      `SELECT usage_hour as hour, SUM(msg_count) as msgs, SUM(estimated_bytes) as bytes, COUNT(DISTINCT DRN) as meters
       FROM SummaryDataUsage WHERE usage_date = CURDATE() GROUP BY usage_hour ORDER BY usage_hour`
    );
    const hourly = [];
    let totalBytes = 0, totalMsgs = 0;
    for (let h = 0; h < 24; h++) {
      const r = rows.find(x => x.hour === h);
      const bytes = r ? Number(r.bytes) : 0;
      const msgs = r ? Number(r.msgs) : 0;
      totalBytes += bytes;
      totalMsgs += msgs;
      hourly.push({ hour: h, label: String(h).padStart(2, '0') + ':00', bytes, msgs, meters: r ? Number(r.meters) : 0, kb: +(bytes / 1024).toFixed(2), cost: +((bytes / (1024 * 1024)) * costPerMb).toFixed(4) });
    }
    const meterCount = await queryOne(`SELECT COUNT(DISTINCT DRN) as cnt FROM SummaryDataUsage WHERE usage_date = CURDATE()`);
    res.json({ date: new Date().toISOString().split('T')[0], currency, costPerMb, totalBytes, totalMb: +(totalBytes / (1024 * 1024)).toFixed(4), totalCost: +((totalBytes / (1024 * 1024)) * costPerMb).toFixed(4), totalMsgs, activeMeters: meterCount ? meterCount.cnt : 0, hourly });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DATA USAGE: network daily totals (admin) ────────────────────
router.get('/data-usage/network/daily', authenticateToken, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const config = await queryOne(`SELECT cost_per_mb, currency FROM DataCostConfig WHERE id = 1`);
    const costPerMb = config ? parseFloat(config.cost_per_mb) : 0.50;
    const currency = config ? config.currency : 'NAD';
    const rows = await queryAll(
      `SELECT usage_date as date, SUM(msg_count) as msgs, SUM(estimated_bytes) as bytes, COUNT(DISTINCT DRN) as meters
       FROM SummaryDataUsage WHERE usage_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY usage_date ORDER BY usage_date`,
      [days]
    );
    const daily = rows.map(r => {
      const bytes = Number(r.bytes);
      return { date: r.date, msgs: Number(r.msgs), bytes, mb: +(bytes / (1024 * 1024)).toFixed(4), cost: +((bytes / (1024 * 1024)) * costPerMb).toFixed(4), meters: Number(r.meters) };
    });
    const totalBytes = daily.reduce((s, d) => s + d.bytes, 0);
    res.json({ currency, costPerMb, days, totalBytes, totalMb: +(totalBytes / (1024 * 1024)).toFixed(4), totalCost: +((totalBytes / (1024 * 1024)) * costPerMb).toFixed(4), daily });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DATA USAGE: per-meter ranking (admin) ────────────────────────
router.get('/data-usage/network/meters', authenticateToken, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const config = await queryOne(`SELECT cost_per_mb, currency FROM DataCostConfig WHERE id = 1`);
    const costPerMb = config ? parseFloat(config.cost_per_mb) : 0.50;
    const currency = config ? config.currency : 'NAD';
    const rows = await queryAll(
      `SELECT du.DRN, SUM(du.msg_count) as msgs, SUM(du.estimated_bytes) as bytes,
              SUM(du.power_msgs) as power, SUM(du.energy_msgs) as energy, SUM(du.net_energy_msgs) as net_energy,
              mpr.Name, mpr.Surname, mpr.City as area
       FROM SummaryDataUsage du
       LEFT JOIN MeterProfileReal mpr ON du.DRN = mpr.DRN
       WHERE du.usage_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY du.DRN ORDER BY bytes DESC`,
      [days]
    );
    const meters = rows.map(r => {
      const bytes = Number(r.bytes);
      return { drn: r.DRN, name: r.Name && r.Surname ? `${r.Name} ${r.Surname}` : r.DRN, area: r.area || '', msgs: Number(r.msgs), bytes, mb: +(bytes / (1024 * 1024)).toFixed(4), cost: +((bytes / (1024 * 1024)) * costPerMb).toFixed(4) };
    });
    res.json({ currency, costPerMb, days, meters });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DATA USAGE: message type breakdown (admin + client) ──────────
router.get('/data-usage/breakdown/:drn', authenticateToken, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const row = await queryOne(
      `SELECT SUM(power_msgs) as power, SUM(energy_msgs) as energy, SUM(net_energy_msgs) as net_energy,
              SUM(cellular_msgs) as cellular, SUM(load_msgs) as load_m, SUM(token_msgs) as token_m,
              SUM(health_msgs) as health, SUM(other_msgs) as other
       FROM SummaryDataUsage WHERE DRN = ? AND usage_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
      [req.params.drn, days]
    );
    if (!row) return res.json({ breakdown: [] });
    const breakdown = [
      { type: 'Power', count: Number(row.power) || 0, avgBytes: 37 },
      { type: 'Energy', count: Number(row.energy) || 0, avgBytes: 23 },
      { type: 'Net Energy', count: Number(row.net_energy) || 0, avgBytes: 17 },
      { type: 'Cellular', count: Number(row.cellular) || 0, avgBytes: 50 },
      { type: 'Load Control', count: Number(row.load_m) || 0, avgBytes: 5 },
      { type: 'Token', count: Number(row.token_m) || 0, avgBytes: 50 },
      { type: 'Health', count: Number(row.health) || 0, avgBytes: 250 },
      { type: 'Other', count: Number(row.other) || 0, avgBytes: 100 },
    ].filter(b => b.count > 0);
    res.json({ drn: req.params.drn, days, breakdown });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DATA COST CONFIG: get/update ─────────────────────────────────
router.get('/data-usage/config', authenticateToken, async (req, res) => {
  try {
    const config = await queryOne(`SELECT cost_per_mb, currency, overhead_multiplier, updated_at FROM DataCostConfig WHERE id = 1`);
    res.json(config || { cost_per_mb: 0.50, currency: 'NAD', overhead_multiplier: 1.50 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/data-usage/config', authenticateToken, async (req, res) => {
  try {
    const { cost_per_mb, currency } = req.body;
    await queryAll(
      `UPDATE DataCostConfig SET cost_per_mb = ?, currency = ? WHERE id = 1`,
      [cost_per_mb || 0.50, currency || 'NAD']
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
