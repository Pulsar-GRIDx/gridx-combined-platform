const express = require("express");
const TariffUpdateStatus = require("./models/meterTariffUpdateStatusmodel");
const auth = require("./middleware/hwAuth");
const router = express.Router();

//
// 🟢 Get all tariff update status records
//
router.get("/getAll", auth, (req, res) => {
  TariffUpdateStatus.getAll((err, data) => {
    if (err) {
      res.status(500).send({
        message: err.message || "Error retrieving tariff update status data.",
      });
    } else {
      res.send(data);
    }
  });
});

//
// 🔍 Get status by Meter DRN (latest record)
//
router.get("/getByMeter/:meterDRN", auth, (req, res) => {
  TariffUpdateStatus.findByMeter(req.params.meterDRN, (err, data) => {
    if (err) {
      if (err.kind === "not_found") {
        res.status(404).send({ message: `No records found for meter ${req.params.meterDRN}.` });
      } else {
        res.status(500).send({ message: "Error retrieving meter " + req.params.meterDRN });
      }
    } else {
      res.send(data);
    }
  });
});

//
// 🔍 Get all meters pending update
//
router.get("/getPendingMeters", auth, (req, res) => {
  TariffUpdateStatus.getPendingMeters((err, data) => {
    if (err) {
      res.status(500).send({
        message: err.message || "Error retrieving pending meters.",
      });
    } else {
      res.send(data);
    }
  });
});

//
// 🟡 Create new tariff update entries for all meters of a tariff type
//
router.post("/create", auth, (req, res) => {
  const {
    tariff_id,
    system_tariff_rate,
    meter_tariff_rate,
    tariff_value,
    tariff_type,
    implementation_date_time,
    user,
    update_status,
    remarks,
  } = req.body;

  if (!tariff_id || !tariff_type) {
    res.status(400).send({ message: "Missing required fields: tariff_id and tariff_type." });
    return;
  }

  const data = new TariffUpdateStatus({
    tariff_id,
    system_tariff_rate,
    meter_tariff_rate,
    tariff_value,
    tariff_type,
    implementation_date_time,
    user,
    update_status,
    remarks,
  });

  TariffUpdateStatus.create(data, (err, result) => {
    if (err) {
      res.status(500).send({ message: err.message || "Error creating tariff update records." });
    } else {
      res.send(result);
    }
  });
});

//
// 🟢 Confirm update from meter
//
router.post("/confirmUpdate", auth, (req, res) => {
  const { meterDRN, tariff_id, update_status, remarks, meter_tariff_rate } = req.body;

  if (!meterDRN || !tariff_id || !update_status) {
    res.status(400).send({ message: "Missing required fields: meterDRN, tariff_id, and update_status." });
    return;
  }

  TariffUpdateStatus.confirmUpdate(
    meterDRN,
    tariff_id,
    update_status,
    remarks,
    meter_tariff_rate,
    (err, result) => {
      if (err) {
        if (err.kind === "not_found") {
          res.status(404).send({ message: `No record found for meter ${meterDRN} and tariff ${tariff_id}.` });
        } else {
          res.status(500).send({ message: "Error confirming update for meter " + meterDRN });
        }
      } else {
        res.send({ message: "Meter update confirmed successfully.", result });
      }
    }
  );
});

//
// 🕒 Update last attempt time
//
router.post("/updateLastAttempt", auth, (req, res) => {
  const { meterDRN, tariff_id } = req.body;

  if (!meterDRN || !tariff_id) {
    res.status(400).send({ message: "Missing required fields: meterDRN and tariff_id." });
    return;
  }

  TariffUpdateStatus.updateLastAttempt(meterDRN, tariff_id, (err, data) => {
    if (err) {
      res.status(500).send({ message: err.message || "Error updating last attempt." });
    } else {
      res.send({ message: "Last attempt time updated successfully.", data });
    }
  });
});

//
// 🟠 Update tariff value manually
//
router.post("/updateTariffValue", auth, (req, res) => {
  const { meterDRN, tariff_id, tariff_value, user } = req.body;

  if (!meterDRN || !tariff_id || tariff_value === undefined) {
    res.status(400).send({ message: "Missing required fields: meterDRN, tariff_id, and tariff_value." });
    return;
  }

  TariffUpdateStatus.updateTariffValue(meterDRN, tariff_id, tariff_value, user, (err, result) => {
    if (err) {
      res.status(500).send({ message: err.message || "Error updating tariff value." });
    } else {
      res.send({ message: "Tariff value updated successfully.", result });
    }
  });
});

//
// ❌ Delete all records
//
router.delete("/deleteAll", auth, (req, res) => {
  TariffUpdateStatus.deleteAll((err, data) => {
    if (err) {
      res.status(500).send({ message: err.message || "Error deleting tariff update records." });
    } else {
      res.send({ message: "All tariff update status records deleted successfully." });
    }
  });
});

//
// 🧪 Test route
//
router.get("/test", auth, (req, res) => {
  res.send({ message: "✅ Tariff update status route is working!" });
});

module.exports = router;
