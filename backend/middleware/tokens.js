// ═══════════════════════════════════════════════════════════════════════════
// TOKENS — the three identities the backend issues, kept apart
//
//   customer  { typ:'customer', role:'CUSTOMER', UserID, Email, DRN, tv }
//   meter     { typ:'meter', type:'meter', drn, mv }
//   admin     { Admin_ID, AccessLevel, ... }        (admin/adminService.js)
//
// All are signed with SECRET_KEY. There is deliberately no fallback secret:
// a fallback compiled into the source lets anyone who reads the repository
// mint tokens if the variable is ever missing.
//
// `tv` / `mv` are revocation counters. A token is rejected once the
// account's SystemUsers.token_version (or the meter's
// MeterDeviceKeys.token_version) moves past the value it was issued with.
// Tokens issued before this change carry no counter and are treated as 0,
// so they stay valid until they expire unless the account is revoked.
// ═══════════════════════════════════════════════════════════════════════════

var jwt = require('jsonwebtoken');
var db = require('../config/db');

var CUSTOMER_TTL = '24h';
var METER_TTL = '30d';

function secret() {
  var s = process.env.SECRET_KEY;
  if (!s) throw new Error('SECRET_KEY is not configured');
  return s;
}

function kind(payload) {
  if (!payload || typeof payload !== 'object') return 'unknown';
  if (payload.typ === 'customer') return 'customer';
  if (payload.typ === 'meter') return 'meter';
  // Tokens issued before `typ` existed.
  if (payload.type === 'meter' || payload.type === 'meter-web') return 'legacy-meter';
  if (payload.role === 'CUSTOMER' && payload.UserID !== undefined) return 'customer';
  if (payload.Admin_ID !== undefined && payload.AccessLevel !== undefined && payload.role !== 'CUSTOMER') return 'admin';
  return 'unknown';
}

function signCustomer(user, primaryDrn, tokenVersion) {
  return jwt.sign({
    typ: 'customer',
    role: 'CUSTOMER',
    UserID: user.UserID,
    Email: user.Email,
    // Kept for app builds that read the meter from the token. It names the
    // account's first meter and grants nothing by itself: access is decided
    // from CustomerMeters on every request.
    DRN: primaryDrn || null,
    tv: tokenVersion || 0,
  }, secret(), { expiresIn: CUSTOMER_TTL });
}

function signMeter(drn, meterVersion) {
  return jwt.sign({ typ: 'meter', type: 'meter', drn: String(drn), mv: meterVersion || 0 }, secret(), { expiresIn: METER_TTL });
}

function verify(token) {
  return jwt.verify(token, secret());
}

function bearer(req) {
  var h = req.headers && req.headers.authorization;
  if (!h || typeof h !== 'string' || h.indexOf('Bearer ') !== 0) return null;
  var t = h.slice(7).trim();
  return t.length >= 10 ? t : null;
}

// ── Revocation counters ────────────────────────────────────────────────────
var VERSION_TTL_MS = 10 * 1000;
var versionCache = new Map();

function readVersion(key, sql, id) {
  var hit = versionCache.get(key);
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.v);
  return new Promise(function(resolve, reject) {
    db.query(sql, [id], function(err, rows) {
      if (err) {
        // A schema without the column yet (migration not run) must not lock
        // everybody out; report it and treat as 0.
        if (err.code === 'ER_BAD_FIELD_ERROR' || err.code === 'ER_NO_SUCH_TABLE') return resolve(0);
        return reject(err);
      }
      var v = rows && rows[0] ? Number(rows[0].v) || 0 : null;
      versionCache.set(key, { v: v, expires: Date.now() + VERSION_TTL_MS });
      resolve(v);
    });
  });
}

// Resolves to true when the token is still current.
async function customerTokenCurrent(payload) {
  var v = await readVersion('u:' + payload.UserID, 'SELECT token_version AS v FROM SystemUsers WHERE UserID = ?', payload.UserID);
  if (v === null) return false; // account deleted
  return (payload.tv || 0) >= v;
}

async function meterTokenCurrent(payload) {
  var v = await readVersion('m:' + payload.drn, 'SELECT token_version AS v FROM MeterDeviceKeys WHERE DRN = ? AND public_key_der_b64 IS NOT NULL', payload.drn);
  if (v === null) return false; // no pinned identity
  return (payload.mv || 0) >= v;
}

function revokeCustomerTokens(userId) {
  versionCache.delete('u:' + userId);
  return new Promise(function(resolve, reject) {
    db.query('UPDATE SystemUsers SET token_version = token_version + 1 WHERE UserID = ?', [userId], function(err) {
      versionCache.delete('u:' + userId);
      if (err) reject(err); else resolve();
    });
  });
}

// Called whenever a meter's pinned identity changes.
function invalidateMeter(drn) {
  versionCache.delete('m:' + drn);
}

function currentCustomerVersion(userId) {
  versionCache.delete('u:' + userId);
  return readVersion('u:' + userId, 'SELECT token_version AS v FROM SystemUsers WHERE UserID = ?', userId)
    .then(function(v) { return v || 0; });
}

module.exports = {
  kind: kind,
  signCustomer: signCustomer,
  signMeter: signMeter,
  verify: verify,
  bearer: bearer,
  customerTokenCurrent: customerTokenCurrent,
  meterTokenCurrent: meterTokenCurrent,
  revokeCustomerTokens: revokeCustomerTokens,
  currentCustomerVersion: currentCustomerVersion,
  invalidateMeter: invalidateMeter,
  _clearCache: function() { versionCache.clear(); },
};
