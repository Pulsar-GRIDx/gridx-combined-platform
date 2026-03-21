const connection = require("../service/hwDatabase.js");

const PostpaidBillingConfigModel = function (meterDrn, billingData) {
  this.DRN = meterDrn;
    this.billingType = billingData.billingType;
    this.creditOption = billingData.creditOption;
    this.selectedCreditAmount = billingData.selectedCreditAmount;
    this.notificationType = billingData.notificationType;
    this.notificationFrequency = billingData.notificationFrequency;
    this.automaticCreditUpdates = billingData.automaticCreditUpdates;
    this.creditPurchaseAmount = billingData.creditPurchaseAmount;
    this.maxMontlySet = billingData.maxMontlySet;
    this.maxMontlyAmount = billingData.maxMontlyAmount;
    this.billingPeriod = billingData.billingPeriod;
    this.billingCreditDays = billingData.billingCreditDays;
    this.netNotificationTypes = billingData.netNotificationTypes;
    this.amountNotifications = billingData.amountNotifications;
    this.amountCutOff = billingData.amountCutOff;
    this.automaticCutOffPeriod = billingData.automaticCutOffPeriod;
    this.user = billingData.user;
    this.processed = billingData.processed;
};

PostpaidBillingConfigModel.create = (newConfigValue, result) => {
  connection.query(
    "INSERT INTO BillingConfigurations SET ?",
    newConfigValue,
    (err, res) => {
      if (err) {
        result(err, null);
        return;
      }
      result(null, { id: res.insertId, ...newConfigValue });
    }
  );
};

PostpaidBillingConfigModel.getByBillingType = (billingType, result) => {
  let query = "";
  switch (billingType) {
    case "prepaid":
      query = "SELECT * FROM BillingConfigurations WHERE billingType = 'prepaid'";
      break;
    case "postpaid":
      query = "SELECT * FROM BillingConfigurations WHERE billingType = 'postpaid'";
      break;
    default:
      result({ message: "Invalid billing type" }, null);
      return;
  }

  connection.query(query, (err, res) => {
    if (err) {
      result(err, null);
      return;
    }
    result(null, res);
  });
};

PostpaidBillingConfigModel.getAll = (DRN, result) => {
  let query = "SELECT * FROM BillingConfigurations";
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

PostpaidBillingConfigModel.findById = (DRN, result) => {
  connection.query(
    `SELECT * FROM BillingConfigurations WHERE DRN = ${DRN}`,
    (err, res) => {
      if (err) {
        result(err, null);
        return;
      }
      if (res.length) {
        result(null, res[0]);
        return;
      }
      result({ kind: "not_found" }, null);
    }
  );
};

PostpaidBillingConfigModel.remove = (DRN, result) => {
  connection.query(
    "DELETE FROM BillingConfigurations WHERE DRN = ?",
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

PostpaidBillingConfigModel.updateByDRN  = (DRN, updatedData, result) => {
    connection.query(
        "UPDATE BillingConfigurations SET ? WHERE DRN = ?",
        [updatedData, DRN],
        (err, res) => {
            if (err) {
                result(err, null);
                return;
            }
            if (res.affectedRows == 0) {
                // Not found meter with the given id
                result({ kind: "not_found" }, null);
                return;
            }
            result(null, { DRN: DRN, ...updatedData });
        }
    );
};

PostpaidBillingConfigModel.removeAll = (result) => {
  connection.query("DELETE FROM BillingConfigurations", (err, res) => {
    if (err) {
      result(null, err);
      return;
    }
    result(null, res);
  });
};

PostpaidBillingConfigModel.getLastUpdate= (DRN, result) => {
    const query = "SELECT * FROM BillingConfigurations WHERE ID = (SELECT MAX(ID) FROM PostpaidBillingConfigurations WHERE DRN = ?)";
  
  
    connection.query(query,[DRN],
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
  
  
  
  PostpaidBillingConfigModel.updatePrecessed = (DRN, processed,ID,result) => {
    connection.query(
      "UPDATE BillingConfigurations SET processed = ? WHERE DRN = ?",
      [processed,DRN],
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
  

module.exports = PostpaidBillingConfigModel;
