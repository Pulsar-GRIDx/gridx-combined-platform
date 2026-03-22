const express = require('express');
const router = express.Router();
const { requestValidation, confirmValidation, checkValidation } = require('../customer/meterValidationController');

// App endpoints (under /customer prefix when mounted)
router.post('/request-meter-validation', requestValidation);
router.get('/check-meter-validation/:drn', checkValidation);

module.exports = router;
