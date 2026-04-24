const connection = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
var geoip = require('geoip-lite');

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-MIGRATE: Add security columns if they don't exist
// ═══════════════════════════════════════════════════════════════════════════

// Helper: add column only if it doesn't exist (MySQL 5.7/8.0 compatible)
function addColumnIfNotExists(table, column, definition) {
  var checkSql = "SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?";
  connection.query(checkSql, [table, column], function(err, results) {
    if (err) { console.error('[Security] Check column error:', err.message); return; }
    if (results[0].cnt === 0) {
      var alterSql = 'ALTER TABLE ' + table + ' ADD COLUMN ' + column + ' ' + definition;
      connection.query(alterSql, function(err2) {
        if (err2 && err2.message.indexOf('Duplicate column') === -1) {
          console.error('[Security] Add column error:', err2.message);
        } else {
          console.log('[Security] Added column: ' + table + '.' + column);
        }
      });
    }
  });
}

// Add security columns to SystemAdmins
addColumnIfNotExists('SystemAdmins', 'failed_login_count', 'INT DEFAULT 0');
addColumnIfNotExists('SystemAdmins', 'locked_until', 'DATETIME DEFAULT NULL');
addColumnIfNotExists('SystemAdmins', 'last_failed_login', 'DATETIME DEFAULT NULL');
addColumnIfNotExists('SystemAdmins', 'twofa_secret', 'VARCHAR(64) DEFAULT NULL');
addColumnIfNotExists('SystemAdmins', 'twofa_enabled', 'TINYINT DEFAULT 0');
addColumnIfNotExists('SystemAdmins', 'access_type', "ENUM('PLATFORM','VENDING','BOTH') DEFAULT 'PLATFORM'");

// Technician-specific columns
addColumnIfNotExists('SystemAdmins', 'company_name', 'VARCHAR(200) DEFAULT NULL');
addColumnIfNotExists('SystemAdmins', 'installer_type', "ENUM('INTERNAL','THIRD_PARTY') DEFAULT NULL");
addColumnIfNotExists('SystemAdmins', 'display_password', 'VARCHAR(200) DEFAULT NULL');

// Platform Audit Log table (separate from vending AuditLog)
connection.query(
  "CREATE TABLE IF NOT EXISTS PlatformAuditLog (" +
  "  id INT AUTO_INCREMENT PRIMARY KEY," +
  "  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP," +
  "  event VARCHAR(255) NOT NULL," +
  "  type ENUM('LOGIN','LOGOUT','LOGIN_FAILED','LOCKOUT','PASSWORD_RESET','USER_CREATE','USER_UPDATE','USER_DELETE','2FA','SYSTEM') DEFAULT 'SYSTEM'," +
  "  detail TEXT," +
  "  user_email VARCHAR(100)," +
  "  user_id INT," +
  "  ip_address VARCHAR(50)," +
  "  geo_location VARCHAR(200)," +
  "  user_agent TEXT," +
  "  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP," +
  "  INDEX idx_timestamp (timestamp)," +
  "  INDEX idx_type (type)," +
  "  INDEX idx_user_id (user_id)," +
  "  INDEX idx_ip (ip_address)" +
  ")",
  function(err) {
    if (err && err.message.indexOf('already exists') === -1) {
      console.error('[Security] PlatformAuditLog error:', err.message);
    }
  }
);

console.log('[Security] Security migrations applied');

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
// REGISTER ADMIN (admin-only, no self-registration)
// ═══════════════════════════════════════════════════════════════════════════

exports.registerAdmin = async function(Username, Password, FirstName, LastName, Email, IsActive, RoleName, AccessLevel, accessType, companyName, installerType) {
  var hashedPassword = await bcrypt.hash(Password, 12);
  var displayPw = (AccessLevel === 'TECHNICIAN') ? Password : null;
  return new Promise(function(resolve, reject) {
    connection.query(
      'INSERT INTO SystemAdmins (Username, Password, FirstName, LastName, Email, IsActive, RoleName, AccessLevel, access_type, company_name, installer_type, display_password) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [Username, hashedPassword, FirstName, LastName, Email, IsActive || 1, RoleName || AccessLevel, AccessLevel || 'OPERATOR', accessType || 'PLATFORM', companyName || null, installerType || null, displayPw],
      function(err, result) {
        if (err) {
          console.error('Registration error:', err);
          reject(err);
        } else {
          resolve(result);
        }
      }
    );
  });
};

// ═══════════════════════════════════════════════════════════════════════════
// SIGN IN — with lockout, audit logging, geolocation
// ═══════════════════════════════════════════════════════════════════════════

exports.signIn = async function(Email, Password, GuestID, ipAddress, userAgent) {
  if (!Email || !Password) {
    throw new Error('Email and password are required');
  }

  var geoStr = getGeoString(ipAddress);

  // Find admin by email
  var admin = await new Promise(function(resolve, reject) {
    connection.query('SELECT * FROM SystemAdmins WHERE Email = ?', [Email], function(err, results) {
      if (err) return reject(err);
      if (!results || results.length === 0) {
        var notFoundError = new Error('Email not found');
        notFoundError.status = 404;
        reject(notFoundError);
      } else {
        resolve(results[0]);
      }
    });
  });

  // Check if account is active
  if (!admin.IsActive) {
    logPlatformAudit('Login attempt on inactive account: ' + Email, 'LOGIN_FAILED', 'Account is deactivated', Email, admin.Admin_ID, ipAddress, geoStr, userAgent);
    var inactiveErr = new Error('Account is deactivated. Contact your administrator.');
    inactiveErr.status = 403;
    throw inactiveErr;
  }

  // Check if account is locked
  if (admin.locked_until && new Date(admin.locked_until) > new Date()) {
    var remainingMin = Math.ceil((new Date(admin.locked_until) - new Date()) / 60000);
    logPlatformAudit('Login attempt on locked account: ' + Email, 'LOCKOUT', 'Account locked, ' + remainingMin + ' min remaining', Email, admin.Admin_ID, ipAddress, geoStr, userAgent);
    var lockErr = new Error('Account is locked due to too many failed attempts. Try again in ' + remainingMin + ' minutes.');
    lockErr.status = 423;
    throw lockErr;
  }

  // Verify password
  var isMatch = await bcrypt.compare(Password, admin.Password);
  if (!isMatch) {
    // Increment failed count
    var newFailCount = (admin.failed_login_count || 0) + 1;
    var lockUntil = null;
    if (newFailCount >= MAX_FAILED_ATTEMPTS) {
      lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MIN * 60 * 1000);
      logPlatformAudit('Account locked after ' + newFailCount + ' failed attempts: ' + Email, 'LOCKOUT', 'Locked until ' + lockUntil.toISOString(), Email, admin.Admin_ID, ipAddress, geoStr, userAgent);
    }
    connection.query(
      'UPDATE SystemAdmins SET failed_login_count = ?, locked_until = ?, last_failed_login = NOW() WHERE Admin_ID = ?',
      [newFailCount, lockUntil, admin.Admin_ID],
      function() {}
    );
    logPlatformAudit('Failed login attempt (' + newFailCount + '/' + MAX_FAILED_ATTEMPTS + '): ' + Email, 'LOGIN_FAILED', 'Incorrect password', Email, admin.Admin_ID, ipAddress, geoStr, userAgent);
    var mismatchError = new Error('Incorrect password. ' + (MAX_FAILED_ATTEMPTS - newFailCount) + ' attempts remaining before lockout.');
    mismatchError.status = 401;
    throw mismatchError;
  }

  // Successful login — reset failed count, update login info
  var loginTimestamp = new Date();
  await new Promise(function(resolve, reject) {
    connection.query(
      'UPDATE SystemAdmins SET login_count = COALESCE(login_count, 0) + 1, lastLoginTime = ?, ip_address = ?, failed_login_count = 0, locked_until = NULL WHERE Admin_ID = ?',
      [loginTimestamp, ipAddress || null, admin.Admin_ID],
      function(err) { if (err) reject(err); else resolve(); }
    );
  });

  // Log successful login
  logPlatformAudit('Successful login: ' + Email, 'LOGIN', 'Role: ' + (admin.AccessLevel || 'N/A') + ', IP: ' + (ipAddress || 'N/A') + ', Location: ' + geoStr, Email, admin.Admin_ID, ipAddress, geoStr, userAgent);

  // Generate JWT
  var token = jwt.sign(
    { Admin_ID: admin.Admin_ID, Email: admin.Email, AccessLevel: admin.AccessLevel, access_type: admin.access_type },
    process.env.SECRET_KEY,
    { expiresIn: '1h' }
  );

  return {
    token: token,
    user: {
      Admin_ID: admin.Admin_ID,
      email: admin.Email,
      name: admin.Username,
      FirstName: admin.FirstName,
      LastName: admin.LastName,
      AccessLevel: admin.AccessLevel,
      access_type: admin.access_type || 'PLATFORM',
      twofa_enabled: admin.twofa_enabled || 0,
      lastLoginTime: loginTimestamp,
      ip_address: ipAddress || null,
      geo_location: geoStr,
    }
  };
};

// ═══════════════════════════════════════════════════════════════════════════
// 2FA — TOTP-compatible secret generation and verification
// ═══════════════════════════════════════════════════════════════════════════

exports.generate2FASecret = function(Admin_ID) {
  var secret = crypto.randomBytes(20).toString('hex');
  return new Promise(function(resolve, reject) {
    connection.query('UPDATE SystemAdmins SET twofa_secret = ? WHERE Admin_ID = ?', [secret, Admin_ID], function(err) {
      if (err) return reject(err);
      resolve(secret);
    });
  });
};

exports.verify2FA = function(Admin_ID, code) {
  return new Promise(function(resolve, reject) {
    connection.query('SELECT twofa_secret FROM SystemAdmins WHERE Admin_ID = ?', [Admin_ID], function(err, results) {
      if (err) return reject(err);
      if (!results || results.length === 0) return reject(new Error('Admin not found'));
      var secret = results[0].twofa_secret;
      if (!secret) return reject(new Error('2FA not configured'));

      // Time-based verification: generate code from secret and current time window
      var timeWindow = Math.floor(Date.now() / 30000);
      var validCodes = [];
      for (var i = -1; i <= 1; i++) {
        var hmac = crypto.createHmac('sha1', secret);
        hmac.update(String(timeWindow + i));
        var hash = hmac.digest('hex');
        var offset = parseInt(hash.slice(-1), 16);
        var otp = (parseInt(hash.substr(offset * 2, 8), 16) & 0x7fffffff) % 1000000;
        validCodes.push(String(otp).padStart(6, '0'));
      }
      if (validCodes.indexOf(code) !== -1) {
        resolve(true);
      } else {
        reject(new Error('Invalid 2FA code'));
      }
    });
  });
};

exports.enable2FA = function(Admin_ID) {
  return new Promise(function(resolve, reject) {
    connection.query('UPDATE SystemAdmins SET twofa_enabled = 1 WHERE Admin_ID = ?', [Admin_ID], function(err) {
      if (err) reject(err); else resolve();
    });
  });
};

exports.disable2FA = function(Admin_ID) {
  return new Promise(function(resolve, reject) {
    connection.query('UPDATE SystemAdmins SET twofa_enabled = 0, twofa_secret = NULL WHERE Admin_ID = ?', [Admin_ID], function(err) {
      if (err) reject(err); else resolve();
    });
  });
};

// ═══════════════════════════════════════════════════════════════════════════
// USER / ADMIN CRUD
// ═══════════════════════════════════════════════════════════════════════════

exports.getUserProfile = function(UserID) {
  return new Promise(function(resolve, reject) {
    connection.query('SELECT FirstName, Email FROM SystemUsers WHERE UserID = ?', [UserID], function(err, results) {
      if (err) reject(err); else resolve(results[0]);
    });
  });
};

exports.getAllUsers = function() {
  return new Promise(function(resolve, reject) {
    connection.query('SELECT UserID, FirstName, LastName, Email, DRN, isVerified, login_count, lastLoginTime, ip_address FROM SystemUsers', function(err, results) {
      if (err) reject(err); else resolve(results);
    });
  });
};

exports.getAllAdmins = function() {
  return new Promise(function(resolve, reject) {
    connection.query(
      "SELECT Admin_ID, Username, FirstName, LastName, Email, IsActive, AccessLevel, access_type, twofa_enabled, lastLoginTime, ip_address, login_count, company_name, installer_type FROM SystemAdmins WHERE AccessLevel != 'TECHNICIAN'",
      function(err, results) {
        if (err) reject(err); else resolve(results);
      }
    );
  });
};

exports.getAllInstallers = function() {
  return new Promise(function(resolve, reject) {
    connection.query(
      "SELECT Admin_ID, Username, FirstName, LastName, Email, IsActive, AccessLevel, access_type, company_name, installer_type, display_password, lastLoginTime FROM SystemAdmins WHERE AccessLevel = 'TECHNICIAN'",
      function(err, results) {
        if (err) reject(err); else resolve(results);
      }
    );
  });
};

exports.updateUserInfo = function(UserID, FirstName, Email, LastName, DRN) {
  return new Promise(function(resolve, reject) {
    connection.query('UPDATE SystemUsers SET FirstName = ?, Email = ?, LastName = ?, DRN = ? WHERE UserID = ?',
      [FirstName, Email, LastName, DRN, UserID], function(err, results) {
        if (err) reject(err); else resolve(results);
      });
  });
};

exports.updateAdminInfo = function(Admin_ID, FirstName, Email, LastName, AccessLevel, Username, accessType, companyName, installerType) {
  return new Promise(function(resolve, reject) {
    var sql = 'UPDATE SystemAdmins SET FirstName = ?, Email = ?, LastName = ?, AccessLevel = ?, Username = ?';
    var params = [FirstName, Email, LastName, AccessLevel, Username];
    if (accessType) {
      sql += ', access_type = ?';
      params.push(accessType);
    }
    // Technician fields — always update (set to null if not TECHNICIAN)
    sql += ', company_name = ?, installer_type = ?';
    params.push(companyName || null);
    params.push(installerType || null);
    sql += ' WHERE Admin_ID = ?';
    params.push(Admin_ID);
    connection.query(sql, params, function(err, results) {
      if (err) reject(err); else resolve(results);
    });
  });
};

exports.deleteAdmin = function(Admin_ID) {
  return new Promise(function(resolve, reject) {
    connection.query('DELETE FROM SystemAdmins WHERE Admin_ID = ?', [Admin_ID], function(err, results) {
      if (err) reject(err); else resolve(results);
    });
  });
};

exports.updateAdminStatus = function(Admin_ID) {
  return new Promise(function(resolve, reject) {
    connection.query('SELECT * FROM SystemAdmins WHERE Admin_ID = ?', [Admin_ID], function(err, results) {
      if (err) return reject(err);
      if (!results || results.length === 0) return reject(new Error('Admin not found'));
      var newStatus = results[0].IsActive === 1 ? 0 : 1;
      connection.query('UPDATE SystemAdmins SET IsActive = ? WHERE Admin_ID = ?', [newStatus, Admin_ID], function(err2) {
        if (err2) reject(err2); else resolve(newStatus);
      });
    });
  });
};

exports.resetAdminPassword = function(Admin_ID, Password) {
  return new Promise(function(resolve, reject) {
    bcrypt.hash(Password, 12, function(err, hashedPassword) {
      if (err) return reject(err);
      connection.query('UPDATE SystemAdmins SET Password = ?, failed_login_count = 0, locked_until = NULL WHERE Admin_ID = ?',
        [hashedPassword, Admin_ID], function(err2) {
          if (err2) reject(err2); else resolve();
        });
    });
  });
};

exports.getAdminData = function(Admin_ID) {
  return new Promise(function(resolve, reject) {
    connection.query('SELECT Admin_ID, Username, FirstName, LastName, Email, IsActive, AccessLevel, access_type, twofa_enabled, lastLoginTime, ip_address, company_name, installer_type FROM SystemAdmins WHERE Admin_ID = ?', [Admin_ID], function(err, results) {
      if (err) reject(err); else resolve(results[0]);
    });
  });
};

exports.getAdminByEmail = function(Email) {
  return new Promise(function(resolve, reject) {
    connection.query('SELECT * FROM SystemAdmins WHERE Email = ?', [Email], function(err, results) {
      if (err) reject(err); else resolve(results[0]);
    });
  });
};

exports.resetAdminPasswordByEmail = function(Email, Password) {
  return new Promise(function(resolve, reject) {
    bcrypt.hash(Password, 12, function(err, hashedPassword) {
      if (err) return reject(err);
      connection.query('UPDATE SystemAdmins SET Password = ?, failed_login_count = 0, locked_until = NULL WHERE Email = ?',
        [hashedPassword, Email], function(err2) {
          if (err2) reject(err2); else resolve();
        });
    });
  });
};

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT LOG QUERIES
// ═══════════════════════════════════════════════════════════════════════════

exports.getPlatformAuditLog = function(params) {
  var sql = 'SELECT * FROM PlatformAuditLog WHERE 1=1';
  var values = [];
  if (params && params.type) { sql += ' AND type = ?'; values.push(params.type); }
  if (params && params.user_email) { sql += ' AND user_email LIKE ?'; values.push('%' + params.user_email + '%'); }
  if (params && params.from) { sql += ' AND timestamp >= ?'; values.push(params.from); }
  if (params && params.to) { sql += ' AND timestamp <= ?'; values.push(params.to); }
  sql += ' ORDER BY timestamp DESC LIMIT 500';
  return new Promise(function(resolve, reject) {
    connection.query(sql, values, function(err, results) {
      if (err) reject(err); else resolve(results || []);
    });
  });
};

exports.clearPlatformAuditLog = function() {
  return new Promise(function(resolve, reject) {
    connection.query('DELETE FROM PlatformAuditLog WHERE type NOT IN ("LOGIN", "LOGIN_FAILED", "LOCKOUT", "PASSWORD_RESET", "2FA")', function(err, result) {
      if (err) reject(err); else resolve(result);
    });
  });
};

// Export audit helper for use in controllers
exports.logPlatformAudit = logPlatformAudit;
exports.getGeoString = getGeoString;
