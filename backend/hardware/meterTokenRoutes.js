const express = require("express");
const connection = require("./service/hwDatabase.js");
const meter = require("./models/meterProfileModel");
const auth = require("./middleware/hwAuth");
const jwt = require("jsonwebtoken");
const router = express.Router();

// creating JWT token
router.post("/getAccessToken", (req, res) => {
  // Authenticate User
  const DRN = req.body.DRN;
  if (DRN === undefined || DRN === null) {
    res.status(500).send({
      message: "Error invalid request",
    });
  }
  const config = process.env;
  const api_key = config.METER_API_KEY;

  res.json({ accessToken: api_key });
});

// creating JWT token
router.post("/getAccessTokenWeb", (req, res) => {
  // Authenticate User
  const DRN = req.body.DRN;
  if (DRN === undefined || DRN === null) {
    res.status(500).send({
      message: "Error invalid request",
    });
  }


  meter.findByIdReal(DRN, (err, data) => {

    if (err) {
      if (err.kind === "not_found") {

        const initMeterProfile = {
          Surname: "None",
          Name: "None",
          Region: "None",
          City: "None",
          StreetName: "None",
          HouseNumber: "None",
          SIMNumber: "None",
          UserCategory: "None ",
        };


        const meterEnergy = new meter(DRN, initMeterProfile);

        meter.createReal(meterEnergy, (err, data) => {
          if (err) {
            res.status(500).send({
              message: err.message || "Some error occurred",  
            });
          }
        });
      }
    }

  });

  const user = { meterDRN: DRN };
  accessToken = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET);
  res.json({ accessToken: accessToken });
});

router.get("/testToken", auth, function (req, res, next) {
  res.json("token is uathentic");
});

module.exports = router;
