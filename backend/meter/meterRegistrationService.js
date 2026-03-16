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
            SIMNumber: meterProfile.sim_number || meterProfile.meter_number,
            UserCategory: 'Home',
            Region: location.region,
            City: location.city,
            StreetName: location.street,
            HouseNumber: meterProfile.erf_number || 'not defined',
            Surname: meterProfile.homeowner_surname || 'not defined',
            Name: meterProfile.homeowner_name || 'not defined',
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
                sim_number: profileData.SIMNumber,
              });
            });
          });
        });
      });
    });
  });
};

/**
 * Get distinct locations from existing meter data for commissioning dropdown
 * @returns {Promise} - Resolves with array of location objects
 */
exports.getDistinctLocations = () => {
  return new Promise((resolve, reject) => {
    const query = `SELECT DISTINCT LocationName, Suburb
                   FROM MeterLocationInfoTable
                   WHERE LocationName IS NOT NULL AND LocationName != ''
                   ORDER BY LocationName, Suburb`;

    db.query(query, (err, results) => {
      if (err) {
        return reject(err);
      }
      resolve(results || []);
    });
  });
};
