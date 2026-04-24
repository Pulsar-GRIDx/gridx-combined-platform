var adminService = require('./adminService');
var customerService = require('../customer/customerService');
var dotenv = require('dotenv');
var nodemailer = require('nodemailer');
var crypto = require('crypto');

// Configure dotenv
dotenv.config();
var environment = process.env;

// In-memory store for PINs (for production, use Redis or DB)
var pinStore = {};

// Configure nodemailer transporter
// Uses env vars if set, otherwise defaults to GoDaddy SMTP for gridx-meters.com
var SMTP_EMAIL = process.env.EMAIL || 'info@gridx-meters.com';
var SMTP_KEY = process.env.EMAIL_KEY || 'W9h8B_Ykd!UgWgM';
var SMTP_HOST = process.env.EMAIL_HOST || 'smtpout.secureserver.net';
var SMTP_PORT = process.env.EMAIL_PORT || 465;

var transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: true,
  auth: {
    user: SMTP_EMAIL,
    pass: SMTP_KEY,
  },
});
console.log('[Email] Using SMTP transport:', SMTP_HOST, 'as', SMTP_EMAIL);

var EMAIL_FROM = process.env.EMAIL || 'noreply@gridx-meters.com';

// ═══════════════════════════════════════════════════════════════════════════
// Helper: resolve client IP from request headers
// ═══════════════════════════════════════════════════════════════════════════
function resolveClientIp(request) {
  var candidates = [];

  var forwardedFor = request.headers['x-forwarded-for'];
  if (forwardedFor) {
    var raw = Array.isArray(forwardedFor) ? forwardedFor.join(',') : String(forwardedFor);
    raw.split(',').forEach(function(ip) {
      var trimmed = ip.trim();
      if (trimmed) candidates.push(trimmed);
    });
  }

  var realIpHeader = request.headers['x-real-ip'];
  if (realIpHeader) {
    if (Array.isArray(realIpHeader)) {
      realIpHeader.forEach(function(ip) { candidates.push(ip); });
    } else {
      candidates.push(realIpHeader);
    }
  }

  if (Array.isArray(request.ips) && request.ips.length > 0) {
    request.ips.forEach(function(ip) { candidates.push(ip); });
  }

  [request.ip, request.socket && request.socket.remoteAddress, request.connection && request.connection.remoteAddress]
    .filter(Boolean)
    .forEach(function(ip) { candidates.push(ip); });

  function normalizeIp(ip) {
    if (!ip) return null;
    if (ip === '::1') return '127.0.0.1';
    if (ip.indexOf('::ffff:') === 0) return ip.substring(7);
    return ip;
  }

  var preferred = null;
  for (var i = 0; i < candidates.length; i++) {
    if (candidates[i] && candidates[i] !== '::1' && candidates[i] !== '127.0.0.1') {
      preferred = candidates[i];
      break;
    }
  }
  if (!preferred) {
    for (var j = 0; j < candidates.length; j++) {
      if (candidates[j]) { preferred = candidates[j]; break; }
    }
  }
  return normalizeIp(preferred);
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN SIGNUP — now requires authentication + ADMIN role
// ═══════════════════════════════════════════════════════════════════════════
exports.adminSignup = async function(req, res) {
  try {
    var body = req.body;
    var Username = body.Username;
    var Password = body.Password;
    var FirstName = body.FirstName;
    var LastName = body.LastName;
    var Email = body.Email;
    var IsActive = body.IsActive;
    var RoleName = body.RoleName;
    var AccessLevel = body.AccessLevel;
    var accessType = body.access_type;
    var companyName = body.company_name;
    var installerType = body.installer_type;

    if (!Username || !Password || !Email) {
      return res.status(400).json({ error: 'Username, Password, and Email are required' });
    }

    // Check that caller is ADMIN
    if (!req.user || req.user.AccessLevel !== 'ADMIN') {
      return res.status(403).json({ error: 'Only administrators can create new users' });
    }

    // Validate technician fields
    if (AccessLevel === 'TECHNICIAN') {
      if (!companyName) {
        return res.status(400).json({ error: 'Company name is required for technician accounts' });
      }
      if (!installerType || ['INTERNAL', 'THIRD_PARTY'].indexOf(installerType) === -1) {
        return res.status(400).json({ error: 'Installer type (INTERNAL or THIRD_PARTY) is required for technician accounts' });
      }
    }

    await adminService.registerAdmin(Username, Password, FirstName, LastName, Email, IsActive, RoleName, AccessLevel, accessType, companyName, installerType);

    // Audit log
    var ipAddress = resolveClientIp(req);
    var geoStr = adminService.getGeoString(ipAddress);
    adminService.logPlatformAudit(
      'New user created: ' + Email + ' (role: ' + (AccessLevel || 'OPERATOR') + ')',
      'USER_CREATE',
      'Created by: ' + req.user.Email,
      Email, null, ipAddress, geoStr, req.headers['user-agent']
    );

    res.status(201).json({ message: 'Registration successful' });
  } catch (error) {
    console.error('Error during registration:', error);
    res.status(500).json({ error: 'Registration failed', details: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN SIGN IN — with lockout, audit logging, 2FA check
// ═══════════════════════════════════════════════════════════════════════════
exports.signIn = async function(req, res) {
  try {
    var body = req.body;
    var Email = body.Email;
    var Password = body.Password;
    var GuestID = body.GuestID;
    var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(Email)) {
      return res.status(400).json({ error: 'Invalid email syntax' });
    }

    var ipAddress = resolveClientIp(req);
    var userAgent = req.headers['user-agent'] || '';

    var result = await adminService.signIn(Email, Password, GuestID, ipAddress, userAgent);

    // Check if 2FA is enabled — if so, return partial response requiring 2FA verification
    if (result.user.twofa_enabled === 1) {
      return res.status(200).json({
        message: '2FA verification required',
        requires2FA: true,
        tempToken: result.token,
        user: { email: result.user.email, Admin_ID: result.user.Admin_ID }
      });
    }

    // Set the access token in a cookie
    var isSecure = environment.FRONTEND_DOMAIN && environment.FRONTEND_DOMAIN.indexOf('https://') === 0;
    res.cookie('accessToken', result.token, {
      httpOnly: true,
      secure: isSecure,
      maxAge: 60 * 60 * 1000,
      domain: environment.DOMAIN,
      path: '/',
      sameSite: 'Lax',
    });

    res.status(200).json({
      message: 'Admin signed in successfully',
      token: result.token,
      user: result.user,
    });
  } catch (error) {
    console.error('Error during sign-in:', error);
    var statusCode = error.status || 500;
    var errorMsg = error.message || 'Sign-in failed';

    if (statusCode === 404) {
      return res.status(404).json({ error: 'Email not found' });
    } else if (statusCode === 401) {
      return res.status(401).json({ error: errorMsg });
    } else if (statusCode === 403) {
      return res.status(403).json({ error: errorMsg });
    } else if (statusCode === 423) {
      return res.status(423).json({ error: errorMsg });
    }
    res.status(500).json({ error: 'Sign-in failed', details: errorMsg });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// 2FA VERIFY — second step after password login when 2FA is enabled
// ═══════════════════════════════════════════════════════════════════════════
exports.verify2FALogin = async function(req, res) {
  try {
    var body = req.body;
    var Admin_ID = body.Admin_ID;
    var code = body.code;
    var tempToken = body.tempToken;

    if (!Admin_ID || !code || !tempToken) {
      return res.status(400).json({ error: 'Admin_ID, code, and tempToken are required' });
    }

    // Verify the temp token is valid
    var jwt = require('jsonwebtoken');
    var decoded;
    try {
      decoded = jwt.verify(tempToken, process.env.SECRET_KEY);
    } catch (e) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    if (decoded.Admin_ID !== Admin_ID) {
      return res.status(403).json({ error: 'Token mismatch' });
    }

    // Verify the 2FA code
    await adminService.verify2FA(Admin_ID, code);

    // 2FA passed — set cookie and return full response
    var isSecure = environment.FRONTEND_DOMAIN && environment.FRONTEND_DOMAIN.indexOf('https://') === 0;
    res.cookie('accessToken', tempToken, {
      httpOnly: true,
      secure: isSecure,
      maxAge: 60 * 60 * 1000,
      domain: environment.DOMAIN,
      path: '/',
      sameSite: 'Lax',
    });

    var adminData = await adminService.getAdminData(Admin_ID);
    var ipAddress = resolveClientIp(req);
    var geoStr = adminService.getGeoString(ipAddress);
    adminService.logPlatformAudit('2FA verified for: ' + decoded.Email, '2FA', '2FA login completed', decoded.Email, Admin_ID, ipAddress, geoStr, req.headers['user-agent']);

    res.status(200).json({
      message: '2FA verified successfully',
      token: tempToken,
      user: adminData
    });
  } catch (error) {
    console.error('2FA verification error:', error);
    res.status(400).json({ error: error.message || 'Invalid 2FA code' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// 2FA SETUP — generate secret and enable
// ═══════════════════════════════════════════════════════════════════════════
exports.setup2FA = async function(req, res) {
  try {
    var Admin_ID = req.user.Admin_ID;
    var secret = await adminService.generate2FASecret(Admin_ID);

    // Generate current TOTP code for initial setup verification
    var timeWindow = Math.floor(Date.now() / 30000);
    var hmac = crypto.createHmac('sha1', secret);
    hmac.update(String(timeWindow));
    var hash = hmac.digest('hex');
    var offset = parseInt(hash.slice(-1), 16);
    var otp = (parseInt(hash.substr(offset * 2, 8), 16) & 0x7fffffff) % 1000000;
    var currentCode = String(otp);
    while (currentCode.length < 6) currentCode = '0' + currentCode;

    var ipAddress = resolveClientIp(req);
    var geoStr = adminService.getGeoString(ipAddress);
    adminService.logPlatformAudit('2FA setup initiated for: ' + req.user.Email, '2FA', 'Secret generated', req.user.Email, Admin_ID, ipAddress, geoStr, req.headers['user-agent']);

    res.json({
      message: '2FA secret generated. Use this secret in your authenticator app.',
      secret: secret,
      currentCode: currentCode,
      instructions: 'Enter the 6-digit code from your authenticator app to enable 2FA.'
    });
  } catch (error) {
    console.error('2FA setup error:', error);
    res.status(500).json({ error: 'Failed to set up 2FA', details: error.message });
  }
};

exports.enable2FA = async function(req, res) {
  try {
    var Admin_ID = req.user.Admin_ID;
    var code = req.body.code;

    if (!code) {
      return res.status(400).json({ error: '2FA code is required for verification' });
    }

    // Verify the code before enabling
    await adminService.verify2FA(Admin_ID, code);
    await adminService.enable2FA(Admin_ID);

    var ipAddress = resolveClientIp(req);
    var geoStr = adminService.getGeoString(ipAddress);
    adminService.logPlatformAudit('2FA enabled for: ' + req.user.Email, '2FA', '2FA activated', req.user.Email, Admin_ID, ipAddress, geoStr, req.headers['user-agent']);

    res.json({ message: '2FA enabled successfully' });
  } catch (error) {
    console.error('2FA enable error:', error);
    res.status(400).json({ error: error.message || 'Failed to enable 2FA' });
  }
};

exports.disable2FA = async function(req, res) {
  try {
    var Admin_ID = req.params.Admin_ID || req.user.Admin_ID;

    // Only ADMIN can disable others' 2FA, or user can disable their own
    if (Admin_ID !== req.user.Admin_ID && req.user.AccessLevel !== 'ADMIN') {
      return res.status(403).json({ error: 'Only administrators can disable 2FA for other users' });
    }

    await adminService.disable2FA(Admin_ID);

    var ipAddress = resolveClientIp(req);
    var geoStr = adminService.getGeoString(ipAddress);
    adminService.logPlatformAudit('2FA disabled for Admin_ID: ' + Admin_ID, '2FA', 'Disabled by: ' + req.user.Email, req.user.Email, Admin_ID, ipAddress, geoStr, req.headers['user-agent']);

    res.json({ message: '2FA disabled successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to disable 2FA', details: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// FORGOT PASSWORD FLOW (3 steps — public, no auth required)
// ═══════════════════════════════════════════════════════════════════════════

exports.forgotPassword = async function(req, res) {
  var Email = req.body.Email;
  if (!Email) return res.status(400).json({ error: 'Email is required' });

  try {
    var user = await adminService.getAdminByEmail(Email);
    if (!user) return res.status(404).json({ error: 'Email not found' });

    // Generate 6-digit PIN
    var pin = String(Math.floor(100000 + Math.random() * 900000));
    pinStore[Email] = { pin: pin, expires: Date.now() + 10 * 60 * 1000 };

    // Send email
    await transporter.sendMail({
      from: '"GridX Meters" <' + EMAIL_FROM + '>',
      to: Email,
      subject: 'GridX Meters Password Reset Verification',
      html: '<p>Your password reset verification code is: <b>' + pin + '</b></p><p>This code is valid for 10 minutes.</p>'
    });

    var ipAddress = resolveClientIp(req);
    var geoStr = adminService.getGeoString(ipAddress);
    adminService.logPlatformAudit('Password reset requested: ' + Email, 'PASSWORD_RESET', 'Verification PIN sent', Email, user.Admin_ID, ipAddress, geoStr, req.headers['user-agent']);

    res.json({ message: 'Verification PIN sent to email' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send verification email', details: err.message });
  }
};

exports.verifyPin = function(req, res) {
  var Email = req.body.Email;
  var pin = req.body.pin;
  if (!Email || !pin) return res.status(400).json({ error: 'Email and PIN are required' });

  var record = pinStore[Email];
  if (!record || record.pin !== pin || Date.now() > record.expires) {
    return res.status(400).json({ error: 'Invalid or expired PIN' });
  }
  pinStore[Email].verified = true;
  res.json({ message: 'PIN verified. You may now reset your password.' });
};

exports.resetForgottenPassword = async function(req, res) {
  var Email = req.body.Email;
  var pin = req.body.pin;
  var newPassword = req.body.newPassword;
  if (!Email || !pin || !newPassword) return res.status(400).json({ error: 'Email, PIN, and new password are required' });

  var record = pinStore[Email];
  if (!record || record.pin !== pin || !record.verified || Date.now() > record.expires) {
    return res.status(400).json({ error: 'Invalid or expired PIN' });
  }

  try {
    await adminService.resetAdminPasswordByEmail(Email, newPassword);
    delete pinStore[Email];

    var ipAddress = resolveClientIp(req);
    var geoStr = adminService.getGeoString(ipAddress);
    adminService.logPlatformAudit('Password reset completed: ' + Email, 'PASSWORD_RESET', 'Password changed via forgot-password flow', Email, null, ipAddress, geoStr, req.headers['user-agent']);

    res.json({ message: 'Password reset successful' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset password', details: err.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// PROFILE & CRUD — all require authentication
// ═══════════════════════════════════════════════════════════════════════════

exports.getUserProfile = function(req, res) {
  var UserID = req.params.UserID;
  if (!UserID) {
    return res.status(400).json({ error: 'Invalid UserID' });
  }
  adminService.getUserProfile(UserID)
    .then(function(userProfile) { res.status(200).json(userProfile); })
    .catch(function(err) { res.status(500).json({ error: 'Failed to fetch user profile', details: err }); });
};

exports.getAllUsers = function(req, res) {
  adminService.getAllUsers()
    .then(function(users) { res.status(200).json(users); })
    .catch(function(err) { res.status(500).json({ error: 'Internal server error', details: err }); });
};

exports.getAllAdmins = function(req, res) {
  adminService.getAllAdmins()
    .then(function(users) { res.status(200).json({ users: users }); })
    .catch(function(err) { res.status(500).json({ error: 'Internal server error', details: err }); });
};

exports.updateUserInfo = function(req, res) {
  var UserID = req.params.UserID;
  var body = req.body;
  adminService.updateUserInfo(UserID, body.FirstName, body.Email, body.LastName, body.DRN)
    .then(function() { res.status(200).json({ message: 'User information updated successfully' }); })
    .catch(function(err) { res.status(500).json({ error: 'Internal server error', details: err }); });
};

exports.updateAdminInfo = function(req, res) {
  var Admin_ID = req.params.Admin_ID;
  var body = req.body;

  // Only ADMIN can update other admins
  if (String(Admin_ID) !== String(req.user.Admin_ID) && req.user.AccessLevel !== 'ADMIN') {
    return res.status(403).json({ error: 'Only administrators can update other users' });
  }

  adminService.updateAdminInfo(Admin_ID, body.FirstName, body.Email, body.LastName, body.AccessLevel, body.Username, body.access_type, body.company_name, body.installer_type)
    .then(function() {
      var ipAddress = resolveClientIp(req);
      var geoStr = adminService.getGeoString(ipAddress);
      adminService.logPlatformAudit('Admin updated: ID ' + Admin_ID, 'USER_UPDATE', 'Updated by: ' + req.user.Email + ' — fields: ' + Object.keys(body).join(', '), body.Email || req.user.Email, parseInt(Admin_ID), ipAddress, geoStr, req.headers['user-agent']);
      res.status(200).json({ message: 'Admin information updated successfully' });
    })
    .catch(function(err) { res.status(500).json({ error: 'Internal server error', details: err }); });
};

exports.deleteAdmin = function(req, res) {
  var Admin_ID = req.params.Admin_ID;

  // Only ADMIN can delete users
  if (req.user.AccessLevel !== 'ADMIN') {
    return res.status(403).json({ error: 'Only administrators can delete users' });
  }

  // Prevent self-deletion
  if (String(Admin_ID) === String(req.user.Admin_ID)) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }

  adminService.deleteAdmin(Admin_ID)
    .then(function() {
      var ipAddress = resolveClientIp(req);
      var geoStr = adminService.getGeoString(ipAddress);
      adminService.logPlatformAudit('Admin deleted: ID ' + Admin_ID, 'USER_DELETE', 'Deleted by: ' + req.user.Email, req.user.Email, parseInt(Admin_ID), ipAddress, geoStr, req.headers['user-agent']);
      res.status(200).json({ message: 'Admin deleted successfully' });
    })
    .catch(function(err) { res.status(500).json({ error: 'Internal server error', details: err }); });
};

exports.deleteUser = function(req, res) {
  var UserID = req.params.UserID;

  if (req.user.AccessLevel !== 'ADMIN') {
    return res.status(403).json({ error: 'Only administrators can delete users' });
  }

  customerService.deleteUser(UserID)
    .then(function() {
      var ipAddress = resolveClientIp(req);
      var geoStr = adminService.getGeoString(ipAddress);
      adminService.logPlatformAudit('App user deleted: ID ' + UserID, 'USER_DELETE', 'Deleted by: ' + req.user.Email, req.user.Email, parseInt(UserID), ipAddress, geoStr, req.headers['user-agent']);
      res.status(200).json({ message: 'User deleted successfully' });
    })
    .catch(function(err) {
      var status = err.status || 500;
      res.status(status).json({ error: err.message || 'Internal server error' });
    });
};

exports.updateAdminStatus = function(req, res) {
  var Admin_ID = req.params.Admin_ID;

  // Only ADMIN can toggle status
  if (req.user.AccessLevel !== 'ADMIN') {
    return res.status(403).json({ error: 'Only administrators can change account status' });
  }

  adminService.updateAdminStatus(Admin_ID)
    .then(function(newStatus) {
      var ipAddress = resolveClientIp(req);
      var geoStr = adminService.getGeoString(ipAddress);
      adminService.logPlatformAudit('Admin status changed: ID ' + Admin_ID + ' -> ' + (newStatus ? 'Active' : 'Inactive'), 'USER_UPDATE', 'Changed by: ' + req.user.Email, req.user.Email, parseInt(Admin_ID), ipAddress, geoStr, req.headers['user-agent']);
      res.status(200).json({ message: 'Admin status updated successfully', newStatus: newStatus });
    })
    .catch(function(err) { res.status(500).json({ error: 'Internal server error', details: err }); });
};

exports.resetAdminPassword = function(req, res) {
  var Admin_ID = req.params.Admin_ID;
  var Password = req.body.Password;

  if (!Password) {
    return res.status(400).json({ message: 'Please enter a new password' });
  }

  // Only ADMIN or self can reset password
  if (String(Admin_ID) !== String(req.user.Admin_ID) && req.user.AccessLevel !== 'ADMIN') {
    return res.status(403).json({ error: 'Only administrators can reset other users\' passwords' });
  }

  adminService.resetAdminPassword(Admin_ID, Password)
    .then(function() {
      var ipAddress = resolveClientIp(req);
      var geoStr = adminService.getGeoString(ipAddress);
      adminService.logPlatformAudit('Password reset for Admin_ID: ' + Admin_ID, 'PASSWORD_RESET', 'Reset by: ' + req.user.Email, req.user.Email, parseInt(Admin_ID), ipAddress, geoStr, req.headers['user-agent']);
      res.status(200).json({ message: 'Password updated successfully' });
    })
    .catch(function(err) { res.status(500).json({ error: 'Internal server error', details: err }); });
};

exports.getAdminData = function(req, res) {
  var Admin_ID = req.params.Admin_ID;
  if (!Admin_ID) {
    return res.status(400).json({ error: 'Invalid Admin_ID' });
  }
  adminService.getAdminData(Admin_ID)
    .then(function(adminData) { res.status(200).json(adminData); })
    .catch(function(err) { res.status(500).json({ error: 'Failed to fetch admin data', details: err }); });
};

// ═══════════════════════════════════════════════════════════════════════════
// UNLOCK ACCOUNT — ADMIN only
// ═══════════════════════════════════════════════════════════════════════════
exports.unlockAccount = function(req, res) {
  var Admin_ID = req.params.Admin_ID;

  if (req.user.AccessLevel !== 'ADMIN') {
    return res.status(403).json({ error: 'Only administrators can unlock accounts' });
  }

  var connection = require('../config/db');
  connection.query(
    'UPDATE SystemAdmins SET failed_login_count = 0, locked_until = NULL WHERE Admin_ID = ?',
    [Admin_ID],
    function(err) {
      if (err) return res.status(500).json({ error: 'Failed to unlock account', details: err.message });

      var ipAddress = resolveClientIp(req);
      var geoStr = adminService.getGeoString(ipAddress);
      adminService.logPlatformAudit('Account unlocked: ID ' + Admin_ID, 'SYSTEM', 'Unlocked by: ' + req.user.Email, req.user.Email, parseInt(Admin_ID), ipAddress, geoStr, req.headers['user-agent']);

      res.json({ message: 'Account unlocked successfully' });
    }
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// PLATFORM AUDIT LOG — ADMIN only
// ═══════════════════════════════════════════════════════════════════════════
exports.getPlatformAuditLog = async function(req, res) {
  try {
    if (req.user.AccessLevel !== 'ADMIN') {
      return res.status(403).json({ error: 'Only administrators can view the audit log' });
    }
    var logs = await adminService.getPlatformAuditLog(req.query);
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit log', details: error.message });
  }
};

exports.clearPlatformAuditLog = async function(req, res) {
  try {
    if (req.user.AccessLevel !== 'ADMIN') {
      return res.status(403).json({ error: 'Only administrators can clear the audit log' });
    }
    var result = await adminService.clearPlatformAuditLog();

    var ipAddress = resolveClientIp(req);
    var geoStr = adminService.getGeoString(ipAddress);
    adminService.logPlatformAudit('Audit log cleanup by: ' + req.user.Email, 'SYSTEM', 'Non-security entries removed', req.user.Email, req.user.Admin_ID, ipAddress, geoStr, req.headers['user-agent']);

    res.json({ success: true, message: 'Audit log cleaned', affectedRows: result.affectedRows });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear audit log', details: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// INSTALLER MANAGEMENT — ADMIN only
// ═══════════════════════════════════════════════════════════════════════════

exports.getAllInstallers = async function(req, res) {
  try {
    if (req.user.AccessLevel !== 'ADMIN') {
      return res.status(403).json({ error: 'Only administrators can view installers' });
    }
    var installers = await adminService.getAllInstallers();
    res.json({ success: true, installers: installers });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch installers', details: error.message });
  }
};

// Protected Resource Example
exports.protected = function(req, res) {
  res.json({ message: 'Protected resource accessed' });
};
