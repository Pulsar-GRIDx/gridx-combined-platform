const connection = require("../../service/hwDatabase.js");

const MeterCapability = function(meterId, capabilityData) {
  this.meter_id = meterId;
  this.relay_control = capabilityData.relay_control || 0;
  this.geyser_control = capabilityData.geyser_control || 0;
  this.anti_tamper = capabilityData.anti_tamper || 0;
  this.ble_support = capabilityData.ble_support || 0;
  this.secure_communication = capabilityData.secure_communication || 0;
  this.encrypted_telemetry = capabilityData.encrypted_telemetry || 0;
  this.mutual_auth = capabilityData.mutual_auth || 0;
  this.aes256 = capabilityData.aes256 || 0;
  this.rsa2048 = capabilityData.rsa2048 || 0;
};

// Create or update capabilities
MeterCapability.upsert = (meterId, data, result) => {
  // First check if exists
  connection.query(
    "SELECT * FROM capabilities WHERE meter_id = ?",
    [meterId],
    (err, res) => {
      if (err) {
        result(err, null);
        return;
      }

      if (res.length) {
        // Update existing
        connection.query(
          "UPDATE capabilities SET ? WHERE meter_id = ?",
          [{ ...data, updated_at: new Date() }, meterId],
          (err, res) => {
            if (err) {
              result(err, null);
              return;
            }
            result(null, { meter_id: meterId, ...data });
          }
        );
      } else {
        // Insert new
        connection.query(
          "INSERT INTO capabilities SET ?",
          { meter_id: meterId, ...data },
          (err, res) => {
            if (err) {
              result(err, null);
              return;
            }
            result(null, { meter_id: meterId, ...data });
          }
        );
      }
    }
  );
};

// Get capabilities by meter ID
MeterCapability.findByMeterId = (meterId, result) => {
  connection.query(
    "SELECT * FROM capabilities WHERE meter_id = ?",
    [meterId],
    (err, res) => {
      if (err) {
        result(err, null);
        return;
      }
      if (res.length) {
        result(null, res[0]);
        return;
      }
      result(null, null); // No capabilities found
    }
  );
};

// Get capabilities by meter DRN
MeterCapability.findByMeterDRN = (DRN, result) => {
  connection.query(
    `SELECT c.* 
     FROM capabilities c
     JOIN meters m ON c.meter_id = m.id
     WHERE m.DRN = ?`,
    [DRN],
    (err, res) => {
      if (err) {
        result(err, null);
        return;
      }
      if (res.length) {
        result(null, res[0]);
        return;
      }
      result(null, null);
    }
  );
};

// Delete capabilities by meter ID
MeterCapability.deleteByMeterId = (meterId, result) => {
  connection.query(
    "DELETE FROM capabilities WHERE meter_id = ?",
    [meterId],
    (err, res) => {
      if (err) {
        result(null, err);
        return;
      }
      result(null, { meter_id: meterId });
    }
  );
};

module.exports = MeterCapability;