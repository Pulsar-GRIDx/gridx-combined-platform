const connection = require("../service/hwDatabase.js");

const EmergencyResponse = function (data) {
  this.DRN = data.DRN || null;
  this.emergency_code = data.emergency_code;
  this.timestamp = data.timestamp;
};

EmergencyResponse.create = (data, result) => {
  connection.query(
    "INSERT INTO EmergencyResponse SET ?",
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

EmergencyResponse.getAll = (result) => {
  connection.query("SELECT * FROM EmergencyResponse", (err, res) => {
    if (err) {
      result(null, err);
      return;
    }
    result(null, res);
  });
};

EmergencyResponse.findById = (id, result) => {
  connection.query(
    "SELECT * FROM EmergencyResponse WHERE ID = ?",
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

EmergencyResponse.remove = (id, result) => {
  connection.query(
    "DELETE FROM EmergencyResponse WHERE ID = ?",
    [id],
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

EmergencyResponse.removeAll = (result) => {
  connection.query("DELETE FROM EmergencyResponse", (err, res) => {
    if (err) {
      result(null, err);
      return;
    }

    result(null, res);
  });
};

EmergencyResponse.getLastForDRN = (DRN, result) => {
  const query = `
    SELECT * FROM EmergencyResponse 
    WHERE DRN = ? 
    ORDER BY ID DESC 
    LIMIT 1
  `;

  connection.query(query, [DRN], (err, res) => {
    if (err) {
      result(err, null);
      return;
    }

    if (res.length) {
      result(null, res[0]);
      return;
    }

    result(null, null);
  });
};

module.exports = EmergencyResponse;
