const connection = require("../service/hwDatabase.js");
const consumptionSync = require("../service/gridxConsumptionSync");

// https://www.bezkoder.com/node-js-rest-api-express-mysql/
const meterPowerModel = function (meterDrn, powervalues) {
  this.DRN = meterDrn;
  this.voltage = powervalues[1];
  this.current = powervalues[0];
  this.active_power = powervalues[2];
  this.reactive_power = powervalues[3];
  this.apparent_power = powervalues[4];
  this.temperature = powervalues[5];
  this.frequency = powervalues[6];
  this.power_factor = powervalues[7];
  this.record_time = powervalues[8];
  this.source = powervalues[9] ?? 0;
};

meterPowerModel.create = (newPowerValue, result) => {
  connection.query(
    "INSERT INTO MeteringPower SET ?",
    newPowerValue,
    (err, res) => {
      if (err) {
        result(err, null);
        return;
      }

      // Fire-and-forget: notify the GridX consumption sync pipeline.
      consumptionSync.onPowerReading(newPowerValue.DRN, newPowerValue);

      result(null, newPowerValue);
    }
  );
};

meterPowerModel.getAll = (DRN, result) => {
  let query = "SELECT * FROM MeteringPower";
 
  connection.query(query, (err, res) => {
    if (err) {
      result(null, err);
      return;
    }
    result(null, res);
  });
};

meterPowerModel.findById = (DRN, result) => {
  connection.query(
    `SELECT * FROM MeteringPower WHERE DRN = ${DRN}`,
    (err, res) => {
      if (err) {
        result(err, null);
        return;
      }
      if (res.length) {
        result(null, res);
        return;
      }
      // not found meter with the id
      result({ kind: "not_found" }, null);
    }
  );
};

meterPowerModel.remove = (DRN, result) => {
  connection.query(
    "DELETE FROM MeteringPower WHERE DRN = ?",
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

meterPowerModel.removeAll = (result) => {
  connection.query("DELETE FROM MeteringPower", (err, res) => {
    if (err) {
      result(null, err);
      return;
    }
    result(null, res);
  });
};

meterPowerModel.getLastUpdate= (DRN, result) => {
  const query = "SELECT * FROM MeteringPower WHERE ID = (SELECT MAX(ID) FROM MeteringPower WHERE DRN = ?)";
  connection.query(query,[DRN],
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
      result(null, null);
    }
  );
};

module.exports = meterPowerModel;
