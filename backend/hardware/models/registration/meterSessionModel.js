const connection = require("../../service/hwDatabase.js");

const MeterSession = function(sessionData) {
  this.meter_id = sessionData.meter_id;
  this.session_id = sessionData.session_id;
  this.session_key = sessionData.session_key;
  this.issued_at = sessionData.issued_at || new Date();
  this.expires_at = sessionData.expires_at;
  this.last_activity = sessionData.last_activity;
  this.ip_address = sessionData.ip_address;
  this.user_agent = sessionData.user_agent;
  this.is_active = sessionData.is_active !== undefined ? sessionData.is_active : true;
};

// Create new session
MeterSession.create = (data, result) => {
  connection.query(
    "INSERT INTO sessions SET ?",
    data,
    (err, res) => {
      if (err) {
        result(err, null);
        return;
      }
      
      result(null, { id: res.insertId, ...data });
    }
  );
};

// Find active session by session ID
MeterSession.findBySessionId = (sessionId, result) => {
  connection.query(
    `SELECT s.*, m.DRN, m.status as meter_status 
     FROM sessions s
     JOIN meters m ON s.meter_id = m.id
     WHERE s.session_id = ? AND s.is_active = 1 AND s.expires_at > NOW()`,
    [sessionId],
    (err, res) => {
      if (err) {
        result(err, null);
        return;
      }
      if (res.length) {
        result(null, res[0]);
        return;
      }
      result({ kind: "not_found" }, null);
    }
  );
};

// Find active sessions by meter DRN
MeterSession.findByMeterDRN = (DRN, result) => {
  connection.query(
    `SELECT s.* 
     FROM sessions s
     JOIN meters m ON s.meter_id = m.id
     WHERE m.DRN = ? AND s.is_active = 1 AND s.expires_at > NOW()
     ORDER BY s.issued_at DESC`,
    [DRN],
    (err, res) => {
      if (err) {
        result(err, null);
        return;
      }
      result(null, res);
    }
  );
};

// Update last activity
MeterSession.updateActivity = (sessionId, result) => {
  connection.query(
    "UPDATE sessions SET last_activity = NOW() WHERE session_id = ?",
    [sessionId],
    (err, res) => {
      if (err) {
        result(null, err);
        return;
      }
      result(null, { session_id: sessionId });
    }
  );
};

// Deactivate session
MeterSession.deactivate = (sessionId, result) => {
  connection.query(
    "UPDATE sessions SET is_active = 0 WHERE session_id = ?",
    [sessionId],
    (err, res) => {
      if (err) {
        result(null, err);
        return;
      }
      result(null, { session_id: sessionId });
    }
  );
};

// Deactivate all sessions for a meter
MeterSession.deactivateAllForMeter = (meterId, result) => {
  connection.query(
    "UPDATE sessions SET is_active = 0 WHERE meter_id = ?",
    [meterId],
    (err, res) => {
      if (err) {
        result(null, err);
        return;
      }
      result(null, { meter_id: meterId, affected: res.affectedRows });
    }
  );
};

// Clean up expired sessions
MeterSession.cleanupExpired = (result) => {
  connection.query(
    "DELETE FROM sessions WHERE expires_at < NOW() OR is_active = 0",
    (err, res) => {
      if (err) {
        result(null, err);
        return;
      }
      result(null, { cleaned: res.affectedRows });
    }
  );
};

// Get session by ID (including expired)
MeterSession.getById = (id, result) => {
  connection.query(
    "SELECT * FROM sessions WHERE id = ?",
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
      result({ kind: "not_found" }, null);
    }
  );
};

module.exports = MeterSession;