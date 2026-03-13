const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../admin/authMiddllware');
const connection = require('../config/db');
const winston = require('winston');

// Set up Winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ],
});

/**
 * @route   POST /meter/config/prepaid
 * @desc    Configure prepaid billing for a meter
 * @access  Private
 */
router.post('/config/prepaid', authenticateToken, async (req, res) => {
  let {
    DRN,
    credit_option,
    notification_types,
    notification_frequency,
    automatic_credit_updates,
    meter_tier  // Add meter tier to the accepted parameters
  } = req.body;

  // Validate input
  if (!DRN) {
    return res.status(400).json({ error: 'DRN is required' });
  }

  // Validate credit_option
  if (!['Fixed Amount', 'Flexible Amount'].includes(credit_option)) {
    return res.status(400).json({ error: 'Invalid credit option' });
  }

  // Validate notification_types
  if (notification_types && !Array.isArray(notification_types)) {
    return res.status(400).json({ error: 'Notification types must be an array' });
  }

  // Validate notification_frequency
  if (!['Daily', 'Weekly', 'Monthly'].includes(notification_frequency)) {
    return res.status(400).json({ error: 'Invalid notification frequency' });
  }

  // Validate tier if provided
  if (meter_tier) {
    const validTiers = ['Tier 1', 'Tier 2', 'Tier 3'];
    if (!validTiers.includes(meter_tier)) {
      return res.status(400).json({ error: 'Invalid tier. Must be "Tier 1", "Tier 2", or "Tier 3"' });
    }
  }

  try {
    // Check if configuration already exists for this meter
    const checkQuery = 'SELECT * FROM MeterBillingConfiguration WHERE DRN = ?';
    const checkResult = await new Promise((resolve, reject) => {
      connection.query(checkQuery, [DRN], (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    // Convert notification_types array to SET format
    const notificationTypesString = notification_types ? notification_types.join(',') : 'SMS';

    if (checkResult.length > 0) {
      // Update existing configuration
      const updateQuery = `
        UPDATE MeterBillingConfiguration 
        SET billing_mode = 'Prepaid',
            credit_option = ?,
            notification_types = ?,
            notification_frequency = ?,
            automatic_credit_updates = ?,
            meter_tier = COALESCE(?, meter_tier)
        WHERE DRN = ?
      `;
      
      await new Promise((resolve, reject) => {
        connection.query(
          updateQuery, 
          [
            credit_option,
            notificationTypesString,
            notification_frequency,
            automatic_credit_updates || false,
            meter_tier, // Add meter_tier to parameters
            DRN
          ], 
          (err, result) => {
            if (err) reject(err);
            else resolve(result);
          }
        );
      });

      res.status(200).json({ message: 'Prepaid billing configuration updated successfully' });
    } else {
      // Insert new configuration
      const insertQuery = `
        INSERT INTO MeterBillingConfiguration 
        (DRN, billing_mode, credit_option, notification_types, notification_frequency, automatic_credit_updates, meter_tier)
        VALUES (?, 'Prepaid', ?, ?, ?, ?, ?)
      `;
      
      await new Promise((resolve, reject) => {
        connection.query(
          insertQuery, 
          [
            DRN,
            credit_option,
            notificationTypesString,
            notification_frequency,
            automatic_credit_updates || false,
            meter_tier || null  // Add meter_tier to parameters, default to null if not provided
          ], 
          (err, result) => {
            if (err) reject(err);
            else resolve(result);
          }
        );
      });

      res.status(201).json({ message: 'Prepaid billing configuration created successfully' });
    }
  } catch (err) {
    logger.error('Error configuring prepaid billing:', err);
    res.status(500).json({ error: 'Failed to configure prepaid billing', details: err.message });
  }
});

/**
 * @route   POST /meter/config/postpaid
 * @desc    Configure postpaid billing for a meter
 * @access  Private
 */
router.post('/config/postpaid', authenticateToken, async (req, res) => {
  let {
    DRN,
    turn_off_max_amount,
    turn_on_max_amount,
    amount_notifications,
    billing_period,
    custom_billing_day,
    billing_credit_days,
    notification_types,
    meter_tier
  } = req.body;

  // Validate input
  if (!DRN) {
    return res.status(400).json({ error: 'DRN is required' });
  }

  // Normalize the billing_period value (case-insensitive)
  let normalizedBillingPeriod = billing_period;
  
  // Handle different formats for end of month billing period
  if (billing_period && typeof billing_period === 'string') {
    const lowerBillingPeriod = billing_period.toLowerCase();
    
    if (lowerBillingPeriod === 'end' || 
        lowerBillingPeriod === 'end of the month' || 
        lowerBillingPeriod === 'end of month') {
      normalizedBillingPeriod = 'End of the month';
    }
  }
  
  // Validate billing_period
  const validBillingPeriods = ['1st', '15th', 'End of the month', 'Custom'];
  if (!validBillingPeriods.includes(normalizedBillingPeriod)) {
    return res.status(400).json({ 
      error: `Invalid billing period: "${billing_period}". Must be "1st", "15th", "End of the month", or "Custom"` 
    });
  }

  // Validate custom_billing_day if billing_period is 'Custom'
  if (normalizedBillingPeriod === 'Custom') {
    if (!custom_billing_day || custom_billing_day < 1 || custom_billing_day > 31) {
      return res.status(400).json({ error: 'Custom billing day must be between 1 and 31' });
    }
  }

  // Validate billing_credit_days
  const validCreditDays = ['7 Days', '14 Days', '30 Days'];
  if (!validCreditDays.includes(billing_credit_days)) {
    return res.status(400).json({ error: 'Invalid billing credit days' });
  }

  // Validate notification_types
  if (notification_types && !Array.isArray(notification_types)) {
    return res.status(400).json({ error: 'Notification types must be an array' });
  }

  // Validate tier if provided
  if (meter_tier) {
    const validTiers = ['Tier 1', 'Tier 2', 'Tier 3'];
    if (!validTiers.includes(meter_tier)) {
      return res.status(400).json({ error: 'Invalid tier. Must be "Tier 1", "Tier 2", or "Tier 3"' });
    }
  }

  try {
    // Check if configuration already exists for this meter
    const checkQuery = 'SELECT * FROM MeterBillingConfiguration WHERE DRN = ?';
    const checkResult = await new Promise((resolve, reject) => {
      connection.query(checkQuery, [DRN], (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    // Convert notification_types array to SET format
    const notificationTypesString = notification_types ? notification_types.join(',') : 'SMS';

    if (checkResult.length > 0) {
      // Update existing configuration
      const updateQuery = `
        UPDATE MeterBillingConfiguration 
        SET billing_mode = 'Postpaid',
            turn_off_max_amount = ?,
            turn_on_max_amount = ?,
            amount_notifications = ?,
            billing_period = ?,
            custom_billing_day = ?,
            billing_credit_days = ?,
            notification_types = ?,
            meter_tier = COALESCE(?, meter_tier)
        WHERE DRN = ?
      `;
      
      await new Promise((resolve, reject) => {
        connection.query(
          updateQuery, 
          [
            turn_off_max_amount || false,
            turn_on_max_amount || false,
            amount_notifications || false,
            normalizedBillingPeriod,
            normalizedBillingPeriod === 'Custom' ? custom_billing_day : null,
            billing_credit_days,
            notificationTypesString,
            meter_tier, // Add meter_tier to parameters
            DRN
          ], 
          (err, result) => {
            if (err) reject(err);
            else resolve(result);
          }
        );
      });

      res.status(200).json({ message: 'Postpaid billing configuration updated successfully' });
    } else {
      // Insert new configuration
      const insertQuery = `
        INSERT INTO MeterBillingConfiguration 
        (DRN, billing_mode, turn_off_max_amount, turn_on_max_amount, amount_notifications, 
        billing_period, custom_billing_day, billing_credit_days, notification_types, meter_tier)
        VALUES (?, 'Postpaid', ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      await new Promise((resolve, reject) => {
        connection.query(
          insertQuery, 
          [
            DRN,
            turn_off_max_amount || false,
            turn_on_max_amount || false,
            amount_notifications || false,
            normalizedBillingPeriod,
            normalizedBillingPeriod === 'Custom' ? custom_billing_day : null,
            billing_credit_days,
            notificationTypesString,
            meter_tier || null  // Add meter_tier to parameters, default to null if not provided
          ], 
          (err, result) => {
            if (err) reject(err);
            else resolve(result);
          }
        );
      });

      res.status(201).json({ message: 'Postpaid billing configuration created successfully' });
    }
  } catch (err) {
    logger.error('Error configuring postpaid billing:', err);
    res.status(500).json({ error: 'Failed to configure postpaid billing', details: err.message });
  }
});

/**
 * @route   POST /meter/config/tier
 * @desc    Set tier information for a meter
 * @access  Private
 */
router.post('/config/tier', authenticateToken, async (req, res) => {
  const { DRN, tier } = req.body;

  // Validate input
  if (!DRN) {
    return res.status(400).json({ error: 'DRN is required' });
  }

  // Validate tier
  const validTiers = ['Tier 1', 'Tier 2', 'Tier 3'];
  if (!validTiers.includes(tier)) {
    return res.status(400).json({ error: 'Invalid tier. Must be "Tier 1", "Tier 2", or "Tier 3"' });
  }

  try {
    // Check if configuration already exists for this meter
    const checkQuery = 'SELECT * FROM MeterBillingConfiguration WHERE DRN = ?';
    const checkResult = await new Promise((resolve, reject) => {
      connection.query(checkQuery, [DRN], (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    if (checkResult.length > 0) {
      // Update existing configuration with ONLY tier information
      const updateQuery = `
        UPDATE MeterBillingConfiguration 
        SET meter_tier = ?
        WHERE DRN = ?
      `;
      
      await new Promise((resolve, reject) => {
        connection.query(
          updateQuery, 
          [
            tier,
            DRN
          ], 
          (err, result) => {
            if (err) reject(err);
            else resolve(result);
          }
        );
      });

      res.status(200).json({ message: 'Meter tier configuration updated successfully' });
    } else {
      // Insert minimal new record with ONLY DRN and tier
      const insertQuery = `
        INSERT INTO MeterBillingConfiguration 
        (DRN, meter_tier)
        VALUES (?, ?)
      `;
      
      await new Promise((resolve, reject) => {
        connection.query(
          insertQuery, 
          [
            DRN,
            tier
          ], 
          (err, result) => {
            if (err) reject(err);
            else resolve(result);
          }
        );
      });

      res.status(201).json({ message: 'Meter tier configuration created successfully' });
    }
  } catch (err) {
    logger.error('Error configuring meter tier:', err);
    res.status(500).json({ error: 'Failed to configure meter tier', details: err.message });
  }
});

/**
 * @route   GET /meter/config/:DRN
 * @desc    Get billing configuration for a specific meter
 * @access  Private
 */
router.get('/config/:DRN', authenticateToken, async (req, res) => {
  const { DRN } = req.params;

  try {
    const query = 'SELECT * FROM MeterBillingConfiguration WHERE DRN = ?';
    const result = await new Promise((resolve, reject) => {
      connection.query(query, [DRN], (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    if (result.length === 0) {
      return res.status(404).json({ message: 'No billing configuration found for this meter' });
    }

    // Parse notification_types from SET to array
    const config = result[0];
    if (config.notification_types) {
      config.notification_types = config.notification_types.split(',');
    }

    res.json(config);
  } catch (err) {
    logger.error('Error fetching meter billing configuration:', err);
    res.status(500).json({ error: 'Failed to fetch billing configuration', details: err.message });
  }
});

module.exports = router;
