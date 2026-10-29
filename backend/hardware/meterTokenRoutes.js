const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();

const SECRET = process.env.SECRET_KEY || 'gridx-combined-secret-key-2026';
const TOKEN_EXPIRY = '30d'; // 30-day expiry for meter JWT tokens

// POST /meters/getAccessToken — ESP32 meter registration
/*
 * The ESP32 does not post a flat body. meter_registration.cpp sends a signed
 * envelope:
 *
 *     { "request": "<json string>", "signature": "<base64 RSA-2048>" }
 *
 * with the DRN, nonce, timestamp and the meter's public key inside that inner
 * string. Reading req.body.DRN alone therefore never found it, and every meter
 * registration attempt was answered with 400 "Missing DRN in request body" -
 * which is why a factory-reset meter could never re-register.
 *
 * Accept both shapes: the envelope, and the flat body other callers still use.
 *
 * NOTE: the signature is not verified here. The meter supplies its own public
 * key in the same request, so verifying it would only prove the sender holds
 * the matching private key, not that it is a legitimate meter - that needs a
 * decision about how meter identity is anchored (trust-on-first-use, a
 * manufacturing allow-list, or a CA). Flagged rather than invented.
 */
function extractRegistrationBody(body) {
  if (body && typeof body.request === "string") {
    try {
      const inner = JSON.parse(body.request);
      return { inner: inner, signed: true };
    } catch (e) {
      return { inner: null, signed: true, parseError: e.message };
    }
  }
  return { inner: body || {}, signed: false };
}

router.post("/getAccessToken", (req, res) => {
  const parsed = extractRegistrationBody(req.body);
  if (parsed.signed && !parsed.inner) {
    console.warn('[METER-AUTH] Signed registration envelope was not valid JSON:', parsed.parseError);
    return res.status(400).json({ error: "Malformed signed request envelope" });
  }
  const src = parsed.inner || {};
  const DRN = src.DRN || src.drn || req.body.DRN || req.body.drn;
  if (!DRN) {
    return res.status(400).json({ error: "Missing DRN in request body" });
  }

  // Generate a JWT token for this meter
  const accessToken = jwt.sign(
    { drn: DRN, type: 'meter' },
    SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );

  console.log('[METER-AUTH] Issued JWT for meter: %s (%s registration)',
    DRN, parsed.signed ? 'signed' : 'flat');

  /*
   * The ESP32 expects a wrapped response: an outer object with a "data" field
   * holding a STRINGIFIED inner payload (see the response handler in
   * meter_registration.cpp, which reads outer_doc["data"] and then parses it).
   * Returning a flat { accessToken } left the meter reporting "No data field in
   * response" and never completing registration, even though the server had
   * happily issued a token.
   *
   * Both shapes are returned: "data" for the meter, and the flat accessToken so
   * existing web/dashboard callers are unaffected.
   */
  const inner = JSON.stringify({
    accessToken: accessToken,
    DRN: DRN,
    status: 'registered',
  });
  return res.json({ accessToken: accessToken, data: inner });
});

// POST /meters/getAccessTokenWeb — web dashboard meter token
router.post("/getAccessTokenWeb", (req, res) => {
  const DRN = req.body.DRN || req.body.drn;
  if (!DRN) {
    return res.status(400).json({ error: "Missing DRN in request body" });
  }

  const accessToken = jwt.sign(
    { meterDRN: DRN, type: 'meter-web' },
    SECRET,
    { expiresIn: '1h' }
  );

  return res.json({ accessToken: accessToken });
});

// GET /meters/testToken — verify token is valid
router.get("/testToken", (req, res) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  jwt.verify(token, SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: "Invalid token", details: err.message });
    }
    return res.json({ valid: true, decoded: decoded });
  });
});

module.exports = router;
