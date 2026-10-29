/**
 * Vending routes against a throwaway MySQL database, with the HSM mocked.
 * No real HSM, no real token, no production data. Refuses to run against
 * anything but a localhost database whose name contains "test":
 *
 *   MM_TEST_DB_PORT=3407 npx jest -c tests/multiMeter/jest.config.js
 * (one worker per suite; with --runInBand the multi-meter suite's MQTT
 * reconnect timer outlives it and fails whichever suite runs next.)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2');

// No broker: an inert client, so no reconnect timer outlives the suite.
jest.mock('mqtt', () => {
  const { EventEmitter } = require('events');
  const client = () => Object.assign(new EventEmitter(), {
    connected: false,
    publish: (t, m, o, cb) => { const f = typeof o === 'function' ? o : cb; if (f) f(null); },
    subscribe: (t, o, cb) => { const f = typeof o === 'function' ? o : cb; if (f) f(null, []); },
    unsubscribe: (t, cb) => cb && cb(null),
    end: (f, o, cb) => { const c = [f, o, cb].find((x) => typeof x === 'function'); if (c) c(); },
  });
  return { connect: client, connectAsync: async () => client() };
});

const HOST = process.env.MM_TEST_DB_HOST || '127.0.0.1';
const PORT = process.env.MM_TEST_DB_PORT;
const USER = process.env.MM_TEST_DB_USER || 'root';
const PASS = process.env.MM_TEST_DB_PASSWORD || '';
const DBNAME = 'gridx_vend_test';
const runnable = !!PORT && ['127.0.0.1', 'localhost'].includes(HOST);
const d = runnable ? describe : describe.skip;

const TARGET = '0260028359123'; // the bench meter, in the state read from it on 2026-10-29
const COMM = '0260111222333';   // a meter commissioned into a (test) production SGC
const OTHER = '0260999888777';

let request, app, db, bridge, migration;
const q = (sql, p) => new Promise((ok, ko) => db.query(sql, p || [], (e, r) => (e ? ko(e) : ok(r))));
const jwt = () => require('jsonwebtoken');
const admin = () => jwt().sign({ Admin_ID: 1, Email: 'ops@example.test', AccessLevel: 'ADMIN', access_type: 'BOTH', FirstName: 'Ops', LastName: 'Admin' }, process.env.SECRET_KEY, { expiresIn: '1h' });
const tech = () => jwt().sign({ Admin_ID: 7, Email: 'tech@example.test', AccessLevel: 'TECHNICIAN', access_type: 'PLATFORM' }, process.env.SECRET_KEY, { expiresIn: '1h' });
const post = (url, token, body) => request(app).post(url).set('Authorization', 'Bearer ' + token).send(body || {});
const get = (url, token) => request(app).get(url).set('Authorization', 'Bearer ' + token);

function hsmToken(over) {
  return Object.assign({ drn: COMM, sgc: 600123, krn: 1, ti: 1, tokenClass: 0, subclass: 0, transferAmount: 300, tokenDec: '12345678901234567890' }, over || {});
}

d('vending: STS parameter guard, free tokens and tariffs (integration)', () => {
  // --runInBand shares one process with the other suites: put the environment back.
  const savedEnv = Object.assign({}, process.env);

  beforeAll(async () => {
    const root = mysql.createConnection({ host: HOST, port: Number(PORT), user: USER, password: PASS, multipleStatements: true });
    const rq = (sql, p) => new Promise((ok, ko) => root.query(sql, p || [], (e, r) => (e ? ko(e) : ok(r))));
    await rq('DROP DATABASE IF EXISTS `' + DBNAME + '`');
    await rq('CREATE DATABASE `' + DBNAME + '`');
    await rq('USE `' + DBNAME + '`');
    await rq(fs.readFileSync(path.join(__dirname, '../multiMeter/schema.sql'), 'utf8'));
    await rq('CREATE TABLE IF NOT EXISTS AuditLog (id INT AUTO_INCREMENT PRIMARY KEY, event TEXT, type VARCHAR(50), detail TEXT, user VARCHAR(100), userId INT, ipAddress VARCHAR(64), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
    for (const [drn, tt] of [[TARGET, 'middle_income_residential'], [COMM, null], [OTHER, null]]) {
      await rq("INSERT INTO MeterProfileReal (DRN, Name, Surname, City, UserCategory, tariff_type) VALUES (?, 'T', 'Test', 'Windhoek', 'Home', ?)", [drn, tt]);
    }
    root.end();

    Object.assign(process.env, {
      RDS_HOSTNAME: HOST, RDS_PORT: String(PORT), RDS_USERNAME: USER, RDS_PASSWORD: PASS, RDS_DB_NAME: DBNAME,
      SECRET_KEY: crypto.randomBytes(32).toString('hex'),
      MQTT_BROKER: 'mqtt://127.0.0.1:9', MQTT_BROKER_URL: 'mqtt://127.0.0.1:9',
      RUN_MIGRATIONS_ON_START: 'false', NODE_ENV: 'test',
      HSM_MODE: 'agent', HSM_AGENT_TOKEN: crypto.randomBytes(16).toString('hex'),
    });
    db = require('../../config/db');
    request = require('supertest');
    app = require('../../app');
    bridge = require('../../vending/hsmAgentBridge');
    migration = require('../../migrations/20261029_sts_tariff_guards');

    // vendingRoutes creates its tables, then adds the verification columns.
    for (let i = 0; i < 100; i++) {
      const c = await q("SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TariffGroups' AND COLUMN_NAME = 'supersededAt'");
      const m = await q("SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'MeterSecurityParams' AND COLUMN_NAME = 'meterReportedAt'");
      if (c[0].n && m[0].n) break;
      await new Promise((r) => setTimeout(r, 100));
    }
  }, 60000);

  afterAll((done) => {
    for (const k of Object.keys(process.env)) if (!(k in savedEnv)) delete process.env[k];
    Object.assign(process.env, savedEnv);
    try { const mh = require('../../services/mqttHandler'); mh.getClient && mh.getClient() && mh.getClient().end(true); } catch (e) { /* ignore */ }
    db ? db.end(() => done()) : done();
  });

  afterEach(() => jest.restoreAllMocks());

  const freeTokens = () => q("SELECT * FROM VendingTransactions WHERE type = 'Free Token'");

  describe('migration', () => {
    test('adds the columns once and is idempotent', async () => {
      const again = await migration.migrate(db, { log: () => {} });
      expect(again.added).toEqual([]);
    });
  });

  describe('30 kWh free token for the target meter in its current state', () => {
    test('no STS record: refused before the HSM is touched, nothing recorded', async () => {
      const hsm = jest.spyOn(bridge, 'issueCreditToken');
      const r = await post('/cb/vending/free-token', admin(), { meterNo: TARGET, kWh: 30 });
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('STS_PARAMS_MISSING');
      expect(hsm).not.toHaveBeenCalled();
      expect(await freeTokens()).toHaveLength(0);
    });

    test('registered at factory defaults but never read: STS_METER_STATE_UNVERIFIED', async () => {
      await q("INSERT INTO MeterSecurityParams (meterNumber, sgc, tariffIndex, keyRevisionNumber, keyType, keyExpiryNumber, isActive) VALUES (?, '999907', 1, 2, 0, 255, 1)", [TARGET]);
      const r = await post('/cb/vending/free-token', admin(), { meterNo: TARGET, kWh: 30 });
      expect(r.body.code).toBe('STS_METER_STATE_UNVERIFIED');
    });

    test('recording the real reading (DITK, 999907/2/1) shows the meter is not commissioned', async () => {
      const rep = await post('/cb/vending/sts-params/' + TARGET + '/meter-report', admin(), { sgc: '999907', krn: 2, ti: 1, keyType: 'DITK', ken: 255, ea: 'EA07', via: 'Maintenance app BLE' });
      expect(rep.status).toBe(200);
      expect(rep.body.data).toMatchObject({ vendingAllowed: false, status: 'STS_METER_NOT_COMMISSIONED' });
      const hsm = jest.spyOn(bridge, 'issueCreditToken');
      const r = await post('/cb/vending/free-token', admin(), { meterNo: TARGET, kWh: 30 });
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('STS_METER_NOT_COMMISSIONED');
      expect(hsm).not.toHaveBeenCalled();
      const st = await get('/cb/vending/sts-params/' + TARGET, admin());
      expect(st.body.data.meter).toMatchObject({ sgc: '999907', krn: 2, ti: 1, keyType: 'DITK' });
      expect(st.body.data.backend).toMatchObject({ sgc: '999907', keyType: 'DITK' });
    });

    test('a technician cannot issue tokens or record key state', async () => {
      expect((await post('/cb/vending/free-token', tech(), { meterNo: TARGET, kWh: 30 })).status).toBe(403);
      expect((await post('/cb/vending/thrift-issue-credit', tech(), { drn: TARGET, transferAmount: 300 })).status).toBe(403);
      expect((await post('/cb/vending/sts-params/' + TARGET + '/meter-report', tech(), { sgc: '600123', krn: 1, ti: 1, keyType: 2 })).status).toBe(403);
    });
  });

  describe('a meter commissioned into a production supply group', () => {
    beforeAll(async () => {
      await q("INSERT INTO MeterSecurityParams (meterNumber, sgc, tariffIndex, keyRevisionNumber, keyType, keyExpiryNumber, isActive) VALUES (?, '600123', 1, 1, 2, 255, 1)", [COMM]);
    });

    test('a reading with a different SGC blocks vending with the mismatch listed', async () => {
      const rep = await post('/cb/vending/sts-params/' + COMM + '/meter-report', admin(), { sgc: '999907', krn: 1, ti: 1, keyType: 'DUTK' });
      expect(rep.body.data.status).toBe('STS_CONFIG_MISMATCH');
      expect(rep.body.data.details.mismatches).toEqual([{ field: 'sgc', backend: '600123', meter: '999907' }]);
    });

    test('with a matching reading, 30 kWh is issued once as 300 STS units under the verified SGC', async () => {
      await post('/cb/vending/sts-params/' + COMM + '/meter-report', admin(), { sgc: '600123', krn: 1, ti: 1, keyType: 'DUTK' });
      const hsm = jest.spyOn(bridge, 'issueCreditToken').mockImplementation((mc, sub, amount, cb) => cb(null, { tokens: [hsmToken()], numTokens: 1, messageId: 'm1' }));
      const r = await post('/cb/vending/free-token', admin(), { meterNo: COMM, kWh: 30 });
      expect(r.status).toBe(200);
      expect(r.body.data).toMatchObject({ kWh: 30, stsUnits: 300, stsGenerated: true, token: '12345678901234567890' });
      expect(hsm).toHaveBeenCalledTimes(1);
      const [mc, sub, amount] = hsm.mock.calls[0];
      expect(mc).toMatchObject({ drn: COMM, sgc: '600123', krn: 1, ti: 1, ea: 7 });
      expect([sub, amount]).toEqual([0, 300]);
      const rows = await freeTokens();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ meterNo: COMM, kWh: '30.00', status: 'Completed', operator: 'Ops Admin' });
    });

    test('an HSM token for another SGC or amount is refused and not recorded', async () => {
      for (const bad of [{ sgc: 999907 }, { transferAmount: 3000 }, { drn: OTHER }]) {
        jest.spyOn(bridge, 'issueCreditToken').mockImplementation((mc, sub, amount, cb) => cb(null, { tokens: [hsmToken(bad)], numTokens: 1 }));
        const r = await post('/cb/vending/free-token', admin(), { meterNo: COMM, kWh: 30 });
        expect(r.status).toBe(502);
        expect(r.body.code).toBe('STS_TOKEN_PARAMS_MISMATCH');
        jest.restoreAllMocks();
      }
      expect(await freeTokens()).toHaveLength(1);
    });

    test('HSM unavailable: 502, no random token, nothing recorded', async () => {
      jest.spyOn(bridge, 'issueCreditToken').mockImplementation((mc, sub, amount, cb) => cb(new Error('HSM agent is not connected')));
      const r = await post('/cb/vending/free-token', admin(), { meterNo: COMM, kWh: 30 });
      expect(r.status).toBe(502);
      expect(r.body.code).toBe('HSM_UNAVAILABLE');
      expect(r.body.token).toBeUndefined();
      expect(await freeTokens()).toHaveLength(1);
    });

    test.each([[0], [-5], ['abc'], [30.05]])('kWh %p is rejected', async (kWh) => {
      expect((await post('/cb/vending/free-token', admin(), { meterNo: COMM, kWh })).status).toBe(400);
    });

    test('thrift-issue-credit takes SGC/KRN/TI from the record and refuses a contradicting request', async () => {
      const hsm = jest.spyOn(bridge, 'issueCreditToken').mockImplementation((mc, sub, amount, cb) => cb(null, { tokens: [hsmToken({ transferAmount: 100 })], numTokens: 1 }));
      const bad = await post('/cb/vending/thrift-issue-credit', admin(), { drn: COMM, transferAmount: 100, sgc: 999907 });
      expect(bad.status).toBe(409);
      expect(hsm).not.toHaveBeenCalled();
      const ok = await post('/cb/vending/thrift-issue-credit', admin(), { drn: COMM, transferAmount: 100 });
      expect(ok.status).toBe(200);
      expect(hsm.mock.calls[0][0]).toMatchObject({ sgc: '600123', krn: 1, ti: 1 });
    });

    test('issuing key change tokens records the target and blocks vending until the meter is read again', async () => {
      jest.spyOn(bridge, 'issueKeyChangeTokens').mockImplementation((mc, nc, cb) => cb(null, { tokens: [], numTokens: 2, messageId: 'kc' }));
      const missingFrom = await post('/cb/vending/thrift-issue-keychange', admin(), { drn: COMM, toSgc: 600124, toKrn: 1, toTi: 2 });
      expect(missingFrom.status).toBe(400);
      const kc = await post('/cb/vending/thrift-issue-keychange', admin(), { drn: COMM, sgc: 600123, krn: 1, ti: 1, toSgc: 600124, toKrn: 1, toTi: 2 });
      expect(kc.status).toBe(200);
      await new Promise((r) => setTimeout(r, 200));
      const row = (await q('SELECT sgc, tariffIndex, meterReportedAt FROM MeterSecurityParams WHERE meterNumber = ?', [COMM]))[0];
      expect(row).toEqual({ sgc: '600124', tariffIndex: 2, meterReportedAt: null });
      const r = await post('/cb/vending/free-token', admin(), { meterNo: COMM, kWh: 30 });
      expect(r.body.code).toBe('STS_METER_STATE_UNVERIFIED');
    });

    test('a factory-default SGC needs a referenced admin confirmation', async () => {
      await q("UPDATE MeterSecurityParams SET sgc = '999907', tariffIndex = 1 WHERE meterNumber = ?", [COMM]);
      await post('/cb/vending/sts-params/' + COMM + '/meter-report', admin(), { sgc: '999907', krn: 1, ti: 1, keyType: 'DUTK' });
      expect((await get('/cb/vending/sts-params/' + COMM, admin())).body.data.status).toBe('STS_SGC_DEFAULT_UNCONFIRMED');
      expect((await post('/cb/vending/sts-params/' + COMM + '/confirm-sgc', admin(), { sgc: '999907' })).status).toBe(400);
      expect((await post('/cb/vending/sts-params/' + COMM + '/confirm-sgc', admin(), { sgc: '600123', reference: 'STSA-ALLOC-TEST' })).status).toBe(409);
      expect((await post('/cb/vending/sts-params/' + COMM + '/confirm-sgc', admin(), { sgc: '999907', reference: 'STSA-ALLOC-TEST' })).status).toBe(200);
      expect((await get('/cb/vending/sts-params/' + COMM, admin())).body.data.vendingAllowed).toBe(true);
    });
  });

  describe('tariffs', () => {
    test('the target meter has no valid tariff: info says so, quote refuses, no guessed rate', async () => {
      const info = await get('/cb/vending/tariff-info/' + TARGET, admin());
      expect(info.status).toBe(200);
      expect(info.body.data).toMatchObject({ tariffGroup: null, currentRate: 0, tariffStatus: 'TARIFF_UNKNOWN', tariffSource: 'MeterProfileReal' });
      const pv = await post('/cb/vending/token-preview', admin(), { meterNo: TARGET, amount: 100 });
      expect(pv.status).toBe(409);
      expect(pv.body.code).toBe('TARIFF_UNKNOWN');
    });

    test('a meter with no tariff at all reports TARIFF_NOT_ASSIGNED', async () => {
      const info = await get('/cb/vending/tariff-info/' + OTHER, admin());
      expect(info.body.data.tariffStatus).toBe('TARIFF_NOT_ASSIGNED');
    });

    test('loading the CoW 2026/27 schedule adds 26 groups once and assigns nothing', async () => {
      const sched = require('../../vending/tariffSchedules/windhoek-2026-27');
      const before = await q('SELECT COUNT(*) n FROM TariffGroups');
      const first = await migration.loadTariffSchedule(db, sched, { log: () => {} });
      const second = await migration.loadTariffSchedule(db, sched, { log: () => {} });
      expect(first.inserted).toHaveLength(26);
      expect(second.inserted).toHaveLength(0);
      expect((await q('SELECT COUNT(*) n FROM TariffGroups'))[0].n).toBe(before[0].n + 26);
      const g = (await q("SELECT * FROM TariffGroups WHERE sgc = 'COW2627-RESPP'"))[0];
      expect(g).toMatchObject({ name: 'Residential Prepaid (CoW 2026/27)', type: 'Flat', billingType: 'prepaid', flatRate: '2.4298', charge_vatRate: '0.00', charge_fixedCharge: '0.00', charge_relLevy: '0.00', charge_laSurcharge: '0.1100' });
      const tou = (await q("SELECT id FROM TariffGroups WHERE sgc = 'COW2627-BUS75'"))[0];
      expect((await q('SELECT COUNT(*) n FROM TariffTOUSchedule WHERE tariffGroupId = ?', [tou.id]))[0].n).toBeGreaterThan(7);
      expect((await q('SELECT COUNT(*) n FROM VendingCustomers'))[0].n).toBe(0);
    });

    test('once assigned, the quote uses the official rate, its VAT treatment and levies', async () => {
      await q("INSERT INTO VendingCustomers (accountNo, name, meterNo, tariffGroup, status) VALUES ('T-1', 'Test', ?, 'COW2627-RESPP', 'Active')", [COMM]);
      const pv = await post('/cb/vending/token-preview', admin(), { meterNo: COMM, amount: 100 });
      expect(pv.status).toBe(200);
      expect(pv.body.data.tariffGroup).toBe('Residential Prepaid (CoW 2026/27)');
      expect(pv.body.data.breakdown).toMatchObject({ vatAmount: 0, fixedCharge: 0, relLevy: 0, totalKwh: 38.8 });
      const info = await get('/cb/vending/tariff-info/' + COMM, admin());
      expect(info.body.data).toMatchObject({ tariffStatus: 'OK', currentRate: 2.4298 });
      expect(info.body.data.config.vatRate).toBe('0.00');
    });
  });
});
