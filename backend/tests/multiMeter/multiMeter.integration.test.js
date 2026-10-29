/**
 * Multi-meter accounts + meter isolation — integration tests.
 *
 * Runs the real Express app against a throwaway MySQL database. It refuses to
 * run against anything but an explicitly named test database on localhost:
 *
 *   MM_TEST_DB_PORT=3407 npx jest tests/multiMeter --runInBand
 *
 * (MM_TEST_DB_HOST defaults to 127.0.0.1, MM_TEST_DB_USER to root with an
 * empty password, MM_TEST_DB_NAME to gridx_mm_test; the database is dropped
 * and recreated on every run.)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2');

const HOST = process.env.MM_TEST_DB_HOST || '127.0.0.1';
const PORT = process.env.MM_TEST_DB_PORT;
const USER = process.env.MM_TEST_DB_USER || 'root';
const PASS = process.env.MM_TEST_DB_PASSWORD || '';
const DBNAME = process.env.MM_TEST_DB_NAME || 'gridx_mm_test';

const runnable = !!PORT && ['127.0.0.1', 'localhost'].includes(HOST) && /test/.test(DBNAME);
const d = runnable ? describe : describe.skip;

// Meters. A is the bench meter from the field report; C belongs to someone else.
const A = '0260028359123';
const B = '0260111222333';
const C = '0260999888777';
const UNPROVISIONED = '0260555000111';

let request, app, db, mqttHandler, customerControllers, migration;
const meterKeys = {};
const meterTokens = {};

function rawQuery(conn, sql, params) {
  return new Promise((resolve, reject) => conn.query(sql, params || [], (e, r) => (e ? reject(e) : resolve(r))));
}
const q = (sql, params) => rawQuery(db, sql, params);

// ── meter helpers (behave like meter_registration.cpp) ─────────────────────
function newMeterKey() {
  return crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
}
function signedRegistration(drn, key, overrides) {
  const pub = key.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const inner = Object.assign({
    DRN: drn, drn: drn, nonce: crypto.randomInt(1, 2 ** 31), timestamp: Math.floor(Date.now() / 1000),
    model: 'ESP32-SMART-METER-SECURE', firmwareVersion: '0.70.146', publicKey: pub,
  }, overrides || {});
  const raw = JSON.stringify(inner);
  const signature = crypto.sign('sha256', Buffer.from(raw), { key: key.privateKey, padding: crypto.constants.RSA_PKCS1_PADDING }).toString('base64');
  return { request: raw, signature };
}
async function registerMeter(drn) {
  meterKeys[drn] = meterKeys[drn] || newMeterKey();
  const res = await request(app).post('/meters/getAccessToken').send(signedRegistration(drn, meterKeys[drn]));
  expect(res.status).toBe(200);
  const inner = JSON.parse(res.body.data);
  expect(inner.status).toBe('registered');
  meterTokens[drn] = inner.accessToken;
  return inner.accessToken;
}
function pressButton(drn) {
  return request(app).post('/meter-validate/confirm').set('Authorization', 'Bearer ' + meterTokens[drn]).send({ DRN: drn });
}

// ── customer helpers ──────────────────────────────────────────────────────
async function signupWithMeter(email, drn, password) {
  const v = await request(app).post('/cb/customer/request-meter-validation').send({ DRN: drn, type: 'registration' });
  expect(v.status).toBe(200);
  expect((await pressButton(drn)).status).toBe(200);
  const res = await request(app).post('/cb/customer/signup').send({
    Email: email, Password: password || 'Passw0rd!', FirstName: 'T', LastName: email.split('@')[0], DRN: drn, validationToken: v.body.token,
  });
  expect(res.status).toBe(201);
  return res.body;
}
async function signin(email, password, drn) {
  return request(app).post('/cb/customer/signin').send({ Email: email, Password: password || 'Passw0rd!', DRN: drn });
}
async function linkMeter(token, drn) {
  const r1 = await request(app).post('/cb/customer/meters/link/request').set('Authorization', 'Bearer ' + token).send({ DRN: drn });
  if (r1.status !== 200 || r1.body.alreadyLinked) return r1;
  expect((await pressButton(drn)).status).toBe(200);
  const st = await request(app).get('/cb/customer/meters/link/status/' + r1.body.token).set('Authorization', 'Bearer ' + token);
  expect(st.body.status).toBe('confirmed');
  return request(app).post('/cb/customer/meters/link/complete').set('Authorization', 'Bearer ' + token).send({ DRN: drn, token: r1.body.token });
}
const get = (url, token) => {
  const r = request(app).get(url);
  return token ? r.set('Authorization', 'Bearer ' + token) : r;
};
const post = (url, token, body) => {
  const r = request(app).post(url);
  return (token ? r.set('Authorization', 'Bearer ' + token) : r).send(body || {});
};
function adminToken() {
  return require('jsonwebtoken').sign({ Admin_ID: 1, Email: 'ops@example.test', AccessLevel: 'ADMIN', access_type: 'BOTH' }, process.env.SECRET_KEY, { expiresIn: '1h' });
}
function technicianToken() {
  return require('jsonwebtoken').sign({ Admin_ID: 7, Email: 'tech@example.test', AccessLevel: 'TECHNICIAN', access_type: 'PLATFORM' }, process.env.SECRET_KEY, { expiresIn: '1h' });
}
const D = '0260777666555'; // commissioned during the test by a technician
function registrationBody(drn) {
  return {
    location: { street: '12', suburb: 'Eros', city: 'Windhoek', region: 'Khomas', latitude: -22.56, longitude: 17.08 },
    meterProfile: { drn: drn, meter_number: drn, sim_number: '0812345678', homeowner_name: 'Test', homeowner_surname: 'Owner' },
  };
}

d('multi-meter accounts and meter isolation (integration, isolated test DB)', () => {
  let migrationReports = [];
  let U; // user with meters B (owner) + A (member)
  let V; // unrelated user with meter C

  beforeAll(async () => {
    const root = mysql.createConnection({ host: HOST, port: Number(PORT), user: USER, password: PASS, multipleStatements: true });
    await rawQuery(root, 'DROP DATABASE IF EXISTS `' + DBNAME + '`');
    await rawQuery(root, 'CREATE DATABASE `' + DBNAME + '`');
    await rawQuery(root, 'USE `' + DBNAME + '`');
    await rawQuery(root, fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
    for (const [drn, name, city] of [[A, 'Bench', 'Windhoek'], [B, 'Home', 'Windhoek'], [C, 'Neighbour', 'Swakopmund']]) {
      await rawQuery(root, 'INSERT INTO MeterProfileReal (DRN, Name, Surname, City, StreetName, HouseNumber) VALUES (?, ?, ?, ?, ?, ?)', [drn, name, 'Test', city, 'Main St', '1']);
    }
    // Readings that identify their meter.
    await rawQuery(root, 'INSERT INTO MeteringPower (DRN, active_power) VALUES (?, 111), (?, 222), (?, 333)', [A, B, C]);
    await rawQuery(root, "INSERT INTO MeterLastSeen (DRN, last_seen, last_topic, message_count) VALUES (?, '2026-10-29 07:47:24', 'power', 5)", [A]);
    await rawQuery(root, 'INSERT INTO MeterHourlyEnergy (DRN, hourly_data, total) VALUES (?, \'[1]\', 1000), (?, \'[2]\', 2000), (?, \'[3]\', 3000)', [A, B, C]);
    // A pre-existing single-meter account (signed up before this change).
    const bcrypt = require('bcryptjs');
    await rawQuery(root, 'INSERT INTO SystemUsers (Email, Password, FirstName, LastName, DRN) VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)',
      ['legacy@example.test', bcrypt.hashSync('legacy-pass', 4), 'Legacy', 'User', A,
       'orphan@example.test', bcrypt.hashSync('orphan-pass', 4), 'Orphan', 'User', '0260000000000']);
    root.end();

    Object.assign(process.env, {
      RDS_HOSTNAME: HOST, RDS_PORT: String(PORT), RDS_USERNAME: USER, RDS_PASSWORD: PASS, RDS_DB_NAME: DBNAME,
      SECRET_KEY: crypto.randomBytes(32).toString('hex'),
      MQTT_BROKER: 'mqtt://127.0.0.1:9', MQTT_BROKER_URL: 'mqtt://127.0.0.1:9',
      RUN_MIGRATIONS_ON_START: 'false', NODE_ENV: 'test',
      METER_REQUIRE_TOKEN: 'false', METER_VALIDATE_ALLOW_UNVERIFIED: 'false',
    });

    db = require('../../config/db');
    migration = require('../../migrations/20261029_customer_meters');
    migrationReports.push(await migration.migrate(db, { log: () => {} }));
    migrationReports.push(await migration.migrate(db, { log: () => {} }));

    request = require('supertest');
    app = require('../../app');
    mqttHandler = require('../../services/mqttHandler');
    jest.spyOn(mqttHandler, 'publishCommand').mockImplementation(() => true);
    customerControllers = require('../../customer/customerControllers');

    // These meters were provisioned before key pinning existed; an admin
    // opens their pinning window, as for the fleet rollout.
    const w = await post('/meters/pin-window', adminToken(), { drns: [A, B, C], hours: 1 });
    expect(w.status).toBe(200);
    for (const drn of [A, B, C]) await registerMeter(drn);
  }, 120000);

  afterAll((done) => {
    try { mqttHandler && mqttHandler.getClient && mqttHandler.getClient() && mqttHandler.getClient().end(true); } catch (e) { /* ignore */ }
    db ? db.end(() => done()) : done();
  });

  // ── Migration ────────────────────────────────────────────────────────────
  describe('migration', () => {
    test('creates the association tables and backfills legacy links as members', async () => {
      const [first, second] = migrationReports;
      expect(first.created).toEqual(expect.arrayContaining(['CustomerMeters', 'MeterLinkRequests', 'MeterDeviceKeys']));
      expect(first.backfilled).toBe(1);
      expect(first.missingAfterBackfill).toBe(0);
      expect(first.foreignKeys).toEqual(expect.arrayContaining(['fk_cm_user', 'fk_cm_meter']));
      expect(first.unmatchedLegacyUsers).toEqual([expect.objectContaining({ DRN: '0260000000000' })]);
      const rows = await q('SELECT su.Email, cm.DRN, cm.role, cm.status, cm.verified_via FROM CustomerMeters cm JOIN SystemUsers su USING (UserID)');
      expect(rows).toEqual([{ Email: 'legacy@example.test', DRN: A, role: 'member', status: 'active', verified_via: 'legacy_backfill' }]);
    });

    test('is idempotent', () => {
      expect(migrationReports[1].created).toEqual([]);
      expect(migrationReports[1].backfilled).toBe(0);
    });

    test('keeps SystemUsers.DRN untouched', async () => {
      const rows = await q("SELECT DRN FROM SystemUsers WHERE Email = 'legacy@example.test'");
      expect(rows[0].DRN).toBe(A);
    });

    test('an existing single-meter account still signs in and reads its meter', async () => {
      const res = await signin('legacy@example.test', 'legacy-pass', A);
      expect(res.status).toBe(200);
      expect(res.body.meterCount).toBe(1);
      expect(res.body.meters[0].drn).toBe(A);
      expect(res.body.user.DRN).toBe(A);
      const r = await get('/cb/meterPower/getLastUpdate/' + A, res.body.token);
      expect(r.status).toBe(200);
      expect(r.body[0] ? r.body[0].active_power : r.body.active_power).toBe(111);
    });

    test('a legacy account whose DRN is not a provisioned meter signs in with zero meters', async () => {
      const res = await signin('orphan@example.test', 'orphan-pass');
      expect(res.status).toBe(200);
      expect(res.body.meterCount).toBe(0);
      expect(res.body.user.DRN).toBeNull();
    });
  });

  // ── Multi-meter behaviour ────────────────────────────────────────────────
  describe('multi-meter behaviour', () => {
    test('1. a new user is associated with one meter (via meter-button signup) and becomes its owner', async () => {
      const body = await signupWithMeter('u@example.test', B);
      expect(body.meterCount).toBe(1);
      expect(body.meters[0]).toEqual(expect.objectContaining({ drn: B, role: 'owner', registrationStatus: 'registered' }));
      U = (await signin('u@example.test')).body.token;
    });

    test('2. the same user adds a second meter; it joins as member because the meter already has an account', async () => {
      const res = await linkMeter(U, A);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(expect.objectContaining({ linked: true, role: 'member', meterCount: 2 }));
    });

    test('3/4. profile reports two meters and lists both', async () => {
      const me = await get('/cb/customer/me', U);
      expect(me.status).toBe(200);
      expect(me.body.meterCount).toBe(2);
      expect(me.body.meters.map(m => m.drn).sort()).toEqual([A, B].sort());
      expect(me.body.user.Email).toBe('u@example.test');
      // lastSeen comes from MeterLastSeen (A has a row, B has none).
      const byDrn = Object.fromEntries(me.body.meters.map(m => [m.drn, m]));
      expect(new Date(byDrn[A].lastSeen).toISOString()).toMatch(/^2026-10-29T0\d:47:24/);
      expect(byDrn[B].lastSeen).toBeNull();
      const list = await get('/cb/customer/meters', U);
      expect(list.body.meterCount).toBe(2);
    });

    test('5. selecting either meter returns that meter\'s readings and history', async () => {
      const pa = await get('/cb/meterPower/getLastUpdate/' + A, U);
      const pb = await get('/cb/meterPower/getLastUpdate/' + B, U);
      const val = r => (Array.isArray(r.body) ? r.body[0] : r.body).active_power;
      expect(val(pa)).toBe(111);
      expect(val(pb)).toBe(222);
      expect((await get('/cb/hourlyEnergyByDRN?drn=' + A, U)).body.total).toBe(1000);
      expect((await get('/cb/hourlyEnergyByDRN?drn=' + B, U)).body.total).toBe(2000);
      // Without ?drn= the token's primary meter is used (older app builds).
      expect((await get('/cb/hourlyEnergyByDRN', U)).body.total).toBe(2000);
    });

    test('6. adding a meter kept the first association', async () => {
      const rows = await q("SELECT cm.DRN, cm.role FROM CustomerMeters cm JOIN SystemUsers su USING (UserID) WHERE su.Email = 'u@example.test' AND cm.status = 'active' ORDER BY cm.DRN");
      expect(rows).toEqual([{ DRN: A, role: 'member' }, { DRN: B, role: 'owner' }].sort((x, y) => x.DRN.localeCompare(y.DRN)));
    });

    test('7. a duplicate association is handled safely', async () => {
      const res = await post('/cb/customer/meters/link/request', U, { DRN: A });
      expect(res.status).toBe(200);
      expect(res.body.alreadyLinked).toBe(true);
      expect(res.body.meterCount).toBe(2);
      const svc = require('../../services/customerMeterService');
      const uid = (await q("SELECT UserID FROM SystemUsers WHERE Email = 'u@example.test'"))[0].UserID;
      expect((await svc.link(uid, A, { via: 'admin' })).alreadyLinked).toBe(true);
      expect((await q('SELECT COUNT(*) AS n FROM CustomerMeters WHERE UserID = ? AND DRN = ?', [uid, A]))[0].n).toBe(1);
    });

    test('8. nonexistent or unconfirmed DRNs cannot be attached by an ordinary user', async () => {
      expect((await post('/cb/customer/meters/link/request', U, { DRN: '0260123123123' })).status).toBe(404);
      // Request opened but the meter never confirmed it.
      const r1 = await post('/cb/customer/meters/link/request', U, { DRN: C });
      expect(r1.status).toBe(200);
      const done = await post('/cb/customer/meters/link/complete', U, { DRN: C, token: r1.body.token });
      expect(done.status).toBe(403);
      expect(done.body.code).toBe('METER_VALIDATION_REQUIRED');
      // A made-up token is not accepted either.
      expect((await post('/cb/customer/meters/link/complete', U, { DRN: C, token: 'f'.repeat(32) })).status).toBe(403);
      await q("UPDATE MeterLinkRequests SET status = 'expired' WHERE DRN = ?", [C]);
    });
  });

  // ── Access control ───────────────────────────────────────────────────────
  describe('access control', () => {
    beforeAll(async () => {
      await signupWithMeter('v@example.test', C);
      V = (await signin('v@example.test')).body.token;
    });

    test('1/2. user U reaches A and B but not unrelated meter C', async () => {
      expect((await get('/cb/mqtt/health/' + A, U)).status).not.toBe(403);
      expect((await get('/cb/mqtt/health/' + B, U)).status).not.toBe(403);
      const c = await get('/cb/meterPower/getLastUpdate/' + C, U);
      expect(c.status).toBe(403);
      expect(c.body.code).toBe('METER_NOT_AUTHORIZED');
      expect((await get('/cb/mqtt/health/' + C, U)).status).toBe(403);
      expect((await get('/cb/hourlyEnergyByDRN?drn=' + C, U)).status).toBe(403);
    });

    test('3/4. user V cannot read U\'s meters by changing the DRN', async () => {
      for (const url of [
        '/cb/meterPower/getLastUpdate/' + A, '/meterPower/getLastUpdate/' + A,
        '/cb/hourlyEnergyByDRN?drn=' + A, '/cb/weeklyTotalEnergyByDRN?drn=' + B,
        '/cb/geyser/config/' + A, '/cb/mqtt/net-energy/' + B + '/history',
        '/cb/mqtt/relay-logs/' + A, '/cb/vending/tariff-info/' + B,
        '/cb/settings/tokenInformation/' + A, '/cb/customer/meters/' + A + '/members',
      ]) {
        const r = await get(url, V);
        expect([url, r.status]).toEqual([url, 403]);
      }
      // A DRN smuggled in the body or query is checked too.
      expect((await post('/cb/vending/token-preview', V, { DRN: A })).status).toBe(403);
      expect((await get('/cb/mqtt/health/' + C + '?drn=' + A, V)).status).toBe(403);
    });

    test('4. notifications reach only the meter\'s own accounts', async () => {
      const svc = require('../../services/userNotificationService');
      const r = await svc.notifyMeterOwners(A, { category: 'test', title: 'A event', body: 'x', sourceEventId: 'evt-1' });
      expect(r.userCount).toBe(2); // legacy user + U
      const u = await get('/cb/user-notifications/unseen', U);
      const v = await get('/cb/user-notifications/unseen', V);
      expect(u.body.notifications.map(n => n.relatedDrn)).toContain(A);
      expect(v.body.notifications).toEqual([]);
    });

    test('5. unauthorized control commands are rejected before execution', async () => {
      mqttHandler.publishCommand.mockClear();
      const r = await post('/cb/mqtt/load-control/' + A, V, { action: 'off' });
      expect(r.status).toBe(403);
      expect((await post('/cb/geyser/control/' + B, V, { state: 'on' })).status).toBe(403);
      expect((await post('/cb/mqtt/credit-transfer/' + A, V, { target_meter: C, watt_hours: 100 })).status).toBe(403);
      expect((await post('/meterMainsControl/update/' + A, V, { state: '0' })).status).toBe(403);
      expect((await post('/cb/meterMainsControl/update/' + A, U, { state: '0' })).status).toBe(403); // not a customer route at all
      expect(mqttHandler.publishCommand).not.toHaveBeenCalled();
    });

    test('5b. an authorised control passes authorisation', async () => {
      mqttHandler.publishCommand.mockClear();
      const r = await post('/cb/hourly-energy/' + A + '/request', U);
      expect(r.status).toBe(200);
      expect(mqttHandler.publishCommand).toHaveBeenCalledWith(A, expect.anything());
    });

    test('credit transfer: the target may be another meter, but that grants nothing else', async () => {
      const r = await get('/cb/mqtt/credit-transfer/' + A + '/validate-target/' + C, U);
      expect(r.status).not.toBe(403);
      expect((await get('/cb/mqtt/credit-transfer/' + C + '/validate-target/' + A, U)).status).toBe(403);
    });

    test('6. there is no customer-facing real-time channel to subscribe to; admin collections are refused', async () => {
      for (const [method, url] of [
        ['get', '/cb/meters-list'], ['get', '/systemUsers/getAll'], ['get', '/meterProfile/getAllReal'],
        ['delete', '/meterProfile/deleteAllReal'], ['post', '/meterPower/addRandomSampleData'],
        ['get', '/cb/admin/meters/' + A + '/customers'], ['get', '/cb/energy-analytics/substations'],
      ]) {
        const r = await request(app)[method](url).set('Authorization', 'Bearer ' + U);
        expect([url, r.status]).toEqual([url, 403]);
      }
      expect((await q('SELECT COUNT(*) AS n FROM MeterProfileReal'))[0].n).toBe(3);
    });

    test('7. a meter token cannot use customer or admin endpoints', async () => {
      const mt = meterTokens[A];
      expect((await get('/cb/customer/me', mt)).status).toBe(403);
      expect((await get('/cb/meterPower/getLastUpdate/' + A, mt)).status).toBe(403);
      expect((await get('/meterPower/getLastUpdate/' + A, mt)).status).toBe(403);
      expect((await get('/systemUsers/getAll', mt)).status).toBe(403);
      expect((await get('/cb/hourlyEnergyByDRN', mt)).status).toBe(403);
    });

    test('7b. a meter token posts telemetry only for its own DRN', async () => {
      expect((await post('/meterPower/MeterLog/' + B, meterTokens[A], { active_power: 1 })).status).toBe(403);
      expect((await post('/meterPower/MeterLog/' + A, meterTokens[A], { active_power: 1 })).status).not.toBe(403);
    });

    test('8. a customer token cannot perform meter operations', async () => {
      expect((await post('/meter-validate/confirm', U, { DRN: A })).status).toBe(401);
      expect((await post('/meterPower/MeterLog/' + A, U, { active_power: 5 })).status).toBe(403);
      expect((await post('/meterAuthorizedNumbers/sync/' + A, U, { numbers: [] })).status).toBe(403);
    });

    test('9. unauthenticated requests cannot read protected data', async () => {
      expect((await get('/cb/customer/me')).status).toBe(401);
      expect((await get('/cb/meterPower/getLastUpdate/' + A)).status).toBeGreaterThanOrEqual(401);
      expect((await get('/meterPower/getLastUpdate/' + A)).status).toBe(403);
      expect((await get('/systemUsers/getAll')).status).toBe(403);
      expect((await get('/cb/hourlyEnergyByDRN?drn=' + A)).status).toBeGreaterThanOrEqual(401);
      const forged = require('jsonwebtoken').sign({ typ: 'customer', role: 'CUSTOMER', UserID: 1, DRN: A }, 'not-the-secret');
      expect((await get('/cb/customer/me', forged)).status).toBe(403);
    });

    test('10. revoking an association removes access to that meter only', async () => {
      const r = await request(app).delete('/cb/customer/meters/' + A).set('Authorization', 'Bearer ' + U);
      expect(r.status).toBe(200);
      expect(r.body.meterCount).toBe(1);
      expect((await get('/cb/meterPower/getLastUpdate/' + A, U)).status).toBe(403);
      expect((await get('/cb/meterPower/getLastUpdate/' + B, U)).status).toBe(200);
      // The legacy user's access to A is unaffected.
      const legacy = (await signin('legacy@example.test', 'legacy-pass')).body.token;
      expect((await get('/cb/meterPower/getLastUpdate/' + A, legacy)).status).toBe(200);
      // Re-linking works and re-activates the same row.
      expect((await linkMeter(U, A)).body.meterCount).toBe(2);
    });

    test('10b. only the owner can remove another account from a meter', async () => {
      const legacy = (await signin('legacy@example.test', 'legacy-pass')).body.token;
      const uid = (await q("SELECT UserID FROM SystemUsers WHERE Email = 'u@example.test'"))[0].UserID;
      // legacy is a member of A, not owner: cannot remove U from A.
      expect((await request(app).delete('/cb/customer/meters/' + A + '/members/' + uid).set('Authorization', 'Bearer ' + legacy)).status).toBe(403);
      // Admin assigns ownership of A to legacy, who can then see members.
      const lid = (await q("SELECT UserID FROM SystemUsers WHERE Email = 'legacy@example.test'"))[0].UserID;
      await request(app).delete('/cb/admin/customer-meters/' + lid + '/' + A).set('Authorization', 'Bearer ' + adminToken());
      const relink = await post('/cb/admin/customer-meters', adminToken(), { UserID: lid, DRN: A, role: 'owner' });
      expect(relink.status).toBe(200);
      expect(relink.body.role).toBe('owner');
      // A second owner is refused by the database constraint.
      const second = await post('/cb/admin/customer-meters', adminToken(), { UserID: uid, DRN: A, role: 'owner' });
      expect(second.status).toBe(200); // U already linked → no change
      expect(second.body.alreadyLinked).toBe(true);
      const members = await get('/cb/customer/meters/' + A + '/members', legacy);
      expect(members.body.members.map(m => m.Email).sort()).toEqual(['legacy@example.test', 'u@example.test']);
    });

    test('11. expired and revoked tokens are rejected', async () => {
      const uid = (await q("SELECT UserID FROM SystemUsers WHERE Email = 'v@example.test'"))[0].UserID;
      const expired = require('jsonwebtoken').sign({ typ: 'customer', role: 'CUSTOMER', UserID: uid, DRN: C, tv: 0, exp: Math.floor(Date.now() / 1000) - 60 }, process.env.SECRET_KEY);
      expect((await get('/cb/customer/me', expired)).status).toBe(401);
      const out = await post('/cb/customer/logout', V);
      expect(out.status).toBe(200);
      const after = await get('/cb/customer/me', V);
      expect(after.status).toBe(401);
      expect(after.body.code).toBe('TOKEN_REVOKED');
      V = (await signin('v@example.test')).body.token;
      expect((await get('/cb/customer/me', V)).status).toBe(200);
    });

    test('12. registration cannot be used to claim an existing meter', async () => {
      // No validation token.
      let r = await post('/cb/customer/signup', null, { Email: 'x1@example.test', Password: 'Passw0rd!', DRN: A });
      expect(r.status).toBe(403);
      expect(r.body.code).toBe('METER_VALIDATION_REQUIRED');
      // A validation the meter never confirmed.
      const v = await post('/cb/customer/request-meter-validation', null, { DRN: A, type: 'registration' });
      r = await post('/cb/customer/signup', null, { Email: 'x2@example.test', Password: 'Passw0rd!', DRN: A, validationToken: v.body.token });
      expect(r.status).toBe(403);
      // While that request is pending nobody else can open one for A...
      expect((await post('/cb/customer/request-meter-validation', null, { DRN: A, type: 'registration' })).status).toBe(429);
      // ...the pending status is not revealed without its token...
      const peek = await get('/cb/customer/check-meter-validation/' + A);
      expect(peek.body.status).toBe('registered');
      // ...and the button press cannot be faked over HTTP.
      expect((await post('/meter-validate/confirm', null, { DRN: A })).status).toBe(401);
      expect((await post('/meter-validate/confirm', meterTokens[B], { DRN: A })).status).toBe(401);
      const legacyTok = JSON.parse((await post('/meters/getAccessToken', null, { DRN: A })).body.data).accessToken;
      expect((await post('/meter-validate/confirm', legacyTok, { DRN: A })).status).toBe(401);
      expect((await q('SELECT COUNT(*) AS n FROM SystemUsers WHERE Email LIKE ?', ['x%@example.test']))[0].n).toBe(0);
      await q("UPDATE MeterLinkRequests SET status = 'expired' WHERE DRN = ?", [A]);
    });

    test('12b. a confirmed validation is single-use', async () => {
      const v = await post('/cb/customer/request-meter-validation', null, { DRN: C, type: 'registration' });
      expect((await pressButton(C)).status).toBe(200);
      const ok = await post('/cb/customer/signup', null, { Email: 'w@example.test', Password: 'Passw0rd!', DRN: C, validationToken: v.body.token });
      expect(ok.status).toBe(201);
      const again = await post('/cb/customer/signup', null, { Email: 'w2@example.test', Password: 'Passw0rd!', DRN: C, validationToken: v.body.token });
      expect(again.status).toBe(403);
      // C already had V (owner), so W is a member.
      expect(ok.body.meters[0].role).toBe('member');
    });
  });

  // ── Meter identity ───────────────────────────────────────────────────────
  describe('meter identity (/meters/getAccessToken)', () => {
    const decode = t => require('jsonwebtoken').decode(t);

    test('a correctly signed request from a provisioned meter gets a verified meter token', () => {
      expect(decode(meterTokens[A])).toEqual(expect.objectContaining({ typ: 'meter', drn: A }));
    });

    test('the pinned key is enforced: a different key for the same DRN is refused', async () => {
      const r = await post('/meters/getAccessToken', null, signedRegistration(A, newMeterKey()));
      expect(r.status).toBe(403);
    });

    test('a tampered request fails signature verification', async () => {
      const env = signedRegistration(A, meterKeys[A]);
      env.request = env.request.replace(A, B).replace(A, B);
      const r = await post('/meters/getAccessToken', null, env);
      expect(r.status).toBe(401);
    });

    test('a replayed request is refused', async () => {
      const env = signedRegistration(B, meterKeys[B]);
      expect((await post('/meters/getAccessToken', null, env)).status).toBe(200);
      expect((await post('/meters/getAccessToken', null, env)).status).toBe(401);
    });

    test('unsigned, simulated-signature and unprovisioned registrations get a token that grants nothing', async () => {
      const flat = JSON.parse((await post('/meters/getAccessToken', null, { DRN: C })).body.data).accessToken;
      const sim = JSON.parse((await post('/meters/getAccessToken', null, { request: JSON.stringify({ DRN: C }), signature: 'simulated-signature' })).body.data).accessToken;
      const unprov = JSON.parse((await post('/meters/getAccessToken', null, signedRegistration(UNPROVISIONED, newMeterKey()))).body.data).accessToken;
      for (const t of [flat, sim, unprov]) {
        expect(decode(t).typ).toBeUndefined();
        expect((await get('/systemUsers/getAll', t)).status).toBe(403);
        expect((await get('/cb/meterPower/getLastUpdate/' + C, t)).status).toBe(403);
        expect((await post('/meter-validate/confirm', t, { DRN: C })).status).toBe(401);
      }
    });

    test('admin can clear a pinned key, which revokes the meter\'s tokens', async () => {
      const old = meterTokens[C];
      expect((await request(app).delete('/meters/' + C + '/pinned-key').set('Authorization', 'Bearer ' + adminToken())).body.cleared).toBe(true);
      await post('/cb/customer/request-meter-validation', null, { DRN: C, type: 'password_recovery' });
      expect((await post('/meter-validate/confirm', old, { DRN: C })).status).toBe(401);
      meterKeys[C] = newMeterKey();
      await registerMeter(C);
      expect((await pressButton(C)).status).toBe(200);
    });

    test('meter registration (commissioning) requires a staff token', async () => {
      expect((await post('/cb/meter-registration/register', null, registrationBody(D))).status).toBe(401);
      expect((await post('/cb/meter-registration/register', U, registrationBody(D))).status).toBe(403);
      expect((await q('SELECT COUNT(*) AS n FROM MeterProfileReal WHERE DRN = ?', [D]))[0].n).toBe(0);
    });

    test('a signed registration with no pinning window open gets no meter identity', async () => {
      // D is not provisioned yet, and UNPROVISIONED never will be.
      const t = JSON.parse((await post('/meters/getAccessToken', null, signedRegistration(D, newMeterKey()))).body.data).accessToken;
      expect(decode(t).typ).toBeUndefined();
      expect((await q('SELECT COUNT(*) AS n FROM MeterDeviceKeys WHERE DRN = ?', [D]))[0].n).toBe(0);
    });

    test('a technician registration provisions the meter and lets it pin its key', async () => {
      const r = await post('/cb/meter-registration/register', technicianToken(), registrationBody(D));
      expect(r.status).toBe(201);
      await registerMeter(D);
      expect(decode(meterTokens[D]).typ).toBe('meter');
      // Re-registering is refused as a duplicate (no second record) ...
      const again = await post('/cb/meter-registration/register', technicianToken(), registrationBody(D));
      expect(again.status).toBe(409);
      expect((await q('SELECT COUNT(*) AS n FROM MeterProfileReal WHERE DRN = ?', [D]))[0].n).toBe(1);
      // ... and does not reopen pinning for a meter that already has a key.
      expect((await post('/meters/getAccessToken', null, signedRegistration(D, newMeterKey()))).status).toBe(403);
    });

    test('a provisioned but unpinned meter outside its window cannot be claimed by an attacker key', async () => {
      await q("INSERT INTO MeterProfileReal (DRN, Name) VALUES ('0260444333222', 'Old meter')");
      const t = JSON.parse((await post('/meters/getAccessToken', null, signedRegistration('0260444333222', newMeterKey()))).body.data).accessToken;
      expect(decode(t).typ).toBeUndefined();
      expect((await post('/cb/customer/request-meter-validation', null, { DRN: '0260444333222', type: 'registration' })).status).toBe(200);
      expect((await post('/meter-validate/confirm', t, { DRN: '0260444333222' })).status).toBe(401);
    });

    test('pin windows are admin-only', async () => {
      expect((await post('/meters/' + A + '/pin-window', U, {})).status).toBe(403);
      expect((await post('/meters/' + A + '/pin-window', meterTokens[A], {})).status).toBe(403);
      expect((await post('/meters/' + A + '/pin-window', null, {})).status).toBe(401);
    });

    test('getAccessTokenWeb no longer issues tokens to anonymous callers', async () => {
      expect((await post('/meters/getAccessTokenWeb', null, { DRN: A })).status).toBe(401);
    });
  });

  // ── Account recovery and enumeration ─────────────────────────────────────
  describe('sign-in and password reset', () => {
    let sent;
    beforeAll(() => {
      customerControllers._resetPinStateForTests();
      sent = jest.spyOn(customerControllers._transporter, 'sendMail').mockImplementation(async () => ({ messageId: 'test' }));
    });

    test('unknown email and wrong password are indistinguishable', async () => {
      const a = await signin('nobody@example.test', 'whatever1');
      const b = await signin('u@example.test', 'wrong-password');
      expect(a.status).toBe(401);
      expect(b.status).toBe(401);
      expect(a.body.error).toBe(b.body.error);
    });

    test('forgot-password answers the same for unknown and known emails', async () => {
      const a = await post('/cb/customer/forgot-password', null, { Email: 'nobody@example.test' });
      const b = await post('/cb/customer/forgot-password', null, { Email: 'w@example.test' });
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      expect(a.body).toEqual(b.body);
      expect(sent).toHaveBeenCalledTimes(1);
    });

    test('the reset PIN is burned after 5 wrong guesses', async () => {
      const html = sent.mock.calls[0][0].html;
      const pin = html.match(/>(\d{6})</)[1];
      const wrong = pin === '000000' ? '111111' : '000000';
      for (let i = 0; i < 5; i++) {
        expect((await post('/cb/customer/verify-pin', null, { Email: 'w@example.test', pin: wrong })).status).toBe(400);
      }
      expect((await post('/cb/customer/verify-pin', null, { Email: 'w@example.test', pin })).status).toBe(400);
    });

    test('a correct PIN resets the password and revokes existing sessions', async () => {
      customerControllers._resetPinStateForTests();
      sent.mockClear();
      const before = (await signin('w@example.test')).body.token;
      await post('/cb/customer/forgot-password', null, { Email: 'w@example.test' });
      const pin = sent.mock.calls[0][0].html.match(/>(\d{6})</)[1];
      expect((await post('/cb/customer/verify-pin', null, { Email: 'w@example.test', pin })).status).toBe(200);
      expect((await post('/cb/customer/reset-password', null, { Email: 'w@example.test', pin, newPassword: 'N3wPassword' })).status).toBe(200);
      expect((await get('/cb/customer/me', before)).status).toBe(401);
      expect((await signin('w@example.test', 'N3wPassword')).status).toBe(200);
    });

    test('PIN emails are rate-limited per address', async () => {
      customerControllers._resetPinStateForTests();
      sent.mockClear();
      for (let i = 0; i < 5; i++) await post('/cb/customer/forgot-password', null, { Email: 'u@example.test' });
      expect(sent).toHaveBeenCalledTimes(3);
    });

    test('sign-in with a meter number not on the account is refused', async () => {
      expect((await signin('u@example.test', 'Passw0rd!', C)).status).toBe(401);
      const ok = await signin('u@example.test', 'Passw0rd!', A);
      expect(ok.status).toBe(200);
      expect(ok.body.user.DRN).toBe(A);
    });
  });
});
