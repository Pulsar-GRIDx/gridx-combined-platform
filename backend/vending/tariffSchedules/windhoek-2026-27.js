// City of Windhoek electricity tariffs, financial year 2026/27.
//
// Source: Electricity Control Board, "Schedule of Approved Tariffs — Valid from
// 09/2026 for Windhoek Municipality", created 26/08/2026 (ECB Regulatory
// Database 3.56), https://www.ecb.org.na/wp-content/uploads/2026/09/CoW-2026.pdf
// (SHA-256 1270df12d549f99af14d456f584cb8c2d8df3b2f9c50031e39210ab362dd3b2d).
// City notice: average adjustment 3.6%, effective 1 September 2026.
//
// Units: energy rates N$/kWh; capacity charge N$/summated A/month; demand and
// network access N$/kVA/month. Schedule note 4: published tariffs EXCLUDE VAT.
// Notes 7/8: residential account holders are zero-rated, non-residential 15%.
// vatRate null = the category does not determine the VAT treatment by itself
// (it depends on the account holder) and must be confirmed per customer.
//
// The ECB levy, NEF levy and Local Authority surcharge apply per kWh to every
// category except net metering (none listed). Page 5 (unbundled demand TOU
// tariffs) is not included: those are kVA-metered bulk tariffs the GRIDx
// prepaid meter does not serve.

var LEVIES = { ecbLevy: 0.0212, nefLevy: 0.0160, laSurcharge: 0.1100 };
var NO_LEVIES = { ecbLevy: 0, nefLevy: 0, laSurcharge: 0 };

var SOURCE = 'ECB Schedule of Approved Tariffs, Windhoek, valid from 09/2026 (created 26/08/2026)';
var EFFECTIVE_DATE = '2026-09-01';

// [code, name, type, billingType, rates, capacity, demand, networkAccess, vatRate, levies]
// rates: Flat -> number; TOU -> [peak, standard, offPeak]; Block -> [[uptoKwh, rate], ...]
var ROWS = [
  ['BUS75', 'Business <=75A EL20', 'TOU', 'postpaid', [2.6928, 2.2223, 1.7519], 19.76, null, null, 15, LEVIES],
  ['DEPT', 'Departmental', 'TOU', 'postpaid', [2.2144, 1.7475, 1.2704], 27.04, null, null, 15, LEVIES],
  ['DEPTD', 'Departmental Demand TOU', 'TOU', 'postpaid', [2.2144, 1.7373, 1.2501], null, 165.00, 85.00, 15, LEVIES],
  ['DEPTND', 'Departmental Non-Demand TOU', 'TOU', 'postpaid', [2.1636, 1.6866, 1.1997], 26.00, null, null, 15, LEVIES],
  ['FLOOD', 'Floodlights', 'Flat', 'postpaid', 2.6252, null, null, null, 15, LEVIES],
  ['GEN75', 'General <=75A', 'Flat', 'postpaid', 2.2924, 19.76, null, null, 15, LEVIES],
  ['GEN75F', 'General >75A Flat', 'Flat', 'postpaid', 2.2924, 31.20, null, null, 15, LEVIES],
  ['GEN75T', 'General >75A TOU', 'TOU', 'postpaid', [2.8195, 2.2945, 1.7800], 31.20, null, null, 15, LEVIES],
  ['GENDK', 'General Demand TOU kVA', 'TOU', 'postpaid', [2.8195, 2.2945, 1.7800], null, 171.60, 88.40, 15, LEVIES],
  ['GENPP', 'General Prepaid', 'Flat', 'prepaid', 3.7068, null, null, null, 15, LEVIES],
  ['INDDK', 'Industrial Demand TOU kVA', 'TOU', 'postpaid', [2.5675, 2.0530, 1.5700], null, 171.60, 88.40, 15, LEVIES],
  ['INDDM', 'Industrial Demand TOU kVA MV', 'TOU', 'postpaid', [2.5675, 2.0530, 1.5700], null, 171.60, 82.16, 15, LEVIES],
  ['NETF', 'Net Metering Flat', 'Flat', 'postpaid', 1.2400, null, null, null, null, NO_LEVIES],
  ['NETT', 'Net Metering TOU', 'TOU', 'postpaid', [1.7400, 1.3200, 0.8900], null, null, null, null, NO_LEVIES],
  ['OAHD', 'Old Age Homes Demand', 'TOU', 'postpaid', [2.0500, 1.5800, 1.1000], null, 104.00, 57.86, 15, LEVIES],
  ['OAHND', 'Old Age Homes Non-Demand', 'Flat', 'postpaid', 1.3600, 8.00, null, null, 15, LEVIES],
  ['RESEL', 'Reseller Residential', 'Flat', 'postpaid', 1.7337, 15.45, null, null, null, LEVIES],
  ['RES20P', 'Residential Postpaid Over 20A', 'Flat', 'postpaid', 1.6616, 15.45, null, null, 0, LEVIES],
  ['RESPP', 'Residential Prepaid', 'Flat', 'prepaid', 2.4298, null, null, null, 0, LEVIES],
  ['RES20', 'Residential Up to 20A', 'Flat', 'postpaid', 1.6616, 12.36, null, null, 0, LEVIES],
  ['RESBC', 'Residential with Business Consent', 'Flat', 'postpaid', 1.6788, 15.60, null, null, null, LEVIES],
  ['SOCPP', 'Social Prepaid (Pensioner)', 'Block', 'prepaid', [[250, 1.6330], [null, 2.4298]], null, null, null, 0, LEVIES],
  ['SOC3F', 'Social Services 3 Phase Flat', 'Flat', 'postpaid', 1.4900, 30.00, null, null, 15, LEVIES],
  ['SOC3T', 'Social Services 3 Phase TOU', 'TOU', 'postpaid', [2.3700, 1.9000, 1.4300], 30.00, null, null, 15, LEVIES],
  ['SOCDK', 'Social Services Demand TOU kVA', 'TOU', 'postpaid', [2.2400, 1.7700, 1.2900], null, 162.00, 78.00, 15, LEVIES],
  ['SOCSP', 'Social Services Prepaid', 'Flat', 'prepaid', 2.4700, null, null, null, 15, LEVIES],
];

// Non-seasonal TOU slots from the schedule's notes page (hour -> period).
// dayOfWeek follows JavaScript Date.getDay(): 0 = Sunday.
var P = 'peak', S = 'standard', O = 'off-peak';
var WEEKDAY = [O, O, O, O, O, O, S, P, P, P, S, S, S, S, S, S, S, P, P, P, P, S, O, O];
var SATURDAY = [O, O, O, O, O, O, O, S, S, S, S, S, O, O, O, O, O, O, S, S, O, O, O, O];
var SUNDAY = new Array(24).fill(O);

function touSchedule() {
  var out = [];
  [[0, SUNDAY], [1, WEEKDAY], [2, WEEKDAY], [3, WEEKDAY], [4, WEEKDAY], [5, WEEKDAY], [6, SATURDAY]].forEach(function(d) {
    var day = d[0], hours = d[1], start = 0;
    for (var h = 1; h <= 24; h++) {
      if (h === 24 || hours[h] !== hours[start]) {
        out.push({ dayOfWeek: day, startHour: start, endHour: h, period: hours[start] });
        start = h;
      }
    }
  });
  return out;
}

function groups() {
  return ROWS.map(function(r) {
    var g = {
      code: 'COW2627-' + r[0],
      name: r[1] + ' (CoW 2026/27)',
      category: r[1],
      type: r[2],
      billingType: r[3],
      capacityCharge: r[5],
      demandCharge: r[6],
      networkAccessCharge: r[7],
      vatRate: r[8],
      levies: r[9],
      effectiveDate: EFFECTIVE_DATE,
      sourceRef: SOURCE,
      flatRate: null, peakRate: null, standardRate: null, offPeakRate: null,
      blocks: [],
    };
    if (r[2] === 'Flat') {
      g.flatRate = r[4];
      g.blocks = [{ name: 'Energy', rangeLabel: 'All kWh', rate: r[4], minKwh: 0, maxKwh: 999999, period: null }];
    } else if (r[2] === 'TOU') {
      g.peakRate = r[4][0]; g.standardRate = r[4][1]; g.offPeakRate = r[4][2];
      g.blocks = [
        { name: 'Off-Peak', rangeLabel: 'All kWh', rate: r[4][2], minKwh: 0, maxKwh: 999999, period: 'off-peak' },
        { name: 'Standard', rangeLabel: 'All kWh', rate: r[4][1], minKwh: 0, maxKwh: 999999, period: 'standard' },
        { name: 'Peak', rangeLabel: 'All kWh', rate: r[4][0], minKwh: 0, maxKwh: 999999, period: 'peak' },
      ];
    } else {
      var from = 0;
      g.blocks = r[4].map(function(b, i) {
        var to = b[0] === null ? 999999 : b[0];
        var blk = { name: 'Block ' + (i + 1), rangeLabel: b[0] === null ? from + '+ kWh/month' : from + '-' + to + ' kWh/month',
          rate: b[1], minKwh: from, maxKwh: to, period: null };
        from = to;
        return blk;
      });
    }
    return g;
  });
}

module.exports = {
  id: 'windhoek-2026-27',
  source: SOURCE,
  sourceUrl: 'https://www.ecb.org.na/wp-content/uploads/2026/09/CoW-2026.pdf',
  sourceSha256: '1270df12d549f99af14d456f584cb8c2d8df3b2f9c50031e39210ab362dd3b2d',
  effectiveDate: EFFECTIVE_DATE,
  levies: LEVIES,
  groups: groups,
  touSchedule: touSchedule,
};
