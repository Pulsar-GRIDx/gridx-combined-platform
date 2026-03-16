var dotenv = require('dotenv');
var jwt = require('jsonwebtoken');
var validator = require('validator');

dotenv.config();

// ═══════════════════════════════════════════════════════════════════════════
// AUTHENTICATE TOKEN — verify JWT from Authorization header
// ═══════════════════════════════════════════════════════════════════════════
function authenticateToken(req, res, next) {
  var authHeader = req.header('Authorization');

  if (!authHeader || authHeader.indexOf('Bearer ') !== 0) {
    return res.status(401).json({ error: 'Unauthorized — no token provided' });
  }

  var token = authHeader.split(' ')[1];

  jwt.verify(token, process.env.SECRET_KEY, function(err, decoded) {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token Expired' });
      } else {
        return res.status(403).json({ error: 'Forbidden — invalid token' });
      }
    }

    // Attach decoded payload to request
    req.user = decoded;
    req.tokenPayload = decoded;
    next();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ROLE-BASED ACCESS CONTROL MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════

// Require ADMIN role
function requireAdmin(req, res, next) {
  if (!req.user || req.user.AccessLevel !== 'ADMIN') {
    return res.status(403).json({ error: 'Access denied — administrator privileges required' });
  }
  next();
}

// Require specific role(s) — pass an array of allowed roles
// Usage: requireRole(['ADMIN', 'OPERATOR'])
function requireRole(allowedRoles) {
  return function(req, res, next) {
    if (!req.user || allowedRoles.indexOf(req.user.AccessLevel) === -1) {
      return res.status(403).json({ error: 'Access denied — insufficient permissions. Required: ' + allowedRoles.join(' or ') });
    }
    next();
  };
}

// Require specific access type (PLATFORM, VENDING, BOTH)
function requireAccessType(requiredType) {
  return function(req, res, next) {
    var userType = (req.user && req.user.access_type) || 'PLATFORM';
    if (userType === 'BOTH' || userType === requiredType) {
      return next();
    }
    return res.status(403).json({ error: 'Access denied — your account does not have ' + requiredType + ' access' });
  };
}

// Email Validation
var validateEmail = function(email) { return validator.isEmail(email); };

module.exports = {
  authenticateToken: authenticateToken,
  requireAdmin: requireAdmin,
  requireRole: requireRole,
  requireAccessType: requireAccessType,
  validateEmail: validateEmail
};
