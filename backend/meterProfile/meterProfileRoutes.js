const express = require('express');
const router = express.Router();
const meterProfileContoller = require('./meterProfileContoller');
const commissionReportController = require('./commissionReportController');
const homeClassificationController = require('./homeClassificationController');
const {authenticateToken} = require('../admin/authMiddllware')

router.use(authenticateToken);

// Commission report endpoints
router.post('/commissionReport', commissionReportController.saveReport);
router.get('/commissionReports/:DRN', commissionReportController.getReportsByDRN);
router.get('/commissionReport/latest/:DRN', commissionReportController.getLatestReportByDRN);
router.get('/commissionReport/:id', commissionReportController.getReportById);
router.get('/geyserDetections/:DRN', commissionReportController.getGeyserDetections);

// Home classification endpoints
router.post('/homeClassification', homeClassificationController.saveClassification);
router.get('/homeClassifications/:DRN', homeClassificationController.getClassificationsByDRN);
router.get('/homeClassification/latest/:DRN', homeClassificationController.getLatestClassificationByDRN);
router.get('/homeClassification/:id', homeClassificationController.getClassificationById);

//Endpoint to get meter reset history
router.get('/meterResetHistory/:DRN', meterProfileContoller.getMeterResetHistory);
//Endpoint to get meter calibration history
router.get('/meterCalibrationHistory/:DRN', meterProfileContoller.getMeterCalibrationHistory);
//Router to get meter control history
router.get('/meterControlHistory/:DRN', meterProfileContoller.getMeterMainsControlHistory);
//Router to get meter state history
router.get('/meterStateHistory/:DRN', meterProfileContoller.getMeterMainsStateHistory);
//Router to get heater control history
router.get('/heaterControlHistory/:DRN', meterProfileContoller.getMeterHeaterControlHistory);
//Router to get heater state history
router.get('/heaterStateHistory/:DRN', meterProfileContoller.getMeterHeaterStateHistory);
//Router to get sts token history 
router.get('/stsTokenHistory/:DRN', meterProfileContoller.getMeterSTSTokenHistory);
//Router to get token information
router.get('/tokenInformation/:DRN', meterProfileContoller.getTokenInformation);

module.exports = router;