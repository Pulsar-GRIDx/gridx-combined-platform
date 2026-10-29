/**
 * Contract: every authenticated endpoint the customer Android app calls must
 * be on the customer allow-list in middleware/meterOwnership.js, or the app
 * gets a 403 CUSTOMER_ROUTE_FORBIDDEN in production.
 *
 * Reads the Retrofit interfaces from the sibling app checkout
 * (GRIDx_Meter_android_app); skipped when it is not present.
 */
const fs = require('fs');
const path = require('path');

process.env.SECRET_KEY = process.env.SECRET_KEY || 'contract-test';
const { matchCustomerRoute } = require('../../middleware/meterOwnership');

const API_DIR = path.resolve(__dirname, '../../../../GRIDx_Meter_android_app/app/src/main/java/com/example/gridxmeter/ApiIntegration');
const d = fs.existsSync(API_DIR) ? describe : describe.skip;

// Reached without a customer token (served before authenticateToken runs).
const PUBLIC = [
  /^customer\/(signin|signup|forgot-password|verify-pin|reset-password|request-meter-validation)$/,
  /^customer\/check-meter-validation\/\{drn\}$/,
];

function endpoints() {
  const out = [];
  for (const f of fs.readdirSync(API_DIR).filter((n) => n.endsWith('.java'))) {
    const src = fs.readFileSync(path.join(API_DIR, f), 'utf8');
    const re = /@(GET|POST|PUT|DELETE|PATCH)\("([^"]+)"\)/g;
    let m;
    while ((m = re.exec(src))) out.push({ method: m[1], path: m[2].replace(/^\//, ''), file: f });
  }
  return out;
}

function sample(p) {
  return '/cb/' + p
    .replace(/\{(drn|target)\}/g, '0260028359123')
    .replace(/\{token\}/g, 'a'.repeat(32))
    .replace(/\{(id|userId)\}/g, '42')
    .split('?')[0];
}

d('customer app <-> customer allow-list contract', () => {
  const eps = endpoints();

  test('the app interfaces were found', () => {
    expect(eps.length).toBeGreaterThan(40);
  });

  test.each(eps.map((e) => [e.method + ' ' + e.path, e]))('%s is reachable with a customer token', (_, e) => {
    if (PUBLIC.some((r) => r.test(e.path))) return;
    const match = matchCustomerRoute({ method: e.method, originalUrl: sample(e.path) });
    expect(match).not.toBeNull();
  });
});
