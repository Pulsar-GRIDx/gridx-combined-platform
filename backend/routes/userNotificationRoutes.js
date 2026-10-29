/**
 * User Notifications — customer-facing (per-user, mobile) notification inbox.
 * Backed by UserNotifications (see services/userNotificationService.js for
 * why this is separate from the admin-facing MeterNotifications system).
 *
 * The Android app polls GET /user-notifications/unseen (WorkManager periodic
 * + on-foreground) and acks what it successfully rendered via POST
 * /user-notifications/ack, so a notification is delivered at most once even
 * across app restarts, reconnects, or a killed background worker.
 */
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken } = require('../admin/authMiddllware');

function queryAll(sql, params) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err); else resolve(results || []);
    });
  });
}

// GET /user-notifications/unseen — everything not yet acked for this user
router.get('/user-notifications/unseen', authenticateToken, async (req, res) => {
  try {
    if (!req.user || !req.user.UserID) {
      return res.status(400).json({ error: 'This endpoint requires a customer token' });
    }
    const rows = await queryAll(
      `SELECT id, category, title, body, related_drn, meta_json, created_at
       FROM UserNotifications
       WHERE UserID = ? AND delivered_at IS NULL
       ORDER BY created_at ASC
       LIMIT 50`,
      [req.user.UserID]
    );
    const notifications = rows.map(r => ({
      id: r.id,
      category: r.category,
      title: r.title,
      body: r.body,
      relatedDrn: r.related_drn,
      meta: r.meta_json ? (typeof r.meta_json === 'string' ? JSON.parse(r.meta_json) : r.meta_json) : null,
      createdAt: r.created_at,
    }));
    res.json({ success: true, notifications });
  } catch (err) {
    console.error('[UserNotifications] unseen error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /user-notifications/ack — body: { ids: [1,2,3] }
router.post('/user-notifications/ack', authenticateToken, async (req, res) => {
  try {
    if (!req.user || !req.user.UserID) {
      return res.status(400).json({ error: 'This endpoint requires a customer token' });
    }
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(id => Number.isInteger(id)) : [];
    if (!ids.length) {
      return res.status(400).json({ error: 'ids must be a non-empty array of integers' });
    }
    const placeholders = ids.map(() => '?').join(',');
    db.query(
      `UPDATE UserNotifications SET delivered_at = NOW()
       WHERE UserID = ? AND id IN (${placeholders}) AND delivered_at IS NULL`,
      [req.user.UserID, ...ids],
      (err, result) => {
        if (err) {
          console.error('[UserNotifications] ack error:', err.message);
          return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, acked: result.affectedRows });
      }
    );
  } catch (err) {
    console.error('[UserNotifications] ack error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
