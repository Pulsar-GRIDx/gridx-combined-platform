const connection = require("../../service/hwDatabase.js");

const SecurityLog = function(logData) {
  this.meter_id = logData.meter_id;
  this.DRN = logData.DRN;
  this.event_type = logData.event_type;
  // FIXED: Ensure details is always a valid JSON string
  this.details = logData.details ? logData.details : '{}';
  this.ip_address = logData.ip_address;
};

// Create security log entry
SecurityLog.create = (data, result) => {
  connection.query(
    "INSERT INTO security_logs SET ?",
    data,
    (err, res) => {
      if (err) {
        result(err, null);
        return;
      }
      result(null, { id: res.insertId });
    }
  );
};

// Get logs by meter DRN
SecurityLog.getByMeterDRN = (DRN, limit, result) => {
  const queryLimit = limit || 50;
  connection.query(
    "SELECT * FROM security_logs WHERE DRN = ? ORDER BY created_at DESC LIMIT ?",
    [DRN, queryLimit],
    (err, res) => {
      if (err) {
        result(err, null);
        return;
      }
      result(null, res);
    }
  );
};

// Get logs by event type
SecurityLog.getByEventType = (eventType, limit, result) => {
  const queryLimit = limit || 100;
  connection.query(
    "SELECT * FROM security_logs WHERE event_type = ? ORDER BY created_at DESC LIMIT ?",
    [eventType, queryLimit],
    (err, res) => {
      if (err) {
        result(err, null);
        return;
      }
      result(null, res);
    }
  );
};

// Get recent security events
SecurityLog.getRecent = (hours, result) => {
  const hoursAgo = hours || 24;
  connection.query(
    "SELECT * FROM security_logs WHERE created_at >= NOW() - INTERVAL ? HOUR ORDER BY created_at DESC",
    [hoursAgo],
    (err, res) => {
      if (err) {
        result(err, null);
        return;
      }
      result(null, res);
    }
  );
};

// Get security event statistics
SecurityLog.getStats = (result) => {
  const query = `
    SELECT 
      event_type,
      COUNT(*) as count,
      DATE(created_at) as date
    FROM security_logs 
    WHERE created_at >= NOW() - INTERVAL 7 DAY
    GROUP BY event_type, DATE(created_at)
    ORDER BY date DESC, count DESC
  `;

  connection.query(query, (err, res) => {
    if (err) {
      result(err, null);
      return;
    }
    result(null, res);
  });
};

module.exports = SecurityLog;