var express = require('express');
var router = express.Router();
var customerController = require('../customer/customerControllers');

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMER AUTH ROUTES — all public (no authentication required)
// ═══════════════════════════════════════════════════════════════════════════

// Customer Sign Up
router.post('/signup', customerController.signup);

// Customer Sign In (email + meter number + password)
router.post('/signin', customerController.signIn);

// Forgot Password Flow
router.post('/forgot-password', customerController.forgotPassword);
router.post('/verify-pin', customerController.verifyPin);
router.post('/reset-password', customerController.resetPassword);

module.exports = router;
