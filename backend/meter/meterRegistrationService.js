const db = require('../config/db');

/**
 * Register a new meter with location and profile information
 * @param {Object} location - Location details
 * @param {Object} meterProfile - Meter profile details
 * @returns {Promise} - Resolves with registration result
 */
exports.registerMeter = (location, meterProfile) => {
  return new Promise((resolve, reject) => {
    // Start transaction
    db.getConnection((err, connection) => {
      if (err) {
        return reject(err);
      }

      connection.beginTransaction((transErr) => {
        if (transErr) {
          connection.release();
          return reject(transErr);
        }

        // Insert into MeterLocationInfoTable
        const locationData = {
          DRN: meterProfile.drn,
          Longitude: location.longitude,
          Lat: location.latitude,
          pLng: null,
          pLat: null,
          PowerSupply: null,
          Type: 'Home',
          Suburb: location.suburb,
          LocationName: location.city,
          Status: 1,
        };

        const locationQuery = 'INSERT INTO MeterLocationInfoTable SET ?';

        connection.query(locationQuery, locationData, (locErr, locResult) => {
          if (locErr) {
            return connection.rollback(() => {
              connection.release();
              reject(locErr);
            });
          }

          // Insert into MeterProfileReal
          const profileData = {
            DRN: meterProfile.drn,
            SIMNumber: meterProfile.meter_number,
            UserCategory: 'Home',
            Region: location.region,
            City: location.city,
            StreetName: location.street,
            HouseNumber: 'not defined',
            Surname: 'not defined',
            Name: 'not defined',
            TransformerDRN: null,
          };

          const profileQuery = 'INSERT INTO MeterProfileReal SET ?';

          connection.query(profileQuery, profileData, (profErr, profResult) => {
            if (profErr) {
              return connection.rollback(() => {
                connection.release();
                reject(profErr);
              });
            }

            // Commit transaction
            connection.commit((commitErr) => {
              if (commitErr) {
                return connection.rollback(() => {
                  connection.release();
                  reject(commitErr);
                });
              }

              connection.release();
              resolve({
                success: true,
                message: 'Meter registered successfully',
                drn: meterProfile.drn,
                meter_number: meterProfile.meter_number,
              });
            });
          });
        });
      });
    });
  });
};
