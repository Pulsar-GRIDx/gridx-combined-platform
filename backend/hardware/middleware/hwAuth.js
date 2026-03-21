const jwt = require("jsonwebtoken");
require("dotenv").config();

const config = process.env;

const verifyToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(403).send({err:535});
  }
  try {
    const decoded = jwt.verify(token, config.ACCESS_TOKEN_SECRET);
    req.DRN = decoded.meterDRN;
  } catch (err) {
    return res.status(401).send({err:535});
  }
  return next();
};

module.exports = verifyToken;
