const crypto = require('crypto');
const db = require('../config/db');
const tokens = require('../middleware/tokens');

// ═══════════════════════════════════════════════════════════════════════════
// METER-BUTTON VALIDATION — proof that the person in the app is standing at
// the meter.
//
//   1. The app asks for a validation (signup, password recovery, or linking
//      another meter to a signed-in account). The server stores it in
//      MeterLinkRequests and returns a random token; only its hash is kept.
//   2. The user presses the validation button on the meter; the meter posts
//      /meter-validate/confirm with its own meter token.
//   3. The app polls with its token, then presents the token to signup or
//      /customer/meters/link/complete, which consumes it exactly once.
//
// Only one validation may be pending per meter. Otherwise someone who knows a
// neighbour's DRN could open a request and wait for the neighbour's own
// button press to confirm it.
// ═══════════════════════════════════════════════════════════════════════════

const VALIDATION_TTL_S = 5 * 60;
const DRN_RE = /^\d{13}$/;

function q(sql, params) {
  return new Promise((resolve, reject) => {
    db.query(sql, params || [], (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

async function expireOld() {
  await q("UPDATE MeterLinkRequests SET status = 'expired' WHERE status IN ('pending','confirmed') AND expires_at < NOW()");
}

// Creates a validation. Returns { token, expiresIn } or throws { status }.
async function createValidation(drn, purpose, userId) {
  if (!DRN_RE.test(String(drn || ''))) {
    const e = new Error('A 13-digit meter number is required'); e.status = 400; throw e;
  }
  await expireOld();
  const open = await q("SELECT id, UserID FROM MeterLinkRequests WHERE DRN = ? AND status IN ('pending','confirmed')", [drn]);
  // The same account may restart its own request; anyone else waits.
  const blocking = open.filter(r => userId === null || r.UserID === null || String(r.UserID) !== String(userId));
  if (blocking.length) {
    const e = new Error('A validation is already in progress for this meter. Try again in a few minutes.');
    e.status = 429; e.code = 'VALIDATION_IN_PROGRESS'; throw e;
  }
  if (open.length) {
    await q("UPDATE MeterLinkRequests SET status = 'expired' WHERE DRN = ? AND UserID = ? AND status IN ('pending','confirmed')", [drn, userId]);
  }
  const token = crypto.randomBytes(16).toString('hex');
  await q('INSERT INTO MeterLinkRequests (token_hash, DRN, UserID, purpose, expires_at) VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))',
    [hashToken(token), drn, userId, purpose, VALIDATION_TTL_S]);
  return { token, expiresIn: VALIDATION_TTL_S };
}

// Consumes a confirmed validation exactly once. Resolves to true on success.
async function consumeValidation(token, drn, purpose, userId) {
  if (!token) return false;
  const r = await q(
    "UPDATE MeterLinkRequests SET status = 'consumed', consumed_at = NOW() " +
    "WHERE token_hash = ? AND DRN = ? AND purpose = ? AND status = 'confirmed' AND expires_at >= NOW() " +
    'AND (UserID <=> ?)',
    [hashToken(token), drn, purpose, userId === undefined ? null : userId]);
  return r.affectedRows === 1;
}

async function statusByToken(token) {
  await expireOld();
  const rows = await q('SELECT DRN, purpose, status, UserID FROM MeterLinkRequests WHERE token_hash = ?', [hashToken(token)]);
  return rows[0] || null;
}

/**
 * POST /customer/request-meter-validation  (public)
 * Body: { DRN, type: "registration" | "password_recovery" }
 * Same response whether or not the meter exists; only a real meter can
 * confirm it.
 */
const requestValidation = async (req, res) => {
  const { DRN, type } = req.body || {};
  if (!DRN) return res.status(400).json({ error: 'DRN is required' });
  if (!type || !['registration', 'password_recovery'].includes(type)) {
    return res.status(400).json({ error: 'type must be "registration" or "password_recovery"' });
  }
  try {
    const v = await createValidation(String(DRN), type, null);
    res.status(200).json({
      message: 'Validation request created. Please press the validation button on your meter.',
      token: v.token,
      drn: String(DRN),
      expiresIn: v.expiresIn,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error('[MeterValidation] request error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * POST /meter-validate/confirm  (the meter, when its button is pressed)
 * Body: { DRN }. Requires the meter's own verified token for that DRN.
 * METER_VALIDATE_ALLOW_UNVERIFIED=true accepts meters that have not completed
 * signed registration yet (transition only: it lets anyone who can reach the
 * endpoint confirm a pending validation).
 */
const confirmValidation = async (req, res) => {
  const DRN = req.body && req.body.DRN ? String(req.body.DRN) : '';
  if (!DRN) return res.status(400).json({ error: 'DRN is required' });

  const raw = tokens.bearer(req);
  let decoded = null;
  try { decoded = raw ? tokens.verify(raw) : null; } catch (e) { decoded = null; }
  let verified = false;
  if (decoded && tokens.kind(decoded) === 'meter' && String(decoded.drn) === DRN) {
    verified = await tokens.meterTokenCurrent(decoded).catch(() => false);
  }
  if (!verified && process.env.METER_VALIDATE_ALLOW_UNVERIFIED !== 'true') {
    return res.status(401).json({ error: 'Meter credentials required' });
  }

  try {
    await expireOld();
    // Exactly one request can be pending per meter (see createValidation).
    const r = await q("UPDATE MeterLinkRequests SET status = 'confirmed', confirmed_at = NOW() WHERE DRN = ? AND status = 'pending' AND expires_at >= NOW()", [DRN]);
    if (r.affectedRows === 0) {
      return res.status(404).json({ error: 'No pending validation for this meter', drn: DRN });
    }
    console.log(`Meter validation confirmed for DRN: ${DRN}${verified ? '' : ' (unverified meter)'}`);
    res.status(200).json({ message: 'Meter validation confirmed', drn: DRN, status: 'confirmed' });
  } catch (err) {
    console.error('[MeterValidation] confirm error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /customer/check-meter-validation/:drn[?token=...]  (public)
 * With the token: that validation's status. Without it: whether the meter
 * exists (credit-transfer target lookup). Another person's validation is
 * never reported.
 */
const checkValidation = async (req, res) => {
  const { drn } = req.params;
  if (!drn) return res.status(400).json({ error: 'DRN is required' });
  try {
    if (req.query.token) {
      const v = await statusByToken(String(req.query.token));
      if (!v || String(v.DRN) !== String(drn)) {
        return res.status(404).json({ status: 'not_found', message: 'Validation not found' });
      }
      if (v.status === 'expired') {
        return res.status(410).json({ status: 'expired', message: 'Validation request has expired' });
      }
      return res.status(200).json({ valid: true, status: v.status, type: v.purpose, drn: drn });
    }

    const rows = await q('SELECT DRN FROM MeterProfileReal WHERE DRN = ?', [drn]);
    if (rows.length) return res.status(200).json({ valid: true, status: 'registered', drn: drn });
    const rows2 = await q('SELECT DRN FROM meters WHERE DRN = ?', [drn]).catch(() => []);
    if (rows2.length) return res.status(200).json({ valid: true, status: 'registered', drn: drn });
    return res.status(404).json({ status: 'not_found', message: 'Meter not found in the system' });
  } catch (err) {
    console.error('[MeterValidation] check error:', err.message);
    res.status(500).json({ error: 'Failed to validate meter' });
  }
};

module.exports = {
  requestValidation,
  confirmValidation,
  checkValidation,
  createValidation,
  consumeValidation,
  statusByToken,
  hashToken,
};
