const express = require('express');
const router = express.Router();
const commissionReportController = require('./commissionReportController');

// Public endpoint for Android app to submit commission reports
// No authentication required (the app authenticates via BLE to the meter)
router.post('/submit', commissionReportController.saveReport);

module.exports = router;
