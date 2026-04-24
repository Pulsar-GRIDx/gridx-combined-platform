const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../admin/authMiddllware');
const connection = require('../config/db');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'postpaid.log', level: 'info' }),
    new winston.transports.File({ filename: 'postpaid-error.log', level: 'error' }),
  ],
});

// Promisify connection.query
function query(sql, params) {
  return new Promise((resolve, reject) => {
    connection.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
}

// ─── Ensure PostpaidBills table exists ───
async function ensureTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS PostpaidBills (
      id INT AUTO_INCREMENT PRIMARY KEY,
      DRN VARCHAR(50) NOT NULL,
      bill_period_start DATE NOT NULL,
      bill_period_end DATE NOT NULL,
      total_kwh DECIMAL(12,3) NOT NULL DEFAULT 0,
      tariff_rate DECIMAL(8,4) NOT NULL DEFAULT 0,
      energy_charge DECIMAL(12,2) NOT NULL DEFAULT 0,
      fixed_charge DECIMAL(8,2) NOT NULL DEFAULT 0,
      vat_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      due_date DATE NOT NULL,
      paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      status ENUM('Generated','Sent','Paid','Partial','Overdue') DEFAULT 'Generated',
      email_sent_at DATETIME DEFAULT NULL,
      paid_at DATETIME DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_drn (DRN),
      INDEX idx_status (status),
      INDEX idx_period (bill_period_start, bill_period_end)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS MeterModeHistory (
      id INT AUTO_INCREMENT PRIMARY KEY,
      DRN VARCHAR(50) NOT NULL,
      from_mode ENUM('Prepaid','Postpaid') NOT NULL,
      to_mode ENUM('Prepaid','Postpaid') NOT NULL,
      remaining_credit_kwh DECIMAL(12,3) DEFAULT 0,
      reason VARCHAR(255) DEFAULT NULL,
      switched_by VARCHAR(100) DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_drn (DRN),
      INDEX idx_date (created_at)
    )
  `);
}

// Run on module load
ensureTables().catch(err => logger.error('Table creation error:', err));

// ─── GET /summary — Real billing summary stats ───
router.get('/summary', authenticateToken, async (req, res) => {
  try {
    // Prepaid revenue (from VendingTransactions)
    const [prepaidRev] = await query(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM VendingTransactions
      WHERE status = 'Completed'
        AND MONTH(dateTime) = MONTH(CURDATE())
        AND YEAR(dateTime) = YEAR(CURDATE())
    `);

    // Postpaid revenue (from PostpaidBills)
    const [postpaidRev] = await query(`
      SELECT COALESCE(SUM(paid_amount), 0) as total
      FROM PostpaidBills
      WHERE MONTH(bill_period_end) = MONTH(CURDATE())
        AND YEAR(bill_period_end) = YEAR(CURDATE())
    `).catch(() => [{ total: 0 }]);

    // Outstanding (postpaid unpaid)
    const [outstanding] = await query(`
      SELECT COALESCE(SUM(total_amount - paid_amount), 0) as total
      FROM PostpaidBills
      WHERE status IN ('Generated','Sent','Partial','Overdue')
    `).catch(() => [{ total: 0 }]);

    // Meter counts
    const meterCounts = await query(`
      SELECT
        billing_mode,
        COUNT(*) as count
      FROM MeterBillingConfiguration
      WHERE billing_mode IS NOT NULL
      GROUP BY billing_mode
    `).catch(() => []);

    let prepaidCount = 0, postpaidCount = 0;
    meterCounts.forEach(r => {
      if (r.billing_mode === 'Prepaid') prepaidCount = r.count;
      if (r.billing_mode === 'Postpaid') postpaidCount = r.count;
    });

    // Daily revenue for charts (last 7 days)
    const prepaidDaily = await query(`
      SELECT
        DATE(dateTime) as day,
        COALESCE(SUM(amount), 0) as revenue
      FROM VendingTransactions
      WHERE status = 'Completed'
        AND dateTime >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
      GROUP BY DATE(dateTime)
      ORDER BY day
    `).catch(() => []);

    const postpaidDaily = await query(`
      SELECT
        DATE(paid_at) as day,
        COALESCE(SUM(paid_amount), 0) as revenue
      FROM PostpaidBills
      WHERE paid_at IS NOT NULL
        AND paid_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
      GROUP BY DATE(paid_at)
      ORDER BY day
    `).catch(() => []);

    // Cumulative prepaid tokens purchased (all time)
    const [prepaidCumulative] = await query(`
      SELECT COALESCE(SUM(amount), 0) as total, COALESCE(SUM(kwhAmount), 0) as totalKwh,
             COUNT(*) as tokenCount
      FROM VendingTransactions
      WHERE status = 'Completed'
    `).catch(() => [{ total: 0, totalKwh: 0, tokenCount: 0 }]);

    // Cumulative postpaid consumption this month (from MeterCumulativeEnergyUsage)
    const [postpaidConsumption] = await query(`
      SELECT COALESCE(SUM(e.total_kwh), 0) as totalKwh
      FROM MeterCumulativeEnergyUsage e
      INNER JOIN MeterBillingConfiguration bc ON e.DRN = bc.DRN
      WHERE bc.billing_mode = 'Postpaid'
    `).catch(() => [{ totalKwh: 0 }]);

    // Postpaid total billed this month
    const [postpaidBilled] = await query(`
      SELECT COALESCE(SUM(total_amount), 0) as totalBilled
      FROM PostpaidBills
      WHERE MONTH(bill_period_end) = MONTH(CURDATE())
        AND YEAR(bill_period_end) = YEAR(CURDATE())
    `).catch(() => [{ totalBilled: 0 }]);

    res.json({
      totalRevenue: Number(prepaidRev.total) + Number(postpaidRev.total),
      prepaidRevenue: Number(prepaidRev.total),
      postpaidRevenue: Number(postpaidRev.total),
      outstanding: Number(outstanding.total),
      prepaidMeterCount: prepaidCount,
      postpaidMeterCount: postpaidCount,
      prepaidCumulativeRevenue: Number(prepaidCumulative.total),
      prepaidCumulativeKwh: Number(prepaidCumulative.totalKwh),
      prepaidTokenCount: Number(prepaidCumulative.tokenCount),
      postpaidConsumptionKwh: Number(postpaidConsumption.totalKwh),
      postpaidBilledAmount: Number(postpaidBilled.totalBilled),
      prepaidDaily,
      postpaidDaily,
    });
  } catch (err) {
    logger.error('Billing summary error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /prepaid-meters — List prepaid meters with last purchase info ───
router.get('/prepaid-meters', authenticateToken, async (req, res) => {
  try {
    const meters = await query(`
      SELECT
        mp.DRN,
        CONCAT(mp.Name, ' ', mp.Surname) as customer,
        mp.City,
        bc.meter_tier,
        bc.notification_frequency,
        vc.accountNo,
        vc.lastPurchaseDate,
        vc.lastPurchaseAmount,
        vc.status as customerStatus
      FROM MeterBillingConfiguration bc
      JOIN MeterProfileReal mp ON bc.DRN = mp.DRN
      LEFT JOIN VendingCustomers vc ON mp.DRN = vc.meterNo
      WHERE bc.billing_mode = 'Prepaid'
      ORDER BY mp.DRN
    `);
    res.json({ meters });
  } catch (err) {
    logger.error('Prepaid meters error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /postpaid-meters — List postpaid meters with billing info ───
router.get('/postpaid-meters', authenticateToken, async (req, res) => {
  try {
    const meters = await query(`
      SELECT
        mp.DRN,
        CONCAT(mp.Name, ' ', mp.Surname) as customer,
        mp.City,
        bc.meter_tier,
        bc.billing_period,
        bc.custom_billing_day,
        bc.billing_credit_days,
        bc.turn_off_max_amount,
        bc.turn_on_max_amount
      FROM MeterBillingConfiguration bc
      JOIN MeterProfileReal mp ON bc.DRN = mp.DRN
      WHERE bc.billing_mode = 'Postpaid'
      ORDER BY mp.DRN
    `);

    // Get latest bill for each postpaid meter
    for (const meter of meters) {
      const bills = await query(`
        SELECT total_amount, paid_amount, status, due_date, total_kwh, bill_period_end
        FROM PostpaidBills
        WHERE DRN = ?
        ORDER BY bill_period_end DESC
        LIMIT 1
      `, [meter.DRN]);
      meter.latestBill = bills.length > 0 ? bills[0] : null;
    }

    res.json({ meters });
  } catch (err) {
    logger.error('Postpaid meters error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /postpaid-bills — List postpaid bills with filters ───
router.get('/postpaid-bills', authenticateToken, async (req, res) => {
  try {
    const { drn, status, limit = 50 } = req.query;
    let sql = `
      SELECT
        pb.*,
        CONCAT(mp.Name, ' ', mp.Surname) as customer,
        mp.City
      FROM PostpaidBills pb
      JOIN MeterProfileReal mp ON pb.DRN = mp.DRN
      WHERE 1=1
    `;
    const params = [];

    if (drn) { sql += ' AND pb.DRN = ?'; params.push(drn); }
    if (status) { sql += ' AND pb.status = ?'; params.push(status); }
    sql += ' ORDER BY pb.created_at DESC LIMIT ?';
    params.push(Number(limit));

    const bills = await query(sql, params);
    res.json({ bills });
  } catch (err) {
    logger.error('Postpaid bills error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /generate-bill — Generate a monthly bill for a postpaid meter ───
router.post('/generate-bill', authenticateToken, async (req, res) => {
  const { DRN, period_start, period_end } = req.body;
  if (!DRN) return res.status(400).json({ error: 'DRN is required' });

  try {
    // Verify meter is postpaid
    const [config] = await query('SELECT * FROM MeterBillingConfiguration WHERE DRN = ?', [DRN]);
    if (!config || config.billing_mode !== 'Postpaid') {
      return res.status(400).json({ error: 'Meter is not configured for postpaid billing' });
    }

    // Determine billing period
    const endDate = period_end ? new Date(period_end) : new Date();
    const startDate = period_start
      ? new Date(period_start)
      : new Date(endDate.getFullYear(), endDate.getMonth(), 1);

    // Get energy consumption for the period
    const energyData = await query(`
      SELECT
        COALESCE(MAX(units) - MIN(units), 0) as total_kwh
      FROM MeterCumulativeEnergyUsage
      WHERE DRN = ?
        AND date_time BETWEEN ? AND ?
    `, [DRN, startDate, endDate]);

    const totalKwh = Number(energyData[0]?.total_kwh || 0);

    // Get tariff rate
    let tariffRate = 2.80; // default
    const tariffData = await query(
      'SELECT tariff_rates FROM MeterTariffRates WHERE DRN = ?', [DRN]
    ).catch(() => []);
    if (tariffData.length > 0 && tariffData[0].tariff_rates) {
      const rates = JSON.parse(tariffData[0].tariff_rates);
      tariffRate = rates[2] || 2.80; // Index 2 = Standard rate
    }

    // Get tariff config for fixed charge and VAT
    const tariffConfig = await query('SELECT * FROM TariffConfig LIMIT 1').catch(() => []);
    const vatRate = Number(tariffConfig[0]?.vatRate) || 15.00;
    const fixedCharge = Number(tariffConfig[0]?.fixedCharge) || 8.50;

    // Calculate bill
    const energyCharge = Number(totalKwh) * Number(tariffRate);
    const subtotal = energyCharge + fixedCharge;
    const vatAmount = subtotal * (vatRate / 100);
    const totalAmount = subtotal + vatAmount;

    // Calculate due date based on billing_credit_days
    const creditDaysMap = { '7 Days': 7, '14 Days': 14, '30 Days': 30 };
    const creditDays = creditDaysMap[config.billing_credit_days] || 14;
    const dueDate = new Date(endDate);
    dueDate.setDate(dueDate.getDate() + creditDays);

    // Insert bill
    const result = await query(`
      INSERT INTO PostpaidBills
      (DRN, bill_period_start, bill_period_end, total_kwh, tariff_rate,
       energy_charge, fixed_charge, vat_amount, total_amount, due_date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Generated')
    `, [DRN, startDate, endDate, totalKwh, tariffRate,
        energyCharge.toFixed(2), fixedCharge, vatAmount.toFixed(2),
        totalAmount.toFixed(2), dueDate]);

    logger.info(`Bill generated for ${DRN}: N$ ${totalAmount.toFixed(2)} (${totalKwh.toFixed(3)} kWh)`);

    res.json({
      success: true,
      bill: {
        id: result.insertId,
        DRN,
        period: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
        totalKwh: totalKwh.toFixed(3),
        tariffRate,
        energyCharge: energyCharge.toFixed(2),
        fixedCharge,
        vatAmount: vatAmount.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        dueDate: dueDate.toISOString().split('T')[0],
      }
    });
  } catch (err) {
    logger.error('Generate bill error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /record-payment — Record payment for a postpaid bill ───
router.post('/record-payment', authenticateToken, async (req, res) => {
  const { bill_id, amount } = req.body;
  if (!bill_id || !amount) return res.status(400).json({ error: 'bill_id and amount required' });

  try {
    const [bill] = await query('SELECT * FROM PostpaidBills WHERE id = ?', [bill_id]);
    if (!bill) return res.status(404).json({ error: 'Bill not found' });

    const newPaid = Number(bill.paid_amount) + Number(amount);
    const newStatus = newPaid >= Number(bill.total_amount) ? 'Paid' : 'Partial';

    await query(`
      UPDATE PostpaidBills
      SET paid_amount = ?, status = ?, paid_at = NOW()
      WHERE id = ?
    `, [newPaid.toFixed(2), newStatus, bill_id]);

    res.json({ success: true, message: `Payment of N$ ${amount} recorded`, newStatus });
  } catch (err) {
    logger.error('Record payment error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /switch-mode — Switch meter between prepaid and postpaid ───
router.post('/switch-mode', authenticateToken, async (req, res) => {
  const { DRN, target_mode, reason } = req.body;
  if (!DRN || !target_mode) return res.status(400).json({ error: 'DRN and target_mode required' });
  if (!['Prepaid', 'Postpaid'].includes(target_mode)) {
    return res.status(400).json({ error: 'target_mode must be Prepaid or Postpaid' });
  }

  try {
    // Get current config
    const configs = await query('SELECT * FROM MeterBillingConfiguration WHERE DRN = ?', [DRN]);
    const currentMode = configs.length > 0 ? configs[0].billing_mode : null;

    if (currentMode === target_mode) {
      return res.status(400).json({ error: `Meter is already in ${target_mode} mode` });
    }

    // Get current credit from meter via energy data (last known)
    let remainingCreditKwh = 0;

    if (currentMode === 'Prepaid' && target_mode === 'Postpaid') {
      // PREPAID → POSTPAID:
      // The meter must first consume all remaining prepaid units.
      // We send an MQTT command to the meter to:
      // 1. Report remaining credit
      // 2. Set billing_mode = postpaid (meter keeps relay ON, stops decrementing credit)
      // 3. Credit zeroes out on meter side

      // Send MQTT command to switch mode on the meter
      const mqttHandler = require('../services/mqttHandler');
      mqttHandler.publishCommand(DRN, {
        type: 'billing_mode',
        mode: 'postpaid',
        action: 'consume_and_switch'
        // Meter will: consume remaining units, set mode to postpaid, keep relay ON
      });

    } else if (currentMode === 'Postpaid' && target_mode === 'Prepaid') {
      // POSTPAID → PREPAID:
      // 1. Generate final bill for usage up to now
      // 2. Check for outstanding bills — warn but allow
      // 3. Send MQTT command to meter to switch to prepaid mode
      // 4. Meter will turn relay OFF until tokens are loaded

      // Generate final bill
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const energyData = await query(`
        SELECT COALESCE(MAX(units) - MIN(units), 0) as total_kwh
        FROM MeterCumulativeEnergyUsage
        WHERE DRN = ? AND date_time BETWEEN ? AND ?
      `, [DRN, monthStart, now]);

      const finalKwh = Number(energyData[0]?.total_kwh || 0);
      if (finalKwh > 0) {
        // Auto-generate final bill
        let tariffRate = 2.80;
        const tariffData = await query(
          'SELECT tariff_rates FROM MeterTariffRates WHERE DRN = ?', [DRN]
        ).catch(() => []);
        if (tariffData.length > 0 && tariffData[0].tariff_rates) {
          const rates = JSON.parse(tariffData[0].tariff_rates);
          tariffRate = rates[2] || 2.80;
        }
        const tariffConfig = await query('SELECT * FROM TariffConfig LIMIT 1').catch(() => []);
        const vatRate = Number(tariffConfig[0]?.vatRate) || 15.00;
        const fixedCharge = Number(tariffConfig[0]?.fixedCharge) || 8.50;
        const energyCharge = Number(finalKwh) * Number(tariffRate);
        const subtotal = energyCharge + fixedCharge;
        const vatAmount = subtotal * (vatRate / 100);
        const totalAmount = subtotal + vatAmount;
        const dueDate = new Date(now);
        dueDate.setDate(dueDate.getDate() + 14);

        await query(`
          INSERT INTO PostpaidBills
          (DRN, bill_period_start, bill_period_end, total_kwh, tariff_rate,
           energy_charge, fixed_charge, vat_amount, total_amount, due_date, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Generated')
        `, [DRN, monthStart, now, finalKwh, tariffRate,
            energyCharge.toFixed(2), fixedCharge, vatAmount.toFixed(2),
            totalAmount.toFixed(2), dueDate]);

        logger.info(`Final postpaid bill generated for ${DRN}: N$ ${totalAmount.toFixed(2)}`);
      }

      // Send MQTT command to switch to prepaid
      const mqttHandler = require('../services/mqttHandler');
      mqttHandler.publishCommand(DRN, {
        type: 'billing_mode',
        mode: 'prepaid',
        action: 'switch'
        // Meter will: set mode to prepaid, turn relay OFF until tokens loaded
      });
    }

    // Update database billing mode
    if (configs.length > 0) {
      await query('UPDATE MeterBillingConfiguration SET billing_mode = ? WHERE DRN = ?',
        [target_mode, DRN]);
    } else {
      await query('INSERT INTO MeterBillingConfiguration (DRN, billing_mode) VALUES (?, ?)',
        [DRN, target_mode]);
    }

    // Log mode change history
    await query(`
      INSERT INTO MeterModeHistory (DRN, from_mode, to_mode, remaining_credit_kwh, reason, switched_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [DRN, currentMode || 'Prepaid', target_mode, remainingCreditKwh, reason || null, req.user?.username || 'admin']);

    logger.info(`Meter ${DRN} switched from ${currentMode || 'Prepaid'} to ${target_mode}`);

    res.json({
      success: true,
      message: `Meter ${DRN} switched to ${target_mode} mode`,
      DRN,
      previousMode: currentMode || 'Prepaid',
      newMode: target_mode,
      note: target_mode === 'Postpaid'
        ? 'Meter will consume remaining prepaid units then switch to postpaid (relay stays ON, usage tracked)'
        : 'Final bill generated. Meter will switch to prepaid mode (relay OFF until tokens loaded)',
    });
  } catch (err) {
    logger.error('Switch mode error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /mode-history/:DRN — Mode switch history for a meter ───
router.get('/mode-history/:DRN', authenticateToken, async (req, res) => {
  try {
    const history = await query(`
      SELECT * FROM MeterModeHistory
      WHERE DRN = ?
      ORDER BY created_at DESC
      LIMIT 20
    `, [req.params.DRN]);
    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /all-meters — All meters with their billing mode ───
router.get('/all-meters', authenticateToken, async (req, res) => {
  try {
    const meters = await query(`
      SELECT
        mp.DRN,
        CONCAT(mp.Name, ' ', mp.Surname) as customer,
        mp.City,
        COALESCE(bc.billing_mode, 'Prepaid') as billing_mode,
        bc.meter_tier,
        vc.email,
        vc.phone
      FROM MeterProfileReal mp
      LEFT JOIN MeterBillingConfiguration bc ON mp.DRN = bc.DRN
      LEFT JOIN VendingCustomers vc ON mp.DRN = vc.meterNo
      ORDER BY mp.DRN
    `);
    res.json({ meters });
  } catch (err) {
    logger.error('All meters error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Postpaid Tariff Configuration ───

// Ensure PostpaidTariffConfig table
async function ensurePostpaidTariffTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS PostpaidTariffConfig (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tariff_name VARCHAR(100) NOT NULL,
      tariff_type ENUM('Flat','Tiered','Time-of-Use') DEFAULT 'Flat',
      rate_per_kwh DECIMAL(8,4) NOT NULL DEFAULT 2.80,
      tier_rates JSON DEFAULT NULL,
      fixed_charge DECIMAL(8,2) NOT NULL DEFAULT 8.50,
      vat_rate DECIMAL(5,2) NOT NULL DEFAULT 15.00,
      is_default TINYINT(1) DEFAULT 0,
      description VARCHAR(255) DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_default (is_default)
    )
  `);
}
ensurePostpaidTariffTable().catch(err => logger.error('PostpaidTariffConfig table error:', err));

// GET /postpaid-tariffs — List all postpaid tariff configurations
router.get('/postpaid-tariffs', authenticateToken, async (req, res) => {
  try {
    const tariffs = await query('SELECT * FROM PostpaidTariffConfig ORDER BY is_default DESC, tariff_name');
    res.json({ tariffs });
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') return res.json({ tariffs: [] });
    res.status(500).json({ error: err.message });
  }
});

// POST /postpaid-tariffs — Create or update a postpaid tariff
router.post('/postpaid-tariffs', authenticateToken, async (req, res) => {
  try {
    const { id, tariff_name, tariff_type, rate_per_kwh, tier_rates, fixed_charge, vat_rate, is_default, description } = req.body;

    if (!tariff_name) return res.status(400).json({ error: 'tariff_name is required' });

    // If setting as default, clear other defaults
    if (is_default) {
      await query('UPDATE PostpaidTariffConfig SET is_default = 0');
    }

    if (id) {
      await query(`
        UPDATE PostpaidTariffConfig SET
          tariff_name = ?, tariff_type = ?, rate_per_kwh = ?,
          tier_rates = ?, fixed_charge = ?, vat_rate = ?,
          is_default = ?, description = ?
        WHERE id = ?
      `, [tariff_name, tariff_type || 'Flat', rate_per_kwh || 2.80,
          tier_rates ? JSON.stringify(tier_rates) : null,
          fixed_charge || 8.50, vat_rate || 15.00,
          is_default ? 1 : 0, description || null, id]);
      res.json({ success: true, message: 'Postpaid tariff updated' });
    } else {
      const result = await query(`
        INSERT INTO PostpaidTariffConfig
        (tariff_name, tariff_type, rate_per_kwh, tier_rates, fixed_charge, vat_rate, is_default, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [tariff_name, tariff_type || 'Flat', rate_per_kwh || 2.80,
          tier_rates ? JSON.stringify(tier_rates) : null,
          fixed_charge || 8.50, vat_rate || 15.00,
          is_default ? 1 : 0, description || null]);
      res.json({ success: true, message: 'Postpaid tariff created', id: result.insertId });
    }
  } catch (err) {
    logger.error('Save postpaid tariff error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /postpaid-tariffs/:id — Delete a postpaid tariff
router.delete('/postpaid-tariffs/:id', authenticateToken, async (req, res) => {
  try {
    await query('DELETE FROM PostpaidTariffConfig WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Postpaid tariff deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /apply-prepaid-tariff — Apply tariff rate table to all prepaid meters via MQTT
router.post('/apply-prepaid-tariff', authenticateToken, async (req, res) => {
  try {
    const { rates } = req.body;
    if (!rates || !Array.isArray(rates) || rates.length !== 10) {
      return res.status(400).json({ error: 'rates must be an array of 10 values' });
    }

    // Get all prepaid meters (or all meters if no billing config)
    const meters = await query(`
      SELECT mp.DRN FROM MeterProfileReal mp
      LEFT JOIN MeterBillingConfiguration bc ON mp.DRN = bc.DRN
      WHERE COALESCE(bc.billing_mode, 'Prepaid') = 'Prepaid'
    `);

    const mqttHandler = require('../services/mqttHandler');
    let sentCount = 0;

    for (const meter of meters) {
      // Update DB
      const existing = await query('SELECT DRN FROM MeterTariffRates WHERE DRN = ?', [meter.DRN]).catch(() => []);
      const ratesJson = JSON.stringify(rates);
      if (existing.length > 0) {
        await query('UPDATE MeterTariffRates SET tariff_rates = ?, updated_at = NOW() WHERE DRN = ?', [ratesJson, meter.DRN]);
      } else {
        await query('INSERT INTO MeterTariffRates (DRN, tariff_rates, updated_at) VALUES (?, ?, NOW())', [ratesJson, meter.DRN]).catch(() => {});
      }
      // Send MQTT
      mqttHandler.publishCommand(meter.DRN, { trt: rates });
      sentCount++;
    }

    res.json({ success: true, message: `Tariff rates sent to ${sentCount} prepaid meters`, sentCount });
  } catch (err) {
    logger.error('Apply prepaid tariff error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /prepaid-tariff-rates — Get current prepaid tariff rate table (from first meter or defaults)
router.get('/prepaid-tariff-rates', authenticateToken, async (req, res) => {
  try {
    const rateLabels = ['Free/Emergency', 'Lifeline', 'Standard', 'Commercial', 'Industrial',
                        'Custom 5', 'Custom 6', 'Custom 7', 'Custom 8', 'Custom 9'];
    const defaultRates = [0.00, 1.50, 2.80, 3.50, 4.50, 2.80, 2.80, 2.80, 2.80, 2.80];

    const result = await query('SELECT tariff_rates, updated_at FROM MeterTariffRates LIMIT 1').catch(() => []);
    let rates = defaultRates;
    let updatedAt = null;

    if (result.length > 0 && result[0].tariff_rates) {
      rates = JSON.parse(result[0].tariff_rates);
      updatedAt = result[0].updated_at;
    }

    res.json({
      rates: rates.map((rate, i) => ({
        index: i, label: rateLabels[i], rate, display: `N$ ${Number(rate).toFixed(4)}/kWh`
      })),
      updated_at: updatedAt
    });
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') {
      const defaultRates = [0.00, 1.50, 2.80, 3.50, 4.50, 2.80, 2.80, 2.80, 2.80, 2.80];
      const rateLabels = ['Free/Emergency', 'Lifeline', 'Standard', 'Commercial', 'Industrial',
                          'Custom 5', 'Custom 6', 'Custom 7', 'Custom 8', 'Custom 9'];
      return res.json({
        rates: defaultRates.map((rate, i) => ({ index: i, label: rateLabels[i], rate, display: `N$ ${Number(rate).toFixed(4)}/kWh` })),
        updated_at: null
      });
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
