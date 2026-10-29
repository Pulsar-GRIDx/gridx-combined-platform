// Guards the meter ingestion routes (POST */MeterLog/:id and friends).
//
// A verified meter token (typ 'meter', issued by /meters/getAccessToken only
// after the meter's signature checks out) may post for its own DRN only.
// Customer and admin tokens are not meter identities and are refused.
//
// Deployed firmware posts without a usable token when it has not completed
// registration, so a request with no token (or an expired or pre-2026-10
// token, which anyone could obtain) is still accepted as unauthenticated
// (req.meterAuth = false) unless METER_REQUIRE_TOKEN=true. Turn that on once
// the fleet runs firmware that registers with a signed request.
const tokens = require("../../middleware/tokens");

const requireToken = () => process.env.METER_REQUIRE_TOKEN === "true";

function pathDrn(req) {
  return (req.params && (req.params.id || req.params.drn)) || null;
}

const verifyToken = (req, res, next) => {
  req.meterAuth = false;
  const token = tokens.bearer(req);

  let decoded = null;
  if (token) {
    try {
      decoded = tokens.verify(token);
    } catch (err) {
      req.tokenExpired = err.name === "TokenExpiredError";
    }
  }

  const kind = decoded ? tokens.kind(decoded) : "none";
  if (kind === "customer" || kind === "admin") {
    return res.status(403).send({ err: 535, error: "Not a meter credential" });
  }

  if (kind === "meter") {
    const drn = pathDrn(req);
    if (drn && String(drn) !== String(decoded.drn)) {
      return res.status(403).send({ err: 535, error: "Token was issued to a different meter" });
    }
    return tokens.meterTokenCurrent(decoded).then((current) => {
      if (!current) {
        if (requireToken()) return res.status(401).send({ err: 535 });
        return next();
      }
      req.meterAuth = true;
      req.meterDRN = decoded.drn;
      req.DRN = decoded.drn;
      return next();
    }, (err) => {
      console.error("[meterAuth] token version check failed:", err.message);
      res.status(503).send({ err: 535 });
    });
  }

  // No token, an invalid one, or a legacy meter token: unauthenticated.
  if (requireToken()) return res.status(401).send({ err: 535 });
  return next();
};

module.exports = verifyToken;
