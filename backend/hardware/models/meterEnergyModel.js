const connection = require("../service/hwDatabase.js");
const consumptionSync = require("../service/gridxConsumptionSync");

// https://www.bezkoder.com/node-js-rest-api-express-mysql/

const meterEnergyModel = function (meterDrn, energyValues) {
    this.DRN = meterDrn;
    this.active_energy = energyValues[0];
    this.reactive_energy = energyValues[1];
    this.units = energyValues[2];
    this.tamper_state = energyValues[3];
    this.tamp_time = energyValues[4];
    this.meter_reset = energyValues[5];
    this.record_time = energyValues[6];
    this.source = energyValues[7] ?? 0 
};

meterEnergyModel.create = (newEnergyValue, result) => {
  connection.query(
    "INSERT INTO MeterCumulativeEnergyUsage SET ?",
    newEnergyValue,
    (err, res) => {
      if (err) {
        result(err, null);
        return;
      }

      // Fire-and-forget: notify the GridX consumption sync pipeline.
      consumptionSync.onEnergyReading(newEnergyValue.DRN, newEnergyValue);

      result(null, { id: res.insertId, ...newEnergyValue });
    }
  );
};

meterEnergyModel.getAll = (DRN, result) => {
  let query = "SELECT * FROM MeterCumulativeEnergyUsage";
 
  connection.query(query, (err, res) => {
    if (err) {
      result(null, err);
      return;
    }
    result(null, res);
  });
};

meterEnergyModel.findById = (DRN, result) => {
  connection.query(
    `SELECT * FROM MeterCumulativeEnergyUsage WHERE DRN = ${DRN}`,
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

meterEnergyModel.remove = (DRN, result) => {
  connection.query(
    "DELETE FROM MeterCumulativeEnergyUsage WHERE DRN = ?",
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

meterEnergyModel.removeAll = (result) => {
  connection.query("DELETE FROM MeterCumulativeEnergyUsage", (err, res) => {
    if (err) {
      result(null, err);
      return;
    }
    result(null, res);
  });
};

meterEnergyModel.getByDRNAndDate = (year, month, day, DRN, result) => {
     const query = 'SELECT * FROM MeterCumulativeEnergyUsage WHERE YEAR(date_time) = ? AND MONTH(date_time) = ? AND DAY(date_time) = ? AND DRN = ?';
  connection.query(query, [year, month, day, DRN], (err, res) => {
    if (err) {
      result(null, err);
      return;
    }
     if (res.affectedRows == 0) {
        result({ kind: "not_found" }, null);
        return;
      }
    result(null, res);
  });
};

meterEnergyModel.getLastUpdate= (DRN, result) => {
  const query = "SELECT * FROM MeterCumulativeEnergyUsage WHERE ID = (SELECT MAX(ID) FROM MeterCumulativeEnergyUsage WHERE DRN = ?)";
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

module.exports = meterEnergyModel;
