const db = require('../config/db'); // replace './db' with the path to your database connection file
//------------------------------------------All time perionds-------------------------------------//

exports.getTokenAmounts = () => {
  const getCurrentDayTokenAmount = "SELECT COALESCE(SUM(token_amount), 0) as total_token_amount FROM STSTokesInfo WHERE DATE(date_time) = CURDATE() AND display_msg = 'Accept'";
  const getCurrentMonthTokenAmount = "SELECT COALESCE(SUM(token_amount), 0) as total_token_amount FROM STSTokesInfo WHERE MONTH(date_time) = MONTH(CURRENT_DATE()) AND display_msg = 'Accept'";
  const getCurrentYearTokenAmount = "SELECT COALESCE(SUM(token_amount), 0) as total_token_amount FROM STSTokesInfo WHERE YEAR(date_time) = YEAR(CURRENT_DATE()) AND display_msg = 'Accept'";

  return new Promise((resolve, reject) => {
    db.query(getCurrentDayTokenAmount, (err, dayResult) => {
      if (err) reject(err);
      else {
        db.query(getCurrentMonthTokenAmount, (err, monthResult) => {
          if (err) reject(err);
          else {
            db.query(getCurrentYearTokenAmount, (err, yearResult) => {
              if (err) reject(err);
              else {
                resolve({
                  day: dayResult[0].total_token_amount,
                  month: monthResult[0].total_token_amount,
                  year: yearResult[0].total_token_amount
                });
              }
            });
          }
        });
      }
    });
  });
};



//---------------------------------------------------Get financial stats for all the months of last year and current year------------------------//
exports.getMonthlyTokenAmountForCurrentAndLastYear = () => {
  const getMonthlyTokenAmountForCurrentAndLastYear = `
    SELECT 
      YEAR(date_time) as year,
      MONTH(date_time) as month,
      SUM(token_amount) as total_token_amount
    FROM 
      STSTokesInfo 
    WHERE 
      YEAR(date_time) IN (YEAR(CURRENT_DATE()), YEAR(CURRENT_DATE()) - 1)
      AND display_msg = 'Accept'
    GROUP BY 
      YEAR(date_time),
      MONTH(date_time)
  `;
  return new Promise((resolve, reject) => {
    db.query(getMonthlyTokenAmountForCurrentAndLastYear,
       (err, monthlyData) => {
      if (err) reject(err);
      else resolve(monthlyData);
    });
  });
};
//--------------------------------------------------------Current and last week financial data--------------------------//
exports.getWeeklyTokenAmountForCurrentAndLastWeek = () => {
  const getWeeklyTokenAmountForCurrentAndLastWeek = `
    SELECT 
      YEAR(date_time) as year,
      WEEK(date_time, 1) as week,
      DAYNAME(date_time) as day,
      SUM(token_amount) as total_token_amount
    FROM 
      STSTokesInfo 
    WHERE 
      WEEK(date_time, 1) IN (WEEK(CURRENT_DATE(), 1), WEEK(CURRENT_DATE(), 1) - 1)
      AND display_msg = 'Accept'
    GROUP BY 
      YEAR(date_time),
      WEEK(date_time, 1),
      DAYNAME(date_time)
  `;
  return new Promise((resolve, reject) => {
    db.query(getWeeklyTokenAmountForCurrentAndLastWeek,
       (err, weeklyData) => {
      if (err) reject(err);
      else resolve(weeklyData);
    });
  });
};
//Hourly revenue
exports.getTotalRevenuePerHour = function(callback) {
  const query = `
    WITH RECURSIVE hours AS (
      SELECT 0 AS hour
      UNION ALL
      SELECT hour + 1
      FROM hours
      WHERE hour < 23
    )
    SELECT hours.hour, COALESCE(SUM(CAST(token_amount AS DECIMAL(10,2))), 0) as total_revenue
    FROM hours
    LEFT JOIN STSTokesInfo
    ON HOUR(date_time) = hours.hour 
       AND DATE(date_time) = CURDATE() 
       AND display_msg = 'Accept'
       AND token_amount IS NOT NULL
       AND token_amount != ''
    GROUP BY hours.hour
    ORDER BY hours.hour
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('Error querying the database:', err);
      return callback({ error: 'Database query failed', details: err });
    }

    // Extract only the total_revenue from each row and return as an array
    const revenues = results.map(row => parseFloat(row.total_revenue) || 0);
    callback(null, revenues);
  });
}

//Suburb Time periods
exports.getRevenueByTimePeriodsBySuburb = function(suburbs, callback) {
  console.log(suburbs);
  const query = `
    SELECT 
      SUM(IF(DATE(date_time) = CURDATE(), token_amount, 0)) as currentDayRevenue,
      SUM(IF(MONTH(date_time) = MONTH(CURDATE()) AND YEAR(date_time) = YEAR(CURDATE()), token_amount, 0)) as currentMonthRevenue,
      SUM(IF(YEAR(date_time) = YEAR(CURDATE()), token_amount, 0)) as currentYearRevenue
    FROM STSTokesInfo
    WHERE DRN IN (
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

    if (results.length === 0) {
      return callback(null, { currentDayRevenue: 0, currentMonthRevenue: 0, currentYearRevenue: 0 });
    }

    callback(null, results[0]);
  });
}

//Weekly Suburb Revenue
exports.getWeeklyRevenueBySuburb = function(suburbs, callback) {
  
  const query = `
    SELECT 
      DAYOFWEEK(date_time) as dayOfWeek,
      SUM(IF(WEEK(date_time, 1) = WEEK(CURDATE(), 1), token_amount, 0)) as currentWeekRevenue,
      SUM(IF(WEEK(date_time, 1) = WEEK(CURDATE(), 1) - 1 AND YEAR(date_time) = YEAR(CURDATE()), token_amount, 0)) as lastWeekRevenue
    FROM STSTokesInfo
    WHERE DRN IN (
      SELECT DRN
      FROM MeterLocationInfoTable
      WHERE Suburb IN (?)
    )
    GROUP BY DAYOFWEEK(date_time)
    ORDER BY DAYOFWEEK(date_time);
  `;

  db.query(query, [suburbs], (err, results) => {
    if (err) {
      console.error('Error querying the database:', err);
      return callback({ error: 'Database query failed', details: err });
    }

    // Initialize arrays for current and last week revenues
    let currentWeekRevenue = Array(7).fill(0);
    let lastWeekRevenue = Array(7).fill(0);

    // Fill the arrays with the query results
    results.forEach(result => {
      
      let dayOfWeek = (result.dayOfWeek + 5) % 7;
      currentWeekRevenue[dayOfWeek] = result.currentWeekRevenue;
      lastWeekRevenue[dayOfWeek] = result.lastWeekRevenue;
    });

    callback(null, { currentWeekRevenue, lastWeekRevenue });
  });
}
//Yearly Suburb revenue
exports.getYearlyRevenueBySuburb = function(suburbs, callback) {
  const query = `
    SELECT 
      MONTH(date_time) as month,
      SUM(IF(YEAR(date_time) = YEAR(CURDATE()), token_amount, 0)) as currentYearRevenue,
      SUM(IF(YEAR(date_time) = YEAR(CURDATE()) - 1, token_amount, 0)) as lastYearRevenue
    FROM STSTokesInfo
    WHERE DRN IN (
      SELECT DRN
      FROM MeterLocationInfoTable
      WHERE Suburb IN (?)
    )
    GROUP BY MONTH(date_time)
    ORDER BY MONTH(date_time);
  `;

  db.query(query, [suburbs], (err, results) => {
    if (err) {
      console.error('Error querying the database:', err);
      return callback({ error: 'Database query failed', details: err });
    }

    // Initialize arrays for current and last year revenues
    let currentYearRevenue = Array(12).fill(0);
    let lastYearRevenue = Array(12).fill(0);

    // Fill the arrays with the query results
    results.forEach(result => {
      // MySQL's MONTH function returns 1 for January, 2 for February, ..., 12 for December
      let month = result.month - 1; // Adjust it to make January be 0, February be 1, ..., December be 11
      currentYearRevenue[month] = result.currentYearRevenue;
      lastYearRevenue[month] = result.lastYearRevenue;
    });

    callback(null, { currentYearRevenue, lastYearRevenue });
  });
}

//Past week tokens
exports.getPastWeekTokens = function(callback) {
  const query = `
    SELECT
      DATE(date_time) as date,
      COUNT(*) as token_count,
      ROUND(COALESCE(SUM(token_amount), 0), 2) as total_amount,
      ROUND(COALESCE(SUM(CASE WHEN display_msg = 'Accept' THEN token_amount ELSE 0 END), 0), 2) as accepted_amount,
      SUM(CASE WHEN display_msg = 'Accept' THEN 1 ELSE 0 END) as accepted_count
    FROM STSTokesInfo
    WHERE date_time >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
      AND date_time <= NOW()
    GROUP BY DATE(date_time)
    ORDER BY date ASC
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('Error querying the database:', err);
      return callback({ error: 'Database query failed', details: err });
    }

    // Fill all 7 days (including days with no data)
    const resultMap = {};
    results.forEach(r => { resultMap[r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10)] = r; });

    const fullWeek = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      if (resultMap[key]) {
        fullWeek.push(resultMap[key]);
      } else {
        fullWeek.push({ date: key, token_count: 0, total_amount: 0, accepted_amount: 0, accepted_count: 0 });
      }
    }

    callback(null, fullWeek);
  });
}

// Get comprehensive energy overview
exports.getEnergyOverview = () => {
  return new Promise((resolve, reject) => {
    // Get total energy consumed (sum of last active energy value per meter) - converted to kWh
    const totalEnergyQuery = `
      SELECT COALESCE(SUM(CAST(e.active_energy AS DECIMAL(10,2)) / 1000), 0) as total_energy_consumed
      FROM MeterCumulativeEnergyUsage e
      INNER JOIN (SELECT DRN, MAX(id) as max_id FROM MeterCumulativeEnergyUsage GROUP BY DRN) latest ON e.id = latest.max_id
    `;

    // Get total units purchased from tokens
    const totalPurchasedQuery = `
      SELECT 
        COALESCE(SUM(token_amount), 0) as total_amount_spent,
        COUNT(*) as total_transactions
      FROM STSTokesInfo 
      WHERE display_msg = 'Accept'
    `;

    // Get unit rate from tariff table
    const unitRateQuery = `
      SELECT Rate 
      FROM UnitTariff 
      LIMIT 1
    `;

    // Get total units remaining (last reading per meter)
    const unitsRemainingQuery = `
      SELECT COALESCE(SUM(CAST(e.units AS DECIMAL(10,2))), 0) as total_units_remaining
      FROM MeterCumulativeEnergyUsage e
      INNER JOIN (SELECT DRN, MAX(id) as max_id FROM MeterCumulativeEnergyUsage GROUP BY DRN) latest ON e.id = latest.max_id
    `;

    // Execute all queries
    db.query(totalEnergyQuery, (err, energyResult) => {
      if (err) {
        console.error('Error getting total energy consumed:', err);
        return reject(err);
      }

      db.query(totalPurchasedQuery, (err, purchasedResult) => {
        if (err) {
          console.error('Error getting total purchased amount:', err);
          return reject(err);
        }

        db.query(unitRateQuery, (err, rateResult) => {
          if (err) {
            console.error('Error getting unit rate:', err);
            return reject(err);
          }

          db.query(unitsRemainingQuery, (err, remainingResult) => {
            if (err) {
              console.error('Error getting units remaining:', err);
              return reject(err);
            }

            const totalAmountSpent = parseFloat(purchasedResult[0].total_amount_spent) || 0;
            const unitRate = parseFloat(rateResult[0]?.Rate) || 1; // Default rate of 1 if not found
            const totalUnitsPurchased = totalAmountSpent / unitRate;

            const overview = {
              totalEnergyConsumed: parseFloat(energyResult[0].total_energy_consumed) || 0,
              totalUnitsPurchased: parseFloat(totalUnitsPurchased.toFixed(2)),
              totalUnitsRemaining: parseFloat(remainingResult[0].total_units_remaining) || 0,
              totalAmountSpent: parseFloat(totalAmountSpent.toFixed(2)),
              unitRate: unitRate,
              totalTransactions: purchasedResult[0].total_transactions || 0
            };

            console.log('Energy Overview:', overview);
            resolve(overview);
          });
        });
      });
    });
  });
};
