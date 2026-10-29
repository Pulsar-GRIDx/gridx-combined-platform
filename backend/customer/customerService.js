var connection = require('../config/db');
var bcrypt = require('bcryptjs');
var tokens = require('../middleware/tokens');
var customerMeters = require('../services/customerMeterService');
var meterValidation = require('./meterValidationController');
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
//
// The account is created and linked to the meter in one transaction-like
// sequence, and only after the meter itself confirmed the signup: the app
// must present the token of a meter-button validation (see
// customer/meterValidationController.js) that the meter confirmed. Knowing a
// DRN is not enough to attach yourself to someone's meter.
// ═══════════════════════════════════════════════════════════════════════════

var INVALID_CREDENTIALS = 'Invalid email or password';

exports.signup = async function(Email, Password, FirstName, LastName, DRN, Phone, validationToken) {
  if (!Email || !Password || !DRN) {
    throw new Error('Email, Password, and Meter Number (DRN) are required');
  }

  var meterExists = await customerMeters.meterExists(DRN);
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

  var activeUsers = (await customerMeters.membersOfMeter(DRN)).length;
  if (activeUsers >= customerMeters.MAX_USERS_PER_METER) {
    var drnErr = new Error('This meter has reached the maximum of ' + customerMeters.MAX_USERS_PER_METER + ' registered users. Please contact your administrator.');
    drnErr.status = 409;
    throw drnErr;
  }

  // Consume the meter-button proof last, so a validation error above does
  // not burn it.
  var proven = await meterValidation.consumeValidation(validationToken, DRN, 'registration', null);
  if (!proven) {
    var proofErr = new Error('Press the validation button on your meter to confirm this registration, then try again.');
    proofErr.status = 403;
    proofErr.code = 'METER_VALIDATION_REQUIRED';
    throw proofErr;
  }

  var hashedPassword = await bcrypt.hash(Password, 12);

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

  await customerMeters.link(result.insertId, DRN, { via: 'signup_meter_button', actor: 'self' });
  var meters = await customerMeters.listForUser(result.insertId);

  var user = { UserID: result.insertId, Email: Email };
  return {
    token: tokens.signCustomer(user, DRN, 0),
    user: {
      UserID: result.insertId,
      Email: Email,
      FirstName: FirstName || '',
      LastName: LastName || '',
      DRN: DRN
    },
    meterCount: meters.length,
    meters: meters
  };
};

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMER SIGN IN — email + password (+ optional meter number)
//
// An unknown email and a wrong password get the same 401 and message, so the
// endpoint does not reveal which emails have accounts.
// ═══════════════════════════════════════════════════════════════════════════

function invalidCredentials() {
  var e = new Error(INVALID_CREDENTIALS);
  e.status = 401;
  return e;
}

// Spent on unknown emails so they take as long as a real password check.
var DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-password', 12);

exports.signIn = async function(Email, DRN, Password, ipAddress, userAgent) {
  if (!Email || !Password) {
    throw new Error('Email and password are required');
  }

  var geoStr = getGeoString(ipAddress);

  var user = await new Promise(function(resolve, reject) {
    connection.query('SELECT * FROM SystemUsers WHERE Email = ?', [Email], function(err, results) {
      if (err) return reject(err);
      resolve(results && results[0]);
    });
  });
  if (!user) {
    await bcrypt.compare(Password, DUMMY_HASH);
    logPlatformAudit('Customer login - unknown email: ' + Email, 'LOGIN_FAILED', 'Unknown email', Email, null, ipAddress, geoStr, userAgent);
    throw invalidCredentials();
  }

  // Check if account is locked
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    var remainingMin = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
    logPlatformAudit('Customer login on locked account: ' + Email, 'LOCKOUT', 'Account locked, ' + remainingMin + ' min remaining', Email, user.UserID, ipAddress, geoStr, userAgent);
    var lockErr = new Error('Account is locked due to too many failed attempts. Try again in ' + remainingMin + ' minutes.');
    lockErr.status = 423;
    throw lockErr;
  }

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
    throw invalidCredentials();
  }

  var meters = await customerMeters.listForUser(user.UserID);
  var drns = meters.map(function(m) { return m.drn; });

  // Older app builds send the meter number with the login. It must be one
  // of the account's meters; it then becomes the token's primary meter.
  if (DRN && drns.indexOf(String(DRN)) === -1) {
    logPlatformAudit('Customer login - meter not linked for: ' + Email, 'LOGIN_FAILED', 'DRN provided: ' + DRN, Email, user.UserID, ipAddress, geoStr, userAgent);
    throw invalidCredentials();
  }
  var primary = DRN ? String(DRN) : (drns.indexOf(String(user.DRN)) !== -1 ? String(user.DRN) : (drns[0] || null));

  var loginTimestamp = new Date();
  await new Promise(function(resolve, reject) {
    connection.query(
      'UPDATE SystemUsers SET login_count = COALESCE(login_count, 0) + 1, lastLoginTime = ?, ip_address = ?, failed_login_count = 0, locked_until = NULL WHERE UserID = ?',
      [loginTimestamp, ipAddress || null, user.UserID],
      function(err) { if (err) reject(err); else resolve(); }
    );
  });

  logPlatformAudit('Customer login: ' + Email, 'LOGIN', 'Meters: ' + (drns.join(',') || 'none') + ', IP: ' + (ipAddress || 'N/A'), Email, user.UserID, ipAddress, geoStr, userAgent);

  return {
    token: tokens.signCustomer(user, primary, user.token_version || 0),
    message: 'Sign in successful',
    user: {
      UserID: user.UserID,
      Email: user.Email,
      FirstName: user.FirstName,
      LastName: user.LastName,
      DRN: primary,
      lastLoginTime: loginTimestamp
    },
    meterCount: meters.length,
    meters: meters
  };
};

// Profile + meters for the signed-in account.
exports.getProfile = async function(UserID) {
  var rows = await new Promise(function(resolve, reject) {
    connection.query('SELECT UserID, Email, FirstName, LastName FROM SystemUsers WHERE UserID = ?', [UserID], function(err, r) {
      if (err) reject(err); else resolve(r);
    });
  });
  if (!rows || !rows.length) {
    var e = new Error('Account not found');
    e.status = 404;
    throw e;
  }
  var meters = await customerMeters.listForUser(UserID);
  return { user: rows[0], meterCount: meters.length, meters: meters };
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
        'UPDATE SystemUsers SET Password = ?, failed_login_count = 0, locked_until = NULL, token_version = token_version + 1 WHERE Email = ?',
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
