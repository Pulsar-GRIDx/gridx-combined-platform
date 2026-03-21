const connection = require("../service/hwDatabase.js");

// https://www.bezkoder.com/node-js-rest-api-express-mysql/

const Calibration= function (meterDrn, cmd) {
  this.DRN = meterDrn;
  this.user = cmd.user;
  this.processed = cmd.processed;
  this.reason = cmd.reason;
};

Calibration.create = (data, result) => {
  connection.query(
    "INSERT INTO ResetAuthNumbers SET ?",
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

Calibration.getAll = (DRN, result) => {
  let query = "SELECT * FROM ResetAuthNumbers";
 
  connection.query(query, (err, res) => {
    if (err) {
      result(null, err);
      return;
    }
    result(null, res);
  });
};

Calibration.findById = (DRN, result) => {
  connection.query(
    `SELECT * FROM ResetAuthNumbers WHERE DRN = ${DRN}`,
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

Calibration.remove = (DRN, result) => {
  connection.query(
    "DELETE FROM ResetAuthNumbers WHERE DRN = ?",
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

Calibration.removeAll = (result) => {
  connection.query("DELETE FROM Reset", (err, res) => {
    if (err) {
      result(null, err);
      return;
    }
    result(null, res);
  });
};
Calibration.getLastCalibrationUpdate= (DRN, result) => {
  const query = "SELECT * FROM ResetAuthNumbers WHERE ID = (SELECT MAX(ID) FROM ResetAuthNumbers WHERE DRN = ?)";


  connection.query(query,[DRN],
    (err, res) => {
      if (err) {
        result(err, null);
        return;
      }
      if (res.length) {
        const resLoadState = {
          token: res[0].token_ID,
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

Calibration.getLastUpdate= (DRN, result) => {
  const query = "SELECT * FROM ResetAuthNumbers WHERE ID = (SELECT MAX(ID) FROM ResetAuthNumbers WHERE DRN = ?)";


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



Calibration.updatePrecessed = (DRN, processed,ID,result) => {
  connection.query(
    "UPDATE ResetAuthNumbers SET processed = ? WHERE DRN = ? AND ID = ?",
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

module.exports = Calibration;
