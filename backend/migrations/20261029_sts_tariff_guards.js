// ═══════════════════════════════════════════════════════════════════════════
// MIGRATION 2026-10-29 — STS parameter verification and explicit tariffs
//
// Columns added (all nullable, IF the table exists; safe to run repeatedly):
//   MeterSecurityParams.meterReported*   key state read from the meter itself
//                                        (sys:key_state over BLE). NULL until
//                                        a technician records a reading, and
//                                        reset to NULL by every key change.
//   MeterSecurityParams.sgcConfirmed*    admin confirmation that a factory
//                                        default SGC (999907/999901) really
//                                        is the allocated production SGC.
//   TariffGroups.charge_*                per-group VAT and levies (NULL = use
//                                        the global TariffConfig value).
//   TariffGroups.sourceRef/supersededAt  provenance and retirement of a
//                                        published tariff schedule.
//
// Nothing is backfilled: existing meters stay unverified, which is the point —
// vend is refused until each meter's key state has been read.
//
// Tariff schedules are loaded separately, by hand, because they change prices:
//   node migrations/20261029_sts_tariff_guards.js --load-tariffs windhoek-2026-27 [--dry-run]
// Loading only ADDS the schedule's groups (named "... (CoW 2026/27)"); it does
// not assign them to any meter or change existing groups.
// ═══════════════════════════════════════════════════════════════════════════

function q(conn, sql, params) {
  return new Promise(function(resolve, reject) {
    conn.query(sql, params || [], function(err, rows) { if (err) reject(err); else resolve(rows); });
  });
}

async function tableExists(conn, table) {
  var r = await q(conn, 'SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [table]);
  return r[0].n > 0;
}

async function columnExists(conn, table, column) {
  var r = await q(conn, 'SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?', [table, column]);
  return r[0].n > 0;
}

var COLUMNS = {
  MeterSecurityParams: [
    ['meterReportedSgc', 'VARCHAR(6) NULL'],
    ['meterReportedKrn', 'TINYINT NULL'],
    ['meterReportedTi', 'TINYINT NULL'],
    ['meterReportedKeyType', 'TINYINT NULL'],
    ['meterReportedKen', 'SMALLINT NULL'],
    ['meterReportedEa', 'VARCHAR(2) NULL'],
    ['meterReportedAt', 'DATETIME NULL'],
    ['meterReportedBy', 'VARCHAR(100) NULL'],
    ['sgcConfirmedAt', 'DATETIME NULL'],
    ['sgcConfirmedBy', 'VARCHAR(100) NULL'],
    ['sgcConfirmationRef', 'VARCHAR(255) NULL'],
  ],
  TariffGroups: [
    ['charge_vatRate', 'DECIMAL(5,2) NULL'],
    ['charge_fixedCharge', 'DECIMAL(10,2) NULL'],
    ['charge_relLevy', 'DECIMAL(10,2) NULL'],
    ['charge_ecbLevy', 'DECIMAL(8,4) NULL'],
    ['charge_nefLevy', 'DECIMAL(8,4) NULL'],
    ['charge_laSurcharge', 'DECIMAL(8,4) NULL'],
    ['sourceRef', 'VARCHAR(255) NULL'],
    ['supersededAt', 'DATETIME NULL'],
  ],
};

async function migrate(conn, opts) {
  opts = opts || {};
  var log = opts.log || function(m) { console.log('[migrate:sts_tariff_guards] ' + m); };
  var added = [];
  for (var table of Object.keys(COLUMNS)) {
    if (!(await tableExists(conn, table))) { log('table ' + table + ' absent; skipped'); continue; }
    for (var c of COLUMNS[table]) {
      if (await columnExists(conn, table, c[0])) continue;
      if (!opts.dryRun) await q(conn, 'ALTER TABLE `' + table + '` ADD COLUMN `' + c[0] + '` ' + c[1]);
      added.push(table + '.' + c[0]);
    }
  }
  log((opts.dryRun ? 'would add ' : 'added ') + added.length + ' column(s)' + (added.length ? ': ' + added.join(', ') : ''));
  return { added: added };
}

// Adds a published schedule's groups, blocks and TOU slots. Idempotent by
// tariff code (TariffGroups.sgc holds the tariff code, not an STS SGC).
async function loadTariffSchedule(conn, schedule, opts) {
  opts = opts || {};
  var log = opts.log || function(m) { console.log('[tariffs:' + schedule.id + '] ' + m); };
  var report = { inserted: [], existing: [] };
  var slots = schedule.touSchedule();
  for (var g of schedule.groups()) {
    var have = await q(conn, 'SELECT id FROM TariffGroups WHERE sgc = ?', [g.code]);
    if (have.length) { report.existing.push(g.code); continue; }
    report.inserted.push(g.code);
    if (opts.dryRun) continue;
    var desc = g.category + ' — City of Windhoek, ECB-approved, effective ' + g.effectiveDate +
      (g.vatRate === null ? '. VAT depends on the account holder (residential 0%, non-residential 15%).' : '.');
    var ins = await q(conn,
      'INSERT INTO TariffGroups (name, sgc, description, type, billingType, flatRate, peakRate, standardRate, offPeakRate, ' +
      'capacityCharge, demandCharge, networkAccessCharge, effectiveDate, customerCount, ' +
      'charge_vatRate, charge_fixedCharge, charge_relLevy, charge_ecbLevy, charge_nefLevy, charge_laSurcharge, sourceRef) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, 0, ?, ?, ?, ?)',
      [g.name, g.code, desc, g.type, g.billingType, g.flatRate, g.peakRate, g.standardRate, g.offPeakRate,
        g.capacityCharge, g.demandCharge, g.networkAccessCharge, g.effectiveDate,
        g.vatRate, g.levies.ecbLevy, g.levies.nefLevy, g.levies.laSurcharge, g.sourceRef]);
    var gid = ins.insertId;
    for (var i = 0; i < g.blocks.length; i++) {
      var b = g.blocks[i];
      await q(conn, 'INSERT INTO TariffBlocks (tariffGroupId, name, rangeLabel, rate, minKwh, maxKwh, period, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [gid, b.name, b.rangeLabel, b.rate, b.minKwh, b.maxKwh, b.period, i]);
    }
    if (g.type === 'TOU') {
      for (var s of slots) {
        await q(conn, 'INSERT INTO TariffTOUSchedule (tariffGroupId, dayOfWeek, startHour, endHour, period) VALUES (?, ?, ?, ?, ?)',
          [gid, s.dayOfWeek, s.startHour, s.endHour, s.period]);
      }
    }
  }
  log((opts.dryRun ? 'would insert ' : 'inserted ') + report.inserted.length + ' group(s); ' + report.existing.length + ' already present');
  return report;
}

module.exports = { migrate: migrate, loadTariffSchedule: loadTariffSchedule, COLUMNS: COLUMNS };

if (require.main === module) {
  require('dotenv').config();
  var db = require('../config/db');
  var argv = process.argv;
  var dryRun = argv.indexOf('--dry-run') !== -1;
  var li = argv.indexOf('--load-tariffs');
  (async function() {
    await migrate(db, { dryRun: dryRun });
    if (li !== -1) {
      var id = argv[li + 1];
      if (!/^[a-z0-9-]+$/.test(id || '')) throw new Error('--load-tariffs needs a schedule id, e.g. windhoek-2026-27');
      await loadTariffSchedule(db, require('../vending/tariffSchedules/' + id), { dryRun: dryRun });
    }
  })().then(function() { db.end(); }, function(e) { console.error('FAILED:', e.message); db.end(); process.exitCode = 1; });
}
