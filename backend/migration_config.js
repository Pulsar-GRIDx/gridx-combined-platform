/**
 * Migration Configuration
 * Copy this file values or set environment variables
 */

module.exports = {
  // PostgreSQL Configuration
  postgres: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT) || 5432,
    database: process.env.DATABASE_NAME || 'gridxdb',
    user: process.env.DATABASE_USER || 'pareekshitsachan',
    password: process.env.DATABASE_PASSWORD || 'Pass@1895',
    schema: process.env.DATABASE_SCHEMA || 'gridxschema'
  },

  // MySQL Configuration (uses existing environment variables)
  mysql: {
    host: process.env.RDS_HOSTNAME || 'localhost',
    user: process.env.RDS_USERNAME || 'root',
    password: process.env.RDS_PASSWORD || '',
    port: parseInt(process.env.RDS_PORT) || 3306,
    database: process.env.RDS_DB_NAME || 'gridx'
  },

  // Migration Settings
  migration: {
    // Time tolerance in minutes for matching power and energy readings (default: 5)
    // Readings within this window will be considered the same measurement
    timeIntervalMinutes: 5,
    
    // Batch size for PostgreSQL inserts
    batchSize: 1000,
    
    // Table name in PostgreSQL (consumption table)
    postgresTableName: 'consumption',
    
    // MySQL table names
    mysqlPowerTable: 'MeteringPower',
    mysqlEnergyTable: 'MeterCumulativeEnergyUsage'
  }
};
