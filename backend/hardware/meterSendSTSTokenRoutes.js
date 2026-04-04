const express = require("express");
const meter = require("./models/meterSendTokenModel");
const auth = require("./middleware/hwAuth");
const authMeter = require("./middleware/meterAuth");
const mqttHandler = require("../services/mqttHandler");
const router = express.Router();

router.get("/getAll", auth, async function (req, res, next) {
  const DRN = req.DRN;
  meter.getAll(DRN, (err, data) => {
    if (err)
      res.status(500).send({
        message:
          err.message ||
          "Some errors occurred while retrieving meter load control data .",
      });
    else res.send(data);
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


router.get("/getByDRNLastItem", auth, function (req, res) {
  meter.getLoadStatus(req.DRN, (err, data) => {
    if (err) {
      if (err.kind === "not_found") {
        res.status(404).send({
          message: `Not found meter with DRN ${req.params.DRN}.`,
        });
      } else {
        res.status(500).send({
          message: "Error retrieving meter with DRN " + req.DRN,
        });
      }
    } else res.send(data);
  });
});

router.post("/update/:id", auth, async function (req, res) {
  // Validate request
  if (!req.body) {
    return res.status(400).send("400");
  }

  const drn = req.params.id;
  const tokenId = req.body.token_ID;

  // Also send via MQTT for immediate delivery (don't wait for meter poll)
  if (tokenId) {
    try {
      mqttHandler.publishCommand(drn, { tk: tokenId }, 1);
      console.log(`[SendToken] MQTT token sent to ${drn}: ${tokenId}`);
    } catch (e) {
      console.error(`[SendToken] MQTT publish failed for ${drn}:`, e.message);
    }
  }

  const meterCell = new meter(drn, req.body);
  // Save to database (fallback for meter polling)
  meter.create(meterCell, (err, data) => {
    if (err) {
      res.send({err});
    } else {
      res.send({data});
    }
  });
});

router.post("/MeterLog/:id", async function (req, res) {
  // Validate request
  if (!req.body) {
    res.status(400).send("400");
  }


  const meterCell = new meter(req.params.id, req.body);
  // Save power data in the database
  meter.create(meterCell, (err, data) => {
    if (err) {
      res.send({err});
    }
      
    else {
      
      res.send({data});
    } 
  });
});

router.delete("/deleteByDRN/:id", auth, async function (req, res, next) {
  meter.remove(req.params.id, (err, data) => {
    if (err) {
      if (err.kind === "not_found") {
        res.status(404).send({
          message: ` found power values with id ${req.params.id}.`,
        });
      } else {
        res.status(500).send({
          message:
            "Could not delete meter load control  values with DRN " +
            req.params.id,
        });
      }
    } else
      res.send({
        message: `meter load control values was deleted successfully!`,
      });
  });
});

router.delete("/deleteAll", auth, function (req, res) {
  meter.removeAll((err, data) => {
    if (err)
      res.status(500).send({
        message:
          err.message ||
          "Some error occurred while removing all load control values.",
      });
    else
      res.send({
        message: `All meter load control values were deleted successfully!`,
      });
  });
});

router.get("/test", auth, async function (req, res, next) {
  const DRN = req.DRN;
});

module.exports = router;
