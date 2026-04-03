const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken } = require('../admin/authMiddllware');

// All routes require admin auth
router.use(authenticateToken);

// GET /status/:drn - Get current config status for a meter
router.get('/status/:drn', (req, res) => {
  const { drn } = req.params;
  const queries = {
    mainsControl: `SELECT state, processed, date_time FROM MeterMainsControlTable WHERE DRN = ? ORDER BY id DESC LIMIT 1`,
    heaterControl: `SELECT state, processed, date_time FROM MeterHeaterControlTable WHERE DRN = ? ORDER BY id DESC LIMIT 1`,
    mainsState: `SELECT state, processed, date_time FROM MeterMainsStateTable WHERE DRN = ? ORDER BY id DESC LIMIT 1`,
    heaterState: `SELECT state, processed, date_time FROM MeterHeaterStateTable WHERE DRN = ? ORDER BY id DESC LIMIT 1`,
    smsResponse: `SELECT sms_response_number, sms_response_enabled, processed, date_time FROM MeterSMSResponseNumberTable WHERE DRN = ? ORDER BY id DESC LIMIT 1`,
    sleepMode: `SELECT sleep_mode_enabled, processed, date_time FROM MeterRemoteCommandFlags WHERE DRN = ? ORDER BY id DESC LIMIT 1`,
    pendingToken: `SELECT token_ID, processed, date_time FROM SendSTSToken WHERE DRN = ? ORDER BY ID DESC LIMIT 1`,
  };

  const result = {};
  const keys = Object.keys(queries);
  let completed = 0;

  keys.forEach((key) => {
    db.query(queries[key], [drn], (err, rows) => {
      result[key] = err ? null : (rows && rows.length ? rows[0] : null);
      completed++;
      if (completed === keys.length) {
        res.json({ success: true, data: result });
      }
    });
  });
});

// POST /auth-number/:drn - Add authorized number
router.post('/auth-number/:drn', (req, res) => {
  const { drn } = req.params;
  const { number } = req.body;
  if (!number) return res.status(400).json({ error: 'Number is required' });

  const sql = `INSERT INTO MeterAuthNumberQueue (DRN, authorized_number, processed, user, reason) VALUES (?, ?, 0, 'WebUI', 'Web UI')`;
  db.query(sql, [drn, number], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, message: 'Authorized number command queued' });
  });
});

// POST /sleep/:drn - Set sleep mode
router.post('/sleep/:drn', (req, res) => {
  const { drn } = req.params;
  const { sleep_mode_enabled } = req.body;

  const sql = `INSERT INTO MeterRemoteCommandFlags (DRN, user, sleep_mode_enabled, processed, reason, date_time) VALUES (?, 'WebUI', ?, 0, 'Web UI', NOW())`;
  db.query(sql, [drn, sleep_mode_enabled ? 1 : 0], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, message: 'Sleep mode command queued' });
  });
});

// POST /base-url/:drn - Update base URL
router.post('/base-url/:drn', (req, res) => {
  const { drn } = req.params;
  const { base_url } = req.body;
  if (!base_url) return res.status(400).json({ error: 'URL is required' });

  // Store in a general command queue - the meter will pick it up
  const sql = `INSERT INTO MeterRemoteCommandFlags (DRN, user, sleep_mode_enabled, processed, reason, date_time) VALUES (?, 'WebUI', 0, 0, ?, NOW())`;
  db.query(sql, [drn, `base_url:${base_url}`], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, message: 'Base URL update command queued' });
  });
});

// GET /meter-profiles - Get all meters with enriched data for Meter Profiles page
router.get("/meter-profiles", (req, res) => {
  const sql = `
    SELECT 
      mpr.DRN as drn,
      CONCAT(mpr.Name, " ", mpr.Surname) as customerName,
      mpr.City as area,
      mpr.Region as suburb,
      mpr.StreetName as street,
      mpr.SIMNumber as simNumber,
      mpr.tariff_type as tariffType,
      mpr.TransformerDRN as transformer,
      COALESCE(energy.units, 0) as kWh,
      COALESCE(energy.tamper_state, 0) as tamperState,
      energy.date_time as lastEnergyUpdate,
      COALESCE(lc.mains_state, "0") as mainsState,
      COALESCE(auth_count.total, 0) as authorizedCount,
      CASE WHEN mcr.id IS NOT NULL THEN 1 ELSE 0 END as commissioned,
      CASE WHEN mcr.overall_passed = 1 THEN "Passed" WHEN mcr.overall_passed = 0 AND mcr.id IS NOT NULL THEN "Failed" ELSE "N/A" END as commissionStatus,
      CASE WHEN m.id IS NOT NULL THEN m.status ELSE "unregistered" END as registrationStatus,
      m.registered_at as registeredAt,
      CASE WHEN su.UserID IS NOT NULL THEN 1 ELSE 0 END as hasAppUser,
      su.FirstName as appUserName
    FROM MeterProfileReal mpr
    LEFT JOIN (
      SELECT t.DRN, t.units, t.tamper_state, t.date_time
      FROM MeterCumulativeEnergyUsage t
      INNER JOIN (SELECT DRN, MAX(id) as max_id FROM MeterCumulativeEnergyUsage GROUP BY DRN) latest ON t.id = latest.max_id
    ) energy ON mpr.DRN = energy.DRN
    LEFT JOIN (
      SELECT t.DRN, t.mains_state
      FROM MeterLoadControl t
      INNER JOIN (SELECT DRN, MAX(id) as max_id FROM MeterLoadControl WHERE date_time >= NOW() - INTERVAL 30 DAY GROUP BY DRN) latest ON t.id = latest.max_id
    ) lc ON mpr.DRN = lc.DRN
    LEFT JOIN (
      SELECT drn, COUNT(*) as total FROM MeterAuthorizedNumbers GROUP BY drn
    ) auth_count ON mpr.DRN = auth_count.drn
    LEFT JOIN (
      SELECT t.DRN, t.id, t.overall_passed
      FROM MeterCommissionReport t
      INNER JOIN (SELECT DRN, MAX(id) as max_id FROM MeterCommissionReport WHERE report_type = "commissioning" OR report_type = "full_system" GROUP BY DRN) latest ON t.id = latest.max_id
    ) mcr ON mpr.DRN = mcr.DRN
    LEFT JOIN meters m ON mpr.DRN = m.DRN COLLATE utf8mb4_0900_ai_ci
    LEFT JOIN SystemUsers su ON mpr.DRN = su.DRN
    ORDER BY mpr.DRN
  `;

  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const data = (rows || []).map(m => ({
      ...m,
      id: m.drn,
      status: m.mainsState === "1" ? "Online" : "Offline",
      security: m.tamperState == 1 ? "Tampered" : "Secure",
      location: [m.street, m.suburb, m.area].filter(Boolean).join(", ") || "-",
      selfRegistered: m.registrationStatus === "active",
      registrationComplete: m.commissioned === 1 && m.registrationStatus === "active" ? true : false,
    }));
    res.json({ success: true, data });
  });
});
module.exports = router;
