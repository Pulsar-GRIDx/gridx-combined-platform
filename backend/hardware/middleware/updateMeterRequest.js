const meterCalibrationModel = require("../models/meterCalibrationModel");
const meterLoadControlModel = require("../models/meterLoadControlModel");
const meterSendTokenModel = require("../models/meterSendTokenModel");
const meterResetModel = require("../models/meterResetModel");
const meterBLEResetModel = require("../models/meterBLEResetModel");
const meterResetAuthNumbersModel = require("../models/meterResetAuthNumbersModel");
const meterTariffModel = require("../models/meterTarrifModel");
const meterNumbersModel = require("../models/meterResponseNumberModel");

// add this:
const TariffUpdateStatus = require("../models/meterTariffUpdateStatusmodel");

const meterHeaterControlModel = require("../models/LoadControl/meterHeaterControlModel");
const meterHeaterStateModel = require("../models/LoadControl/meterHeaterStateModel");
const meterMainsControlModel = require("../models/LoadControl/meterMainsControlModel");
const meterMainsStateModel = require("../models/LoadControl/meterMainsStateModel");

const updateRecord = function (meterDrn, cmd) {
  this.DRN = meterDrn;
};
var updateCmds = {};

updateRecord.checkUpdates = async (DRN, callback) => {
  updateCmds = {};

  try {
    // Wait for checkAndUpdateLoadControl to resolve
    //const loadControlData = await checkAndUpdateLoadControl(DRN);
    //updateCmds = Object.assign(updateCmds, { ...loadControlData });

    // Wait for checkAndUpdateCalibration to resolve
    const calibrationData = await checkAndUpdateCalibration(DRN);
    updateCmds = Object.assign(updateCmds, { ...calibrationData });

    // Wait for checkAndUpdateSTSToken to resolve
    const STSTokenData = await checkAndUpdateSTSToken(DRN);
    updateCmds = Object.assign(updateCmds, { ...STSTokenData });

    // Wait for checkAndUpdateReset to resolve
    const MeterReset = await checkAndUpdateReset(DRN);
    updateCmds = Object.assign(updateCmds, { ...MeterReset });

    // Wait for MeterResetBLE to resolve
    const MeterResetBLE = await checkAndUpdateResetBLE(DRN);
    updateCmds = Object.assign(updateCmds, { ...MeterResetBLE });

    // Wait for MeterResetBLE to resolve
    const MeterResetAuthNumbers = await checkAndUpdateResetAuthNumbers(DRN);
    updateCmds = Object.assign(updateCmds, { ...MeterResetAuthNumbers });

    // Wait for checkAndUpdateHeaterControl to resolve
    const HeaterControl = await checkAndUpdateHeaterControl(DRN);
    updateCmds = Object.assign(updateCmds, { ...HeaterControl });

    // Wait for checkAndUpdateHeaterState to resolve
    const HeaterState = await checkAndUpdateHeaterState(DRN);
    updateCmds = Object.assign(updateCmds, { ...HeaterState });

    // Wait for checkAndUpdateMainsControl to resolve
    const MainsControl = await checkAndUpdateMainsControl(DRN);
    updateCmds = Object.assign(updateCmds, { ...MainsControl });

    // Wait for checkAndUpdateMainsState to resolve
    const MainsState = await checkAndUpdateMainsState(DRN);
    updateCmds = Object.assign(updateCmds, { ...MainsState });

    // Wait for checkAndUpdateTariff to resolve
    const Traff = await checkAndUpdateTariff(DRN);
    updateCmds = Object.assign(updateCmds, { ...Traff });

    const ResponseNumber = await checkAndUpdateSMSResponseNumber(DRN);
    updateCmds = Object.assign(updateCmds, { ...ResponseNumber });

    // Tariff updates ✅
    const tariffUpdates = await checkAndUpdateTariffUpdates(DRN);
    // updateCmds = {updateCmds, ...tariffUpdates };
    updateCmds = Object.assign(updateCmds, { ...tariffUpdates });

    // Return the updateCmds object
    callback(null, updateCmds);
  } catch (error) {
    // Handle any errors that occurred during the async operations
    console.error(error);
    callback(error, null);
  }
};

async function checkAndUpdateLoadControl(DRN) {
  return new Promise((resolve, reject) => {
    meterLoadControlModel.getLastUpdate(DRN, (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      if (!!data)
        if (data.processed == 0) {
          meterLoadControlModel.updatePrecessed(
            data.DRN,
            1,
            data.id,
            (err, res) => {
              if (err) {
                reject(err);
                return;
              }
            }
          );

          resolve({
            gs: data.geyser_state,
            gc: data.geyser_control,
            ms: data.mains_state,
            mc: data.mains_control,
          });
          return;
        }
      resolve({});
      return;
    });
  });
}

async function checkAndUpdateCalibration(DRN) {
  return new Promise((resolve, reject) => {
    meterCalibrationModel.getLastUpdate(DRN, (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      if (!!data)
        if (data.processed == 0) {
          meterCalibrationModel.updatePrecessed(
            data.DRN,
            1,
            data.id,
            (err, res) => {
              if (err) {
                reject(err);
                return;
              }
            }
          );

          resolve({ cl: data.processed });
          return;
        }
      resolve({});
      return;
    });
  });
}

async function checkAndUpdateSTSToken(DRN) {
  return new Promise((resolve, reject) => {
    meterSendTokenModel.getLastUpdate(DRN, (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      if (!!data)
        if (data.processed == 0) {
          meterSendTokenModel.updatePrecessed(
            data.DRN,
            1,
            data.id,
            (err, res) => {
              if (err) {
                reject(err);
                return;
              }
            }
          );

          resolve({ tk: data.token_ID });
          return;
        }
      resolve({});
      return;
    });
  });
}

async function checkAndUpdateReset(DRN) {
  return new Promise((resolve, reject) => {
    meterResetModel.getLastUpdate(DRN, (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      if (!!data)
        if (data.processed == 0) {
          meterResetModel.updatePrecessed(data.DRN, 1, data.id, (err, res) => {
            if (err) {
              reject(err);
              return;
            }
          });

          resolve({ mr: data.processed });
          return;
        }

      resolve({});
      return;
    });
  });
}

async function checkAndUpdateResetBLE(DRN) {
  return new Promise((resolve, reject) => {
    meterBLEResetModel.getLastUpdate(DRN, (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      if (!!data)
        if (data.processed == 0) {
          meterBLEResetModel.updatePrecessed(
            data.DRN,
            1,
            data.id,
            (err, res) => {
              if (err) {
                reject(err);
                return;
              }
            }
          );

          resolve({ br: data.processed });
          return;
        }

      resolve({});
      return;
    });
  });
}

async function checkAndUpdateResetAuthNumbers(DRN) {
  return new Promise((resolve, reject) => {
    meterResetAuthNumbersModel.getLastUpdate(DRN, (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      if (!!data)
        if (data.processed == 0) {
          meterResetAuthNumbersModel.updatePrecessed(
            data.DRN,
            1,
            data.id,
            (err, res) => {
              if (err) {
                reject(err);
                return;
              }
            }
          );

          resolve({ ar: data.processed });
          return;
        }

      resolve({});
      return;
    });
  });
}

async function checkAndUpdateHeaterControl(DRN) {
  return new Promise((resolve, reject) => {
    meterHeaterControlModel.getLastUpdate(DRN, (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      if (!!data)
        if (data.processed == 0) {
          meterHeaterControlModel.updatePrecessed(
            data.DRN,
            1,
            data.id,
            (err, res) => {
              if (err) {
                reject(err);
                return;
              }
            }
          );

          resolve({ gc: data.state });
          return;
        }

      resolve({});
      return;
    });
  });
}

async function checkAndUpdateHeaterState(DRN) {
  return new Promise((resolve, reject) => {
    meterHeaterStateModel.getLastUpdate(DRN, (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      if (!!data)
        if (data.processed == 0) {
          meterHeaterStateModel.updatePrecessed(
            data.DRN,
            1,
            data.id,
            (err, res) => {
              if (err) {
                reject(err);
                return;
              }
            }
          );

          resolve({ gs: data.state });
          return;
        }

      resolve({});
      return;
    });
  });
}

async function checkAndUpdateMainsControl(DRN) {
  return new Promise((resolve, reject) => {
    meterMainsControlModel.getLastUpdate(DRN, (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      if (!!data)
        if (data.processed == 0) {
          meterMainsControlModel.updatePrecessed(
            data.DRN,
            1,
            data.id,
            (err, res) => {
              if (err) {
                reject(err);
                return;
              }
            }
          );

          resolve({ mc: data.state });
          return;
        }

      resolve({});
      return;
    });
  });
}

async function checkAndUpdateMainsState(DRN) {
  return new Promise((resolve, reject) => {
    meterMainsStateModel.getLastUpdate(DRN, (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      if (!!data)
        if (data.processed == 0) {
          meterMainsStateModel.updatePrecessed(
            data.DRN,
            1,
            data.id,
            (err, res) => {
              if (err) {
                reject(err);
                return;
              }
            }
          );

          resolve({ ms: data.state });
          return;
        }

      resolve({});
      return;
    });
  });
}

async function checkAndUpdateTariff(DRN) {
  return new Promise((resolve, reject) => {
    meterTariffModel.getLastUpdate(DRN, (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      if (!!data)
        if (data.processed == 0) {
          meterTariffModel.updatePrecessed(data.DRN, 1, data.id, (err, res) => {
            if (err) {
              reject(err);
              return;
            }
          });

          resolve({ tr: data.rate });
          return;
        }

      resolve({});
      return;
    });
  });
}

async function checkAndUpdateSMSResponseNumber(DRN) {
  return new Promise((resolve, reject) => {
    meterNumbersModel.getLastUpdate(DRN, (err, data) => {
      if (err) {
        console.error("Error fetching SMS response number:", err);
        reject(err);
        return;
      }

      if (data && data.processed == 0) {
        meterNumbersModel.updateProcessed(data.DRN, 1, data.id, (err2, res) => {
          if (err2) {
            console.error("Error updating processed:", err2);
            reject(err2);
            return;
          }

          // Construct and return the response with both fields
          resolve({
            as: data.sms_response_number, // SMS response number
            ase: data.sms_response_enabled === 1, // Convert numeric to boolean
          });
        });
        return;
      }

      resolve({});
    });
  });
}

async function checkAndUpdateBaseDomain(DRN) {
  return new Promise((resolve, reject) => {
    meterNumbersModel.getBaseDomainUpdate(DRN, (err, data) => {
      if (err) {
        console.error("Error fetching base domain:", err);
        reject(err);
        return;
      }

      if (data && data.processed == 0) {
        meterNumbersModel.updateBaseDomainProcessed(
          data.DRN,
          1,
          data.id,
          (err2, res) => {
            if (err2) {
              console.error("Error updating base domain processed:", err2);
              reject(err2);
              return;
            }

            // Return the base domain as "bl"
            resolve({
              bl: data.base_domain,
            });
          }
        );
        return;
      }

      resolve({});
    });
  });
}

async function checkAndUpdateSleepModeFlag(DRN) {
  return new Promise((resolve, reject) => {
    meterNumbersModel.getSleepModeUpdate(DRN, (err, data) => {
      if (err) {
        console.error("Error fetching sleep mode flag:", err);
        reject(err);
        return;
      }

      if (data && data.processed === 0) {
        meterNumbersModel.updateSleepModeProcessed(
          data.DRN,
          1,
          data.id,
          (err2, res) => {
            if (err2) {
              console.error("Error updating sleep mode processed:", err2);
              reject(err2);
              return;
            }

            resolve({
              sd: data.sleep_mode_enabled === 1, // Return as boolean
            });
          }
        );
        return;
      }

      resolve({});
    });
  });
}

// --------------------------
// ✅ Function: checkAndUpdateTariffUpdates
// --------------------------
// Fetches the most recent pending tariff update for a specific meter (DRN),
// marks it as updated, and returns a clean JSON response.
async function checkAndUpdateTariffUpdates(DRN) {
  return new Promise((resolve, reject) => {
    try {
      // 1️⃣ Get the most recent pending tariff record for this DRN
      TariffUpdateStatus.getPendingMeterByDRN(DRN, (err, tariffUpdate) => {
        if (err) {
          console.error("❌ Error fetching pending tariff for meter:", err);
          return reject({
            success: false,
            message: "Database error fetching pending tariff for meter",
            data: { error: err, meterDRN: DRN },
          });
        }

        if (!tariffUpdate.data) {
          return resolve({});
        }

        TariffUpdateStatus.updateStatusToUpdated(
          DRN,
          tariffUpdate.tariff_id,
          (updateErr) => {
            if (updateErr) {
              console.error("❌ Error updating tariff status:", updateErr);
              return reject({
                success: false,
                message: "Error updating tariff update status",
                data: {
                  error: updateErr,
                  meterDRN: DRN,
                  tariff_id: tariffUpdate.tariff_id,
                },
              });
            }

            return resolve({
              ty: tariffUpdate.data?.tariff_value
                ? Number(tariffUpdate.data.tariff_value) * 1000
                : 0,
            });
          }
        );
      });
    } catch (ex) {
      // synchronous error (e.g. TariffUpdateStatus is undefined)
      reject({
        success: false,
        message: "Unexpected error",
        data: { error: ex },
      });
    }
  });
}

module.exports = updateRecord;
