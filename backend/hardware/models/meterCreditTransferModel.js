const connection = require("../service/hwDatabase.js");

const CreditTransfer = function (transferData) {
  this.token = transferData.token;
  this.sending_drn = transferData.sending_drn;
  this.receiving_drn = transferData.receiving_drn;
  this.phone_number = transferData.phone_number;
};
CreditTransfer.create = (data, result) => {
  connection.query(
    "INSERT INTO credit_transfers  SET ?",
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
}
CreditTransfer.getAll = (result) => {
  let query = "SELECT * FROM credit_transfers ";
  connection.query(query, (err, res) => {
    if (err) {
      result(null, err);
      return;
    }
    result(null, res);
  });
}

CreditTransfer.findById = (DRN, result) => {
  connection.query(
    `SELECT * FROM credit_transfers WHERE DRN = ${DRN}`, 
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

CreditTransfer.remove = (DRN, result) => {
  connection.query(
    "DELETE FROM credit_transfers WHERE DRN = ?",
    DRN,
    (err, res) => {
      if (err) {
        result(null, err);
        return;
      }
      if (res.affectedRows == 0) {
        // not found meter with the id
        result({ kind: "not_found" }, null);
        return;
      }
      result(null, res);
    }
  );
};
CreditTransfer.removeAll = (result) => {
  connection.query("DELETE FROM credit_transfers", (err, res) => {
    if (err) {
      result(null, err);
      return;
    }
    result(null, res);
  });
};


module.exports = CreditTransfer;