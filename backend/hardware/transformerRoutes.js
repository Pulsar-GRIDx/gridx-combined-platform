const express = require("express");
const meter = require("./models/transformerInformationModel");
const auth = require("./middleware/hwAuth");
const router = express.Router();


// Express.js route to create the table
router.post("/createTable", auth, function (req, res) {
  meter.createTable( (error, result) => {
    if (error) {
      console.error('Table creation failed:', error);
      res.status(500).send("Table creation failed.");
    } else {
      res.status(200).send("Table created successfully.");
    }
  });
});

router.get("/getAll", auth, async function (req, res, next) {
  const DRN ="";
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

router.post("/createByDRN/:id", auth, function (req, res) {
  // Validate request
  if (!req.body) {
    res.status(400).send("400");
  }

  const meterEnergy = new meter(req.params.id, req.body);

  meter.create(meterEnergy, (err, data) => {
    if (err) {
      res.status(500).send({
        message: err.message || "Some error occurred",
      });
    }
    else res.status(204).send("204");
  });
});

router.post("/createReal", auth, function (req, res) {
  // Validate request
  if (!req.body) {
    res.status(400).send("400");
  }
  // update meter power data

  const meterEnergy = new meter(req.DRN, req.body);
  // Save power data in the database
  meter.createReal(meterEnergy, (err, data) => {
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
          message: ` found meter profilewith id.` + req.params.id,
        });
      } else {
        res.status(500).send({
          message: "Could not meter values with DRN " + req.params.id,
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
          err.message || "Some error occurred while removing all meter.",
      });
    else res.send({ message: `All power values were deleted successfully!` });
  });
});

/******************************************* */


router.get("/getByDRNReal/:id", auth, function (req, res) {
  meter.findByIdReal(req.params.id, (err, data) => {
    if (err) {
      if (err.kind === "not_found") {
        res.status(404).send({
          message: `Not found meter with DRN .` + req.params.id,
        });
      } else {
        res.status(500).send({
          message: "Error retrieving meter with DRN " + req.params.id,
        });
      }
    } else res.send(data);
  });
});

router.get("/getAllReal", auth, async function (req, res, next) {
  const DRN ="";
  meter.getAllReal(DRN, (err, data) => {
    if (err)
      res.status(500).send({
        message:
          err.message || "Some errors occurred while retrieving meter data .",
      });
    else res.send(data);
  });
});

router.delete("/deleteByDRNReal/:id", auth, async function (req, res, next) {
  meter.removeReal(req.params.id, (err, data) => {
    if (err) {
      if (err.kind === "not_found") {
        res.status(404).send({
          message: ` Error deleting meter profile  with id .` + req.params.id,
        });
      } else {
        res.status(500).send({
          message: "Could not delete meter profile, values with DRN " + req.params.id,
        });
      }
    } else res.send({ message: `meter profile values was deleted successfully!` });
  });
});

router.delete("/deleteAllReal", auth, function (req, res) {
  meter.removeAllReal((err, data) => {
    if (err)
      res.status(500).send({
        message:
          err.message || "Some error occurred while removing all meter profile.",
      });
    else res.send({ message: `All meter profile were deleted successfully!` });
  });
});


router.post("/UpdateByDRN/:id", auth, function (req, res) {
  // Validate Request
  if (!req.body) {
    res.status(400).send({
      message: "Content can not be empty!"
    });
  }


  const meterEnergy = new meter(req.params.id, req.body);
  const DRN = req.params.id;

  meter.updateByDRN(DRN,meterEnergy,
    (err, data) => {
      if (err) {
        if (err.kind === "not_found") {
          res.status(404).send({
            message: `Not found meter with DRN ${req.params.id}.`
          });
        } else {
          res.status(500).send({
            message: "Error updating meter with DRN " + req.params.id
          });
        }
      } else res.send({
            message: "successfully updated meter with DRN " + DRN
          });
    }
  );
});





router.get("/test", auth, async function (req, res, next) {
  const DRN = req.DRN;
});

module.exports = router;
