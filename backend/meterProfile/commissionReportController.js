const commissionReportService = require('./commissionReportService');

// POST - Save a new commission report
exports.saveReport = function(req, res) {
  const report = req.body;

  if (!report.DRN || !report.report_type) {
    return res.status(400).json({ error: 'DRN and report_type are required' });
  }

  // Build the row to insert
  const row = {
    DRN: report.DRN,
    report_type: report.report_type,
    overall_passed: report.overall_passed || false,
    voltage_expected: report.voltage_expected || null,
    voltage_measured: report.voltage_measured || null,
    voltage_error: report.voltage_error || null,
    voltage_passed: report.voltage_passed != null ? report.voltage_passed : null,
    current_expected: report.current_expected || null,
    current_measured: report.current_measured || null,
    current_error: report.current_error || null,
    current_passed: report.current_passed != null ? report.current_passed : null,
    power_expected: report.power_expected || null,
    power_measured: report.power_measured || null,
    power_error: report.power_error || null,
    power_passed: report.power_passed != null ? report.power_passed : null,
    sample_count: report.sample_count || null,
    attempts: report.attempts || null,
    load_off_current: report.load_off_current || null,
    load_off_passed: report.load_off_passed != null ? report.load_off_passed : null,
    load_on_current: report.load_on_current || null,
    load_on_passed: report.load_on_passed != null ? report.load_on_passed : null,
    api_tests_passed: report.api_tests_passed || null,
    api_tests_total: report.api_tests_total || null,
    measurement_test_passed: report.measurement_test_passed != null ? report.measurement_test_passed : null,
    load_test_passed: report.load_test_passed != null ? report.load_test_passed : null,
    api_test_passed: report.api_test_passed != null ? report.api_test_passed : null,
    report_data: report.report_data ? JSON.stringify(report.report_data) : null,
    tester_app_version: report.tester_app_version || null,
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
