/*
 * Chooses how this process reaches the PrismToken HSM.
 *
 *   HSM_MODE=agent   (default when HSM_AGENT_TOKEN is set)
 *       Operations are dispatched to the local HSM agent over an outbound
 *       channel the agent itself opens. Correct for the cloud backend, which
 *       has no route to the factory LAN.
 *
 *   HSM_MODE=direct  (default otherwise)
 *       The original thriftHsmService, connecting straight to the HSM. Correct
 *       when the backend itself runs inside the factory network, and the mode
 *       every existing script still uses.
 *
 * Both expose the identical function surface, so vendingRoutes.js required this
 * module instead of thriftHsmService and needed no other change. The working
 * Thrift implementation is untouched - in agent mode it simply runs on the
 * agent instead of here.
 */
'use strict';

var mode = process.env.HSM_MODE;

if (!mode) {
  mode = process.env.HSM_AGENT_TOKEN ? 'agent' : 'direct';
}

var impl;
if (mode === 'agent') {
  impl = require('./hsmAgentBridge');
  console.log('[HSM] mode=agent - HSM operations run on the local agent (no direct connection from here)');
} else {
  impl = require('./thriftHsmService');
  console.log('[HSM] mode=direct - connecting to the HSM from this process');
}

impl.hsmMode = mode;
module.exports = impl;
