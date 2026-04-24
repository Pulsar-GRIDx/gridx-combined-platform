var express = require('express');
var router = express.Router();
var adminController = require('../admin/adminControllers');
var auth = require('../admin/authMiddllware');

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC ROUTES — no authentication required
// ═══════════════════════════════════════════════════════════════════════════

// Admin Sign In
router.post('/signin', adminController.signIn);

// 2FA verification (second step of login when 2FA is enabled)
router.post('/verify-2fa-login', adminController.verify2FALogin);

// Forgot Password Flow
router.post('/forgot-password', adminController.forgotPassword);
router.post('/verify-pin', adminController.verifyPin);
router.post('/reset-forgotten-password', adminController.resetForgottenPassword);

// ═══════════════════════════════════════════════════════════════════════════
// PROTECTED ROUTES — require authentication
// ═══════════════════════════════════════════════════════════════════════════
router.use(auth.authenticateToken);

// Protected resource test
router.get('/protected', function(req, res) {
  res.send('This is a protected route');
});

// Get own profile
router.get('/profile/:UserID', adminController.getUserProfile);

// Get access level
router.get('/adminAuth/accessLevel', function(req, res) {
  res.json(req.tokenPayload || req.user);
});

// Get admin's own data
router.get('/adminData/:Admin_ID', adminController.getAdminData);

// ═══════════════════════════════════════════════════════════════════════════
// 2FA MANAGEMENT — authenticated users
// ═══════════════════════════════════════════════════════════════════════════

// Setup 2FA (get secret)
router.post('/2fa/setup', adminController.setup2FA);

// Enable 2FA (verify code and activate)
router.post('/2fa/enable', adminController.enable2FA);

// Disable 2FA (self or admin-for-others)
router.post('/2fa/disable/:Admin_ID', adminController.disable2FA);
router.post('/2fa/disable', adminController.disable2FA);

// ═══════════════════════════════════════════════════════════════════════════
// USER/ADMIN MANAGEMENT — ADMIN role required for most
// ═══════════════════════════════════════════════════════════════════════════

// Get all users (any authenticated user can view)
router.get('/allUsers', adminController.getAllUsers);

// Get all admins (any authenticated user can view)
router.get('/allAdmins', adminController.getAllAdmins);

// Create new admin — ADMIN only (self-registration disabled)
router.post('/adminSignup', auth.requireAdmin, adminController.adminSignup);

// Update admin info (self or ADMIN for others)
router.post('/AdminUpdate/:Admin_ID', adminController.updateAdminInfo);

// Update user info
router.post('/UserUpdate/:UserID', adminController.updateUserInfo);

// Delete admin — ADMIN only
router.delete('/deleteAdmin/:Admin_ID', auth.requireAdmin, adminController.deleteAdmin);

// Delete app user — ADMIN only
router.delete('/deleteUser/:UserID', auth.requireAdmin, adminController.deleteUser);

// Toggle admin status — ADMIN only
router.post('/updateStatus/:Admin_ID', auth.requireAdmin, adminController.updateAdminStatus);

// Reset password (self or ADMIN for others)
router.post('/resetPassword/:Admin_ID', adminController.resetAdminPassword);

// Unlock a locked account — ADMIN only
router.post('/unlockAccount/:Admin_ID', auth.requireAdmin, adminController.unlockAccount);

// ═══════════════════════════════════════════════════════════════════════════
// INSTALLER MANAGEMENT — ADMIN only
// ═══════════════════════════════════════════════════════════════════════════

router.get('/installers', auth.requireAdmin, adminController.getAllInstallers);

// ═══════════════════════════════════════════════════════════════════════════
// PLATFORM AUDIT LOG — ADMIN only
// ═══════════════════════════════════════════════════════════════════════════

router.get('/platform-audit-log', auth.requireAdmin, adminController.getPlatformAuditLog);
router.delete('/platform-audit-log', auth.requireAdmin, adminController.clearPlatformAuditLog);

module.exports = router;
