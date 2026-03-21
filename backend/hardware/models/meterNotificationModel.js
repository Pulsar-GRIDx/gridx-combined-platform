const connection = require("../service/hwDatabase.js");

// https://www.bezkoder.com/node-js-rest-api-express-mysql/

const meterProfileModel = function (Drn, profileValues) {
  this.DRN = Drn;
  this.Alarm = profileValues.Alarm;
  this.AlarmType = profileValues.AlarmType;
  
};

meterProfileModel.create = (newProfileValue, result) => {
  connection.query(
    "INSERT INTO MeterNotifications SET ?",
    newProfileValue,
    (err, res) => {
      if (err) {
        result(err, null);
        return;
      }
      result(null, { id: res.insertId, ...newProfileValue });
    }
  );
};

meterProfileModel.getAll = (DRN, result) => {
  let query = "SELECT * FROM MeterNotifications";
  
  connection.query(query, (err, res) => {
    if (err) {
      result(null, err);
      return;
    }
    result(null, res);
  });
};

meterProfileModel.findById = (DRN, result) => {
  connection.query(
    `SELECT * FROM MeterNotifications WHERE DRN = ${DRN}`,
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

meterProfileModel.remove = (DRN, result) => {
  connection.query(
    "DELETE FROM MeterNotifications WHERE DRN = ?",
    DRN,
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
      result(null, res);
    }
  );
};

meterProfileModel.removeAll = (result) => {
  connection.query("DELETE FROM MeterNotifications", (err, res) => {
    if (err) {
      result(null, err);
      return;
    }
    result(null, res);
  });
};

module.exports = meterProfileModel;
