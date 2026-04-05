const commissionReportService = require('./commissionReportService');

// POST - Save a new commission report
exports.saveReport = function(req, res) {
  const report = req.body;

  if (!report.DRN || !report.report_type) {
    return res.status(400).json({ error: 'DRN and report_type are required' });
  }

  // Helper: preserve 0 and false as valid values, only null/undefined become null
  const val = (v) => v != null ? v : null;

  // Build the row to insert
  const row = {
    DRN: report.DRN,
    report_type: report.report_type,
    overall_passed: report.overall_passed != null ? report.overall_passed : false,
    voltage_expected: val(report.voltage_expected),
    voltage_measured: val(report.voltage_measured),
    voltage_error: val(report.voltage_error),
    voltage_passed: val(report.voltage_passed),
    current_expected: val(report.current_expected),
    current_measured: val(report.current_measured),
    current_error: val(report.current_error),
    current_passed: val(report.current_passed),
    power_expected: val(report.power_expected),
    power_measured: val(report.power_measured),
    power_error: val(report.power_error),
    power_passed: val(report.power_passed),
    sample_count: val(report.sample_count),
    attempts: val(report.attempts),
    load_off_current: val(report.load_off_current),
    load_off_passed: val(report.load_off_passed),
    load_on_current: val(report.load_on_current),
    load_on_passed: val(report.load_on_passed),
    api_tests_passed: val(report.api_tests_passed),
    api_tests_total: val(report.api_tests_total),
    measurement_test_passed: val(report.measurement_test_passed),
    load_test_passed: val(report.load_test_passed),
    api_test_passed: val(report.api_test_passed),
    // Commissioning fields
    sim_number: val(report.sim_number) || null,
    region: val(report.region) || null,
    sub_region: val(report.sub_region) || null,
    area: val(report.area) || null,
    gps_latitude: val(report.gps_latitude),
    gps_longitude: val(report.gps_longitude),
    street_name: val(report.street_name) || null,
    erf_number: val(report.erf_number) || null,
    owner_name: val(report.owner_name) || null,
    owner_surname: val(report.owner_surname) || null,
    owner_phone: val(report.owner_phone) || null,
    owner_email: val(report.owner_email) || null,
    firmware_version: val(report.firmware_version) || null,
    nextion_connected: val(report.nextion_connected),
    gsm_registered: val(report.gsm_registered),
    report_data: report.report_data
      ? (typeof report.report_data === 'string' ? report.report_data : JSON.stringify(report.report_data))
      : null,
    tester_app_version: val(report.tester_app_version) || null,
  };

  commissionReportService.saveReport(row)
    .then(result => {
      res.status(201).json({ success: true, id: result.insertId });
    })
    .catch(error => {
      console.error('Error saving commission report:', error);
      res.status(500).json({ error: 'Failed to save commission report', details: error.message });
    });
};

// POST - Start a new commission session (creates row, returns ID)
exports.startCommission = function(req, res) {
  const report = req.body;

  if (!report.DRN) {
    return res.status(400).json({ error: 'DRN is required' });
  }

  const val = (v) => v != null ? v : null;

  const row = {
    DRN: report.DRN,
    report_type: 'full_system',
    overall_passed: false,
    sim_number: val(report.sim_number) || null,
    region: val(report.region) || null,
    sub_region: val(report.sub_region) || null,
    area: val(report.area) || null,
    gps_latitude: val(report.gps_latitude),
    gps_longitude: val(report.gps_longitude),
    street_name: val(report.street_name) || null,
    erf_number: val(report.erf_number) || null,
    owner_name: val(report.owner_name) || null,
    owner_surname: val(report.owner_surname) || null,
    owner_phone: val(report.owner_phone) || null,
    owner_email: val(report.owner_email) || null,
    firmware_version: val(report.firmware_version) || null,
    nextion_connected: val(report.nextion_connected),
    gsm_registered: val(report.gsm_registered),
    tester_app_version: val(report.tester_app_version) || null,
  };

  // Clear old reports for this DRN then insert new
  commissionReportService.saveReport(row)
    .then(result => {
      res.status(201).json({ success: true, id: result.insertId });
    })
    .catch(error => {
      console.error('Error starting commission:', error);
      res.status(500).json({ error: 'Failed to start commission', details: error.message });
    });
};

// PUT - Update commission report with incremental test data
exports.updateCommission = function(req, res) {
  const id = parseInt(req.params.id);
  const data = req.body;

  if (!id || isNaN(id)) {
    return res.status(400).json({ error: 'Valid report ID is required' });
  }

  const val = (v) => v != null ? v : undefined; // undefined = don't include in UPDATE

  // Build update object with only provided fields
  const update = {};
  const fields = [
    'voltage_expected', 'voltage_measured', 'voltage_error', 'voltage_passed',
    'current_expected', 'current_measured', 'current_error', 'current_passed',
    'power_expected', 'power_measured', 'power_error', 'power_passed',
    'sample_count', 'attempts',
    'load_off_current', 'load_off_passed', 'load_on_current', 'load_on_passed',
    'api_tests_passed', 'api_tests_total',
    'measurement_test_passed', 'load_test_passed', 'api_test_passed',
    'overall_passed',
    'baseline_voltage', 'baseline_current', 'baseline_power',
    'calibrated_load_off_threshold',
  ];

  fields.forEach(f => {
    if (data[f] != null) update[f] = data[f];
  });

  // Handle report_data specially - merge with existing
  if (data.report_data) {
    update.report_data = typeof data.report_data === 'string'
      ? data.report_data
      : JSON.stringify(data.report_data);
  }

  if (Object.keys(update).length === 0) {
    return res.json({ success: true, message: 'No fields to update' });
  }

  commissionReportService.updateReport(id, update)
    .then(result => {
      res.json({ success: true, updated: result.affectedRows });
    })
    .catch(error => {
      console.error('Error updating commission:', error);
      res.status(500).json({ error: 'Failed to update commission', details: error.message });
    });
};

// GET - Get all commission reports for a meter
exports.getReportsByDRN = function(req, res) {
  const DRN = req.params.DRN;

  commissionReportService.getReportsByDRN(DRN)
    .then(results => {
      if (results.length === 0) {
        return res.json([]);
      }
      // Parse report_data JSON strings back to objects
      results.forEach(r => {
        if (r.report_data && typeof r.report_data === 'string') {
          try { r.report_data = JSON.parse(r.report_data); } catch (e) {}
        }
      });
      res.json(results);
    })
    .catch(error => {
      console.error('Error fetching commission reports:', error);
      res.status(500).json({ error: 'Failed to fetch reports', details: error.message });
    });
};

// GET - Get latest commission report for a meter
exports.getLatestReportByDRN = function(req, res) {
  const DRN = req.params.DRN;

  commissionReportService.getLatestReportByDRN(DRN)
    .then(result => {
      if (!result) {
        return res.json(null);
      }
      if (result.report_data && typeof result.report_data === 'string') {
        try { result.report_data = JSON.parse(result.report_data); } catch (e) {}
      }
      res.json(result);
    })
    .catch(error => {
      console.error('Error fetching latest commission report:', error);
      res.status(500).json({ error: 'Failed to fetch report', details: error.message });
    });
};

// GET - Get a single report by ID
exports.getReportById = function(req, res) {
  const id = req.params.id;

  commissionReportService.getReportById(id)
    .then(result => {
      if (!result) {
        return res.status(404).json({ error: 'Report not found' });
      }
      if (result.report_data && typeof result.report_data === 'string') {
        try { result.report_data = JSON.parse(result.report_data); } catch (e) {}
      }
      res.json(result);
    })
    .catch(error => {
      console.error('Error fetching commission report:', error);
      res.status(500).json({ error: 'Failed to fetch report', details: error.message });
    });
};
