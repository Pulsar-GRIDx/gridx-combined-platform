const db = require('../config/db');
//Total meters
exports.getAllTotalMeters = function() {
  const getAllTotalMeters = `SELECT COUNT(DISTINCT DRN) as totalMeters FROM MeterProfileReal`;

  return new Promise((resolve, reject) => {
    db.query(getAllTotalMeters, (err, results) => {
      if (err) {
        console.error('Error querying the database:', err);
        reject(err); // Reject the promise with the error
      } else if (results.length === 0) {
        resolve({ totalMeters: 0 }); // Resolve the promise with 0 if no results
      } else {
        resolve(results[0]); // Resolve the promise with the first result
      }
    });
  });
};
//Total tranformers 

exports.getTotalTransformers = () =>{
  const getTotalTransformers = `SELECT COUNT(DRN) as totalTransformers FROM TransformerInformation`;

  return new Promise((resolve, reject) =>{
    db.query(getTotalTransformers,(err,results) =>{
      if (err) {
        reject(err);
        
      } else {
        resolve(results[0]);
        
      }
    });
  });
};

///-------------------------------------Active Inactive meters-----------------------------------------------------///
exports.getAllActiveAndInactiveMeters = function(callback) {
  const getTotal = `SELECT COUNT(DISTINCT DRN) as totalMeters FROM MeterProfileReal`;
  const getAllActiveAndInactiveMeters = `
      SELECT DRN, mains_state
      FROM (
          SELECT DRN, mains_state, ROW_NUMBER() OVER (PARTITION BY DRN ORDER BY date_time DESC) as rn
          FROM MeterLoadControl
          WHERE DATE(date_time) = CURDATE()
      ) t
      WHERE t.rn = 1`;

  db.query(getAllActiveAndInactiveMeters, (err, results) => {
      if (err) {
          console.log('Error querying the database:', err);
          return callback({ error: 'Database query failed', details: err });
      }

      if (results.length === 0) {
          console.log('No data found');
          return callback({ error: 'No data found' });
      }

      // Count occurrences of '0' and '1' in the 'mains_state' column
      const inactiveMetersCount = results.filter(row => row.mains_state === '0').length;
      const activeMetersCount = results.filter(row => row.mains_state === '1').length;

      // Retrieve the total count of meters
      db.query(getTotal, (err, totalResult) => {
          if (err) {
              console.log('Error querying the database:', err);
              return callback({ error: 'Database query failed', details: err });
          }
          
          const totalMeters = totalResult[0].totalMeters;

          // Calculate the count of inactive meters using the total count
          const inactiveMeters = totalMeters - activeMetersCount;

          // Pass the counts to the callback function
          callback(null, { inactiveMeters, activeMeters: activeMetersCount });
      });
  });
};


//-------------------------------------------TokenAmount Api---------------------------------------//
exports.getTokenAmount = function(currentDate, callback) {
  // Query for records where display_msg is 'Accept' and date_time is the current date
  const getCurrentData = "SELECT token_amount FROM STSTokesInfo WHERE display_msg = 'Accept' AND date_time = ?";
  // Query for all previous records
  const getPreviousData = "SELECT token_amount FROM STSTokesInfo WHERE display_msg = 'Accept' AND date_time < ?";
  // Query for the earliest date_time in the database
  const getStartDate = "SELECT MIN(date_time) as startDate FROM STSTokesInfo";

  db.query(getCurrentData, [currentDate], (err, currentData) => {
    if (err) return callback(err);
    db.query(getPreviousData, [currentDate], (err, previousData) => {
      if (err) return callback(err);
      db.query(getStartDate, [], (err, startDateResult) => {
        if (err) return callback(err);
        callback(null, { currentData, previousData, startDateResult});
      });
    });
  });
};
//-------------------------------------------------TokenCount Api-------------------------------------//
exports.getTokenCount = function(currentDate, callback) {
  const getCurrentData = "SELECT display_msg FROM STSTokesInfo WHERE display_msg = 'Accept' AND date_time = ?";
  const getPreviousData = "SELECT display_msg FROM STSTokesInfo WHERE display_msg = 'Accept' AND date_time < ?";
  const getStartDate = "SELECT MIN(date_time) as startDate FROM STSTokesInfo";

  db.query(getCurrentData, [currentDate], (err, currentData) => {
    if (err) return callback(err);
    db.query(getPreviousData, [currentDate], (err, previousData) => {
      if (err) return callback(err);
      db.query(getStartDate, [], (err, startDateResult) => {
        if (err) return callback(err);
        callback(null, { currentData, previousData, startDateResult});
      });
    });
  });
};

//-------------------------------------------------Total Energy Consumption-----------------------------//
exports.getCurrentData = () => {
  function getCurrentDate() {
    const currentDate = new Date();
    return currentDate;
  }
  
  // Example usage:
  const currentDate = getCurrentDate();
  
  
  const getCurrentData = "SELECT apparent_power, DATE(date_time) as date_time FROM MeteringPower WHERE DATE(date_time) = CURDATE()";
  return new Promise((resolve, reject) => {
    db.query(getCurrentData, [currentDate],(err, currentData) => {
      if (err) reject(err);
      else resolve(currentData);
      // console.log(currentData);
    });
  });
};

exports.getStartDate = () => {
  const getStartDate = "SELECT MIN(date_time) AS startDate FROM MeteringPower";
  
  return new Promise((resolve, reject) => {
    db.query(getStartDate, (err, startDateResult) => {
      if (err) reject(err);
      
      else resolve(startDateResult);
      
    
   
    });
  });
};

exports.getPreviousData = (startDateResult) => {
  
  const getPreviousData = "SELECT apparent_power, DATE(date_time) as date_time FROM MeteringPower WHERE DATE(date_time) >= ?";
  return new Promise((resolve, reject) => {
    db.query(getPreviousData, [startDateResult], (err, allData) => {
      if (err) reject(err);
      else resolve(allData);
      // console.log(allData);
    });
  });
};

exports.calculateTotalss = (allData) => {
  return allData.reduce((acc, record) => {
    const date = record.date_time;
    const energy = Number(record.apparent_power) / 1000 ;
    if (!acc[date]) {
      acc[date] = 0;
    }
    acc[date] += energy;
    return acc;
  }, {});
};


//-------------------------------------------------Current And last Week API-------------------------------------//
exports.getSystemCurrentWeekData = () => {
  const query = `
    SELECT DATE(date_time) as date, SUM(apparent_power) as total_apparent_power
    FROM MeteringPower
    WHERE
        WEEKDAY(date_time) BETWEEN 0 AND 6 AND
        WEEK(date_time, 1) = WEEK(CURDATE(), 1) 
    GROUP BY date
  `;

  return new Promise((resolve, reject) => {
    db.query(query, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
};

exports.getSystemLastWeekData = () => {
  const query = `
    SELECT DATE(date_time) as date, SUM(apparent_power) as total_apparent_power
    FROM MeteringPower
    WHERE
        WEEKDAY(date_time) BETWEEN 0 AND 6 AND
        WEEK(date_time, 1) = WEEK(CURDATE(), 1) - 1 
    GROUP BY date
  `;

  return new Promise((resolve, reject) => {
    db.query(query,(err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
};



exports.getSystemCurrentMonthData = () => {
  const query = `
    SELECT DATE(date_time) as date, SUM(apparent_power) as total_apparent_power
    FROM MeteringPower
    WHERE
        YEAR(date_time) = YEAR(CURDATE()) AND MONTH(date_time) = MONTH(CURDATE()) 
    GROUP BY date
  `;

  return new Promise((resolve, reject) => {
    db.query(query,(err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
};

exports.getSystemLastMonthData = () => {
  const query = `
    SELECT DATE(date_time) as date, SUM(apparent_power) as total_apparent_power
    FROM MeteringPower
    WHERE
        YEAR(date_time) = YEAR(CURDATE() - INTERVAL 1 MONTH) AND MONTH(date_time) = MONTH(CURDATE() - INTERVAL 1 MONTH) 
    GROUP BY date
  `;

  return new Promise((resolve, reject) => {
    db.query(query, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
};


exports.CalculateSystemData = (allData) => {
  return allData.reduce((acc, record) => {
    const date = record.date.toISOString().split('T')[0];
    const energy = Number(record.total_apparent_power) / 1000 ;
    acc[date] = (acc[date] || 0) + energy;
    return acc;
  }, {});
};





exports.getSystemVoltageAndCurrent = () => {
  const getVoltageAndCurrentQuery = "SELECT voltage, current, DATE(date_time) as date_time FROM MeteringPower WHERE DATE(date_time) = CURDATE()";
  // console.log(CURDATE());
  return new Promise((resolve, reject) => {
    db.query(getVoltageAndCurrentQuery, (err, current , voltage) => {
      if (err) reject(err);
      else resolve(current , voltage);
      // console.log(current,voltage);
    });
  });
};

////
exports.calculateSystemVoltageAndCurrent = (readings) => {
  if (!readings || !Array.isArray(readings) || readings.length === 0) {
    return new Error("Invalid or empty readings data");
  }

  // Initialize separate accumulators for voltage and current
  const result = readings.reduce((acc, record) => {
    const voltage = Number(record.voltage) || 0;
    const current = Number(record.current) || 0;

    // Accumulate voltage and current separately
    acc.totalVoltage = (acc.totalVoltage || 0) + voltage;
    acc.totalCurrent = (acc.totalCurrent || 0) + current;

    // Count the number of readings
    acc.count = (acc.count || 0) + 1;

    return acc;
  }, {});

  // Calculate the average voltage
  const totalVoltage = result.totalVoltage / result.count;
  const totalCurrent = (result.totalCurrent / result.count).toFixed(2);

  return {
    totalVoltage,
    totalCurrent:parseFloat(totalCurrent),
  };
};


exports.getStartDate = () => {
  const getStartDate = "SELECT MIN(date_time) AS startDate FROM MeteringPower";
  
  return new Promise((resolve, reject) => {
    db.query(getStartDate, (err, startDateResult) => {
      if (err) reject(err);
      
      else resolve(startDateResult);
      console.log(startDateResult);
      
    
   
    });
  });
};

//------------------------------------------------CurrentDayActiveEnergy----------------------------------------------------------------------//

exports.getCurrentDayData = () => {
  const getCurrentDayData = `
  SELECT 
  t.DRN, 
  t.final_units - t.initial_units as power_consumption
FROM (
  SELECT 
    DRN, 
    date_time, 
    MIN(CAST(units AS DECIMAL(10, 2))) as initial_units,
    MAX(CAST(units AS DECIMAL(10, 2))) as final_units,
    ROW_NUMBER() OVER (PARTITION BY DRN ORDER BY date_time DESC) as rn
  FROM 
  MeterCumulativeEnergyUsage
  WHERE 
    DATE(date_time) = CURDATE() AND 
    HOUR(date_time) = HOUR(NOW())
  GROUP BY 
    DRN, 
    HOUR(date_time)
) t
WHERE 
  t.rn = 1

  `;
  
  return new Promise((resolve, reject) => {
    db.query(getCurrentDayData, (err, currentDayData) => {
      if (err) reject(err);
      else resolve(currentDayData);
    });
  });
};

//----------------------------------------------InsertMeterData---------------------------------------------------------------------------//
exports.insertIntoMeterRealInfo = (data) => {
  const meterRealInfoData = {
    DRN: data.DRN,
    Surname: data.Surname,
    Name: data.Name,
    City: data.City,
    Streetname: data.Streetname,
    Housenumber: data.Housenumber,
    Simnumber: data.Simnumber,
    Usercategory: data.Usercategory,
    TransformerDRN: data.TransformerDRN,
  };

  return new Promise((resolve, reject) => {
    // Step 1: Insert into MeterProfileReal
    db.query('INSERT INTO MeterProfileReal SET ?', meterRealInfoData, (err) => {
      if (err) return reject(err);

      // Step 2: Get transformer's coordinates
      db.query(
        'SELECT plat, plng FROM TransformerInformation WHERE DRN = ?',
        [data.TransformerDRN],
        (err, transformerResults) => {
          if (err) return reject(err);
          if (transformerResults.length === 0) {
            return reject(new Error(`Transformer with DRN ${data.TransformerDRN} not found`));
          }

          const transformerCoords = transformerResults[0];

          // Step 3: Insert into MeterLocationInfoTable
          const meterLocationData = {
            DRN: data.DRN,
            Longitude: data.Meterlng,       // Meter's longitude
            Lat: data.Meterlat,             // Meter's latitude
            plat: transformerCoords.plat,   // Transformer's latitude
            plng: transformerCoords.plng,   // Transformer's longitude
            Suburb: data.Suburb,
            LocationName: meterRealInfoData.City,
            PowerSupply: "Transformer",
            Type: "Meter",
            Status: 1,
          };

          db.query('INSERT INTO MeterLocationInfoTable SET ?', meterLocationData, (err) => {
            if (err) return reject(err);
            resolve(); // success
          });
        }
      );
    });
  });
};


exports.insertIntoAnotherTable = (data) => {
  const anotherTableData = {
    DRN: data.DRN,
    Longitude: data.Meterlng,
    Lat: data.Meterlat,
    pLng: data.Transformerlng,
    pLat: data.Transformerlat,
    PowerSupply: data.TransformerDRN,
    Type: data.Usercategory,
    Suburb: data.Suburb,
  };
  return new Promise((resolve, reject) => {
    db.query('INSERT INTO MeterLocationInfoTable SET ?', anotherTableData, (err) => {
      if (err) reject(err);
      else resolve();
    });
    
  });
};



//------------------------------------------------------totalEnergyPerSuberb--------------------------------------------------------//
exports.getDrnsBySuburb = (suburbs) => {
  const getDrnsBySuburb = 'SELECT DRN FROM MeterLocations WHERE Suburb = ?';
  return new Promise((resolve, reject) => {
    db.query(getDrnsBySuburb, [suburbs], (err, DRN) => {
      if (err) reject(err);
      else resolve(DRN.map(record => record.DRN));
     
    });
  });
};

exports.getEnergyByDrn = (suburb, drn) => {
  const getEnergyByDrn = 'SELECT apparent_power FROM MeterEnergyUsageSummary WHERE DRN = ? AND DATE(date_time) = DATE(NOW()) ORDER BY date_time DESC LIMIT 1';
  return new Promise((resolve, reject) => {
    db.query(getEnergyByDrn, [drn], (err, energyData) => {
      if (err) reject(err);
      else {
        console.log(`Query results for DRN ${drn} in suburb ${suburb}:`, energyData);
        if (energyData.length > 0) {
          console.log('apparent_power:', energyData[0].apparent_power);
        }
        resolve(energyData) / 1000;
      }
    });
  });
};


//-------------------------------------------------------------GetSpecificMeterWeeklyAndMonthlyData------------------------------------------------//

exports.getCurrentWeekData = (DRN) => {
  const query = `
  WITH daily_last AS (
    SELECT d, ae FROM (
      SELECT 
        DATE(date_time) AS d,
        CAST(active_energy AS DECIMAL(10,2)) AS ae,
        ROW_NUMBER() OVER (PARTITION BY DATE(date_time) ORDER BY date_time DESC) AS rn
      FROM MeterCumulativeEnergyUsage
      WHERE DRN = ? 
        AND DATE(date_time) BETWEEN DATE_SUB(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), INTERVAL 1 DAY)
                                 AND DATE_ADD(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), INTERVAL 6 DAY)
    ) t WHERE rn = 1
  ),
  with_diff AS (
    SELECT d, ae, LAG(ae) OVER (ORDER BY d) AS prev_ae FROM daily_last
  )
  SELECT d AS date, COALESCE((ae - prev_ae) / 1000, 0) AS total_energy_consumption
  FROM with_diff
  WHERE d >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)
  ORDER BY d
  `;
  


  return new Promise((resolve, reject) => {
    db.query(query, [DRN],(err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
};

exports.getLastWeekData = (DRN) => {
  const query = `
  WITH bounds AS (
    SELECT 
      DATE_SUB(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), INTERVAL 7 DAY) AS week_start,
      DATE_SUB(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), INTERVAL 1 DAY) AS week_end
  ), daily_last AS (
    SELECT d, ae FROM (
      SELECT 
        DATE(m.date_time) AS d,
        CAST(m.active_energy AS DECIMAL(10,2)) AS ae,
        ROW_NUMBER() OVER (PARTITION BY DATE(m.date_time) ORDER BY m.date_time DESC) AS rn
      FROM MeterCumulativeEnergyUsage m, bounds b
      WHERE m.DRN = ? 
        AND DATE(m.date_time) BETWEEN DATE_SUB(b.week_start, INTERVAL 1 DAY) AND b.week_end
    ) t WHERE rn = 1
  ), with_diff AS (
    SELECT d, ae, LAG(ae) OVER (ORDER BY d) AS prev_ae FROM daily_last
  )
  SELECT d AS date, COALESCE((ae - prev_ae) / 1000, 0) AS total_energy_consumption
  FROM with_diff, bounds b
  WHERE d >= b.week_start AND d <= b.week_end
  ORDER BY d
  `;


  return new Promise((resolve, reject) => {
    db.query(query, [DRN],(err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
};

//DRN CurrentMonth and LastMonth

exports.getCurrentMonthData = (DRN) => {
  const query = `
  SELECT 
    'current_month' as period,
    (
      (SELECT CAST(active_energy AS DECIMAL(10, 2)) 
       FROM MeterCumulativeEnergyUsage 
       WHERE DRN = ? AND YEAR(date_time) = YEAR(CURDATE()) AND MONTH(date_time) = MONTH(CURDATE())
       ORDER BY date_time DESC LIMIT 1) 
      - 
      (SELECT CAST(active_energy AS DECIMAL(10, 2)) 
       FROM MeterCumulativeEnergyUsage 
       WHERE DRN = ? AND YEAR(date_time) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) AND MONTH(date_time) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))
       ORDER BY date_time DESC LIMIT 1)
    ) / 1000 as total_energy_consumption
  `;
  

  return new Promise((resolve, reject) => {
    db.query(query, [DRN, DRN],(err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
};

exports.getLastMonthData = (DRN) => {
  const query = `
  SELECT 
    'last_month' as period,
    (
      (SELECT CAST(active_energy AS DECIMAL(10, 2)) 
       FROM MeterCumulativeEnergyUsage 
       WHERE DRN = ? AND YEAR(date_time) = YEAR(CURDATE() - INTERVAL 1 MONTH) AND MONTH(date_time) = MONTH(CURDATE() - INTERVAL 1 MONTH)
       ORDER BY date_time DESC LIMIT 1) 
      - 
      (SELECT CAST(active_energy AS DECIMAL(10, 2)) 
       FROM MeterCumulativeEnergyUsage 
       WHERE DRN = ? AND YEAR(date_time) = YEAR(CURDATE() - INTERVAL 2 MONTH) AND MONTH(date_time) = MONTH(CURDATE() - INTERVAL 2 MONTH)
       ORDER BY date_time DESC LIMIT 1)
    ) / 1000 as total_energy_consumption
  `;


  return new Promise((resolve, reject) => {
    db.query(query, [DRN, DRN],(err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
};

//DRN CurrentYear and LastYear

exports.getCurrentYearData = (DRN) => {
  const query = `
  WITH last_per_month AS (
    SELECT 
      YEAR(date_time) AS y,
      MONTH(date_time) AS m,
      CAST(active_energy AS DECIMAL(10,2)) AS ae,
      ROW_NUMBER() OVER (PARTITION BY YEAR(date_time), MONTH(date_time) ORDER BY date_time DESC) AS rn
    FROM MeterCumulativeEnergyUsage
    WHERE DRN = ? AND YEAR(date_time) = YEAR(CURDATE())
  ), months AS (
    SELECT y, m, ae,
           LAG(ae) OVER (ORDER BY y, m) AS prev_ae
    FROM last_per_month
    WHERE rn = 1
  )
  SELECT m AS month, COALESCE((ae - prev_ae) / 1000, 0) AS total_energy_consumption
  FROM months
  ORDER BY m
  `;
  
  return new Promise((resolve, reject) => {
    db.query(query, [DRN], (err, data) => {
      if (err) {
        reject(err);
      } else {
        // Initialize array with 12 months (0 values)
        const monthlyData = Array(12).fill(0);
        
        // Fill the array with actual data
        data.forEach(row => {
          const monthIndex = row.month - 1; // Convert to 0-based index (Jan=0, Dec=11)
          monthlyData[monthIndex] = parseFloat(row.total_energy_consumption) || 0;
        });
        
        resolve(monthlyData);
      }
    });
  });
};

exports.getLastYearData = (DRN) => {
  const query = `
  WITH last_per_month AS (
    SELECT 
      YEAR(date_time) AS y,
      MONTH(date_time) AS m,
      CAST(active_energy AS DECIMAL(10,2)) AS ae,
      ROW_NUMBER() OVER (PARTITION BY YEAR(date_time), MONTH(date_time) ORDER BY date_time DESC) AS rn
    FROM MeterCumulativeEnergyUsage
    WHERE DRN = ? AND YEAR(date_time) = YEAR(CURDATE()) - 1
  ), months AS (
    SELECT y, m, ae,
           LAG(ae) OVER (ORDER BY y, m) AS prev_ae
    FROM last_per_month
    WHERE rn = 1
  )
  SELECT m AS month, COALESCE((ae - prev_ae) / 1000, 0) AS total_energy_consumption
  FROM months
  ORDER BY m
  `;

  return new Promise((resolve, reject) => {
    db.query(query, [DRN], (err, data) => {
      if (err) {
        reject(err);
      } else {
        // Initialize array with 12 months (0 values)
        const monthlyData = Array(12).fill(0);
        
        // Fill the array with actual data
        data.forEach(row => {
          const monthIndex = row.month - 1; // Convert to 0-based index (Jan=0, Dec=11)
          monthlyData[monthIndex] = parseFloat(row.total_energy_consumption) || 0;
        });
        
        resolve(monthlyData);
      }
    });
  });
};


exports.CalculateDrnData = (allData) => {
  return allData.reduce((acc, record) => {
    const date = record.date.toISOString().split('T')[0];
    const energy = Number(record.total_energy_consumption) ;
    acc[date] = (acc[date] || 0) + energy;
    return acc;
  }, {});
};




exports.getDRNVoltageAndCurrent = (DRN) => {
  const getVoltageAndCurrentQuery = "SELECT voltage, current, DATE(date_time) as date_time FROM MeteringPower WHERE DATE(date_time) = CURDATE() AND DRN = ?";
  // console.log(CURDATE());
  return new Promise((resolve, reject) => {
    db.query(getVoltageAndCurrentQuery, [DRN],(err, current , voltage) => {
      if (err) reject(err);
      else resolve(current , voltage);
      // console.log(current,voltage);
    });
  });
};



////////

exports.calculateDRNVoltageAndCurrent = (readings) => {
  if (!readings || !Array.isArray(readings) || readings.length === 0) {
    return new Error("Invalid or empty readings data");
  }

  // Initialize separate accumulators for voltage and current
  const result = readings.reduce((acc, record) => {
    const voltage = Number(record.voltage) || 0;
    const current = Number(record.current) || 0;
   
    // Accumulate voltage and current separately
    acc.totalVoltage = (acc.totalVoltage || 0) + voltage;
    acc.totalCurrent = (acc.totalCurrent || 0) + current;

    // Count the number of readings
    acc.count = (acc.count || 0) + 1;

    return acc;
  }, {});

  // Calculate the average voltage and current
  const averageVoltage = result.totalVoltage / result.count;
  const averageCurrent = result.totalCurrent / result.count;
  
  // Return the average values
  return {
    totalVoltage: averageVoltage,
    totalCurrent: parseFloat(averageCurrent.toFixed(2)) // Convert to float and round to 2 decimal places
  };
};


////


exports.getDailyMeterEnergyByDRN = (DRN) => {
  const getMetaData = `
    SELECT 
      (MAX(CAST(units AS DECIMAL(10, 2))) - MIN(CAST(units AS DECIMAL(10, 2)))) AS power_consumption
    FROM 
      MeterCumulativeEnergyUsage
    WHERE 
      DRN = ? AND 
      DATE(date_time) = CURDATE()
  `;

  return new Promise((resolve, reject) => {
    db.query(getMetaData, [DRN], (err, power_consumption) => {
      if (err) reject(err);
      else resolve(power_consumption);
      
    });
  });
};


exports.getDRNStartDate = (DRN) => {
  const getStartDate = "SELECT MIN(date_time) AS startDate FROM MeteringPower WHERE DRN = ?";
  
  return new Promise((resolve, reject) => {
    db.query(getStartDate, [DRN],(err, startDateResult) => {
      if (err) reject(err);
      
      else resolve(startDateResult);
      
    
   
    });
  });
};

//---------------------------------------------------SystemProccessedTokens -----------------------------------//
exports.getAllProcessedTokens =(DRN) =>{
  const getAllProcessedTokens = "SELECT token_id ,date_time ,token_amount FROM STSTokesInfo WHERE DRN  = ? AND display_msg = 'Accept' ";
  return new Promise((resolve ,reject) =>{
    db.query(getAllProcessedTokens, [DRN],(err,processedTokens)=>{
      if(err) reject(err);
      else resolve(processedTokens);
      // console.log(processedTokens);

    });
  });
};


//-------------------------------------Inserting New Transformer --------------------------------//
exports.insertIntoTransformerRealInfo = (TransformerData) => {
  const transformerRealInfoData = {
    DRN:TransformerData.DRN,
    LocationName:TransformerData.LocationName,
    Name:TransformerData.Name,
    Type:TransformerData.Type,
    pLat:TransformerData.pLat,
    pLng:TransformerData.pLng,
    Status:TransformerData.Status,
    PowerSupply:TransformerData.PowerSupply,
    powerRating:TransformerData.powerRating,
    city:TransformerData.City
  };
  return new Promise((resolve, reject) => {
    db.query('INSERT INTO TransformerInformation SET ?', transformerRealInfoData, (err) => {
      if (err) reject(err);
      else resolve();
    });
    
  });
};


// Grid Topology

// Function to get active power
exports.getGridTopologyActivePower = (meterDRN) => {
  // console.log(meterDRN);
  return new Promise((resolve, reject) => {
    const getActiveEnergy = `SELECT apparent_power FROM MeteringPower WHERE DATE(date_time) = CURDATE() AND DRN = ? ORDER BY date_time DESC LIMIT 1
  `;

    db.query(getActiveEnergy, [meterDRN], (err, results) => {
      if (err) {
        reject(err);
      } else {
        // Convert active energy to numerical type
        const numericActiveEnergy = results.map(result => parseFloat(result.apparent_power / 1000)) ;
        resolve(numericActiveEnergy[0]); // Assuming there's only one result per meter DRN
      }
    });
  });
};

// Function to fetch DRNs
exports.fetchDRNs = async (city) => {
  return new Promise((resolve, reject) => {
    const transformerQuery = `
      SELECT TI.LocationName, TI.Name AS TransformerName, TI.DRN AS TransformerDRN
      FROM TransformerInformation TI
      WHERE TI.city = ?
    `;
    db.query(transformerQuery, [city], async (error, transformers) => {
      if (error) {
        reject(error);
      } else {
        try {
          const data = {};
          for (const transformer of transformers) {
            const locationName = transformer.LocationName;
            const transformerName = transformer.TransformerName;
            const transformerDRN = transformer.TransformerDRN;

            // Initialize structure
            if (!data.hasOwnProperty(locationName)) {
              data[locationName] = { transformers: {}, active_energy: 0 };
            }
            if (!data[locationName].transformers.hasOwnProperty(transformerName)) {
              data[locationName].transformers[transformerName] = { meters: [], active_energy: 0 };
            }

            // Fetch all meter DRNs linked to this transformer
            const meterDRNs = await new Promise((res, rej) => {
              db.query(
                'SELECT DRN FROM MeterProfileReal WHERE TransformerDRN = ?',
                [transformerDRN],
                (err, meterRows) => {
                  if (err) rej(err);
                  else res(meterRows.map(row => row.DRN));
                }
              );
            });

            for (const meterDRN of meterDRNs) {
              let activeEnergy = await exports.getGridTopologyActivePower(meterDRN);
              activeEnergy = isNaN(activeEnergy) ? 0 : activeEnergy;

              // Update active energy for meters, transformers, and location
              const meterData = { DRN: meterDRN, active_energy: activeEnergy };
              data[locationName].transformers[transformerName].meters.push(meterData);
              data[locationName].transformers[transformerName].active_energy += activeEnergy;
              data[locationName].active_energy += activeEnergy;
            }
          }
          resolve(data);
        } catch (err) {
          reject(err);
        }
      }
    });
  });
};


//-----------------------------------------All time periods -------------------------------------------------------------------//
exports.getEnergyData = () => {
  const getCurrentDayData = `
    WITH today_last AS (
      SELECT DRN, ae FROM (
        SELECT 
          DRN,
          CAST(active_energy AS DECIMAL(13,3)) AS ae,
          ROW_NUMBER() OVER (PARTITION BY DRN ORDER BY date_time DESC) AS rn
        FROM MeterCumulativeEnergyUsage
        WHERE date_time >= CURDATE() AND date_time < CURDATE() + INTERVAL 1 DAY
      ) t WHERE rn = 1
    ), prev_before_today AS (
      SELECT m.DRN, CAST(m.active_energy AS DECIMAL(13,3)) AS prev_ae
      FROM MeterCumulativeEnergyUsage m
      JOIN (
        SELECT DRN, MAX(date_time) AS prev_ts
        FROM MeterCumulativeEnergyUsage
        WHERE date_time < CURDATE()
        GROUP BY DRN
      ) lb ON lb.DRN = m.DRN AND m.date_time = lb.prev_ts
    )
    SELECT COALESCE(SUM(GREATEST(tl.ae - COALESCE(pbt.prev_ae, 0), 0)) / 1000, 0) AS total_energy
    FROM today_last tl
    LEFT JOIN prev_before_today pbt ON pbt.DRN = tl.DRN;
  `;

  const getCurrentMonthData = `
    WITH params AS (
      SELECT 
        STR_TO_DATE(DATE_FORMAT(CURDATE(), '%Y-%m-01'), '%Y-%m-%d') AS first_day,
        LAST_DAY(CURDATE()) AS last_day
    ), month_last AS (
      SELECT DRN, ae FROM (
        SELECT 
          m.DRN,
          CAST(m.active_energy AS DECIMAL(13,3)) AS ae,
          ROW_NUMBER() OVER (PARTITION BY m.DRN ORDER BY m.date_time DESC) AS rn
        FROM MeterCumulativeEnergyUsage m, params p
        WHERE m.date_time >= p.first_day AND m.date_time < p.last_day + INTERVAL 1 DAY
      ) t WHERE rn = 1
    ), prev_before_month AS (
      SELECT m.DRN, CAST(m.active_energy AS DECIMAL(13,3)) AS prev_ae
      FROM MeterCumulativeEnergyUsage m
      JOIN (
        SELECT DRN, MAX(date_time) AS prev_ts
        FROM MeterCumulativeEnergyUsage, params p2
        WHERE date_time < p2.first_day
        GROUP BY DRN
      ) lb ON lb.DRN = m.DRN AND m.date_time = lb.prev_ts
    )
    SELECT COALESCE(SUM(GREATEST(ml.ae - COALESCE(pbm.prev_ae, 0), 0)) / 1000, 0) AS total_energy
    FROM month_last ml
    LEFT JOIN prev_before_month pbm ON pbm.DRN = ml.DRN;
  `;

  const getCurrentYearData = `
    WITH params AS (
      SELECT 
        STR_TO_DATE(CONCAT(YEAR(CURDATE()), '-01-01'), '%Y-%m-%d') AS y_start,
        CURDATE() + INTERVAL 1 DAY AS y_end
    ), year_last AS (
      SELECT DRN, ae FROM (
        SELECT 
          m.DRN,
          CAST(m.active_energy AS DECIMAL(13,3)) AS ae,
          ROW_NUMBER() OVER (PARTITION BY m.DRN ORDER BY m.date_time DESC) AS rn
        FROM MeterCumulativeEnergyUsage m, params p
        WHERE m.date_time >= p.y_start AND m.date_time < p.y_end
      ) t WHERE rn = 1
    ), prev_before_year AS (
      SELECT m.DRN, CAST(m.active_energy AS DECIMAL(13,3)) AS prev_ae
      FROM MeterCumulativeEnergyUsage m
      JOIN (
        SELECT DRN, MAX(date_time) AS prev_ts
        FROM MeterCumulativeEnergyUsage, params p2
        WHERE date_time < p2.y_start
        GROUP BY DRN
      ) lb ON lb.DRN = m.DRN AND m.date_time = lb.prev_ts
    )
    SELECT COALESCE(SUM(GREATEST(yl.ae - COALESCE(pby.prev_ae, 0), 0)) / 1000, 0) AS total_energy
    FROM year_last yl
    LEFT JOIN prev_before_year pby ON pby.DRN = yl.DRN;
  `;

  return new Promise((resolve, reject) => {
    db.query(getCurrentDayData, (err, currentDayData) => {
      if (err) reject(err);
      else {
        const dayEnergy = currentDayData.length > 0 ? parseFloat(currentDayData[0].total_energy || 0) : 0;

        db.query(getCurrentMonthData, (err, currentMonthData) => {
          if (err) reject(err);
          else {
            const monthEnergy = currentMonthData.length > 0 ? parseFloat(currentMonthData[0].total_energy || 0) : 0;

            db.query(getCurrentYearData, (err, currentYearData) => {
              if (err) reject(err);
              else {
                const yearEnergy = currentYearData.length > 0 ? parseFloat(currentYearData[0].total_energy || 0) : 0;

                resolve({ day: dayEnergy, month: monthEnergy, year: yearEnergy });
              }
            });
          }
        });
      }
    });
  });
};


//----------------------------------------CurrentAnd Last year energy for all the months---------------------------------------//
exports.getMonthlyDataForCurrentAndLastYear = () => {
  const getMonthlyDataForCurrentAndLastYear = `
  WITH last_per_month AS (
    -- Last reading per DRN per month for current and last year only
    SELECT 
      YEAR(m.date_time) AS y,
      MONTH(m.date_time) AS m,
      m.DRN,
      CAST(m.active_energy AS DECIMAL(13,3)) AS ae,
      ROW_NUMBER() OVER (
        PARTITION BY m.DRN, YEAR(m.date_time), MONTH(m.date_time)
        ORDER BY m.date_time DESC
      ) AS rn
    FROM MeterCumulativeEnergyUsage m
    WHERE YEAR(m.date_time) IN (YEAR(CURDATE()), YEAR(CURDATE()) - 1)
  ), monthly_last AS (
    SELECT y, m, DRN, ae FROM last_per_month WHERE rn = 1
  ), per_drn_usage AS (
    -- For each DRN-month, first try immediate previous month, if not exists then last reading before current month
    SELECT 
      cur.y,
      cur.m,
      cur.DRN,
      GREATEST(
        cur.ae - COALESCE(
          -- First try to get previous month's last reading
          prev.ae,
          -- If previous month doesn't exist, get last reading before current month
          (SELECT CAST(m2.active_energy AS DECIMAL(13,3))
           FROM MeterCumulativeEnergyUsage m2
           WHERE m2.DRN = cur.DRN
             AND m2.date_time < STR_TO_DATE(CONCAT(cur.y, '-', LPAD(cur.m, 2, '0'), '-01'), '%Y-%m-%d')
           ORDER BY m2.date_time DESC
           LIMIT 1),
          0
        ),
        0
      ) AS usage_wh
    FROM monthly_last cur
    LEFT JOIN monthly_last prev
      ON prev.DRN = cur.DRN
     AND prev.y = CASE WHEN cur.m = 1 THEN cur.y - 1 ELSE cur.y END
     AND prev.m = CASE WHEN cur.m = 1 THEN 12 ELSE cur.m - 1 END
  )
  SELECT 
    y AS year,
    m AS month,
    SUM(usage_wh) / 1000 AS total_apparent_power
  FROM per_drn_usage
  GROUP BY y, m
  ORDER BY y, m;

  `;
  return new Promise((resolve, reject) => {
    db.query(getMonthlyDataForCurrentAndLastYear,
       (err, monthlyData) => {
      if (err) reject(err);
      else resolve(monthlyData);
    });
  });
};


//----------------------------------------CurrentAndLastWeek With the day starting on Monday --------------------------------------------------------------//
exports.getWeeklyDataForCurrentAndLastWeek = () => {
  const getWeeklyDataForCurrentAndLastWeek = `
  WITH params AS (
    SELECT DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY) AS mon0
  ), bounds AS (
    SELECT 
      DATE_SUB(mon0, INTERVAL 7 DAY) AS mon_last,   -- Monday last week
      DATE_ADD(mon0, INTERVAL 6 DAY) AS sun_cur,    -- Sunday this week
      DATE_SUB(mon0, INTERVAL 1 DAY) AS sun_last,   -- Sunday last week
      DATE_SUB(mon0, INTERVAL 1 DAY) AS prev_seed,  -- seed day for last week's Monday
      DATE_SUB(mon0, INTERVAL 1 DAY) AS end_prev,
      mon0 AS mon_cur
    FROM params
  ), daily_last AS (
    -- Last reading per DRN per day spanning [mon_last - 1, sun_cur]
    SELECT DRN, d, ae FROM (
      SELECT 
        m.DRN,
        DATE(m.date_time) AS d,
        CAST(m.active_energy AS DECIMAL(13,3)) AS ae,
        ROW_NUMBER() OVER (
          PARTITION BY m.DRN, DATE(m.date_time)
          ORDER BY m.date_time DESC
        ) AS rn
      FROM MeterCumulativeEnergyUsage m
      JOIN bounds b
      WHERE DATE(m.date_time) BETWEEN DATE_SUB(b.mon_last, INTERVAL 1 DAY) AND b.sun_cur
    ) x WHERE rn = 1
  ), diffs AS (
    -- Per DRN day-over-day difference using previous day's last reading
    SELECT 
      dl.DRN,
      dl.d,
      dl.ae,
      LAG(dl.ae) OVER (PARTITION BY dl.DRN ORDER BY dl.d) AS prev_ae
    FROM daily_last dl
  ), per_day AS (
    SELECT d, SUM(GREATEST(ae - prev_ae, 0)) / 1000 AS total_apparent_power
    FROM diffs
    WHERE prev_ae IS NOT NULL
    GROUP BY d
  )
  SELECT 
    YEAR(d) AS year,
    WEEK(d, 1) AS week,
    DAYNAME(d) AS day,
    d AS date,
    total_apparent_power
  FROM per_day, bounds b
  WHERE d BETWEEN b.mon_last AND b.sun_cur
  ORDER BY d;
  `;
  return new Promise((resolve, reject) => {
    db.query(getWeeklyDataForCurrentAndLastWeek,
       (err, weeklyData) => {
      if (err) reject(err);
      else resolve(weeklyData);
    });
  });
};


//Get hourly power consumption
exports.getApparentPowerSum = function(callback) {
  // For each DRN-hour today, compute consumption. If only 1 reading in the hour,
  // use (current_reading - last prior reading for that DRN). Otherwise, use (max - min).
  const query = `
      WITH last_before_today AS (
      SELECT DRN, MAX(date_time) AS prev_ts
      FROM MeterCumulativeEnergyUsage
      WHERE date_time < CURDATE()
      GROUP BY DRN
    ),
    seed AS (
      -- 1) bring in the last reading before today (per DRN)
      SELECT m.DRN, m.date_time, CAST(m.active_energy AS DECIMAL(13,3)) AS energy
      FROM MeterCumulativeEnergyUsage m
      JOIN last_before_today lb
        ON lb.DRN = m.DRN AND m.date_time = lb.prev_ts
      UNION ALL
      -- 2) plus all of today's readings
      SELECT DRN, date_time, CAST(active_energy AS DECIMAL(13,3)) AS energy
      FROM MeterCumulativeEnergyUsage
      WHERE date_time >= CURDATE()
        AND date_time <  CURDATE() + INTERVAL 1 DAY
    ),
    diffs AS (
      SELECT
        DRN,
        date_time,
        energy,
        LAG(energy) OVER (PARTITION BY DRN ORDER BY date_time) AS prev_energy
      FROM seed
    )
    SELECT
      HOUR(date_time) AS hr,
      -- If active_energy is Wh keep /1000; if it's already kWh, remove /1000
      SUM(GREATEST(energy - prev_energy, 0)) / 1000 AS kwh
    FROM diffs
    WHERE prev_energy IS NOT NULL          -- skip the seeded first row per DRN
      AND date_time >= CURDATE()          -- only diffs that end today
      AND date_time <  CURDATE() + INTERVAL 1 DAY
    GROUP BY hr
    ORDER BY hr;
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.log('Error querying the database:', err);
      return callback({ error: 'Database query failed', details: err });
    }

    // Initialize sums array with 24 zeros
    const sums = new Array(24).fill(0);
    results.forEach(row => {
      const hourIndex = Number(row.hr);
      const kwh = parseFloat(row.kwh);
      if (!Number.isNaN(hourIndex) && hourIndex >= 0 && hourIndex <= 23) {
        const val = Number.isFinite(kwh) ? parseFloat(kwh.toFixed(2)) : 0;
        sums[hourIndex] = val;
      }
    });
    callback(null, { sums });
  });
}

//Current hour avarage voltage and current totals
exports.getAverageCurrentAndVoltage = function(callback) {
  const query = `
      SELECT AVG(current) as avg_current, AVG(voltage) as avg_voltage
      FROM (
          SELECT DRN, current, voltage, date_time, ROW_NUMBER() OVER (PARTITION BY DRN ORDER BY date_time DESC) as rn
          FROM MeteringPower
          WHERE DATE(date_time) = CURDATE() AND HOUR(date_time) = HOUR(NOW())
      ) t
      WHERE t.rn = 1
  `;
  db.query(query, (err, results) => {
      if (err) {
          console.log('Error Querying the database:', err);
          return callback({ error: 'Database query failed', details: err });
      }

  if (results.length === 0) {
          console.log('No data found');
          return callback(null, { avg_current: 0, avg_voltage: 0 });
      }

      const avg_current = results[0].avg_current;
      const avg_voltage = results[0].avg_voltage;
      callback(null, { avg_current, avg_voltage });
  });
}



//Hourly energy
exports.getSumApparentPower = function(callback) {
  const query = `
      SELECT SUM(apparent_power) as sum
      FROM (
          SELECT DRN, apparent_power, date_time, ROW_NUMBER() OVER (PARTITION BY DRN ORDER BY date_time DESC) as rn
          FROM MeteringPower
          WHERE DATE(date_time) = CURDATE() AND HOUR(date_time) = HOUR(NOW())
      ) t
      WHERE t.rn = 1
  `;
  db.query(query, (err, results) => {
      if (err) {
          console.log('Error Querying the database:', err);
          return callback({ error: 'Database query failed', details: err });
      }

      if (results === 0){
        console.log('No data found');
        return callback(null, {sum: 0});
      }

     
      

      // Calculate the sum divided by 1000 and round to two decimal places
        const sum = (results[0].sum / 1000).toFixed(2);
      callback(0, { sum });
  });
}

//Suburb Apparent Power Time Periods
exports.getApparentPowerByTimePeriodsBySuburb = function(suburbs, callback) {
  const query = `
    SELECT 
      COALESCE(SUM(IF(DATE(record_date) = CURDATE(), final_units - initial_units, 0)), 0) as currentDayTotal,
      COALESCE(SUM(IF(MONTH(record_date) = MONTH(CURDATE()) AND YEAR(record_date) = YEAR(CURDATE()), final_units - initial_units, 0)), 0) as currentMonthTotal,
      COALESCE(SUM(IF(YEAR(record_date) = YEAR(CURDATE()), final_units - initial_units, 0)), 0) as currentYearTotal
    FROM (
      SELECT 
        DRN,
        DATE(date_time) as record_date,
        MIN(CAST(units AS DECIMAL)) as initial_units,
        MAX(CAST(units AS DECIMAL)) as final_units
      FROM 
        MeterCumulativeEnergyUsage
      WHERE 
        YEAR(date_time) IN (YEAR(CURDATE()), YEAR(CURDATE()) - 1)
      GROUP BY 
        DRN, 
        DATE(date_time)
    ) t
    WHERE t.DRN IN (
        SELECT DRN
        FROM MeterLocationInfoTable
        WHERE Suburb IN (?)
    )
  `;

  db.query(query, [suburbs], (err, results) => {
    if (err) {
      console.error('Error querying the database:', err);
      return callback({ error: 'Database query failed', details: err });
    }

    const { currentDayTotal, currentMonthTotal, currentYearTotal } = results[0];

    callback(null, {
      currentDayTotal: currentDayTotal || 0,
      currentMonthTotal: currentMonthTotal || 0,
      currentYearTotal: currentYearTotal || 0
    });
  });
}



//Weekly Suburb Apparent Power
exports.getWeeklyApparentPowerBySuburb = function(suburbs, callback) {
  console.log(suburbs);

  const query = `
    WITH params AS (
      SELECT DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY) AS mon0
    ), bounds AS (
      SELECT 
        DATE_SUB(mon0, INTERVAL 8 DAY) AS start_inclusive, -- Sunday two weeks ago
        DATE_ADD(mon0, INTERVAL 6 DAY) AS end_inclusive,   -- Sunday this week
        DATE_SUB(mon0, INTERVAL 7 DAY) AS mon_last,
        DATE_SUB(mon0, INTERVAL 1 DAY) AS sun_last,
        mon0 AS mon_cur,
        DATE_ADD(mon0, INTERVAL 6 DAY) AS sun_cur
      FROM params
    ), subs AS (
      SELECT DISTINCT DRN FROM MeterLocationInfoTable WHERE Suburb IN (?)
    ), daily_last AS (
      SELECT DRN, d, u FROM (
        SELECT 
          m.DRN,
          DATE(m.date_time) AS d,
          CAST(m.units AS DECIMAL(10,2)) AS u,
          ROW_NUMBER() OVER (PARTITION BY m.DRN, DATE(m.date_time) ORDER BY m.date_time DESC) AS rn
        FROM MeterCumulativeEnergyUsage m
        JOIN subs s ON s.DRN = m.DRN
        JOIN bounds b
        WHERE DATE(m.date_time) BETWEEN b.start_inclusive AND b.end_inclusive
      ) x WHERE rn = 1
    ), diffs AS (
      SELECT 
        dl.DRN,
        dl.d,
        dl.u,
        LAG(dl.u) OVER (PARTITION BY dl.DRN ORDER BY dl.d) AS prev_u
      FROM daily_last dl
    ), per_day AS (
      SELECT d, GREATEST(u - prev_u, 0) AS day_consumption FROM diffs
    ), bounds2 AS (SELECT * FROM bounds)
    SELECT 
      CASE WHEN DAYOFWEEK(p.d) = 1 THEN 7 ELSE DAYOFWEEK(p.d) - 1 END AS dayOfWeek,
      SUM(CASE WHEN p.d BETWEEN b.mon_cur AND b.sun_cur THEN day_consumption ELSE 0 END) AS currentWeekTotal,
      SUM(CASE WHEN p.d BETWEEN b.mon_last AND b.sun_last THEN day_consumption ELSE 0 END) AS lastWeekTotal
    FROM per_day p, bounds2 b
    WHERE p.d BETWEEN b.mon_last AND b.sun_cur
    GROUP BY dayOfWeek
    ORDER BY dayOfWeek;
  `;

  db.query(query, [suburbs], (err, results) => {
    if (err) {
      console.error('Error querying the database:', err);
      return callback({ error: 'Database query failed', details: err });
    }

    // Initialize arrays for current and last week apparent power
    let currentWeekTotal = Array(7).fill(0);
    let lastWeekTotal = Array(7).fill(0);

    // Fill the arrays with the query results
    results.forEach(result => {
      // Adjust dayOfWeek to start from 0 (Monday) instead of 1 (Sunday)
      let dayOfWeek = result.dayOfWeek - 1; // Adjust to 0-based index
      currentWeekTotal[dayOfWeek] = result.currentWeekTotal;
      lastWeekTotal[dayOfWeek] = result.lastWeekTotal;
    });
    

    callback(null, { currentWeekTotal, lastWeekTotal });
  });
};


//Yearly Suburb Apparent Power
exports.getYearlyApparentPowerBySuburb = function(suburbs, callback) {
  
  const query = `
  WITH subs AS (
    SELECT DISTINCT DRN FROM MeterLocationInfoTable WHERE Suburb IN (?)
  ), last_per_month AS (
    SELECT 
      YEAR(m.date_time) AS y,
      MONTH(m.date_time) AS m,
      m.DRN,
      CAST(m.units AS DECIMAL(10,2)) AS u,
      ROW_NUMBER() OVER (PARTITION BY YEAR(m.date_time), MONTH(m.date_time), m.DRN ORDER BY m.date_time DESC) AS rn
    FROM MeterCumulativeEnergyUsage m
    JOIN subs s ON s.DRN = m.DRN
    WHERE YEAR(m.date_time) IN (YEAR(CURDATE()), YEAR(CURDATE()) - 1)
  ), monthly_last AS (
    SELECT y, m, DRN, u FROM last_per_month WHERE rn = 1
  ), agg AS (
    SELECT y, m, SUM(u) AS sum_u
    FROM monthly_last
    GROUP BY y, m
  ), with_prev AS (
    SELECT 
      y, m, sum_u,
      LAG(sum_u) OVER (ORDER BY y, m) AS prev_sum_u
    FROM agg
  )
  SELECT 
    m AS month,
    SUM(CASE WHEN y = YEAR(CURDATE()) THEN GREATEST((sum_u - prev_sum_u) / 1000, 0) ELSE 0 END) AS currentYearPowerConsumption,
    SUM(CASE WHEN y = YEAR(CURDATE()) - 1 THEN GREATEST((sum_u - prev_sum_u) / 1000, 0) ELSE 0 END) AS lastYearPowerConsumption
  FROM with_prev
  GROUP BY m
  ORDER BY m;
  `;

  db.query(query, [suburbs], (err, results) => {
    if (err) {
      console.error('Error querying the database:', err);
      return callback({ error: 'Database query failed', details: err });
    }

    // Initialize arrays for current and last year apparent power
    let currentYearPowerConsumption = Array(12).fill(0);
    let lastYearPowerConsumption = Array(12).fill(0);

    // Fill the arrays with the query results
    results.forEach(result => {
      // MySQL's MONTH function returns 1 for January, 2 for February, ..., 12 for December
      let month = result.month - 1; // Adjust it to make January be 0, February be 1, ..., December be 11
      currentYearPowerConsumption[month] = result.currentYearPowerConsumption ;
      lastYearPowerConsumption[month] = result.lastYearPowerConsumption ;
    });

    callback(null, { currentYearPowerConsumption, lastYearPowerConsumption });
  });
}

//---------------------------------------------------SystemProccessedTokens -----------------------------------//
exports.getAllSystemProcessedTokens = () => {
  const getAllProcessedTokens = "SELECT token_id, date_time, token_amount FROM STSTokesInfo WHERE display_msg = 'Accept'";
  return new Promise((resolve, reject) => {
    db.query(getAllProcessedTokens, (err, processedTokens) => {
      if (err) reject(err);
      else resolve(processedTokens);
    });
  });
};

//---------------------------------------------------DRN Peak and Average Power Analysis -----------------------------------//

// Get peak and average power for DRN - Last 7 days (Weekly basis)
exports.getDRNWeeklyPowerAnalysis = (DRN) => {
  const query = `
    SELECT 
      DATE(date_time) as date,
      MAX(CAST(apparent_power AS DECIMAL(10,2))) as peak_power_watts,
      AVG(CAST(apparent_power AS DECIMAL(10,2))) as avg_power_watts,
      COUNT(*) as reading_count
    FROM 
      MeteringPower
    WHERE 
      DRN = ? 
      AND DATE(date_time) >= CURDATE() - INTERVAL 7 DAY
      AND DATE(date_time) <= CURDATE()
    GROUP BY 
      DATE(date_time)
    ORDER BY 
      date ASC
  `;

  return new Promise((resolve, reject) => {
    db.query(query, [DRN], (err, results) => {
      if (err) {
        reject(err);
      } else {
        // Initialize arrays for 7 days
        const dates = [];
        const peakPowers = [];
        const avgPowers = [];
        
        // Fill arrays with data
        results.forEach(row => {
          dates.push(row.date.toISOString().split('T')[0]);
          peakPowers.push(parseFloat(row.peak_power_watts) || 0);
          avgPowers.push(parseFloat(row.avg_power_watts) || 0);
        });

        // Calculate overall statistics for the week
        const overallPeak = Math.max(...peakPowers.filter(p => p > 0));
        const overallAverage = avgPowers.length > 0 
          ? avgPowers.reduce((sum, avg) => sum + avg, 0) / avgPowers.length 
          : 0;

        resolve({
          period: 'Last 7 Days',
          dates,
          daily_peak_powers: peakPowers,
          daily_avg_powers: avgPowers,
          overall_peak_power: isFinite(overallPeak) ? overallPeak : 0,
          overall_average_power: parseFloat(overallAverage.toFixed(3)),
          unit: 'watts'
        });
      }
    });
  });
};

// Get peak and average power for DRN - Last 12 months (Yearly basis)
exports.getDRNYearlyPowerAnalysis = (DRN) => {
  const query = `
    SELECT 
      YEAR(date_time) as year,
      MONTH(date_time) as month,
      MAX(CAST(apparent_power AS DECIMAL(10,2))) as peak_power_watts,
      AVG(CAST(apparent_power AS DECIMAL(10,2))) as avg_power_watts,
      COUNT(*) as reading_count
    FROM 
      MeteringPower
    WHERE 
      DRN = ? 
      AND date_time >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
    GROUP BY 
      YEAR(date_time), MONTH(date_time)
    ORDER BY 
      year ASC, month ASC
  `;

  return new Promise((resolve, reject) => {
    db.query(query, [DRN], (err, results) => {
      if (err) {
        reject(err);
      } else {
        // Initialize arrays for 12 months
        const monthlyPeakPowers = Array(12).fill(0);
        const monthlyAvgPowers = Array(12).fill(0);
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        // Fill arrays with data
        results.forEach(row => {
          const monthIndex = row.month - 1; // Convert to 0-based index
          monthlyPeakPowers[monthIndex] = parseFloat(row.peak_power_watts) || 0;
          monthlyAvgPowers[monthIndex] = parseFloat(row.avg_power_watts) || 0;
        });

        // Calculate overall statistics for the year
        const overallPeak = Math.max(...monthlyPeakPowers.filter(p => p > 0));
        const nonZeroAvgPowers = monthlyAvgPowers.filter(p => p > 0);
        const overallAverage = nonZeroAvgPowers.length > 0 
          ? nonZeroAvgPowers.reduce((sum, avg) => sum + avg, 0) / nonZeroAvgPowers.length 
          : 0;

        resolve({
          period: 'Last 12 Months',
          months: monthNames,
          monthly_peak_powers: monthlyPeakPowers,
          monthly_avg_powers: monthlyAvgPowers,
          overall_peak_power: isFinite(overallPeak) ? overallPeak : 0,
          overall_average_power: parseFloat(overallAverage.toFixed(3)),
          unit: 'watts'
        });
      }
    });
  });
};

// Get combined power analysis for DRN (both weekly and yearly)
exports.getDRNPowerAnalysis = (DRN) => {
  return Promise.all([
    exports.getDRNWeeklyPowerAnalysis(DRN),
    exports.getDRNYearlyPowerAnalysis(DRN)
  ]).then(([weeklyData, yearlyData]) => {
    return {
      DRN,
      weekly_analysis: weeklyData,
      yearly_analysis: yearlyData,
      analysis_timestamp: new Date().toISOString()
    };
  });
};

//---------------------------------------------------System-wide Peak and Average Power Analysis -----------------------------------//

// Get peak and average power for entire system - Last 7 days (Weekly basis)
exports.getSystemWeeklyPowerAnalysis = () => {
  const query = `
    SELECT 
      DATE(date_time) as date,
      MAX(CAST(apparent_power AS DECIMAL(10,2))) as peak_power_watts,
      AVG(CAST(apparent_power AS DECIMAL(10,2))) as avg_power_watts,
      COUNT(*) as reading_count
    FROM 
      MeteringPower
    WHERE 
      DATE(date_time) >= CURDATE() - INTERVAL 7 DAY
      AND DATE(date_time) <= CURDATE()
    GROUP BY 
      DATE(date_time)
    ORDER BY 
      date ASC
  `;

  return new Promise((resolve, reject) => {
    db.query(query, (err, results) => {
      if (err) {
        console.error('System weekly power analysis error:', err);
        reject(err);
      } else {
        
        // Initialize arrays for 7 days
        const dates = [];
        const peakPowers = [];
        const avgPowers = [];
        
        // Fill arrays with data
        results.forEach(row => {
          dates.push(row.date.toISOString().split('T')[0]);
          peakPowers.push(parseFloat(row.peak_power_watts) || 0);
          avgPowers.push(parseFloat(row.avg_power_watts) || 0);
        });
        // Calculate overall statistics for the week
        const overallPeak = Math.max(...peakPowers.filter(p => p > 0));
        const overallAverage = avgPowers.length > 0 
          ? avgPowers.reduce((sum, avg) => sum + avg, 0) / avgPowers.length 
          : 0;

        resolve({
          period: 'Last 7 Days (System-wide)',
          dates,
          daily_peak_powers: peakPowers,
          daily_avg_powers: avgPowers,
          overall_peak_power: isFinite(overallPeak) ? overallPeak : 0,
          overall_average_power: parseFloat(overallAverage.toFixed(3)),
          unit: 'watts'
        });
      }
    });
  });
};

// Get peak and average power for entire system - Last 12 months (Yearly basis)
exports.getSystemYearlyPowerAnalysis = () => {
  const query = `
    SELECT 
      YEAR(date_time) as year,
      MONTH(date_time) as month,
      MAX(CAST(apparent_power AS DECIMAL(10,2))) as peak_power_watts,
      AVG(CAST(apparent_power AS DECIMAL(10,2))) as avg_power_watts,
      COUNT(*) as reading_count
    FROM 
      MeteringPower
    WHERE 
      date_time >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
    GROUP BY 
      YEAR(date_time), MONTH(date_time)
    ORDER BY 
      year ASC, month ASC
  `;

  return new Promise((resolve, reject) => {
    db.query(query, (err, results) => {
      if (err) {
        console.error('System yearly power analysis error:', err);
        reject(err);
      } else {
        
        // Initialize arrays for 12 months
        const monthlyPeakPowers = Array(12).fill(0);
        const monthlyAvgPowers = Array(12).fill(0);
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        // Fill arrays with data
        results.forEach(row => {
          const monthIndex = row.month - 1; // Convert to 0-based index
          monthlyPeakPowers[monthIndex] = parseFloat(row.peak_power_watts) || 0;
          monthlyAvgPowers[monthIndex] = parseFloat(row.avg_power_watts) || 0;
        });

        // Calculate overall statistics for the year
        const overallPeak = Math.max(...monthlyPeakPowers.filter(p => p > 0));
        const nonZeroAvgPowers = monthlyAvgPowers.filter(p => p > 0);
        const overallAverage = nonZeroAvgPowers.length > 0 
          ? nonZeroAvgPowers.reduce((sum, avg) => sum + avg, 0) / nonZeroAvgPowers.length 
          : 0;

        resolve({
          period: 'Last 12 Months (System-wide)',
          months: monthNames,
          monthly_peak_powers: monthlyPeakPowers,
          monthly_avg_powers: monthlyAvgPowers,
          overall_peak_power: isFinite(overallPeak) ? overallPeak : 0,
          overall_average_power: parseFloat(overallAverage.toFixed(3)),
          unit: 'watts'
        });
      }
    });
  });
};

// Get combined system power analysis (both weekly and yearly)
exports.getSystemPowerAnalysis = () => {
  return Promise.all([
    exports.getSystemWeeklyPowerAnalysis(),
    exports.getSystemYearlyPowerAnalysis()
  ]).then(([weeklyData, yearlyData]) => {
    return {
      scope: 'System-wide',
      weekly_analysis: weeklyData,
      yearly_analysis: yearlyData,
      analysis_timestamp: new Date().toISOString(),
      total_meters_analyzed: 'All active meters'
    };
  });
};

//---------------------------------------------------System-wide Daily Peak and Average Power Analysis -----------------------------------//

// Get daily system peak and average power for past 24 hours (rolling)
exports.getSystemDailyPowerAnalysis = () => {
  const query = `
    SELECT 
      HOUR(date_time) as hour,
      MAX(CAST(apparent_power AS DECIMAL(10,2))) as hourly_peak_power_watts,
      AVG(CAST(apparent_power AS DECIMAL(10,2))) as hourly_avg_power_watts,
      COUNT(*) as reading_count
    FROM 
      MeteringPower
    WHERE 
      date_time >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
    GROUP BY 
      HOUR(date_time)
    ORDER BY 
      hour ASC
  `;

  return new Promise((resolve, reject) => {
    db.query(query, (err, results) => {
      if (err) {
        console.error('System daily power analysis error:', err);
        reject(err);
      } else {
        console.log('Daily raw results:', results); // Debug log
        
        // Initialize arrays for 24 hours
        const hourlyPeakPowers = Array(24).fill(0);
        const hourlyAvgPowers = Array(24).fill(0);
        const hours = Array.from({length: 24}, (_, i) => i); // [0, 1, 2, ..., 23]
        
        // Fill arrays with data
        results.forEach(row => {
          const hourIndex = row.hour; // 0-23
          hourlyPeakPowers[hourIndex] = parseFloat(row.hourly_peak_power_watts) || 0;
          hourlyAvgPowers[hourIndex] = parseFloat(row.hourly_avg_power_watts) || 0;
        });

        console.log('Processed daily data:', { hourlyPeakPowers, hourlyAvgPowers }); // Debug log

        // Calculate overall statistics for the past 24 hours
        const overallPeak = Math.max(...hourlyPeakPowers.filter(p => p > 0));
        const nonZeroAvgPowers = hourlyAvgPowers.filter(p => p > 0);
        const overallAverage = nonZeroAvgPowers.length > 0 
          ? nonZeroAvgPowers.reduce((sum, avg) => sum + avg, 0) / nonZeroAvgPowers.length 
          : 0;

        resolve({
          period: 'Past 24 Hours (System-wide)',
          hours,
          hourly_peak_powers: hourlyPeakPowers,
          hourly_avg_powers: hourlyAvgPowers,
          overall_peak_power: isFinite(overallPeak) ? overallPeak : 0,
          overall_average_power: parseFloat(overallAverage.toFixed(3)),
          total_hours_analyzed: results.length,
          unit: 'watts'
        });
      }
    });
  });
};

// Get current day peak and average power (simple totals for past 24 hours)
exports.getSystemCurrentDayPowerSummary = () => {
  const query = `
    SELECT 
      MAX(CAST(apparent_power AS DECIMAL(10,2))) as day_peak_power_watts,
      AVG(CAST(apparent_power AS DECIMAL(10,2))) as day_avg_power_watts,
      COUNT(*) as total_readings,
      MIN(date_time) as period_start,
      MAX(date_time) as period_end
    FROM 
      MeteringPower
    WHERE 
      date_time >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
  `;

  return new Promise((resolve, reject) => {
    db.query(query, (err, results) => {
      if (err) {
        console.error('System current day power summary error:', err);
        reject(err);
      } else {
        const result = results[0] || {};
        
        resolve({
          period: 'Past 24 Hours Summary (System-wide)',
          day_peak_power: parseFloat(result.day_peak_power_watts) || 0,
          day_avg_power: parseFloat(result.day_avg_power_watts) || 0,
          total_readings: result.total_readings || 0,
          period_start: result.period_start,
          period_end: result.period_end,
          unit: 'watts'
        });
      }
    });
  });
};

// Get current hour system power analysis
exports.getSystemCurrentHourPowerAnalysis = () => {
  const query = `
    SELECT 
      MAX(CAST(apparent_power AS DECIMAL(10,2))) as current_hour_peak_watts,
      AVG(CAST(apparent_power AS DECIMAL(10,2))) as current_hour_avg_watts,
      COUNT(*) as reading_count,
      HOUR(NOW()) as current_hour
    FROM 
      MeteringPower
    WHERE 
      date_time >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
  `;

  return new Promise((resolve, reject) => {
    db.query(query, (err, results) => {
      if (err) {
        console.error('System current hour power analysis error:', err);
        reject(err);
      } else {
        const result = results[0] || {};
        
        resolve({
          period: 'Current Hour (System-wide)',
          current_hour: result.current_hour || new Date().getHours(),
          current_hour_peak_power: parseFloat(result.current_hour_peak_watts) || 0,
          current_hour_avg_power: parseFloat(result.current_hour_avg_watts) || 0,
          reading_count: result.reading_count || 0,
          unit: 'watts'
        });
      }
    });
  });
};

// Enhanced system power analysis combining all time periods
exports.getEnhancedSystemPowerAnalysis = () => {
  return Promise.all([
    exports.getSystemDailyPowerAnalysis(),
    exports.getSystemCurrentDayPowerSummary(),
    exports.getSystemCurrentHourPowerAnalysis(),
    exports.getSystemWeeklyPowerAnalysis(),
    exports.getSystemYearlyPowerAnalysis()
  ]).then(([dailyData, daySummary, currentHourData, weeklyData, yearlyData]) => {
    return {
      scope: 'System-wide Enhanced',
      current_hour_analysis: currentHourData,
      daily_summary: daySummary, // Simple peak/avg for past 24 hours
      daily_analysis: dailyData, // Hourly breakdown for past 24 hours
      weekly_analysis: weeklyData,
      yearly_analysis: yearlyData,
      analysis_timestamp: new Date().toISOString(),
      total_meters_analyzed: 'All active meters'
    };
  });
};

// Today's system-wide average and peak apparent power (watts)
exports.getTodayAverageAndPeakPower = () => {
  const query = `
    WITH hourly_avg_per_drn AS (
  SELECT
    DRN,
    HOUR(date_time) AS hr,
    AVG(CAST(apparent_power AS DECIMAL(10,2))) AS drn_hourly_avg
  FROM MeteringPower
  WHERE DATE(date_time) = CURDATE()
  GROUP BY DRN, HOUR(date_time)
),
daily_avg_per_drn AS (
  SELECT
    DRN,
    AVG(drn_hourly_avg) AS drn_daily_avg
  FROM hourly_avg_per_drn
  GROUP BY DRN
),
hourly_max_per_drn AS (
  SELECT
    DRN,
    HOUR(date_time) AS hr,
    MAX(CAST(apparent_power AS DECIMAL(10,2))) AS drn_peak_power
  FROM MeteringPower
  WHERE DATE(date_time) = CURDATE()
  GROUP BY DRN, HOUR(date_time)
),
hourly_system_peak AS (
  SELECT
    hr,
    SUM(drn_peak_power) AS total_peak_power
  FROM hourly_max_per_drn
  GROUP BY hr
)
SELECT
  -- fairer system-wide average (based on hourly averages per DRN)
  SUM(drn_daily_avg) AS avg_power_watts,

  -- true system peak = maximum hourly sum of DRN-wise hourly peaks
  (SELECT MAX(total_peak_power) FROM hourly_system_peak) AS peak_power_watts
FROM daily_avg_per_drn;

  `;

  return new Promise((resolve, reject) => {
    db.query(query, (err, results) => {
      if (err) {
        reject(err);
      } else {
        const row = results && results[0] ? results[0] : {};
        const averagePower = parseFloat(row.avg_power_watts) || 0;
        const peakPower = parseFloat(row.peak_power_watts) || 0;
        resolve({ averagePower, peakPower, unit: 'watts' });
      }
    });
  });
};

//---------------------------------------------------Get All Meters Comprehensive Information -----------------------------------//

exports.getAllMetersInformation = () => {
  const query = `
    SELECT 
      mpr.DRN as id,
      mpr.Surname,
      mpr.Name,
      CONCAT(mpr.Streetname, ', ', mpr.City) as Location,
      mpr.Simnumber as SimNumber,
      CASE 
        WHEN mlc.mains_state = '1' THEN 'Active'
        WHEN mlc.mains_state = '0' THEN 'Inactive'
        ELSE 'Unknown'
      END as Status,
      DATE_FORMAT(mp.latest_reading_date, '%d-%m-%Y') as LastUpdateDate,
      COALESCE(latest_notification.notification_message, 'No recent notifications') as LastNotification,
      CASE 
        WHEN mcu_tamper.tamper_state = '1' OR mcu_tamper.tamper_state = 'Tampered' THEN 'Tempered'
        ELSE 'Not Tempered'
      END as TemperState,
      COALESCE(mcu.latest_units, 0) as Units,
      COALESCE(token.latest_token_amount, 0) as LastTokenAmount,
      COALESCE(mp.avg_voltage, 0) as AverageVoltage,
      COALESCE(mp.peak_voltage, 0) as PeakVoltage,
      COALESCE(mp.avg_current, 0) as AverageCurrent,
      COALESCE(mp.peak_current, 0) as PeakCurrent,
      COALESCE(mp.avg_power, 0) as AveragePower,
      COALESCE(mp.peak_power, 0) as PeakPower
    FROM 
      MeterProfileReal mpr
    LEFT JOIN (
      SELECT 
        DRN,
        mains_state,
        date_time,
        ROW_NUMBER() OVER (PARTITION BY DRN ORDER BY date_time DESC) as rn
      FROM MeterLoadControl
      WHERE DATE(date_time) >= CURDATE() - INTERVAL 30 DAY
    ) mlc ON mpr.DRN = mlc.DRN AND mlc.rn = 1
    LEFT JOIN (
      SELECT 
        DRN,
        AVG(CAST(voltage AS DECIMAL(10,2))) as avg_voltage,
        MAX(CAST(voltage AS DECIMAL(10,2))) as peak_voltage,
        AVG(CAST(current AS DECIMAL(10,2))) as avg_current,
        MAX(CAST(current AS DECIMAL(10,2))) as peak_current,
        AVG(CAST(apparent_power AS DECIMAL(10,2))) as avg_power,
        MAX(CAST(apparent_power AS DECIMAL(10,2))) as peak_power,
        MAX(date_time) as latest_reading_date
      FROM MeteringPower
      WHERE DATE(date_time) >= CURDATE() - INTERVAL 30 DAY
      GROUP BY DRN
    ) mp ON mpr.DRN = mp.DRN
    LEFT JOIN (
      SELECT 
        DRN,
        CAST(units AS DECIMAL(10,2)) as latest_units,
        ROW_NUMBER() OVER (PARTITION BY DRN ORDER BY date_time DESC) as rn
      FROM MeterCumulativeEnergyUsage
    ) mcu ON mpr.DRN = mcu.DRN AND mcu.rn = 1
    LEFT JOIN (
      SELECT 
        DRN,
        token_amount as latest_token_amount,
        ROW_NUMBER() OVER (PARTITION BY DRN ORDER BY date_time DESC) as rn
      FROM STSTokesInfo
      WHERE display_msg = 'Accept' 
        AND DATE(date_time) >= CURDATE() - INTERVAL 30 DAY
    ) token ON mpr.DRN = token.DRN AND token.rn = 1
    LEFT JOIN (
      SELECT 
        DRN,
        'Recent system notification' as notification_message,
        ROW_NUMBER() OVER (PARTITION BY DRN ORDER BY date_time DESC) as rn
      FROM MeterLoadControl
      WHERE DATE(date_time) >= CURDATE() - INTERVAL 7 DAY
    ) latest_notification ON mpr.DRN = latest_notification.DRN AND latest_notification.rn = 1
    LEFT JOIN (
      SELECT 
        DRN,
        tamper_state,
        ROW_NUMBER() OVER (PARTITION BY DRN ORDER BY date_time DESC) as rn
      FROM MeterCumulativeEnergyUsage
      WHERE tamper_state IS NOT NULL
        AND DATE(date_time) >= CURDATE() - INTERVAL 30 DAY
    ) mcu_tamper ON mpr.DRN = mcu_tamper.DRN AND mcu_tamper.rn = 1
    ORDER BY mpr.DRN
  `;

  return new Promise((resolve, reject) => {
    db.query(query, (err, results) => {
      if (err) {
        console.error('Error fetching comprehensive meter information:', err);
        reject(err);
      } else {
        // Format the results to match the expected structure
        const formattedResults = results.map(meter => ({
          id: meter.id,
          Surname: meter.Surname || 'N/A',
          Name: meter.Name || 'N/A',
          Location: meter.Location || 'Location not specified',
          SimNumber: parseInt(meter.SimNumber) || 0,
          Status: meter.Status,
          LastUpdateDate: meter.LastUpdateDate || 'No recent updates',
          LastNotification: meter.LastNotification,
          TemperState: meter.TemperState,
          Units: parseFloat(meter.Units).toFixed(1),
          LastTokenAmount: parseFloat(meter.LastTokenAmount).toFixed(2),
          AverageVoltage: parseInt(meter.AverageVoltage) || 0,
          PeakVoltage: parseInt(meter.PeakVoltage) || 0,
          AverageCurrent: parseFloat(meter.AverageCurrent).toFixed(2),
          PeakCurrent: parseFloat(meter.PeakCurrent).toFixed(2),
          AveragePower: parseInt(meter.AveragePower) || 0,
          PeakPower: parseInt(meter.PeakPower) || 0
        }));

        resolve(formattedResults);
      }
    });
  });
};

// Basic meter information without Average/Peak Power calculations
exports.getAllMetersInformationNoPowerStats = () => {
  const query = `
    SELECT 
      mpr.DRN as id,
      mpr.Surname,
      mpr.Name,
      CONCAT(mpr.Streetname, ', ', mpr.City) as Location,
      mpr.Simnumber as SimNumber,
      CASE 
        WHEN mlc.mains_state = '1' THEN 'Active'
        WHEN mlc.mains_state = '0' THEN 'Inactive'
        ELSE 'Unknown'
      END as Status,
      DATE_FORMAT(mp.latest_reading_date, '%d-%m-%Y') as LastUpdateDate,
      CASE 
        WHEN mcu_tamper.tamper_state = '1' OR mcu_tamper.tamper_state = 'Tampered' THEN 'Tempered'
        ELSE 'Not Tempered'
      END as TemperState,
      COALESCE(mcu.latest_units, 0) as Units
    FROM 
      MeterProfileReal mpr
    LEFT JOIN (
      SELECT 
        DRN,
        mains_state,
        date_time,
        ROW_NUMBER() OVER (PARTITION BY DRN ORDER BY date_time DESC) as rn
      FROM MeterLoadControl
      WHERE DATE(date_time) >= CURDATE() - INTERVAL 30 DAY
    ) mlc ON mpr.DRN = mlc.DRN AND mlc.rn = 1
    LEFT JOIN (
      SELECT 
        DRN,
        MAX(date_time) as latest_reading_date
      FROM MeteringPower
      WHERE DATE(date_time) >= CURDATE() - INTERVAL 30 DAY
      GROUP BY DRN
    ) mp ON mpr.DRN = mp.DRN
    LEFT JOIN (
      SELECT 
        DRN,
        CAST(units AS DECIMAL(10,2)) as latest_units,
        ROW_NUMBER() OVER (PARTITION BY DRN ORDER BY date_time DESC) as rn
      FROM MeterCumulativeEnergyUsage
    ) mcu ON mpr.DRN = mcu.DRN AND mcu.rn = 1
    LEFT JOIN (
      SELECT 
        DRN,
        tamper_state,
        ROW_NUMBER() OVER (PARTITION BY DRN ORDER BY date_time DESC) as rn
      FROM MeterCumulativeEnergyUsage
      WHERE tamper_state IS NOT NULL
        AND DATE(date_time) >= CURDATE() - INTERVAL 30 DAY
    ) mcu_tamper ON mpr.DRN = mcu_tamper.DRN AND mcu_tamper.rn = 1
    ORDER BY mpr.DRN
  `;

  return new Promise((resolve, reject) => {
    db.query(query, (err, results) => {
      if (err) {
        console.error('Error fetching basic meter information:', err);
        reject(err);
      } else {
        const formattedResults = results.map(meter => ({
          id: meter.id,
          Surname: meter.Surname || 'N/A',
          Name: meter.Name || 'N/A',
          Location: meter.Location || 'Location not specified',
          SimNumber: parseInt(meter.SimNumber) || 0,
          Status: meter.Status,
          LastUpdateDate: meter.LastUpdateDate || 'No recent updates',
          TemperState: meter.TemperState,
          Units: parseFloat(meter.Units).toFixed(1)
        }));

        resolve(formattedResults);
      }
    });
  });
};
// Comprehensive meter dashboard data with historical comparisons
exports.getComprehensiveMeterDashboard = function() {
  return new Promise((resolve, reject) => {
    // Get current meter status counts
    const getCurrentMeterStatus = `
      SELECT COUNT(DISTINCT DRN) as totalMeters FROM MeterProfileReal
    `;
    // New meters registered today and yesterday (based on MeterProfileReal.date_time)
    const getNewMetersToday = `
      SELECT COUNT(*) AS newMetersToday
      FROM MeterProfileReal
      WHERE DATE(date_time) = CURDATE()
    `;
    const getNewMetersYesterday = `
      SELECT COUNT(*) AS newMetersYesterday
      FROM MeterProfileReal
      WHERE DATE(date_time) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
    `;
    
    const getCurrentActiveInactive = `
      SELECT 
        SUM(CASE WHEN mains_state = '1' THEN 1 ELSE 0 END) as activeMeters,
        SUM(CASE WHEN mains_state = '0' THEN 1 ELSE 0 END) as inactiveMeters
      FROM (
        SELECT DRN, mains_state, ROW_NUMBER() OVER (PARTITION BY DRN ORDER BY date_time DESC) as rn
        FROM MeterLoadControl
        WHERE DATE(date_time) = CURDATE()
      ) t
      WHERE t.rn = 1
    `;

    const getYesterdayActiveInactive = `
      SELECT 
        SUM(CASE WHEN mains_state = '1' THEN 1 ELSE 0 END) as activeMeters,
        SUM(CASE WHEN mains_state = '0' THEN 1 ELSE 0 END) as inactiveMeters
      FROM (
        SELECT DRN, mains_state, ROW_NUMBER() OVER (PARTITION BY DRN ORDER BY date_time DESC) as rn
        FROM MeterLoadControl
        WHERE DATE(date_time) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
      ) t
      WHERE t.rn = 1
    `;

    const getCurrentSystemLoad = `
      SELECT 
        COALESCE(SUM(usage_current_hour), 0) AS currentSystemLoad
      FROM (
        SELECT 
          current_hour.DRN,
          CASE 
            WHEN current_hour.reading_count = 1 THEN 
              COALESCE(current_hour.max_energy - COALESCE(prev_hour.last_reading, 0), 0)
            ELSE 
              (current_hour.max_energy - current_hour.min_energy)
          END AS usage_current_hour
        FROM (
          SELECT 
            DRN,
            MIN(CAST(active_energy AS DECIMAL(10,2))) as min_energy,
            MAX(CAST(active_energy AS DECIMAL(10,2))) as max_energy,
            COUNT(*) as reading_count
          FROM MeterCumulativeEnergyUsage
          WHERE DATE(date_time) = CURDATE()
            AND HOUR(date_time) = HOUR(NOW())
          GROUP BY DRN
        ) current_hour
        LEFT JOIN (
          SELECT 
            DRN,
            MAX(CAST(active_energy AS DECIMAL(10,2))) as last_reading
          FROM MeterCumulativeEnergyUsage
          WHERE date_time < (
            SELECT MIN(date_time) 
            FROM MeterCumulativeEnergyUsage 
            WHERE DATE(date_time) = CURDATE() 
            AND HOUR(date_time) = HOUR(NOW())
          )
          GROUP BY DRN
        ) prev_hour ON current_hour.DRN = prev_hour.DRN
      ) t
    `;

    const getLastHourSystemLoad = `
      SELECT 
        COALESCE(SUM(usage_last_hour), 0) AS lastHourSystemLoad
      FROM (
        SELECT 
          last_hour.DRN,
          CASE 
            WHEN last_hour.reading_count = 1 THEN 
              COALESCE(last_hour.max_energy - COALESCE(two_hours_ago.last_reading, 0), 0)
            ELSE 
              (last_hour.max_energy - last_hour.min_energy)
          END AS usage_last_hour
        FROM (
          SELECT 
            DRN,
            MIN(CAST(active_energy AS DECIMAL(10,2))) as min_energy,
            MAX(CAST(active_energy AS DECIMAL(10,2))) as max_energy,
            COUNT(*) as reading_count
          FROM MeterCumulativeEnergyUsage
          WHERE DATE(date_time) = CASE 
              WHEN HOUR(NOW()) = 0 THEN DATE_SUB(CURDATE(), INTERVAL 1 DAY)
              ELSE CURDATE()
            END
            AND HOUR(date_time) = CASE 
              WHEN HOUR(NOW()) = 0 THEN 23
              ELSE HOUR(NOW()) - 1
            END
          GROUP BY DRN
        ) last_hour
        LEFT JOIN (
          SELECT 
            DRN,
            MAX(CAST(active_energy AS DECIMAL(10,2))) as last_reading
          FROM MeterCumulativeEnergyUsage
          WHERE date_time < (
            SELECT MIN(date_time) 
            FROM MeterCumulativeEnergyUsage 
            WHERE DATE(date_time) = CASE 
                WHEN HOUR(NOW()) = 0 THEN DATE_SUB(CURDATE(), INTERVAL 1 DAY)
                ELSE CURDATE()
              END
              AND HOUR(date_time) = CASE 
                WHEN HOUR(NOW()) = 0 THEN 23
                ELSE HOUR(NOW()) - 1
              END
          )
          GROUP BY DRN
        ) two_hours_ago ON last_hour.DRN = two_hours_ago.DRN
      ) t
    `;

    // Execute all queries
    Promise.all([
      new Promise((resolve, reject) => {
        db.query(getCurrentMeterStatus, (err, results) => {
          if (err) reject(err);
          else resolve(results[0]);
        });
      }),
      new Promise((resolve, reject) => {
        db.query(getNewMetersToday, (err, results) => {
          if (err) reject(err);
          else resolve(results && results.length > 0 ? results[0] : { newMetersToday: 0 });
        });
      }),
      new Promise((resolve, reject) => {
        db.query(getNewMetersYesterday, (err, results) => {
          if (err) reject(err);
          else resolve(results && results.length > 0 ? results[0] : { newMetersYesterday: 0 });
        });
      }),
      new Promise((resolve, reject) => {
        db.query(getCurrentActiveInactive, (err, results) => {
          if (err) reject(err);
          else resolve(results[0]);
        });
      }),
      new Promise((resolve, reject) => {
        db.query(getYesterdayActiveInactive, (err, results) => {
          if (err) reject(err);
          else resolve(results[0]);
        });
      }),
      new Promise((resolve, reject) => {
        db.query(getCurrentSystemLoad, (err, results) => {
          if (err) reject(err);
          else resolve(results && results.length > 0 ? results[0] : { currentSystemLoad: 0 });
        });
      }),
      new Promise((resolve, reject) => {
        db.query(getLastHourSystemLoad, (err, results) => {
          if (err) reject(err);
          else resolve(results && results.length > 0 ? results[0] : { lastHourSystemLoad: 0 });
        });
      })
    ])
    .then(([totalMeterData, newTodayData, newYesterdayData, currentStatusData, yesterdayStatusData, currentLoadData, lastHourLoadData]) => {
      const totalMeters = Number(totalMeterData.totalMeters) || 0;
      const newMetersToday = Number(newTodayData.newMetersToday) || 0;
      const newMetersYesterday = Number(newYesterdayData.newMetersYesterday) || 0;
      const currentActive = Number(currentStatusData.activeMeters) || 0;
      // Derive inactive as total - active (clamp to >= 0)
      const currentInactive = Math.max(totalMeters - currentActive, 0);
      const yesterdayActive = Number(yesterdayStatusData.activeMeters) || 0;
      const yesterdayInactive = Math.max(totalMeters - yesterdayActive, 0);
      const currentSystemLoad = parseFloat(currentLoadData.currentSystemLoad || 0) / 1000; // Convert to kW
      const lastHourSystemLoad = parseFloat(lastHourLoadData.lastHourSystemLoad || 0) / 1000; // Convert to kW

      // Calculate percentage changes
      const activePercentageChange = yesterdayActive > 0 
        ? ((currentActive - yesterdayActive) / yesterdayActive * 100) 
        : 0;
      
      const inactivePercentageChange = yesterdayInactive > 0 
        ? ((currentInactive - yesterdayInactive) / yesterdayInactive * 100) 
        : 0;

      const systemLoadPercentageChange = lastHourSystemLoad > 0 
        ? ((currentSystemLoad - lastHourSystemLoad) / lastHourSystemLoad * 100) 
        : 0;

      // Percentage change for total meters based on new registrations today vs yesterday
      const totalMetersPercentageChange = newMetersYesterday > 0
        ? ((newMetersToday - newMetersYesterday) / newMetersYesterday * 100)
        : 0;

      const dashboardData = {
        totalMeters,
        totalMetersPercentageChange: parseFloat(totalMetersPercentageChange.toFixed(2)),
        activeMeters: currentActive,
        inactiveMeters: currentInactive,
        activePercentageChange: parseFloat(activePercentageChange.toFixed(2)),
        inactivePercentageChange: parseFloat(inactivePercentageChange.toFixed(2)),
        currentSystemLoad: parseFloat(currentSystemLoad.toFixed(2)),
        systemLoadPercentageChange: parseFloat(systemLoadPercentageChange.toFixed(2)),
        newMeters: {
          today: newMetersToday,
          yesterday: newMetersYesterday
        },
        yesterday: {
          activeMeters: yesterdayActive,
          inactiveMeters: yesterdayInactive
        },
        lastHour: {
          systemLoad: parseFloat(lastHourSystemLoad.toFixed(2))
        }
      };

      resolve(dashboardData);
    })
    .catch(err => {
      console.error('Error in comprehensive meter dashboard query:', err);
      reject(err);
    });
  });
};