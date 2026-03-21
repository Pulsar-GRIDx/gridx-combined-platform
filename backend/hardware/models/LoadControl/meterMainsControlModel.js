const connection = require("../../service/hwDatabase.js");

// https://www.bezkoder.com/node-js-rest-api-express-mysql/

const Load= function (meterDrn, cmd) {
  this.DRN = meterDrn;
    this.user = cmd.user;
    this.state = cmd.state;
  this.processed = cmd.processed;
  this.reason = cmd.reason;
};


Load.create = (data, result) => {
  connection.query(
    "INSERT INTO MeterMainsControlTable SET ?",
    data,
    (err, res) => {
      if (err) {
        result(err, null);
        return;
      }
      
      result(null, "Succefully update request");
      return;
    }
  );
};

Load.getAll = (DRN, result) => {
  let query = "SELECT * FROM MeterMainsControlTable";
 
  connection.query(query, (err, res) => {
    if (err) {
      result(null, err);
      return;
    }
    result(null, res);
  });
};

Load.findById = (DRN, result) => {
  connection.query(
    `SELECT * FROM MeterMainsControlTable WHERE DRN = ${DRN}`,
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

Load.remove = (DRN, result) => {
  connection.query(
    "DELETE FROM MeterMainsControlTable WHERE DRN = ?",
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

Load.removeAll = (result) => {
  connection.query("DELETE FROM MeterMainsControlTable", (err, res) => {
    if (err) {
      result(null, err);
      return;
    }
    result(null, res);
  });
};
Load.getLastCalibrationUpdate= (DRN, result) => {
  const query = "SELECT * FROM MeterMainsControlTable WHERE ID = (SELECT MAX(ID) FROM MeterMainsControlTable WHERE DRN = ?)";


  connection.query(query,[DRN],
    (err, res) => {
      if (err) {
        result(err, null);
        return;
      }
      if (res.length) {
        const resLoadState = {
          token: res[0].state,
          processed: res[0].processed,
        };
        result(null, res[0]);
        
        return;
      }
      // not found meter with the id
      result(null, null);
    }
  );
};

Load.getLastUpdate= (DRN, result) => {
  const query = "SELECT * FROM MeterMainsControlTable WHERE ID = (SELECT MAX(ID) FROM MeterMainsControlTable WHERE DRN = ?)";


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



Load.updatePrecessed = (DRN, processed,ID,result) => {
  connection.query(
    "UPDATE MeterMainsControlTable SET processed = ? WHERE DRN = ? AND ID = ?",
    [processed,DRN,ID],
    (err, res) => {
      if (err) {
        result(null, err);
        return;
      }

      if (res.affectedRows == 0) {
        
        result(null, null);
        return;
      }
      
      result(null, {DRN:DRN});
    }
  );
};

module.exports = Load;
