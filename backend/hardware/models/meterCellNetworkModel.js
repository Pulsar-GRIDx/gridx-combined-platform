const connection = require("../service/hwDatabase.js");

// https://www.bezkoder.com/node-js-rest-api-express-mysql/

const meterCellNetworkModel = function (meterDrn, cellNetworkvalues) {
  this.DRN = meterDrn;
  this.signal_strength = cellNetworkvalues[0];
  this.service_provider = cellNetworkvalues[1];
  this.sim_phone_number = cellNetworkvalues[2];
  this.IMEU = cellNetworkvalues[3];
  this.record_time = cellNetworkvalues[4];
};

meterCellNetworkModel.create = (cellNetworkData, result) => {
  connection.query(
    "INSERT INTO MeterCellularNetworkProperties SET ?",
    cellNetworkData,
    (err, res) => {
      if (err) {
        result(err, null);
        return;
      }
      result(null, { id: res.insertId, ...cellNetworkData });
    }
  );
};

meterCellNetworkModel.getAll = (DRN, result) => {
  let query = "SELECT * FROM MeterCellularNetworkProperties";
 
  connection.query(query, (err, res) => {
    if (err) {
      result(null, err);
      return;
    }
    result(null, res);
  });
};

meterCellNetworkModel.findById = (DRN, result) => {
  connection.query(
    `SELECT * FROM MeterCellularNetworkProperties WHERE DRN = ${DRN}`,
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

meterCellNetworkModel.remove = (DRN, result) => {
  connection.query(
    "DELETE FROM MeterCellularNetworkProperties WHERE DRN = ?",
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

meterCellNetworkModel.removeAll = (result) => {
  connection.query("DELETE FROM MeterCellularNetworkProperties", (err, res) => {
    if (err) {
      result(null, err);
      return;
    }
    result(null, res);
  });
};

meterCellNetworkModel.getLastUpdate= (DRN, result) => {
  const query = "SELECT * FROM MeterCellularNetworkProperties WHERE ID = (SELECT MAX(ID) FROM MeterCellularNetworkProperties WHERE DRN = ?)";
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
module.exports = meterCellNetworkModel;
