const adminService = require('./adminService');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const geoip = require('geoip-lite');

// Configure dotenv
dotenv.config();
const environment = process.env;

// In-memory store for PINs (for production, use Redis or DB)
const pinStore = {};

// Configure nodemailer transporter (adjust as needed)
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.zoho.com',
  port: process.env.EMAIL_PORT || 587,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL,
    pass: process.env.EMAIL_KEY,
  },
});

const isLocalhostIp = (ip) => ip === '127.0.0.1' || ip === '::1';

const isNamibianIp = (ip) => {
  if (!ip) return false;
  const lookup = geoip.lookup(ip);
  return lookup?.country === 'NA';
};

// Admin Signup
exports.adminSignup = async (req, res) => {
  try {
    const { Username, Password, FirstName, LastName, Email, IsActive, RoleName, AccessLevel } = req.body;
    await adminService.registerAdmin(Username, Password, FirstName, LastName, Email, IsActive, RoleName, AccessLevel);
    res.status(201).json({ message: 'Registration successful' });
  } catch (error) {
    console.error('Error during registration:', error);
    res.status(500).json({ error: 'Registration failed', error });
  }
};

// Admin SignIn
exports.signIn = async (req, res) => {
  try {
    const { Email, Password, GuestID } = req.body;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(Email)) {
      return res.status(400).json({ error: 'Invalid email syntax' });
    }

    const resolveClientIp = (request) => {
      const candidates = [];

      const forwardedFor = request.headers['x-forwarded-for'];
      if (forwardedFor) {
        const raw = Array.isArray(forwardedFor) ? forwardedFor.join(',') : String(forwardedFor);
        raw.split(',').map(ip => ip.trim()).filter(Boolean).forEach(ip => candidates.push(ip));
      }

      const realIpHeader = request.headers['x-real-ip'];
      if (realIpHeader) {
        candidates.push(...(Array.isArray(realIpHeader) ? realIpHeader : [realIpHeader]));
      }

      if (Array.isArray(request.ips) && request.ips.length > 0) {
        candidates.push(...request.ips);
      }

      [request.ip, request.socket?.remoteAddress, request.connection?.remoteAddress]
        .filter(Boolean)
        .forEach(ip => candidates.push(ip));

      const normalizeIp = (ip) => {
        if (!ip) return null;
        if (ip === '::1') return '127.0.0.1';
        if (ip.startsWith('::ffff:')) return ip.substring(7);
        return ip;
      };

      const preferred = candidates.find(ip => ip && ip !== '::1' && ip !== '127.0.0.1')
        || candidates.find(Boolean)
        || null;

      return normalizeIp(preferred);
    };

    const ipAddress = resolveClientIp(req);

    const isAllowedIp = isLocalhostIp(ipAddress) || isNamibianIp(ipAddress);
    // if (!isAllowedIp) {
    //   return res.status(403).json({
    //     error: 'Access denied',
    //     details: 'Sign-in is restricted to Namibian networks or localhost access.'
    //   });
    // }

    const result = await adminService.signIn(Email, Password, GuestID, ipAddress);

    // Set the access token in a cookie
    res.cookie('accessToken', result.token, {
      httpOnly: true, // Protects the cookie from JavaScript access
      secure: environment.FRONTEND_DOMAIN.startsWith('https://'), // Secure in HTTPS
      maxAge: 40 * 60 * 1000, // Cookie lifespan
      domain: environment.DOMAIN, // Cookie available for this domain
      path: '/',
      sameSite: 'Lax', // Ensures cookies are sent with same-origin navigation
    });

    res.status(200).json({
      message: 'Admin signed in successfully',
      token: result.token,
      user: result.user,
    });
  } catch (error) {
    console.error('Error during sign-in:', error);
    if (error.status === 404) {
      return res.status(404).json({ error: 'Email not found' });
    } else if (error.status === 401) {
      return res.status(401).json({ error: 'Incorrect Password' });
    } else {
      res.status(500).json({ error: 'Sign-in failed', details: error.message });
    }
  }
};

// Forgot Password - Step 1: Request PIN
exports.forgotPassword = async (req, res) => {
  const { Email } = req.body;
  if (!Email) return res.status(400).json({ error: 'Email is required' });

  try {
    // Check if email exists
    const user = await adminService.getAdminByEmail(Email);
    if (!user) return res.status(404).json({ error: 'Email not found' });

    // Generate 6-digit PIN
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    pinStore[Email] = { pin, expires: Date.now() + 10 * 60 * 1000 }; // 10 min expiry

    // Send email
    await transporter.sendMail({
      from: `"GridX Meters" <${process.env.EMAIL}>`,
      to: Email,
      subject: 'GridX Meters Password Reset Verification',
      html: `<p>Your password reset verification code is: <b>${pin}</b></p><p>This code is valid for 10 minutes.</p>`
    });

    res.json({ message: 'Verification PIN sent to email' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send verification email', details: err.message });
  }
};

// Forgot Password - Step 2: Verify PIN
exports.verifyPin = (req, res) => {
  const { Email, pin } = req.body;
  if (!Email || !pin) return res.status(400).json({ error: 'Email and PIN are required' });

  const record = pinStore[Email];
  if (!record || record.pin !== pin || Date.now() > record.expires) {
    return res.status(400).json({ error: 'Invalid or expired PIN' });
  }
  // Mark as verified (could set a flag or just allow next step)
  pinStore[Email].verified = true;
  res.json({ message: 'PIN verified. You may now reset your password.' });
};

// Forgot Password - Step 3: Reset Password
exports.resetForgottenPassword = async (req, res) => {
  const { Email, pin, newPassword } = req.body;
  if (!Email || !pin || !newPassword) return res.status(400).json({ error: 'Email, PIN, and new password are required' });

  const record = pinStore[Email];
  if (!record || record.pin !== pin || !record.verified || Date.now() > record.expires) {
    return res.status(400).json({ error: 'Invalid or expired PIN' });
  }

  try {
    await adminService.resetAdminPasswordByEmail(Email, newPassword);
    delete pinStore[Email];
    res.json({ message: 'Password reset successful' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset password', details: err.message });
  }
};

// Protected Resource Example
exports.protected = (req, res) => {
  res.json({ message: 'Protected resource accessed' });
};

// Example Routes
exports.getUserProfile = (req, res) => {
  const { UserID } = req.params;
  if (!UserID) {
    return res.status(400).json({ error: 'Invalid UserID' });
  }
  adminService.getUserProfile(UserID)
    .then(userProfile => res.status(200).json(userProfile))
    .catch(err => res.status(500).json({ error: 'Failed to fetch user profile', details: err }));
};

exports.getAllUsers = (req, res) => {
  adminService.getAllUsers()
    .then(users => res.status(200).json(users))
    .catch(err => res.status(500).json({ error: 'Internal server error', details: err }));
};

// Get all Admins
exports.getAllAdmins = (req, res) => {
  adminService.getAllAdmins()
    .then(users => res.status(200).json({ users: users }))
    .catch(err => res.status(500).json({ error: 'Internal server error', details: err }));
};

// Update user
exports.updateUserInfo = (req, res) => {
  const { UserID } = req.params;
  const { FirstName, Email, LastName, DRN } = req.body;

  adminService.updateUserInfo(UserID, FirstName, Email, LastName, DRN)
    .then(() => res.status(200).json({ message: 'User information updated successfully' }))
    .catch(err => res.status(500).json({ error: 'Internal server error', details: err }));
};

// Update admin
exports.updateAdminInfo = (req, res) => {
  const { Admin_ID } = req.params;
  const { FirstName, Email, LastName, AccessLevel, Username } = req.body;

  adminService.updateAdminInfo(Admin_ID, FirstName, Email, LastName, AccessLevel, Username)
    .then(() => res.status(200).json({ message: 'Admin information updated successfully' }))
    .catch(err => res.status(500).json({ error: 'Internal server error', details: err }));
};

// Delete Admin
exports.deleteAdmin = (req, res) => {
  const { Admin_ID } = req.params;

  adminService.deleteAdmin(Admin_ID)
    .then(() => res.status(200).json({ message: 'Admin deleted successfully' }))
    .catch(err => res.status(500).json({ error: 'Internal server error', details: err }));
};

// Update Admin Status
exports.updateAdminStatus = (req, res) => {
  const { Admin_ID } = req.params;

  adminService.updateAdminStatus(Admin_ID)
    .then(newStatus => res.status(200).json({ message: 'Admin status updated successfully', newStatus }))
    .catch(err => res.status(500).json({ error: 'Internal server error', details: err }));
};

// Reset Admin Password
exports.resetAdminPassword = (req, res) => {
  const { Admin_ID } = req.params;
  const { Password } = req.body;

  if (!Password) {
    return res.status(400).json({ message: 'Please enter a new password' });
  }

  adminService.resetAdminPassword(Admin_ID, Password)
    .then(() => res.status(200).json({ message: 'Password updated successfully' }))
    .catch(err => res.status(500).json({ error: 'Internal server error', details: err }));
};

// Get Admin Data
exports.getAdminData = (req, res) => {
  const { Admin_ID } = req.params;

  if (!Admin_ID) {
    return res.status(400).json({ error: 'Invalid Admin_ID' });
  }

  adminService.getAdminData(Admin_ID)
    .then(adminData => res.status(200).json(adminData))
    .catch(err => res.status(500).json({ error: 'Failed to fetch admin data', details: err }));
};
