/**
 * Tamper Detection Routes
 * Provides endpoints for physical tamper events and software-based tamper analytics
 */
var express = require('express');
var router = express.Router();
var connection = require('../config/db');
var auth = require('../admin/authMiddllware');

/**
 * GET /tamper/summary
 * Dashboard summary counts for tamper detection
 */
router.get('/tamper/summary', auth.authenticateToken, function(req, res) {
  var queries = {
    // Total physical tamper events (last 90 days)
    physicalEvents: 'SELECT COUNT(*) as count FROM MeterCumulativeEnergyUsage WHERE tamper_state = 1 AND date_time >= DATE_SUB(NOW(), INTERVAL 90 DAY)',
    // Unique meters with physical tamper (last 90 days)
    physicalMeters: 'SELECT COUNT(DISTINCT DRN) as count FROM MeterCumulativeEnergyUsage WHERE tamper_state = 1 AND date_time >= DATE_SUB(NOW(), INTERVAL 90 DAY)',
    // Confirmed tampered (3+ events)
    confirmedMeters: 'SELECT COUNT(*) as count FROM (SELECT DRN FROM MeterCumulativeEnergyUsage WHERE tamper_state = 1 AND date_time >= DATE_SUB(NOW(), INTERVAL 90 DAY) GROUP BY DRN HAVING COUNT(*) >= 3) t',
    // Active tamper notifications
    activeNotifications: "SELECT COUNT(*) as count FROM MeterNotifications WHERE AlarmType = 'Tamper' AND date_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)",
    // Total meters for context
    totalMeters: 'SELECT COUNT(*) as count FROM MeterProfileReal'
  };

  var results = {};
  var keys = Object.keys(queries);
  var done = 0;

  keys.forEach(function(key) {
    connection.query(queries[key], function(err, rows) {
      if (err) {
        results[key] = 0;
      } else {
        results[key] = rows[0] ? rows[0].count : 0;
      }
      done++;
      if (done === keys.length) {
        res.json({
          success: true,
          physicalEvents: results.physicalEvents,
          physicalMeters: results.physicalMeters,
          confirmedMeters: results.confirmedMeters,
          activeNotifications: results.activeNotifications,
          totalMeters: results.totalMeters
        });
      }
    });
  });
});

/**
 * GET /tamper/physical
 * Physical tamper events — direct tamper_state=1 readings from meters
 */
router.get('/tamper/physical', auth.authenticateToken, function(req, res) {
  var days = parseInt(req.query.days) || 90;
  var limit = parseInt(req.query.limit) || 200;

  var sql =
    'SELECT e.DRN, ' +
    '  p.Name as customer_name, p.Surname as customer_surname, ' +
    '  p.City, p.Region, ' +
    '  e.tamper_state, e.tamp_time, e.units as credit_at_tamper, ' +
    '  e.active_energy, e.date_time as detected_at, ' +
    '  n.Alarm as notification_msg, n.Type as severity ' +
    'FROM MeterCumulativeEnergyUsage e ' +
    'LEFT JOIN MeterProfileReal p ON e.DRN = p.DRN ' +
    'LEFT JOIN ( ' +
    '  SELECT DRN, Alarm, Type, ' +
    '    ROW_NUMBER() OVER (PARTITION BY DRN ORDER BY date_time DESC) as rn ' +
    '  FROM MeterNotifications ' +
    "  WHERE AlarmType = 'Tamper' " +
    ') n ON e.DRN = n.DRN AND n.rn = 1 ' +
    'WHERE e.tamper_state = 1 ' +
    '  AND e.date_time >= DATE_SUB(NOW(), INTERVAL ? DAY) ' +
    'ORDER BY e.date_time DESC ' +
    'LIMIT ?';

  connection.query(sql, [days, limit], function(err, rows) {
    if (err) {
      console.error('Error fetching physical tamper events:', err);
      return res.status(500).json({ error: 'Failed to fetch tamper events', details: err.message });
    }

    var events = (rows || []).map(function(row) {
      return {
        DRN: row.DRN,
        customerName: ((row.customer_name || '') + ' ' + (row.customer_surname || '')).trim() || 'Unknown',
        city: row.City || '',
        region: row.Region || '',
        tamperTime: row.tamp_time ? new Date(row.tamp_time * 1000).toISOString() : null,
        creditAtTamper: row.credit_at_tamper != null ? Number(row.credit_at_tamper) : null,
        activeEnergy: row.active_energy != null ? Number(row.active_energy) : null,
        detectedAt: row.detected_at,
        severity: row.severity || 'Warning',
        notificationMsg: row.notification_msg || 'Physical tamper detected'
      };
    });

    res.json({ success: true, count: events.length, events: events });
  });
});

/**
 * GET /tamper/analytical/confirmed
 * Meters confirmed tampered through software detection — repeat offenders with 3+ tamper events
 */
router.get('/tamper/analytical/confirmed', auth.authenticateToken, function(req, res) {
  var days = parseInt(req.query.days) || 90;

  var sql =
    'SELECT e.DRN, ' +
    '  p.Name as customer_name, p.Surname as customer_surname, ' +
    '  p.City, p.Region, ' +
    '  COUNT(*) as tamper_count, ' +
    '  MAX(e.tamp_time) as last_tamper_time, ' +
    '  MAX(e.date_time) as last_detected, ' +
    '  MIN(e.date_time) as first_detected, ' +
    '  AVG(e.units) as avg_credit, ' +
    '  MAX(e.units) as max_credit, ' +
    '  MIN(e.units) as min_credit ' +
    'FROM MeterCumulativeEnergyUsage e ' +
    'LEFT JOIN MeterProfileReal p ON e.DRN = p.DRN ' +
    'WHERE e.tamper_state = 1 ' +
    '  AND e.date_time >= DATE_SUB(NOW(), INTERVAL ? DAY) ' +
    'GROUP BY e.DRN, p.Name, p.Surname, p.City, p.Region ' +
    'HAVING COUNT(*) >= 3 ' +
    'ORDER BY tamper_count DESC';

  connection.query(sql, [days], function(err, rows) {
    if (err) {
      console.error('Error fetching confirmed tamper meters:', err);
      return res.status(500).json({ error: 'Failed to fetch confirmed tamper data', details: err.message });
    }

    var meters = (rows || []).map(function(row) {
      return {
        DRN: row.DRN,
        customerName: ((row.customer_name || '') + ' ' + (row.customer_surname || '')).trim() || 'Unknown',
        city: row.City || '',
        region: row.Region || '',
        tamperCount: row.tamper_count,
        lastTamperTime: row.last_tamper_time ? new Date(row.last_tamper_time * 1000).toISOString() : null,
        lastDetected: row.last_detected,
        firstDetected: row.first_detected,
        avgCredit: row.avg_credit != null ? Number(Number(row.avg_credit).toFixed(2)) : null,
        maxCredit: row.max_credit != null ? Number(row.max_credit) : null,
        minCredit: row.min_credit != null ? Number(row.min_credit) : null,
        riskLevel: row.tamper_count >= 10 ? 'Critical' : row.tamper_count >= 5 ? 'High' : 'Medium'
      };
    });

    res.json({ success: true, count: meters.length, meters: meters });
  });
});

/**
 * GET /tamper/analytical/suspected
 * Meters suspected of tampering — intermittent tamper signals, anomalous patterns
 * Criteria: 1-2 tamper events (not enough for confirmed) OR meters with anomalous consumption drops
 */
router.get('/tamper/analytical/suspected', auth.authenticateToken, function(req, res) {
  var days = parseInt(req.query.days) || 90;

  // Part 1: Meters with 1-2 tamper events (intermittent signals)
  var sqlIntermittent =
    'SELECT e.DRN, ' +
    '  p.Name as customer_name, p.Surname as customer_surname, ' +
    '  p.City, p.Region, ' +
    '  COUNT(*) as tamper_count, ' +
    '  MAX(e.tamp_time) as last_tamper_time, ' +
    '  MAX(e.date_time) as last_detected, ' +
    '  AVG(e.units) as avg_credit ' +
    'FROM MeterCumulativeEnergyUsage e ' +
    'LEFT JOIN MeterProfileReal p ON e.DRN = p.DRN ' +
    'WHERE e.tamper_state = 1 ' +
    '  AND e.date_time >= DATE_SUB(NOW(), INTERVAL ? DAY) ' +
    'GROUP BY e.DRN, p.Name, p.Surname, p.City, p.Region ' +
    'HAVING COUNT(*) BETWEEN 1 AND 2 ' +
    'ORDER BY last_detected DESC';

  // Part 2: Meters with anomalous consumption (sudden drops — consuming less than 10% of their average)
  var sqlAnomaly =
    'SELECT m.DRN, ' +
    '  p.Name as customer_name, p.Surname as customer_surname, ' +
    '  p.City, p.Region, ' +
    '  m.recent_avg, m.historical_avg, ' +
    '  ROUND((1 - m.recent_avg / NULLIF(m.historical_avg, 0)) * 100, 1) as drop_percentage ' +
    'FROM ( ' +
    '  SELECT a.DRN, ' +
    '    ( SELECT AVG(daily_usage) FROM ( ' +
    '        SELECT DATE(date_time) as d, MAX(active_energy) - MIN(active_energy) as daily_usage ' +
    '        FROM MeterCumulativeEnergyUsage ' +
    '        WHERE DRN = a.DRN AND date_time >= DATE_SUB(NOW(), INTERVAL 7 DAY) ' +
    '        GROUP BY DATE(date_time) ' +
    '      ) recent ' +
    '    ) as recent_avg, ' +
    '    ( SELECT AVG(daily_usage) FROM ( ' +
    '        SELECT DATE(date_time) as d, MAX(active_energy) - MIN(active_energy) as daily_usage ' +
    '        FROM MeterCumulativeEnergyUsage ' +
    '        WHERE DRN = a.DRN ' +
    '          AND date_time >= DATE_SUB(NOW(), INTERVAL ? DAY) ' +
    '          AND date_time < DATE_SUB(NOW(), INTERVAL 7 DAY) ' +
    '        GROUP BY DATE(date_time) ' +
    '      ) historical ' +
    '    ) as historical_avg ' +
    '  FROM (SELECT DISTINCT DRN FROM MeterCumulativeEnergyUsage WHERE date_time >= DATE_SUB(NOW(), INTERVAL ? DAY)) a ' +
    ') m ' +
    'LEFT JOIN MeterProfileReal p ON m.DRN = p.DRN ' +
    'WHERE m.historical_avg > 0 ' +
    '  AND m.recent_avg IS NOT NULL ' +
    '  AND m.recent_avg < m.historical_avg * 0.1 ' +
    '  AND m.DRN NOT IN ( ' +
    '    SELECT DISTINCT DRN FROM MeterCumulativeEnergyUsage ' +
    '    WHERE tamper_state = 1 AND date_time >= DATE_SUB(NOW(), INTERVAL ? DAY) ' +
    '    GROUP BY DRN HAVING COUNT(*) >= 3 ' +
    '  ) ' +
    'ORDER BY drop_percentage DESC ' +
    'LIMIT 50';

  connection.query(sqlIntermittent, [days], function(err1, intermittentRows) {
    if (err1) {
      console.error('Error fetching intermittent tamper:', err1);
      intermittentRows = [];
    }

    // The anomaly query uses correlated subqueries which can be slow.
    // For safety, use a simpler version if the complex one fails.
    connection.query(sqlAnomaly, [days, days, days], function(err2, anomalyRows) {
      if (err2) {
        console.error('Error fetching anomaly data:', err2);
        anomalyRows = [];
      }

      var intermittent = (intermittentRows || []).map(function(row) {
        return {
          DRN: row.DRN,
          customerName: ((row.customer_name || '') + ' ' + (row.customer_surname || '')).trim() || 'Unknown',
          city: row.City || '',
          region: row.Region || '',
          tamperCount: row.tamper_count,
          lastTamperTime: row.last_tamper_time ? new Date(row.last_tamper_time * 1000).toISOString() : null,
          lastDetected: row.last_detected,
          avgCredit: row.avg_credit != null ? Number(Number(row.avg_credit).toFixed(2)) : null,
          reason: 'Intermittent tamper signal (' + row.tamper_count + ' event' + (row.tamper_count > 1 ? 's' : '') + ')',
          riskLevel: 'Low'
        };
      });

      var anomalies = (anomalyRows || []).map(function(row) {
        return {
          DRN: row.DRN,
          customerName: ((row.customer_name || '') + ' ' + (row.customer_surname || '')).trim() || 'Unknown',
          city: row.City || '',
          region: row.Region || '',
          tamperCount: 0,
          lastTamperTime: null,
          lastDetected: null,
          avgCredit: null,
          reason: 'Consumption drop of ' + row.drop_percentage + '% detected',
          riskLevel: row.drop_percentage >= 90 ? 'High' : 'Medium',
          recentAvg: row.recent_avg != null ? Number(Number(row.recent_avg).toFixed(2)) : null,
          historicalAvg: row.historical_avg != null ? Number(Number(row.historical_avg).toFixed(2)) : null,
          dropPercentage: row.drop_percentage != null ? Number(row.drop_percentage) : null
        };
      });

      var all = intermittent.concat(anomalies);

      res.json({ success: true, count: all.length, meters: all });
    });
  });
});

module.exports = router;
