const crypto = require('crypto');

// In-memory store for pending meter validations
// Key: DRN, Value: { token, status, createdAt, type }
const pendingValidations = {};

// Cleanup expired validations every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const drn in pendingValidations) {
    if (now - pendingValidations[drn].createdAt > 5 * 60 * 1000) {
      delete pendingValidations[drn];
    }
  }
}, 60000);

/**
 * App requests meter validation before registration or password recovery
 * POST /customer/request-meter-validation
 * Body: { DRN: "meter-number", type: "registration" | "password_recovery" }
 */
const requestValidation = (req, res) => {
  try {
    const { DRN, type } = req.body;

    if (!DRN) {
      return res.status(400).json({ error: 'DRN is required' });
    }

    if (!type || !['registration', 'password_recovery'].includes(type)) {
      return res.status(400).json({ error: 'type must be "registration" or "password_recovery"' });
    }

    const token = crypto.randomBytes(16).toString('hex');

    pendingValidations[DRN] = {
      token,
      status: 'pending',
      type,
      createdAt: Date.now()
    };

    console.log(`Meter validation requested for DRN: ${DRN}, type: ${type}`);

    res.status(200).json({
      message: 'Validation request created. Please press the validation button on your meter.',
      token,
      drn: DRN,
      expiresIn: 300 // 5 minutes
    });
  } catch (error) {
    console.error('Error requesting meter validation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * ESP32 meter confirms button press
 * POST /meter-validate/confirm
 * Body: { DRN: "meter-number" }
 * (Called by ESP32 firmware when user presses b7 on page 4)
 */
const confirmValidation = (req, res) => {
  try {
    const { DRN } = req.body;

    if (!DRN) {
      return res.status(400).json({ error: 'DRN is required' });
    }

    const pending = pendingValidations[DRN];

    if (!pending) {
      return res.status(404).json({
        error: 'No pending validation for this meter',
        drn: DRN
      });
    }

    // Check expiry (5 minutes)
    if (Date.now() - pending.createdAt > 5 * 60 * 1000) {
      delete pendingValidations[DRN];
      return res.status(410).json({ error: 'Validation request has expired' });
    }

    pending.status = 'confirmed';
    pending.confirmedAt = Date.now();

    console.log(`Meter validation confirmed for DRN: ${DRN}`);

    res.status(200).json({
      message: 'Meter validation confirmed',
      drn: DRN,
      status: 'confirmed'
    });
  } catch (error) {
    console.error('Error confirming meter validation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * App checks validation status (polling)
 * GET /customer/check-meter-validation/:drn
 */
const checkValidation = (req, res) => {
  try {
    const { drn } = req.params;

    if (!drn) {
      return res.status(400).json({ error: 'DRN is required' });
    }

    const pending = pendingValidations[drn];

    if (!pending) {
      return res.status(404).json({
        status: 'not_found',
        message: 'No validation request found for this meter'
      });
    }

    // Check expiry
    if (Date.now() - pending.createdAt > 5 * 60 * 1000) {
      delete pendingValidations[drn];
      return res.status(410).json({
        status: 'expired',
        message: 'Validation request has expired'
      });
    }

    res.status(200).json({
      status: pending.status,
      type: pending.type,
      drn: drn
    });

    // Clean up after confirmed validation is checked
    if (pending.status === 'confirmed') {
      // Keep it for 30 more seconds in case of retry
      setTimeout(() => {
        if (pendingValidations[drn] && pendingValidations[drn].status === 'confirmed') {
          delete pendingValidations[drn];
        }
      }, 30000);
    }
  } catch (error) {
    console.error('Error checking meter validation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  requestValidation,
  confirmValidation,
  checkValidation
};
