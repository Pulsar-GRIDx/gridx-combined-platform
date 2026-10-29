var express = require('express');
var router = express.Router();
var controller = require('./authorizedNumbersController');

// ESP32 meter sync endpoint. meterAuth: a meter token must be for this
// DRN; customer/admin tokens are refused; tokenless legacy meters still pass
// unless METER_REQUIRE_TOKEN=true.
var meterAuth = require('../hardware/middleware/meterAuth');
router.post('/sync/:drn', meterAuth, controller.syncAuthorizedNumbers);

// Admin endpoint (require JWT)
var auth = require('../admin/authMiddllware');
router.get('/:drn', auth.authenticateToken, controller.getAuthorizedNumbers);

module.exports = router;
