const connection = require("../service/hwDatabase.js");

const Calibration = function (meterDrn, cmd) {
  this.DRN = meterDrn;
  this.user = cmd.user;
  this.processed = cmd.processed;
  this.reason = cmd.reason;
  this.rate = cmd.rate; // Add rate property
  this.implementation_date_time =cmd.implementation_date_time;
};

Calibration.create = (DRN,data , result) => {
  connection.query("INSERT INTO tariff SET DRN = ?, user = ?, processed = ?, reason = ?, rate = ? , implementation_date_time = ?", 
  [DRN,  data.user, data.processed, data.reason, data.rate,data.implementation_date_time],
  (err, res) => {
    if (err) {
      result(err, null);
      return;
    }

    result(null, { id: res.insertId, DRN,...data });
  });
};

Calibration.getAll = (result) => {
  connection.query("SELECT * FROM tariff", (err, res) => {
    if (err) {
      result(null, err);
      return;
    }

    result(null, res);
  });
};

const updateTariffForDRN = (drn, data, callback) => {
  connection.query(
    "UPDATE tariff SET ? WHERE DRN = ?",
    [data, drn],
    (err, res) => {
      if (err) {
        callback(err, null);
        return;
      }
      callback(null, res);
    }
  );
};

Calibration.deleteAllTariffRecords = (callback) => {
  connection.query("DELETE FROM tariff", (err, res) => {
    if (err) {
      callback(err, null);
      return;
    }

    callback(null, res);
  });
};


Calibration.getAndUpdateAllDRN = (data, callback) => {
  // First delete all records from the tariff table
  connection.query("DELETE FROM tariff", (deleteErr, deleteRes) => {
    if (deleteErr) {
      callback(deleteErr, null);
      return;
    }

    // Fetch distinct DRNs from MeterProfileReal table
    connection.query("SELECT DISTINCT DRN FROM MeterProfileReal", (selectErr, selectRes) => {
      if (selectErr) {
        callback(selectErr, null);
        return;
      }

      const drns = selectRes.map(row => row.DRN);

      let updateCount = 0;
      const updateResults = [];

      drns.forEach(drn => {
        Calibration.create(drn, data, (createErr, result) => {
          if (createErr) {
            updateResults.push({ drn, success: false, error: createErr });
          } else {
            updateResults.push({ drn, success: true, result });
          }

          updateCount++;
          if (updateCount === drns.length) {
            callback(null, updateResults);
          }
        });
      });
    });
  });
};

Calibration.findById = (id, result) => {
  connection.query("SELECT * FROM tariff WHERE id = ?", id, (err, res) => {
    if (err) {
      result(err, null);
      return;
    }

    if (res.length) {
      result(null, res[0]);
      return;
    }

    // not found tariff with the id
    result({ kind: "not_found" }, null);
  });
};

Calibration.remove = (id, result) => {
  connection.query("DELETE FROM tariff WHERE id = ?", id, (err, res) => {
    if (err) {
      result(null, err);
      return;
    }

    if (res.affectedRows == 0) {
      // not found tariff with the id
      result({ kind: "not_found" }, null);
      return;
    }

    result(null, res);
  });
};

Calibration.removeAll = (result) => {
  connection.query("DELETE FROM tariff", (err, res) => {
    if (err) {
      result(null, err);
      return;
    }

    result(null, res);
  });
};

Calibration.getLastCalibrationUpdate= (DRN, result) => {
  const query = "SELECT * FROM tariff WHERE ID = (SELECT MAX(ID) FROM tariff WHERE DRN = ?)";


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
  const query = "SELECT * FROM tariff ORDER BY ID DESC LIMIT 1";


  connection.query(query,
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
    "UPDATE tariff SET processed = ? WHERE DRN = ? AND ID = ?",
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
