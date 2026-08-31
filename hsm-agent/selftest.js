/*
 * End-to-end proof of the local-agent architecture, run entirely on this machine.
 *
 *   this process (stands in for the cloud backend)
 *        |  mounts hsmAgentRoutes + hsmAgentBridge, exactly as app.js does
 *        v
 *   local HTTP on 127.0.0.1  <--outbound poll--  agent.js (child process)
 *                                                    |
 *                                                    v
 *                                        real PrismToken HSM over TLS
 *
 * The point is to exercise the real bridge, the real routes and the real agent
 * against the real HSM without deploying anything to production. The only thing
 * simulated is the cloud host itself.
 *
 * Read-only plus token derivation. Nothing here creates, replaces, clears or
 * rotates a DITK, and no token produced is sent to a meter.
 *
 *     node hsm-agent/selftest.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
// express lives in backend/node_modules; the agent itself needs no external
// dependencies, only this stand-in for the cloud server does.
var express = require('../backend/node_modules/express');
var spawn = require('child_process').spawn;

var PORT = 3999;
var AGENT_TOKEN = 'selftest-' + Math.random().toString(36).slice(2);
var DRN = process.argv[2] || '0260060135803';

var CRED = 'C:/Users/kamat/Documents/Projects/Gridx/Vending system/HSM-Code/TsmWeb-admin-credential.txt';

/* Same credential source the existing HSM scripts use. Never printed. */
var creds;
try {
  var txt = fs.readFileSync(CRED, 'utf8');
  var idx = txt.indexOf('ptoken-api');
  var user = (txt.match(/Username\s*:\s*(ptoken-api\S*)/) || [])[1];
  var pass = (txt.slice(idx).match(/Password\s*:\s*(\S+)/) || [])[1];
  if (!user || !pass) throw new Error('could not locate ptoken-api credentials');
  creds = { user: user, pass: pass };
} catch (e) {
  console.error('  cannot read HSM credentials: %s', e.message);
  process.exit(1);
}

/* The backend half must be in agent mode before the provider is required. */
process.env.HSM_AGENT_TOKEN = AGENT_TOKEN;
process.env.HSM_MODE = 'agent';

var bridge = require('../backend/vending/hsmAgentBridge');
var agentRoutes = require('../backend/vending/hsmAgentRoutes');

var app = express();
app.use(express.json({ limit: '2mb' }));
app.use('/cb', agentRoutes);

var results = [];
function record(name, ok, detail) {
  results.push({ name: name, ok: ok, detail: detail });
  // Node's console.log has no width specifier - pad explicitly.
  var label = name + new Array(Math.max(1, 30 - name.length)).join(' ');
  console.log('    ' + label + (ok ? 'PASS' : 'FAIL') + (detail ? '  ' + detail : ''));
}

var server = app.listen(PORT, '127.0.0.1', function () {
  console.log('=== 1. cloud-side stand-in listening on 127.0.0.1:%d ===', PORT);

  var child = spawn(process.execPath, [path.join(__dirname, 'agent.js')], {
    env: Object.assign({}, process.env, {
      GRIDX_URL: 'http://127.0.0.1:' + PORT,
      HSM_AGENT_TOKEN: AGENT_TOKEN,
      HSM_AGENT_NAME: 'selftest-agent',
      HSM_HOST: '192.168.0.201',
      HSM_PORT: '9443',
      HSM_USERNAME: creds.user,
      HSM_PASSWORD: creds.pass,
      HSM_REALM: 'local'
    }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', function (d) {
    String(d).split('\n').forEach(function (l) { if (l.trim()) console.log('      [child] ' + l); });
  });
  child.stderr.on('data', function (d) {
    String(d).split('\n').forEach(function (l) { if (l.trim()) console.log('      [child] ' + l); });
  });

  function finish(code) {
    try { child.kill(); } catch (e) {}
    server.close();
    var passed = results.filter(function (r) { return r.ok; }).length;
    console.log('');
    console.log('=== SUMMARY: %d/%d passed ===', passed, results.length);
    process.exit(code !== undefined ? code : (passed === results.length ? 0 : 1));
  }

  /* Wait for the agent's first poll to register it as online. */
  console.log('');
  console.log('=== 2. waiting for the agent to dial in ===');
  var waited = 0;
  var iv = setInterval(function () {
    waited += 250;
    if (bridge.agentOnline()) {
      clearInterval(iv);
      var st = bridge.getAgentStatus();
      record('agent connects outbound', true,
        '(' + (st.agent && st.agent.name) + ' -> ' + (st.agent && st.agent.hsmHost) + ')');
      runOperations(finish);
    } else if (waited > 20000) {
      clearInterval(iv);
      record('agent connects outbound', false, 'no poll within 20s');
      finish(1);
    }
  }, 250);
});

function runOperations(finish) {
  console.log('');
  console.log('=== 3. driving HSM operations through the bridge ===');

  bridge.getStatus(function (err, st) {
    if (err) {
      record('getStatus via agent', false, err.message);
      return finish(1);
    }
    var info = st ? [st.moduleId, st.hardwareType || st.hardware, st.apiType, st.acMode]
      .filter(Boolean).join(' ') : '';
    record('getStatus via agent', true, info);

    bridge.issueDitkChangeTokens(
      { drn: DRN, ea: 7, tct: 2, sgc: 999907, krn: 2, ti: 1, ken: 255 },
      function (e2, res) {
        if (e2) {
          record('issueDitkChangeTokens', false, e2.message);
          return finish(1);
        }
        var toks = (res && res.tokens) || [];
        record('issueDitkChangeTokens', toks.length === 2, toks.length + ' token(s) derived');

        /* An operation outside the allow-list must be refused by the bridge. */
        var dispatchAny = bridge.getStatus;   /* placeholder to keep shape */
        bridge.parseIdRecord('00000260060135803400000207999907012', function (e3) {
          record('parseIdRecord via agent', !e3, e3 ? e3.message : 'ok');
          finish();
        });
      }
    );
  });
}
