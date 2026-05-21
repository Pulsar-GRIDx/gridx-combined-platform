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

module.exports = router;
