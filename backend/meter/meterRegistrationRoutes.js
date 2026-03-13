const express = require('express');
const router = express.Router();
const meterRegistrationController = require('./meterRegistrationController');

/**
 * @route POST /api/meter/register
 * @description Register a new meter without authentication
 * @access Public
 */
router.post('/register', meterRegistrationController.registerMeter);

module.exports = router;
