const fs = require('fs');
const connection = require("../../service/hwDatabase.js");

const MetersModels = function(DRN) {
  this.DRN = DRN;

};

MetersModels.storeFileInDatabase = (fileName, filePath) => {
  const fileContent = fs.readFileSync(filePath);

  // Insert the file into the database
  const sql = 'INSERT INTO meterLogs (name, content) VALUES (?, ?)';
  connection.query(sql, [fileName, fileContent], (err, result) => {
    if (err) {
      console.error('Error storing file in database:', err);
      return;
    }
  });
}

MetersModels.getFileContent = (fileName, callback) => {
  const sql = 'SELECT content FROM meterLogs WHERE name = ?';
  connection.query(sql, [fileName], (err, results) => {
    if (err) {
      console.error('Error querying database:', err);
      return callback(err, null);
    }

    if (results.length === 0) {
      console.error(`File ${fileName} not found in database`);
      return callback(null, null);
    }

    const fileContent = results[0].content;
    callback(null, fileContent);
  });
}

module.exports = MetersModels;
