const notificationService = require('./notificationService');

exports.getAllNotificationsByDRN = (req, res) => {
  const DRN = req.params.DRN;

  notificationService.getNotificationsByDRN(DRN)
    .then(notifications => {
      // Add any necessary logic here
      res.json(notifications);
    })
    .catch(err => {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch notifications' });
    });
};


exports.getAllCriticalNotifications = (req, res) => {
  console.log('getAllCriticalNotifications endpoint called');
  
  notificationService.getAllCriticalNotifications()
    .then(notifications => {
      console.log('Controller received notifications:', notifications.length);
      // Add any necessary logic here
      res.json(notifications);
    })
    .catch(err => {
      console.error('Controller error:', err);
      res.status(500).json({ error: 'Failed to fetch notifications', details: err.message });
    });
};


exports.getAll = (req, res) =>{
  console.log('getAll endpoint called');

  notificationService.getAll()
  .then(notifications => {
    console.log('Controller received notifications count:', notifications.length);
    //Get All Notofications

    res.json({notification: [notifications]});
  })
 .catch(err =>{
  console.error('Controller error in getAll:', err);
  res.status(500).json({error: 'Failed to fetch notifications'});
 });
};

//Get notifications types


exports.getMeterNotificationsByType = function(req, res) {
  notificationService.getSumOfTypes((err, data) => {
        if (err) {
            console.error('Error querying MySQL:', err);
            res.status(404).send('No data found');
            return;
        }

        res.json(data);
    });
}

//Notification types by DRN
//Get notifications types


exports.getMeterNotificationsByTypeByDRN = function(req, res) {

  const DRN = req.params.DRN;

  notificationService.getSumOfTypesByDRN(DRN,(err, data) => {
        if (err) {
            console.error('Error querying MySQL:', err);
            res.status(404).send('No data found');
            return;
        }

        res.json(data);
    });
}

//Get Emergency Notifications
exports.getEmergencyNotifications = (req, res) => {
  notificationService.getEmergencyNotifications()
    .then(notifications => {
      res.json({
        emergencyNotifications: notifications
      });
    })
    .catch(err => {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch emergency notifications' });
    });
};

//Respond to notification
exports.respondToNotification = (req, res) => {
  const notificationId = req.params.notificationId;
  const { userId, summary } = req.body;

  if (!summary) {
    return res.status(400).json({ error: 'Summary is required' });
  }

  if (!userId) {
    return res.status(400).json({ error: 'UserId is required' });
  }

  notificationService.respondToNotification(notificationId, userId, summary, (err, result) => {
    if (err) {
      console.error('Error responding to notification:', err);
      if (err.error === 'Response already given') {
        return res.status(400).json({ error: err.error });
      }
      return res.status(500).json({ error: 'Failed to respond to notification', details: err });
    }

    res.json({ message: 'Notification response recorded successfully', result });
  });
};

// Export other existing methods
exports.getNotificationsByDRN = notificationService.getNotificationsByDRN;

