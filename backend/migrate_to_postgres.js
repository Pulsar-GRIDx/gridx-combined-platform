require('dotenv').config();
const mysql = require('mysql2/promise');
const { Client } = require('pg');
const config = require('./migration_config');

// Use configuration from migration_config.js
const PG_CONFIG = config.postgres;
const MYSQL_CONFIG = config.mysql;
const MIGRATION_CONFIG = config.migration;

/**
 * Fetch meter profile mappings (DRN -> UUID) from PostgreSQL
 */
async function fetchMeterProfileMappings(pgClient) {
  console.log('Fetching meter profile mappings from PostgreSQL...');
  
  const query = `
    SELECT id, drn 
    FROM "${PG_CONFIG.schema}".meter_profile
    ORDER BY drn
  `;
  
  try {
    const result = await pgClient.query(query);
    const mappings = new Map();
    
    result.rows.forEach(row => {
      mappings.set(row.drn, row.id);
    });
    
    console.log(`✓ Retrieved ${mappings.size} meter profile mappings`);
    return mappings;
  } catch (error) {
    console.error('Error fetching meter profile mappings:', error.message);
    throw error;
  }
}

/**
 * Create PostgreSQL consumption table if it doesn't exist and ensure constraint exists
 */
async function createPostgresTable(pgClient) {
  try {
    // Create schema
    await pgClient.query(`CREATE SCHEMA IF NOT EXISTS "${PG_CONFIG.schema}"`);
    
    // Create table (this won't modify if it already exists)
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS "${PG_CONFIG.schema}".consumption (
        id BIGSERIAL PRIMARY KEY,
        meter_profile_id UUID NOT NULL,
        active_energy NUMERIC(12, 3),
        reactive_energy NUMERIC(12, 3),
        units VARCHAR(20),
        voltage REAL,
        current REAL,
        active_power REAL,
        reactive_power REAL,
        apparent_power REAL,
        temperature REAL,
        frequency REAL,
        power_factor REAL,
        record_time TIMESTAMPTZ NOT NULL,
        source VARCHAR(50) DEFAULT 'mysql_migration'
      )
    `;
    await pgClient.query(createTableQuery);
    
    // Try to add the unique constraint if it doesn't exist
    try {
      await pgClient.query(`
        ALTER TABLE "${PG_CONFIG.schema}".consumption 
        ADD CONSTRAINT unique_meter_profile_time 
        UNIQUE (meter_profile_id, record_time)
      `);
      console.log('✓ Added unique constraint to consumption table');
    } catch (constraintError) {
      // Constraint might already exist, which is fine
      if (constraintError.code === '42P07') {
        console.log('✓ Unique constraint already exists on consumption table');
      } else {
        console.log('ℹ Could not add unique constraint (table might have duplicates):', constraintError.message);
      }
    }
    
    // Create indexes
    await pgClient.query(`
      CREATE INDEX IF NOT EXISTS idx_consumption_meter_profile_id 
      ON "${PG_CONFIG.schema}".consumption(meter_profile_id)
    `);
    await pgClient.query(`
      CREATE INDEX IF NOT EXISTS idx_consumption_record_time 
      ON "${PG_CONFIG.schema}".consumption(record_time)
    `);
    await pgClient.query(`
      CREATE INDEX IF NOT EXISTS idx_consumption_meter_time 
      ON "${PG_CONFIG.schema}".consumption(meter_profile_id, record_time)
    `);
    
    console.log('✓ PostgreSQL consumption table and indexes ready');
  } catch (error) {
    console.error('Error setting up PostgreSQL table:', error.message);
    throw error;
  }
}

/**
 * Fetch all power data from MySQL MeteringPower table
 */
async function fetchPowerData(mysqlConnection) {
  console.log(`Fetching power data from ${MIGRATION_CONFIG.mysqlPowerTable}...`);
  
  const query = `
    SELECT 
      DRN,
      date_time as timestamp,
      voltage,
      current,
      apparent_power
    FROM ${MIGRATION_CONFIG.mysqlPowerTable}
    ORDER BY DRN, date_time
  `;
  
  try {
    const [rows] = await mysqlConnection.query(query);
    console.log(`✓ Retrieved ${rows.length} power readings`);
    return rows;
  } catch (error) {
    console.error('Error fetching power data:', error.message);
    throw error;
  }
}

/**
 * Fetch all energy data from MySQL MeterCumulativeEnergyUsage table
 */
async function fetchEnergyData(mysqlConnection) {
  console.log(`Fetching energy data from ${MIGRATION_CONFIG.mysqlEnergyTable}...`);
  
  const query = `
    SELECT 
      DRN,
      date_time as timestamp,
      units,
      active_energy
    FROM ${MIGRATION_CONFIG.mysqlEnergyTable}
    ORDER BY DRN, date_time
  `;
  
  try {
    const [rows] = await mysqlConnection.query(query);
    console.log(`✓ Retrieved ${rows.length} energy readings`);
    return rows;
  } catch (error) {
    console.error('Error fetching energy data:', error.message);
    throw error;
  }
}

/**
 * Merge power and energy data by DRN and timestamp, and map to meter profile IDs
 * Optimized version using sorted arrays and efficient matching
 */
function mergeData(powerData, energyData, meterProfileMappings, timeIntervalMinutes = 5) {
  console.log('Merging power and energy data with optimized matching...');
  
  const mergedMap = new Map();
  let unmappedDRNs = new Set();
  const timeToleranceMs = timeIntervalMinutes * 60 * 1000;
  
  // Group data by meter_profile_id
  const powerByMeter = new Map();
  const energyByMeter = new Map();
  
  console.log('Grouping power readings by meter...');
  powerData.forEach(record => {
    const meterProfileId = meterProfileMappings.get(record.DRN);
    if (!meterProfileId) {
      unmappedDRNs.add(record.DRN);
      return;
    }
    
    if (!powerByMeter.has(meterProfileId)) {
      powerByMeter.set(meterProfileId, []);
    }
    powerByMeter.get(meterProfileId).push({
      timestamp: new Date(record.timestamp).getTime(),
      voltage: record.voltage,
      current: record.current,
      apparent_power: record.apparent_power,
      drn: record.DRN
    });
  });
  
  console.log('Grouping energy readings by meter...');
  energyData.forEach(record => {
    const meterProfileId = meterProfileMappings.get(record.DRN);
    if (!meterProfileId) {
      unmappedDRNs.add(record.DRN);
      return;
    }
    
    if (!energyByMeter.has(meterProfileId)) {
      energyByMeter.set(meterProfileId, []);
    }
    energyByMeter.get(meterProfileId).push({
      timestamp: new Date(record.timestamp).getTime(),
      units: record.units,
      active_energy: record.active_energy,
      drn: record.DRN
    });
  });
  
  const allMeterIds = new Set([...powerByMeter.keys(), ...energyByMeter.keys()]);
  console.log(`Processing ${allMeterIds.size} meters...`);
  
  let processedMeters = 0;
  
  // Process each meter
  allMeterIds.forEach(meterProfileId => {
    const powerReadings = powerByMeter.get(meterProfileId) || [];
    const energyReadings = energyByMeter.get(meterProfileId) || [];
    
    // Sort by timestamp
    powerReadings.sort((a, b) => a.timestamp - b.timestamp);
    energyReadings.sort((a, b) => a.timestamp - b.timestamp);
    
    let energyIndex = 0;
    const usedEnergyIndices = new Set();
    
    // Match power readings with closest energy reading
    powerReadings.forEach(powerReading => {
      let bestMatch = null;
      let bestMatchIndex = -1;
      let minDiff = Infinity;
      
      // Start from current energy index and search forward/backward
      for (let i = Math.max(0, energyIndex - 10); i < Math.min(energyReadings.length, energyIndex + 50); i++) {
        if (usedEnergyIndices.has(i)) continue;
        
        const diff = Math.abs(powerReading.timestamp - energyReadings[i].timestamp);
        
        // Stop searching if we're getting further away
        if (diff > timeToleranceMs && energyReadings[i].timestamp > powerReading.timestamp) break;
        
        if (diff < minDiff) {
          minDiff = diff;
          bestMatch = energyReadings[i];
          bestMatchIndex = i;
        }
      }
      
      if (bestMatch && minDiff <= timeToleranceMs) {
        // Found a match
        usedEnergyIndices.add(bestMatchIndex);
        energyIndex = bestMatchIndex;
        
        const avgTimestamp = new Date(Math.round((powerReading.timestamp + bestMatch.timestamp) / 2));
        const key = `${meterProfileId}_${avgTimestamp.getTime()}`;
        
        mergedMap.set(key, {
          meter_profile_id: meterProfileId,
          drn: powerReading.drn,
          record_time: avgTimestamp,
          voltage: powerReading.voltage,
          current: powerReading.current,
          active_power: null,
          reactive_power: null,
          apparent_power: powerReading.apparent_power,
          temperature: null,
          frequency: null,
          power_factor: null,
          units: bestMatch.units,
          active_energy: bestMatch.active_energy,
          reactive_energy: null
        });
      } else {
        // No match - keep power reading only
        const key = `${meterProfileId}_${powerReading.timestamp}`;
        mergedMap.set(key, {
          meter_profile_id: meterProfileId,
          drn: powerReading.drn,
          record_time: new Date(powerReading.timestamp),
          voltage: powerReading.voltage,
          current: powerReading.current,
          active_power: null,
          reactive_power: null,
          apparent_power: powerReading.apparent_power,
          temperature: null,
          frequency: null,
          power_factor: null,
          units: null,
          active_energy: null,
          reactive_energy: null
        });
      }
    });
    
    // Add unmatched energy readings
    energyReadings.forEach((energyReading, idx) => {
      if (usedEnergyIndices.has(idx)) return;
      
      const key = `${meterProfileId}_${energyReading.timestamp}`;
      mergedMap.set(key, {
        meter_profile_id: meterProfileId,
        drn: energyReading.drn,
        record_time: new Date(energyReading.timestamp),
        voltage: null,
        current: null,
        active_power: null,
        reactive_power: null,
        apparent_power: null,
        temperature: null,
        frequency: null,
        power_factor: null,
        units: energyReading.units,
        active_energy: energyReading.active_energy,
        reactive_energy: null
      });
    });
    
    processedMeters++;
    if (processedMeters % 1 === 0 || processedMeters === allMeterIds.size) {
      console.log(`  Processed ${processedMeters}/${allMeterIds.size} meters...`);
    }
  });
  
  const mergedData = Array.from(mergedMap.values());
  
  // Filter out entries with no useful data
  const filteredData = mergedData.filter(record => {
    return record.voltage !== null || 
           record.current !== null || 
           record.apparent_power !== null ||
           record.active_energy !== null;
  });
  
  console.log(`✓ Merged into ${filteredData.length} combined readings (filtered from ${mergedData.length})`);
  
  if (unmappedDRNs.size > 0) {
    console.log(`⚠ Warning: ${unmappedDRNs.size} DRNs not found in meter_profile table:`);
    const drnArray = Array.from(unmappedDRNs);
    console.log(`  ${drnArray.slice(0, 10).join(', ')}${drnArray.length > 10 ? '...' : ''}`);
  }
  
  return filteredData;
}

/**
 * Insert merged data into PostgreSQL consumption table in batches
 */
async function insertIntoPostgres(pgClient, mergedData, batchSize) {
  console.log('Inserting data into PostgreSQL consumption table...');
  
  // Check if unique constraint exists
  const constraintCheck = await pgClient.query(`
    SELECT constraint_name 
    FROM information_schema.table_constraints 
    WHERE table_schema = $1 
      AND table_name = 'consumption' 
      AND constraint_name = 'unique_meter_profile_time'
  `, [PG_CONFIG.schema]);
  
  const hasUniqueConstraint = constraintCheck.rows.length > 0;
  
  // Build query with or without ON CONFLICT based on constraint existence
  const insertQuery = hasUniqueConstraint ? `
    INSERT INTO "${PG_CONFIG.schema}".consumption
      (meter_profile_id, active_energy, reactive_energy, units, voltage, current, 
       active_power, reactive_power, apparent_power, temperature, frequency, 
       power_factor, record_time, source)
    VALUES 
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    ON CONFLICT (meter_profile_id, record_time) 
    DO UPDATE SET
      voltage = COALESCE(EXCLUDED.voltage, consumption.voltage),
      current = COALESCE(EXCLUDED.current, consumption.current),
      active_power = COALESCE(EXCLUDED.active_power, consumption.active_power),
      reactive_power = COALESCE(EXCLUDED.reactive_power, consumption.reactive_power),
      apparent_power = COALESCE(EXCLUDED.apparent_power, consumption.apparent_power),
      temperature = COALESCE(EXCLUDED.temperature, consumption.temperature),
      frequency = COALESCE(EXCLUDED.frequency, consumption.frequency),
      power_factor = COALESCE(EXCLUDED.power_factor, consumption.power_factor),
      units = COALESCE(EXCLUDED.units, consumption.units),
      active_energy = COALESCE(EXCLUDED.active_energy, consumption.active_energy),
      reactive_energy = COALESCE(EXCLUDED.reactive_energy, consumption.reactive_energy)
  ` : `
    INSERT INTO "${PG_CONFIG.schema}".consumption
      (meter_profile_id, active_energy, reactive_energy, units, voltage, current, 
       active_power, reactive_power, apparent_power, temperature, frequency, 
       power_factor, record_time, source)
    VALUES 
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
  `;
  
  if (!hasUniqueConstraint) {
    console.log('ℹ Note: No unique constraint found. Duplicates may be inserted.');
  }
  
  let insertedCount = 0;
  let errorCount = 0;
  let skippedDuplicates = 0;
  
  try {
    // Process in batches to avoid memory issues
    for (let i = 0; i < mergedData.length; i += batchSize) {
      const batch = mergedData.slice(i, i + batchSize);
      
      // Use transaction for batch insert
      await pgClient.query('BEGIN');
      
      try {
        for (const record of batch) {
          try {
            await pgClient.query(insertQuery, [
              record.meter_profile_id,
              record.active_energy,
              record.reactive_energy,
              record.units,
              record.voltage,
              record.current,
              record.active_power,
              record.reactive_power,
              record.apparent_power,
              record.temperature,
              record.frequency,
              record.power_factor,
              record.record_time,
              'mysql_migration'
            ]);
            insertedCount++;
          } catch (insertError) {
            // If it's a duplicate key error and we don't have constraint, skip it
            if (insertError.code === '23505') {
              skippedDuplicates++;
            } else {
              throw insertError;
            }
          }
        }
        
        await pgClient.query('COMMIT');
        if ((i + batchSize) % 10000 === 0 || i + batchSize >= mergedData.length) {
          const progressMsg = skippedDuplicates > 0 
            ? `  Progress: ${insertedCount}/${mergedData.length} records inserted (${skippedDuplicates} duplicates skipped)`
            : `  Progress: ${insertedCount}/${mergedData.length} records inserted`;
          console.log(progressMsg);
        }
      } catch (error) {
        await pgClient.query('ROLLBACK');
        console.error(`Error inserting batch starting at index ${i}:`, error.message);
        errorCount += batch.length;
      }
    }
    
    const summary = skippedDuplicates > 0
      ? `✓ Insert complete: ${insertedCount} successful, ${errorCount} errors, ${skippedDuplicates} duplicates skipped`
      : `✓ Insert complete: ${insertedCount} successful, ${errorCount} errors`;
    console.log(summary);
  } catch (error) {
    console.error('Error during insertion:', error.message);
    throw error;
  }
}

/**
 * Main migration function
 */
async function migrate() {
  let mysqlConnection;
  let pgClient;
  
  try {
    console.log('=== Starting MySQL to PostgreSQL Migration ===\n');
    
    // Connect to MySQL
    console.log('Connecting to MySQL...');
    mysqlConnection = await mysql.createConnection(MYSQL_CONFIG);
    console.log('✓ MySQL connected\n');
    
    // Connect to PostgreSQL
    console.log('Connecting to PostgreSQL...');
    pgClient = new Client(PG_CONFIG);
    await pgClient.connect();
    console.log('✓ PostgreSQL connected\n');
    
    // Create PostgreSQL table
    await createPostgresTable(pgClient);
    console.log();
    
    // Fetch meter profile mappings
    const meterProfileMappings = await fetchMeterProfileMappings(pgClient);
    console.log();
    
    // Fetch data from MySQL
    const powerData = await fetchPowerData(mysqlConnection);
    const energyData = await fetchEnergyData(mysqlConnection);
    console.log();
    
    // Merge data with meter profile ID mapping
    const mergedData = mergeData(powerData, energyData, meterProfileMappings, MIGRATION_CONFIG.timeIntervalMinutes);
    console.log();
    
    // Insert into PostgreSQL
    await insertIntoPostgres(pgClient, mergedData, MIGRATION_CONFIG.batchSize);
    console.log();
    
    // Display summary
    const countQuery = `SELECT COUNT(*) as total FROM "${PG_CONFIG.schema}".consumption`;
    const result = await pgClient.query(countQuery);
    const uniqueMetersQuery = `SELECT COUNT(DISTINCT meter_profile_id) as unique_meters FROM "${PG_CONFIG.schema}".consumption`;
    const metersResult = await pgClient.query(uniqueMetersQuery);
    
    console.log('=== Migration Summary ===');
    console.log(`Total records in PostgreSQL: ${result.rows[0].total}`);
    console.log(`Unique meters: ${metersResult.rows[0].unique_meters}`);
    console.log(`Time interval used: ${MIGRATION_CONFIG.timeIntervalMinutes} minutes`);
    console.log(`Batch size: ${MIGRATION_CONFIG.batchSize} records`);
    console.log('✓ Migration completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    // Close connections
    if (mysqlConnection) {
      await mysqlConnection.end();
      console.log('\nMySQL connection closed');
    }
    if (pgClient) {
      await pgClient.end();
      console.log('PostgreSQL connection closed');
    }
  }
}

// Run migration
if (require.main === module) {
  migrate();
}

module.exports = { migrate };
