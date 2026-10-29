const express = require("express");
const crypto = require("crypto");
const db = require("../config/db");
const tokens = require("../middleware/tokens");
const { authenticateToken, requireAdmin } = require("../admin/authMiddllware");
const router = express.Router();

const DRN_RE = /^\d{13}$/;
// A signed request whose timestamp is plausible (the meter has network time)
// must be recent. Unsynced clocks (before 2025) are not held to the window.
const TIMESTAMP_WINDOW_S = 24 * 60 * 60;
const PLAUSIBLE_EPOCH_S = 1735689600; // 2025-01-01

/*
 * POST /meters/getAccessToken — ESP32 meter registration
 *
 * The ESP32 (meter_registration.cpp) posts a signed envelope:
 *
 *     { "request": "<json string>", "signature": "<base64 RSA-2048>" }
 *
 * The inner string carries DRN, nonce, timestamp and the meter's public key
 * (SubjectPublicKeyInfo DER, base64); the signature is RSA PKCS#1 v1.5 over
 * SHA-256 of that exact string.
 *
 * Meter identity is a public key pinned in MeterDeviceKeys:
 *   - the DRN must already be provisioned (MeterProfileReal);
 *   - the signature must verify against the public key in the request;
 *   - a meter with a pinned key must present that same key;
 *   - a meter without one gets its key pinned only while a pinning window is
 *     open: a technician opens it by registering the meter in the
 *     Maintenance app (they are standing at it), or an admin opens it with
 *     POST /meters/:drn/pin-window. Without that, anyone who knows a DRN
 *     could pin their own key first and act as the meter.
 *     METER_PIN_TOFU=true pins on first use without a window (rollout only).
 * Only then is a verified meter token (typ 'meter') issued. An admin can
 * clear a pin after a genuine key change (e.g. a replaced ESP32).
 *
 * Deployed firmware falls back to "simulated-signature" when RSA signing runs
 * out of heap, and older callers post a flat { DRN } body. Refusing those
 * outright would leave the meter retrying registration forever, so they get
 * the legacy-shaped token they always got - which, since this change, no
 * route accepts as a credential (meterAuth treats it as unauthenticated,
 * authenticateToken and hwAuth refuse it). Nothing is granted by it.
 */
function extractRegistrationBody(body) {
  if (body && typeof body.request === "string") {
    try {
      return { inner: JSON.parse(body.request), raw: body.request, signature: body.signature, signed: true };
    } catch (e) {
      return { inner: null, signed: true, parseError: e.message };
    }
  }
  return { inner: body || {}, signed: false };
}

function q(sql, params) {
  return new Promise((resolve, reject) => {
    db.query(sql, params || [], (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function respond(res, accessToken, DRN, status) {
  /*
   * The ESP32 expects a wrapped response: an outer object with a "data" field
   * holding a STRINGIFIED inner payload (see the response handler in
   * meter_registration.cpp). The flat accessToken is kept for other callers.
   */
  const inner = JSON.stringify({ accessToken: accessToken, DRN: DRN, status: status });
  return res.json({ accessToken: accessToken, data: inner });
}

function legacyToken(DRN) {
  // Same shape as before 2026-10; tokens.kind() classifies it 'legacy-meter'.
  return require("jsonwebtoken").sign({ drn: DRN, type: "meter" }, process.env.SECRET_KEY, { expiresIn: "30d" });
}

function verifySignature(raw, signatureB64, publicKeyB64) {
  try {
    const key = crypto.createPublicKey({ key: Buffer.from(publicKeyB64, "base64"), format: "der", type: "spki" });
    return crypto.verify("sha256", Buffer.from(raw, "utf8"),
      { key: key, padding: crypto.constants.RSA_PKCS1_PADDING },
      Buffer.from(signatureB64, "base64"));
  } catch (e) {
    return false;
  }
}

router.post("/getAccessToken", async (req, res) => {
  const parsed = extractRegistrationBody(req.body);
  if (parsed.signed && !parsed.inner) {
    console.warn("[METER-AUTH] Signed registration envelope was not valid JSON:", parsed.parseError);
    return res.status(400).json({ error: "Malformed signed request envelope" });
  }
  const src = parsed.inner || {};
  const DRN = String(src.DRN || src.drn || req.body.DRN || req.body.drn || "");
  if (!DRN) {
    return res.status(400).json({ error: "Missing DRN in request body" });
  }
  if (!DRN_RE.test(DRN)) {
    return res.status(400).json({ error: "DRN must be 13 digits" });
  }

  try {
    const hasRealSignature = parsed.signed && typeof parsed.signature === "string" &&
      parsed.signature !== "simulated-signature" && typeof src.publicKey === "string" && src.publicKey.length > 0;

    if (!hasRealSignature) {
      console.warn("[METER-AUTH] Unverified registration for %s (%s) - legacy token, no privileges",
        DRN, parsed.signed ? "no usable signature" : "flat body");
      return respond(res, legacyToken(DRN), DRN, "registered");
    }

    const provisioned = await q("SELECT DRN FROM MeterProfileReal WHERE DRN = ?", [DRN]);
    if (!provisioned.length) {
      console.warn("[METER-AUTH] Signed registration for unprovisioned meter %s - legacy token, no privileges", DRN);
      return respond(res, legacyToken(DRN), DRN, "registered");
    }

    if (!verifySignature(parsed.raw, parsed.signature, src.publicKey)) {
      console.warn("[METER-AUTH] Signature verification FAILED for %s", DRN);
      return res.status(401).json({ error: "Signature verification failed" });
    }

    const ts = Number(src.timestamp);
    const now = Math.floor(Date.now() / 1000);
    if (ts >= PLAUSIBLE_EPOCH_S && Math.abs(now - ts) > TIMESTAMP_WINDOW_S) {
      return res.status(401).json({
        error: "Timestamp outside the allowed window",
        details: { server_time_utc: now, drift_seconds: Math.abs(now - ts) },
      });
    }

    const fingerprint = crypto.createHash("sha256").update(Buffer.from(src.publicKey, "base64")).digest("hex");
    const pinned = await q("SELECT key_fingerprint, token_version, last_nonce, (pin_allowed_until >= NOW()) AS window_open FROM MeterDeviceKeys WHERE DRN = ?", [DRN]);
    let version = 0;
    if (!pinned.length || !pinned[0].key_fingerprint) {
      const windowOpen = pinned.length && pinned[0].window_open;
      if (!windowOpen && process.env.METER_PIN_TOFU !== "true") {
        console.warn("[METER-AUTH] Signed registration for %s but no pinning window is open - legacy token, no privileges", DRN);
        return respond(res, legacyToken(DRN), DRN, "registered");
      }
      version = pinned.length ? pinned[0].token_version || 0 : 0;
      await q("INSERT INTO MeterDeviceKeys (DRN, public_key_der_b64, key_fingerprint, pinned_at, last_registration_at, last_nonce) VALUES (?, ?, ?, NOW(), NOW(), ?) " +
        "ON DUPLICATE KEY UPDATE public_key_der_b64 = VALUES(public_key_der_b64), key_fingerprint = VALUES(key_fingerprint), pinned_at = NOW(), " +
        "last_registration_at = NOW(), last_nonce = VALUES(last_nonce), pin_allowed_until = NULL",
        [DRN, src.publicKey, fingerprint, Number(src.nonce) || null]);
      console.log("[METER-AUTH] Pinned public key %s… for meter %s", fingerprint.slice(0, 12), DRN);
    } else {
      if (pinned[0].key_fingerprint !== fingerprint) {
        console.warn("[METER-AUTH] Meter %s presented a different key than the pinned one", DRN);
        return res.status(403).json({ error: "Meter key does not match the registered device" });
      }
      if (src.nonce !== undefined && pinned[0].last_nonce !== null && Number(pinned[0].last_nonce) === Number(src.nonce)) {
        return res.status(401).json({ error: "Replayed registration request" });
      }
      version = pinned[0].token_version || 0;
      await q("UPDATE MeterDeviceKeys SET last_registration_at = NOW(), last_nonce = ? WHERE DRN = ?", [Number(src.nonce) || null, DRN]);
    }

    tokens.invalidateMeter(DRN);
    console.log("[METER-AUTH] Issued verified JWT for meter %s", DRN);
    return respond(res, tokens.signMeter(DRN, version), DRN, "registered");
  } catch (err) {
    console.error("[METER-AUTH] Registration error for %s: %s", DRN, err.message);
    return res.status(500).json({ error: "Registration failed" });
  }
});

// POST /meters/getAccessTokenWeb — formerly signed a 'meter-web' token for any
// DRN. Nothing in the workspace calls it; it is now admin-only and returns a
// legacy token, which grants nothing on its own.
router.post("/getAccessTokenWeb", authenticateToken, requireAdmin, (req, res) => {
  const DRN = String(req.body.DRN || req.body.drn || "");
  if (!DRN_RE.test(DRN)) {
    return res.status(400).json({ error: "Missing DRN in request body" });
  }
  const accessToken = require("jsonwebtoken").sign({ meterDRN: DRN, type: "meter-web" }, process.env.SECRET_KEY, { expiresIn: "1h" });
  return res.json({ accessToken: accessToken });
});

// Opens (or extends) the window in which an unpinned meter may pin its key.
// Has no effect on a meter whose key is already pinned.
async function openPinWindow(drn, hours, actor) {
  await q("INSERT INTO MeterDeviceKeys (DRN, pin_allowed_until, pin_window_opened_by) VALUES (?, DATE_ADD(NOW(), INTERVAL ? HOUR), ?) " +
    "ON DUPLICATE KEY UPDATE pin_allowed_until = IF(key_fingerprint IS NULL, VALUES(pin_allowed_until), pin_allowed_until), " +
    "pin_window_opened_by = IF(key_fingerprint IS NULL, VALUES(pin_window_opened_by), pin_window_opened_by)",
    [drn, hours, actor || null]);
  const rows = await q("SELECT key_fingerprint IS NOT NULL AS pinned FROM MeterDeviceKeys WHERE DRN = ?", [drn]);
  return { drn: drn, alreadyPinned: !!(rows[0] && rows[0].pinned) };
}

// POST /meters/:drn/pin-window  { hours? }  — admin
// POST /meters/pin-window       { drns: [...], hours? } — admin, bulk (fleet rollout)
router.post("/pin-window", authenticateToken, requireAdmin, async (req, res) => {
  const drns = Array.isArray(req.body.drns) ? req.body.drns.map(String).filter((d) => DRN_RE.test(d)) : [];
  if (!drns.length || drns.length > 5000) return res.status(400).json({ error: "drns must list 1-5000 13-digit DRNs" });
  const hours = Math.min(Math.max(parseInt(req.body.hours, 10) || 24, 1), 24 * 30);
  try {
    const results = [];
    for (const d of drns) results.push(await openPinWindow(d, hours, "admin:" + req.user.Admin_ID));
    return res.json({ hours: hours, results: results });
  } catch (err) {
    return res.status(500).json({ error: "Failed to open pinning windows" });
  }
});
router.post("/:drn/pin-window", authenticateToken, requireAdmin, async (req, res) => {
  if (!DRN_RE.test(req.params.drn)) return res.status(400).json({ error: "DRN must be 13 digits" });
  const hours = Math.min(Math.max(parseInt(req.body && req.body.hours, 10) || 24, 1), 24 * 30);
  try {
    return res.json(Object.assign({ hours: hours }, await openPinWindow(req.params.drn, hours, "admin:" + req.user.Admin_ID)));
  } catch (err) {
    return res.status(500).json({ error: "Failed to open pinning window" });
  }
});

// DELETE /meters/:drn/pinned-key — admin: forget a meter's pinned key (e.g.
// the ESP32 was replaced), revoke every token issued to it, and open a 24h
// window for the replacement to pin its key.
router.delete("/:drn/pinned-key", authenticateToken, requireAdmin, async (req, res) => {
  if (!DRN_RE.test(req.params.drn)) return res.status(400).json({ error: "DRN must be 13 digits" });
  try {
    const r = await q("UPDATE MeterDeviceKeys SET public_key_der_b64 = NULL, key_fingerprint = NULL, pinned_at = NULL, last_nonce = NULL, " +
      "token_version = token_version + 1, pin_allowed_until = DATE_ADD(NOW(), INTERVAL 24 HOUR), pin_window_opened_by = ? WHERE DRN = ?",
      ["admin:" + req.user.Admin_ID, req.params.drn]);
    tokens.invalidateMeter(req.params.drn);
    return res.json({ cleared: r.affectedRows > 0 });
  } catch (err) {
    return res.status(500).json({ error: "Failed to clear pinned key" });
  }
});

// GET /meters/testToken — tells a caller whether its token is valid, without
// echoing the payload back.
router.get("/testToken", (req, res) => {
  const token = tokens.bearer(req);
  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }
  try {
    const decoded = tokens.verify(token);
    return res.json({ valid: true, kind: tokens.kind(decoded) });
  } catch (err) {
    return res.status(403).json({ error: "Invalid token" });
  }
});

module.exports = router;
module.exports.openPinWindow = openPinWindow;
