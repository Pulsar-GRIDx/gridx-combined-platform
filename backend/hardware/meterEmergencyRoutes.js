const express = require("express");
const EmergencyResponse = require("./models/meterEmergencyModel");
const auth = require("./middleware/hwAuth");
const router = express.Router();


// Get all emergency responses
router.get("/getAll", auth, (req, res) => {
  EmergencyResponse.getAll((err, data) => {
    if (err) {
      res.status(500).send({
        message: err.message || "Error retrieving emergency responses."
      });
    } else {
      res.send(data);
    }
  });
});

// Get single emergency response by ID
router.get("/getById/:id", auth, (req, res) => {
  EmergencyResponse.findById(req.params.id, (err, data) => {
    if (err) {
      if (err.kind === "not_found") {
        res.status(404).send({ message: `No emergency response found with ID ${req.params.id}` });
      } else {
        res.status(500).send({ message: `Error retrieving response with ID ${req.params.id}` });
      }
    } else {
      res.send(data);
    }
  });
});

router.post("/MeterLog/:id", (req, res) => {
  if (!req.body || typeof req.body.emergency_code === 'undefined') {
    return res.status(400).send({ message: "Missing emergency_code in body" });
  }

  const now = Math.floor(Date.now() / 1000);
  const data = {
    DRN: req.params.id,
    emergency_code: req.body.emergency_code,
    timestamp: now,
  };

  EmergencyResponse.create(data, (err, result) => {
    if (err) {
      console.error("Error creating record:", err);
      res.status(500).send({ message: "Some error occurred while creating the record." });
    } else {
      // if you want to return the latest status, you can call getLastForDRN too
      EmergencyResponse.getLastForDRN(req.params.id, (err, latest) => {
        if (err) {
          res.status(200).send(result); // fallback: just confirm creation
        } else {
          res.status(200).send(latest); // return latest log for DRN
        }
      });
    }
  });
});


// Get last response for a given DRN
router.get("/getLastForDRN/:drn", auth, (req, res) => {
  EmergencyResponse.getLastForDRN(req.params.drn, (err, data) => {
    if (err) {
      res.status(500).send({ message: err.message });
    } else if (!data) {
      res.status(404).send({ message: `No emergency response found for DRN ${req.params.drn}` });
    } else {
      res.send(data);
    }
  });
});

// Create new emergency response
router.post("/create", auth, (req, res) => {
  if (!req.body || req.body.emergency_code == null) {
    res.status(400).send({ message: "Invalid request body. Please include emergency_code and optionally DRN." });
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const emergencyResponse = new EmergencyResponse({
    DRN: req.body.DRN || null,
    emergency_code: req.body.emergency_code,
    timestamp: now
  });

  EmergencyResponse.create(emergencyResponse, (err, data) => {
    if (err) {
      res.status(500).send({ message: "Error saving emergency response." });
    } else {
      res.send(data);
    }
  });
});

// Delete emergency response by ID
router.delete("/delete/:id", auth, (req, res) => {
  EmergencyResponse.remove(req.params.id, (err, data) => {
    if (err) {
      if (err.kind === "not_found") {
        res.status(404).send({ message: `No emergency response found with ID ${req.params.id}` });
      } else {
        res.status(500).send({ message: `Could not delete emergency response with ID ${req.params.id}` });
      }
    } else {
      res.send({ message: "Emergency response deleted successfully." });
    }
  });
});

// Delete all emergency responses
router.delete("/deleteAll", auth, (req, res) => {
  EmergencyResponse.removeAll((err, data) => {
    if (err) {
      res.status(500).send({ message: err.message || "Error deleting all emergency responses." });
    } else {
      res.send({ message: "All emergency responses deleted successfully." });
    }
  });
});


module.exports = router;
