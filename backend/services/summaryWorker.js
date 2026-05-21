const db = require('../config/db');

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

// ─── TABLE CREATION ────────────────────────────────────────────────
async function ensureTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS SummaryPower15Min (
      id INT AUTO_INCREMENT PRIMARY KEY,
      DRN VARCHAR(20) NOT NULL,
      summary_date DATE NOT NULL,
      slot TINYINT UNSIGNED NOT NULL COMMENT '0-95, each = 15 min',
      avg_power DECIMAL(10,2) DEFAULT 0,
      peak_power DECIMAL(10,2) DEFAULT 0,
      avg_voltage DECIMAL(8,2) DEFAULT 0,
      avg_current DECIMAL(8,3) DEFAULT 0,
      avg_pf DECIMAL(6,3) DEFAULT 0,
      avg_reactive DECIMAL(10,2) DEFAULT 0,
      avg_apparent DECIMAL(10,2) DEFAULT 0,
      avg_frequency DECIMAL(8,4) DEFAULT 0,
      readings INT DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_drn_date_slot (DRN, summary_date, slot),
      KEY idx_date (summary_date),
      KEY idx_drn_date (DRN, summary_date)
    ) ENGINE=InnoDB
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS SummaryTHD15Min (
      id INT AUTO_INCREMENT PRIMARY KEY,
      DRN VARCHAR(20) NOT NULL,
      summary_date DATE NOT NULL,
      slot TINYINT UNSIGNED NOT NULL,
      avg_thd_voltage DECIMAL(8,2) DEFAULT 0,
      avg_thd_current DECIMAL(8,2) DEFAULT 0,
      avg_distortion_va DECIMAL(10,2) DEFAULT 0,
      avg_displacement_pf DECIMAL(6,3) DEFAULT 0,
      readings INT DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_drn_date_slot (DRN, summary_date, slot),
      KEY idx_drn_date (DRN, summary_date)
    ) ENGINE=InnoDB
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS SummaryDailyEnergy (
      id INT AUTO_INCREMENT PRIMARY KEY,
      DRN VARCHAR(20) NOT NULL,
      summary_date DATE NOT NULL,
      start_energy DECIMAL(13,3) DEFAULT 0 COMMENT 'First active_energy reading of day',
      end_energy DECIMAL(13,3) DEFAULT 0 COMMENT 'Last active_energy reading of day',
      energy_delta_wh DECIMAL(13,3) DEFAULT 0 COMMENT 'end - start in Wh',
      energy_delta_kwh DECIMAL(10,3) DEFAULT 0,
      start_units DECIMAL(13,3) DEFAULT 0,
      end_units DECIMAL(13,3) DEFAULT 0,
      units_delta DECIMAL(10,3) DEFAULT 0,
      readings INT DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_drn_date (DRN, summary_date),
      KEY idx_date (summary_date),
      KEY idx_drn_date (DRN, summary_date)
    ) ENGINE=InnoDB
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS SummaryMonthlyEnergy (
      id INT AUTO_INCREMENT PRIMARY KEY,
      DRN VARCHAR(20) NOT NULL,
      summary_year SMALLINT UNSIGNED NOT NULL,
      summary_month TINYINT UNSIGNED NOT NULL,
      last_energy DECIMAL(13,3) DEFAULT 0 COMMENT 'Last active_energy reading of month',
      energy_kwh DECIMAL(10,3) DEFAULT 0 COMMENT 'Delta from prev month last reading',
      last_units DECIMAL(13,3) DEFAULT 0,
      readings INT DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_drn_year_month (DRN, summary_year, summary_month),
      KEY idx_year_month (summary_year, summary_month)
    ) ENGINE=InnoDB
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS SummaryDashboardKPI (
      id INT AUTO_INCREMENT PRIMARY KEY,
      kpi_key VARCHAR(50) NOT NULL UNIQUE,
      kpi_value DECIMAL(15,3) DEFAULT 0,
      kpi_text VARCHAR(255) DEFAULT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);

  console.log('[Summary] All summary tables ready');
}

// ─── POWER 15-MIN AGGREGATION ──────────────────────────────────────
async function refreshPower15Min() {
  const t0 = Date.now();
  await query(`
    INSERT INTO SummaryPower15Min (DRN, summary_date, slot, avg_power, peak_power, avg_voltage, avg_current, avg_pf, avg_reactive, avg_apparent, avg_frequency, readings)
    SELECT
      DRN,
      CURDATE() as summary_date,
      (HOUR(date_time) * 4 + FLOOR(MINUTE(date_time) / 15)) as slot,
      ROUND(AVG(active_power), 2),
      ROUND(MAX(active_power), 2),
      ROUND(AVG(voltage), 2),
      ROUND(AVG(current), 3),
      ROUND(AVG(power_factor), 3),
      ROUND(AVG(reactive_power), 2),
      ROUND(AVG(apparent_power), 2),
      ROUND(AVG(frequency), 4),
      COUNT(*)
    FROM MeteringPower
    WHERE DATE(date_time) = CURDATE()
    GROUP BY DRN, HOUR(date_time), FLOOR(MINUTE(date_time) / 15)
    ON DUPLICATE KEY UPDATE
      avg_power = VALUES(avg_power),
      peak_power = VALUES(peak_power),
      avg_voltage = VALUES(avg_voltage),
      avg_current = VALUES(avg_current),
      avg_pf = VALUES(avg_pf),
      avg_reactive = VALUES(avg_reactive),
      avg_apparent = VALUES(avg_apparent),
      avg_frequency = VALUES(avg_frequency),
      readings = VALUES(readings)
  `);
  console.log(`[Summary] Power15Min refreshed in ${Date.now() - t0}ms`);
}

// ─── THD 15-MIN AGGREGATION ────────────────────────────────────────
async function refreshTHD15Min() {
  const t0 = Date.now();
  await query(`
    INSERT INTO SummaryTHD15Min (DRN, summary_date, slot, avg_thd_voltage, avg_thd_current, avg_distortion_va, avg_displacement_pf, readings)
    SELECT
      DRN,
      CURDATE() as summary_date,
      (HOUR(created_at) * 4 + FLOOR(MINUTE(created_at) / 15)) as slot,
      ROUND(AVG(thd_voltage), 2),
      ROUND(AVG(thd_current), 2),
      ROUND(AVG(distortion_va), 2),
      ROUND(AVG(displacement_pf), 3),
      COUNT(*)
    FROM MeterTHD
    WHERE DATE(created_at) = CURDATE()
    GROUP BY DRN, HOUR(created_at), FLOOR(MINUTE(created_at) / 15)
    ON DUPLICATE KEY UPDATE
      avg_thd_voltage = VALUES(avg_thd_voltage),
      avg_thd_current = VALUES(avg_thd_current),
      avg_distortion_va = VALUES(avg_distortion_va),
      avg_displacement_pf = VALUES(avg_displacement_pf),
      readings = VALUES(readings)
  `);
  console.log(`[Summary] THD15Min refreshed in ${Date.now() - t0}ms`);
}

// ─── DAILY ENERGY ──────────────────────────────────────────────────
async function refreshDailyEnergy() {
  const t0 = Date.now();
  await query(`
    INSERT INTO SummaryDailyEnergy (DRN, summary_date, start_energy, end_energy, energy_delta_wh, energy_delta_kwh, start_units, end_units, units_delta, readings)
    SELECT
      g.DRN,
      g.d as summary_date,
      CAST(e_first.active_energy AS DECIMAL(13,3)),
      CAST(e_last.active_energy AS DECIMAL(13,3)),
      GREATEST(CAST(e_last.active_energy AS DECIMAL(13,3)) - CAST(e_first.active_energy AS DECIMAL(13,3)), 0),
      ROUND(GREATEST(CAST(e_last.active_energy AS DECIMAL(13,3)) - CAST(e_first.active_energy AS DECIMAL(13,3)), 0) / 1000, 3),
      CAST(e_first.units AS DECIMAL(13,3)),
      CAST(e_last.units AS DECIMAL(13,3)),
      ROUND(GREATEST(CAST(e_last.units AS DECIMAL(13,3)) - CAST(e_first.units AS DECIMAL(13,3)), 0), 3),
      g.cnt
    FROM (
      SELECT DRN, DATE(date_time) as d, MIN(id) as min_id, MAX(id) as max_id, COUNT(*) as cnt
      FROM MeterCumulativeEnergyUsage
      WHERE date_time >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
      GROUP BY DRN, DATE(date_time)
    ) g
    JOIN MeterCumulativeEnergyUsage e_first ON e_first.id = g.min_id
    JOIN MeterCumulativeEnergyUsage e_last ON e_last.id = g.max_id
    ON DUPLICATE KEY UPDATE
      start_energy = VALUES(start_energy),
      end_energy = VALUES(end_energy),
      energy_delta_wh = VALUES(energy_delta_wh),
      energy_delta_kwh = VALUES(energy_delta_kwh),
      start_units = VALUES(start_units),
      end_units = VALUES(end_units),
      units_delta = VALUES(units_delta),
      readings = VALUES(readings)
  `);
  console.log(`[Summary] DailyEnergy refreshed in ${Date.now() - t0}ms`);
}

// ─── MONTHLY ENERGY ────────────────────────────────────────────────
async function refreshMonthlyEnergy() {
  const t0 = Date.now();
  await query(`
    INSERT INTO SummaryMonthlyEnergy (DRN, summary_year, summary_month, last_energy, last_units, readings)
    SELECT
      t1.DRN,
      YEAR(t1.date_time) as summary_year,
      MONTH(t1.date_time) as summary_month,
      CAST(t1.active_energy AS DECIMAL(13,3)),
      CAST(t1.units AS DECIMAL(13,3)),
      t2.cnt
    FROM MeterCumulativeEnergyUsage t1
    INNER JOIN (
      SELECT DRN, YEAR(date_time) as y, MONTH(date_time) as m, MAX(id) as max_id, COUNT(*) as cnt
      FROM MeterCumulativeEnergyUsage
      WHERE date_time >= CONCAT(YEAR(CURDATE()) - 1, '-01-01')
      GROUP BY DRN, YEAR(date_time), MONTH(date_time)
    ) t2 ON t1.id = t2.max_id
    ON DUPLICATE KEY UPDATE
      last_energy = VALUES(last_energy),
      last_units = VALUES(last_units),
      readings = VALUES(readings)
  `);

  // Compute energy_kwh deltas using LAG
  await query(`
    UPDATE SummaryMonthlyEnergy cur
    LEFT JOIN SummaryMonthlyEnergy prev ON
      prev.DRN = cur.DRN AND (
        (cur.summary_month > 1 AND prev.summary_year = cur.summary_year AND prev.summary_month = cur.summary_month - 1)
        OR (cur.summary_month = 1 AND prev.summary_year = cur.summary_year - 1 AND prev.summary_month = 12)
      )
    SET cur.energy_kwh = ROUND(GREATEST(cur.last_energy - COALESCE(prev.last_energy, 0), 0) / 1000, 3)
    WHERE cur.summary_year >= YEAR(CURDATE()) - 1
  `);

  console.log(`[Summary] MonthlyEnergy refreshed in ${Date.now() - t0}ms`);
}

// ─── DASHBOARD KPIs ────────────────────────────────────────────────
async function refreshDashboardKPI() {
  const t0 = Date.now();

  // Total meters
  const [{ total }] = await query(`SELECT COUNT(DISTINCT DRN) as total FROM MeterProfileReal`);
  await upsertKPI('total_meters', total);

  // Live/offline counts
  const [counts] = await query(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN last_seen >= NOW() - INTERVAL 5 MINUTE THEN 1 ELSE 0 END) as live,
      SUM(CASE WHEN last_seen < NOW() - INTERVAL 5 MINUTE OR last_seen IS NULL THEN 1 ELSE 0 END) as offline
    FROM MeterLastSeen
  `);
  await upsertKPI('live_meters', counts.live || 0);
  await upsertKPI('offline_meters', counts.offline || 0);

  // Today's energy (from summary table if available, else quick query)
  const [energy] = await query(`
    SELECT COALESCE(SUM(energy_delta_kwh), 0) as kwh
    FROM SummaryDailyEnergy
    WHERE summary_date = CURDATE()
  `);
  await upsertKPI('today_energy_kwh', energy.kwh);

  // Today's tokens
  const [tokens] = await query(`
    SELECT COUNT(*) as cnt, COALESCE(SUM(token_amount), 0) as revenue
    FROM STSTokesInfo
    WHERE DATE(date_time) = CURDATE() AND display_msg = 'Accept'
  `);
  await upsertKPI('today_token_count', tokens.cnt);
  await upsertKPI('today_token_revenue', tokens.revenue);

  // System avg power (from latest readings per meter)
  const [power] = await query(`
    SELECT
      ROUND(AVG(p.active_power), 2) as avg_power,
      ROUND(MAX(p.active_power), 2) as peak_power,
      ROUND(AVG(p.voltage), 2) as avg_voltage,
      COUNT(DISTINCT p.DRN) as reporting
    FROM MeteringPower p
    INNER JOIN (
      SELECT DRN, MAX(id) as max_id FROM MeteringPower
      WHERE date_time >= NOW() - INTERVAL 10 MINUTE
      GROUP BY DRN
    ) latest ON p.id = latest.max_id
  `);
  await upsertKPI('system_avg_power', power.avg_power || 0);
  await upsertKPI('system_peak_power', power.peak_power || 0);
  await upsertKPI('system_avg_voltage', power.avg_voltage || 0);
  await upsertKPI('system_reporting_meters', power.reporting || 0);

  console.log(`[Summary] DashboardKPI refreshed in ${Date.now() - t0}ms`);
}

async function upsertKPI(key, value) {
  await query(
    `INSERT INTO SummaryDashboardKPI (kpi_key, kpi_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE kpi_value = VALUES(kpi_value)`,
    [key, value]
  );
}

// ─── BACKFILL: populate historical daily energy ────────────────────
async function backfillDailyEnergy(days = 90) {
  const t0 = Date.now();
  console.log(`[Summary] Backfilling DailyEnergy for last ${days} days...`);
  await query(`
    INSERT IGNORE INTO SummaryDailyEnergy (DRN, summary_date, start_energy, end_energy, energy_delta_wh, energy_delta_kwh, start_units, end_units, units_delta, readings)
    SELECT
      g.DRN, g.d,
      CAST(e_first.active_energy AS DECIMAL(13,3)),
      CAST(e_last.active_energy AS DECIMAL(13,3)),
      GREATEST(CAST(e_last.active_energy AS DECIMAL(13,3)) - CAST(e_first.active_energy AS DECIMAL(13,3)), 0),
      ROUND(GREATEST(CAST(e_last.active_energy AS DECIMAL(13,3)) - CAST(e_first.active_energy AS DECIMAL(13,3)), 0) / 1000, 3),
      CAST(e_first.units AS DECIMAL(13,3)),
      CAST(e_last.units AS DECIMAL(13,3)),
      ROUND(GREATEST(CAST(e_last.units AS DECIMAL(13,3)) - CAST(e_first.units AS DECIMAL(13,3)), 0), 3),
      g.cnt
    FROM (
      SELECT DRN, DATE(date_time) as d, MIN(id) as min_id, MAX(id) as max_id, COUNT(*) as cnt
      FROM MeterCumulativeEnergyUsage
      WHERE date_time >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        AND date_time < CURDATE()
      GROUP BY DRN, DATE(date_time)
    ) g
    JOIN MeterCumulativeEnergyUsage e_first ON e_first.id = g.min_id
    JOIN MeterCumulativeEnergyUsage e_last ON e_last.id = g.max_id
  `, [days]);
  console.log(`[Summary] DailyEnergy backfill done in ${Date.now() - t0}ms`);
}

// ─── SCHEDULER ─────────────────────────────────────────────────────
let intervals = [];

function startScheduler() {
  console.log('[Summary] Starting background summary worker...');

  // Run initial population (staggered to avoid DB spike)
  setTimeout(() => refreshPower15Min().catch(e => console.error('[Summary] Power15Min error:', e.message)), 5000);
  setTimeout(() => refreshTHD15Min().catch(e => console.error('[Summary] THD15Min error:', e.message)), 10000);
  setTimeout(() => refreshDashboardKPI().catch(e => console.error('[Summary] KPI error:', e.message)), 15000);
  setTimeout(() => refreshDailyEnergy().catch(e => console.error('[Summary] DailyEnergy error:', e.message)), 20000);
  setTimeout(() => refreshMonthlyEnergy().catch(e => console.error('[Summary] MonthlyEnergy error:', e.message)), 30000);

  // Schedule recurring refreshes
  intervals.push(setInterval(() => refreshPower15Min().catch(e => console.error('[Summary] Power15Min error:', e.message)), 5 * 60 * 1000));
  intervals.push(setInterval(() => refreshTHD15Min().catch(e => console.error('[Summary] THD15Min error:', e.message)), 5 * 60 * 1000));
  intervals.push(setInterval(() => refreshDashboardKPI().catch(e => console.error('[Summary] KPI error:', e.message)), 2 * 60 * 1000));
  intervals.push(setInterval(() => refreshDailyEnergy().catch(e => console.error('[Summary] DailyEnergy error:', e.message)), 15 * 60 * 1000));
  intervals.push(setInterval(() => refreshMonthlyEnergy().catch(e => console.error('[Summary] MonthlyEnergy error:', e.message)), 60 * 60 * 1000));

  // One-time backfill of historical daily energy (only fills gaps via INSERT IGNORE)
  setTimeout(() => backfillDailyEnergy(90).catch(e => console.error('[Summary] Backfill error:', e.message)), 60000);
}

async function init() {
  await ensureTables();
  startScheduler();
}

module.exports = { init, refreshPower15Min, refreshTHD15Min, refreshDailyEnergy, refreshMonthlyEnergy, refreshDashboardKPI, backfillDailyEnergy };
