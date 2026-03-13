/**
 * MQTT Routes — REST endpoints for sending MQTT commands to meters
 * and checking MQTT status.
 */
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../admin/authMiddllware');
const mqttHandler = require('../services/mqttHandler');

/**
 * POST /mqtt/command/:drn
 * Send a control command to a specific meter via MQTT
 * Body: { "mc": 1 } or { "tk": "token..." } etc.
 */
router.post('/mqtt/command/:drn', authenticateToken, (req, res) => {
  try {
    const drn = req.params.drn;
    const command = req.body;

    if (!command || Object.keys(command).length === 0) {
      return res.status(400).json({ error: 'Command body required' });
    }

    mqttHandler.publishCommand(drn, command);
    res.json({
      success: true,
      message: `Command sent to ${drn} via MQTT`,
      command,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /mqtt/status
 * Check MQTT connection status
 */
router.get('/mqtt/status', authenticateToken, (req, res) => {
  const client = mqttHandler.getClient();
  res.json({
    connected: client ? client.connected : false,
    broker: process.env.MQTT_BROKER || 'mqtt://localhost:1883',
  });
});

/**
 * POST /mqtt/test-publish
 * Publish a test message to verify MQTT pipeline
 */
router.post('/mqtt/test-publish', authenticateToken, (req, res) => {
  try {
    const client = mqttHandler.getClient();
    if (!client || !client.connected) {
      return res.status(503).json({ error: 'MQTT client not connected' });
    }
    const drn = req.body.drn || 'TEST-0001';
    const testData = [0.5, 230.1, 115.0, 12.3, 115.7, 25.0, 50.0, 0.99, Math.floor(Date.now()/1000)];
    client.publish(`gx/${drn}/power`, JSON.stringify(testData), { qos: 0 }, (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, message: `Test message published to gx/${drn}/power`, data: testData });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
