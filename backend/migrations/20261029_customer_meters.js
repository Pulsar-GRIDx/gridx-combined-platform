// ═══════════════════════════════════════════════════════════════════════════
// MIGRATION 2026-10-29 — multi-meter customer accounts
//
// Before: SystemUsers.DRN held the one meter an account could see.
// After:  CustomerMeters is the user <-> meter association. One account may
//         hold many meters; a meter may have up to MAX_USERS_PER_METER
//         accounts; at most one of them is the owner.
//
// Tables created (all IF NOT EXISTS, so this is safe to run repeatedly):
//   CustomerMeters      user <-> meter association, role + status
//   MeterLinkRequests   pending "press the button on the meter" proofs
//   MeterDeviceKeys     public key pinned to each meter (meter identity).
//                       A key is only pinned while a pinning window is open
//                       (pin_allowed_until), which a technician opens by
//                       registering the meter, or an admin opens explicitly.
// Columns added:
//   SystemUsers.token_version   bumped to revoke every token for an account
//
// Backfill: every SystemUsers row whose DRN names a meter in MeterProfileReal
// becomes an ACTIVE MEMBER association (verified_via = 'legacy_backfill').
// That is exactly the access those accounts had before. Nobody is made the
// owner by the backfill: SystemUsers.DRN only says the account was signed up
// against the meter, not that it owns it. Ownership is granted by an admin
// or by a meter-button link on a meter with no active users.
//
// SystemUsers.DRN is left in place and untouched: older app builds and
// reports still read it. It is no longer used for authorisation.
//
// The DRN and UserID column types are copied from the referenced tables at
// run time, because the production schema is not in this repository and a
// foreign key needs an exact type/collation match.
//
// Run:  node migrations/20261029_customer_meters.js          (uses .env)
//       node migrations/20261029_customer_meters.js --dry-run
// ═══════════════════════════════════════════════════════════════════════════

var MAX_USERS_PER_METER = 5;

function q(conn, sql, params) {
  return new Promise(function(resolve, reject) {
    conn.query(sql, params || [], function(err, rows) {
      if (err) reject(err); else resolve(rows);
    });
  });
}

async function columnInfo(conn, table, column) {
  var rows = await q(conn,
    'SELECT COLUMN_TYPE, CHARACTER_SET_NAME, COLLATION_NAME, COLUMN_KEY ' +
    'FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [table, column]);
  return rows[0] || null;
}

async function tableExists(conn, table) {
  var rows = await q(conn,
    'SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [table]);
  return rows[0].n > 0;
}

async function isUniquelyIndexed(conn, table, column) {
  var rows = await q(conn,
    'SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.STATISTICS ' +
    'WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? AND NON_UNIQUE = 0 AND SEQ_IN_INDEX = 1',
    [table, column]);
  return rows[0].n > 0;
}

async function constraintExists(conn, table, name) {
  var rows = await q(conn,
    'SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?',
    [table, name]);
  return rows[0].n > 0;
}

function typeClause(info, fallback) {
  if (!info) return fallback;
  var t = info.COLUMN_TYPE;
  if (info.CHARACTER_SET_NAME) t += ' CHARACTER SET ' + info.CHARACTER_SET_NAME + ' COLLATE ' + info.COLLATION_NAME;
  return t;
}

async function migrate(conn, opts) {
  opts = opts || {};
  var log = opts.log || function(m) { console.log('[migrate:customer_meters] ' + m); };
  var report = { created: [], foreignKeys: [], skippedForeignKeys: [], backfilled: 0, unmatchedLegacyUsers: [] };

  if (!(await tableExists(conn, 'SystemUsers'))) throw new Error('SystemUsers table not found');
  if (!(await tableExists(conn, 'MeterProfileReal'))) throw new Error('MeterProfileReal table not found');

  var userCol = await columnInfo(conn, 'SystemUsers', 'UserID');
  var drnCol = await columnInfo(conn, 'MeterProfileReal', 'DRN');
  var userType = typeClause(userCol, 'INT').replace(/\s+auto_increment/i, '');
  var drnType = typeClause(drnCol, 'VARCHAR(20)');

  var tv = await columnInfo(conn, 'SystemUsers', 'token_version');
  if (!tv) {
    if (!opts.dryRun) await q(conn, 'ALTER TABLE SystemUsers ADD COLUMN token_version INT NOT NULL DEFAULT 0');
    log('added SystemUsers.token_version');
  }

  if (!(await tableExists(conn, 'CustomerMeters'))) {
    report.created.push('CustomerMeters');
    if (!opts.dryRun) {
      await q(conn,
        'CREATE TABLE CustomerMeters (' +
        '  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,' +
        '  UserID ' + userType + ' NOT NULL,' +
        '  DRN ' + drnType + ' NOT NULL,' +
        "  role ENUM('owner','member') NOT NULL DEFAULT 'member'," +
        "  status ENUM('active','revoked') NOT NULL DEFAULT 'active'," +
        '  nickname VARCHAR(64) NULL,' +
        "  verified_via VARCHAR(32) NOT NULL," +
        '  created_by VARCHAR(64) NULL,' +
        '  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,' +
        '  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,' +
        '  revoked_at DATETIME NULL,' +
        // At most one active owner per meter, enforced by the database.
        "  active_owner_drn " + drnType + " GENERATED ALWAYS AS (IF(role = 'owner' AND status = 'active', DRN, NULL)) STORED," +
        '  UNIQUE KEY uq_customer_meter (UserID, DRN),' +
        '  UNIQUE KEY uq_one_active_owner (active_owner_drn),' +
        '  KEY idx_meter_status (DRN, status)' +
        ') ENGINE=InnoDB');
    }
    log('created CustomerMeters');
  }

  if (!(await tableExists(conn, 'MeterLinkRequests'))) {
    report.created.push('MeterLinkRequests');
    if (!opts.dryRun) {
      await q(conn,
        'CREATE TABLE MeterLinkRequests (' +
        '  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,' +
        '  token_hash CHAR(64) NOT NULL,' +
        '  DRN ' + drnType + ' NOT NULL,' +
        // NULL for a signup that has no account yet; set for an account
        // adding another meter.
        '  UserID ' + userType + ' NULL,' +
        "  purpose ENUM('registration','link','password_recovery') NOT NULL," +
        "  status ENUM('pending','confirmed','consumed','expired') NOT NULL DEFAULT 'pending'," +
        '  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,' +
        '  expires_at DATETIME NOT NULL,' +
        '  confirmed_at DATETIME NULL,' +
        '  consumed_at DATETIME NULL,' +
        '  UNIQUE KEY uq_token (token_hash),' +
        '  KEY idx_drn_status (DRN, status)' +
        ') ENGINE=InnoDB');
    }
    log('created MeterLinkRequests');
  }

  if (!(await tableExists(conn, 'MeterDeviceKeys'))) {
    report.created.push('MeterDeviceKeys');
    if (!opts.dryRun) {
      await q(conn,
        'CREATE TABLE MeterDeviceKeys (' +
        '  DRN ' + drnType + ' NOT NULL PRIMARY KEY,' +
        // NULL key = no identity yet (window open, or cleared by an admin)
        '  public_key_der_b64 TEXT NULL,' +
        '  key_fingerprint CHAR(64) NULL,' +
        '  token_version INT NOT NULL DEFAULT 0,' +
        '  pin_allowed_until DATETIME NULL,' +
        '  pin_window_opened_by VARCHAR(64) NULL,' +
        '  pinned_at DATETIME NULL,' +
        '  last_registration_at DATETIME NULL,' +
        '  last_nonce BIGINT NULL' +
        ') ENGINE=InnoDB');
    }
    log('created MeterDeviceKeys');
  }

  // Foreign keys: only where the referenced column can carry one. A missing
  // FK is reported, not fatal — the service layer checks both sides anyway.
  if (!opts.dryRun) {
    // Deleting an account removes its links. Deleting a meter that still has
    // linked accounts is refused (RESTRICT): unlink them first. MySQL also
    // forbids CASCADE here, because DRN feeds the active_owner_drn column.
    var fks = [
      { name: 'fk_cm_user', table: 'CustomerMeters', col: 'UserID', refTable: 'SystemUsers', refCol: 'UserID', onDelete: 'CASCADE' },
      { name: 'fk_cm_meter', table: 'CustomerMeters', col: 'DRN', refTable: 'MeterProfileReal', refCol: 'DRN', onDelete: 'RESTRICT' },
    ];
    for (var i = 0; i < fks.length; i++) {
      var fk = fks[i];
      if (await constraintExists(conn, fk.table, fk.name)) { report.foreignKeys.push(fk.name); continue; }
      if (!(await isUniquelyIndexed(conn, fk.refTable, fk.refCol))) {
        report.skippedForeignKeys.push(fk.name + ' (' + fk.refTable + '.' + fk.refCol + ' is not unique)');
        continue;
      }
      try {
        await q(conn, 'ALTER TABLE ' + fk.table + ' ADD CONSTRAINT ' + fk.name + ' FOREIGN KEY (' + fk.col +
          ') REFERENCES ' + fk.refTable + ' (' + fk.refCol + ') ON DELETE ' + fk.onDelete);
        report.foreignKeys.push(fk.name);
      } catch (e) {
        report.skippedForeignKeys.push(fk.name + ' (' + e.code + ')');
      }
    }
  }

  // Backfill from SystemUsers.DRN. INSERT IGNORE + the (UserID, DRN) unique
  // key make a re-run a no-op; an association revoked since the last run is
  // not resurrected because the row still exists.
  var legacy = await q(conn,
    'SELECT su.UserID, su.Email, su.DRN, (mpr.DRN IS NOT NULL) AS meter_exists ' +
    'FROM SystemUsers su LEFT JOIN MeterProfileReal mpr ON mpr.DRN = su.DRN ' +
    "WHERE su.DRN IS NOT NULL AND su.DRN <> ''");
  for (var j = 0; j < legacy.length; j++) {
    var row = legacy[j];
    if (!row.meter_exists) {
      report.unmatchedLegacyUsers.push({ UserID: row.UserID, DRN: row.DRN });
      continue;
    }
    if (opts.dryRun) { report.backfilled++; continue; }
    var r = await q(conn,
      "INSERT IGNORE INTO CustomerMeters (UserID, DRN, role, status, verified_via, created_by) VALUES (?, ?, 'member', 'active', 'legacy_backfill', 'migration:20261029')",
      [row.UserID, row.DRN]);
    report.backfilled += r.affectedRows;
  }

  // Validation: every legacy user with an existing meter now has an
  // association for that meter.
  if (!opts.dryRun) {
    var missing = await q(conn,
      'SELECT COUNT(*) AS n FROM SystemUsers su JOIN MeterProfileReal mpr ON mpr.DRN = su.DRN ' +
      'LEFT JOIN CustomerMeters cm ON cm.UserID = su.UserID AND cm.DRN = su.DRN WHERE cm.id IS NULL');
    report.missingAfterBackfill = missing[0].n;
    if (missing[0].n !== 0) throw new Error('Backfill validation failed: ' + missing[0].n + ' legacy users have no association');
  }

  log('backfilled ' + report.backfilled + ' association(s); ' + report.unmatchedLegacyUsers.length +
    ' legacy user(s) reference a DRN not in MeterProfileReal (left untouched)');
  return report;
}

module.exports = { migrate: migrate, MAX_USERS_PER_METER: MAX_USERS_PER_METER };

if (require.main === module) {
  require('dotenv').config();
  var db = require('../config/db');
  migrate(db, { dryRun: process.argv.indexOf('--dry-run') !== -1 })
    .then(function(report) {
      console.log(JSON.stringify(report, null, 2));
      db.end(function() { process.exit(0); });
    })
    .catch(function(err) {
      console.error('Migration failed:', err.message);
      db.end(function() { process.exit(1); });
    });
}
