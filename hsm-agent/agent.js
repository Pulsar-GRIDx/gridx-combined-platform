/*
 * GRIDx local HSM agent.
 *
 * Runs on a factory PC that can reach the PrismToken HSM on the local LAN. It
 * dials OUT to the GridX cloud backend, asks for HSM work, runs it against the
 * HSM using the existing thriftHsmService, and posts the result back.
 *
 *     cloud backend  <--outbound https--  THIS AGENT  --local tls-->  HSM
 *
 * Consequences of that direction, which are the whole point:
 *   - the factory PC needs no inbound Internet access, no port forward, no
 *     static address and no hole in the firewall;
 *   - the HSM is never exposed to the Internet;
 *   - the cloud backend never holds HSM credentials - they live only here.
 *
 * The agent runs only the operations named in hsmAgentOps.ALLOWED. Nothing in
 * that list creates, replaces, clears or rotates a DITK, and none of it can
 * extract key material: the issue* calls ask the HSM to derive a token from a
 * key it already holds, and only the token comes back.
 *
 * Usage:
 *     node hsm-agent/agent.js
 *
 * Configuration comes from the environment, or from hsm-agent/agent.config.json
 * (gitignored) so that credentials are never committed:
 *
 *     GRIDX_URL         https://gridx-meters.com
 *     HSM_AGENT_TOKEN   shared secret, must match the backend
 *     HSM_HOST          192.168.0.201
 *     HSM_PORT          9443
 *     HSM_USERNAME      PrismToken API user
 *     HSM_PASSWORD      PrismToken API password
 *     HSM_REALM         local
 */
'use strict';

var fs = require('fs');
var path = require('path');
var https = require('https');
var http = require('http');
var url = require('url');

var svc = require('../backend/vending/thriftHsmService');
var OPS = require('../backend/vending/hsmAgentOps');

/* ------------------------------------------------------------------- config */

var cfgFile = path.join(__dirname, 'agent.config.json');
var fileCfg = {};
if (fs.existsSync(cfgFile)) {
  try {
    fileCfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
  } catch (e) {
    console.error('[agent] cannot parse agent.config.json: %s', e.message);
    process.exit(1);
  }
}

function cfg(envName, fileName, dflt) {
  if (process.env[envName] !== undefined && process.env[envName] !== '') return process.env[envName];
  if (fileCfg[fileName] !== undefined) return fileCfg[fileName];
  return dflt;
}

var GRIDX_URL   = String(cfg('GRIDX_URL', 'gridxUrl', 'https://gridx-meters.com')).replace(/\/+$/, '');
var AGENT_TOKEN = cfg('HSM_AGENT_TOKEN', 'agentToken', null);
var AGENT_NAME  = cfg('HSM_AGENT_NAME', 'agentName', 'factory-hsm-agent');
var HSM_HOST    = cfg('HSM_HOST', 'hsmHost', '192.168.0.201');
var HSM_PORT    = parseInt(cfg('HSM_PORT', 'hsmPort', 9443), 10);
var HSM_USER    = cfg('HSM_USERNAME', 'hsmUsername', null);
var HSM_PASS    = cfg('HSM_PASSWORD', 'hsmPassword', null);
var HSM_REALM   = cfg('HSM_REALM', 'hsmRealm', 'local');

var AGENT_VERSION = '1.0.0';

if (!AGENT_TOKEN) {
  console.error('[agent] HSM_AGENT_TOKEN is not set. Refusing to start.');
  console.error('[agent] Set it in the environment or hsm-agent/agent.config.json,');
  console.error('[agent] using the same value as HSM_AGENT_TOKEN on the backend.');
  process.exit(1);
}
if (!HSM_USER || !HSM_PASS) {
  console.error('[agent] HSM_USERNAME / HSM_PASSWORD are not set. Refusing to start.');
  process.exit(1);
}

/* Hand the HSM connection details to the existing service, unmodified. */
svc.thriftConfig.host = HSM_HOST;
svc.thriftConfig.port = HSM_PORT;
svc.thriftConfig.username = HSM_USER;
svc.thriftConfig.password = HSM_PASS;
svc.thriftConfig.realm = HSM_REALM;

/* --------------------------------------------------------------- http helper */

function post(pathname, body, cb) {
  request('POST', pathname, body, cb);
}

function request(method, pathname, body, cb) {
  var u = url.parse(GRIDX_URL + pathname);
  var lib = u.protocol === 'http:' ? http : https;
  var payload = body ? Buffer.from(JSON.stringify(body)) : null;

  var req = lib.request({
    protocol: u.protocol,
    hostname: u.hostname,
    port: u.port,
    path: u.path,
    method: method,
    headers: {
      'Authorization': 'Bearer ' + AGENT_TOKEN,
      'Content-Type': 'application/json',
      'Content-Length': payload ? payload.length : 0
    },
    /* Longer than the server's poll hold so the server, not us, ends an idle poll. */
    timeout: 60000
  }, function (res) {
    var chunks = [];
    res.on('data', function (d) { chunks.push(d); });
    res.on('end', function () {
      var text = Buffer.concat(chunks).toString('utf8');
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return cb(new Error('HTTP ' + res.statusCode + ': ' + text.slice(0, 200)));
      }
      try { cb(null, JSON.parse(text)); }
      catch (e) { cb(new Error('bad JSON from backend: ' + e.message)); }
    });
  });

  req.on('timeout', function () { req.destroy(new Error('request timed out')); });
  req.on('error', function (e) { cb(e); });
  if (payload) req.write(payload);
  req.end();
}

/* ------------------------------------------------------------- HSM execution */

/*
 * Map an allow-listed operation name onto the existing service. Arities differ
 * per call, so each is spelled out rather than applied dynamically - it keeps
 * the surface auditable at a glance.
 */
function runOperation(op, args, cb) {
  args = args || [];
  switch (op) {
    case 'connect':          return svc.connect(cb);
    case 'disconnect':       svc.disconnect(); return cb(null, { disconnected: true });
    case 'ping':             return svc.ping(cb);
    case 'signIn':           return svc.signIn(cb);
    case 'getStatus':        return svc.getStatus(cb);
    case 'checkConnection':  return svc.checkConnection(cb);

    case 'issueCreditToken':
      return svc.issueCreditToken(args[0], args[1], args[2], cb);
    case 'issueMseToken':
      return svc.issueMseToken(args[0], args[1], args[2], cb);
    case 'issueKeyChangeTokens':
      return svc.issueKeyChangeTokens(args[0], args[1], cb);
    case 'issueDitkChangeTokens':
      return svc.issueDitkChangeTokens(args[0], cb);
    case 'verifyToken':
      return svc.verifyToken(args[0], args[1], cb);
    case 'parseIdRecord':
      return svc.parseIdRecord(args[0], cb);

    default:
      return cb(new Error('unsupported operation: ' + op));
  }
}

/*
 * Make sure we have a live, authenticated session before running real work.
 * The HSM access token expires (300s by default), so this runs per job rather
 * than once at startup.
 */
function withSession(op, run) {
  /* These are the session primitives themselves - do not recurse into setup. */
  if (op === 'connect' || op === 'disconnect' || op === 'checkConnection') return run();

  if (!svc.thriftConfig.connected) {
    return svc.connect(function (err) {
      if (err) return run(err);
      svc.signIn(function (err2) { run(err2 || null); });
    });
  }
  svc.ensureAuthenticated(function (err) { run(err || null); });
}

function executeJob(job, done) {
  var started = Date.now();
  console.log('[agent] job %s: %s', job.id, OPS.describe(job.op, job.args));

  if (OPS.ALLOWED.indexOf(job.op) === -1) {
    /* The cloud should never send this; refuse loudly if it ever does. */
    console.warn('[agent] REFUSED disallowed operation "%s"', job.op);
    return done({ jobId: job.id, error: 'Operation not permitted by the local HSM agent: ' + job.op });
  }

  withSession(job.op, function (setupErr) {
    if (setupErr) {
      console.error('[agent] job %s session setup failed: %s', job.id, setupErr.message);
      return done({ jobId: job.id, error: setupErr.message });
    }
    var finished = false;
    try {
      runOperation(job.op, job.args, function (err, result) {
        if (finished) return;
        finished = true;
        var ms = Date.now() - started;
        if (err) {
          console.error('[agent] job %s FAILED after %dms: %s', job.id, ms, err.message);
          return done({ jobId: job.id, error: err.message });
        }
        console.log('[agent] job %s ok in %dms', job.id, ms);
        done({ jobId: job.id, result: result });
      });
    } catch (e) {
      if (finished) return;
      finished = true;
      console.error('[agent] job %s threw: %s', job.id, e.message);
      done({ jobId: job.id, error: e.message });
    }
  });
}

/* ----------------------------------------------------------------- main loop */

var stopping = false;
var backoff = 1000;
var MAX_BACKOFF = 30000;

function pollOnce() {
  if (stopping) return;

  var q = '?name=' + encodeURIComponent(AGENT_NAME) +
          '&version=' + encodeURIComponent(AGENT_VERSION) +
          '&hsmHost=' + encodeURIComponent(HSM_HOST + ':' + HSM_PORT);

  request('GET', '/cb/hsm-agent/poll' + q, null, function (err, body) {
    if (stopping) return;
    if (err) {
      console.error('[agent] poll failed: %s (retry in %dms)', err.message, backoff);
      setTimeout(pollOnce, backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF);
      return;
    }
    backoff = 1000;

    var jobs = (body && body.jobs) || [];
    if (!jobs.length) return pollOnce();

    var remaining = jobs.length;
    for (var i = 0; i < jobs.length; i++) {
      executeJob(jobs[i], function (payload) {
        post('/cb/hsm-agent/result', payload, function (e2) {
          if (e2) console.error('[agent] could not post result: %s', e2.message);
          remaining -= 1;
          if (remaining === 0) pollOnce();
        });
      });
    }
  });
}

function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log('[agent] shutting down...');
  post('/cb/hsm-agent/disconnect', {}, function () {
    try { svc.disconnect(); } catch (e) { /* already down */ }
    process.exit(0);
  });
  /* Do not hang forever if the backend is unreachable. */
  setTimeout(function () { process.exit(0); }, 5000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('===============================================');
console.log(' GRIDx local HSM agent v%s', AGENT_VERSION);
console.log('===============================================');
console.log('  name         : %s', AGENT_NAME);
console.log('  cloud        : %s', GRIDX_URL);
console.log('  HSM          : %s:%d (realm %s)', HSM_HOST, HSM_PORT, HSM_REALM);
console.log('  operations   : %s', OPS.ALLOWED.join(', '));
console.log('  direction    : outbound only - no inbound access to this PC');
console.log('');
pollOnce();
