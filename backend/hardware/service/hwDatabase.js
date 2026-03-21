// Re-use the combined backend's shared MySQL connection pool
// (config/db.js already creates and exports a mysql2 pool)
const db = require("../../config/db");

module.exports = db;
