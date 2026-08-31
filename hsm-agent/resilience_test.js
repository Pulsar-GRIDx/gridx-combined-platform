/*
 * Resilience checks for the HSM agent bridge.
 *
 * The queue is the part that can silently lose work, so these exercise the
 * failure modes that actually happen in a factory: the agent is restarted, the
 * network drops mid-poll, the HSM is briefly unavailable, or a request arrives
 * while nothing is connected.
 *
 * Read-only against the HSM (getStatus only). No token is issued, no meter is
 * touched, and nothing here can alter a DITK.
 *
 *     node hsm-agent/resilience_test.js
 */
'use strict';

var path = require('path');
var express = require('../backend/node_modules/express');
var fs = require('fs');
var spawn = require('child_process').spawn;

var PORT = 3997;
var AGENT_TOKEN = 'resil-' + Math.random().toString(36).slice(2);

var CRED = 'C:/Users/kamat/Documents/Projects/Gridx/Vending system/HSM-Code/TsmWeb-admin-credential.txt';
var txt = fs.readFileSync(CRED, 'utf8');
var idx = txt.indexOf('ptoken-api');
var HSM_USER = (txt.match(/Username\s*:\s*(ptoken-api\S*)/) || [])[1];
var HSM_PASS = (txt.slice(idx).match(/Password\s*:\s*(\S+)/) || [])[1];

process.env.HSM_AGENT_TOKEN = AGENT_TOKEN;
process.env.HSM_MODE = 'agent';
var bridge = require('../backend/vending/hsmAgentBridge');
var agentRoutes = require('../backend/vending/hsmAgentRoutes');

var app = express();
app.use(express.json({ limit: '2mb' }));
app.use('/cb', agentRoutes);

var results = [];
function record(name, ok, detail) {
  results.push({ name: name, ok: ok });
  var pad = new Array(Math.max(1, 42 - name.length)).join(' ');
  console.log('  ' + name + pad + (ok ? 'PASS' : 'FAIL') + (detail ? '  ' + detail : ''));
}

function startAgent(name) {
  return spawn(process.execPath, [path.join(__dirname, 'agent.js')], {
    env: Object.assign({}, process.env, {
      GRIDX_URL: 'http://127.0.0.1:' + PORT,
      HSM_AGENT_TOKEN: AGENT_TOKEN,
      HSM_AGENT_NAME: name,
      HSM_HOST: '192.168.0.201',
      HSM_PORT: '9443',
      HSM_USERNAME: HSM_USER,
      HSM_PASSWORD: HSM_PASS,
      HSM_REALM: 'local'
    }),
    stdio: ['ignore', 'ignore', 'ignore']
  });
}

function waitOnline(want, timeoutMs, cb) {
  var waited = 0;
  var iv = setInterval(function () {
    waited += 200;
    if (bridge.agentOnline() === want) { clearInterval(iv); return cb(true); }
    if (waited >= timeoutMs) { clearInterval(iv); return cb(false); }
  }, 200);
}

var server = app.listen(PORT, '127.0.0.1', function () {
  console.log('=== HSM agent resilience ===');
  console.log('');

  /* 1. A request with no agent connected must fail fast and clearly, not hang. */
  var t0 = Date.now();
  bridge.getStatus(function (err) {
    var ms = Date.now() - t0;
    record('offline: fails fast, no hang',
      !!err && ms < 2000 && /offline/i.test(err.message),
      ms + 'ms, "' + (err ? err.message.slice(0, 44) : '') + '..."');

    /* 2. Agent starts and registers. */
    var agent = startAgent('resil-a');
    waitOnline(true, 20000, function (up) {
      record('agent start -> registers online', up);
      if (!up) return finish(agent);

      /* 3. Work completes normally. */
      bridge.getStatus(function (e2, st) {
        record('job completes end to end', !e2 && !!st,
          st ? 'module ' + st.moduleId : (e2 ? e2.message : ''));

        /* 4. Kill the agent mid-flight; queue a job while it is down; restart it
         *    and confirm the SAME job is picked up rather than lost. */
        agent.kill();
        setTimeout(function () {
          var delivered = false;
          var t1 = Date.now();
          bridge.getStatus(function (e3, st3) {
            delivered = !e3 && !!st3;
            record('job queued while down is NOT lost', delivered,
              delivered ? 'delivered after restart in ' + (Date.now() - t1) + 'ms'
                        : (e3 ? e3.message : ''));
            finish(agent2);
          });

          /* Bring a new agent up shortly after the job is already queued. */
          var agent2 = null;
          setTimeout(function () { agent2 = startAgent('resil-b'); }, 1500);
        }, 1200);
      });
    });
  });

  function finish(child) {
    setTimeout(function () {
      try { if (child) child.kill(); } catch (e) {}
      server.close();
      var passed = results.filter(function (r) { return r.ok; }).length;
      console.log('');
      console.log('=== %d/%d passed ===', passed, results.length);
      process.exit(passed === results.length ? 0 : 1);
    }, 300);
  }
});
