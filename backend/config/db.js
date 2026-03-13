const mysql = require('mysql2');
const dotenv = require('dotenv');

dotenv.config(); // Load environment variables from .env file

const environment = process.env;

// Create a connection pool
const db = mysql.createPool({
  host: environment.RDS_HOSTNAME,
  user: environment.RDS_USERNAME,
  password: environment.RDS_PASSWORD,
  port: environment.RDS_PORT,
  database: environment.RDS_DB_NAME,
  waitForConnections: true, // Wait for available connection if the pool is full
  connectionLimit: 30,      // Maximum number of connections in the pool
  queueLimit: 0,            // Unlimited number of queued queries
});

// Export the pool
module.exports = db;
