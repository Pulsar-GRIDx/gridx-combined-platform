const connection = require("../service/hwDatabase.js");

// https://www.bezkoder.com/node-js-rest-api-express-mysql/

const meterProfileModel = function (meterDrn, profileValues) {
  this.DRN = meterDrn;
  this.Surname = profileValues.Surname;
  this.Name = profileValues.Name;
  this.Region = profileValues.Region;
  this.City = profileValues.City;
  this.StreetName = profileValues.StreetName;
  this.HouseNumber = profileValues.HouseNumber;
  this.SIMNumber = profileValues.SIMNumber;
  this.UserCategory = profileValues.UserCategory;

};


meterProfileModel.create = (newProfileValue, result) => {
  connection.query(
    "INSERT INTO MeterProfileReal SET ?",
    newProfileValue,
    (err, res) => {
      if (err) {
        result(err, null);
        return;
      }
      result(null, { id: res.insertId, ...newProfileValue });
    }
  );
};





meterProfileModel.getAll = (DRN, result) => {
  let query = "SELECT * FROM MeterProfileReal";
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

meterProfileModel.findById = (DRN, result) => {
  connection.query(
    `SELECT * FROM MeterProfileReal WHERE DRN = ${DRN}`,
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

meterProfileModel.remove = (DRN, result) => {
  connection.query(
    "DELETE FROM MeterProfileReal WHERE DRN = ?",
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

meterProfileModel.removeAll = (result) => {
  connection.query("DELETE FROM MeterProfileReal", (err, res) => {
    if (err) {
      result(null, err);
      return;
    }
    result(null, res);
  });
};


/***************************************************** */
meterProfileModel.createReal = (newProfileValue, result) => {
  connection.query(
    "INSERT INTO MeterProfileReal SET ?",
    newProfileValue,
    (err, res) => {
      if (err) {
        result(err, null);
        return;
      }
      result(null, { id: res.insertId, ...newProfileValue });
    }
  );
};

meterProfileModel.getAllReal = (DRN, result) => {
  let query = "SELECT * FROM MeterProfileReal";
  
  connection.query(query, (err, res) => {
    if (err) {
      result(null, err);
      return;
    }
    result(null, res);
  });
};

meterProfileModel.findByIdReal= (DRN, result) => {
  connection.query(
    `SELECT * FROM MeterProfileReal WHERE DRN = ${DRN}`,
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


meterProfileModel.removeReal = (DRN, result) => {
  connection.query(
    "DELETE FROM MeterProfileReal WHERE DRN = ?",
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

meterProfileModel.removeAllReal = (result) => {
  connection.query("DELETE FROM MeterProfileReal", (err, res) => {
    if (err) {
      result(null, err);
      return;
    }
    result(null, res);
  });
};

meterProfileModel.updateByDRN = (DRN, meter, result) => {
  connection.query(
    "UPDATE MeterProfileReal SET Surname = ?, Name = ?, Region = ?, City = ?, StreetName = ?, HouseNumber = ?, SIMNumber = ?, UserCategory = ? WHERE DRN = ? ",
    [meter.Surname, meter.Name, meter.Region, meter.City, meter.StreetName, meter.HouseNumber, meter.SIMNumber, meter.UserCategory, DRN],
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

      result(null, { DRN: DRN });
    }
  );
};


module.exports = meterProfileModel;
