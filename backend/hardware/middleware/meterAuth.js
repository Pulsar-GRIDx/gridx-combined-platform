const jwt = require("jsonwebtoken");
require("dotenv").config();

const config = process.env;

const verifyToken = (req, res, next) => {
  const authHeader = req.headers["Authorization"];
  const token = authHeader && authHeader.split(" ")[1];



  // try {
    
  //   const compareValue = token.localeCompare(api_key);

  //   if (compareValue !== 0) {
  //     // API keys do not match
  //     return res.status(401).send({ err: 535 });
  //   }

  //   // API keys match

  //  // } catch (err) {
  //   return res.status(401).send({ err: 535 });
  // }

  return next();
};

module.exports = verifyToken;