const express = require('express');
const router = express.Router();
const winston = require('winston');
const NodeCache = require('node-cache');

const { authenticateToken } = require('../admin/authMiddllware');


// Import dotenv
const dotenv = require('dotenv'); // Import dotenv
const connection = require("../config/db");



//Configure dotenv
dotenv.config();


// Set up Winston logger with console and file transports
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ],
});

// Global error handler for uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  // You can perform any necessary cleanup here before exiting
  process.exit(1);
});

// Global error handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection:', reason);
  // You can perform any necessary cleanup here before exiting
  process.exit(1);
});


  









// Create a new cache instance
// Create a new cache instance
const cache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

router.post('/getSuburbEnergy', authenticateToken, async (req, res) => {
  const suburbs = req.body.suburbs;

  if (!Array.isArray(suburbs)) {
    return res.status(400).json({ error: 'Invalid suburbs data. Expecting an array.' });
  }

  // Return cached if all requested suburbs are cached
  const allCached = suburbs.every((s) => !!cache.get(s));
  if (allCached) {
    const suburbsWeekly = {};
    const suburbsMonthly = {};
    const suburbsYearly = {};
    suburbs.forEach((s) => {
      const c = cache.get(s);
      suburbsWeekly[s] = c.weekly;
      suburbsMonthly[s] = c.monthly;
      suburbsYearly[s] = c.yearly;
    });
    return res.json({ suburbsWeekly, suburbsMonthly, suburbsYearly });
  }

  // Helper to initialize all requested suburbs to 0
  const initMap = (arr, precision = 2) => arr.reduce((acc, s) => { acc[s] = parseFloat((0).toFixed(precision)); return acc; }, {});

  // Weekly: last-of-Sun(this week) minus last-of-Sun(last week)
  const weeklyQuery = `
    WITH params AS (
      SELECT DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY) AS mon0
    ), bounds AS (
      SELECT 
        DATE_SUB(mon0, INTERVAL 1 DAY) AS sun_last,
        DATE_ADD(mon0, INTERVAL 6 DAY) AS sun_cur
      FROM params
    ), subs AS (
      SELECT DISTINCT DRN, LocationName FROM MeterLocationInfoTable WHERE LocationName IN (?)
    ), last_readings AS (
      SELECT 
        s.LocationName,
        s.DRN,
        (SELECT CAST(active_energy AS DECIMAL(10,2)) FROM MeterCumulativeEnergyUsage mu WHERE mu.DRN = s.DRN AND mu.date_time <= CONCAT(b.sun_cur, ' 23:59:59') ORDER BY mu.date_time DESC LIMIT 1) AS cur,
        (SELECT CAST(active_energy AS DECIMAL(10,2)) FROM MeterCumulativeEnergyUsage mu WHERE mu.DRN = s.DRN AND mu.date_time <= CONCAT(b.sun_last, ' 23:59:59') ORDER BY mu.date_time DESC LIMIT 1) AS prev
      FROM subs s CROSS JOIN bounds b
    )
    SELECT LocationName AS Suburb, COALESCE(SUM(GREATEST(cur - prev, 0)), 0) / 1000 AS consumption
    FROM last_readings
    GROUP BY LocationName
  `;

  // Monthly: last-of-current-month minus last-of-previous-month
  const monthlyQuery = `
    WITH bounds AS (
      SELECT LAST_DAY(CURDATE()) AS cur_end, LAST_DAY(DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) AS prev_end
    ), subs AS (
      SELECT DISTINCT DRN, LocationName FROM MeterLocationInfoTable WHERE LocationName IN (?)
    ), last_readings AS (
      SELECT 
        s.LocationName,
        s.DRN,
        (SELECT CAST(active_energy AS DECIMAL(10,2)) FROM MeterCumulativeEnergyUsage mu WHERE mu.DRN = s.DRN AND mu.date_time <= CONCAT(b.cur_end, ' 23:59:59') ORDER BY mu.date_time DESC LIMIT 1) AS cur,
        (SELECT CAST(active_energy AS DECIMAL(10,2)) FROM MeterCumulativeEnergyUsage mu WHERE mu.DRN = s.DRN AND mu.date_time <= CONCAT(b.prev_end, ' 23:59:59') ORDER BY mu.date_time DESC LIMIT 1) AS prev
      FROM subs s CROSS JOIN bounds b
    )
    SELECT LocationName AS Suburb, COALESCE(SUM(GREATEST(cur - prev, 0)), 0) / 1000 AS consumption
    FROM last_readings
    GROUP BY LocationName
  `;

  // Yearly: last-of-current-year minus last-of-previous-year
  const yearlyQuery = `
    WITH bounds AS (
      SELECT 
        STR_TO_DATE(CONCAT(YEAR(CURDATE()), '-12-31'), '%Y-%m-%d') AS cur_end,
        STR_TO_DATE(CONCAT(YEAR(CURDATE()) - 1, '-12-31'), '%Y-%m-%d') AS prev_end
    ), subs AS (
      SELECT DISTINCT DRN, LocationName FROM MeterLocationInfoTable WHERE LocationName IN (?)
    ), last_readings AS (
      SELECT 
        s.LocationName,
        s.DRN,
        (SELECT CAST(active_energy AS DECIMAL(10,2)) FROM MeterCumulativeEnergyUsage mu WHERE mu.DRN = s.DRN AND mu.date_time <= CONCAT(b.cur_end, ' 23:59:59') ORDER BY mu.date_time DESC LIMIT 1) AS cur,
        (SELECT CAST(active_energy AS DECIMAL(10,2)) FROM MeterCumulativeEnergyUsage mu WHERE mu.DRN = s.DRN AND mu.date_time <= CONCAT(b.prev_end, ' 23:59:59') ORDER BY mu.date_time DESC LIMIT 1) AS prev
      FROM subs s CROSS JOIN bounds b
    )
    SELECT LocationName AS Suburb, COALESCE(SUM(GREATEST(cur - prev, 0)), 0) / 1000 AS consumption
    FROM last_readings
    GROUP BY LocationName
  `;

  try {
    const [weeklyRows, monthlyRows, yearlyRows] = await Promise.all([
      new Promise((resolve, reject) => connection.query(weeklyQuery, [suburbs], (e, r) => e ? reject(e) : resolve(r))),
      new Promise((resolve, reject) => connection.query(monthlyQuery, [suburbs], (e, r) => e ? reject(e) : resolve(r))),
      new Promise((resolve, reject) => connection.query(yearlyQuery, [suburbs], (e, r) => e ? reject(e) : resolve(r))),
    ]);

    const suburbsWeekly = initMap(suburbs, 2);
    const suburbsMonthly = initMap(suburbs, 2);
    const suburbsYearly = initMap(suburbs, 6);

    weeklyRows.forEach(row => {
      if (row.Suburb != null && suburbs.includes(row.Suburb)) {
        suburbsWeekly[row.Suburb] = parseFloat(Number(row.consumption).toFixed(2));
      }
    });
    monthlyRows.forEach(row => {
      if (row.Suburb != null && suburbs.includes(row.Suburb)) {
        suburbsMonthly[row.Suburb] = parseFloat(Number(row.consumption).toFixed(2));
      }
    });
    yearlyRows.forEach(row => {
      if (row.Suburb != null && suburbs.includes(row.Suburb)) {
        suburbsYearly[row.Suburb] = parseFloat(Number(row.consumption).toFixed(6));
      }
    });

    // Update cache per suburb
    suburbs.forEach((s) => {
      cache.set(s, { weekly: suburbsWeekly[s], monthly: suburbsMonthly[s], yearly: suburbsYearly[s] });
    });

    return res.json({ suburbsWeekly, suburbsMonthly, suburbsYearly });
  } catch (err) {
    logger.error('Error querying the database:', err);
    return res.status(500).json({ error: 'An error occurred while querying the database.', details: err.message });
  }
});



//Hourly consumption for suburbs

// 'SELECT DRN FROM MeterLocationInfoTable WHERE Suburb = ?';
//   const getHourlyEnergyByDrn = `
//     SELECT HOUR(date_time) as hour, apparent_power
//     FROM (
//       SELECT DRN, apparent_power, date_time, ROW_NUMBER() OVER (PARTITION BY DRN, HOUR(date_time) ORDER BY date_time DESC) as rn
//       FROM MeteringPower
//       WHERE DRN = ? AND DATE(date_time) = CURDATE()
//     ) t
//     WHERE t.rn = 1
//   `;



router.post('/getSuburbHourlyEnergy', authenticateToken, async (req, res) => {
  const suburbs = req.body.suburbs;

  if (!Array.isArray(suburbs)) {
    return res.status(400).json({ error: 'Invalid suburbs data. Expecting an array.' });
  }

  try {
    // Fast path: read from pre-computed SuburbDailyEnergy table
    const result = await new Promise((resolve, reject) => {
      connection.query(
        'SELECT suburb AS Suburb, consumption_wh AS consumption FROM SuburbDailyEnergy WHERE energy_date = CURDATE() AND suburb IN (?)',
        [suburbs],
        (err, data) => {
          if (err) reject(err);
          else resolve(data);
        }
      );
    });

    // Initialize all suburbs to 0.00
    const locationConsumption = suburbs.reduce((acc, suburb) => {
      acc[suburb] = "0.00";
      return acc;
    }, {});

    // Update values for suburbs that have pre-computed data
    result.forEach(row => {
      if (row.Suburb && row.consumption !== null) {
        locationConsumption[row.Suburb] = Number(row.consumption / 1000).toFixed(2);
      }
    });

    res.json({ data: locationConsumption });
  } catch (err) {
    logger.error('Error querying SuburbDailyEnergy:', err);
    return res.status(500).json({
      error: 'An error occurred while querying the database.',
      details: err.message
    });
  }
});

router.get('/getHourlyDataByDrn', authenticateToken, async (req, res) => {
  const query = `
    SELECT 
      mp.DRN, 
      HOUR(mp.date_time) AS hour, 
      MIN(mp.active_power) AS initial_power, 
      MAX(mp.active_power) AS final_power, 
      (MAX(mp.active_power) - MIN(mp.active_power)) AS power_consumption,
      COALESCE(mli.LocationName, 'unknown') as suburb
    FROM MeteringPower mp
    LEFT JOIN MeterLocationInfoTable mli ON mp.DRN = mli.DRN
    WHERE DATE(mp.date_time) = CURDATE()
    GROUP BY mp.DRN, HOUR(mp.date_time) 
    ORDER BY mp.DRN, hour
  `;

  try {
    const result = await new Promise((resolve, reject) => {
      connection.query(query, (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });

    // Transform the data into the required format
    const transformedData = result.reduce((acc, row) => {
      if (!acc[row.DRN]) {
        acc[row.DRN] = {
          suburb: row.suburb,
          hourlyData: []
        };
      }
      acc[row.DRN].hourlyData.push({
        hour: row.hour,
        initial_power: row.initial_power,
        final_power: row.final_power,
        power_consumption: parseFloat(row.power_consumption.toFixed(2))
      });
      return acc;
    }, {});

    res.json(transformedData);
  } catch (err) {
    logger.error('Error querying the database:', err);
    res.status(500).json({ error: 'An error occurred while fetching hourly data' });
  }
});

/**
 * GET /getHourlyDataByDrn/:drn
 * Get hourly power consumption for a specific meter (today)
 */
router.get('/getHourlyDataByDrn/:drn', authenticateToken, async (req, res) => {
  const drn = req.params.drn;
  const query = `
    SELECT
      HOUR(date_time) AS hour,
      MIN(active_power) AS min_power,
      MAX(active_power) AS max_power,
      AVG(active_power) AS avg_power,
      (MAX(active_power) - MIN(active_power)) AS power_consumption
    FROM MeteringPower
    WHERE DRN = ? AND DATE(date_time) = CURDATE()
    GROUP BY HOUR(date_time)
    ORDER BY hour
  `;

  try {
    const result = await new Promise((resolve, reject) => {
      connection.query(query, [drn], (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    // Build 24-hour array (fill gaps with 0)
    const hourlyData = [];
    for (let h = 0; h < 24; h++) {
      const row = result.find(r => r.hour === h);
      const avg = row ? parseFloat(row.avg_power) || 0 : 0;
      const max = row ? parseFloat(row.max_power) || 0 : 0;
      hourlyData.push({
        hour: `${String(h).padStart(2, '0')}:00`,
        kWh: parseFloat((avg / 1000).toFixed(2)),
        avgPower: parseFloat(avg.toFixed(1)),
        maxPower: parseFloat(max.toFixed(1)),
      });
    }

    res.json({ success: true, data: hourlyData });
  } catch (err) {
    console.error('Error fetching hourly data for DRN:', err);
    res.status(500).json({ error: 'Failed to fetch hourly data' });
  }
});

router.post('/getSuburbHourlyEnergyMock', authenticateToken, async (req, res) => {
  const sampleData = {
    data: {
      "Academia": 125.45,
      "Auasblick": 89.32,
      "Avis": 234.78,
      "Cimbebasia": 167.90,
      "Dorado Park": 445.23,
      "Donkerhoek": 178.56,
      "Elisenheim": 267.89,
      "Eros": 389.45,
      "Eros Park": 156.78,
      "Freedom Land": 234.56,
      "Goreangab": 345.67,
      "Groot Aub": 123.45,
      "Greenwell": 278.90,
      "Hakahana": 189.34,
      "Havana": 245.67,
      "Hochland Park": 334.56,
      "Katutura": 456.78,
      "Khomasdal": 289.23,
      "Kleine Kuppe": 378.90,
      "Klein Windhoek": 567.34,
      "Lafrenz": 198.45,
      "Ludwigsdorf": 445.67,
      "Luxury Hill": 678.23,
      "Maxuilili": 234.56,
      "Northern Industrial ": 789.45,
      "Okuryangava": 167.89,
      "Olympia": 445.67,
      "Ombili": 223.45,
      "Otjomuise": 334.56,
      "Pionierspark": 445.67,
      "Prosperita": 556.78,
      "Rocky Crest": 334.56,
      "Southern Industria": 667.89,
      "Suiderhof": 223.45,
      "Tauben Glen": 445.67,
      "Wanaheda": 334.56,
      "Windhoek Central": 778.90,
      "Windhoek North": 445.67,
      "Windhoek West": 334.56
    }
  };

  res.json(sampleData);
});

module.exports = router;