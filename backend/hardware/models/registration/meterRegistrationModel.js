const connection = require("../../service/hwDatabase.js");

const MeterRegistration = function(meterDrn, registrationData) {
  this.DRN = meterDrn;
  this.api_key_hash = registrationData.api_key_hash;
  this.api_key_salt = registrationData.api_key_salt;
  this.public_key = registrationData.public_key;
  this.certificate_hash = registrationData.certificate_hash;
  this.certificate_serial = registrationData.certificate_serial;
  this.certificate_expiry = registrationData.certificate_expiry;
  this.device_id = registrationData.device_id;
  this.model = registrationData.model;
  this.firmware_version = registrationData.firmware_version;
  this.mac_address = registrationData.mac_address;
  this.imei = registrationData.imei;
  this.security_level = registrationData.security_level || 'basic';
  this.status = registrationData.status || 'pending';
  this.nonce_counter = registrationData.nonce_counter || 0;
  this.failed_attempts = registrationData.failed_attempts || 0;
  this.last_failed_attempt = registrationData.last_failed_attempt;
  this.locked_until = registrationData.locked_until;
  this.last_seen = registrationData.last_seen;
  this.last_ip_address = registrationData.last_ip_address;
  this.registered_at = registrationData.registered_at || new Date();
};

// Create new meter registration
MeterRegistration.create = (data, result) => {
  connection.query(
    "INSERT INTO meters SET ?",
    data,
    (err, res) => {
      if (err) {
        result(err, null);
        return;
      }
      
      result(null, { id: res.insertId, ...data });
      return;
    }
  );
};

// Get all meters
MeterRegistration.getAll = (result) => {
  let query = "SELECT id, DRN, model, firmware_version, security_level, status, last_seen, registered_at FROM meters ORDER BY created_at DESC";
 
  connection.query(query, (err, res) => {
    if (err) {
      result(null, err);
      return;
    }
    result(null, res);
  });
};

// Get meters by status
MeterRegistration.getByStatus = (status, result) => {
  let query = "SELECT id, DRN, model, firmware_version, security_level, status, last_seen, registered_at FROM meters WHERE status = ? ORDER BY created_at DESC";
 
  connection.query(query, [status], (err, res) => {
    if (err) {
      result(null, err);
      return;
    }
    result(null, res);
  });
};

// Find meter by DRN
MeterRegistration.findByDRN = (DRN, result) => {
  connection.query(
    `SELECT * FROM meters WHERE DRN = ?`,
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
      // not found meter with the DRN
      result({ kind: "not_found" }, null);
    }
  );
};

// Find meter by ID
MeterRegistration.findById = (id, result) => {
  connection.query(
    `SELECT * FROM meters WHERE id = ?`,
    [id],
    (err, res) => {
      if (err) {
        result(err, null);
        return;
      }
      if (res.length) {
        result(null, res[0]);
        return;
      }
      // not found meter with the id
      result({ kind: "not_found" }, null);
    }
  );
};

// Update meter by DRN
MeterRegistration.updateByDRN = (DRN, meterData, result) => {
  connection.query(
    "UPDATE meters SET ? WHERE DRN = ?",
    [meterData, DRN],
    (err, res) => {
      if (err) {
        result(null, err);
        return;
      }

      if (res.affectedRows == 0) {
        // not found meter with the DRN
        result({ kind: "not_found" }, null);
        return;
      }
      
      result(null, { DRN: DRN, ...meterData });
    }
  );
};

// Update meter status
MeterRegistration.updateStatus = (DRN, status, result) => {
  connection.query(
    "UPDATE meters SET status = ?, last_seen = NOW() WHERE DRN = ?",
    [status, DRN],
    (err, res) => {
      if (err) {
        result(null, err);
        return;
      }

      if (res.affectedRows == 0) {
        result({ kind: "not_found" }, null);
        return;
      }
      
      result(null, { DRN: DRN, status: status });
    }
  );
};

// Update last seen
MeterRegistration.updateLastSeen = (DRN, ipAddress, result) => {
  connection.query(
    "UPDATE meters SET last_seen = NOW(), last_ip_address = ? WHERE DRN = ?",
    [ipAddress, DRN],
    (err, res) => {
      if (err) {
        result(null, err);
        return;
      }
      result(null, { DRN: DRN, last_seen: new Date() });
    }
  );
};

// Update nonce counter
MeterRegistration.updateNonceCounter = (DRN, counter, result) => {
  connection.query(
    "UPDATE meters SET nonce_counter = ? WHERE DRN = ?",
    [counter, DRN],
    (err, res) => {
      if (err) {
        result(null, err);
        return;
      }
      result(null, { DRN: DRN, nonce_counter: counter });
    }
  );
};

// Increment failed attempts
MeterRegistration.incrementFailedAttempts = (DRN, result) => {
  connection.query(
    "UPDATE meters SET failed_attempts = failed_attempts + 1, last_failed_attempt = NOW() WHERE DRN = ?",
    [DRN],
    (err, res) => {
      if (err) {
        result(null, err);
        return;
      }
      
      // Check if should lock
      connection.query(
        "SELECT failed_attempts FROM meters WHERE DRN = ?",
        [DRN],
        (err, rows) => {
          if (err || !rows.length) {
            result(null, { DRN: DRN });
            return;
          }
          
          const attempts = rows[0].failed_attempts;
          if (attempts >= 5) {
            // Lock for 1 hour
            const lockUntil = new Date(Date.now() + 60 * 60 * 1000);
            connection.query(
              "UPDATE meters SET locked_until = ? WHERE DRN = ?",
              [lockUntil, DRN],
              (err) => {
                result(null, { DRN: DRN, attempts: attempts, locked: true });
              }
            );
          } else {
            result(null, { DRN: DRN, attempts: attempts });
          }
        }
      );
    }
  );
};

// Reset failed attempts
MeterRegistration.resetFailedAttempts = (DRN, result) => {
  connection.query(
    "UPDATE meters SET failed_attempts = 0, locked_until = NULL WHERE DRN = ?",
    [DRN],
    (err, res) => {
      if (err) {
        result(null, err);
        return;
      }
      result(null, { DRN: DRN });
    }
  );
};

// Delete meter by DRN
MeterRegistration.remove = (DRN, result) => {
  connection.query(
    "DELETE FROM meters WHERE DRN = ?",
    [DRN],
    (err, res) => {
      if (err) {
        result(null, err);
        return;
      }
      if (res.affectedRows == 0) {
        result({ kind: "not_found" }, null);
        return;
      }
      result(null, res);
    }
  );
};

// Delete all meters
MeterRegistration.removeAll = (result) => {
  connection.query("DELETE FROM meters", (err, res) => {
    if (err) {
      result(null, err);
      return;
    }
    result(null, res);
  });
};

// Get registration statistics
MeterRegistration.getStats = (result) => {
  const query = `
    SELECT 
      COUNT(*) as total_meters,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_meters,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_meters,
      SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) as suspended_meters,
      SUM(CASE WHEN status = 'compromised' THEN 1 ELSE 0 END) as compromised_meters,
      SUM(CASE WHEN DATE(registered_at) = CURDATE() THEN 1 ELSE 0 END) as registered_today,
      SUM(CASE WHEN last_seen >= NOW() - INTERVAL 24 HOUR THEN 1 ELSE 0 END) as active_last_24h
    FROM meters
  `;

  connection.query(query, (err, res) => {
    if (err) {
      result(err, null);
      return;
    }
    result(null, res[0]);
  });
};

module.exports = MeterRegistration;