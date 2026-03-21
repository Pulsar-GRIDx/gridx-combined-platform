const express = require("express");
const connection = require("./service/hwDatabase.js");
const meter = require("./models/meterEnergyModel");

const auth = require("./middleware/hwAuth");
const authMeter = require("./middleware/meterAuth");
const meterRequest = require("./middleware/updateMeterRequest");
const jwt = require("jsonwebtoken");
const router = express.Router();



// Define a POST route to add random sample data
router.post('/addRandomSampleData', async (req, res) => {
  // Define an array of DRNs for which you want to add random sample data
  const drns = [
    '0260152877924',
    '0260111222333',
    '0260998877665',
    '0260777334664',
    '0260555111789',
    '0260333666699',
    '0260444555111',
    '0260666000777',
    '0260111992233',
    '0260555333888',
    '0260123456789',
    '0260999888776',
    '0260777766554',
    '0260555444332',
    '0260333222110',
    '0260444666888',
  ];

  // Function to generate random sample data
  function generateRandomSampleData() {
    return [
      Math.random() * 500,      // Random active_energy (between 0 and 100)
      Math.random() * 500,       // Random reactive_energy (between 0 and 10)
      Math.random() * 1000,     // Random units (between 0 and 1000)
      Math.random() < 0.5 ? 0 : 1,      // Random tamper_state (between 0 and 500)
      Math.random() * 1500,     // tamp_time (between 0 and 1500)
      Math.random() * 100,       // Random Temperature (between 0 and 100)
      Math.floor(Math.random() * 1000000000), // Random Record Time (up to 1 billion)
    ];
  }

  // Function to add random sample data for each DRN
  function addRandomSampleData() {
    for (let i = 0; i < drns.length; i++) {
      const drn = drns[i];
      const randomBinaryState = Math.random() < 0.5 ? 0 : 1; // Random binary state (0 or 1)
      const data = generateRandomSampleData();

      const newPowerValue = new meter(drn, data);

      // Insert the random sample data into the database
      meter.create(newPowerValue, (err, result) => {
        if (err) {
          console.error(`Error adding data for DRN ${drn}: ${err.message}`);
        } else {
        }
      });
    }
  }

  // Call the function to add random sample data
  addRandomSampleData();

  res.status(200).json({ message: 'Random sample data added to the database.' });
});

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
  // Validate request
  if (!req.body) {
    res.status(400).send("400");
  }
  // update meter power data

  const meterPower = new meter(req.params.id, req.body);
  // Save power data in the database
  meter.create(meterPower, (err, data) => {
    if (err) {
      res.status(500).send({
        message: err.message || "Some error occurred",
      });
    }
    else {
      meterRequest.checkUpdates(req.params.id, (err, data) => {
        if (err) {
          res.status(200).send("");
        } else {
          res.status(200).send(data);
        } 
      }); 
    }
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

router.get("/getLastUpdate/:id", auth, function (req, res) {
  meter.getLastUpdate(req.params.id, (err, data) => {
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



module.exports = router;
