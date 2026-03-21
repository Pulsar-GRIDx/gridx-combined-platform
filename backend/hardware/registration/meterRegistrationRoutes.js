const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const connection = require("../service/hwDatabase.js");
const MeterRegistration = require("../models/registration/meterRegistrationModel");
const MeterSession = require("../models/registration/meterSessionModel");
const MeterCapability = require("../models/registration/meterCapabilityModel");
const SecurityLog = require("../models/registration/securityLogModel");
const auth = require("../middleware/hwAuth");
const router = express.Router();
const fs = require('fs'); // Add this for file reading if using file paths

// ==================== KEY CONFIGURATION ====================

// Load server's public key - from environment variable
const SERVER_PUBLIC_KEY = process.env.SERVER_PUBLIC_KEY;

// Load server's private key - from environment variable
const SERVER_PRIVATE_KEY = process.env.SERVER_PRIVATE_KEY;

// Alternative: Load from file paths if using that method
// const SERVER_PUBLIC_KEY_PATH = process.env.SERVER_PUBLIC_KEY_PATH;
// const SERVER_PRIVATE_KEY_PATH = process.env.SERVER_PRIVATE_KEY_PATH;

// Load keys from files if paths are provided (alternative method)
let SERVER_PUBLIC_KEY_FROM_FILE = null;
let SERVER_PRIVATE_KEY_FROM_FILE = null;

// Uncomment this block if you're using the file path method instead
/*
if (process.env.SERVER_PUBLIC_KEY_PATH) {
  try {
    SERVER_PUBLIC_KEY_FROM_FILE = fs.readFileSync(process.env.SERVER_PUBLIC_KEY_PATH, 'utf8');
  } catch (error) {
    console.error("❌ Failed to load public key from file:", error.message);
  }
}

if (process.env.SERVER_PRIVATE_KEY_PATH) {
  try {
    SERVER_PRIVATE_KEY_FROM_FILE = fs.readFileSync(process.env.SERVER_PRIVATE_KEY_PATH, 'utf8');
  } catch (error) {
    console.error("❌ Failed to load private key from file:", error.message);
  }
}

// Use file-based keys if available, otherwise use env var keys
const ACTIVE_PUBLIC_KEY = SERVER_PUBLIC_KEY_FROM_FILE || SERVER_PUBLIC_KEY;
const ACTIVE_PRIVATE_KEY = SERVER_PRIVATE_KEY_FROM_FILE || SERVER_PRIVATE_KEY;
*/

// For now, using direct env var keys (since you added them to .env)
const ACTIVE_PUBLIC_KEY = SERVER_PUBLIC_KEY;
const ACTIVE_PRIVATE_KEY = SERVER_PRIVATE_KEY;

// Validate that keys are loaded
if (!ACTIVE_PUBLIC_KEY) {
  console.error("⚠️  WARNING: SERVER_PUBLIC_KEY environment variable is not set!");
  console.error("⚠️  Public key verification may fail!");
} else {
  // Log first few chars for debugging (remove in production)
}

if (!ACTIVE_PRIVATE_KEY) {
  console.error("❌ CRITICAL: SERVER_PRIVATE_KEY environment variable is not set!");
  console.error("❌ Server cannot create signatures!");
  // In production, you might want to exit the process
  // process.exit(1);
} else {
  // Log first few chars for debugging (remove in production)
}

// ==================== REST OF YOUR CODE ====================

// Configuration for timestamp validation
const TIMESTAMP_VALIDATION = {
  STRICT_WINDOW: 300,        // 5 minutes for devices with correct time
  FLEXIBLE_WINDOW: 86400,     // 24 hours for devices with timezone issues
  LOG_LARGE_DRIFT: true,      // Log when drift exceeds strict window
  AUTO_CORRECT_TIMEZONE: true // Attempt to detect and handle timezone issues
};

// Helper function to generate API key
const generateApiKey = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Helper function to hash API key
const hashApiKey = async (apiKey) => {
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(apiKey, salt);
  return { salt, hash };
};

// Helper function to verify API key
const verifyApiKey = async (apiKey, storedHash) => {
  return await bcrypt.compare(apiKey, storedHash);
};

// Helper function to generate session key (32 bytes base64 encoded)
const generateSessionKey = () => {
  return crypto.randomBytes(32).toString('base64');
};

// Helper function to generate session ID
const generateSessionId = () => {
  return crypto.randomBytes(32).toString('hex');
};

// FIXED: Helper function to normalize public key to SPKI format
const normalizePublicKey = (publicKeyPem) => {
  if (!publicKeyPem) return null;
  
  // If it's already in correct SPKI format, return as is
  if (publicKeyPem.includes('BEGIN PUBLIC KEY') && publicKeyPem.includes('END PUBLIC KEY')) {
    return publicKeyPem;
  }
  
  // Extract the base64 content (remove any headers and whitespace)
  let base64Key = publicKeyPem;
  
  // Remove PKCS#1 headers if present
  if (publicKeyPem.includes('BEGIN RSA PUBLIC KEY')) {
    base64Key = publicKeyPem
      .replace('-----BEGIN RSA PUBLIC KEY-----', '')
      .replace('-----END RSA PUBLIC KEY-----', '')
      .replace(/\s/g, '');
  } 
  // Remove any other headers
  else if (publicKeyPem.includes('BEGIN')) {
    const match = publicKeyPem.match(/-----BEGIN[^-]+-----\n?([A-Za-z0-9+/=\s]+)\n?-----END[^-]+-----/);
    if (match && match[1]) {
      base64Key = match[1].replace(/\s/g, '');
    }
  }
  
  // Clean up any remaining whitespace
  base64Key = base64Key.replace(/\s/g, '');
  
  // Wrap in proper SPKI format
  // Split into lines of 64 characters for proper PEM formatting
  const lines = [];
  for (let i = 0; i < base64Key.length; i += 64) {
    lines.push(base64Key.substring(i, i + 64));
  }
  
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`;
};

// FIXED: Proper RSA signature verification with format handling
const verifySignature = (publicKeyPem, data, signatureBase64) => {
  try {
    // If no public key provided, skip verification (for testing/development)
    if (!publicKeyPem) {
      return true;
    }

    // Normalize the public key to SPKI format
    const normalizedKey = normalizePublicKey(publicKeyPem);
    
    if (!normalizedKey) {
      console.error("[ERROR] Failed to normalize public key");
      return false;
    }

    // Log key format for debugging (first 100 chars)

    // Create verifier with SHA256
    const verifier = crypto.createVerify('SHA256');
    verifier.update(data);
    verifier.end();

    // Verify the signature using the normalized public key
    const isValid = verifier.verify(normalizedKey, signatureBase64, 'base64');
    
    if (!isValid) {
    } else {
    }
    
    return isValid;
  } catch (error) {
    console.error("Signature verification error:", error);
    return false;
  }
};

// FIXED: Proper RSA signature creation using server's private key
const createSignature = (data) => {
  try {
    // If no private key available (development), use simulated signature
    if (!ACTIVE_PRIVATE_KEY) {
      console.error("❌ CRITICAL: No private key available for signing!");
      console.error("❌ Please set SERVER_PRIVATE_KEY environment variable");
      throw new Error("Server private key not configured");
    }

    // Create signer with SHA256
    const signer = crypto.createSign('SHA256');
    signer.update(data);
    signer.end();

    // Sign with server's private key from environment variable
    const signature = signer.sign(ACTIVE_PRIVATE_KEY, 'base64');
    
    return signature;
  } catch (error) {
    console.error("❌ Signature creation error:", error);
    console.error("Please check that SERVER_PRIVATE_KEY environment variable is set correctly");
    // In production, you should NOT have a fallback - throw error instead
    throw new Error("Failed to create signature - server misconfiguration");
  }
};

// Helper function to log security events
const logSecurityEvent = (meterId, DRN, eventType, details, ipAddress) => {
  let detailsStr = '{}';
  if (details) {
    try {
      detailsStr = JSON.stringify(details);
    } catch (e) {
      console.error("Failed to stringify details:", e);
      detailsStr = JSON.stringify({ error: "Failed to stringify", original: String(details) });
    }
  }
  
  const logData = {
    meter_id: meterId,
    DRN: DRN,
    event_type: eventType,
    details: detailsStr,
    ip_address: ipAddress
  };
  
  SecurityLog.create(logData, (err) => {
    if (err) console.error("Failed to log security event:", err);
  });
};

// Helper function to validate timestamp with flexible window
const validateTimestamp = (timestamp, maxDriftSeconds = TIMESTAMP_VALIDATION.FLEXIBLE_WINDOW) => {
  const now = Math.floor(Date.now() / 1000);
  const timestampNum = parseInt(timestamp);
  
  if (isNaN(timestampNum)) return false;
  
  // Calculate absolute difference
  const diff = Math.abs(now - timestampNum);
  
  // Check if within allowed window
  if (diff > maxDriftSeconds) {
    return false;
  }
  
  return true;
};

// Helper function to detect if timestamp issue is likely timezone related
const isTimezoneIssue = (timestamp) => {
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.abs(now - timestamp);
  const hoursDiff = diff / 3600;
  
  // Check if the difference is close to a whole number of hours
  // (suggesting it's just a timezone issue)
  return Math.abs(hoursDiff - Math.round(hoursDiff)) < 0.1;
};

// Helper function to convert and store public key in correct format
const processAndStorePublicKey = (publicKey) => {
  if (!publicKey) return null;
  
  // Normalize to SPKI format before storing
  const normalizedKey = normalizePublicKey(publicKey);
  
  // You could also validate that it's a proper RSA public key here
  try {
    crypto.createPublicKey(normalizedKey);
    return normalizedKey;
  } catch (error) {
    console.error("[ERROR] Invalid public key format:", error);
    return null;
  }
};

// ==================== SECURE REGISTRATION ENDPOINT ====================

// Secure meter registration (matches meter_registration.cpp expectations)
router.post("/secure-register", async function (req, res) {
  try {
    const { 
      request,  // Signed request string
      signature // Base64 encoded signature
    } = req.body;

    if (!request || !signature) {
      return res.status(400).json({ 
        error: "Request and signature are required" 
      });
    }

    // Parse the signed request
    let requestData;
    try {
      requestData = JSON.parse(request);
    } catch (e) {
      return res.status(400).json({ error: "Invalid request format" });
    }

    const { 
      drn, 
      nonce, 
      timestamp, 
      model,
      firmwareVersion,
      imei,
      publicKey,
      capabilities 
    } = requestData;

    // Validate required fields
    if (!drn) {
      return res.status(400).json({ error: "DRN is required" });
    }

    // FLEXIBLE TIMESTAMP VALIDATION
    if (timestamp) {
      const now = Math.floor(Date.now() / 1000);
      const timeDiff = Math.abs(now - timestamp);
      
      // Check if within flexible window (24 hours)
      if (timeDiff > TIMESTAMP_VALIDATION.FLEXIBLE_WINDOW) {
        logSecurityEvent(null, drn, "TIMESTAMP_OUT_OF_RANGE", 
          { 
            timestamp, 
            server_time: now, 
            drift: timeDiff,
            max_allowed: TIMESTAMP_VALIDATION.FLEXIBLE_WINDOW 
          }, 
          req.ip
        );
        
        return res.status(400).json({ 
          error: "Timestamp out of acceptable range",
          details: {
            received_timestamp: timestamp,
            server_time_utc: now,
            drift_seconds: timeDiff,
            max_allowed_drift_seconds: TIMESTAMP_VALIDATION.FLEXIBLE_WINDOW,
            note: "Please ensure your device time is within 24 hours of UTC"
          }
        });
      }
      
      // If within flexible window but outside strict window, log it for monitoring
      if (TIMESTAMP_VALIDATION.LOG_LARGE_DRIFT && timeDiff > TIMESTAMP_VALIDATION.STRICT_WINDOW) {
        const timezoneIssue = isTimezoneIssue(timestamp);
        
        logSecurityEvent(null, drn, "TIMESTAMP_LARGE_DRIFT", 
          { 
            timestamp, 
            server_time: now, 
            drift: timeDiff,
            possible_timezone_issue: timezoneIssue,
            hours_drift: (timeDiff / 3600).toFixed(2)
          }, 
          req.ip
        );
        
        if (timezoneIssue) {
        }
      }
    }

    // Check if meter already exists
    MeterRegistration.findByDRN(drn, async (err, existingMeter) => {
      if (err && err.kind !== "not_found") {
        console.error("Database error:", err);
        return res.status(500).json({ error: "Database error" });
      }

      let meterId;
      let meterStatus;
      let accessToken = undefined; // Will be set only for new meters
      let processedPublicKey = null;

      if (existingMeter) {
        // Meter exists - check status
        if (existingMeter.status !== 'active') {
          logSecurityEvent(existingMeter.id, drn, "INACTIVE_METER_ATTEMPT", 
            { status: existingMeter.status }, req.ip);
          return res.status(403).json({ error: "Meter is not active", status: existingMeter.status });
        }

        // Check if locked
        if (existingMeter.locked_until && new Date(existingMeter.locked_until) > new Date()) {
          return res.status(403).json({ error: "Meter is temporarily locked" });
        }

        // Verify signature using stored public key
        if (existingMeter.public_key) {
          const isValidSignature = verifySignature(existingMeter.public_key, request, signature);
          if (!isValidSignature) {
            logSecurityEvent(existingMeter.id, drn, "INVALID_SIGNATURE", { reason: "Signature verification failed" }, req.ip);
            return res.status(401).json({ error: "Invalid signature" });
          }
        } else if (publicKey) {
          // If no stored key but key provided in request, verify and store it
          const isValidSignature = verifySignature(publicKey, request, signature);
          if (!isValidSignature) {
            logSecurityEvent(existingMeter.id, drn, "INVALID_SIGNATURE", { reason: "Signature verification failed with provided key" }, req.ip);
            return res.status(401).json({ error: "Invalid signature" });
          }
          // Process and store the public key
          processedPublicKey = processAndStorePublicKey(publicKey);
        } else {
          // For development only - remove in production!
        }

        meterId = existingMeter.id;
        meterStatus = existingMeter.status;

        // Update existing meter
        const updateData = {
          last_seen: new Date(),
          last_ip_address: req.ip,
          firmware_version: firmwareVersion || existingMeter.firmware_version
        };

        // Update public key if we have a new one
        if (processedPublicKey) {
          updateData.public_key = processedPublicKey;
        } else if (publicKey && !existingMeter.public_key) {
          // Store the provided key if none existed
          updateData.public_key = processAndStorePublicKey(publicKey);
        }

        MeterRegistration.updateByDRN(drn, updateData, (err) => {
          if (err) console.error("Failed to update meter:", err);
        });

        // Deactivate old sessions
        MeterSession.deactivateAllForMeter(existingMeter.id, (err) => {
          if (err) console.error("Failed to deactivate old sessions:", err);
        });

      } else {
        // New meter registration - process public key first
        if (publicKey) {
          processedPublicKey = processAndStorePublicKey(publicKey);
          
          // Verify signature with the processed key
          const isValidSignature = verifySignature(processedPublicKey || publicKey, request, signature);
          if (!isValidSignature) {
            logSecurityEvent(null, drn, "INVALID_SIGNATURE", { reason: "New meter signature invalid" }, req.ip);
            return res.status(401).json({ error: "Invalid signature" });
          }
        } else {
        }

        // Generate API key for new meter
        const apiKey = generateApiKey();
        const { salt, hash } = await hashApiKey(apiKey);
        accessToken = apiKey; // Store for response

        const registrationData = {
          DRN: drn,
          api_key_hash: hash,
          api_key_salt: salt,
          public_key: processedPublicKey || publicKey,
          model: model || 'ESP32-SMART-METER-SECURE',
          firmware_version: firmwareVersion || '2.0.0',
          imei: imei,
          security_level: (processedPublicKey || publicKey) ? 'certificate' : 'basic',
          status: 'active',
          last_seen: new Date(),
          last_ip_address: req.ip,
          registered_at: new Date()
        };

        // Create meter registration
        const createResult = await new Promise((resolve, reject) => {
          MeterRegistration.create(registrationData, (err, result) => {
            if (err) reject(err);
            else resolve(result);
          });
        });

        meterId = createResult.id;
        meterStatus = 'active';

        logSecurityEvent(meterId, drn, "METER_REGISTERED", { method: "secure" }, req.ip);
      }

      // Store capabilities if provided
      if (capabilities && meterId) {
        const capabilityData = {
          relay_control: capabilities.relayControl ? 1 : 0,
          geyser_control: capabilities.geyserControl ? 1 : 0,
          anti_tamper: capabilities.antiTamper ? 1 : 0,
          ble_support: capabilities.bleSupport ? 1 : 0,
          secure_communication: capabilities.secureCommunication ? 1 : 0,
          encrypted_telemetry: capabilities.encryptedTelemetry ? 1 : 0,
          mutual_auth: capabilities.mutualAuth ? 1 : 0,
          aes256: capabilities.aes256 ? 1 : 0,
          rsa2048: capabilities.rsa2048 ? 1 : 0
        };
        
        MeterCapability.upsert(meterId, capabilityData, (err) => {
          if (err) console.error("Failed to store capabilities:", err);
          else      logSecurityEvent(meterId, drn, "CAPABILITIES_UPDATED", capabilityData, req.ip);
        });
      }

      // Generate session
      const sessionKey = generateSessionKey(); // Base64 encoded 32-byte key
      const sessionId = generateSessionId();
      const expiresAt = new Date(Date.now() + 3600000); // 1 hour

      const sessionData = {
        meter_id: meterId,
        session_id: sessionId,
        session_key: sessionKey,
        issued_at: new Date(),
        expires_at: expiresAt,
        ip_address: req.ip,
        user_agent: req.get('User-Agent'),
        is_active: 1
      };

      await new Promise((resolve, reject) => {
        MeterSession.create(sessionData, (err) => {
          if (err) reject(err);
          else {
            resolve();
          }
        });
      });

      // Prepare response data
      const responseData = {
        sessionKey: sessionKey,
        sessionExpiry: 3600000, // 1 hour in milliseconds
        meterId: meterId,
        DRN: drn,
        status: meterStatus
      };

      // Only add accessToken for new meters
      if (accessToken) {
        responseData.accessToken = accessToken;
      }

      // Create signed response (wrap in data field with signature)
      const responseString = JSON.stringify(responseData);
      const responseSignature = createSignature(responseString);

      res.json({
        data: responseString,
        signature: responseSignature
      });

    });

  } catch (error) {
    console.error("❌ Registration error:", error);
    logSecurityEvent(null, req.body?.drn, "REGISTRATION_ERROR", { error: error.message }, req.ip);
    res.status(500).json({ error: "Registration failed" });
  }
});

// ==================== EXISTING ENDPOINTS ====================

// Get meter info (authenticated)
router.get("/me", auth, async function (req, res) {
  const DRN = req.DRN;

  MeterRegistration.findByDRN(DRN, (err, meter) => {
    if (err) {
      if (err.kind === "not_found") {
        return res.status(404).json({ error: "Meter not found" });
      }
      return res.status(500).json({ error: "Database error" });
    }

    // Get capabilities
    MeterCapability.findByMeterDRN(DRN, (err, capabilities) => {
      // Get active session
      MeterSession.findByMeterDRN(DRN, (err, sessions) => {
        const meterInfo = {
          DRN: meter.DRN,
          model: meter.model,
          firmware_version: meter.firmware_version,
          security_level: meter.security_level,
          status: meter.status,
          registered_at: meter.registered_at,
          last_seen: meter.last_seen,
          last_ip_address: meter.last_ip_address,
          capabilities: capabilities || {},
          active_sessions: sessions || []
        };

        // Remove sensitive data
        delete meterInfo.api_key_hash;
        delete meterInfo.api_key_salt;
        
        res.json(meterInfo);
      });
    });
  });
});

// Update firmware version
router.post("/firmware", auth, async function (req, res) {
  const DRN = req.DRN;
  const { version } = req.body;

  if (!version) {
    return res.status(400).json({ error: "Version is required" });
  }

  MeterRegistration.findByDRN(DRN, (err, meter) => {
    if (err) {
      if (err.kind === "not_found") {
        return res.status(404).json({ error: "Meter not found" });
      }
      return res.status(500).json({ error: "Database error" });
    }

    MeterRegistration.updateByDRN(DRN, { firmware_version: version }, (err) => {
      if (err) {
        console.error("Firmware update error:", err);
        return res.status(500).json({ error: "Failed to update firmware" });
      }

      logSecurityEvent(meter.id, DRN, "FIRMWARE_UPDATED", { version }, req.ip);
      res.json({ message: "Firmware version updated", version: version });
    });
  });
});

// Update last seen
router.post("/ping", auth, async function (req, res) {
  const DRN = req.DRN;

  MeterRegistration.updateLastSeen(DRN, req.ip, (err) => {
    if (err) {
      return res.status(500).json({ error: "Failed to update last seen" });
    }
    res.json({ message: "Ping received", timestamp: new Date() });
  });
});

// ==================== SESSION ENDPOINTS ====================

// Validate session
router.post("/validate-session", auth, async function (req, res) {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: "Session ID required" });
  }

  MeterSession.findBySessionId(sessionId, (err, session) => {
    if (err || !session) {
      return res.status(401).json({ valid: false, error: "Invalid or expired session" });
    }

    // Update last activity
    MeterSession.updateActivity(sessionId, () => {});

    res.json({
      valid: true,
      expires_at: session.expires_at,
      meter_DRN: session.DRN
    });
  });
});

// End session (logout)
router.post("/end-session", auth, async function (req, res) {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: "Session ID required" });
  }

  MeterSession.deactivate(sessionId, (err) => {
    if (err) {
      return res.status(500).json({ error: "Failed to end session" });
    }
    res.json({ message: "Session ended successfully" });
  });
});

// ==================== ADMIN ENDPOINTS ====================

// Get all meters (admin only)
router.get("/admin/all", auth, async function (req, res) {
  MeterRegistration.getAll((err, data) => {
    if (err) {
      return res.status(500).json({ error: "Failed to retrieve meters" });
    }
    res.json(data);
  });
});

// Get meter by DRN (admin only)
router.get("/admin/:DRN", auth, async function (req, res) {
  const DRN = req.params.DRN;

  MeterRegistration.findByDRN(DRN, (err, meter) => {
    if (err) {
      if (err.kind === "not_found") {
        return res.status(404).json({ error: "Meter not found" });
      }
      return res.status(500).json({ error: "Database error" });
    }

    // Get capabilities
    MeterCapability.findByMeterId(meter.id, (err, capabilities) => {
      // Get sessions
      MeterSession.findByMeterDRN(DRN, (err, sessions) => {
        // Get recent security logs
        SecurityLog.getByMeterDRN(DRN, 50, (err, logs) => {
          const meterDetails = {
            ...meter,
            capabilities: capabilities || {},
            active_sessions: sessions || [],
            recent_logs: logs || []
          };

          // Remove sensitive data
          delete meterDetails.api_key_hash;
          delete meterDetails.api_key_salt;

          res.json(meterDetails);
        });
      });
    });
  });
});

// Update meter status (admin only)
router.put("/admin/:DRN/status", auth, async function (req, res) {
  const DRN = req.params.DRN;
  const { status } = req.body;

  const validStatuses = ['active', 'pending', 'suspended', 'compromised', 'revoked'];
  
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  MeterRegistration.findByDRN(DRN, (err, meter) => {
    if (err) {
      if (err.kind === "not_found") {
        return res.status(404).json({ error: "Meter not found" });
      }
      return res.status(500).json({ error: "Database error" });
    }

    MeterRegistration.updateStatus(DRN, status, (err) => {
      if (err) {
        return res.status(500).json({ error: "Failed to update status" });
      }

      // If suspending or revoking, deactivate all sessions
      if (['suspended', 'compromised', 'revoked'].includes(status)) {
        MeterSession.deactivateAllForMeter(meter.id, () => {});
      }

      logSecurityEvent(meter.id, DRN, "STATUS_CHANGED", { newStatus: status }, req.ip);
      res.json({ message: "Meter status updated", status: status });
    });
  });
});

// Get registration statistics (admin only)
router.get("/admin/stats/overview", auth, async function (req, res) {
  MeterRegistration.getStats((err, stats) => {
    if (err) {
      return res.status(500).json({ error: "Failed to get statistics" });
    }
    res.json(stats);
  });
});

// Get meters by status (admin only)
router.get("/admin/status/:status", auth, async function (req, res) {
  const status = req.params.status;
  
  MeterRegistration.getByStatus(status, (err, data) => {
    if (err) {
      return res.status(500).json({ error: "Failed to retrieve meters" });
    }
    res.json(data);
  });
});

// Delete meter (admin only - careful!)
router.delete("/admin/:DRN", auth, async function (req, res) {
  const DRN = req.params.DRN;

  MeterRegistration.findByDRN(DRN, (err, meter) => {
    if (err) {
      if (err.kind === "not_found") {
        return res.status(404).json({ error: "Meter not found" });
      }
      return res.status(500).json({ error: "Database error" });
    }

    // Delete meter (cascading will delete sessions, capabilities, etc.)
    MeterRegistration.remove(DRN, (err) => {
      if (err) {
        return res.status(500).json({ error: "Failed to delete meter" });
      }

      logSecurityEvent(meter?.id, DRN, "METER_DELETED", {}, req.ip);
      res.json({ message: "Meter deleted successfully" });
    });
  });
});

// ==================== SECURITY LOGS ENDPOINTS ====================

// Get security logs for a meter (admin only)
router.get("/admin/:DRN/logs", auth, async function (req, res) {
  const DRN = req.params.DRN;
  const limit = req.query.limit || 100;

  SecurityLog.getByMeterDRN(DRN, limit, (err, logs) => {
    if (err) {
      return res.status(500).json({ error: "Failed to retrieve logs" });
    }
    res.json(logs);
  });
});

// Get recent security events (admin only)
router.get("/admin/logs/recent", auth, async function (req, res) {
  const hours = req.query.hours || 24;

  SecurityLog.getRecent(hours, (err, logs) => {
    if (err) {
      return res.status(500).json({ error: "Failed to retrieve logs" });
    }
    res.json(logs);
  });
});

// Get security log statistics (admin only)
router.get("/admin/logs/stats", auth, async function (req, res) {
  SecurityLog.getStats((err, stats) => {
    if (err) {
      return res.status(500).json({ error: "Failed to get statistics" });
    }
    res.json(stats);
  });
});

module.exports = router;