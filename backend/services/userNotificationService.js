/**
 * userNotificationService — customer-facing (per-user, mobile) notification
 * inbox. This is deliberately separate from backend/notifications/*, which is
 * the admin-dashboard meter-alarm feed (MeterNotifications: DRN-keyed,
 * Type=Pending/Critical/Success/Warning, no per-user delivery tracking, no
 * category preferences). Credit-transfer / geyser / load-change events are a
 * different concern — a per-user push-style inbox with idempotent delivery —
 * so this is a new, purpose-built table (UserNotifications) rather than a
 * second competing system for the same problem.
 *
 * Idempotency: UserNotifications has a UNIQUE KEY on (UserID, source_event_id).
 * Every call site here derives source_event_id deterministically from the
 * underlying event (a transfer id, a state-change row id, a load episode
 * start time) so a duplicate MQTT ACK, a retried request, or a reconnect
 * replay collapses into the same row instead of creating a second
 * notification — enforced at the database level, not by an in-memory guard
 * that would reset on server restart.
 */
const db = require('../config/db');

function queryAll(sql, params) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err); else resolve(results || []);
    });
  });
}

/**
 * Create one notification for one user. Silently absorbs a duplicate
 * source_event_id for that user (ON DUPLICATE KEY UPDATE id=id is a no-op
 * write, so it doesn't touch created_at/delivered_at on the existing row).
 */
function createNotification({ userId, category, title, body, relatedDrn, sourceEventId, meta }) {
  return new Promise((resolve, reject) => {
    db.query(
      `INSERT INTO UserNotifications (UserID, category, title, body, related_drn, source_event_id, meta_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE id = id`,
      [userId, category, title, body, relatedDrn || null, sourceEventId, meta ? JSON.stringify(meta) : null],
      (err, result) => {
        if (err) return reject(err);
        // affectedRows === 1 -> fresh insert. A duplicate key hits the
        // ON DUPLICATE KEY UPDATE branch instead; since id=id changes
        // nothing, MySQL reports affectedRows === 0 for that case.
        resolve({ created: result.affectedRows === 1, duplicate: result.affectedRows !== 1 });
      }
    );
  });
}

/** Every account with an active link to a meter (CustomerMeters; up to 5). */
async function getUsersForDrn(drn) {
  return queryAll("SELECT UserID FROM CustomerMeters WHERE DRN = ? AND status = 'active'", [drn]);
}

/** Fan a notification out to every user currently associated with a meter. */
async function notifyMeterOwners(drn, { category, title, body, sourceEventId, meta }) {
  const users = await getUsersForDrn(drn);
  const results = await Promise.all(users.map(u => createNotification({
    userId: u.UserID, category, title, body, relatedDrn: drn,
    sourceEventId: `${sourceEventId}:${u.UserID}`, meta,
  })));
  return { userCount: users.length, created: results.filter(r => r.created).length };
}

module.exports = { createNotification, notifyMeterOwners, getUsersForDrn };
