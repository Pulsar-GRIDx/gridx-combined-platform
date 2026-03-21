const connection = require("../service/hwDatabase.js");

// https://www.bezkoder.com/node-js-rest-api-express-mysql/

const meterModel = function (meterDrn, Values) {
    this.DRN = meterDrn;
    this.LocationName = Values.LocationName;
    this.Name = Values.Name;
    this.Type = Values.Type;
    this.pLat = Values.pLat;
	this.pLng = Values.pLng;
	this.Status = Values.Status;
	this.PowerSupply = Values.PowerSupply;
    this.powerRating = Values.powerRating;
	
};


meterModel.create = (newValue, result) => {
	connection.query(
		"INSERT INTO TransformerInformation SET ?",
		newValue,
		(err, res) => {
			if (err) {
				result(err, null);
				return;
			}
			result(null, { id: res.insertId, ...newValue });
		}
	);
};

meterModel.getAll = (DRN, result) => {
	let query = "SELECT * FROM TransformerInformation";
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

meterModel.findById = (DRN, result) => {
	connection.query(
		`SELECT * FROM TransformerInformation WHERE DRN = ${DRN}`,
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

meterModel.remove = (DRN, result) => {
	connection.query(
		"DELETE FROM TransformerInformation WHERE DRN = ?",
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

meterModel.removeAll = (result) => {
	connection.query("DELETE FROM TransformerInformation", (err, res) => {
		if (err) {
			result(null, err);
			return;
		}
		result(null, res);
	});
};

/************************************************************************************ */
meterModel.createReal = (newValue, result) => {
	connection.query(
		"INSERT INTO TransformerInformation SET ?",
		newValue,
		(err, res) => {
			if (err) {
				result(err, null);
				return;
			}
			result(null, { id: res.insertId, ...newProfileValue });
		}
	);
};

meterModel.getAllReal = (DRN, result) => {
	
	let query = "SELECT * FROM TransformerInformation";
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

meterModel.findByIdReal = (DRN, result) => {
	connection.query(
		`SELECT * FROM TransformerInformation WHERE DRN = ${DRN}`,
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

meterModel.removeReal = (DRN, result) => {
	connection.query(
		"DELETE FROM TransformerInformation WHERE DRN = ?",
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

meterModel.removeAllReal = (result) => {
	connection.query("DELETE FROM TransformerInformation", (err, res) => {
		if (err) {
			result(null, err);
			return;
		}
		result(null, res);
	});
};

meterModel.updateByDRN = (DRN, meter, result) => {
  connection.query(
    "UPDATE TransformerInformation SET LocationName = ?, Name = ?, Type = ?, pLat = ?, pLng = ?, Status = ?, PowerSupply = ?, powerRating = ? WHERE DRN = ? ",
    [meter.LocationName, meter.Name, meter.Type,meter.pLat, meter.pLng, meter.Status, meter.PowerSupply, meter.powerRating,  DRN],
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


module.exports = meterModel;
