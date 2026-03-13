const meterRegistrationService = require('./meterRegistrationService');

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

    res.status(201).json(result);
  } catch (error) {
    console.error('Error during meter registration:', error);

    // Handle duplicate entry errors
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        error: 'Meter already registered',
        details: 'A meter with this DRN or meter number already exists',
      });
    }

    res.status(500).json({
      error: 'Meter registration failed',
      details: error.message,
    });
  }
};
