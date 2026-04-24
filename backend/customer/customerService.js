var connection = require('../config/db');
var bcrypt = require('bcryptjs');
var jwt = require('jsonwebtoken');
var geoip = require('geoip-lite');
var authorizedNumbersService = require('../meter/authorizedNumbersService');

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-MIGRATE: Add security columns to SystemUsers if they don't exist
// ═══════════════════════════════════════════════════════════════════════════

function addColumnIfNotExists(table, column, definition) {
  var checkSql = "SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?";
  connection.query(checkSql, [table, column], function(err, results) {
    if (err) { console.error('[CustomerAuth] Check column error:', err.message); return; }
    if (results[0].cnt === 0) {
      var alterSql = 'ALTER TABLE ' + table + ' ADD COLUMN ' + column + ' ' + definition;
      connection.query(alterSql, function(err2) {
        if (err2 && err2.message.indexOf('Duplicate column') === -1) {
          console.error('[CustomerAuth] Add column error:', err2.message);
        } else {
          console.log('[CustomerAuth] Added column: ' + table + '.' + column);
        }
      });
    }
  });
}

addColumnIfNotExists('SystemUsers', 'failed_login_count', 'INT DEFAULT 0');
addColumnIfNotExists('SystemUsers', 'locked_until', 'DATETIME DEFAULT NULL');
addColumnIfNotExists('SystemUsers', 'last_failed_login', 'DATETIME DEFAULT NULL');
addColumnIfNotExists('SystemUsers', 'lastLoginTime', 'DATETIME DEFAULT NULL');
addColumnIfNotExists('SystemUsers', 'ip_address', 'VARCHAR(50) DEFAULT NULL');

console.log('[CustomerAuth] Security migrations applied');

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

var MAX_FAILED_ATTEMPTS = 5;
var LOCKOUT_DURATION_MIN = 15;

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function logPlatformAudit(event, type, detail, email, userId, ipAddress, geoLocation, userAgent) {
  connection.query(
    'INSERT INTO PlatformAuditLog (event, type, detail, user_email, user_id, ip_address, geo_location, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [event, type, detail || null, email || null, userId || null, ipAddress || null, geoLocation || null, userAgent || null],
    function(err) {
      if (err) console.error('[Audit] Log error:', err.message);
    }
  );
}

function getGeoString(ip) {
  if (!ip || ip === '127.0.0.1' || ip === '::1') return 'Localhost';
  try {
    var geo = geoip.lookup(ip);
    if (geo) {
      var parts = [];
      if (geo.city) parts.push(geo.city);
      if (geo.region) parts.push(geo.region);
      if (geo.country) parts.push(geo.country);
      return parts.join(', ') || 'Unknown';
    }
  } catch (e) {}
  return 'Unknown';
}

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMER SIGNUP
// ═══════════════════════════════════════════════════════════════════════════

exports.signup = async function(Email, Password, FirstName, LastName, DRN, Phone) {
  if (!Email || !Password || !DRN) {
    throw new Error('Email, Password, and Meter Number (DRN) are required');
  }

  // Validate DRN exists in MeterProfileReal
  var meterExists = await new Promise(function(resolve, reject) {
    connection.query('SELECT DRN FROM MeterProfileReal WHERE DRN = ?', [DRN], function(err, results) {
      if (err) return reject(err);
      resolve(results && results.length > 0);
    });
  });
  if (!meterExists) {
    var meterErr = new Error('Meter number not found. Please check your meter number and try again.');
    meterErr.status = 404;
    throw meterErr;
  }

  // Validate phone number against authorized numbers (if phone provided)
  if (Phone) {
    var isAuthorized = await authorizedNumbersService.isPhoneAuthorized(DRN, Phone);
    if (!isAuthorized) {
      var phoneErr = new Error('Phone number is not authorized for this meter. Please contact your administrator to add your number.');
      phoneErr.status = 403;
      throw phoneErr;
    }
  }

  // Check if email already registered
  var emailExists = await new Promise(function(resolve, reject) {
    connection.query('SELECT UserID FROM SystemUsers WHERE Email = ?', [Email], function(err, results) {
      if (err) return reject(err);
      resolve(results && results.length > 0);
    });
  });
  if (emailExists) {
    var dupErr = new Error('An account with this email already exists. Please sign in instead.');
    dupErr.status = 409;
    throw dupErr;
  }

  // Check if DRN has reached max users (5 per meter)
  var drnUserCount = await new Promise(function(resolve, reject) {
    connection.query('SELECT COUNT(*) as cnt FROM SystemUsers WHERE DRN = ?', [DRN], function(err, results) {
      if (err) return reject(err);
      resolve(results[0].cnt);
    });
  });
  if (drnUserCount >= 5) {
    var drnErr = new Error('This meter has reached the maximum of 5 registered users. Please contact your administrator.');
    drnErr.status = 409;
    throw drnErr;
  }

  // Hash password
  var hashedPassword = await bcrypt.hash(Password, 12);

  // Insert user
  var result = await new Promise(function(resolve, reject) {
    connection.query(
      'INSERT INTO SystemUsers (Email, Password, FirstName, LastName, DRN, isVerified) VALUES (?, ?, ?, ?, ?, ?)',
      [Email, hashedPassword, FirstName || '', LastName || '', DRN, '1'],
      function(err, result) {
        if (err) return reject(err);
        resolve(result);
      }
    );
  });

  // Generate token for auto-login after registration
  var token = jwt.sign(
    { UserID: result.insertId, Email: Email, DRN: DRN, role: 'CUSTOMER' },
    process.env.SECRET_KEY,
    { expiresIn: '24h' }
  );

  return {
    token: token,
    user: {
      UserID: result.insertId,
      Email: Email,
      FirstName: FirstName || '',
      LastName: LastName || '',
      DRN: DRN
    }
  };
};

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMER SIGN IN — with email + meter number + password
// ═══════════════════════════════════════════════════════════════════════════

exports.signIn = async function(Email, DRN, Password, ipAddress, userAgent) {
  if (!Email || !Password) {
    throw new Error('Email and password are required');
  }

  var geoStr = getGeoString(ipAddress);

  // Find user by email
  var user = await new Promise(function(resolve, reject) {
    connection.query('SELECT * FROM SystemUsers WHERE Email = ?', [Email], function(err, results) {
      if (err) return reject(err);
      if (!results || results.length === 0) {
        var notFoundError = new Error('Email not found. Please register first.');
        notFoundError.status = 404;
        reject(notFoundError);
      } else {
        resolve(results[0]);
      }
    });
  });

  // If DRN provided, verify it matches
  if (DRN && user.DRN !== DRN) {
    logPlatformAudit('Customer login - DRN mismatch for: ' + Email, 'LOGIN_FAILED', 'DRN provided: ' + DRN + ', expected: ' + user.DRN, Email, user.UserID, ipAddress, geoStr, userAgent);
    var drnErr = new Error('Email and meter number do not match.');
    drnErr.status = 401;
    throw drnErr;
  }

  // Check if account is locked
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    var remainingMin = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
    logPlatformAudit('Customer login on locked account: ' + Email, 'LOCKOUT', 'Account locked, ' + remainingMin + ' min remaining', Email, user.UserID, ipAddress, geoStr, userAgent);
    var lockErr = new Error('Account is locked due to too many failed attempts. Try again in ' + remainingMin + ' minutes.');
    lockErr.status = 423;
    throw lockErr;
  }

  // Verify password
  var isMatch = await bcrypt.compare(Password, user.Password);
  if (!isMatch) {
    var newFailCount = (user.failed_login_count || 0) + 1;
    var lockUntil = null;
    if (newFailCount >= MAX_FAILED_ATTEMPTS) {
      lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MIN * 60 * 1000);
      logPlatformAudit('Customer account locked after ' + newFailCount + ' failed attempts: ' + Email, 'LOCKOUT', 'Locked until ' + lockUntil.toISOString(), Email, user.UserID, ipAddress, geoStr, userAgent);
    }
    connection.query(
      'UPDATE SystemUsers SET failed_login_count = ?, locked_until = ?, last_failed_login = NOW() WHERE UserID = ?',
      [newFailCount, lockUntil, user.UserID],
      function() {}
    );
    logPlatformAudit('Customer failed login (' + newFailCount + '/' + MAX_FAILED_ATTEMPTS + '): ' + Email, 'LOGIN_FAILED', 'Incorrect password', Email, user.UserID, ipAddress, geoStr, userAgent);
    var mismatchError = new Error('Incorrect password. ' + (MAX_FAILED_ATTEMPTS - newFailCount) + ' attempts remaining before lockout.');
    mismatchError.status = 401;
    throw mismatchError;
  }

  // Successful login
  var loginTimestamp = new Date();
  await new Promise(function(resolve, reject) {
    connection.query(
      'UPDATE SystemUsers SET login_count = COALESCE(login_count, 0) + 1, lastLoginTime = ?, ip_address = ?, failed_login_count = 0, locked_until = NULL WHERE UserID = ?',
      [loginTimestamp, ipAddress || null, user.UserID],
      function(err) { if (err) reject(err); else resolve(); }
    );
  });

  logPlatformAudit('Customer login: ' + Email, 'LOGIN', 'DRN: ' + user.DRN + ', IP: ' + (ipAddress || 'N/A'), Email, user.UserID, ipAddress, geoStr, userAgent);

  // Generate JWT
  var token = jwt.sign(
    { UserID: user.UserID, Email: user.Email, DRN: user.DRN, role: 'CUSTOMER' },
    process.env.SECRET_KEY,
    { expiresIn: '24h' }
  );

  return {
    token: token,
    message: 'Sign in successful',
    user: {
      UserID: user.UserID,
      Email: user.Email,
      FirstName: user.FirstName,
      LastName: user.LastName,
      DRN: user.DRN,
      lastLoginTime: loginTimestamp
    }
  };
};

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMER FORGOT PASSWORD
// ═══════════════════════════════════════════════════════════════════════════

exports.getUserByEmail = function(Email) {
  return new Promise(function(resolve, reject) {
    connection.query('SELECT * FROM SystemUsers WHERE Email = ?', [Email], function(err, results) {
      if (err) reject(err); else resolve(results && results[0]);
    });
  });
};

exports.resetPasswordByEmail = function(Email, Password) {
  return new Promise(function(resolve, reject) {
    bcrypt.hash(Password, 12, function(err, hashedPassword) {
      if (err) return reject(err);
      connection.query(
        'UPDATE SystemUsers SET Password = ?, failed_login_count = 0, locked_until = NULL WHERE Email = ?',
        [hashedPassword, Email],
        function(err2) { if (err2) reject(err2); else resolve(); }
      );
    });
  });
};

// ═══════════════════════════════════════════════════════════════════════════
// DELETE APP USER
// ═══════════════════════════════════════════════════════════════════════════

exports.deleteUser = function(UserID) {
  return new Promise(function(resolve, reject) {
    connection.query('DELETE FROM SystemUsers WHERE UserID = ?', [UserID], function(err, results) {
      if (err) return reject(err);
      if (results.affectedRows === 0) {
        var notFound = new Error('User not found');
        notFound.status = 404;
        return reject(notFound);
      }
      resolve(results);
    });
  });
};

// Export helpers
exports.logPlatformAudit = logPlatformAudit;
exports.getGeoString = getGeoString;
