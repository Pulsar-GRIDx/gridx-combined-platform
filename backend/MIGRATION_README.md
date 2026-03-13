# MySQL to PostgreSQL Migration Script

This script migrates data from two MySQL tables (`MeteringPower` and `MeterCumulativeEnergyUsage`) into a single PostgreSQL `consumption` table with unified timestamps.

## Problem Solved

The two MySQL tables have readings at different timestamps:
- `MeteringPower`: Contains voltage, current, and apparent_power readings
- `MeterCumulativeEnergyUsage`: Contains units and active_energy readings

The script:
1. Looks up meter profile UUIDs from PostgreSQL `meter_profile` table using DRN
2. Merges MySQL data by rounding timestamps to nearest intervals (default: 5 minutes)
3. Inserts into PostgreSQL `consumption` table using UUID foreign keys

## Prerequisites

1. **Install PostgreSQL Node.js driver** (if not already installed):
```bash
npm install pg
```

2. **Environment Variables**: Make sure your `.env` file has MySQL connection details:
```
RDS_HOSTNAME=your_mysql_host
RDS_USERNAME=your_mysql_user
RDS_PASSWORD=your_mysql_password
RDS_PORT=3306
RDS_DB_NAME=your_database_name
```

3. **PostgreSQL Configuration**: Update the script if needed:
   - Default host: `localhost`
   - Default port: `5432`
   - Database: `gridxdb`
   - Schema: `gridxschema`
   - Password: `Pass@1895`
 (matching your TypeORM `Consumption` entity):

```sql
CREATE TABLE gridxschema.consumption (
    id BIGSERIAL PRIMARY KEY,
    meter_profile_id UUID NOT NULL REFERENCES meter_profile(id),
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
    
    CONSTRAINT unique_meter_profile_time UNIQUE (meter_profile_id, record_time)
);
```

**Key Points:**
- Uses `meter_profile_id` (UUID) instead of DRN string
- References the `meter_profile` table for meter information
- Single `record_time` timestamp for all readings 
    CONSTRAINT unique_drn_timestamp UNIQUE (drn, timestamp)
);
```

## How It Works

1. **Connect meter mappings** from PostgreSQL `meter_profile` table (DRN → UUID)
3. **Fetches** all data from `MeteringPower` and `MeterCumulativeEnergyUsage` tables
4. **Merges** data by:
   - Looking up meter_profile_id UUID for each DRN
   - Rounding timestamps to nearest interval (e.g., 5 minutes)
   - Creating unique key: meter_profile_id + rounded timestamp
   - Combining power and energy readings at same time bucket
5. **Skips** any DRNs not found in meter_profile table (with warning)
6. **Inserts** merged data into PostgreSQL in batches of 1000 records
7. **Inserts** merged data into PostgreSQL in batches of 1000 records
5. **Handles conflicts** by updating existing records with new data

## Usage

### Run the migration:

```bash
node migrate_to_postgres.js
```

### Customize time interval:

By default, timestamps are rounded to 5-minute intervals. To change this, modify line 146 in the script:

```javascript
const mergedData = mergeData(powerData, energyData, 10); // 10-minute intervals
```

### Batch size:

Default batch size is 1000 records. To change, modify the `insertIntoPostgres` call:

```javascript
await insertIntoPostgres(pgClient, mergedData, 500); // 500 records per batch
```

## Sample Output

```
=== Starting MySQL to PostgreSQL Migration ===

Connecting to MySQL...
✓ MySQL connected
consumption table created successfully

Fetching meter profile mappings from PostgreSQL...
✓ Retrieved 50 meter profile mappings

Fetching power data from MeteringPower...
✓ Retrieved 15000 power readings

Fetching energy data from MeterCumulativeEnergyUsage...
✓ Retrieved 14500 energy readings

Merging power and energy data...
✓ Merged into 20000 combined readings

Inserting data into PostgreSQL consumption table...
  Progress: 1000/20000 records inserted
  Progress: 2000/20000 records inserted
  ...
✓ Insert complete: 20000 successful, 0 errors

=== Migration Summary ===
Total records in PostgreSQL: 20000
Unique meters: 50
Time interval used: 5 minutes
Batch size: 1000 records
✓ Migration completed successfully! 20000
✓ Migration completed successfully!meter (by UUID):
```sql
SELECT * FROM gridxschema.consumption 
WHERE meter_profile_id = 'uuid-here' 
ORDER BY record_time DESC;
```

### Get readings with meter details (join with meter_profile):
```sql
SELECT 
  mp.drn,
  mp.meter_number,
  c.voltage,
  c.current,
  c.active_energy,
  c.units,
  c.record_time
FROM gridxschema.consumption c
JOIN gridxschema.meter_profile mp ON c.meter_profile_id = mp.id
WHERE mp.drn = 'YOUR_DRN'
ORDER BY c.record_time DESC;
```

### Get latest reading per meter:
```sql
SELECT DISTINCT ON (meter_profile_id) 
  meter_profile_id,
  voltage,
  current,
  active_energy,
  record_time
FROM gridxschema.consumption
ORDER BY meter_profile_id, record_time DESC;
```Error: "DRNs not found in meter_profile table"
- This is a warning, not a fatal error
- MySQL DRNs must exist in PostgreSQL `meter_profile` table first
- Solution: Ensure all meters are created in PostgreSQL before migration
- The script will skip unmapped DRNs and continue

### Error: "foreign key constraint"
- Meter profile IDs in consumption must reference valid meter_profile records
- Verify meter_profile table has all necessary meters
```sql
SELECT 
  mp.drn,
  mp.meter_number,
  COUNT(*) as reading_count
FROM gridxschema.consumption c
JOIN gridxschema.meter_profile mp ON c.meter_profile_id = mp.id
GROUP BY mp.id, mp.drn, mp.meter_number
ORDER BY reading_countma.meter_readings 
WHERE has_power_data = true AND has_energy_data = true;
```

### Get latest reading per DRN:
```sql
SELECT DISTINCT ON (drn) *
FROM gridxschema.meter_readings
ORDER BY drn, timestamp DESC;
```

## Troubleshooting

### Error: "relation does not exist"
- Make sure PostgreSQL schema exists: `CREATE SCHEMA IF NOT EXISTS gridxschema;`

### Error: "Connection refused"
- Check PostgreSQL is running: `pg_isready`
- Verify connection details in the script

### Error: "Out of memory"
- Reduce batch size in the script
- Consider migrating data in date ranges

### Timestamps don't match exactly
- This is expected! The script merges by rounding to 5-minute intervals
- Adjust the interval if needed for your use case

## Alternative Strategies

If you need different timestamp handling:

### 1. Exact timestamp matching only:
Modify the `mergeData` function to only include records with exact timestamp matches.

### 2. Interpolation:
For each energy reading, find the two nearest power readings and interpolate values.

### 3. Separate tables:
Keep power and energy in separate PostgreSQL tables and join them in queries.

## Notes

- The script uses `ON CONFLICT` to handle duplicate records (upsert)
- Existing data with the same DRN + timestamp will be updated, not duplicated
- The script can be run multiple times safely
- Progress is logged to console during migration
- Consider backing up your PostgreSQL database before running
