const express = require('express');
const router = express.Router();
const commissionReportController = require('./commissionReportController');

// Public endpoints for Android app commission reports
// No authentication required (the app authenticates via BLE to the meter)

// Start a new commission session (clears old reports, creates new row)
router.post('/start', commissionReportController.startCommission);

// Update commission report with incremental test data
router.put('/update/:id', commissionReportController.updateCommission);

// Legacy: submit a complete report in one go
router.post('/submit', commissionReportController.saveReport);

module.exports = router;
