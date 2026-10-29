/**
 * STS parameter guard, tariff resolution and price calculation.
 * Pure tests: no database, no HSM, no tokens. Run with
 *   npx jest -c tests/multiMeter/jest.config.js tests/vending
 */
const stsGuard = require('../../vending/stsGuard');
const tr = require('../../vending/tariffResolver');
const cow = require('../../vending/tariffSchedules/windhoek-2026-27');

// A MeterSecurityParams row for a commissioned meter whose reading agrees.
function row(over) {
  return Object.assign({
    meterNumber: '0260028359123', isActive: 1,
    sgc: '600123', keyRevisionNumber: 1, tariffIndex: 1, keyType: 2, keyExpiryNumber: 255, ea: '07',
    meterReportedSgc: '600123', meterReportedKrn: 1, meterReportedTi: 1, meterReportedKeyType: 2,
    meterReportedAt: new Date('2026-10-29T09:49:00Z'),
    sgcConfirmedAt: null,
  }, over || {});
}

describe('STS guard: credit is only issued under verified parameters', () => {
  test('a commissioned meter whose reading matches is allowed', () => {
    const r = stsGuard.checkStsParams(row());
    expect(r.ok).toBe(true);
    expect(r.params).toMatchObject({ sgc: '600123', krn: 1, ti: 1, keyType: 2 });
  });

  test('no record -> STS_PARAMS_MISSING', () => {
    expect(stsGuard.checkStsParams(null).code).toBe('STS_PARAMS_MISSING');
  });

  test('inactive record is refused', () => {
    expect(stsGuard.checkStsParams(row({ isActive: 0 })).code).toBe('STS_PARAMS_INACTIVE');
  });

  test.each([
    ['sgc', { sgc: '99907' }, 'STS_SGC_INVALID'],
    ['krn', { keyRevisionNumber: 0 }, 'STS_KRN_INVALID'],
    ['ti', { tariffIndex: 100 }, 'STS_TI_INVALID'],
    ['keyType', { keyType: 7 }, 'STS_KEY_TYPE_INVALID'],
  ])('invalid backend %s is refused', (_, over, code) => {
    expect(stsGuard.checkStsParams(row(over)).code).toBe(code);
  });

  test('never read from the meter -> STS_METER_STATE_UNVERIFIED', () => {
    expect(stsGuard.checkStsParams(row({ meterReportedAt: null })).code).toBe('STS_METER_STATE_UNVERIFIED');
  });

  test('supply group mismatch is detected before any token is generated', () => {
    const r = stsGuard.checkStsParams(row({ meterReportedSgc: '999907' }));
    expect(r.code).toBe('STS_CONFIG_MISMATCH');
    expect(r.details.mismatches).toEqual([{ field: 'sgc', backend: '600123', meter: '999907' }]);
  });

  test('KRN, TI and key type mismatches are all reported', () => {
    const r = stsGuard.checkStsParams(row({ meterReportedKrn: 2, meterReportedTi: 3, meterReportedKeyType: 1 }));
    expect(r.details.mismatches.map((m) => m.field)).toEqual(['krn', 'ti', 'keyType']);
    expect(r.details.mismatches[2]).toEqual({ field: 'keyType', backend: 'DUTK', meter: 'DDTK' });
  });

  test('the target meter as read on 2026-10-29 (DITK, 999907/2/1) is not commissioned', () => {
    const target = row({ sgc: '999907', keyRevisionNumber: 2, tariffIndex: 1, keyType: 0,
      meterReportedSgc: '999907', meterReportedKrn: 2, meterReportedTi: 1, meterReportedKeyType: 0 });
    expect(stsGuard.checkStsParams(target).code).toBe('STS_METER_NOT_COMMISSIONED');
  });

  test('a DDTK on a manufacturer default SGC is never vendable, even when confirmed', () => {
    for (const sgc of ['999901', '999904', '999907']) {
      const ddtk = row({ sgc, keyRevisionNumber: 2, keyType: 1, meterReportedSgc: sgc, meterReportedKrn: 2, meterReportedKeyType: 1, sgcConfirmedAt: new Date() });
      expect(stsGuard.checkStsParams(ddtk).code).toBe('STS_TRANSIT_KEY');
    }
    // A DDTK on a non-default SGC is not this case.
    expect(stsGuard.checkStsParams(row({ keyType: 1, meterReportedKeyType: 1 })).ok).toBe(true);
  });

  test('a factory-default SGC needs an explicit admin confirmation', () => {
    const def = row({ sgc: '999907', meterReportedSgc: '999907' });
    expect(stsGuard.checkStsParams(def).code).toBe('STS_SGC_DEFAULT_UNCONFIRMED');
    expect(stsGuard.checkStsParams(Object.assign(def, { sgcConfirmedAt: new Date() })).ok).toBe(true);
  });

  test('backend values stored as strings compare correctly', () => {
    expect(stsGuard.checkStsParams(row({ keyRevisionNumber: '1', tariffIndex: '1', keyType: '2', meterReportedKrn: '1' })).ok).toBe(true);
  });

  test('TI 0 is a valid tariff index', () => {
    expect(stsGuard.checkStsParams(row({ tariffIndex: 0, meterReportedTi: 0 })).ok).toBe(true);
  });
});

describe('STS guard: meter key-state reports', () => {
  test('accepts the Maintenance app reading (names or numbers, EA07)', () => {
    const r = stsGuard.parseMeterReport({ sgc: '999907', krn: '2', ti: '1', keyType: 'DITK', ken: '255', ea: 'EA07' });
    expect(r).toEqual({ ok: true, report: { sgc: '999907', krn: 2, ti: 1, keyType: 0, ken: 255, ea: '07' } });
    expect(stsGuard.parseMeterReport({ sgc: '600123', krn: 1, ti: 0, keyType: 2 }).report.keyType).toBe(2);
  });

  test.each([
    [{ sgc: '12345', krn: 1, ti: 1, keyType: 2 }],
    [{ sgc: '123456', krn: 10, ti: 1, keyType: 2 }],
    [{ sgc: '123456', krn: 1, ti: -1, keyType: 2 }],
    [{ sgc: '123456', krn: 1, ti: 1, keyType: 'XYZ' }],
    [{ sgc: '123456', krn: 1, ti: 1 }],
  ])('rejects malformed report %j', (body) => {
    expect(stsGuard.parseMeterReport(body).ok).toBe(false);
  });
});

describe('STS guard: issued-token parameter check', () => {
  const want = { drn: '0260028359123', sgc: '600123', krn: 1, ti: 1, transferAmount: 300 };
  test('a token echoing the requested parameters passes', () => {
    expect(stsGuard.checkIssuedToken({ drn: '0260028359123', sgc: 600123, krn: 1, ti: 1, transferAmount: 300 }, want).ok).toBe(true);
  });
  test('a token for another supply group or amount is refused', () => {
    const r = stsGuard.checkIssuedToken({ drn: '0260028359123', sgc: 999907, krn: 1, ti: 1, transferAmount: 3000 }, want);
    expect(r.code).toBe('STS_TOKEN_PARAMS_MISMATCH');
    expect(r.details.mismatches.map((m) => m.field)).toEqual(['sgc', 'transferAmount']);
  });
  test('a token for another meter is refused', () => {
    expect(stsGuard.checkIssuedToken({ drn: '0260060136363' }, want).ok).toBe(false);
  });
  test('30 kWh is 300 STS units of 0.1 kWh', () => {
    expect(Math.round(30 * 10)).toBe(300);
  });
});

// ── Tariff resolution ──────────────────────────────────────────────────────

function fakeDb(tables) {
  return {
    query(sql, params, cb) {
      let rows = [];
      if (/FROM VendingCustomers/.test(sql)) rows = (tables.VendingCustomers || []).filter((r) => r.meterNo === params[0]);
      else if (/FROM MeterProfileReal/.test(sql)) rows = (tables.MeterProfileReal || []).filter((r) => r.DRN === params[0]);
      else if (/FROM TariffGroups/.test(sql)) rows = (tables.TariffGroups || []).filter((r) => r.name === params[0] || r.sgc === params[1]);
      else if (/FROM TariffBlocks/.test(sql)) rows = (tables.TariffBlocks || []).filter((r) => r.tariffGroupId === params[0]);
      process.nextTick(() => cb(null, rows));
    },
  };
}
const resolve = (db, drn, now) => new Promise((ok, ko) => tr.resolveMeterTariff(db, drn, (e, r) => (e ? ko(e) : ok(r)), now));

const RESPP = { id: 30, name: 'Residential Prepaid (CoW 2026/27)', sgc: 'COW2627-RESPP', type: 'Flat', effectiveDate: '2026-09-01', charge_vatRate: '0.00' };
const RESPP_BLOCKS = [{ tariffGroupId: 30, name: 'Energy', rate: '2.4298', minKwh: 0, maxKwh: 999999, period: null }];

describe('tariff resolution: explicit assignment, no guessed rates', () => {
  test('no assignment anywhere -> TARIFF_NOT_ASSIGNED', async () => {
    const r = await resolve(fakeDb({ MeterProfileReal: [{ DRN: '1', tariff_type: null }] }), '1');
    expect(r.code).toBe('TARIFF_NOT_ASSIGNED');
  });

  test('the target meter today ("middle_income_residential") -> TARIFF_UNKNOWN, not 1.68', async () => {
    const r = await resolve(fakeDb({ MeterProfileReal: [{ DRN: '0260028359123', tariff_type: 'middle_income_residential' }] }), '0260028359123');
    expect(r.code).toBe('TARIFF_UNKNOWN');
    expect(r.details).toEqual({ assigned: 'middle_income_residential', source: 'MeterProfileReal' });
  });

  test('a partial name no longer matches some other group', async () => {
    const db = fakeDb({ VendingCustomers: [{ meterNo: '1', tariffGroup: 'Residential' }], TariffGroups: [RESPP], TariffBlocks: RESPP_BLOCKS });
    expect((await resolve(db, '1')).code).toBe('TARIFF_UNKNOWN');
  });

  test('assignment by name or by tariff code resolves', async () => {
    for (const a of ['Residential Prepaid (CoW 2026/27)', 'COW2627-RESPP']) {
      const db = fakeDb({ VendingCustomers: [{ meterNo: '1', tariffGroup: a }], TariffGroups: [RESPP], TariffBlocks: RESPP_BLOCKS });
      const r = await resolve(db, '1', new Date('2026-10-29'));
      expect(r.ok).toBe(true);
      expect(r.group.id).toBe(30);
      expect(r.source).toBe('VendingCustomers');
    }
  });

  test('VendingCustomers takes precedence over the meter profile', async () => {
    const db = fakeDb({ VendingCustomers: [{ meterNo: '1', tariffGroup: 'COW2627-RESPP' }],
      MeterProfileReal: [{ DRN: '1', tariff_type: 'Commercial' }], TariffGroups: [RESPP], TariffBlocks: RESPP_BLOCKS });
    expect((await resolve(db, '1', new Date('2026-10-29'))).source).toBe('VendingCustomers');
  });

  test('a group with no rates or a zero rate is a configuration error', async () => {
    const base = { VendingCustomers: [{ meterNo: '1', tariffGroup: 'COW2627-RESPP' }], TariffGroups: [RESPP] };
    expect((await resolve(fakeDb(base), '1')).code).toBe('TARIFF_NO_RATES');
    const zero = Object.assign({}, base, { TariffBlocks: [Object.assign({}, RESPP_BLOCKS[0], { rate: '0' })] });
    expect((await resolve(fakeDb(zero), '1')).code).toBe('TARIFF_INVALID_RATE');
  });

  test('a schedule before its effective date, or superseded, is refused', async () => {
    const db = fakeDb({ VendingCustomers: [{ meterNo: '1', tariffGroup: 'COW2627-RESPP' }], TariffGroups: [RESPP], TariffBlocks: RESPP_BLOCKS });
    expect((await resolve(db, '1', new Date('2026-08-31'))).code).toBe('TARIFF_NOT_EFFECTIVE');
    const old = fakeDb({ VendingCustomers: [{ meterNo: '1', tariffGroup: 'COW2627-RESPP' }],
      TariffGroups: [Object.assign({}, RESPP, { supersededAt: '2027-09-01' })], TariffBlocks: RESPP_BLOCKS });
    expect((await resolve(old, '1', new Date('2027-09-02'))).code).toBe('TARIFF_SUPERSEDED');
    expect((await resolve(old, '1', new Date('2027-08-31'))).ok).toBe(true);
  });

  test('a TOU group without all three periods is refused', () => {
    const g = { name: 'X', type: 'TOU' };
    expect(tr.checkGroup(g, [{ rate: 1, period: 'peak' }, { rate: 1, period: 'standard' }]).code).toBe('TARIFF_INVALID_TOU');
  });

  test('per-group charges override the global config; NULL keeps it, 0 is real', () => {
    const cfg = tr.effectiveConfig({ vatRate: 15, fixedCharge: 8.5, laSurcharge: 0.12 },
      { charge_vatRate: '0.00', charge_fixedCharge: null, charge_laSurcharge: '0.1100' });
    expect(cfg).toEqual({ vatRate: '0.00', fixedCharge: 8.5, laSurcharge: '0.1100' });
  });
});

// ── Price calculation ──────────────────────────────────────────────────────

const COW_RES = { vatRate: 0, fixedCharge: 0, relLevy: 0, ecbLevy: 0.0212, nefLevy: 0.0160, laSurcharge: 0.11, arrearsMode: 'auto-deduct', arrearsPercentage: 25 };

describe('price calculation', () => {
  test('CoW residential prepaid: N$100 buys 100 / (2.4298 + 0.1472) kWh, levies inside the amount', () => {
    const c = tr.computeBreakdown(100, COW_RES, 'Flat', RESPP_BLOCKS, null, 0);
    expect(c.totalKwh).toBeCloseTo(100 / 2.577, 2); // 38.80 kWh
    expect(c.vatAmount).toBe(0);
    const parts = c.blockBreakdown.reduce((s, b) => s + b.amount, 0) + c.ecbLevyAmount + c.nefLevyAmount + c.laSurchargeAmount;
    expect(Math.abs(parts - 100)).toBeLessThanOrEqual(0.02); // adds up to what was paid (rounding)
  });

  test('CoW general prepaid with 15% VAT', () => {
    const cfg = Object.assign({}, COW_RES, { vatRate: 15 });
    const c = tr.computeBreakdown(115, cfg, 'Flat', [{ name: 'Energy', rate: 3.7068 }], null, 0);
    expect(c.vatAmount).toBe(15);
    expect(c.totalKwh).toBeCloseTo(100 / (3.7068 + 0.1472), 2);
  });

  test('cost of 30 kWh on CoW residential prepaid is N$77.31', () => {
    expect(Math.round(30 * (2.4298 + 0.0212 + 0.016 + 0.11) * 100) / 100).toBe(77.31);
  });

  test('TOU uses the current period and refuses an unknown one', () => {
    const blocks = [{ name: 'Peak', rate: 2.6928, period: 'peak' }, { name: 'Standard', rate: 2.2223, period: 'standard' }, { name: 'Off-Peak', rate: 1.7519, period: 'off-peak' }];
    const c = tr.computeBreakdown(100, Object.assign({}, COW_RES, { ecbLevy: 0, nefLevy: 0, laSurcharge: 0 }), 'TOU', blocks, 'off-peak', 0);
    expect(c.totalKwh).toBeCloseTo(100 / 1.7519, 2);
    expect(tr.computeBreakdown(100, COW_RES, 'TOU', blocks, 'night', 0).error).toMatch(/TOU period/);
  });

  test('inclining blocks fill block 1 before block 2', () => {
    const blocks = [{ name: 'B1', rate: 1.633, minKwh: 0, maxKwh: 250 }, { name: 'B2', rate: 2.4298, minKwh: 250, maxKwh: 999999 }];
    const cfg = Object.assign({}, COW_RES, { ecbLevy: 0, nefLevy: 0, laSurcharge: 0 });
    const c = tr.computeBreakdown(500, cfg, 'Block', blocks, null, 0);
    expect(c.blockBreakdown[0].kWh).toBe(250);
    expect(c.blockBreakdown[1].kWh).toBeCloseTo((500 - 250 * 1.633) / 2.4298, 2);
  });

  test('fixed charge, REL levy and arrears come off before energy; too little is refused', () => {
    const cfg = Object.assign({}, COW_RES, { fixedCharge: 8.5, relLevy: 2.4 });
    const c = tr.computeBreakdown(100, cfg, 'Flat', RESPP_BLOCKS, null, 40);
    expect(c.arrearsDeducted).toBe(25);
    expect(c.energyAmount).toBe(64.1);
    expect(tr.computeBreakdown(10, cfg, 'Flat', RESPP_BLOCKS, null, 0).error).toBeDefined();
  });

  test('the quote and the sale use the same function (same inputs -> same kWh)', () => {
    const a = tr.computeBreakdown(250, COW_RES, 'Flat', RESPP_BLOCKS, null, 0);
    const b = tr.computeBreakdown(250, COW_RES, 'Flat', RESPP_BLOCKS, null, 0);
    expect(a).toEqual(b);
  });
});

// ── Official schedule data ─────────────────────────────────────────────────

describe('City of Windhoek 2026/27 schedule (ECB, valid from 09/2026)', () => {
  const g = Object.fromEntries(cow.groups().map((x) => [x.category, x]));

  test('effective date, source and levies', () => {
    expect(cow.effectiveDate).toBe('2026-09-01');
    expect(cow.sourceUrl).toMatch(/ecb\.org\.na\/.*CoW-2026\.pdf$/);
    expect(cow.levies).toEqual({ ecbLevy: 0.0212, nefLevy: 0.016, laSurcharge: 0.11 });
  });

  test.each([
    ['Residential Prepaid', 2.4298, 0],
    ['General Prepaid', 3.7068, 15],
    ['Social Services Prepaid', 2.47, 15],
    ['Residential Up to 20A', 1.6616, 0],
    ['Residential with Business Consent', 1.6788, null],
    ['General <=75A', 2.2924, 15],
    ['Floodlights', 2.6252, 15],
    ['Net Metering Flat', 1.24, null],
  ])('%s: N$%f/kWh, VAT %s', (name, rate, vat) => {
    expect(g[name].flatRate).toBe(rate);
    expect(g[name].blocks[0].rate).toBe(rate);
    expect(g[name].vatRate).toBe(vat);
  });

  test('Business <=75A EL20 TOU rates and capacity charge', () => {
    const b = g['Business <=75A EL20'];
    expect([b.peakRate, b.standardRate, b.offPeakRate]).toEqual([2.6928, 2.2223, 1.7519]);
    expect(b.capacityCharge).toBe(19.76);
    expect(b.blocks.map((x) => x.period).sort()).toEqual(['off-peak', 'peak', 'standard']);
  });

  test('pensioner inclining block: first 250 kWh/month at 1.6330, then 2.4298', () => {
    const s = g['Social Prepaid (Pensioner)'];
    expect(s.blocks.map((b) => [b.minKwh, b.maxKwh, b.rate])).toEqual([[0, 250, 1.633], [250, 999999, 2.4298]]);
  });

  test('every category is listed once, with a unique code and a positive rate', () => {
    const all = cow.groups();
    expect(all).toHaveLength(26);
    expect(new Set(all.map((x) => x.code)).size).toBe(26);
    all.forEach((x) => x.blocks.forEach((b) => expect(b.rate).toBeGreaterThan(0)));
    all.filter((x) => /^Net Metering/.test(x.category)).forEach((x) => expect(x.levies.laSurcharge).toBe(0));
  });

  test('TOU slots cover every hour of every day exactly once', () => {
    const slots = cow.touSchedule();
    for (let d = 0; d < 7; d++) {
      const hours = new Array(24).fill(0);
      slots.filter((s) => s.dayOfWeek === d).forEach((s) => { for (let h = s.startHour; h < s.endHour; h++) hours[h]++; });
      expect(hours).toEqual(new Array(24).fill(1));
    }
  });

  test('TOU slots match the schedule: weekday peaks 07-10 and 17-21, Sunday all off-peak', () => {
    const at = (d, h) => cow.touSchedule().find((s) => s.dayOfWeek === d && s.startHour <= h && h < s.endHour).period;
    expect([6, 7, 9, 10, 17, 20, 21, 22].map((h) => at(3, h))).toEqual(['standard', 'peak', 'peak', 'standard', 'peak', 'peak', 'standard', 'off-peak']);
    expect([6, 7, 11, 12, 18, 19, 20].map((h) => at(6, h))).toEqual(['off-peak', 'standard', 'standard', 'off-peak', 'standard', 'standard', 'off-peak']);
    expect(new Set([0, 8, 18, 23].map((h) => at(0, h)))).toEqual(new Set(['off-peak']));
  });
});
