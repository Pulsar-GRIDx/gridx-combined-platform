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
 * @description Get all locations (predefined + database) for commissioning dropdown
 * @access Public
 */
router.get('/locations', meterRegistrationController.getAllLocations);

/**
 * @route GET /api/meter/locations/registered
 * @description Get only locations where meters are already registered
 * @access Public
 */
router.get('/locations/registered', meterRegistrationController.getLocations);

/**
 * @route GET /api/meter/verify/:drn
 * @description Check if a meter DRN has been authenticated with the network
 * @access Public
 */
router.get('/verify/:drn', meterRegistrationController.verifyMeterAuthentication);

module.exports = router;
