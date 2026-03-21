const connection = require("../service/hwDatabase.js");

const SMSResponseNumberModel = function (meterDrn, cmd) {
  this.DRN = meterDrn;
  this.user = cmd.user;
  this.sms_response_number = cmd.sms_response_number;
  this.processed = cmd.processed;
  this.reason = cmd.reason;
};

SMSResponseNumberModel.create = (data, result) => {
  connection.query(
    "INSERT INTO MeterSMSResponseNumberTable SET ?",
    data,
    (err, res) => {
      if (err) {
        result(err, null);
        return;
      }

      result(null, "Successfully created SMS response number entry.");
    }
  );
};

SMSResponseNumberModel.getAll = (DRN, result) => {
  const query = "SELECT * FROM MeterSMSResponseNumberTable";
  connection.query(query, (err, res) => {
    if (err) {
      result(null, err);
      return;
    }
    result(null, res);
  });
};

SMSResponseNumberModel.findById = (DRN, result) => {
  connection.query(
    `SELECT * FROM MeterSMSResponseNumberTable WHERE DRN = ?`,
    [DRN],
    (err, res) => {
      if (err) {
        result(err, null);
        return;
      }
      if (res.length) {
        result(null, res);
        return;
      }
      result({ kind: "not_found" }, null);
    }
  );
};

SMSResponseNumberModel.remove = (DRN, result) => {
  connection.query(
    "DELETE FROM MeterSMSResponseNumberTable WHERE DRN = ?",
    DRN,
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

SMSResponseNumberModel.removeAll = (result) => {
  connection.query("DELETE FROM MeterSMSResponseNumberTable", (err, res) => {
    if (err) {
      result(null, err);
      return;
    }
    result(null, res);
  });
};

SMSResponseNumberModel.getLastUpdate = (DRN, result) => {
  const query = `
    SELECT * FROM MeterSMSResponseNumberTable
    WHERE ID = (SELECT MAX(ID) FROM MeterSMSResponseNumberTable WHERE DRN = ?)
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

SMSResponseNumberModel.updateProcessed = (DRN, processed, ID, result) => {
  connection.query(
    "UPDATE MeterSMSResponseNumberTable SET processed = ? WHERE DRN = ? AND ID = ?",
    [processed, DRN, ID],
    (err, res) => {
      if (err) {
        result(null, err);
        return;
      }

      if (res.affectedRows === 0) {
        result(null, null);
        return;
      }

      result(null, { DRN: DRN });
    }
  );
};

module.exports = SMSResponseNumberModel;
