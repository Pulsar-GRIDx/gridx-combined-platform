var customerService = require('./customerService');
var dotenv = require('dotenv');
var nodemailer = require('nodemailer');

dotenv.config();

// In-memory PIN store for customer password reset
var customerPinStore = {};

// Configure nodemailer transporter (same as admin)
var transporter;
if (process.env.EMAIL && process.env.EMAIL_KEY) {
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.zoho.com',
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL,
      pass: process.env.EMAIL_KEY,
    },
  });
} else {
  transporter = nodemailer.createTransport({
    sendmail: true,
    newline: 'unix',
    path: '/usr/sbin/sendmail',
  });
}

var EMAIL_FROM = process.env.EMAIL || 'noreply@gridx-meters.com';

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

    var result = await customerService.signup(Email, Password, FirstName, LastName, DRN);

    var ipAddress = resolveClientIp(req);
    var geoStr = customerService.getGeoString(ipAddress);
    customerService.logPlatformAudit('Customer registered: ' + Email + ' (DRN: ' + DRN + ')', 'USER_CREATE', 'Self-registration', Email, result.user.UserID, ipAddress, geoStr, req.headers['user-agent']);

    res.status(201).json({
      message: 'Registration successful',
      token: result.token,
      user: result.user
    });
  } catch (error) {
    console.error('Customer signup error:', error);
    var statusCode = error.status || 500;
    res.status(statusCode).json({ error: error.message || 'Registration failed' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMER SIGN IN — email + meter number + password
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
      user: result.user
    });
  } catch (error) {
    console.error('Customer signin error:', error);
    var statusCode = error.status || 500;
    res.status(statusCode).json({ error: error.message || 'Sign-in failed' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMER FORGOT PASSWORD (3-step flow)
// ═══════════════════════════════════════════════════════════════════════════
exports.forgotPassword = async function(req, res) {
  var Email = req.body.Email || req.body.email;
  if (!Email) return res.status(400).json({ error: 'Email is required' });

  try {
    var user = await customerService.getUserByEmail(Email);
    if (!user) return res.status(404).json({ error: 'Email not found. Please register first.' });

    // Generate 6-digit PIN
    var pin = String(Math.floor(100000 + Math.random() * 900000));
    customerPinStore[Email] = { pin: pin, expires: Date.now() + 10 * 60 * 1000 };

    // Send email
    await transporter.sendMail({
      from: '"NamPower SmartPay" <' + EMAIL_FROM + '>',
      to: Email,
      subject: 'NamPower SmartPay - Password Reset Code',
      html: '<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;">' +
        '<h2 style="color:#2E7D32;">NamPower SmartPay</h2>' +
        '<p>You requested a password reset. Your verification code is:</p>' +
        '<div style="background:#f5f5f5;padding:15px;text-align:center;font-size:28px;font-weight:bold;letter-spacing:6px;color:#2E7D32;border-radius:8px;">' + pin + '</div>' +
        '<p style="margin-top:15px;">This code is valid for <b>10 minutes</b>.</p>' +
        '<p style="color:#888;font-size:12px;">If you did not request this, please ignore this email.</p>' +
        '</div>'
    });

    var ipAddress = resolveClientIp(req);
    var geoStr = customerService.getGeoString(ipAddress);
    customerService.logPlatformAudit('Customer password reset requested: ' + Email, 'PASSWORD_RESET', 'PIN sent', Email, user.UserID, ipAddress, geoStr, req.headers['user-agent']);

    res.json({ message: 'Verification code sent to your email' });
  } catch (err) {
    console.error('Customer forgot-password error:', err);
    res.status(500).json({ error: 'Failed to send verification email', details: err.message });
  }
};

exports.verifyPin = function(req, res) {
  var Email = req.body.Email || req.body.email;
  var pin = req.body.pin;
  if (!Email || !pin) return res.status(400).json({ error: 'Email and PIN are required' });

  var record = customerPinStore[Email];
  if (!record || record.pin !== pin || Date.now() > record.expires) {
    return res.status(400).json({ error: 'Invalid or expired verification code' });
  }
  customerPinStore[Email].verified = true;
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

  var record = customerPinStore[Email];
  if (!record || record.pin !== pin || !record.verified || Date.now() > record.expires) {
    return res.status(400).json({ error: 'Invalid or expired verification code' });
  }

  try {
    await customerService.resetPasswordByEmail(Email, newPassword);
    delete customerPinStore[Email];

    var ipAddress = resolveClientIp(req);
    var geoStr = customerService.getGeoString(ipAddress);
    customerService.logPlatformAudit('Customer password reset completed: ' + Email, 'PASSWORD_RESET', 'Password changed via forgot-password', Email, null, ipAddress, geoStr, req.headers['user-agent']);

    res.json({ message: 'Password reset successful. You can now sign in with your new password.' });
  } catch (err) {
    console.error('Customer reset-password error:', err);
    res.status(500).json({ error: 'Failed to reset password', details: err.message });
  }
};
