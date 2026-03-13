const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../admin/authMiddllware');
const winston = require('winston');
const nodemailer = require('nodemailer');
const connection = require('../config/db');
const { createCanvas } = require('canvas');
const { Chart } = require('chart.js/auto');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit'); // Added PDFDocument import

// Set up Winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'billing-notification-test.log' })
  ],
});

// Create email transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.zoho.eu',
  port: parseInt(process.env.EMAIL_PORT) || 587,
  secure: parseInt(process.env.EMAIL_PORT) === 465,  // true only for port 465
  auth: {
    user: process.env.EMAIL,
    pass: process.env.EMAIL_KEY,
  },
  tls: {
    rejectUnauthorized: false,
    ciphers: 'SSLv3'
  },
  connectionTimeout: 15000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
  debug: false,
  logger: false
});

// Ensure directories exist
const chartDir = path.join(__dirname, '../public/charts');
const tempDir = path.join(__dirname, 'temp');
[chartDir, tempDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Enhanced function to get energy data for the entire billing month
async function getEnergyDataForBillingPeriod(DRN, billingMode, billingPeriod = null) {
  return new Promise((resolve, reject) => {
    let startDate, endDate;
    const today = new Date();
    endDate = new Date(today); // Default end date is today
    
    // Determine start date based on billing mode and period
    if (billingMode === 'Postpaid' && billingPeriod) {
      // For postpaid, get data starting from the last billing date
      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();
      
      if (billingPeriod === '1st') {
        // If billing day is 1st, start from 1st of current month or previous month
        if (today.getDate() >= 1) {
          // After billing day, show current month
          startDate = new Date(currentYear, currentMonth, 1);
        } else {
          // Before billing day, show previous month
          startDate = new Date(currentYear, currentMonth - 1, 1);
        }
      } else if (billingPeriod === '15th') {
        // If billing day is 15th
        if (today.getDate() >= 15) {
          // After billing day, start from 15th of current month
          startDate = new Date(currentYear, currentMonth, 15);
        } else {
          // Before billing day, start from 15th of previous month
          startDate = new Date(currentYear, currentMonth - 1, 15);
        }
      } else if (billingPeriod === 'End of the month') {
        // If billing day is end of month
        const lastDayPrevMonth = new Date(currentYear, currentMonth, 0).getDate();
        startDate = new Date(currentYear, currentMonth - 1, lastDayPrevMonth);
      } else if (billingPeriod === 'Custom' && typeof custom_billing_day !== 'undefined') {
        const billingDay = parseInt(custom_billing_day);
        if (today.getDate() >= billingDay) {
          // After billing day, start from billing day of current month
          startDate = new Date(currentYear, currentMonth, billingDay);
        } else {
          // Before billing day, start from billing day of previous month
          startDate = new Date(currentYear, currentMonth - 1, billingDay);
        }
      } else {
        // Default: Start from beginning of current month
        startDate = new Date(currentYear, currentMonth, 1);
      }
    } else {
      // For prepaid or unknown billing type, show last 30 days
      startDate = new Date(today);
      startDate.setDate(today.getDate() - 30);
    }
    
    // Format dates for SQL query
    const formattedStartDate = startDate.toISOString().split('T')[0];
    const formattedEndDate = endDate.toISOString().split('T')[0];
    
    const query = `
      SELECT 
        DATE(date_time) as date,
        (MAX(CAST(active_energy AS DECIMAL(10, 2))) - MIN(CAST(active_energy AS DECIMAL(10, 2)))) / 1000 AS energy_consumption
      FROM 
        MeterCumulativeEnergyUsage
      WHERE 
        DRN = ? 
        AND DATE(date_time) BETWEEN ? AND ?
      GROUP BY 
        DATE(date_time)
      ORDER BY 
        date ASC
    `;

    connection.query(query, [DRN, formattedStartDate, formattedEndDate], (err, results) => {
      if (err) {
        logger.error(`Error getting energy data for DRN ${DRN}:`, err);
        reject(err);
      } else {
        // Format data for chart
        const days = [];
        const values = [];
        const dates = [];
        
        // Calculate maximum consumption value for scaling
        const maxValue = results.length > 0 
          ? Math.max(...results.map(r => parseFloat(r.energy_consumption) || 0)) 
          : 10;
        
        results.forEach(row => {
          const date = new Date(row.date);
          const day = date.getDate();
          const month = date.getMonth() + 1; // JavaScript months are 0-indexed
          const formattedDate = `${day}/${month}`; // Format as day/month
          
          days.push(day);
          dates.push(formattedDate);
          values.push(parseFloat(row.energy_consumption || 0).toFixed(2));
        });

        resolve({ days, dates, values, maxValue, startDate: formattedStartDate, endDate: formattedEndDate });
      }
    });
  });
}

// Function to calculate total energy consumption for the billing period
async function calculateTotalConsumptionForBillingPeriod(DRN, billingMode, billingPeriod = null) {
  return new Promise((resolve, reject) => {
    let startDate, endDate;
    const today = new Date();
    endDate = new Date(today); // Default end date is today
    
    // Determine start date based on billing mode and period - same logic as getEnergyDataForBillingPeriod
    if (billingMode === 'Postpaid' && billingPeriod) {
      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();
      
      if (billingPeriod === '1st') {
        if (today.getDate() >= 1) {
          startDate = new Date(currentYear, currentMonth, 1);
        } else {
          startDate = new Date(currentYear, currentMonth - 1, 1);
        }
      } else if (billingPeriod === '15th') {
        if (today.getDate() >= 15) {
          startDate = new Date(currentYear, currentMonth, 15);
        } else {
          startDate = new Date(currentYear, currentMonth - 1, 15);
        }
      } else if (billingPeriod === 'End of the month') {
        const lastDayPrevMonth = new Date(currentYear, currentMonth, 0).getDate();
        startDate = new Date(currentYear, currentMonth - 1, lastDayPrevMonth);
      } else if (billingPeriod === 'Custom' && typeof custom_billing_day !== 'undefined') {
        const billingDay = parseInt(custom_billing_day);
        if (today.getDate() >= billingDay) {
          startDate = new Date(currentYear, currentMonth, billingDay);
        } else {
          startDate = new Date(currentYear, currentMonth - 1, billingDay);
        }
      } else {
        startDate = new Date(currentYear, currentMonth, 1);
      }
    } else {
      startDate = new Date(today);
      startDate.setDate(today.getDate() - 30);
    }
    
    const formattedStartDate = startDate.toISOString().split('T')[0];
    const formattedEndDate = endDate.toISOString().split('T')[0];
    
    const query = `
      SELECT 
        (MAX(CAST(active_energy AS DECIMAL(10, 2))) - MIN(CAST(active_energy AS DECIMAL(10, 2)))) / 1000 AS total_consumption
      FROM 
        MeterCumulativeEnergyUsage
      WHERE 
        DRN = ? 
        AND DATE(date_time) BETWEEN ? AND ?
    `;

    connection.query(query, [DRN, formattedStartDate, formattedEndDate], (err, results) => {
      if (err) {
        logger.error(`Error calculating total consumption for DRN ${DRN}:`, err);
        reject(err);
      } else {
        const totalConsumption = results.length > 0 && results[0].total_consumption 
          ? parseFloat(results[0].total_consumption).toFixed(2) 
          : '0.00';
        
        resolve({
          totalConsumption,
          startDate: formattedStartDate, 
          endDate: formattedEndDate
        });
      }
    });
  });
}

// Function to generate chart image and return the path
async function generateEnergyChart(data) {
  const width = 800;  // Increased width for better readability
  const height = 500; // Increased height
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  const labels = data.dates || [];
  const values = data.values.map(v => parseFloat(v)) || [];
  
  // Configure Chart.js with more professional styling
  new Chart(ctx, {
    type: 'line',  // Changed from bar to line
    data: {
      labels: labels,
      datasets: [{
        label: 'Energy Usage (kWh)',
        data: values,
        backgroundColor: 'rgba(53, 162, 235, 0.2)',
        borderColor: 'rgba(53, 162, 235, 1)',
        borderWidth: 3,
        tension: 0.3,  // Adds curve smoothing
        fill: true,
        pointRadius: 4,
        pointBackgroundColor: 'rgba(53, 162, 235, 1)',
        pointBorderColor: '#fff',
        pointBorderWidth: 2
      }]
    },
    options: {
      responsive: false,
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
          title: {
            display: true,
            text: 'Date (Day/Month)',
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
        title: {
          display: true,
          text: `Energy Consumption Trend (${data.startDate} to ${data.endDate})`,
          font: {
            size: 18,
            weight: 'bold'
          },
          padding: 20
        },
        legend: {
          display: true,
          position: 'top',
          labels: {
            font: {
              size: 12
            }
          }
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
  
  const filename = `chart_${Date.now()}.png`;
  const filePath = path.join(chartDir, filename);
  
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(filePath, buffer);
  
  return {
    filename: filename,
    path: filePath
  };
}

async function generatePDFReceipt(recipient, energyData, totalUsage) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const fileName = `bill_${recipient.DRN}_${Date.now()}.pdf`;
      const filePath = path.join(tempDir, fileName);
      const writeStream = fs.createWriteStream(filePath);
      
      // Colors
      const primaryColor = '#2c5282';
      const secondaryColor = '#718096';
      const accentColor = '#e2e8f0';

      doc.pipe(writeStream);

      // Header Section
      doc.fillColor(primaryColor)
         .fontSize(10)
         .text('INVOICE', 50, 50, { align: 'left' });

      // Logo and Company Info
      const logoPath = path.join(__dirname, '../public/icon.png');
      doc.image(logoPath, 50, 70, { width: 60 })
         .font('Helvetica-Bold')
         .fontSize(20)
         .text('GridX Meters', 400, 75, { align: 'right' })
         .font('Helvetica')
         .fontSize(10)
         .fillColor(secondaryColor)
         .text('C3MG+C34, Haydn Street\n Windhoek \ninfo@gridx-meters.com', 400, 100, { align: 'right' });

      // Divider Line
      doc.moveTo(50, 160)
         .lineTo(550, 160)
         .lineWidth(1)
         .stroke(accentColor);

      // Billing Information Columns
      const column1 = 50;
      const column2 = 300;
      let y = 180;

      // Bill To Section
      doc.font('Helvetica-Bold').fontSize(11).fillColor(primaryColor).text('BILL TO:', column1, y);
      doc.font('Helvetica').fontSize(10).fillColor(secondaryColor)
         .text(`${recipient.name}\n${recipient.DRN}\nBilling Period: ${energyData.startDate} to ${energyData.endDate}`, column1, y + 20);

      // Invoice Details
      doc.font('Helvetica-Bold').fillColor(primaryColor).text('INVOICE #', column2, y);
      doc.font('Helvetica').fillColor(secondaryColor)
         .text(`INV-${Date.now().toString().slice(-8)}`, column2, y + 15)
         .moveDown(0.5)
         .font('Helvetica-Bold').fillColor(primaryColor).text('DATE')
         .font('Helvetica').fillColor(secondaryColor)
         .text(new Date().toLocaleDateString());

      y += 100;

      // Items Table
      const tableTop = y;
      const itemWidth = 500;
      
      // Table Header (Fixed Contrast)
      doc.rect(column1, tableTop, itemWidth, 20)
      .fill(primaryColor); // Fill header background

      // Set text color to white AFTER background fill
      doc.fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('DESCRIPTION', column1 + 10, tableTop + 5)
      .text('QTY', column1 + 350, tableTop + 5)
      .text('RATE', column1 + 400, tableTop + 5)
      .text('AMOUNT', column1 + 450, tableTop + 5);

      // Table Row (Improved Contrast)
      const rowY = tableTop + 25;
      doc.rect(column1, rowY - 5, itemWidth, 20)
      .fill('#f8fafc'); // Light background

      // Set text to dark color for contrast
      doc.fillColor(secondaryColor) // Or use '#2d3748' for better contrast
      .font('Helvetica')
      .fontSize(10)
      .text('Energy Consumption', column1 + 10, rowY)
      .text(`${totalUsage} kWh`, column1 + 350, rowY)
      .text(`N$${recipient.tariff_rate}`, column1 + 400, rowY)
      .text(`N$${(totalUsage * recipient.tariff_rate).toFixed(2)}`, column1 + 450, rowY);

      // Energy Chart Section
      const totalY = rowY + 20;
      const chartY = totalY + 40;
      if (energyData.values.length > 0) {
        const chartImage = await generateEnergyChart(energyData);
        doc.font('Helvetica-Bold').fontSize(11).fillColor(primaryColor)
           .text('ENERGY CONSUMPTION CHART', column1, chartY);
        doc.image(chartImage.path, column1, chartY + 20, { 
          width: 500,
          align: 'center'
        });
      }

      // Footer
      const footerY = doc.page.height - 100;
      doc.moveTo(50, footerY)
         .lineTo(550, footerY)
         .stroke(accentColor)
         .fontSize(8)
         .fillColor(secondaryColor)
         .text('Thank you for choosing GridX Meters for your energy management needs.', 50, footerY + 10, {
           align: 'center',
           width: 500
         })
         .text('Please make payment by the due date to avoid service interruption.', 50, footerY + 25, {
           align: 'center',
           width: 500
         })
         .text('© GridX Meters. All rights reserved.', 50, footerY + 40, { align: 'center', width: 500 });

      doc.end();

      writeStream.on('finish', () => resolve(filePath));
      writeStream.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * @route   POST /test-notification
 * @desc    Test sending a billing notification email for a specific DRN
 * @access  Private (Admin only)
 */
router.post('/test-notification', authenticateToken, async (req, res) => {
  const { DRN, emailOverride } = req.body;

  if (!DRN) {
    return res.status(400).json({ error: 'DRN is required' });
  }

  try {
    console.log(`[DEBUG 1/7] Route hit — DRN: ${DRN}, emailOverride: ${emailOverride || 'none'}`);

    const meterQuery = `
      SELECT 
        bc.DRN, 
        bc.billing_mode, 
        bc.billing_period, 
        bc.custom_billing_day, 
        bc.notification_frequency,
        bc.notification_types,
        su.Email as email,
        CONCAT(su.FirstName, ' ', su.LastName) as name
      FROM 
        MeterBillingConfiguration bc
      JOIN 
        SystemUsers su ON bc.DRN = su.DRN
      WHERE 
        bc.DRN = ?
    `;

    const meterResults = await new Promise((resolve, reject) => {
      connection.query(meterQuery, [DRN], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    console.log(`[DEBUG 2/7] DB query done — rows returned: ${meterResults.length}`);

    if (meterResults.length === 0) {
      return res.status(404).json({ error: 'Meter configuration or user not found' });
    }

    const meterConfig = meterResults[0];
    console.log(`[DEBUG 2/7] meterConfig: billing_mode=${meterConfig.billing_mode}, billing_period=${meterConfig.billing_period}, email=${meterConfig.email}, tariff_rate=N$2.06 (hardcoded)`);

    console.log(`[DEBUG 3/7] Fetching energy data for billing period...`);
    const monthlyData = await getEnergyDataForBillingPeriod(
      DRN, 
      meterConfig.billing_mode, 
      meterConfig.billing_period
    );
    console.log(`[DEBUG 3/7] Energy data fetched — ${monthlyData.values?.length ?? 0} data points, range: ${monthlyData.startDate} → ${monthlyData.endDate}`);

    console.log(`[DEBUG 4/7] Calculating total consumption...`);
    const consumptionData = await calculateTotalConsumptionForBillingPeriod(
      DRN,
      meterConfig.billing_mode,
      meterConfig.billing_period
    );
    console.log(`[DEBUG 4/7] Total consumption: ${consumptionData.totalConsumption} kWh`);
    
    const consumption = consumptionData.totalConsumption;
    const billingPeriodText = `${consumptionData.startDate} to ${consumptionData.endDate}`;
    
    console.log(`[DEBUG 5/7] Generating energy chart...`);
    const chartImage = await generateEnergyChart(monthlyData);
    console.log(`[DEBUG 5/7] Chart generated — path: ${chartImage?.path}`);

    console.log(`[DEBUG 6/7] Generating PDF receipt...`);
    const pdfPath = await generatePDFReceipt({
      ...meterConfig,
      tariff_rate: 2.06
    }, monthlyData, consumption);
    console.log(`[DEBUG 6/7] PDF generated — path: ${pdfPath}`);


    let billingDayDisplay = '';
    if (meterConfig.billing_mode === 'Postpaid') {
      if (meterConfig.billing_period === 'Custom') {
        billingDayDisplay = `${meterConfig.custom_billing_day}`;
      } else if (meterConfig.billing_period === 'End of the month') {
        const today = new Date();
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        billingDayDisplay = `${lastDay} (End of month)`;
      } else {
        billingDayDisplay = meterConfig.billing_period;
      }
    }

    const emailTo = emailOverride || meterConfig.email;
    
    if (!emailTo) {
      return res.status(400).json({ error: 'No email address available for this meter user' });
    }

    const today = new Date().toLocaleDateString();
    const subject = meterConfig.billing_mode === 'Prepaid' 
      ? `GridX Meters: Your Prepaid Meter Usage Update` 
      : `GridX Meters: Your Monthly Billing Statement`;
    
    const logoPath = path.join(__dirname, '../public/icon.png');
    
    const content = meterConfig.billing_mode === 'Prepaid'
      ? `
        <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 25px; border: 1px solid #eaeaea; border-radius: 8px; background-color: #fafafa;">
          <div style="text-align: center; margin-bottom: 25px;">
            <img src="cid:company-logo" alt="GridX Meters" style="max-width: 70px; height: auto;" />
          </div>
          
          <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 3px 10px rgba(0,0,0,0.08);">
            <h2 style="color: #2c5282; margin-top: 0; font-size: 24px;">Prepaid Energy Usage Statement</h2>
            <p style="color: #4a5568; font-size: 16px;">Dear ${meterConfig.name || 'Valued Customer'},</p>
            <p style="color: #4a5568; font-size: 16px;">Please find below your latest energy consumption details for meter <strong>${DRN}</strong>.</p>
            
            <div style="background-color: #ebf8ff; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 5px solid #3182ce;">
              <table style="width: 100%; border-collapse: collapse; font-size: 16px;">
                <tr>
                  <td style="padding: 8px 5px;"><strong>Statement Date:</strong></td>
                  <td style="padding: 8px 5px;">${today}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 5px;"><strong>Billing Period:</strong></td>
                  <td style="padding: 8px 5px;">${billingPeriodText}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 5px;"><strong>Total Energy Consumed:</strong></td>
                  <td style="padding: 8px 5px;"><strong>${consumption} kWh</strong></td>
                </tr>
              </table>
            </div>
            
            <div style="margin: 30px 0; text-align: center;">
              <p style="color: #4a5568; font-size: 16px; text-align: left; font-weight: bold; margin-bottom: 15px;">Energy Consumption Trend:</p>
              <img src="cid:energy-chart" alt="Energy Usage Chart" style="max-width: 100%; height: auto; display: block; margin: 0 auto; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);" />
            </div>
            
            <p style="color: #4a5568; font-size: 16px;">Keep track of your energy usage to manage your prepaid balance effectively. For any queries regarding your account, please contact our customer support.</p>
          </div>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eaeaea; font-size: 14px; color: #718096; text-align: center;">
            <p>Thank you for choosing GridX Meters for your energy management needs.</p>
            <p>© ${new Date().getFullYear()} GridX Meters. All rights reserved.</p>
          </div>
        </div>
      `
      : `
        <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 25px; border: 1px solid #eaeaea; border-radius: 8px; background-color: #fafafa;">
          <div style="text-align: center; margin-bottom: 25px;">
            <img src="cid:company-logo" alt="GridX Meters" style="max-width: 120px; height: auto;" />
          </div>
          
          <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 3px 10px rgba(0,0,0,0.08);">
            <h2 style="color: #2c5282; margin-top: 0; font-size: 24px;">Monthly Billing Statement</h2>
            <p style="color: #4a5568; font-size: 16px;">Dear ${meterConfig.name || 'Valued Customer'},</p>
            <p style="color: #4a5568; font-size: 16px;">Please find below your monthly billing statement for meter <strong>${DRN}</strong>.</p>
            
            <div style="background-color: #ebf8ff; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 5px solid #3182ce;">
              <table style="width: 100%; border-collapse: collapse; font-size: 16px;">
                <tr>
                  <td style="padding: 8px 5px;"><strong>Statement Date:</strong></td>
                  <td style="padding: 8px 5px;">${today}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 5px;"><strong>Billing Day:</strong></td>
                  <td style="padding: 8px 5px;">${billingDayDisplay}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 5px;"><strong>Billing Period:</strong></td>
                  <td style="padding: 8px 5px;">${billingPeriodText}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 5px;"><strong>Total Energy Consumption:</strong></td>
                  <td style="padding: 8px 5px;"><strong>${consumption} kWh</strong></td>
                </tr>
              </table>
            </div>
            
            <div style="margin: 30px 0; text-align: center;">
              <p style="color: #4a5568; font-size: 16px; text-align: left; font-weight: bold; margin-bottom: 15px;">Energy Consumption Trend:</p>
              <img src="cid:energy-chart" alt="Energy Usage Chart" style="max-width: 100%; height: auto; display: block; margin: 0 auto; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);" />
            </div>
            
            <p style="color: #4a5568; font-size: 16px;">Please review your energy usage and prepare for your upcoming payment. For any billing queries, please contact our support team.</p>
          </div>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eaeaea; font-size: 14px; color: #718096; text-align: center;">
            <p>Thank you for choosing GridX Meters for your energy management needs.</p>
            <p>© ${new Date().getFullYear()} GridX Meters. All rights reserved.</p>
          </div>
        </div>
      `;

    console.log(`[DEBUG 7/7] Sending email — from: ${process.env.EMAIL}, to: ${emailTo}, subject: "${subject}"`);
    console.log(`[DEBUG 7/7] SMTP config — host: ${process.env.EMAIL_HOST}, port: ${process.env.EMAIL_PORT || 587}, secure: ${parseInt(process.env.EMAIL_PORT) === 465}`);

    const info = await transporter.sendMail({
      from: `"GridX Meters" <${process.env.EMAIL}>`,
      to: emailTo,
      subject: subject,
      html: content,
      attachments: [
        {
          filename: chartImage.filename,
          path: chartImage.path,
          cid: 'energy-chart'
        },
        {
          filename: 'company-logo.png',
          path: logoPath,
          cid: 'company-logo'
        },
        {
          filename: `energy-statement-${DRN}.pdf`,
          path: pdfPath
        },
      ]
    });
    
    console.log(`[DEBUG 7/7] Email sent successfully — messageId: ${info.messageId}`);

    [chartImage.path, pdfPath].forEach(filePath => {
      fs.unlink(filePath, err => {
        if (err) logger.error(`Failed to clean up file: ${filePath}`, err);
      });
    });

    logger.info(`Test email sent to ${emailTo} for DRN ${DRN}: ${info.messageId}`);
    
    res.json({ 
      message: 'Test email sent successfully', 
      details: {
        messageId: info.messageId,
        to: emailTo,
        consumption: consumption,
        billingMode: meterConfig.billing_mode,
        billingDay: billingDayDisplay
      }
    });
    
  } catch (error) {
    console.error(`[DEBUG ERROR] Stage failed:`, error.message);
    logger.error('Error sending email:', error);

    // Return specific guidance based on SMTP error code
    const smtpGuidance = {
      ETIMEDOUT:    'Outbound SMTP port is blocked by your firewall/ISP. Try enabling port 587 on your network, or check Zoho Mail → Settings → SMTP is enabled.',
      ECONNREFUSED: 'SMTP port is closed on the server. Confirm smtp.zoho.eu is reachable and SMTP is enabled in your Zoho Mail account.',
      EAUTH:        'Authentication failed (535). Check EMAIL and EMAIL_KEY in .env. For Zoho with 2FA enabled, generate an App Password at zoho.com → My Account → Security → App Passwords.',
      EENVELOPE:    'Invalid sender/recipient address. Verify the FROM address matches your Zoho account email.',
    };
    const guidance = smtpGuidance[error.code] || 'Check .env credentials and Zoho Mail SMTP settings.';

    res.status(500).json({
      error: 'Failed to send email',
      code: error.code || 'UNKNOWN',
      details: error.message,
      fix: guidance
    });
  }
});

/**
 * @route   POST /billing/trigger-all
 * @desc    Manually trigger processing of all email notifications
 * @access  Private (Admin only)
 */
router.post('/trigger-all', authenticateToken, async (req, res) => {
  try {
    await processEmailNotifications();
    res.json({ message: 'Email notifications processed successfully' });
  } catch (error) {
    logger.error('Error processing email notifications:', error);
    res.status(500).json({ error: 'Failed to process email notifications', details: error.message });
  }
});

module.exports = router;
