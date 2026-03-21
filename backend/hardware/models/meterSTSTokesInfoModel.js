const connection = require("../service/hwDatabase.js");

// https://www.bezkoder.com/node-js-rest-api-express-mysql/

const STSTokenModel = function (meterDrn, STSToken) {
  this.DRN = meterDrn;
  this.token_id = STSToken[0];
  this.token_cls = STSToken[1];
  this.submission_Method = STSToken[2];
  this.display_msg = STSToken[3];
  this.display_auth_result = STSToken[4];
  this.display_token_result = STSToken[5];
  this.display_validation_result = STSToken[6];
  this.token_time = STSToken[7];
  this.token_amount = STSToken[8];
};

STSTokenModel.create = (STSTokenData, result) => {
  connection.query(
    "INSERT INTO STSTokesInfo SET ?",
    STSTokenData,
    (err, res) => {
      if (err) {
        result(err, null);
        return;
      }
      result(null, { id: res.insertId, ...STSTokenData });
    }
  );
};

STSTokenModel.getAll = (DRN, result) => {
  let query = "SELECT * FROM STSTokesInfo";
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

STSTokenModel.findById = (DRN, result) => {
  connection.query(
    `SELECT * FROM STSTokesInfo WHERE DRN = ${DRN}`,
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

STSTokenModel.remove = (DRN, result) => {
  connection.query(
    "DELETE FROM STSTokesInfo WHERE DRN = ?",
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

STSTokenModel.removeAll = (result) => {
  connection.query("DELETE FROM STSTokesInfo", (err, res) => {
    if (err) {
      result(null, err);
      return;
    }
    result(null, res);
  });
};



STSTokenModel.getLastUpdate = (DRN, result) => {
     const query = "SELECT * FROM STSTokesInfo WHERE ID = (SELECT MAX(ID) FROM STSTokesInfo WHERE DRN = ?)";
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

STSTokenModel.updatePrecessed = (DRN, processed,ID,result) => {
  connection.query(
    "UPDATE STSTokesInfo SET processed = ? WHERE DRN = ? AND ID = ?",
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

module.exports = STSTokenModel;
