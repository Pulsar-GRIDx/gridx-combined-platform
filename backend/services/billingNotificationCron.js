const cron = require('node-cron');
const nodemailer = require('nodemailer');
const connection = require('../config/db');
const winston = require('winston');
const PDFDocument = require('pdfkit');
const QuickChart = require('quickchart-js');
const fs = require('fs');
const path = require('path');

// Configure Winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'billing.log', level: 'info' }),
    new winston.transports.File({ filename: 'billing-error.log', level: 'error' }),
  ],
});

// Email transporter configuration
// Uses env vars if set, otherwise defaults to GoDaddy SMTP for gridx-meters.com
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtpout.secureserver.net',
  port: process.env.EMAIL_PORT || 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER || process.env.EMAIL || 'info@gridx-meters.com',
    pass: process.env.EMAIL_PASSWORD || process.env.EMAIL_KEY || 'W9h8B_Ykd!UgWgM',
  },
});

// Verify email configuration
async function verifyEmailConfig() {
  try {
    await transporter.verify();
    logger.info('Email server verified');
    return true;
  } catch (error) {
    logger.error('Email verification failed', { error });
    return false;
  }
}

// Get recipients with billing configuration
async function getEmailRecipients() {
  return new Promise((resolve, reject) => {
    const today = new Date();
    const currentDay = today.getDate();
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const isEndOfMonth = currentDay === lastDayOfMonth;

    const query = `
      SELECT 
        bc.DRN, 
        bc.billing_mode,
        bc.billing_period,
        bc.custom_billing_day,
        bc.notification_frequency,
        su.Email as email,
        CONCAT(su.FirstName, ' ', su.LastName) as name
      FROM 
        MeterBillingConfiguration bc
      JOIN 
        SystemUsers su ON bc.DRN = su.DRN
      WHERE 
        FIND_IN_SET('Email', bc.notification_types) > 0
        AND (
          (bc.billing_mode = 'Postpaid' AND (
            (bc.billing_period = '1st' AND ? = 1) OR
            (bc.billing_period = '15th' AND ? = 15) OR
            (bc.billing_period = 'End of the month' AND ?) OR
            (bc.billing_period = 'Custom' AND bc.custom_billing_day = ?)
          ))
          OR
          (bc.billing_mode = 'Prepaid' AND (
            (bc.notification_frequency = 'Daily') OR
            (bc.notification_frequency = 'Weekly' AND WEEKDAY(CURDATE()) = 1) OR
            (bc.notification_frequency = 'Monthly' AND ? = 1)
          ))
    `;

    connection.query(query, 
      [currentDay, currentDay, isEndOfMonth, currentDay, currentDay],
      (err, results) => {
        if (err) return reject(err);
        resolve(results);
      }
    );
  });
}

// Get energy consumption data
async function getEnergyData(DRN, days = 30) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT 
        DATE(date_time) AS date,
        (MAX(CAST(active_energy AS DECIMAL(10, 2))) - 
        (MIN(CAST(active_energy AS DECIMAL(10, 2))) AS daily_usage
      FROM 
        MeterCumulativeEnergyUsage
      WHERE 
        DRN = ? 
        AND date_time >= CURDATE() - INTERVAL ? DAY
      GROUP BY DATE(date_time)
      ORDER BY date_time
    `;

    connection.query(query, [DRN, days], (err, results) => {
      if (err) return reject(err);
      resolve(results.map(r => ({
        date: r.date,
        usage: (r.daily_usage / 1000).toFixed(2)
      })));
    });
  });
}

// Generate energy usage chart
async function generateEnergyChart(energyData) {
  try {
    const chart = new QuickChart();
    chart.setWidth(800);
    chart.setHeight(500);
    chart.setBackgroundColor('#ffffff');

    chart.setConfig({
      type: 'line',
      data: {
        labels: energyData.map(d => new Date(d.date).toLocaleDateString()),
        datasets: [{
          label: 'Daily Energy Usage (kWh)',
          data: energyData.map(d => parseFloat(d.usage)),
          borderColor: 'rgba(53, 162, 235, 1)',
          backgroundColor: 'rgba(53, 162, 235, 0.2)',
          fill: true,
          tension: 0.3,
          borderWidth: 3,
          pointRadius: 4,
          pointBackgroundColor: 'rgba(53, 162, 235, 1)',
          pointBorderColor: '#fff',
          pointBorderWidth: 2
        }]
      },
      options: {
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Energy Consumption (kWh)',
              font: {
                size: 14,
                weight: 'bold'
              }
            },
            grid: {
              color: 'rgba(200, 200, 200, 0.2)'
            }
          },
          x: {
            ticks: {
              autoSkip: true,
              maxTicksLimit: 12
            },
            title: {
              display: true,
              text: 'Date',
              font: {
                size: 14,
                weight: 'bold'
              }
            },
            grid: {
              display: false
            }
          }
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              font: {
                size: 12
              }
            }
          },
          title: {
            display: true,
            text: 'Energy Consumption Trend',
            font: {
              size: 18,
              weight: 'bold'
            },
            padding: 20
          }
        },
        layout: {
          padding: {
            left: 10,
            right: 20,
            top: 10,
            bottom: 10
          }
        }
      }
    });

    return await chart.toBinary();
  } catch (error) {
    logger.error('Chart generation failed', { error });
    return null;
  }
}

// Generate PDF receipt with improved design
async function generatePDFReceipt(recipient, energyData, totalUsage) {
  return new Promise(async (resolve) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const tempDir = path.join(__dirname, 'temp');
    const fileName = `bill_${recipient.DRN}_${Date.now()}.pdf`;
    const filePath = path.join(tempDir, fileName);

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);
    
    // Use the correct logo path
    const logoPath = path.join(__dirname, '../public/icon.png');

    // Professional Header
    doc.image(logoPath, 50, 45, { width: 70 })
       .fontSize(22)
       .fillColor('#2c5282')
       .text('GridX Meters', 130, 50)
       .fontSize(14)
       .fillColor('#718096')
       .text('Energy Statement', 130, 78);
      
    // Right-aligned statement details
    doc.fontSize(10)
       .fillColor('#4a5568')
       .text('Statement Date:', 400, 50, { align: 'right' })
       .text(new Date().toLocaleDateString(), 500, 50, { align: 'right' })
       .text('Statement #:', 400, 65, { align: 'right' })
       .text(`INV-${Date.now().toString().slice(-8)}`, 500, 65, { align: 'right' });
    
    // Divider line
    doc.moveTo(50, 100)
       .lineTo(550, 100)
       .strokeColor('#e2e8f0')
       .stroke();

    // Customer Information
    doc.moveDown(2)
       .fontSize(14)
       .fillColor('#2d3748')
       .text('CUSTOMER INFORMATION', { underline: true })
       .moveDown(0.5)
       .fontSize(10)
       .fillColor('#4a5568')
       .text(`Customer Name: ${recipient.name || 'Customer'}`)
       .text(`Meter ID: ${recipient.DRN}`)
       .text(`Billing Mode: ${recipient.billing_mode}`);
    
    // Billing Summary
    doc.moveDown(1.5)
       .fontSize(14)
       .fillColor('#2d3748')
       .text('BILLING SUMMARY', { underline: true })
       .moveDown(0.5);
    
    // Create a table-like structure for billing details
    const yPos = doc.y;
    doc.fontSize(10)
       .rect(50, yPos, 500, 30)
       .fillAndStroke('#ebf8ff', '#e2e8f0');
    
    // Table headers with better formatting
    doc.fillColor('#2d3748')
       .text('Description', 70, yPos + 10)
       .text('Quantity', 270, yPos + 10, { width: 100, align: 'center' })
       .text('Rate', 370, yPos + 10, { width: 80, align: 'center' })
       .text('Amount', 470, yPos + 10, { width: 80, align: 'center' });
    
    // Table data row
    doc.rect(50, yPos + 30, 500, 30)
       .fillAndStroke('white', '#e2e8f0')
       .fillColor('#4a5568')
       .text('Energy Consumption', 70, yPos + 40)
       .text(`${totalUsage} kWh`, 270, yPos + 40, { width: 100, align: 'center' })
       .text(`N$2.06`, 370, yPos + 40, { width: 80, align: 'center' })
       .fillColor('#2c5282')
       .text(`N$${(totalUsage * 2.06).toFixed(2)}`, 470, yPos + 40, { width: 80, align: 'center' });
    
    // Total row
    doc.rect(350, yPos + 60, 200, 30)
       .fillAndStroke('#f7fafc', '#e2e8f0')
       .fillColor('#2d3748')
       .text('Total Due:', 370, yPos + 70)
       .fillColor('#2c5282')
       .fontSize(12)
       .text(`N$${(totalUsage * 2.06).toFixed(2)}`, 470, yPos + 70, { width: 80, align: 'center' });

    // Energy Consumption Chart
    doc.moveDown(3)
       .fontSize(14)
       .fillColor('#2d3748')
       .text('ENERGY CONSUMPTION TREND', { underline: true })
       .moveDown(0.5);

    // Add the chart image
    if (energyData.length > 0) {
      const chartImage = await generateEnergyChart(energyData);
      if (chartImage) {
        doc.image(chartImage, {
          fit: [500, 250],
          align: 'center'
        });
      }
    }

    // Energy Saving Tips
    doc.moveDown(1)
       .fontSize(14)
       .fillColor('#2d3748')
       .text('ENERGY SAVING TIPS', { underline: true })
       .moveDown(0.5)
       .fontSize(10)
       .fillColor('#4a5568')
       .list([
         'Turn off lights and appliances when not in use',
         'Use energy-efficient LED bulbs',
         'Keep your thermostat at an optimal temperature',
         'Regularly maintain your heating and cooling systems'
       ], { bulletRadius: 2, textIndent: 20 });
    
    // Footer with contact information
    const footerY = doc.page.height - 100;
    
    doc.moveTo(50, footerY)
       .lineTo(550, footerY)
       .strokeColor('#e2e8f0')
       .stroke();
    
    doc.fontSize(10)
       .fillColor('#718096')
       .text('Thank you for choosing GridX Meters for your energy management needs.', 50, footerY + 15, { align: 'center' })
       .text('For any inquiries, please contact our customer service at support@gridxmeters.com', 50, footerY + 30, { align: 'center' })
       .text(`© ${new Date().getFullYear()} GridX Meters. All rights reserved.`, 50, footerY + 45, { align: 'center' });

    doc.end();

    writeStream.on('finish', () => resolve(filePath));
  });
}

// Send email with PDF attachment
async function sendBillingEmail(recipient, pdfPath) {
  try {
    // Professional HTML email with embedded PDF
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 25px; border: 1px solid #eaeaea; border-radius: 8px; background-color: #fafafa;">
        <div style="text-align: center; margin-bottom: 25px;">
          <img src="cid:company-logo" alt="GridX Meters" style="max-width: 120px; height: auto;" />
        </div>
        
        <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 3px 10px rgba(0,0,0,0.08);">
          <h2 style="color: #2c5282; margin-top: 0; font-size: 24px;">${recipient.billing_mode} Energy Statement</h2>
          <p style="color: #4a5568; font-size: 16px;">Dear ${recipient.name || 'Valued Customer'},</p>
          <p style="color: #4a5568; font-size: 16px;">Your ${recipient.billing_mode.toLowerCase()} energy statement for meter <strong>${recipient.DRN}</strong> is now available.</p>
          
          <div style="background-color: #ebf8ff; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 5px solid #3182ce;">
            <p style="margin: 0; font-size: 16px;">Please find your detailed billing statement attached to this email as a PDF document.</p>
          </div>
          
          <p style="color: #4a5568; font-size: 16px;">Thank you for being a GridX Meters customer. If you have any questions regarding your bill, please contact our customer support team.</p>
        </div>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eaeaea; font-size: 14px; color: #718096; text-align: center;">
          <p>Thank you for choosing GridX Meters for your energy management needs.</p>
          <p>© ${new Date().getFullYear()} GridX Meters. All rights reserved.</p>
        </div>
      </div>
    `;

    const logoPath = path.join(__dirname, '../public/icon.png');

    await transporter.sendMail({
      from: `"GridX Meters" <${process.env.EMAIL_USER}>`,
      to: recipient.email,
      subject: `GridX Meters: ${recipient.billing_mode} Energy Statement - ${new Date().toLocaleDateString()}`,
      html: emailHtml,
      attachments: [
        {
          filename: `GridX_Meters_Statement_${recipient.DRN}.pdf`,
          path: pdfPath
        },
        {
          filename: 'company-logo.png',
          path: logoPath,
          cid: 'company-logo'
        }
      ]
    });

    fs.unlinkSync(pdfPath);
    logger.info(`Email sent to ${recipient.email}`);
    return true;
  } catch (error) {
    logger.error(`Email failed to ${recipient.email}`, { error });
    return false;
  }
}

// Main processing function
async function processBilling() {
  try {
    if (!await verifyEmailConfig()) return;

    const recipients = await getEmailRecipients();
    for (const recipient of recipients) {
      try {
        const billingDays = recipient.billing_period === 'Custom' 
          ? recipient.custom_billing_day 
          : 30;

        const energyData = await getEnergyData(recipient.DRN, billingDays);
        const totalUsage = energyData.reduce((sum, d) => sum + parseFloat(d.usage), 0);
        
        const pdfPath = await generatePDFReceipt(recipient, energyData, totalUsage);
        await sendBillingEmail(recipient, pdfPath);
      } catch (error) {
        logger.error(`Processing failed for ${recipient.DRN}`, { error });
      }
    }
  } catch (error) {
    logger.error('Billing processing failed', { error });
  }
}

// Schedule daily at 8 AM
cron.schedule('0 8 * * *', () => {
  logger.info('Starting billing process');
  processBilling();
});

// ─── Postpaid Auto-Bill Generation ───
// Generates PostpaidBills records for meters on their billing day
async function generatePostpaidBills() {
  try {
    const today = new Date();
    const currentDay = today.getDate();
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const isEndOfMonth = currentDay === lastDayOfMonth;

    // Find postpaid meters whose billing day is today
    const meters = await new Promise((resolve, reject) => {
      connection.query(`
        SELECT bc.DRN, bc.billing_period, bc.custom_billing_day, bc.billing_credit_days
        FROM MeterBillingConfiguration bc
        WHERE bc.billing_mode = 'Postpaid'
          AND (
            (bc.billing_period = '1st' AND ? = 1) OR
            (bc.billing_period = '15th' AND ? = 15) OR
            (bc.billing_period = 'End of the month' AND ?) OR
            (bc.billing_period = 'Custom' AND bc.custom_billing_day = ?)
          )
      `, [currentDay, currentDay, isEndOfMonth, currentDay], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    if (meters.length === 0) {
      logger.info('No postpaid bills to generate today');
      return;
    }

    logger.info(`Generating postpaid bills for ${meters.length} meter(s)`);

    for (const meter of meters) {
      try {
        // Determine billing period (last month)
        const periodEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const periodStart = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());

        // Get energy consumption
        const energyData = await new Promise((resolve, reject) => {
          connection.query(`
            SELECT COALESCE(MAX(units) - MIN(units), 0) as total_kwh
            FROM MeterCumulativeEnergyUsage
            WHERE DRN = ? AND date_time BETWEEN ? AND ?
          `, [meter.DRN, periodStart, periodEnd], (err, results) => {
            if (err) reject(err);
            else resolve(results);
          });
        });

        const totalKwh = parseFloat(energyData[0]?.total_kwh || 0);

        // Get tariff rate
        let tariffRate = 2.80;
        const tariffData = await new Promise((resolve, reject) => {
          connection.query('SELECT tariff_rates FROM MeterTariffRates WHERE DRN = ?',
            [meter.DRN], (err, results) => {
              if (err) reject(err);
              else resolve(results);
            });
        }).catch(() => []);

        if (tariffData.length > 0 && tariffData[0].tariff_rates) {
          const rates = JSON.parse(tariffData[0].tariff_rates);
          tariffRate = rates[2] || 2.80;
        }

        // Get tariff config
        const tariffConfig = await new Promise((resolve, reject) => {
          connection.query('SELECT * FROM TariffConfig LIMIT 1', (err, results) => {
            if (err) reject(err);
            else resolve(results);
          });
        }).catch(() => []);

        const vatRate = tariffConfig[0]?.vatRate || 15.00;
        const fixedCharge = tariffConfig[0]?.fixedCharge || 8.50;

        // Calculate
        const energyCharge = totalKwh * tariffRate;
        const subtotal = energyCharge + fixedCharge;
        const vatAmount = subtotal * (vatRate / 100);
        const totalAmount = subtotal + vatAmount;

        const creditDaysMap = { '7 Days': 7, '14 Days': 14, '30 Days': 30 };
        const creditDays = creditDaysMap[meter.billing_credit_days] || 14;
        const dueDate = new Date(periodEnd);
        dueDate.setDate(dueDate.getDate() + creditDays);

        // Check for existing bill for this period
        const existing = await new Promise((resolve, reject) => {
          connection.query(`
            SELECT id FROM PostpaidBills
            WHERE DRN = ? AND bill_period_start = ? AND bill_period_end = ?
          `, [meter.DRN, periodStart, periodEnd], (err, results) => {
            if (err) reject(err);
            else resolve(results);
          });
        }).catch(() => []);

        if (existing.length > 0) {
          logger.info(`Bill already exists for ${meter.DRN} period ${periodStart.toISOString().split('T')[0]}`);
          continue;
        }

        // Insert bill
        await new Promise((resolve, reject) => {
          connection.query(`
            INSERT INTO PostpaidBills
            (DRN, bill_period_start, bill_period_end, total_kwh, tariff_rate,
             energy_charge, fixed_charge, vat_amount, total_amount, due_date, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Generated')
          `, [meter.DRN, periodStart, periodEnd, totalKwh, tariffRate,
              energyCharge.toFixed(2), fixedCharge, vatAmount.toFixed(2),
              totalAmount.toFixed(2), dueDate], (err, results) => {
            if (err) reject(err);
            else resolve(results);
          });
        });

        logger.info(`Postpaid bill generated for ${meter.DRN}: N$ ${totalAmount.toFixed(2)} (${totalKwh.toFixed(3)} kWh)`);
      } catch (err) {
        logger.error(`Failed to generate bill for ${meter.DRN}:`, err);
      }
    }
  } catch (err) {
    logger.error('Postpaid bill generation failed:', err);
  }
}

// Schedule postpaid bill generation daily at 7 AM (before email notifications at 8 AM)
cron.schedule('0 7 * * *', () => {
  logger.info('Starting postpaid bill generation');
  generatePostpaidBills();
});

// Manual trigger for testing
module.exports = {
  processEmailNotifications: processBilling,
  generatePostpaidBills,
  schedule: cron.schedule('0 8 * * *', () => {
    logger.info('Starting scheduled billing process');
    processBilling();
  })
};