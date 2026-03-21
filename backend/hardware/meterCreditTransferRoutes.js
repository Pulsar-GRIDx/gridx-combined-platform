const express = require("express");
const meter = require("./models/meterCreditTransferModel.js");
const authMeter = require("./middleware/meterAuth.js");
const auth = require("./middleware/hwAuth");
const meterRequest = require("./middleware/updateMeterRequest.js");
const jwt = require("jsonwebtoken");
const router = express.Router();

router.get("/getAll", auth, async function (req, res, next) {
  const DRN = req.query.DRN;
  meter.getAll(DRN, (err, data) => {
    if (err)
      res.status(500).send({
        message:
          err.message || "Some errors occurred while retrieving meter data .",
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

router.post("/update", auth, async function (req, res) {
  // Validate request
  if (!req.body) {
    res.status(400).send("400");
  }
  // update meter power data

  const meterPower = new meter(req.DRN, req.body);
  // Save power data in the database
  meter.create(meterPower, (err, data) => {
    if (err) {
      res.status(500).send({
        message: err.message || "Some error occurred",
      });
    }
    else {
      meterRequest.checkUpdates(req.DRN, (err, data) => {
        if (err) {
          res.status(200).send("");
        } else {
          res.status(200).send(data);
        } 
      }); 
    }
  });
});

router.post("/MeterLog/:id", authMeter, async function (req, res) {
  // Validate request body
  if (!req.body || Object.keys(req.body).length === 0) {
    console.error("Request body is missing or empty.");
    return res.status(400).json({ error: "Request body is required." });
  }

  const meterPower = new meter(req.body);

  meter.create(meterPower, (err, data) => {
    if (err) {
      console.error("Error while saving meter data:", err);
      console.error("Data attempted:", meterPower);
      return res.status(500).json({ error: "Failed to save meter data", details: err.message });
    }

    if (!data) {
      console.warn("No data was returned after insert.");
      return res.status(200).json({ message: "Insert operation completed, but no data was returned." });
    }

    res.status(201).json(data);
  });
});


router.delete("/deleteByDRN", auth, async function (req, res, next) {
  meter.remove(req.DRN, (err, data) => {
    if (err) {
      if (err.kind === "not_found") {
        res.status(404).send({
          message: ` found energy values with id ${req.DRN}.`,
        });
      } else {
        res.status(500).send({
          message: "Could not delete energy, values with DRN " + req.params.id,
        });
      }
    } else res.send({ message: `energy values was deleted successfully!` });
  });
});

router.delete("/deleteAll", auth, function (req, res) {
  meter.removeAll((err, data) => {
    if (err)
      res.status(500).send({
        message:
          err.message || "Some error occurred while removing all power values.",
      });
    else res.send({ message: `All power values were deleted successfully!` });
  });
});

router.get("/test", auth, async function (req, res, next) {
  const DRN = req.DRN;
  res.send({ message: `authentication passed` });
});

router.get('/getByDRNAndDate/:year/:month/:day/:DRN', (req, res) => {
  // Extract the parameters from the request
  const year = req.params.year;
  const month = req.params.month;
  const day = req.params.day;
  const DRN = req.params.DRN;
  
  meter.getByDRNAndDate(year, month, day, DRN, (err, data) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.send(data);
    }
  });
});



module.exports = router;
