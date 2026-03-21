const connection = require("../service/hwDatabase.js");

// https://www.bezkoder.com/node-js-rest-api-express-mysql/

const meterProfileModel = function (meterDrn, profileValues) {
  this.DRN = meterDrn;
  this.LocationName = profileValues.LocationName;
  this.Type = profileValues.Type;
	this.Longitude = profileValues.Longitude;
	this.Lat = profileValues.Lat;
	this.Status = profileValues.Status;
	this.PowerSupply = profileValues.PowerSupply;
	this.pLat = profileValues.pLat;
	this.pLng = profileValues.pLng;
};

meterProfileModel.createTable = (error, result) => {

	const createTableQuery = `
  CREATE TABLE MeterLocationInfoTable (
    ID INT NOT NULL AUTO_INCREMENT,
    DRN VARCHAR(50) NOT NULL UNIQUE,
    LocationName VARCHAR(50) NOT NULL,
	Type VARCHAR(50) NOT NULL,
    Longitude VARCHAR(50) NOT NULL,
    Lat VARCHAR(50) NOT NULL,
    Status VARCHAR(50) NOT NULL,
    PowerSupply VARCHAR(50) NOT NULL,
    pLat VARCHAR(50) NOT NULL,
    pLng VARCHAR(50) NOT NULL,
    date_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (ID)
  );
`;

const deleteTableQuery = `DROP TABLE IF EXISTS MeterLocationInfoTable;`;
connection.query(createTableQuery, (err, res) => {
	if (err) {
		result(null, err);
		return;
	}
	
	result(null, res);
});
};



meterProfileModel.create = (newProfileValue, result) => {
	connection.query(
		"INSERT INTO MeterLocationInfoTable SET ?",
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
	let query = "SELECT * FROM MeterLocationInfoTable";
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

meterProfileModel.getBYTransID = (DRN, result) => {
	let query = "SELECT * FROM MeterLocationInfoTable";
	if (DRN) {
		query += ` WHERE PowerSupply LIKE '%${DRN}%'`;
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
		`SELECT * FROM MeterLocationInfoTable WHERE DRN = ${DRN}`,
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
		"DELETE FROM MeterLocationInfoTable WHERE DRN = ?",
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
	connection.query("DELETE FROM MeterLocationInfoTable", (err, res) => {
		if (err) {
			result(null, err);
			return;
		}
		result(null, res);
	});
};

/************************************************************************************ */
meterProfileModel.createReal = (newProfileValue, result) => {
	connection.query(
		"INSERT INTO MeterLocationInfoTable SET ?",
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
	
	let query = "SELECT * FROM MeterLocationInfoTable";
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

meterProfileModel.findByIdReal = (DRN, result) => {
	connection.query(
		`SELECT * FROM MeterLocationInfoTable WHERE DRN = ${DRN}`,
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
		"DELETE FROM MeterLocationInfoTable WHERE DRN = ?",
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
	connection.query("DELETE FROM MeterLocationInfoTable", (err, res) => {
		if (err) {
			result(null, err);
			return;
		}
		result(null, res);
	});
};

meterProfileModel.updateByDRN = (DRN, meter, result) => {
  connection.query(
    "UPDATE MeterLocationInfoTable SET LocationName = ?, Type = ?, Longitude = ?, Lat = ?, Status = ?, PowerSupply = ?, pLat = ?, pLng = ? WHERE DRN = ? ",
    [meter.LocationName, meter.Type, meter.Longitude,meter.Lat, meter.Status, meter.PowerSupply, meter.pLat, meter.pLng,  DRN],
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
