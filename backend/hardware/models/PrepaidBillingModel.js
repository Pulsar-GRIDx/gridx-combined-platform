const connection = require("../service/hwDatabase.js");

const prepaidBillingConfigModel = function (DRN, configValues) {
  this.DRN = DRN;
  this.creditOption = configValues.creditOption;
  this.selectedCreditAmount = configValues.selectedCreditAmount;
  this.notificationType = configValues.notificationType;
  this.notificationFrequency = configValues.notificationFrequency;
  this.automaticCreditUpdates = configValues.automaticCreditUpdates;
  this.creditPurchaseAmount = configValues.creditPurchaseAmount;
};

prepaidBillingConfigModel.create = (newConfigValues, result) => {
  connection.query(
    "INSERT INTO PrepaidBillingConfigurations SET ?",
    newConfigValues,
    (err, res) => {
      if (err) {
        result(err, null);
        return;
      }
      result(null, { id: res.insertId, ...newConfigValues });
    }
  );
};

prepaidBillingConfigModel.getAll = (DRN, result) => {
  let query = "SELECT * FROM PrepaidBillingConfigurations";
  if (DRN) {
    query += ` WHERE DRN = ${DRN}`;
  }
  connection.query(query, (err, res) => {
    if (err) {
      result(null, err);
      return;
    }
    result(null, res);
  });
};

prepaidBillingConfigModel.findById = (id, result) => {
  connection.query(
    "SELECT * FROM PrepaidBillingConfigurations WHERE id = ?",
    id,
    (err, res) => {
      if (err) {
        result(err, null);
        return;
      }
      if (res.length) {
        result(null, res[0]);
        return;
      }
      // Configuration not found
      result({ kind: "not_found" }, null);
    }
  );
};

prepaidBillingConfigModel.updateById = (id, config, result) => {
  connection.query(
    "UPDATE PrepaidBillingConfigurations SET ? WHERE id = ?",
    [config, id],
    (err, res) => {
      if (err) {
        result(err, null);
        return;
      }
      if (res.affectedRows == 0) {
        // Configuration not found
        result({ kind: "not_found" }, null);
        return;
      }
      result(null, { id: id, ...config });
    }
  );
};

prepaidBillingConfigModel.deleteById = (id, result) => {
  connection.query(
    "DELETE FROM PrepaidBillingConfigurations WHERE id = ?",
    id,
    (err, res) => {
      if (err) {
        result(err, null);
        return;
      }
      if (res.affectedRows == 0) {
        // Configuration not found
        result({ kind: "not_found" }, null);
        return;
      }
      result(null, res);
    }
  );
};

module.exports = prepaidBillingConfigModel;
