const express = require('express');
const router = express.Router();
const db = require('../config/db');

/**
 * POST /api/v1/relay-events/:drn
 * Receive relay events from the maintenance app (no auth required)
 */
router.post('/:drn', (req, res) => {
  const drn = req.params.drn;

  // Support both single event and batch (array)
  let events = req.body.events || (Array.isArray(req.body) ? req.body : [req.body]);

  if (!events || events.length === 0) {
    return res.status(400).json({ success: false, message: 'No relay events provided.' });
  }

  let inserted = 0;
  let errors = 0;

  const processNext = (index) => {
    if (index >= events.length) {
      return res.status(201).json({
        success: true,
        message: `${inserted} relay event(s) stored`,
        count: inserted,
      });
    }

    const evt = events[index];
    const {
      relay_index = 0,
      entry_type = 0,
      state,
      control,
      reason = 0,
      reason_text = '',
      trigger = 0,
      timestamp,
    } = evt;

    const ts = timestamp || Math.floor(Date.now() / 1000);

    db.query(
      `INSERT INTO meter_relay_events
         (drn, relay_index, entry_type, state, control, reason_code, reason_text, trigger_type, meter_timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?))`,
      [
        drn,
        relay_index,
        entry_type,
        state !== undefined ? state : null,
        control !== undefined ? control : null,
        reason,
        reason_text || '',
        trigger,
        ts,
      ],
      (err) => {
        if (err) {
          console.error(`Error inserting relay event for ${drn}:`, err.message);
          errors++;
        } else {
          inserted++;
        }
        processNext(index + 1);
      }
    );
  };

  processNext(0);
});

/**
 * GET /api/v1/relay-events/:drn
 * Fetch relay events for a meter with pagination and filtering
 */
router.get('/:drn', (req, res) => {
  const drn = req.params.drn;
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  const relay = req.query.relay;
  const type = req.query.type;

  let countSql = 'SELECT COUNT(*) as total FROM meter_relay_events WHERE drn = ?';
  let dataSql = `SELECT id, drn, relay_index, entry_type, state, control,
    reason_code, reason_text, trigger_type, meter_timestamp,
    CASE WHEN relay_index = 0 THEN 'Mains' ELSE 'Geyser' END as relay_name,
    CASE WHEN entry_type = 0 THEN 'State Change' ELSE 'Control Command' END as type_name,
    CASE
      WHEN reason_code = 0 THEN 'Normal'
      WHEN reason_code = 1 THEN 'Remote Command'
      WHEN reason_code = 2 THEN 'Manual Control'
      WHEN reason_code = 3 THEN 'Timer/Schedule'
      WHEN reason_code = 4 THEN 'Credit Exhausted'
      WHEN reason_code = 5 THEN 'Credit Loaded'
      WHEN reason_code = 6 THEN 'Tamper Detected'
      WHEN reason_code = 7 THEN 'System Startup'
      WHEN reason_code = 8 THEN 'Over Current'
      WHEN reason_code = 9 THEN 'Temperature'
      ELSE CONCAT('Code ', reason_code)
    END as reason_name
    FROM meter_relay_events WHERE drn = ?`;
  const params = [drn];
  const countParams = [drn];

  if (relay !== undefined && relay !== '') {
    countSql += ' AND relay_index = ?';
    dataSql += ' AND relay_index = ?';
    params.push(parseInt(relay));
    countParams.push(parseInt(relay));
  }
  if (type !== undefined && type !== '') {
    countSql += ' AND entry_type = ?';
    dataSql += ' AND entry_type = ?';
    params.push(parseInt(type));
    countParams.push(parseInt(type));
  }

  dataSql += ' ORDER BY meter_timestamp DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  db.query(countSql, countParams, (err, countResult) => {
    if (err) {
      console.error('Error counting relay events:', err.message);
      return res.status(500).json({ success: false, message: err.message });
    }
    const total = countResult[0]?.total || 0;

    db.query(dataSql, params, (err2, rows) => {
      if (err2) {
        console.error('Error fetching relay events:', err2.message);
        return res.status(500).json({ success: false, message: err2.message });
      }
      res.json({
        success: true,
        data: rows,
        pagination: { total, limit, offset, page: Math.floor(offset / limit) },
      });
    });
  });
});

/**
 * GET /api/v1/relay-events/:drn/summary
 * Relay event summary for charts (last N hours)
 */
router.get('/:drn/summary', (req, res) => {
  const drn = req.params.drn;
  const hours = parseInt(req.query.hours) || 168;

  const sql = `
    SELECT
      reason_code,
      CASE
        WHEN reason_code = 0 THEN 'Normal'
        WHEN reason_code = 1 THEN 'Remote Command'
        WHEN reason_code = 2 THEN 'Manual Control'
        WHEN reason_code = 3 THEN 'Timer/Schedule'
        WHEN reason_code = 4 THEN 'Credit Exhausted'
        WHEN reason_code = 5 THEN 'Credit Loaded'
        WHEN reason_code = 6 THEN 'Tamper Detected'
        WHEN reason_code = 7 THEN 'System Startup'
        WHEN reason_code = 8 THEN 'Over Current'
        WHEN reason_code = 9 THEN 'Temperature'
        ELSE CONCAT('Code ', reason_code)
      END as reason_name,
      COUNT(*) as count,
      relay_index,
      CASE WHEN relay_index = 0 THEN 'Mains' ELSE 'Geyser' END as relay_name,
      entry_type
    FROM meter_relay_events
    WHERE drn = ? AND meter_timestamp >= DATE_SUB(NOW(), INTERVAL ? HOUR)
    GROUP BY reason_code, relay_index, entry_type
    ORDER BY count DESC
  `;

  db.query(sql, [drn, hours], (err, rows) => {
    if (err) {
      console.error('Error fetching relay summary:', err.message);
      return res.status(500).json({ success: false, message: err.message });
    }

    // Build summary structure
    const byReason = {};
    const byRelay = {};
    rows.forEach(r => {
      // Pie chart data - by reason
      if (!byReason[r.reason_name]) byReason[r.reason_name] = 0;
      byReason[r.reason_name] += r.count;

      // Bar chart data - by relay
      const key = r.relay_name;
      if (!byRelay[key]) byRelay[key] = { state: 0, control: 0 };
      if (r.entry_type === 0) byRelay[key].state += r.count;
      else byRelay[key].control += r.count;
    });

    const reasonData = Object.entries(byReason).map(([name, value]) => ({ name, value }));
    const relayData = Object.entries(byRelay).map(([name, data]) => ({
      name, state: data.state, control: data.control
    }));

    res.json({
      success: true,
      data: {
        byReason: reasonData,
        byRelay: relayData,
        totalEvents: rows.reduce((sum, r) => sum + r.count, 0),
        hours,
      },
    });
  });
});

module.exports = router;
