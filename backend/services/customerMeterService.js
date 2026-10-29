// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMER METERS — which meters an account may see and control
//
// CustomerMeters (migrations/20261029_customer_meters.js) is the only source
// of truth for customer authorisation. SystemUsers.DRN is legacy display data
// and is never consulted here.
//
//   role   owner  — at most one per meter; may remove other members
//          member — full customer access to the meter, cannot manage others
//   status active | revoked  (revoked rows are kept for audit)
//
// Every write goes through this module so the rules live in one place:
//   - a meter has at most MAX_USERS_PER_METER active accounts
//   - linking never removes or downgrades an existing association
//   - ownership is never granted implicitly to a meter that already has users
// ═══════════════════════════════════════════════════════════════════════════

var db = require('../config/db');
var MAX_USERS_PER_METER = require('../migrations/20261029_customer_meters').MAX_USERS_PER_METER;

var DRN_RE = /^\d{13}$/;

function q(sql, params) {
  return new Promise(function(resolve, reject) {
    db.query(sql, params || [], function(err, rows) {
      if (err) reject(err); else resolve(rows);
    });
  });
}

function httpError(status, message, code) {
  var e = new Error(message);
  e.status = status;
  if (code) e.code = code;
  return e;
}

// ── Authorisation lookups ──────────────────────────────────────────────────
// A short cache keeps the per-request check cheap (authenticateToken can run
// several times for one request). Every write in this module invalidates the
// affected user, so revocation is immediate in this process; the TTL bounds
// staleness across processes.
var CACHE_TTL_MS = 10 * 1000;
var cache = new Map();

function invalidate(userId) {
  if (userId === undefined) cache.clear(); else cache.delete(String(userId));
}

async function authorizedDrns(userId) {
  var key = String(userId);
  var hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.drns;
  var rows = await q("SELECT DRN FROM CustomerMeters WHERE UserID = ? AND status = 'active'", [userId]);
  var drns = rows.map(function(r) { return String(r.DRN); });
  cache.set(key, { drns: drns, expires: Date.now() + CACHE_TTL_MS });
  return drns;
}

async function isAuthorized(userId, drn) {
  if (!userId || !drn) return false;
  var drns = await authorizedDrns(userId);
  return drns.indexOf(String(drn)) !== -1;
}

// Full list for the app: one row per active meter with its display data.
async function listForUser(userId) {
  var rows = await q(
    'SELECT cm.DRN, cm.role, cm.nickname, cm.verified_via, cm.created_at AS linked_at, ' +
    '       mpr.Name, mpr.Surname, mpr.City, mpr.StreetName, mpr.HouseNumber, ' +
    // MeterLastSeen is kept current by the MQTT handler on every message.
    '       (SELECT MAX(ls.last_seen) FROM MeterLastSeen ls WHERE ls.DRN = cm.DRN) AS last_seen ' +
    'FROM CustomerMeters cm JOIN MeterProfileReal mpr ON mpr.DRN = cm.DRN ' +
    "WHERE cm.UserID = ? AND cm.status = 'active' ORDER BY cm.created_at ASC, cm.id ASC",
    [userId]
  ).catch(function(err) {
    // MeterLastSeen may be absent in a fresh schema; the list must still
    // work without last_seen.
    if (err.code !== 'ER_NO_SUCH_TABLE') throw err;
    return q(
      'SELECT cm.DRN, cm.role, cm.nickname, cm.verified_via, cm.created_at AS linked_at, ' +
      '       mpr.Name, mpr.Surname, mpr.City, mpr.StreetName, mpr.HouseNumber, NULL AS last_seen ' +
      'FROM CustomerMeters cm JOIN MeterProfileReal mpr ON mpr.DRN = cm.DRN ' +
      "WHERE cm.UserID = ? AND cm.status = 'active' ORDER BY cm.created_at ASC, cm.id ASC",
      [userId]);
  });
  return rows.map(function(r) {
    var address = [r.HouseNumber, r.StreetName, r.City]
      .filter(function(p) { return p && p !== 'not defined'; }).join(' ');
    return {
      drn: String(r.DRN),
      role: r.role,
      nickname: r.nickname || null,
      displayName: r.nickname || address || ('Meter ' + String(r.DRN).slice(-4)),
      address: address || null,
      registrationStatus: 'registered',
      linkedVia: r.verified_via,
      linkedAt: r.linked_at,
      lastSeen: r.last_seen || null,
    };
  });
}

async function meterExists(drn) {
  var rows = await q('SELECT DRN FROM MeterProfileReal WHERE DRN = ?', [drn]);
  return rows.length > 0;
}

// ── Writes ─────────────────────────────────────────────────────────────────

// Add (or re-activate) an association. `via` records how the right to the
// meter was proven: 'meter_button', 'admin', 'signup_meter_button'.
// Returns { created, reactivated, alreadyLinked, role }.
async function link(userId, drn, opts) {
  opts = opts || {};
  if (!DRN_RE.test(String(drn || ''))) throw httpError(400, 'A 13-digit meter number is required', 'INVALID_DRN');
  if (!opts.via) throw new Error('link() requires a verification method');
  if (!(await meterExists(drn))) throw httpError(404, 'Meter not found', 'METER_NOT_FOUND');

  return withTransaction(async function(tx) {
    // Lock the meter's association rows so the count and owner checks below
    // cannot race a concurrent link of the same meter.
    var rows = await tx('SELECT UserID, role, status FROM CustomerMeters WHERE DRN = ? FOR UPDATE', [drn]);
    var mine = rows.filter(function(r) { return String(r.UserID) === String(userId); })[0];
    var activeOthers = rows.filter(function(r) { return r.status === 'active' && String(r.UserID) !== String(userId); });

    if (mine && mine.status === 'active') {
      return { created: false, reactivated: false, alreadyLinked: true, role: mine.role };
    }
    if (activeOthers.length >= MAX_USERS_PER_METER) {
      throw httpError(409, 'This meter already has the maximum of ' + MAX_USERS_PER_METER + ' accounts', 'METER_FULL');
    }

    // Ownership: an admin may assign it explicitly; otherwise only the first
    // account on a meter with no other active accounts becomes owner.
    var hasOwner = activeOthers.some(function(r) { return r.role === 'owner'; });
    var role = 'member';
    if (opts.role === 'owner') {
      if (opts.via !== 'admin') throw new Error('Only an admin may assign ownership explicitly');
      if (hasOwner) throw httpError(409, 'This meter already has an owner', 'OWNER_EXISTS');
      role = 'owner';
    } else if (opts.via !== 'admin' && activeOthers.length === 0) {
      role = 'owner';
    }

    if (mine) {
      await tx("UPDATE CustomerMeters SET status = 'active', role = ?, revoked_at = NULL, verified_via = ?, created_by = ?, nickname = COALESCE(?, nickname) WHERE UserID = ? AND DRN = ?",
        [role, opts.via, opts.actor || null, opts.nickname || null, userId, drn]);
      invalidate(userId);
      return { created: false, reactivated: true, alreadyLinked: false, role: role };
    }
    await tx('INSERT INTO CustomerMeters (UserID, DRN, role, status, nickname, verified_via, created_by) VALUES (?, ?, ?, \'active\', ?, ?, ?)',
      [userId, drn, role, opts.nickname || null, opts.via, opts.actor || null]);
    invalidate(userId);
    return { created: true, reactivated: false, alreadyLinked: false, role: role };
  });
}

// Revoke an association. `actor` is either the account itself (leaving a
// meter), the meter's owner (removing a member), or an admin.
async function revoke(targetUserId, drn, actor) {
  var rows = await q("SELECT UserID, role FROM CustomerMeters WHERE DRN = ? AND status = 'active'", [drn]);
  var target = rows.filter(function(r) { return String(r.UserID) === String(targetUserId); })[0];
  if (!target) throw httpError(404, 'No active association for that meter', 'NOT_LINKED');

  if (actor.kind !== 'admin') {
    var self = String(actor.userId) === String(targetUserId);
    var actorRow = rows.filter(function(r) { return String(r.UserID) === String(actor.userId); })[0];
    var actorIsOwner = actorRow && actorRow.role === 'owner';
    if (!self && !actorIsOwner) throw httpError(403, 'Only the meter owner can remove another account', 'NOT_OWNER');
  }
  await q("UPDATE CustomerMeters SET status = 'revoked', revoked_at = NOW() WHERE UserID = ? AND DRN = ? AND status = 'active'",
    [targetUserId, drn]);
  invalidate(targetUserId);
  return { revoked: true };
}

async function setNickname(userId, drn, nickname) {
  var clean = nickname === null || nickname === undefined ? null : String(nickname).trim().slice(0, 64) || null;
  var r = await q("UPDATE CustomerMeters SET nickname = ? WHERE UserID = ? AND DRN = ? AND status = 'active'", [clean, userId, drn]);
  if (r.affectedRows === 0) throw httpError(404, 'No active association for that meter', 'NOT_LINKED');
  return { nickname: clean };
}

// Members of one meter, for its owner or an admin.
async function membersOfMeter(drn) {
  return q(
    "SELECT cm.UserID, su.Email, su.FirstName, su.LastName, cm.role, cm.verified_via, cm.created_at " +
    "FROM CustomerMeters cm JOIN SystemUsers su ON su.UserID = cm.UserID " +
    "WHERE cm.DRN = ? AND cm.status = 'active' ORDER BY cm.created_at", [drn]);
}

// Active users of a meter, for notification fan-out.
async function userIdsForMeter(drn) {
  var rows = await q("SELECT UserID FROM CustomerMeters WHERE DRN = ? AND status = 'active'", [drn]);
  return rows.map(function(r) { return r.UserID; });
}

function withTransaction(fn) {
  return new Promise(function(resolve, reject) {
    db.getConnection(function(err, conn) {
      if (err) return reject(err);
      function tx(sql, params) {
        return new Promise(function(res2, rej2) {
          conn.query(sql, params || [], function(e, rows) { if (e) rej2(e); else res2(rows); });
        });
      }
      conn.beginTransaction(function(bErr) {
        if (bErr) { conn.release(); return reject(bErr); }
        fn(tx).then(function(result) {
          conn.commit(function(cErr) {
            if (cErr) return conn.rollback(function() { conn.release(); reject(cErr); });
            conn.release();
            resolve(result);
          });
        }, function(fnErr) {
          conn.rollback(function() { conn.release(); reject(fnErr); });
        });
      });
    });
  });
}

module.exports = {
  DRN_RE: DRN_RE,
  MAX_USERS_PER_METER: MAX_USERS_PER_METER,
  authorizedDrns: authorizedDrns,
  isAuthorized: isAuthorized,
  listForUser: listForUser,
  meterExists: meterExists,
  link: link,
  revoke: revoke,
  setNickname: setNickname,
  membersOfMeter: membersOfMeter,
  userIdsForMeter: userIdsForMeter,
  invalidate: invalidate,
};
