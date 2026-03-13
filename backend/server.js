const app = require('./app');
const db = require("./config/db");

// Test the database connection before starting the server
db.getConnection((err, connection) => {
  if (err) {
    console.error("Failed to connect to Database:", err.message);
    return;
  }

  console.log("Successfully connected to database");
  connection.release(); // Release the connection back to the pool

  // Start the server
  app.listen(process.env.PORT || 4000, () => {
    console.log(`Server is running on port ${process.env.PORT || 4000}`);
  });
});
