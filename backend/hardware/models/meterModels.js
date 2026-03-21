const connection = require("../service/hwDatabase.js");

// https://www.bezkoder.com/node-js-rest-api-express-mysql/
const MetersModels = function (meter) {
  this.DRN = meter.title;
  this.active_energy = meter.active_energy;
  this.reactive_energy = meter.reactive_energy;
};

MetersModels.create = (newPowerValue, result) => {
  connection.query("INSERT INTO tutorials SET ?", newPowerValue, (err, res) => {
    if (err) {
      result(err, null);
      return;
    }
    result(null, { id: res.insertId, ...newPowerValue });
  });
};

MetersModels.getAll = (DRN, result) => {
  let query = "SELECT * FROM MeterCumulativeEnergyUsage";
  if (DRN) {
    query += ` WHERE DRN LIKE '%${DRN}%'`;
  }
  connection.query(query, (err, res) => {
    if (err) {
      result(null, err);
      return;
    }
    result(null, res);
  });
};

MetersModels.findById = (DRN, result) => {
  connection.query(
    `SELECT * FROM MeterCumulativeEnergyUsage WHERE DRN = ${DRN}`,
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

module.exports = MetersModels;
