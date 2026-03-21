const express = require('express');
const path = require('path');
const router = express.Router();

// Serve the firmware metadata JSON file


router.get('/firmware-info.json', (req, res) => {
  const filePath = path.join(__dirname, './Data/fw_latest.json'); // Adjust path as necessary
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('Error serving firmware-info.json:', err);
      res.status(500).send('Error serving firmware metadata file');
    }
  });
});

// Serve the firmware binary file
router.get('/firmware.bin', (req, res) => {
  const filePath = path.join(__dirname, './Data/firmware.bin'); // Adjust path as necessary
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('Error serving firmware.bin:', err);
      res.status(500).send(err);
    }
  });
});

module.exports = router;
