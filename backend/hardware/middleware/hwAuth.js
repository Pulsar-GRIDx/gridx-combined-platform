// Guards the root-mounted hardware CRUD routers (getAll, update, delete...).
//
// The ESP32 firmware does not call any of these: it posts to the */MeterLog
// ingestion routes (meterAuth.js). So only two identities are accepted:
//   - admin tokens, unchanged;
//   - customer tokens, through the same allow-list and CustomerMeters check
//     as the /cb app routes (middleware/meterOwnership.js), which limits them
//     to reading their own meters' getLastUpdate rows.
// Meter tokens are refused: until 2026-10 /meters/getAccessToken signed one
// for any DRN anyone asked for, so a meter token proves nothing here.
const tokens = require("../../middleware/tokens");
const meterOwnership = require("../../middleware/meterOwnership");

const verifyToken = (req, res, next) => {
  const token = tokens.bearer(req);
  if (!token) {
    return res.status(403).send({ err: 535 });
  }
  let decoded;
  try {
    decoded = tokens.verify(token);
  } catch (err) {
    return res.status(401).send({ err: 535 });
  }

  meterOwnership.checkOwnership(req, decoded).then((refusal) => {
    if (refusal) {
      return res.status(refusal.status).send({ err: 535, error: refusal.error, code: refusal.code });
    }
    req.user = decoded;
    req.DRN = req.meterDrn || undefined;
    return next();
  }, (authzErr) => {
    console.error("[hwAuth] Authorisation check failed:", authzErr.message);
    res.status(503).send({ err: 535 });
  });
};

module.exports = verifyToken;
