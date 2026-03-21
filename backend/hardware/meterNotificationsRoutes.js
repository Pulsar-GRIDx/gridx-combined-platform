const express = require("express");
const connection = require("./service/hwDatabase.js");
const meter = require("./models/meterNotificationModel");
const auth = require("./middleware/hwAuth");
const jwt = require("jsonwebtoken");
const router = express.Router();

router.get("/getAll", auth, async function (req, res, next) {
  const DRN ="";
  meter.getAll(DRN, (err, data) => {
    if (err)
      res.status(500).send({
        message:
          err.message || "Some errors occurred while retrieving meter data .",
      });
    else res.send({notification: [data]});

  });
});

router.get("/getMeterByDRN/:id", auth, function (req, res) {
  meter.findById(req.params.id, (err, data) => {
    if (err) {
      if (err.kind === "not_found") {
        res.status(404).send({
          message: `Not found meter with DRN ${req.params.DRN}.`,
        });
      } else {
        res.status(500).send({
          message: "Error retrieving meter with DRN " + req.params.DRN,
        });
      }
    } else res.send(data);
  });
});

router.post("/update", auth, function (req, res) {
  // Validate request
  if (!req.body) {
    res.status(400).send("400");
  }
  // update meter power data

  const meterEnergy = new meter(req.DRN, req.body);
  // Save power data in the database
  meter.create(meterEnergy, (err, data) => {
    if (err) {
      res.status(500).send({
        message: err.message || "Some error occurred",
      });
    }
    else res.status(204).send("204");
  });
});

router.delete("/deleteByDRN/:id", auth, async function (req, res, next) {
  meter.remove(req.params.id, (err, data) => {
    if (err) {
      if (err.kind === "not_found") {
        res.status(404).send({
          message: ` found notification values with id ` + req.params.id,
        });
      } else {
        res.status(500).send({
          message: "Could not delete notification, values with DRN " + req.params.id,
        });
      }
    } else res.send({ message: `notification values was deleted successfully!` });
  });
});

router.delete("/deleteAll", auth, function (req, res) {
  meter.removeAll((err, data) => {
    if (err)
      res.status(500).send({
        message:
          err.message || "Some error occurred while removing all notification values.",
      });
    else res.send({ message: `All notification values were deleted successfully!` });
  });
});

router.get("/test", auth, async function (req, res, next) {
  const DRN = req.DRN;
});

module.exports = router;
