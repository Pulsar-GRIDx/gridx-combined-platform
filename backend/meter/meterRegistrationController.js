const meterRegistrationService = require('./meterRegistrationService');
const db = require('../config/db');

// A technician registering a meter is standing at it, so the meter may pin
// its identity key during the next 24h (hardware/meterTokenRoutes.js).
// Registration still succeeds if this fails.
async function openPinWindowFor(req, drn) {
  if (!req.user || !/^\d{13}$/.test(String(drn || ''))) return;
  try {
    await require('../hardware/meterTokenRoutes').openPinWindow(String(drn), 24, 'technician:' + (req.user.Admin_ID || '?'));
  } catch (e) {
    console.error('[MeterRegistration] could not open key-pinning window for', drn, e.message);
  }
}

/**
 * Controller for meter registration
 */
exports.registerMeter = async (req, res) => {
  try {
    const { location, meterProfile } = req.body;

    // Validate required fields
    if (!location || !meterProfile) {
      return res.status(400).json({
        error: 'Missing required fields',
        details: 'Both location and meterProfile are required',
      });
    }

    // Validate location fields
    const requiredLocationFields = ['street', 'suburb', 'city', 'region', 'latitude', 'longitude'];
    for (const field of requiredLocationFields) {
      if (!location[field]) {
        return res.status(400).json({
          error: 'Invalid location data',
          details: `Missing required field: ${field}`,
        });
      }
    }

    // Validate location field types
    if (typeof location.street !== 'string' ||
        typeof location.suburb !== 'string' ||
        typeof location.city !== 'string' ||
        typeof location.region !== 'string') {
      return res.status(400).json({
        error: 'Invalid location data',
        details: 'street, suburb, city, and region must be strings',
      });
    }

    if (typeof location.latitude !== 'number' || typeof location.longitude !== 'number') {
      return res.status(400).json({
        error: 'Invalid location data',
        details: 'latitude and longitude must be numbers',
      });
    }

    // Validate meterProfile fields
    if (!meterProfile.drn || !meterProfile.meter_number) {
      return res.status(400).json({
        error: 'Invalid meter profile data',
        details: 'Both drn and meter_number are required',
      });
    }

    if (typeof meterProfile.drn !== 'string' || typeof meterProfile.meter_number !== 'string') {
      return res.status(400).json({
        error: 'Invalid meter profile data',
        details: 'drn and meter_number must be strings',
      });
    }

    // Register the meter
    const result = await meterRegistrationService.registerMeter(location, meterProfile);
    await openPinWindowFor(req, meterProfile.drn);

    res.status(201).json(result);
  } catch (error) {
    console.error('Error during meter registration:', error);

    // Handle duplicate entry errors
    if (error.code === 'ER_DUP_ENTRY') {
      // The technician is at a meter that is already on record: let it pin
      // its key now if it has none (meters commissioned before 2026-10).
      await openPinWindowFor(req, req.body.meterProfile.drn);
      return res.status(409).json({
        error: 'Meter already registered',
        details: 'A meter with this DRN or meter number already exists',
        drn: req.body.meterProfile.drn,
        status: 'already_registered',
      });
    }

    res.status(500).json({
      error: 'Meter registration failed',
      details: error.message,
    });
  }
};

/**
 * Get distinct locations for commissioning dropdown (database only)
 */
exports.getLocations = async (req, res) => {
  try {
    const locations = await meterRegistrationService.getDistinctLocations();
    res.json({ success: true, data: locations });
  } catch (error) {
    console.error('Error fetching locations:', error);
    res.status(500).json({
      error: 'Failed to fetch locations',
      details: error.message,
    });
  }
};

/**
 * Get all available locations (predefined + database) for commissioning dropdown
 * Includes all Windhoek suburbs and other cities from the web app
 */
exports.getAllLocations = async (req, res) => {
  try {
    const locations = await meterRegistrationService.getAllLocations();
    res.json({ success: true, data: locations });
  } catch (error) {
    console.error('Error fetching all locations:', error);
    res.status(500).json({
      error: 'Failed to fetch locations',
      details: error.message,
    });
  }
};

exports.verifyMeterAuthentication = async (req, res) => {
  const drn = req.params.drn;
  if (!drn) {
    return res.status(400).json({ authenticated: false, error: 'DRN is required' });
  }

  try {
    const query = `SELECT DRN, last_seen FROM MeterLastSeen WHERE DRN = ? LIMIT 1`;
    db.query(query, [drn], (err, results) => {
      if (err) {
        console.error('Error checking meter authentication:', err);
        return res.status(500).json({ authenticated: false, error: err.message });
      }

      if (results && results.length > 0) {
        res.json({
          authenticated: true,
          drn: results[0].DRN,
          lastSeen: results[0].last_seen,
        });
      } else {
        res.json({
          authenticated: false,
          drn: drn,
          message: 'Meter has not been authenticated with the network',
        });
      }
    });
  } catch (error) {
    console.error('Error verifying meter:', error);
    res.status(500).json({ authenticated: false, error: error.message });
  }
};
