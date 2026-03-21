const connection = require("../service/hwDatabase.js");

// https://www.bezkoder.com/node-js-rest-api-express-mysql/

const MetersModels = function (meterDrn, profileValues) {
  this.Username = profileValues.Username;
  this.Password = profileValues.Password;
  this.FirstName = profileValues.FirstName;
  this.LastName = profileValues.LastName;
  this.Email = profileValues.Email;
  this.IsActive = profileValues.IsActive;
  this.RoleName = profileValues.RoleName;
  this.AccessLevel = profileValues.AccessLevel;

};



MetersModels.create = (newProfileValue, result) => {
    // Check if the user already exists by Username
    connection.query(
      "SELECT * FROM SytemUsers WHERE Username = ?",
      newProfileValue.Username,
      (err, existingUser) => {
        if (err) {
          result(err, null);
          return;
        }
  
        if (existingUser.length === 0) {
          // User does not exist, create a new user
          connection.query(
            "INSERT INTO SytemUsers SET ?",
            newProfileValue,
            (err, res) => {
              if (err) {
                result(err, null);
                return;
              }
              result(null, { id: res.insertId, ...newProfileValue });
            }
          );
        } else {
          // User with the same Username already exists
          result(null, { message: "User already exists", user: existingUser[0] });
        }
      }
    );
  };
  

  MetersModels.getAll = (DRN, result) => {

    let query = "SELECT * FROM SytemUsers";
    connection.query(query, (err, res) => {
      if (err) {
        result(null, err);
        return;
      }
      result(null, res);
    });
  };
  

MetersModels.findById = (DRN, result) => {
  connection.query(
    `SELECT * FROM SytemUsers WHERE Username = ${DRN}`,
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

MetersModels.remove = (DRN, result) => {
  connection.query(
    "DELETE FROM SytemUsers WHERE Username = ?",
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

MetersModels.removeAll = (result) => {
  connection.query("DELETE FROM SytemUsers", (err, res) => {
    if (err) {
      result(null, err);
      return;
    }
    result(null, res);
  });
};


/***************************************************** */
MetersModels.createReal = (newProfileValue, result) => {
  connection.query(
    "INSERT INTO SytemUsers SET ?",
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

MetersModels.getAllReal = (DRN, result) => {
  let query = "SELECT * FROM SytemUsers";
  
  connection.query(query, (err, res) => {
    if (err) {
      result(null, err);
      return;
    }
    result(null, res);
  });
};

MetersModels.findByIdReal= (DRN, result) => {
  connection.query(
    `SELECT * FROM SytemUsers WHERE DRN = ${DRN}`,
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


MetersModels.removeReal = (DRN, result) => {
  connection.query(
    "DELETE FROM SytemUsers WHERE DRN = ?",
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

MetersModels.removeAllReal = (result) => {
  connection.query("DELETE FROM SytemUsers", (err, res) => {
    if (err) {
      result(null, err);
      return;
    }
    result(null, res);
  });
};

MetersModels.updateByDRN = (Username, meter, result) => {
  connection.query(
    "UPDATE SytemUsers SET Username = ?, Password = ?, FirstName = ?, LastName = ?, Email = ?, IsActive = ?, RoleName = ?, AccessLevel = ? WHERE Username = ? ",
    [meter.Surname,meter.Password, meter.FirstName, meter.LastName, meter.Email, meter.IsActive, meter.AccessLevel, Username],
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


module.exports = MetersModels;
