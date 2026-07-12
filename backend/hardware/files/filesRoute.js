const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();
const { startMqttOta, getFirmwareInfo } = require('../../services/mqttHandler');
const { hydroHashHex } = require('../../services/hydroHash');

// Firmware data directory
const DATA_DIR = path.join(__dirname, 'Data');

// ─── OTA upload authentication ───
// This route was reachable with NO authentication and NO firmware
// signature check — anyone who could reach this server could push
// arbitrary "firmware" that immediately became what every meter in the
// fleet downloads. Requires the same OTA_API_KEY bearer token already
// used by the sibling backend/routes/otaRoutes.js upload endpoint, so a
// single key covers both.
function otaUploadAuth(req, res, next) {
  const apiKey = process.env.OTA_API_KEY;
  if (!apiKey) {
    console.warn('[SECURITY] OTA_API_KEY not set — /files/ota/upload is disabled until it is configured');
    return res.status(503).json({ error: 'OTA uploads not configured' });
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization' });
  }
  if (authHeader.split(' ')[1] !== apiKey) {
    return res.status(403).json({ error: 'Invalid API key' });
  }
  next();
}

// ─── GRIDx firmware signature verification ───
// Matches gridx-ota-portal's check — rejects any .bin that doesn't embed
// a GRIDX_FW_SIG:MFR=260:VER=x.x.x marker, so a valid API key alone isn't
// enough to push non-GridX binaries to the fleet.
const GRIDX_SIG_MARKER = 'GRIDX_FW_SIG:';
const GRIDX_MFR_CODE = 260;
function verifyGRIDxSignature(fwData) {
  const sigBuf = Buffer.from(GRIDX_SIG_MARKER, 'ascii');
  let sigOffset = -1;
  for (let i = 0; i < fwData.length - sigBuf.length; i++) {
    if (fwData.compare(sigBuf, 0, sigBuf.length, i, i + sigBuf.length) === 0) {
      sigOffset = i;
      break;
    }
  }
  if (sigOffset === -1) {
    return { valid: false, error: 'No GRIDx firmware signature found in binary' };
  }
  let endOffset = sigOffset;
  while (endOffset < fwData.length && fwData[endOffset] !== 0 && (endOffset - sigOffset) < 128) {
    endOffset++;
  }
  const sigString = fwData.toString('ascii', sigOffset, endOffset);
  const mfrMatch = sigString.match(/MFR=(\d+)/);
  const verMatch = sigString.match(/VER=([\d.]+)/);
  if (!mfrMatch) {
    return { valid: false, error: 'GRIDx signature found but missing manufacturer code' };
  }
  const mfrCode = parseInt(mfrMatch[1]);
  if (mfrCode !== GRIDX_MFR_CODE) {
    return { valid: false, error: `Invalid manufacturer code: ${mfrCode} (expected ${GRIDX_MFR_CODE})` };
  }
  return { valid: true, mfr: mfrCode, version: verMatch ? verMatch[1] : 'unknown' };
}

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

// ─── GET /files/firmware-info.json ───────────────────────────
// This is what the GRIDx Maintenance Android app polls (Configurations.java,
// FIRMWARE_INFO_URL) to decide "is there an update available for the meter
// I'm connected to". It was pointing at Data/fw_latest.json — the exact
// same file the ESP32 fleet's own automatic 3-hour MQTT/HTTP update check
// reads — meaning the app and the fleet were, despite the differently-named
// files gridx-ota-portal actually writes on every upload/rollback
// (fw_latest.json for the fleet, firmware-info.json for the app — see that
// repo's server.js upload handler comment), collapsed onto a single shared
// "latest" pointer at the serving layer. That's why a deliberate,
// fleet-safety-motivated rollback of fw_latest.json (done to keep an
// incompatible-partition-table test build off the general fleet) also
// silently blocked the Android app from ever seeing that build, with no
// way to decouple the two without editing files directly on the server.
// Fixed by actually serving the file gridx-ota-portal already writes for
// this exact purpose.
router.get('/firmware-info.json', (req, res) => {
  const filePath = path.join(__dirname, './Data/firmware-info.json');
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

// ─── GET /files/firmware/:filename ────────────────────────────
// Serves a specific historical/versioned firmware backup (e.g.
// firmware_0_63_1.bin) by exact filename — for deliberately pointing the
// Android app (via firmware-info.json's url field) at a version other than
// whatever's currently the fleet-wide "latest", without ever touching
// firmware.bin/fw_latest.json. Filename strictly pattern-matched (no path
// traversal possible) and restricted to the same backup-naming convention
// gridx-ota-portal already uses for every upload.
router.get('/firmware/:filename', (req, res) => {
  const filename = req.params.filename;
  if (!/^firmware_\d+(_\d+)*\.bin$/.test(filename)) {
    return res.status(400).json({ error: 'Invalid firmware filename' });
  }
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: `${filename} not found` });
  }
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error(`Error serving ${filename}:`, err);
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
router.post('/ota/upload', otaUploadAuth, fwUpload.single('firmware'), (req, res) => {
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

    const sigCheck = verifyGRIDxSignature(fwData);
    if (!sigCheck.valid) {
      fs.unlinkSync(fwPath);
      console.error(`[OTA] Upload rejected: ${sigCheck.error}`);
      return res.status(400).json({ error: `Firmware rejected: ${sigCheck.error}` });
    }

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
