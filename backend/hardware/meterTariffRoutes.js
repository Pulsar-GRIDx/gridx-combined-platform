const express = require("express");
const meter = require("./models/meterTarrifModel");
const auth = require("./middleware/hwAuth");
const router = express.Router();

router.get("/getAll", auth, async function (req, res, next) {
  meter.getAll((err, data) => {
    if (err)
      res.status(500).send({
        message: err.message || "Some errors occurred while retrieving meter load control data.",
      });
    else res.send(data);
  });
});

router.get("/getMeterByDRN/:id", auth, function (req, res) {
  meter.findById(req.params.id, (err, data) => {
    if (err) {
      if (err.kind === "not_found") {
        res.status(404).send({
          message: `Not found meter with DRN ${req.params.id}.`,
        });
      } else {
        res.status(500).send({
          message: "Error retrieving meter with DRN " + req.params.id,
        });
      }
    } else res.send(data);
  });
});

router.get("/getLastUpdate/:id", auth, function (req, res) {
  meter.getLastUpdate(req.params.id, (err, data) => {
    if (err) {
      if (err.kind === "not_found") {
        res.status(404).send({
          message: `Not found meter with DRN ${req.params.id}.`,
        });
      } else {
        res.status(500).send({
          message: "Error retrieving meter with DRN " + req.params.id,
        });
      }
    } else res.send(data);
  });
});

router.get("/getLastTariff", auth, function (req, res) {
  meter.getLastUpdate( (err, data) => {
    if (err) {
      if (err.kind === "not_found") {
        res.status(404).send({
          message: `Not found meter with DRN .`,
        });
      } else {
        res.status(500).send({
          message: "Error retrieving meter with DRN " ,
        });
      }
    } else res.send(data);
  });
});


router.post("/updateSytemTariff", auth, async function (req, res) {
  // Validate request
  if (!req.body) {
    res.status(400).send("400");
  }

  const meterCell = new meter(req.params.id, req.body);
  // Save power data in the database
  meter.getAndUpdateAllDRN(meterCell, (err, data) => {
    if (err) {
      res.send({ err });
    } else {
      res.send({ data });
    }
  });
});

router.post("/update/:id", auth, async function (req, res) {
  // Validate request
  if (!req.body) {
    res.status(400).send("400");
  }

  const meterCell = new meter(req.params.id, req.body);
  // Save power data in the database
  meter.create(meterCell, (err, data) => {
    if (err) {
      res.send({ err });
    } else {
      res.send({ data });
    }
  });
});

router.delete("/deleteByDRN/:id", auth, async function (req, res, next) {
  meter.remove(req.params.id, (err, data) => {
    if (err) {
      if (err.kind === "not_found") {
        res.status(404).send({
          message: `Found power values with id ${req.params.id}.`,
        });
      } else {
        res.status(500).send({
          message: "Could not delete meter load control values with DRN " + req.params.id,
        });
      }
    } else
      res.send({
        message: `Meter load control values was deleted successfully!`,
      });
  });
});

router.delete("/deleteAll", auth, function (req, res) {
  meter.removeAll((err, data) => {
    if (err)
      res.status(500).send({
        message: err.message || "Some error occurred while removing all load control values.",
      });
    else
      res.send({
        message: `All meters load control values were deleted successfully!`,
      });
  });
});

router.get("/test", auth, async function (req, res, next) {
});

module.exports = router;
