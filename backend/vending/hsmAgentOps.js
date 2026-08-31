/*
 * The exact set of HSM operations GridX is allowed to ask the local agent to
 * perform. Shared by both halves of the bridge on purpose:
 *
 *   - the cloud bridge checks it so a bad call fails before it leaves the server;
 *   - the agent checks it again so a compromised cloud backend still cannot ask
 *     the HSM to do anything outside this list.
 *
 * The agent is NOT a generic Thrift proxy. Anything absent here is unreachable
 * from the Internet side, which is the point.
 *
 * Note what is deliberately missing: there is no operation that creates,
 * replaces, clears or rotates a DITK, and none that reads key material. The
 * issue* calls ask the HSM to DERIVE a token from a key it already holds; the
 * key never leaves the module.
 */
'use strict';

var ALLOWED = [
  /* session / health - no key material involved */
  'connect',
  'disconnect',
  'ping',
  'signIn',
  'getStatus',
  'checkConnection',

  /* token derivation - reads keys inside the HSM, returns tokens only */
  'issueCreditToken',
  'issueMseToken',
  'issueKeyChangeTokens',
  'issueDitkChangeTokens',

  /* read-only helpers */
  'verifyToken',
  'parseIdRecord'
];

/*
 * Field names that must never reach a log line or an audit record, at any
 * nesting depth. Tokens themselves are fine - they are meter-bound and
 * single-use - but keys, components and credentials are not.
 */
var SECRET_FIELDS = [
  'password', 'passwd', 'pass', 'secret', 'accessToken', 'token',
  'key', 'decoderKey', 'ditk', 'ddtk', 'dutk', 'dctk',
  'keyComponent', 'component', 'kcv0', 'vk', 'vendingKey'
];

function isSecretField(name) {
  var lower = String(name).toLowerCase();
  for (var i = 0; i < SECRET_FIELDS.length; i++) {
    if (lower === SECRET_FIELDS[i].toLowerCase()) return true;
  }
  return false;
}

/*
 * Deep copy with secret-looking fields replaced. Used for every log line and
 * audit entry on both sides.
 *
 * Errs toward redacting: an over-redacted log is an inconvenience, a leaked key
 * component is a re-provisioning exercise.
 */
function redact(value, depth) {
  depth = depth || 0;
  if (depth > 6 || value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    var arr = [];
    for (var i = 0; i < value.length; i++) arr.push(redact(value[i], depth + 1));
    return arr;
  }
  if (typeof value === 'object') {
    var out = {};
    var keys = Object.keys(value);
    for (var k = 0; k < keys.length; k++) {
      out[keys[k]] = isSecretField(keys[k]) ? '[redacted]' : redact(value[keys[k]], depth + 1);
    }
    return out;
  }
  return value;
}

/* One-line summary safe to print. */
function describe(op, args) {
  var safe = redact(args || []);
  var s;
  try { s = JSON.stringify(safe); } catch (e) { s = '[unserialisable]'; }
  if (s && s.length > 300) s = s.slice(0, 300) + '...';
  return op + ' ' + s;
}

module.exports = {
  ALLOWED: ALLOWED,
  SECRET_FIELDS: SECRET_FIELDS,
  isSecretField: isSecretField,
  redact: redact,
  describe: describe
};
