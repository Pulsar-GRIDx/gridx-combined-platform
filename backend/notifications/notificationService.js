const db = require('../config/db');
///Get Notifications By DRN
exports.getNotificationsByDRN = (DRN) => {
    const query = "SELECT Alarm , date_time FROM MeterNotifications WHERE DRN = ? ORDER BY date_time DESC LIMIT 25";
  
    return new Promise((resolve, reject) => {
      db.query(query, [DRN], (err, notifications) => {
        if (err) {
          reject(err);
        } else {
          resolve(notifications);
        }
      });
    });
  };

//Get All Critical Notifications

exports.getAllCriticalNotifications = () => {
  return new Promise((resolve, reject) => {
    // First check if table exists and get structure
    const checkTableQuery = `SHOW TABLES LIKE 'MeterNotifications'`;
    
    db.query(checkTableQuery, (err, tableResults) => {
      if (err) {
        console.error('Error checking table existence:', err);
        return reject(new Error('Database connection failed'));
      }
      
      if (tableResults.length === 0) {
        console.error('MeterNotifications table does not exist');
        return reject(new Error('MeterNotifications table not found'));
      }
      
      // Get all critical notifications from past 24 hours without any limits
      const query = `
        SELECT 
          ID,
          Alarm, 
          DRN, 
          date_time, 
          Type,
          AlarmType,
          Urgency_Type
        FROM MeterNotifications 
        WHERE date_time >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
          AND (Type = 'Critical' OR Type = 'critical' OR LOWER(Type) = 'critical')
        ORDER BY date_time DESC
      `;
      
      console.log('Executing critical notifications query...');
      
      db.query(query, (err, notifications) => {
        if (err) {
          console.error('Critical notifications query error:', err);
          return reject(new Error(`Database query failed: ${err.message}`));
        }
        
        console.log(`Found ${notifications.length} critical notifications`);
        
        // Format the results to ensure consistent data structure
        const formattedNotifications = notifications.map(notification => ({
          id: notification.ID,
          alarm: notification.Alarm || 'No alarm message',
          drn: notification.DRN || 'Unknown',
          dateTime: notification.date_time,
          type: notification.Type,
          alarmType: notification.AlarmType || 'Unknown',
          urgencyType: notification.Urgency_Type || 'Medium'
        }));
        resolve(formattedNotifications);
      });
    });
  });
};

//Get All notifications
exports.getAll = () => {

  const query = `SELECT * 
    FROM MeterNotifications
    ORDER BY date_time DESC;
    `;

    return new Promise((resolve, reject) => {
      db.query(query,  (err, notifications) => {
        if (err) {
          reject(err);
        } else {
          resolve(notifications);
        }
      });
    });

 
};

//Get type of notifications

exports.getSumOfTypes = function(callback) {
  const query = `
      SELECT Type, COUNT(*) as count
      FROM MeterNotifications
      WHERE Type IN ('Pending', 'Critical', 'Success', 'Warning')
      GROUP BY Type
  `;
  db.query(query, (err, results) => {
      if (err) {
          console.log('Error Querying the database:', err);
          return callback({ error: 'Database query failed', details: err });
      }

      // Initialize counts to 0
      const counts = {
          'Pending': 0,
          'Critical': 0,
          'Success': 0,
          'Warning': 0
      };

      results.forEach(row => {
          counts[row.Type] = row.count;
      });
      callback(null, counts);
  });
}

//Notification types for specific meter
exports.getSumOfTypesByDRN = function(DRN,callback) {
  const query = `
      SELECT Type, COUNT(*) as count
      FROM MeterNotifications
      WHERE Type IN ('Pending', 'Critical', 'Success', 'Warning') AND DRN = ?
      GROUP BY Type
  `;
  db.query(query,[DRN], (err, results) => {
      if (err) {
          console.log('Error Querying the database:', err);
          return callback({ error: 'Database query failed', details: err });
      }

      // Initialize counts to 0
      const counts = {
          'Pending': 0,
          'Critical': 0,
          'Success': 0,
          'Warning': 0
      };

      results.forEach(row => {
          counts[row.Type] = row.count;
      });
      callback(null, counts);
  });
}

//Get Emergency Notifications for today
exports.getEmergencyNotifications = () => {
  const query = `
    SELECT 
      er.Id, 
      er.DRN, 
      er.emergency_code, 
      er.date_time,
      er.Responded,
      er.response_time,
      er.Summary,
      er.User,
      sa.Admin_ID,
      sa.Username,
      sa.Email,
      mpr.Streetname,
      mpr.Housenumber,
      mpr.City,
      mpr.Simnumber,
      CONCAT(
        COALESCE(mpr.Housenumber, ''), 
        CASE WHEN mpr.Housenumber IS NOT NULL THEN ' ' ELSE '' END,
        COALESCE(mpr.Streetname, ''),
        CASE WHEN mpr.City IS NOT NULL THEN ', ' ELSE '' END,
        COALESCE(mpr.City, '')
      ) as full_address
    FROM 
      EmergencyResponse er
    LEFT JOIN 
      MeterProfileReal mpr ON er.DRN = mpr.DRN
    LEFT JOIN 
      SystemAdmins sa ON er.User = sa.Admin_ID
    WHERE 
      er.date_time >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
    ORDER BY 
      er.date_time DESC
  `;
  
  return new Promise((resolve, reject) => {
    db.query(query, (err, notifications) => {
      if (err) {
        console.error('Emergency notifications query error:', err);
        reject(err);
      } else {
        console.log('Emergency notifications found:', notifications.length);
        resolve(notifications);
      }
    });
  });
};

//Respond to notification
exports.respondToNotification = function(notificationId, userId, summary, callback) {
  // First check if already responded
  const checkQuery = `SELECT Responded FROM EmergencyResponse WHERE Id = ?`;
  
  db.query(checkQuery, [notificationId], (err, results) => {
    if (err) {
      console.error('Error checking notification status:', err);
      return callback({ error: 'Database query failed', details: err });
    }

    if (results.length === 0) {
      return callback({ error: 'Notification not found' });
    }

    if (results[0].Responded === 1) {
      return callback({ error: 'Response already given' });
    }

    // If not responded, proceed with update
    const updateQuery = `
      UPDATE EmergencyResponse 
      SET Responded = 1, Summary = ?, User = ?, response_time = NOW()
      WHERE Id = ?
    `;

    db.query(updateQuery, [summary, userId, notificationId], (err, updateResults) => {
      if (err) {
        console.error('Error updating notification response:', err);
        return callback({ error: 'Database update failed', details: err });
      }

      callback(null, { message: 'Notification response updated successfully', affectedRows: updateResults.affectedRows });
    });
  });
}
