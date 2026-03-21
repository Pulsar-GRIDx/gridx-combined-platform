const connection = require("../service/hwDatabase.js");

// https://www.bezkoder.com/node-js-rest-api-express-mysql/

const meterLoadControlModel = function (meterDrn, loadStates) {
  this.DRN = meterDrn;
  this.geyser_state = loadStates[0];
  this.geyser_control = loadStates[1];
  this.mains_state = loadStates[2];
  this.mains_control = loadStates[3];
  
};

meterLoadControlModel.create = (LoadControlData, result) => {
  connection.query(
    "INSERT INTO MeterLoadControl SET ?",
    LoadControlData,
    (err, res) => {
      if (err) {
        result(err, null);
        return;
      }
      result(null, { id: res.ID, ...LoadControlData });
    }
  );
};

meterLoadControlModel.getAll = (DRN, result) => {
  let query = "SELECT * FROM MeterLoadControl";
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

meterLoadControlModel.findById = (DRN, result) => {
  connection.query(
    `SELECT * FROM MeterLoadControl WHERE DRN = ${DRN}`,
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


meterLoadControlModel.findById = (DRN, result) => {
  const query = 'SELECT * FROM MeterLoadControl WHERE DRN = ?';
  connection.query(query, [DRN], (err, res) => {
    if (err) {
      result(err, null);
      return;
    }
    if (res.length) {
      result(null, res);
      return;
    }
    // not found meter with the id
    result({ kind: 'not_found' }, null);
  });
};


meterLoadControlModel.remove = (DRN, result) => {
  connection.query(
    "DELETE FROM MeterLoadControl WHERE DRN = ?",
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

meterLoadControlModel.removeAll = (result) => {
  connection.query("DELETE FROM MeterLoadControl", (err, res) => {
    if (err) {
      result(null, err);
      return;
    }
    result(null, res);
  });
};

meterLoadControlModel.getLastUpdate = (DRN, result) => {
     const query = "SELECT * FROM MeterLoadControl WHERE ID = (SELECT MAX(ID) FROM MeterLoadControl WHERE DRN = ?)";
  connection.query(query,DRN,
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

meterLoadControlModel.updatePrecessed = (DRN, processed,ID,result) => {
  connection.query(
    "UPDATE MeterLoadControl SET processed = ? WHERE DRN = ? AND ID = ?",
    [processed,DRN,ID],
    (err, res) => {
      if (err) {
        result(null, err);
        return;
      }

      if (res.affectedRows == 0) {
        
        result(null, null);;
        return;
      }
      
      result(null, {DRN:DRN});
    }
  );
};

module.exports = meterLoadControlModel;
