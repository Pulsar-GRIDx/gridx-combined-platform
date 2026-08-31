/*
 * hsmAgentBridge - cloud-side stand-in for thriftHsmService.
 *
 * WHY THIS EXISTS
 *
 * The PrismToken HSM lives on the factory LAN (192.168.0.201) and must stay off
 * the public Internet. The cloud backend therefore cannot connect to it - proven
 * by the kernel itself, which answers a direct attempt with:
 *
 *     connect ENETUNREACH 192.168.0.201:9443
 *
 * ENETUNREACH means "no route exists", not "blocked" or "refused". No amount of
 * configuration on the cloud side can fix that, and the correct answer is not to
 * punch a hole into the factory network.
 *
 * Instead an agent runs on a factory PC that CAN reach the HSM. That agent keeps
 * the existing, unmodified thriftHsmService.js and talks to the HSM exactly as
 * before. This module is the cloud half: it presents the SAME function signatures
 * as thriftHsmService, so vendingRoutes.js only changes which module it requires.
 *
 *     vendingRoutes.js  ->  hsmAgentBridge  ~~job queue~~>  agent  ->  thriftHsmService  ->  HSM
 *
 * DIRECTION OF TRAVEL
 *
 * The agent always dials out. It long-polls this backend for work and POSTs the
 * result back, so the factory PC needs no inbound Internet access, no port
 * forward and no static address. The cloud never initiates anything toward the
 * factory, which is the property the whole design exists to preserve.
 *
 * Deliberately NOT a generic RPC bridge: the agent enforces its own allow-list,
 * so a compromised cloud backend cannot ask the HSM to do arbitrary things.
 */
'use strict';

var OPS = require('./hsmAgentOps');

/* Pending jobs waiting to be picked up by the agent. */
var queue = [];
/* Jobs handed to the agent, awaiting a result. jobId -> {cb, timer, op, sentAt} */
var inflight = {};
/* Long-poll responses parked waiting for work. */
var waiters = [];

var seq = 0;
var lastSeenAt = null;
var lastAgentInfo = null;

/* A job may sit queued and run on the agent; give it room for both. */
var JOB_TIMEOUT_MS = 45000;
/* How long a poll is held open before returning empty. Below typical 30-60s
 * idle timeouts on proxies so the connection is closed by us, not by them. */
var POLL_HOLD_MS = 25000;

function nextId() {
  seq += 1;
  return 'job_' + Date.now().toString(36) + '_' + seq;
}

function agentOnline() {
  /* Online if the agent polled recently. Two hold-windows of slack absorbs one
   * missed reconnect without flapping the status shown in the portal. */
  return lastSeenAt !== null && (Date.now() - lastSeenAt) < (POLL_HOLD_MS * 2 + 10000);
}

function getAgentStatus() {
  return {
    online: agentOnline(),
    lastSeenAt: lastSeenAt ? new Date(lastSeenAt).toISOString() : null,
    queued: queue.length,
    inflight: Object.keys(inflight).length,
    agent: lastAgentInfo
  };
}

/* ------------------------------------------------------------------ dispatch */

/*
 * Enqueue one operation for the agent. `cb` is the node-style callback the
 * existing route code already passes to thriftHsmService.
 */
function dispatch(op, args, cb) {
  if (typeof cb !== 'function') cb = function () {};

  if (OPS.ALLOWED.indexOf(op) === -1) {
    /* Defence in depth - the agent enforces this too. */
    return cb(new Error('Operation not permitted through the HSM agent: ' + op));
  }

  if (!agentOnline()) {
    return cb(new Error(
      'Local HSM agent is offline. The cloud backend cannot reach the HSM directly ' +
      'by design; start the agent on the factory PC that can reach the HSM.'));
  }

  var job = { id: nextId(), op: op, args: args || [] };

  var timer = setTimeout(function () {
    var entry = inflight[job.id];
    if (!entry) return;
    delete inflight[job.id];
    entry.cb(new Error('HSM agent did not return a result for "' + op + '" within ' +
      (JOB_TIMEOUT_MS / 1000) + 's'));
  }, JOB_TIMEOUT_MS);

  inflight[job.id] = { cb: cb, timer: timer, op: op, sentAt: Date.now() };

  /*
   * Hand straight to a parked poller if one is waiting, else queue it.
   *
   * send() returns false when that poller's socket has already gone away, which
   * we cannot detect any earlier. Walk on to the next one rather than dropping
   * the job into a dead connection.
   */
  var delivered = false;
  while (!delivered) {
    var waiter = waiters.shift();
    if (!waiter) break;
    clearTimeout(waiter.timer);
    delivered = waiter.send([job]) !== false;
  }
  if (!delivered) queue.push(job);
}

/* ----------------------------------------------------- called by agent routes */

/*
 * Long-poll: give the agent any queued work, otherwise hold the request open
 * until work arrives or the hold window expires.
 */
function takeJobs(agentInfo, send) {
  lastSeenAt = Date.now();
  if (agentInfo) lastAgentInfo = agentInfo;

  if (queue.length) {
    var batch = queue.splice(0, queue.length);
    return send(batch);
  }

  var waiter = { send: send, timer: null };
  waiter.timer = setTimeout(function () {
    var i = waiters.indexOf(waiter);
    if (i !== -1) waiters.splice(i, 1);
    send([]);
  }, POLL_HOLD_MS);
  waiters.push(waiter);
}

/* Result coming back from the agent for a previously dispatched job. */
function submitResult(jobId, errMsg, result) {
  lastSeenAt = Date.now();
  var entry = inflight[jobId];
  if (!entry) return false;      /* already timed out, or unknown id */
  delete inflight[jobId];
  clearTimeout(entry.timer);
  entry.cb(errMsg ? new Error(errMsg) : null, result);
  return true;
}

/* Drop parked pollers - used when the agent disconnects cleanly. */
function releaseWaiters() {
  var pending = waiters.splice(0, waiters.length);
  for (var i = 0; i < pending.length; i++) {
    clearTimeout(pending[i].timer);
    pending[i].send([]);
  }
}

/* ------------------------------------------- thriftHsmService-compatible API */

/*
 * Same shape as thriftHsmService.buildMeterConfig - pure data, no HSM contact,
 * so it stays on the cloud side rather than costing a round trip.
 */
function buildMeterConfig(params) {
  params = params || {};
  return {
    drn: params.drn,
    ea: params.ea !== undefined ? params.ea : 7,
    tct: params.tct !== undefined ? params.tct : 2,
    sgc: params.sgc,
    krn: params.krn,
    ti: params.ti,
    ken: params.ken !== undefined ? params.ken : 255
  };
}

/*
 * thriftConfig is read by routes for display. The real connection parameters
 * live on the agent; expose a read-only view so nothing on the cloud implies it
 * holds HSM credentials.
 */
var thriftConfig = {
  host: null,
  port: null,
  realm: null,
  connected: false,
  lastError: null,
  via: 'local-hsm-agent'
};

module.exports = {
  /* bridge plumbing (used by hsmAgentRoutes) */
  takeJobs: takeJobs,
  submitResult: submitResult,
  releaseWaiters: releaseWaiters,
  getAgentStatus: getAgentStatus,
  agentOnline: agentOnline,

  /* thriftHsmService-compatible surface */
  thriftConfig: thriftConfig,
  buildMeterConfig: buildMeterConfig,

  connect: function (cb) { dispatch('connect', [], cb); },
  disconnect: function (cb) { dispatch('disconnect', [], cb || function () {}); },
  ping: function (cb) { dispatch('ping', [], cb); },
  signIn: function (cb) { dispatch('signIn', [], cb); },
  getStatus: function (cb) { dispatch('getStatus', [], cb); },
  checkConnection: function (cb) { dispatch('checkConnection', [], cb); },

  issueCreditToken: function (mc, subclass, amount, cb) {
    dispatch('issueCreditToken', [mc, subclass, amount], cb);
  },
  issueMseToken: function (mc, subclass, amount, cb) {
    dispatch('issueMseToken', [mc, subclass, amount], cb);
  },
  issueKeyChangeTokens: function (mc, newConfig, cb) {
    dispatch('issueKeyChangeTokens', [mc, newConfig], cb);
  },
  issueDitkChangeTokens: function (mc, cb) {
    dispatch('issueDitkChangeTokens', [mc], cb);
  },
  verifyToken: function (mc, tokenDec, cb) {
    dispatch('verifyToken', [mc, tokenDec], cb);
  },
  parseIdRecord: function (idRecord, cb) {
    dispatch('parseIdRecord', [idRecord], cb);
  },

  /*
   * Present only so a stray call fails loudly rather than silently returning a
   * useless object. A raw Thrift client cannot cross the bridge.
   */
  getClient: function () {
    throw new Error('getClient() is not available through the HSM agent bridge');
  },
  ensureAuthenticated: function (cb) { dispatch('signIn', [], cb); }
};
