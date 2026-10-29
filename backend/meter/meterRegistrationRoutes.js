const express = require('express');
const router = express.Router();
const meterRegistrationController = require('./meterRegistrationController');

/**
 * @route POST /meter-registration/register
 * @description Register (commission) a meter. Staff only: this creates the
 *   meter record that customer accounts and the meter's own identity are
 *   anchored to, so it cannot be public. The Maintenance app sends the
 *   technician's /signin token. METER_REGISTRATION_ALLOW_ANONYMOUS=true
 *   restores the old public behaviour (rollout only).
 * @access Staff (admin token: ADMIN, TECHNICIAN, ...)
 */
var auth = require('../admin/authMiddllware');
var tokens = require('../middleware/tokens');
function requireStaff(req, res, next) {
  if (process.env.METER_REGISTRATION_ALLOW_ANONYMOUS === 'true' && !req.headers.authorization) return next();
  auth.authenticateToken(req, res, function() {
    if (tokens.kind(req.user) !== 'admin') {
      return res.status(403).json({ error: 'Meter registration requires a technician or administrator account' });
    }
    next();
  });
}
router.post('/register', requireStaff, meterRegistrationController.registerMeter);

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
