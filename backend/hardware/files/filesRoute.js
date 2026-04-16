const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();
const { startMqttOta, getFirmwareInfo } = require('../../services/mqttHandler');
const { hydroHashHex } = require('../../services/hydroHash');

// Firmware data directory
const DATA_DIR = path.join(__dirname, 'Data');

// Multer config for firmware upload
const fwStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, DATA_DIR),
  filename: (req, file, cb) => cb(null, 'firmware.bin'),
});
const fwUpload = multer({
  storage: fwStorage,
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.bin')) cb(null, true);
    else cb(new Error('Only .bin firmware files are accepted'));
  },
});

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

// Get current firmware info
router.get('/ota/info', (req, res) => {
  const info = getFirmwareInfo();
  if (!info) {
    return res.status(500).json({ error: 'Failed to read firmware info' });
  }
  res.json(info);
});

// Trigger MQTT OTA for a specific device
// POST /files/ota/start { drn: "DRN_001", hash: "optional_override" }
router.post('/ota/start', (req, res) => {
  const { drn, hash } = req.body;
  if (!drn) {
    return res.status(400).json({ error: 'Missing drn parameter' });
  }

  try {
    const cmd = startMqttOta(drn, hash);
    res.json({ success: true, message: `MQTT OTA started for ${drn}`, command: cmd });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /files/ota/upload ─────────────────────────────────
// Upload firmware .bin, auto-compute libhydrogen hash, generate fw_latest.json
router.post('/ota/upload', fwUpload.single('firmware'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No firmware file provided' });
  }

  const { version } = req.body;
  if (!version) {
    return res.status(400).json({ error: 'Missing version parameter' });
  }

  try {
    // Read the uploaded firmware binary
    const fwPath = path.join(DATA_DIR, 'firmware.bin');
    const fwData = fs.readFileSync(fwPath);
    const fwSize = fwData.length;

    // Compute libhydrogen hash (Gimli-based, context "metering")
    const hash = hydroHashHex(fwData, 'metering');

    // Build firmware URL - prefer env var, then X-Forwarded-Host (behind nginx), then host header
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const baseUrl = process.env.FIRMWARE_BASE_URL || `${proto}://${host}`;
    const fwUrl = `${baseUrl}/files/firmware.bin`;

    // Generate fw_latest.json
    const info = { version, url: fwUrl, size: fwSize, hash };
    fs.writeFileSync(path.join(DATA_DIR, 'fw_latest.json'), JSON.stringify(info, null, 2));

    // Also save a versioned backup
    const backupName = `firmware_${version.replace(/\./g, '_')}.bin`;
    fs.copyFileSync(fwPath, path.join(DATA_DIR, backupName));

    console.log(`OTA Upload: v${version} (${fwSize} bytes) hash=${hash}`);

    res.json({
      success: true,
      message: `Firmware v${version} uploaded successfully`,
      firmware: info,
    });
  } catch (err) {
    console.error('OTA upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /files/ota/versions ────────────────────────────────
// List all firmware versions on disk
router.get('/ota/versions', (req, res) => {
  try {
    const files = fs.readdirSync(DATA_DIR)
      .filter(f => f.startsWith('firmware_') && f.endsWith('.bin'))
      .map(f => {
        const stat = fs.statSync(path.join(DATA_DIR, f));
        const ver = f.replace('firmware_', '').replace('.bin', '').replace(/_/g, '.');
        return { filename: f, version: ver, size: stat.size, date: stat.mtime };
      })
      .sort((a, b) => b.date - a.date);
    res.json({ versions: files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
