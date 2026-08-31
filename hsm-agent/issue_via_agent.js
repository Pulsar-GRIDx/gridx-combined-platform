/*
 * Issue key-change tokens the way the deployed platform will: the request goes
 * through the cloud-side bridge, out to the local agent, and only the agent
 * touches the HSM.
 *
 *     node hsm-agent/issue_via_agent.js ditk <DRN> [SGC] [KRN] [TI]
 *     node hsm-agent/issue_via_agent.js keychange <DRN> <toSGC> <toKRN> <toTI>
 *
 * This is the same path vendingRoutes.js takes in agent mode - it exercises the
 * bridge, the agent routes and the agent, rather than calling thriftHsmService
 * directly. The tokens are written to a file so they can be delivered to a meter
 * separately.
 *
 * Tokens are not secret key material: each is bound to one meter and consumed
 * once. Keys, components and credentials are never printed.
 *
 * Nothing here creates, replaces, clears or rotates a DITK. issueDitkChangeTokens
 * asks the HSM to DERIVE a token pair from the DITK it already holds.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var express = require('../backend/node_modules/express');
var spawn = require('child_process').spawn;

var MODE = process.argv[2] || 'ditk';
var DRN = process.argv[3] || '0260060135803';
var A = process.argv[4], B = process.argv[5], C = process.argv[6];

var PORT = 3998;
var AGENT_TOKEN = 'issue-' + Math.random().toString(36).slice(2);
var OUT = path.join(__dirname, 'last_tokens.json');

var CRED = 'C:/Users/kamat/Documents/Projects/Gridx/Vending system/HSM-Code/TsmWeb-admin-credential.txt';
var creds;
try {
  var txt = fs.readFileSync(CRED, 'utf8');
  var idx = txt.indexOf('ptoken-api');
  creds = {
    user: (txt.match(/Username\s*:\s*(ptoken-api\S*)/) || [])[1],
    pass: (txt.slice(idx).match(/Password\s*:\s*(\S+)/) || [])[1]
  };
  if (!creds.user || !creds.pass) throw new Error('ptoken-api credentials not found');
} catch (e) {
  console.error('  cannot read HSM credentials: %s', e.message);
  process.exit(1);
}

process.env.HSM_AGENT_TOKEN = AGENT_TOKEN;
process.env.HSM_MODE = 'agent';

var bridge = require('../backend/vending/hsmAgentBridge');
var agentRoutes = require('../backend/vending/hsmAgentRoutes');

var app = express();
app.use(express.json({ limit: '2mb' }));
app.use('/cb', agentRoutes);

var server = app.listen(PORT, '127.0.0.1', function () {
  var child = spawn(process.execPath, [path.join(__dirname, 'agent.js')], {
    env: Object.assign({}, process.env, {
      GRIDX_URL: 'http://127.0.0.1:' + PORT,
      HSM_AGENT_TOKEN: AGENT_TOKEN,
      HSM_AGENT_NAME: 'issue-agent',
      HSM_HOST: '192.168.0.201',
      HSM_PORT: '9443',
      HSM_USERNAME: creds.user,
      HSM_PASSWORD: creds.pass,
      HSM_REALM: 'local'
    }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', function (d) {
    String(d).split('\n').forEach(function (l) {
      if (l.trim() && l.indexOf('[ThriftHSM]') !== -1) console.log('      ' + l.trim());
    });
  });
  child.stderr.on('data', function () {});

  function done(code) {
    try { child.kill(); } catch (e) {}
    server.close();
    process.exit(code || 0);
  }

  var waited = 0;
  var iv = setInterval(function () {
    waited += 250;
    if (bridge.agentOnline()) {
      clearInterval(iv);
      console.log('  agent online via outbound poll; issuing through the bridge...');
      issue(done);
    } else if (waited > 20000) {
      clearInterval(iv);
      console.error('  agent did not come online');
      done(1);
    }
  }, 250);
});

function report(err, res, done) {
  if (err) {
    console.error('  FAILED: %s', err.message);
    return done(1);
  }
  var toks = (res && res.tokens) || [];
  console.log('');
  console.log('  issued %d token(s) for DRN %s', toks.length, DRN);
  var out = [];
  for (var i = 0; i < toks.length; i++) {
    var t = toks[i];
    var dec = String(t.tokenDec || '').replace(/\D/g, '');
    var nc = t.newConfig || {};
    console.log('    %d. %s  %s', i + 1, dec, t.description || '');
    console.log('       -> SGC %s KRN %s TI %s KEN %s',
      nc.toSgc, nc.toKrn, nc.toTi, nc.toKen);
    out.push({ order: i + 1, tokenDec: dec, description: t.description, newConfig: nc });
  }
  fs.writeFileSync(OUT, JSON.stringify({ drn: DRN, mode: MODE, tokens: out }, null, 2), 'utf8');
  console.log('');
  console.log('  written to %s', OUT);
  done(0);
}

function issue(done) {
  var mc = {
    drn: DRN, ea: 7, tct: 2,
    sgc: parseInt(A || 999907, 10),
    krn: parseInt(B || 2, 10),
    ti: parseInt(C || 1, 10),
    ken: 255
  };
  if (MODE === 'ditk') {
    bridge.issueDitkChangeTokens(mc, function (e, r) { report(e, r, done); });
  } else {
    var cur = { drn: DRN, ea: 7, tct: 2, sgc: 999907, krn: 2, ti: 1, ken: 255 };
    var next = { toSgc: parseInt(A, 10), toKrn: parseInt(B, 10), toTi: parseInt(C, 10), toKen: 255 };
    bridge.issueKeyChangeTokens(cur, next, function (e, r) { report(e, r, done); });
  }
}
