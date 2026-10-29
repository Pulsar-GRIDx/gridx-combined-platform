// ═══════════════════════════════════════════════════════════════════════════
// METER OWNERSHIP — server-side meter isolation for every authenticated route
//
// authenticateToken()/hwAuth prove a token was signed by us; this decides
// what the holder may touch.
//
//   ADMIN     unchanged: operators act on any meter; requireAdmin/requireRole
//             still gate the admin-only routes.
//   CUSTOMER  default-deny. The request must match one of CUSTOMER_ROUTES
//             below, the token must not be revoked, and every meter the
//             request names (the route's own meter parameter, plus any DRN in
//             the query or a DRN-named body field) must be one of the
//             account's active CustomerMeters rows. A customer may therefore
//             use the meters it is linked to and nothing else, and it cannot
//             reach admin collection routes (meters-list, getAll, ...) at all.
//   METER     refused here. Meters authenticate to their own ingestion routes
//             (hardware/middleware/meterAuth.js), never to app/admin routes.
//   other     refused (fail closed).
//
// A DRN sent by the client is never proof of anything: it is only compared
// against the server's own association table.
// ═══════════════════════════════════════════════════════════════════════════

var tokens = require('./tokens');
var customerMeters = require('../services/customerMeterService');

var DRN_RE = /^\d{13}$/;
var D = '(\\d{13})';

// Every route the customer app uses. `drn` is the capture-group index of the
// meter the route acts on, or 0 when the route is account-scoped. Anything
// not listed is refused for customer tokens.
var CUSTOMER_ROUTES = [
  // live readings
  { m: 'GET', re: '^/(meterPower|meterEnergy|meterHeaterControl|meterLoadControl|meterHeaterState|meterMainsState|meterMainsControl)/getLastUpdate/' + D + '$', drn: 2 },
  { m: 'GET', re: '^/settings/tokenInformation/' + D + '$', drn: 1 },
  // geyser
  { m: 'GET|POST|PUT', re: '^/geyser/(control|status|timer|schedules|config)/' + D + '$', drn: 2 },
  { m: 'DELETE', re: '^/geyser/schedules/' + D + '/\\d+$', drn: 1 },
  // history
  { m: 'GET', re: '^/hourly-energy/' + D + '$', drn: 1 },
  { m: 'POST', re: '^/hourly-energy/' + D + '/request$', drn: 1 },
  // These read the meter from ?drn= (multi-meter app) or else the token.
  { m: 'GET', re: '^/(hourlyEnergyByDRN|weeklyTotalEnergyByDRN|monthlyEnergyByDRN)$', drn: 0, usesTokenDrn: true },
  // MQTT-backed meter features
  { m: 'GET', re: '^/mqtt/(auth-numbers|health|relay-logs|tou-config|net-energy)/' + D + '$', drn: 2 },
  { m: 'GET', re: '^/mqtt/net-energy/' + D + '/(summary|hourly|daily|history)$', drn: 1 },
  { m: 'POST', re: '^/mqtt/auth-numbers/' + D + '/(add|remove|sync)$', drn: 1 },
  { m: 'POST', re: '^/mqtt/relay-logs/' + D + '/request$', drn: 1 },
  { m: 'POST', re: '^/mqtt/(load-control|send-token|credit-transfer)/' + D + '$', drn: 2 },
  { m: 'GET', re: '^/mqtt/credit-transfer/' + D + '/status/[A-Za-z0-9_-]+$', drn: 1 },
  // The target is another customer's meter: only its existence is returned,
  // and naming it grants nothing else. The source meter is still checked.
  { m: 'GET', re: '^/mqtt/credit-transfer/' + D + '/validate-target/\\d{4,13}$', drn: 1 },
  // payments and tariffs
  { m: 'POST', re: '^/dpo/(create-payment|verify-payment)/' + D + '$', drn: 2 },
  { m: 'GET', re: '^/vending/(tariff-info|tariff-history|dsm)/' + D + '$', drn: 2 },
  { m: 'POST', re: '^/vending/token-preview$', drn: 0 },
  // account
  { m: 'GET|POST', re: '^/user-notifications/(unseen|ack)$', drn: 0 },
  { m: 'GET', re: '^/customer/(me|meters)$', drn: 0 },
  { m: 'POST', re: '^/customer/(logout|meters/link/request|meters/link/complete)$', drn: 0 },
  { m: 'GET', re: '^/customer/meters/link/status/[a-f0-9]{32}$', drn: 0 },
  { m: 'PATCH|DELETE', re: '^/customer/meters/' + D + '$', drn: 1 },
  { m: 'GET', re: '^/customer/meters/' + D + '/members$', drn: 1 },
  { m: 'DELETE', re: '^/customer/meters/' + D + '/members/\\d+$', drn: 1 },
].map(function(r) {
  return { methods: r.m.split('|'), re: new RegExp(r.re), drn: r.drn, usesTokenDrn: !!r.usesTokenDrn };
});

// Linking names a meter the account does not hold yet; that DRN is
// authorised by the link flow itself (meter-button proof), not here.
var LINK_PATHS = /^\/customer\/meters\/link\/(request|complete)$/;

// Body / query fields that name the caller's own meter. A credit-transfer
// recipient travels as `target_meter` and is deliberately not listed.
var OWN_DRN_FIELDS = ['drn', 'DRN', 'meterDRN', 'meterDrn', 'meter_drn', 'drns', 'DRNs'];

function appPath(req) {
  var p = (req.originalUrl || req.url || '').split('?')[0];
  try { p = decodeURI(p); } catch (e) { /* keep raw */ }
  p = p.replace(/\/+$/, '') || '/';
  return p.indexOf('/cb/') === 0 ? p.slice(3) : p;
}

function matchCustomerRoute(req) {
  var path = appPath(req);
  var method = (req.method || 'GET').toUpperCase();
  for (var i = 0; i < CUSTOMER_ROUTES.length; i++) {
    var r = CUSTOMER_ROUTES[i];
    if (r.methods.indexOf(method) === -1) continue;
    var m = r.re.exec(path);
    if (m) return { route: r, drn: r.drn ? m[r.drn] : null, path: path };
  }
  return null;
}

function pushDrns(out, value) {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) { value.forEach(function(v) { pushDrns(out, v); }); return; }
  var s = String(value).trim();
  if (s) out.push(s);
}

function bodyAndQueryDrns(req) {
  var out = [];
  [req.query, req.body].forEach(function(src) {
    if (!src || typeof src !== 'object') return;
    OWN_DRN_FIELDS.forEach(function(k) {
      if (Object.prototype.hasOwnProperty.call(src, k)) pushDrns(out, src[k]);
    });
  });
  return out;
}

// Every DRN a request refers to (path segments, query, DRN-named body fields).
function referencedDrns(req) {
  var out = [];
  appPath(req).split('/').forEach(function(seg) { if (DRN_RE.test(seg)) out.push(seg); });
  return out.concat(bodyAndQueryDrns(req));
}

var NOT_AUTHORISED = { status: 403, code: 'METER_NOT_AUTHORIZED', error: 'Forbidden — this account is not authorised for that meter' };

// Resolves to null when allowed, or { status, code, error } when refused.
// For an allowed customer it sets req.authorizedDrns and req.meterDrn.
async function checkOwnership(req, payload) {
  var k = tokens.kind(payload);
  if (k === 'admin') return null;
  if (k === 'meter' || k === 'legacy-meter') {
    return { status: 403, code: 'WRONG_TOKEN_KIND', error: 'Forbidden — meter credentials cannot be used for this resource' };
  }
  if (k !== 'customer') {
    return { status: 403, code: 'WRONG_TOKEN_KIND', error: 'Forbidden — unrecognised credentials' };
  }
  // A request may pass through authenticateToken more than once (router
  // level and route level); decide once per request.
  if (req._customerAuthz) return req._customerAuthz.refusal;
  var refusal = await decideCustomer(req, payload);
  req._customerAuthz = { refusal: refusal };
  return refusal;
}

async function decideCustomer(req, payload) {
  if (!(await tokens.customerTokenCurrent(payload))) {
    return { status: 401, code: 'TOKEN_REVOKED', error: 'Session has been revoked — please sign in again' };
  }
  var match = matchCustomerRoute(req);
  if (!match) {
    return { status: 403, code: 'CUSTOMER_ROUTE_FORBIDDEN', error: 'Forbidden — not available to customer accounts' };
  }

  var authorized = await customerMeters.authorizedDrns(payload.UserID);
  var named = match.drn ? [match.drn] : [];
  if (!LINK_PATHS.test(match.path)) named = named.concat(bodyAndQueryDrns(req));
  for (var i = 0; i < named.length; i++) {
    if (authorized.indexOf(named[i]) === -1) return NOT_AUTHORISED;
  }

  // Routes that act on "the token's meter" must not act on one the account
  // has since lost.
  var meterDrn = match.drn || null;
  if (match.route.usesTokenDrn) {
    var fromQuery = req.query && (req.query.drn || req.query.DRN);
    meterDrn = fromQuery ? String(fromQuery) : (payload.DRN ? String(payload.DRN) : null);
    if (!meterDrn || authorized.indexOf(meterDrn) === -1) return NOT_AUTHORISED;
  }

  req.authorizedDrns = authorized;
  req.meterDrn = meterDrn;
  return null;
}

module.exports = {
  checkOwnership: checkOwnership,
  matchCustomerRoute: matchCustomerRoute,
  referencedDrns: referencedDrns,
  tokenKind: tokens.kind,
  CUSTOMER_ROUTES: CUSTOMER_ROUTES,
};
