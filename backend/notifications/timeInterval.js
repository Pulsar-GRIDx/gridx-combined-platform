const cron = require('node-cron');
const db = require('../config/db');

// Check for meters offline for 1+ hour, every 15 minutes
cron.schedule('*/15 * * * *', () => {
  const query = `
    SELECT mp.DRN, MAX(mp.date_time) as last_seen,
      TIMESTAMPDIFF(MINUTE, MAX(mp.date_time), NOW()) as minutes_offline
    FROM MeteringPower mp
    INNER JOIN MeterProfileReal mpr ON mp.DRN = mpr.DRN
    GROUP BY mp.DRN
    HAVING minutes_offline >= 60
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('Offline check error:', err);
      return;
    }
    if (!results || results.length === 0) return;

    results.forEach(meter => {
      const hours = Math.floor(meter.minutes_offline / 60);
      const mins = meter.minutes_offline % 60;
      const offlineText = hours > 0
        ? `Meter offline for ${hours}h ${mins}m (last seen: ${new Date(meter.last_seen).toLocaleString()})`
        : `Meter offline for ${mins} minutes`;

      const checkDup = `
        SELECT ID FROM MeterNotifications
        WHERE DRN = ? AND AlarmType = 'Meter Offline'
          AND date_time >= DATE_SUB(NOW(), INTERVAL 2 HOUR)
        LIMIT 1
      `;

      db.query(checkDup, [meter.DRN], (err2, existing) => {
        if (err2) return;
        if (existing && existing.length > 0) return;

        const insert = `
          INSERT INTO MeterNotifications (Alarm, DRN, date_time, Type, AlarmType, Urgency_Type)
          VALUES (?, ?, NOW(), 'Warning', 'Meter Offline', 'High')
        `;
        db.query(insert, [offlineText, meter.DRN], (err3) => {
          if (err3) console.error('Failed to insert offline notification:', err3);
          else console.log(`Offline notification inserted for ${meter.DRN}`);
        });
      });
    });
  });
});

console.log('Meter offline detection cron scheduled (every 15 min, 1-hour threshold)');
