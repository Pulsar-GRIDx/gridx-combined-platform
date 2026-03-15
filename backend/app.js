const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();

const app = express();

// Trust first proxy (NGINX)
app.set('trust proxy', 1);

// CORS
app.use(cors({
  origin: process.env.FRONTEND_DOMAIN || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
}));

// Middleware
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());

// Rate limiter
const limiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 1000,
  message: 'Too many requests, please try again later.',
});
app.use(limiter);

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Health check (at root)
app.get('/healthCheck', (req, res) => res.status(200).send('Healthy'));

// Import routes
const getRoutes = require('./meter/getSuburbEnergyRoute');
const meterPercentageRoutes = require('./routes/meterPercentageCountRoutes');
const meterRoutes = require('./routes/meterRoutes');
const suburbEnergyRoute = require('./meter/getSuburbEnergyRoute');
const adminAuthRoutes = require('./routes/adminAuthRoutes');
const notificationRoutes = require('./notifications/noficationsRoutes');
const financialRoutes = require('./routes/financialRoutes');
const suburbFinance = require('./financial/surburbFinance');
const meterProfileRoutes = require('./meterProfile/meterProfileRoutes');
const systemSettingsRoutes = require('./routes/systemSettingsRoutes');
const meterBillingRoutes = require('./meter/meterBillingRoutes');
const billingNotificationRoutes = require('./services/billingNotificationRoutes');
const meterRegistrationRoutes = require('./meter/meterRegistrationRoutes');
const meterDataRoutes = require('./routes/meterDataRoutes');
const mqttRoutes = require('./routes/mqttRoutes');
let otaRoutes;
try { otaRoutes = require('./routes/otaRoutes'); } catch (e) { /* optional */ }
const groupControlRoutes = require('./routes/groupControlRoutes');
const vendingRoutes = require('./vending/vendingRoutes');

// Initialize MQTT handler (subscribes to meter telemetry topics)
const mqttHandler = require('./services/mqttHandler');
mqttHandler.init();

// Create a sub-router for all API routes under /cb prefix
const apiRouter = express.Router();

// Public routes
apiRouter.use('/meter-registration', meterRegistrationRoutes);
const commissionReportPublicRoutes = require('./meterProfile/commissionReportPublicRoutes');
apiRouter.use('/commission-report', commissionReportPublicRoutes);
const homeClassificationPublicRoutes = require('./meterProfile/homeClassificationPublicRoutes');
apiRouter.use('/home-classification', homeClassificationPublicRoutes);

// Authenticated routes
apiRouter.use('/', getRoutes);
apiRouter.use('/', meterRoutes);
apiRouter.use('/', suburbEnergyRoute);
apiRouter.use('/', adminAuthRoutes);
apiRouter.use('/', notificationRoutes);
apiRouter.use('/', meterPercentageRoutes);
apiRouter.use('/finance', financialRoutes);
apiRouter.use('/finance', suburbFinance);
apiRouter.use('/settings', meterProfileRoutes);
apiRouter.use('/systemSettings', systemSettingsRoutes);
apiRouter.use('/meter-billing', meterBillingRoutes);
apiRouter.use('/billing', billingNotificationRoutes);
apiRouter.use('/', meterDataRoutes);
apiRouter.use('/', mqttRoutes);
apiRouter.use('/', groupControlRoutes);
apiRouter.use('/vending', vendingRoutes);

// Fast meters-list endpoint (avoids slow JOINs in meterService)
const db = require('./config/db');
const { authenticateToken } = require('./admin/authMiddllware');
apiRouter.get('/meters-list', authenticateToken, (req, res) => {
  db.query(
    `SELECT mpr.DRN as id, mpr.DRN as drn, mpr.DRN as meterNo,
            CONCAT(mpr.Name, ' ', mpr.Surname) as customerName,
            mpr.City as area, mpr.Region as suburb, mpr.StreetName as street,
            mpr.SIMNumber as simNumber, mpr.TransformerDRN as transformer,
            mpr.tariff_type as tariffType,
            COALESCE(mlc.mains_state, '0') as mainsState
     FROM MeterProfileReal mpr
     LEFT JOIN (
       SELECT DRN, mains_state,
              ROW_NUMBER() OVER (PARTITION BY DRN ORDER BY date_time DESC) as rn
       FROM MeterLoadControl
       WHERE date_time >= NOW() - INTERVAL 7 DAY
     ) mlc ON mpr.DRN = mlc.DRN AND mlc.rn = 1
     ORDER BY mpr.DRN`,
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      const data = (results || []).map(m => ({
        ...m,
        status: m.mainsState === '1' ? 'Online' : 'Offline',
      }));
      res.json({ success: true, data });
    }
  );
});

// Mount all API routes under /cb prefix
app.use('/cb', apiRouter);

// Also mount at root for backward compatibility (direct access like api.gridx-meters.com)
app.use('/', getRoutes);
app.use('/', meterRoutes);
app.use('/', suburbEnergyRoute);
app.use('/', adminAuthRoutes);
app.use('/', notificationRoutes);
app.use('/', meterPercentageRoutes);
app.use('/finance', financialRoutes);
app.use('/finance', suburbFinance);
app.use('/settings', meterProfileRoutes);
app.use('/systemSettings', systemSettingsRoutes);
app.use('/api/meter', meterBillingRoutes);
app.use('/api/billing', billingNotificationRoutes);
app.use('/meter-registration', meterRegistrationRoutes);

// OTA firmware serving (ESP32 polls these over GSM HTTP)
if (otaRoutes) {
  app.use('/files', otaRoutes);
  app.use('/api/ota', otaRoutes);
}

// Import and initialize cron jobs
try {
  require('./services/billingNotificationCron');
} catch (err) {
  console.warn('Billing notification cron skipped:', err.message);
}

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Bad request, invalid JSON' });
  }
  res.status(500).json({ error: 'An unexpected error occurred' });
});

module.exports = app;
