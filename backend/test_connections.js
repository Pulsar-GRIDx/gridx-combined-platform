require('dotenv').config();
const mysql = require('mysql2/promise');
const { Client } = require('pg');
const config = require('./migration_config');

/**
 * Test database connections before running migration
 */
async function testConnections() {
  console.log('=== Testing Database Connections ===\n');
  
  let mysqlConnection;
  let pgClient;
  let allTestsPassed = true;

  // Test MySQL Connection
  try {
    console.log('Testing MySQL connection...');
    console.log(`  Host: ${config.mysql.host}`);
    console.log(`  Port: ${config.mysql.port}`);
    console.log(`  Database: ${config.mysql.database}`);
    console.log(`  User: ${config.mysql.user}`);
    
    mysqlConnection = await mysql.createConnection(config.mysql);
    console.log('✓ MySQL connection successful\n');
    
    // Test table existence
    console.log('Checking MySQL tables...');
    const [powerRows] = await mysqlConnection.query(
      `SELECT COUNT(*) as count FROM ${config.migration.mysqlPowerTable} LIMIT 1`
    );
    console.log(`  ✓ ${config.migration.mysqlPowerTable}: ${powerRows[0].count} records`);
    
    const [energyRows] = await mysqlConnection.query(
      `SELECT COUNT(*) as count FROM ${config.migration.mysqlEnergyTable} LIMIT 1`
    );
    console.log(`  ✓ ${config.migration.mysqlEnergyTable}: ${energyRows[0].count} records\n`);
    
    await mysqlConnection.end();
  } catch (error) {
    console.error('❌ MySQL connection failed:', error.message);
    console.error('   Please check your MySQL credentials and ensure the database is running.\n');
    allTestsPassed = false;
    if (mysqlConnection) await mysqlConnection.end();
  }

  // Test PostgreSQL Connection
  try {
    console.log('Testing PostgreSQL connection...');
    console.log(`  Host: ${config.postgres.host}`);
    console.log(`  Port: ${config.postgres.port}`);
    console.log(`  Database: ${config.postgres.database}`);
    console.log(`  User: ${config.postgres.user}`);
    console.log(`  Schema: ${config.postgres.schema}`);
    
    pgClient = new Client(config.postgres);
    await pgClient.connect();
    console.log('✓ PostgreSQL connection successful\n');
    
    // Test schema
    const schemaResult = await pgClient.query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name = $1
    `, [config.postgres.schema]);
    
    if (schemaResult.rows.length === 0) {
      console.log(`  ℹ Schema '${config.postgres.schema}' does not exist (will be created during migration)\n`);
    } else {
      console.log(`  ✓ Schema '${config.postgres.schema}' exists`);
      
      // Check for meter_profile table
      const meterProfileCheck = await pgClient.query(`
        SELECT COUNT(*) as count 
        FROM "${config.postgres.schema}".meter_profile 
        LIMIT 1
      `);
      console.log(`  ✓ meter_profile table: ${meterProfileCheck.rows[0].count} records\n`);
    }
    
    await pgClient.end();
  } catch (error) {
    console.error('❌ PostgreSQL connection failed:', error.message);
    console.error('   Please check your PostgreSQL credentials and ensure the database is running.\n');
    allTestsPassed = false;
    if (pgClient) await pgClient.end();
  }

  // Summary
  console.log('=== Test Summary ===');
  if (allTestsPassed) {
    console.log('✓ All connection tests passed!');
    console.log('\nYou can now run the migration with:');
    console.log('  node migrate_to_postgres.js\n');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed. Please fix the issues above before running migration.\n');
    process.exit(1);
  }
}

// Run tests
testConnections();
