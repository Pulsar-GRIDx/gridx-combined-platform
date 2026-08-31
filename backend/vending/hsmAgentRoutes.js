/*
 * Cloud-side endpoints for the local HSM agent.
 *
 * Only three things happen here:
 *
 *   GET  /hsm-agent/poll     agent asks for work   (agent token)
 *   POST /hsm-agent/result   agent returns a result (agent token)
 *   GET  /hsm-agent/status   portal asks if the agent is up (user JWT)
 *
 * Every one is initiated BY the agent except /status, so the factory PC never
 * needs inbound Internet access. There is no endpoint that lets anyone reach
 * the HSM directly - the agent decides what it is willing to run.
 */
'use strict';

var express = require('express');
var crypto = require('crypto');
var router = express.Router();

var bridge = require('./hsmAgentBridge');
var OPS = require('./hsmAgentOps');

var authMw = require('../admin/authMiddllware');
var authenticateToken = authMw.authenticateToken;

/*
 * Shared secret the agent presents. Set HSM_AGENT_TOKEN in the backend
 * environment and give the agent the same value.
 *
 * With no token configured the agent endpoints are refused outright rather than
 * left open - an unauthenticated bridge into the factory network is the one
 * failure mode worth being absolute about.
 */
var AGENT_TOKEN = process.env.HSM_AGENT_TOKEN || null;

function timingSafeEqual(a, b) {
  var ba = Buffer.from(String(a));
  var bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function requireAgentAuth(req, res, next) {
  if (!AGENT_TOKEN) {
    console.error('[HSM-Agent] HSM_AGENT_TOKEN is not set - refusing agent connection');
    return res.status(503).json({
      success: false,
      error: 'HSM agent channel is not configured on the server (HSM_AGENT_TOKEN unset)'
    });
  }
  var hdr = req.headers['authorization'] || '';
  var presented = hdr.indexOf('Bearer ') === 0 ? hdr.slice(7) : null;
  if (!presented || !timingSafeEqual(presented, AGENT_TOKEN)) {
    console.warn('[HSM-Agent] rejected agent request from %s (bad or missing token)', req.ip);
    return res.status(401).json({ success: false, error: 'Invalid agent credentials' });
  }
  next();
}

/* ------------------------------------------------------------------- polling */

/*
 * Long-poll. Held open until work arrives or the hold window expires, so an
 * idle agent costs one parked connection rather than a request per second.
 */
router.get('/hsm-agent/poll', requireAgentAuth, function (req, res) {
  var sent = false;
  var aborted = false;

  /*
   * Returns false when the jobs could NOT be delivered, so the bridge can hand
   * them to another poller or requeue them instead of dropping them.
   */
  function send(jobs) {
    if (sent || aborted) return false;
    sent = true;
    res.json({ success: true, jobs: jobs || [] });
    return true;
  }

  /*
   * Watch the RESPONSE, not the request. On current Node a bodyless GET's
   * request stream closes as soon as it is consumed, so req 'close' fires
   * immediately and would disable this poller the instant it parked - the job
   * would then be handed to a dead waiter and lost.
   */
  res.on('close', function () { if (!sent) aborted = true; });

  bridge.takeJobs({
    name: req.query.name || 'hsm-agent',
    version: req.query.version || null,
    hsmHost: req.query.hsmHost || null,
    ip: req.ip
  }, send);
});

/* Result for a previously dispatched job. */
router.post('/hsm-agent/result', requireAgentAuth, function (req, res) {
  var b = req.body || {};
  if (!b.jobId) {
    return res.status(400).json({ success: false, error: 'jobId required' });
  }
  /* b.error is a message string; b.result is the serialised Thrift reply. */
  var accepted = bridge.submitResult(b.jobId, b.error || null, b.result);

  if (b.error) {
    console.warn('[HSM-Agent] job %s failed: %s', b.jobId, String(b.error).slice(0, 300));
  }
  /* accepted:false means it already timed out - the agent should not retry. */
  res.json({ success: true, accepted: accepted });
});

/* Agent signing off cleanly (service stopping). */
router.post('/hsm-agent/disconnect', requireAgentAuth, function (req, res) {
  bridge.releaseWaiters();
  console.log('[HSM-Agent] agent signed off');
  res.json({ success: true });
});

/* -------------------------------------------------------------------- status */

/* Portal-facing: is the agent up, and what is it attached to? */
router.get('/hsm-agent/status', authenticateToken, function (req, res) {
  var st = bridge.getAgentStatus();
  res.json({
    success: true,
    data: {
      online: st.online,
      lastSeenAt: st.lastSeenAt,
      queued: st.queued,
      inflight: st.inflight,
      agent: OPS.redact(st.agent),
      channelConfigured: !!AGENT_TOKEN,
      allowedOperations: OPS.ALLOWED,
      note: 'The cloud backend never connects to the HSM directly; all HSM ' +
            'operations run on the local agent inside the factory network.'
    }
  });
});

module.exports = router;
