const express = require('express');
const router = express.Router();
const meterRegistrationController = require('./meterRegistrationController');

/**
 * @route POST /api/meter/register
 * @description Register a new meter without authentication
 * @access Public
 */
router.post('/register', meterRegistrationController.registerMeter);

/**
 * @route GET /api/meter/locations
 * @description Get distinct locations for commissioning dropdown
 * @access Public
 */
router.get('/locations', meterRegistrationController.getLocations);

module.exports = router;
