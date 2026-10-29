-- Minimal pre-migration schema for the multi-meter integration tests.
-- Mirrors the columns the production code reads; it is NOT the production
-- schema (which is not in this repository).
CREATE TABLE SystemUsers (
  UserID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  Email VARCHAR(255) NOT NULL UNIQUE,
  Password VARCHAR(255) NOT NULL,
  FirstName VARCHAR(100) DEFAULT '',
  LastName VARCHAR(100) DEFAULT '',
  DRN VARCHAR(20) DEFAULT NULL,
  isVerified VARCHAR(5) DEFAULT '1',
  login_count INT DEFAULT 0,
  lastLoginTime DATETIME DEFAULT NULL,
  ip_address VARCHAR(50) DEFAULT NULL,
  failed_login_count INT DEFAULT 0,
  locked_until DATETIME DEFAULT NULL,
  last_failed_login DATETIME DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE MeterProfileReal (
  DRN VARCHAR(20) NOT NULL PRIMARY KEY,
  SIMNumber VARCHAR(30), UserCategory VARCHAR(30), Region VARCHAR(60), City VARCHAR(60),
  StreetName VARCHAR(100), HouseNumber VARCHAR(30), Surname VARCHAR(60), Name VARCHAR(60),
  TransformerDRN VARCHAR(20), tariff_type VARCHAR(30)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE MeteringPower (
  ID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  DRN VARCHAR(20), active_power DOUBLE, voltage DOUBLE, current DOUBLE,
  date_time DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE MeterHourlyEnergy (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  DRN VARCHAR(20), hourly_data JSON, cumulative DOUBLE, peak_power DOUBLE, total DOUBLE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE MeterAuthorizedNumbers (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  drn VARCHAR(20), phone_number VARCHAR(30)
) ENGINE=InnoDB;

CREATE TABLE UserNotifications (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  UserID INT NOT NULL, category VARCHAR(40), title VARCHAR(200), body TEXT,
  related_drn VARCHAR(20), source_event_id VARCHAR(200), meta_json JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, delivered_at DATETIME NULL,
  UNIQUE KEY uq_user_event (UserID, source_event_id)
) ENGINE=InnoDB;

CREATE TABLE PlatformAuditLog (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event VARCHAR(500), type VARCHAR(50), detail TEXT, user_email VARCHAR(255), user_id INT,
  ip_address VARCHAR(50), geo_location VARCHAR(200), user_agent VARCHAR(500),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE MeterMainsControl (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  DRN VARCHAR(20), state VARCHAR(5), date_time DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE MeterLocationInfoTable (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  DRN VARCHAR(20), Longitude DOUBLE, Lat DOUBLE, pLng DOUBLE, pLat DOUBLE, PowerSupply VARCHAR(30),
  Type VARCHAR(30), Suburb VARCHAR(60), LocationName VARCHAR(60), Status INT
) ENGINE=InnoDB;
