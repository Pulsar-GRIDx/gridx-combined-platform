/*
 * One-time setup for the HSM agent channel.
 *
 *     node hsm-agent/setup.js
 *
 * Generates the shared secret that authenticates the agent to the GridX backend
 * and writes it to two gitignored files:
 *
 *     hsm-agent/agent.config.json   the agent reads this on the factory PC
 *     hsm-agent/SERVER_ENV.txt      the line to add to the backend environment
 *
 * The secret is never printed to the console and never committed. Only a short
 * fingerprint is shown, which is enough to confirm both ends carry the same
 * value without revealing it.
 *
 * This does not touch the HSM and has nothing to do with the DITK.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var CFG = path.join(__dirname, 'agent.config.json');
var ENVF = path.join(__dirname, 'SERVER_ENV.txt');

function fingerprint(secret) {
  return crypto.createHash('sha256').update(secret).digest('hex').slice(0, 12).toUpperCase();
}

var existing = null;
if (fs.existsSync(CFG)) {
  try { existing = JSON.parse(fs.readFileSync(CFG, 'utf8')); } catch (e) { existing = null; }
}

if (existing && existing.agentToken) {
  console.log('  agent.config.json already exists - keeping the existing token.');
  console.log('  token fingerprint : %s', fingerprint(existing.agentToken));
  console.log('  (delete the file and re-run to rotate it)');
  process.exit(0);
}

/* 32 bytes of CSPRNG output, base64url - no ambiguous characters to transcribe. */
var token = crypto.randomBytes(32).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

var cfg = {
  _comment: 'Local HSM agent config. NEVER commit this file. HSM credentials are read from here or from the environment.',
  gridxUrl: 'https://gridx-meters.com',
  agentToken: token,
  agentName: 'factory-hsm-agent',
  hsmHost: '192.168.0.201',
  hsmPort: 9443,
  hsmRealm: 'local',
  hsmUsername: '<< set this to the PrismToken API username >>',
  hsmPassword: '<< set this to the PrismToken API password >>'
};

fs.writeFileSync(CFG, JSON.stringify(cfg, null, 2), 'utf8');
fs.writeFileSync(ENVF,
  '# Add this to the GridX backend environment (e.g. backend/.env), then restart the backend.\n' +
  '# Keep this file out of git and delete it once the value is in place.\n' +
  'HSM_AGENT_TOKEN=' + token + '\n', 'utf8');

console.log('  generated a new agent token.');
console.log('');
console.log('  token fingerprint : %s', fingerprint(token));
console.log('  agent config      : %s', CFG);
console.log('  backend env line  : %s', ENVF);
console.log('');
console.log('  Next:');
console.log('    1. Open agent.config.json and fill in hsmUsername / hsmPassword.');
console.log('    2. Copy the HSM_AGENT_TOKEN line from SERVER_ENV.txt into the backend env.');
console.log('    3. Restart the backend, then run: node hsm-agent/agent.js');
console.log('');
console.log('  The secret itself was not printed. Both ends match if the fingerprint above');
console.log('  equals the one reported by the backend at startup.');
