const connection = require("../service/hwDatabase.js");

// https://www.bezkoder.com/node-js-rest-api-express-mysql/

const STSToken= function (meterDrn, token) {
  this.DRN = meterDrn;
  this.token_ID = token.token_ID;
  this.user = token.user;
  this.processed = token.processed;
};

STSToken.create = (data, result) => {
  connection.query(
    "INSERT INTO SendSTSToken SET ?",
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
 
STSToken.getAll = (DRN, result) => {
  let query = "SELECT * FROM SendSTSToken";
 
  connection.query(query, (err, res) => {
    if (err) {
      result(null, err);
      return;
    }
    result(null, res);
  });
};

STSToken.findById = (DRN, result) => {
  connection.query(
    `SELECT * FROM SendSTSToken WHERE DRN = ${DRN}`, 
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


STSToken.remove = (DRN, result) => {
  connection.query(
    "DELETE FROM SendSTSToken WHERE DRN = ?",
    DRN,
    (err, res) => {
      if (err) {
        result(null, err);
        return;
      }
      if (res.affectedRows == 0) {
        // not found meter with the DRN
        result( null);
        return;
      }
      result(null, res);
    }
  );
};

STSToken.removeAll = (result) => {
  connection.query("DELETE FROM SendSTSToken", (err, res) => {
    if (err) {
      result(null, err);
      return;
    }
    result(null, res);
  });
};

STSToken.getLastUpdate = (DRN, result) => {
     const query = "SELECT * FROM SendSTSToken WHERE ID = (SELECT MAX(ID) FROM SendSTSToken WHERE DRN = ?)";
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

STSToken.updatePrecessed = (DRN, processed,ID,result) => {
  connection.query(
    "UPDATE SendSTSToken SET processed = ? WHERE DRN = ? AND ID = ?",
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

module.exports = STSToken;
