# MySQL to PostgreSQL Migration - Quick Start Guide

## Overview
This migration exports data from two MySQL tables (MeteringPower and MeterCumulativeEnergyUsage) and merges them into a single PostgreSQL table.

## Files Created
- `migrate_to_postgres.js` - Main migration script
- `migration_config.js` - Configuration file
- `test_connections.js` - Connection testing script
- `MIGRATION_README.md` - Detailed documentation

## Quick Start (3 Steps)

### Step 1: Configure PostgreSQL Connection

Edit `migration_config.js` or set these environment variables:

```bash
# Add to your .env file or export in terminal
export DATABASE_HOST=localhost
export DATABASE_PORT=5432
export DATABASE_NAME=gridxdb
export DATABASE_USER=pareekshitsachan
export DATABASE_PASSWORD=Pass@1895
export DATABASE_SCHEMA=gridxschema
```

Your MySQL credentials are already configured via existing environment variables (RDS_*).

### Step 2: Test Connections

Before running the migration, test that everything connects:

```bash
node test_connections.js
```

Expected output:
```
=== Testing Database Connections ===

Testing MySQL connection...
  Host: your_mysql_host
  Port: 3306
  Database: your_database
✓ MySQL connection successful

Checking MySQL tables...
  ✓ MeteringPower: 15000 records
  ✓ MeterCumulativeEnergyUsage: 14500 records

Testing PostgreSQL connection...
  Host: localhost
  Port: 5432
  Database: gridxdb
✓ PostgreSQL connection successful
  ✓ meter_profile table: 50 records

=== Test Summary ===
✓ All connection tests passed!
```

### Step 3: Run Migration

```bash
node migrate_to_postgres.js
```

The script will:
1. Connect to both databases
2. Create the PostgreSQL table structure
3. Fetch all data from MySQL
4. Merge and insert into PostgreSQL
5. Show progress and summary

Expected output:
```
=== Starting MySQL to PostgreSQL Migration ===

Connecting to MySQL...
✓ MySQL connected

Connecting to PostgreSQL...
✓ PostgreSQL connected
consumption table created successfully

Fetching meter profile mappings from PostgreSQL...
✓ Retrieved 50 meter profile mappings
✓ PostgreSQL table created successfully

Fetching power data from MeteringPower...
✓ Retrieved 15000 power readings

Fetching energy data from MeterCumulativeEnergyUsage...
✓ Retrieved 14500 energy readings

Merging power and energy data...
✓ Merged into 20000 combined readings

Inserting data into PostgreSQL...
  Progress: 1000/20000 records inserted
  Progress: 2000/20000 records inserted
  ...
  Progress: 20000/20000 records inserted
Unique meters: 50
✓ Insert complete: 20000 successful, 0 errors

=== Migration Summary ===
Total records in PostgreSQL: 20000
Time interval used: 5 minutes
Batch size: 1000 records
✓ Migration completed successfully!
```

## Configuration Options

### Change Time Interval

In `migration_config.js`, modify:

```javascript
migration: {
  timeIntervalMinutes: 10, // Change from 5 to 10 minutes
  // ...
}
```

Common intervals: 1, 5, 10, 15, 30, 60 minutes

### Change Batch Size

```javascript
migration: {
  batchSize: 500, // Change from 1000 to 500 records per batch
  // ...
}
```

Lower batch size = slower but less memory usage

## PostgreSQL Table Structure

The script creates a `consumption` table that matches your TypeORM entity:

```sql
CREATE TABLE gridxschema.consumption (
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
    source VARCHAR(50) DEFAULT 'mysql_migration',
    
    UNIQUE (meter_profile_id, record_time)
);
```

**Important**: The script looks up meter profile UUIDs from the `meter_profile` table using DRN values from MySQL.

## Query Examples

### Get all data for a meter by UUID:
```sql
SELECT * FROM gridxschema.consumption 
WHERE meter_profile_id = 'your-uuid-here' 
ORDER BY record_time DESC;
```

### Get all data for a meter by DRN (via join):
```sql
SELECT c.* 
FROM gridxschema.consumption c
JOIN gridxschema.meter_profile mp ON c.meter_profile_id = mp.id
WHERE mp.drn = 'YOUR_METER_DRN' 
ORDER BY c.record_time DESC;
```

### Count readings per meter:
```sql
SELECT mp.drn, COUNT(*) as reading_count
FROM gridxschema.consumption c
JOIN gridxschema.meter_profile mp ON c.meter_profile_id = mp.id
GROUP BY mp.drn
ORDER BY reading_count DESC;
```

## Troubleshooting

### "Cannot find module 'pg'"
```bash
npm install pg
```

### "Connection refused" (PostgreSQL)
- Check PostgreSQL is running: `pg_isready`
- Check port: `netstat -an | grep 5432`
- Check connection settings in `migration_config.js`

### "Access denied" (MySQL)
- Verify your .env file has correct RDS_* variables
- Test MySQL connection separately

### "Out of memory"
- Reduce `batchSize` in `migration_config.js`
- Consider migrating in date ranges (modify queries)

### "Meter Profile Dependency**: DRNs from MySQL must exist in the PostgreSQL `meter_profile` table
2. **UUID Mapping**: The script automatically maps DRN → meter_profile_id (UUID)
3. **Safe to re-run**: The script uses `ON CONFLICT` to update existing records
4. **No data loss**: Original MySQL data remains untouched
5. **Unmapped DRNs**: Any MySQL DRNs not found in `meter_profile` will be skipped (with warning)
6
1. **Safe to re-run**: The script uses `ON CONFLICT` to update existing records
2. **No data loss**: Original MySQL data remains untouched
3. **Idempotent**: Running multiple times won't create duplicates
4. **Progress tracking**: Console shows real-time progress
5. **Timestamp rounding**: Readings are grouped by time intervals (default: 5 minutes)

## Need Help?

Check `MIGRATION_README.md` for:
- Detailed explanations
- Alternative timestamp strategies
- Advanced configuration
- SQL query examples
-- Total consumption records
SELECT COUNT(*) FROM gridxschema.consumption;

-- Unique meters migrated
SELECT COUNT(DISTINCT meter_profile_id) FROM gridxschema.consumption;

-- Sample data with DRN
SELECT mp.drn, c.voltage, c.current, c.active_energy, c.record_time
FROM gridxschema.consumption c
JOIN gridxschema.meter_profile mp ON c.meter_profile_id = mp.id
LIMIT 10
## After Migration

1. **Verify data**:
```sql
SELECT COUNT(*) FROM gridxschema.meter_readings;
SELECT COUNT(DISTINCT drn) FROM gridxschema.meter_readings;
```

2. **Create backups**:
```bash
pg_dump -h localhost -U postgres -d gridxdb -n gridxschema > backup.sql
```

3. **Optimize queries**: The script creates indexes automatically, but you may want to add more based on your query patterns.

---

**Ready to migrate?**
```bash
# Test first
node test_connections.js

# Then migrate
node migrate_to_postgres.js
```
