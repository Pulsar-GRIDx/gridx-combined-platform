/*
 * Convenience launcher: starts agent.js with the PrismToken credentials taken
 * from the existing TsmWeb credential file, so they are not duplicated into
 * agent.config.json. Everything else (cloud URL, agent token) comes from
 * agent.config.json as normal.
 *
 * The credentials are passed to the child through its environment and are never
 * printed or written anywhere.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var spawn = require('child_process').spawn;

var CRED = 'C:/Users/kamat/Documents/Projects/Gridx/Vending system/HSM-Code/TsmWeb-admin-credential.txt';
var txt = fs.readFileSync(CRED, 'utf8');
var i = txt.indexOf('ptoken-api');
var user = (txt.match(/Username\s*:\s*(ptoken-api\S*)/) || [])[1];
var pass = (txt.slice(i).match(/Password\s*:\s*(\S+)/) || [])[1];
if (!user || !pass) { console.error('  could not read PrismToken credentials'); process.exit(1); }

var child = spawn(process.execPath, [path.join(__dirname, 'agent.js')], {
  env: Object.assign({}, process.env, { HSM_USERNAME: user, HSM_PASSWORD: pass }),
  stdio: 'inherit'
});
process.on('SIGINT', function () { child.kill(); process.exit(0); });
child.on('exit', function (c) { process.exit(c || 0); });
