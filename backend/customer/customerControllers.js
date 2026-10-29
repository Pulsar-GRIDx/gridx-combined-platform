var crypto = require('crypto');
var customerService = require('./customerService');
var customerMeters = require('../services/customerMeterService');
var meterValidation = require('./meterValidationController');
var tokens = require('../middleware/tokens');
var dotenv = require('dotenv');
var nodemailer = require('nodemailer');

dotenv.config();

// Configure nodemailer transporter. Credentials come from the environment
// only (EMAIL, EMAIL_KEY, EMAIL_HOST, EMAIL_PORT); there is no built-in
// fallback password.
var SMTP_EMAIL = process.env.EMAIL || 'info@gridx-meters.com';
var SMTP_KEY = process.env.EMAIL_KEY;
var SMTP_HOST = process.env.EMAIL_HOST || 'smtpout.secureserver.net';
var SMTP_PORT = process.env.EMAIL_PORT || 465;

if (!SMTP_KEY) console.warn('[CustomerAuth] EMAIL_KEY is not set - password-reset emails cannot be sent');

var transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: true,
  auth: {
    user: SMTP_EMAIL,
    pass: SMTP_KEY,
  },
});

var EMAIL_FROM = SMTP_EMAIL;

// ═══════════════════════════════════════════════════════════════════════════
// Password-reset PINs
//
// In memory, keyed by lower-cased email, holding only a hash of the PIN.
//   - 10 minute expiry
//   - 5 wrong guesses burn the PIN (a 6-digit PIN cannot be brute-forced)
//   - at most 3 PIN emails per address per hour, 10 requests per IP per hour
// ═══════════════════════════════════════════════════════════════════════════
var PIN_TTL_MS = 10 * 60 * 1000;
var PIN_MAX_ATTEMPTS = 5;
var PIN_SENDS_PER_HOUR = 3;
var RESET_REQUESTS_PER_IP_PER_HOUR = 10;
var HOUR_MS = 60 * 60 * 1000;

var customerPinStore = {};
var pinSendLog = {};
var ipRequestLog = {};

function emailKey(email) { return String(email || '').trim().toLowerCase(); }
function hashPin(pin) { return crypto.createHash('sha256').update(String(pin)).digest('hex'); }

function recentCount(log, key) {
  var now = Date.now();
  log[key] = (log[key] || []).filter(function(t) { return now - t < HOUR_MS; });
  return log[key].length;
}

// Returns the record when the PIN matches; otherwise counts the attempt.
function checkPin(email, pin) {
  var key = emailKey(email);
  var record = customerPinStore[key];
  if (!record) return null;
  if (Date.now() > record.expires || record.attempts >= PIN_MAX_ATTEMPTS) {
    delete customerPinStore[key];
    return null;
  }
  var a = Buffer.from(record.pinHash, 'hex');
  var b = Buffer.from(hashPin(pin), 'hex');
  if (!crypto.timingSafeEqual(a, b)) {
    record.attempts++;
    if (record.attempts >= PIN_MAX_ATTEMPTS) delete customerPinStore[key];
    return null;
  }
  return record;
}

setInterval(function() {
  var now = Date.now();
  Object.keys(customerPinStore).forEach(function(k) { if (now > customerPinStore[k].expires) delete customerPinStore[k]; });
  Object.keys(pinSendLog).forEach(function(k) { if (!recentCount(pinSendLog, k)) delete pinSendLog[k]; });
  Object.keys(ipRequestLog).forEach(function(k) { if (!recentCount(ipRequestLog, k)) delete ipRequestLog[k]; });
}, 5 * 60 * 1000).unref();

// ═══════════════════════════════════════════════════════════════════════════
// Helper: resolve client IP
// ═══════════════════════════════════════════════════════════════════════════
function resolveClientIp(request) {
  var forwardedFor = request.headers['x-forwarded-for'];
  if (forwardedFor) {
    var raw = Array.isArray(forwardedFor) ? forwardedFor.join(',') : String(forwardedFor);
    var parts = raw.split(',');
    for (var i = 0; i < parts.length; i++) {
      var ip = parts[i].trim();
      if (ip && ip !== '::1' && ip !== '127.0.0.1') return ip;
    }
  }
  var realIp = request.headers['x-real-ip'];
  if (realIp) return realIp;
  var connIp = request.ip || (request.socket && request.socket.remoteAddress);
  if (connIp === '::1') return '127.0.0.1';
  if (connIp && connIp.indexOf('::ffff:') === 0) return connIp.substring(7);
  return connIp || '127.0.0.1';
}

function sendError(res, error, fallback) {
  var statusCode = error.status || 500;
  var body = { error: statusCode === 500 ? fallback : (error.message || fallback) };
  if (error.code && typeof error.code === 'string' && /^[A-Z_]+$/.test(error.code)) body.code = error.code;
  res.status(statusCode).json(body);
}

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMER SIGNUP
// ═══════════════════════════════════════════════════════════════════════════
exports.signup = async function(req, res) {
  try {
    var body = req.body;
    var Email = body.Email;
    var Password = body.Password;
    var FirstName = body.FirstName;
    var LastName = body.LastName;
    var DRN = body.DRN;
    var Phone = body.Phone;
    var validationToken = body.validationToken;

    var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!Email || !emailRegex.test(Email)) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }
    if (!Password || Password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (!DRN) {
      return res.status(400).json({ error: 'Meter number (DRN) is required' });
    }

    var result = await customerService.signup(Email, Password, FirstName, LastName, String(DRN), Phone, validationToken);

    var ipAddress = resolveClientIp(req);
    var geoStr = customerService.getGeoString(ipAddress);
    customerService.logPlatformAudit('Customer registered: ' + Email + ' (DRN: ' + DRN + ')', 'USER_CREATE', 'Self-registration, meter-button verified', Email, result.user.UserID, ipAddress, geoStr, req.headers['user-agent']);

    res.status(201).json({
      message: 'Registration successful',
      token: result.token,
      user: result.user,
      meterCount: result.meterCount,
      meters: result.meters
    });
  } catch (error) {
    console.error('Customer signup error:', error.message);
    sendError(res, error, 'Registration failed');
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMER SIGN IN — email + password (+ optional meter number)
// ═══════════════════════════════════════════════════════════════════════════
exports.signIn = async function(req, res) {
  try {
    var body = req.body;
    var Email = body.Email;
    var DRN = body.DRN;
    var Password = body.Password;

    var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!Email || !emailRegex.test(Email)) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }
    if (!Password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    var ipAddress = resolveClientIp(req);
    var userAgent = req.headers['user-agent'] || '';

    var result = await customerService.signIn(Email, DRN, Password, ipAddress, userAgent);

    res.status(200).json({
      message: result.message,
      token: result.token,
      user: result.user,
      meterCount: result.meterCount,
      meters: result.meters
    });
  } catch (error) {
    if (!error.status) console.error('Customer signin error:', error.message);
    sendError(res, error, 'Sign-in failed');
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMER FORGOT PASSWORD (3-step flow)
//
// forgot-password answers the same way whether or not the address has an
// account, so it cannot be used to discover customers.
// ═══════════════════════════════════════════════════════════════════════════
var GENERIC_RESET_MESSAGE = 'If an account exists for that email, a verification code has been sent to it';

exports.forgotPassword = async function(req, res) {
  var Email = req.body.Email || req.body.email;
  if (!Email) return res.status(400).json({ error: 'Email is required' });
  var key = emailKey(Email);
  var ipAddress = resolveClientIp(req);

  if (recentCount(ipRequestLog, ipAddress) >= RESET_REQUESTS_PER_IP_PER_HOUR) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  ipRequestLog[ipAddress].push(Date.now());

  try {
    var user = await customerService.getUserByEmail(Email);
    if (!user || recentCount(pinSendLog, key) >= PIN_SENDS_PER_HOUR) {
      return res.json({ message: GENERIC_RESET_MESSAGE });
    }

    var pin = String(crypto.randomInt(100000, 1000000));
    customerPinStore[key] = { pinHash: hashPin(pin), expires: Date.now() + PIN_TTL_MS, attempts: 0, verified: false };
    pinSendLog[key].push(Date.now());

    await transporter.sendMail({
      from: '"Pulsar GRIDx meter" <' + EMAIL_FROM + '>',
      to: user.Email,
      subject: 'Pulsar GRIDx meter - Password Reset Code',
      html: '<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;">' +
        '<h2 style="color:#2E7D32;">Pulsar GRIDx meter</h2>' +
        '<p>You requested a password reset. Your verification code is:</p>' +
        '<div style="background:#f5f5f5;padding:15px;text-align:center;font-size:28px;font-weight:bold;letter-spacing:6px;color:#2E7D32;border-radius:8px;">' + pin + '</div>' +
        '<p style="margin-top:15px;">This code is valid for <b>10 minutes</b>.</p>' +
        '<p style="color:#888;font-size:12px;">If you did not request this, please ignore this email.</p>' +
        '</div>'
    });

    var geoStr = customerService.getGeoString(ipAddress);
    customerService.logPlatformAudit('Customer password reset requested: ' + Email, 'PASSWORD_RESET', 'PIN sent', Email, user.UserID, ipAddress, geoStr, req.headers['user-agent']);
    res.json({ message: GENERIC_RESET_MESSAGE });
  } catch (err) {
    // Logged without the address; the response stays generic.
    console.error('[CustomerAuth] forgot-password error:', err.code || err.message);
    res.json({ message: GENERIC_RESET_MESSAGE });
  }
};

exports.verifyPin = function(req, res) {
  var Email = req.body.Email || req.body.email;
  var pin = req.body.pin;
  if (!Email || !pin) return res.status(400).json({ error: 'Email and PIN are required' });

  var record = checkPin(Email, pin);
  if (!record) {
    return res.status(400).json({ error: 'Invalid or expired verification code' });
  }
  record.verified = true;
  res.json({ message: 'Code verified. You may now reset your password.' });
};

exports.resetPassword = async function(req, res) {
  var Email = req.body.Email || req.body.email;
  var pin = req.body.pin;
  var newPassword = req.body.newPassword || req.body.Password;
  if (!Email || !pin || !newPassword) return res.status(400).json({ error: 'Email, PIN, and new password are required' });

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  var record = checkPin(Email, pin);
  if (!record || !record.verified) {
    return res.status(400).json({ error: 'Invalid or expired verification code' });
  }

  try {
    var user = await customerService.getUserByEmail(Email);
    // Changing the password also revokes every token issued to the account.
    await customerService.resetPasswordByEmail(Email, newPassword);
    delete customerPinStore[emailKey(Email)];
    tokens._clearCache();

    var ipAddress = resolveClientIp(req);
    var geoStr = customerService.getGeoString(ipAddress);
    customerService.logPlatformAudit('Customer password reset completed: ' + Email, 'PASSWORD_RESET', 'Password changed via forgot-password', Email, user ? user.UserID : null, ipAddress, geoStr, req.headers['user-agent']);

    res.json({ message: 'Password reset successful. You can now sign in with your new password.' });
  } catch (err) {
    console.error('Customer reset-password error:', err.message);
    res.status(500).json({ error: 'Failed to reset password' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// SIGNED-IN ACCOUNT — profile, meters, linking, logout
// (customer token required; see routes/customerMeterRoutes.js)
// ═══════════════════════════════════════════════════════════════════════════

async function metersPayload(UserID) {
  var meters = await customerMeters.listForUser(UserID);
  return { meterCount: meters.length, meters: meters };
}

exports.me = async function(req, res) {
  try {
    res.json(await customerService.getProfile(req.user.UserID));
  } catch (err) {
    sendError(res, err, 'Failed to load profile');
  }
};

exports.listMeters = async function(req, res) {
  try {
    res.json(await metersPayload(req.user.UserID));
  } catch (err) {
    sendError(res, err, 'Failed to load meters');
  }
};

// Step 1 of adding a meter: open a meter-button validation bound to this
// account.
exports.linkRequest = async function(req, res) {
  var DRN = req.body && req.body.DRN ? String(req.body.DRN) : '';
  try {
    if (!(await customerMeters.meterExists(DRN))) {
      return res.status(404).json({ error: 'Meter not found. Check the meter number.', code: 'METER_NOT_FOUND' });
    }
    if (await customerMeters.isAuthorized(req.user.UserID, DRN)) {
      return res.status(200).json(Object.assign({ alreadyLinked: true, drn: DRN }, await metersPayload(req.user.UserID)));
    }
    var v = await meterValidation.createValidation(DRN, 'link', req.user.UserID);
    res.json({
      message: 'Press the validation button on the meter to confirm.',
      token: v.token,
      drn: DRN,
      expiresIn: v.expiresIn
    });
  } catch (err) {
    sendError(res, err, 'Failed to start meter validation');
  }
};

exports.linkStatus = async function(req, res) {
  try {
    var v = await meterValidation.statusByToken(req.params.token);
    if (!v || v.purpose !== 'link' || String(v.UserID) !== String(req.user.UserID)) {
      return res.status(404).json({ error: 'Validation not found' });
    }
    res.json({ status: v.status, drn: String(v.DRN) });
  } catch (err) {
    sendError(res, err, 'Failed to read validation status');
  }
};

// Step 2: after the meter confirmed, attach it to the account.
exports.linkComplete = async function(req, res) {
  var DRN = req.body && req.body.DRN ? String(req.body.DRN) : '';
  var token = req.body && req.body.token;
  try {
    var ok = await meterValidation.consumeValidation(token, DRN, 'link', req.user.UserID);
    if (!ok) {
      return res.status(403).json({ error: 'The meter has not confirmed this request (or it expired). Press the validation button on the meter and try again.', code: 'METER_VALIDATION_REQUIRED' });
    }
    var r = await customerMeters.link(req.user.UserID, DRN, { via: 'meter_button', actor: 'self', nickname: req.body.nickname });
    customerService.logPlatformAudit('Customer linked meter ' + DRN, 'METER_LINK', 'role=' + r.role, req.user.Email, req.user.UserID, resolveClientIp(req), null, req.headers['user-agent']);
    res.json(Object.assign({ linked: true, alreadyLinked: r.alreadyLinked, role: r.role }, await metersPayload(req.user.UserID)));
  } catch (err) {
    sendError(res, err, 'Failed to link meter');
  }
};

exports.renameMeter = async function(req, res) {
  try {
    var r = await customerMeters.setNickname(req.user.UserID, req.params.drn, req.body && req.body.nickname);
    res.json(Object.assign({ drn: req.params.drn, nickname: r.nickname }, await metersPayload(req.user.UserID)));
  } catch (err) {
    sendError(res, err, 'Failed to rename meter');
  }
};

// The account leaves a meter. Its other meters are untouched.
exports.unlinkMeter = async function(req, res) {
  try {
    await customerMeters.revoke(req.user.UserID, req.params.drn, { kind: 'customer', userId: req.user.UserID });
    customerService.logPlatformAudit('Customer unlinked meter ' + req.params.drn, 'METER_UNLINK', 'self', req.user.Email, req.user.UserID, resolveClientIp(req), null, req.headers['user-agent']);
    res.json(Object.assign({ unlinked: true, drn: req.params.drn }, await metersPayload(req.user.UserID)));
  } catch (err) {
    sendError(res, err, 'Failed to remove meter');
  }
};

exports.meterMembers = async function(req, res) {
  try {
    var members = await customerMeters.membersOfMeter(req.params.drn);
    var mine = members.filter(function(m) { return String(m.UserID) === String(req.user.UserID); })[0];
    // Members see that others exist; only the owner sees who they are.
    if (!mine || mine.role !== 'owner') return res.json({ drn: req.params.drn, memberCount: members.length });
    res.json({
      drn: req.params.drn,
      memberCount: members.length,
      members: members.map(function(m) {
        return { UserID: m.UserID, Email: m.Email, name: [m.FirstName, m.LastName].filter(Boolean).join(' '), role: m.role, linkedAt: m.created_at };
      })
    });
  } catch (err) {
    sendError(res, err, 'Failed to load members');
  }
};

// The owner removes another account from the meter.
exports.removeMember = async function(req, res) {
  try {
    await customerMeters.revoke(req.params.userId, req.params.drn, { kind: 'customer', userId: req.user.UserID });
    customerService.logPlatformAudit('Owner removed user ' + req.params.userId + ' from meter ' + req.params.drn, 'METER_UNLINK', 'owner', req.user.Email, req.user.UserID, resolveClientIp(req), null, req.headers['user-agent']);
    res.json({ removed: true });
  } catch (err) {
    sendError(res, err, 'Failed to remove member');
  }
};

// Revokes every token for the account (all devices).
exports.logout = async function(req, res) {
  try {
    await tokens.revokeCustomerTokens(req.user.UserID);
    res.json({ message: 'Signed out' });
  } catch (err) {
    sendError(res, err, 'Failed to sign out');
  }
};

exports._resetPinStateForTests = function() {
  customerPinStore = {};
  pinSendLog = {};
  ipRequestLog = {};
};
exports._transporter = transporter;
