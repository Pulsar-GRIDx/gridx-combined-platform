const crypto = require("crypto");
const db = require("../service/hwDatabase.js");

class RegistrationValidation {
  async validateRegistrationRequest(req, res, next) {
    try {
      const { 
        drn, 
        timestamp, 
        nonce, 
        firmware_version, 
        hardware_info, 
        signature, 
        public_key 
      } = req.body;

      // Check required fields
      if (!drn || !timestamp || !nonce || !signature || !public_key) {
        return res.status(400).json({
          error: "MISSING_REQUIRED_FIELDS",
          message: "DRN, timestamp, nonce, signature, and public_key are required"
        });
      }

      // Validate DRN format (13 digits)
      if (!/^\d{13}$/.test(drn)) {
        return res.status(400).json({
          error: "INVALID_DRN_FORMAT",
          message: "DRN must be 13 digits"
        });
      }

      // Validate timestamp (within 5 minutes)
      const now = Math.floor(Date.now() / 1000);
      const requestTime = parseInt(timestamp);
      
      if (Math.abs(now - requestTime) > 300) {
        return res.status(400).json({
          error: "INVALID_TIMESTAMP",
          message: "Timestamp is too old or in the future"
        });
      }

      // Validate nonce format (64 hex chars for 32 bytes)
      if (!/^[0-9a-fA-F]{64}$/.test(nonce)) {
        return res.status(400).json({
          error: "INVALID_NONCE_FORMAT",
          message: "Nonce must be 64 hex characters"
        });
      }

      // Check if nonce has been used recently
      const [usedNonces] = await db.query(
        "SELECT COUNT(*) as count FROM used_nonces WHERE nonce = ? AND expires_at > NOW()",
        [nonce]
      );

      if (usedNonces[0].count > 0) {
        return res.status(400).json({
          error: "REPLAY_ATTACK_DETECTED",
          message: "Nonce has already been used"
        });
      }

      // Validate public key format (130 hex chars for uncompressed ECC P-256)
      if (!/^[0-9a-fA-F]{130}$/.test(public_key)) {
        return res.status(400).json({
          error: "INVALID_PUBLIC_KEY_FORMAT",
          message: "Public key must be 130 hex characters"
        });
      }

      // Store validated data for controller
      req.validatedData = {
        drn,
        timestamp: requestTime,
        nonce,
        firmware_version: firmware_version || "unknown",
        hardware_info: hardware_info || "unknown",
        signature,
        public_key,
        clientIp: req.ip || req.connection.remoteAddress
      };

      next();
    } catch (error) {
      console.error("Validation error:", error);
      res.status(500).json({
        error: "VALIDATION_ERROR",
        message: "Error validating request"
      });
    }
  }

  async validateStatusRequest(req, res, next) {
    try {
      const { drn, certificate } = req.query;

      if (!drn || !certificate) {
        return res.status(400).json({
          error: "MISSING_PARAMETERS",
          message: "DRN and certificate query parameters are required"
        });
      }

      if (!/^\d{13}$/.test(drn)) {
        return res.status(400).json({
          error: "INVALID_DRN_FORMAT",
          message: "DRN must be 13 digits"
        });
      }

      // Basic certificate validation
      if (!certificate.includes("-----BEGIN CERTIFICATE-----")) {
        return res.status(400).json({
          error: "INVALID_CERTIFICATE_FORMAT",
          message: "Certificate must be in PEM format"
        });
      }

      req.validatedData = {
        drn,
        certificate,
        clientIp: req.ip
      };

      next();
    } catch (error) {
      console.error("Status validation error:", error);
      res.status(500).json({
        error: "VALIDATION_ERROR",
        message: "Error validating status request"
      });
    }
  }

  async validateRenewalRequest(req, res, next) {
    try {
      const { drn, certificate, signature, timestamp } = req.body;

      if (!drn || !certificate || !signature || !timestamp) {
        return res.status(400).json({
          error: "MISSING_REQUIRED_FIELDS",
          message: "DRN, certificate, signature, and timestamp are required"
        });
      }

      if (!/^\d{13}$/.test(drn)) {
        return res.status(400).json({
          error: "INVALID_DRN_FORMAT",
          message: "DRN must be 13 digits"
        });
      }

      if (!certificate.includes("-----BEGIN CERTIFICATE-----")) {
        return res.status(400).json({
          error: "INVALID_CERTIFICATE_FORMAT",
          message: "Certificate must be in PEM format"
        });
      }

      const now = Math.floor(Date.now() / 1000);
      const requestTime = parseInt(timestamp);
      
      if (Math.abs(now - requestTime) > 300) {
        return res.status(400).json({
          error: "INVALID_TIMESTAMP",
          message: "Timestamp is too old or in the future"
        });
      }

      req.validatedData = {
        drn,
        certificate,
        signature,
        timestamp: requestTime,
        clientIp: req.ip
      };

      next();
    } catch (error) {
      console.error("Renewal validation error:", error);
      res.status(500).json({
        error: "VALIDATION_ERROR",
        message: "Error validating renewal request"
      });
    }
  }

  async validateVerificationRequest(req, res, next) {
    try {
      const { drn, certificate, signature, timestamp } = req.body;

      if (!drn || !certificate || !signature || !timestamp) {
        return res.status(400).json({
          error: "MISSING_REQUIRED_FIELDS",
          message: "All fields are required for verification"
        });
      }

      req.validatedData = {
        drn,
        certificate,
        signature,
        timestamp: parseInt(timestamp),
        clientIp: req.ip
      };

      next();
    } catch (error) {
      console.error("Verification validation error:", error);
      res.status(500).json({
        error: "VALIDATION_ERROR",
        message: "Error validating verification request"
      });
    }
  }
}

module.exports = new RegistrationValidation();