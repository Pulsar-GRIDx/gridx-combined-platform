// ═══════════════════════════════════════════════════════════════════════════
// METER OWNERSHIP — server-side DRN isolation for every authenticated route
//
// authenticateToken() proves a token was signed by us; this decides what the
// holder may touch. It runs right after signature verification, so every
// route behind authenticateToken (the global router.use in adminAuthRoutes
// and the per-route uses) is covered without each handler re-implementing it.
//
// Token kinds (all signed with SECRET_KEY):
//   - CUSTOMER  { UserID, Email, DRN, role:'CUSTOMER' }  (customerService.js)
//       May only reference its own DRN. Every 13-digit DRN found in the URL
//       path, query string or a DRN-named body field must equal the token's
//       DRN, so changing the DRN in a request returns 403 instead of another
//       customer's data or control.
//   - ADMIN     { Admin_ID, Email, AccessLevel, access_type } (adminService.js)
//       Unchanged: operators act on any meter; requireAdmin/requireRole still
//       gate the admin-only routes.
//   - METER     { drn|meterDRN, type:'meter'|'meter-web' } (meterTokenRoutes.js)
//       Refused here. Meters post to the root-mounted hardware routes (hwAuth),
//       never to these app/admin routes, and /meters/getAccessToken currently
//       issues such tokens to anyone - they must not open customer data.
//   - anything else: refused (fail closed).
//
// The DRN is never taken from the client as proof of anything: the client's
// DRN is only compared against the DRN inside the verified token.
// ═══════════════════════════════════════════════════════════════════════════

var DRN_RE = /^\d{13}$/;

// Body / query fields that name the caller's own meter.
var OWN_DRN_FIELDS = ['drn', 'DRN', 'meterDRN', 'meterDrn', 'meter_drn', 'drns', 'DRNs'];

// Fields that legitimately name ANOTHER meter: the recipient of a credit
// transfer (routes/mqttRoutes.js). Ownership of the source is enforced by the
// route's :drn path parameter, which is still checked.
var OTHER_METER_BODY_FIELDS = ['target_meter'];
var OTHER_METER_PATH_MARKERS = ['validate-target'];

function tokenKind(payload) {
  if (!payload || typeof payload !== 'object') return 'unknown';
  if (payload.type === 'meter' || payload.type === 'meter-web') return 'meter';
  if (payload.role === 'CUSTOMER') return 'customer';
  if (payload.Admin_ID !== undefined || payload.AccessLevel !== undefined) return 'admin';
  return 'unknown';
}

function pushDrns(out, value) {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach(function(v) { pushDrns(out, v); });
    return;
  }
  var s = String(value).trim();
  if (s) out.push(s);
}

// Every DRN the request refers to, excluding the explicitly allowed
// "other meter" fields.
function referencedDrns(req) {
  var out = [];
  var path = (req.originalUrl || req.url || '').split('?')[0];
  var segments = path.split('/').map(function(s) {
    try { return decodeURIComponent(s); } catch (e) { return s; }
  });
  for (var i = 0; i < segments.length; i++) {
    if (!DRN_RE.test(segments[i])) continue;
    if (i > 0 && OTHER_METER_PATH_MARKERS.indexOf(segments[i - 1]) !== -1) continue;
    out.push(segments[i]);
  }
  [req.query, req.body].forEach(function(src) {
    if (!src || typeof src !== 'object') return;
    OWN_DRN_FIELDS.forEach(function(k) {
      if (Object.prototype.hasOwnProperty.call(src, k)) pushDrns(out, src[k]);
    });
  });
  return out;
}

// Returns null when allowed, or { status, error } when refused.
function checkOwnership(req, payload) {
  var kind = tokenKind(payload);
  if (kind === 'admin') return null;
  if (kind === 'meter') {
    return { status: 403, error: 'Forbidden — meter credentials cannot be used for this resource' };
  }
  if (kind !== 'customer') {
    return { status: 403, error: 'Forbidden — unrecognised credentials' };
  }
  var own = payload.DRN ? String(payload.DRN).trim() : '';
  var drns = referencedDrns(req);
  for (var i = 0; i < drns.length; i++) {
    if (!own || drns[i] !== own) {
      // Same response whether or not the other meter exists: nothing about
      // it is revealed.
      return { status: 403, error: 'Forbidden — this account is not authorised for that meter' };
    }
  }
  return null;
}

module.exports = {
  checkOwnership: checkOwnership,
  referencedDrns: referencedDrns,
  tokenKind: tokenKind,
  OTHER_METER_BODY_FIELDS: OTHER_METER_BODY_FIELDS
};
