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

module.exports = router;
