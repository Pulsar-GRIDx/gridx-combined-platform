// ═══════════════════════════════════════════════════════════════════════════
// TARIFF RESOLVER — which tariff a meter is on, and what a purchase buys.
//
// A meter's tariff is the TariffGroups row named by its explicit assignment
// (VendingCustomers.tariffGroup, else MeterProfileReal.tariff_type). There is
// deliberately no fallback: a meter with no assignment, or one that names a
// group that does not exist, gets an explicit configuration error instead of
// a guessed rate (previously 1.68, 2.32 or 2.45 N$/kWh depending on the path).
//
// computeBreakdown() is the single price calculation used by both the quote
// (/token-preview) and the sale (/vend), so the two can no longer disagree.
// ═══════════════════════════════════════════════════════════════════════════

function round2(n) {
  return Math.round(parseFloat(n) * 100) / 100;
}

function fail(code, message, details) {
  return { ok: false, code: code, message: message, details: details || null };
}

function q(db, sql, params) {
  return new Promise(function(resolve, reject) {
    db.query(sql, params || [], function(err, rows) { if (err) reject(err); else resolve(rows); });
  });
}

// Per-group charges override the global TariffConfig. NULL means "use the
// global value"; 0 is a real value (e.g. VAT zero-rated residential supply).
var OVERRIDABLE = ['vatRate', 'fixedCharge', 'relLevy', 'ecbLevy', 'nefLevy', 'laSurcharge'];

function effectiveConfig(config, group) {
  var out = Object.assign({}, config || {});
  OVERRIDABLE.forEach(function(k) {
    var v = group && group['charge_' + k];
    if (v !== null && v !== undefined && v !== '') out[k] = v;
  });
  return out;
}

// Pure: validates a group + its blocks. `now` is injectable for tests.
function checkGroup(group, blocks, now) {
  if (!blocks || blocks.length === 0) {
    return fail('TARIFF_NO_RATES', 'Tariff "' + group.name + '" has no rates configured.');
  }
  for (var i = 0; i < blocks.length; i++) {
    var r = parseFloat(blocks[i].rate);
    if (!(r > 0)) return fail('TARIFF_INVALID_RATE', 'Tariff "' + group.name + '" has a missing or non-positive rate.');
  }
  if (group.type === 'TOU') {
    var periods = blocks.map(function(b) { return b.period; });
    if (['peak', 'standard', 'off-peak'].some(function(p) { return periods.indexOf(p) === -1; })) {
      return fail('TARIFF_INVALID_TOU', 'TOU tariff "' + group.name + '" needs peak, standard and off-peak rates.');
    }
  }
  if (group.effectiveDate && new Date(group.effectiveDate) > (now || new Date())) {
    return fail('TARIFF_NOT_EFFECTIVE', 'Tariff "' + group.name + '" is not effective until ' +
      new Date(group.effectiveDate).toISOString().slice(0, 10) + '.');
  }
  if (group.supersededAt && new Date(group.supersededAt) <= (now || new Date())) {
    return fail('TARIFF_SUPERSEDED', 'Tariff "' + group.name + '" has been superseded; assign the current schedule.');
  }
  return { ok: true };
}

// callback(err, result): err is a database failure only; a configuration
// problem is result.ok === false with a code the apps can show.
function resolveMeterTariff(db, drn, callback, now) {
  (async function() {
    var vc = await q(db, 'SELECT tariffGroup FROM VendingCustomers WHERE meterNo = ?', [drn]);
    var assigned = null;
    var source = null;
    if (vc.length && vc[0].tariffGroup) { assigned = String(vc[0].tariffGroup).trim(); source = 'VendingCustomers'; }
    if (!assigned) {
      var mp = await q(db, 'SELECT tariff_type FROM MeterProfileReal WHERE DRN = ?', [drn]);
      if (mp.length && mp[0].tariff_type) { assigned = String(mp[0].tariff_type).trim(); source = 'MeterProfileReal'; }
    }
    if (!assigned) {
      return fail('TARIFF_NOT_ASSIGNED', 'No tariff is assigned to meter ' + drn + '. Assign one before vending.');
    }
    // Exact name (or tariff code) only: a LIKE match picked an arbitrary group.
    var groups = await q(db, 'SELECT * FROM TariffGroups WHERE name = ? OR sgc = ? ORDER BY id DESC', [assigned, assigned]);
    if (groups.length === 0) {
      return fail('TARIFF_UNKNOWN', 'Meter ' + drn + ' is assigned "' + assigned + '", which is not a configured tariff.',
        { assigned: assigned, source: source });
    }
    if (groups.length > 1) {
      return fail('TARIFF_AMBIGUOUS', 'More than one tariff matches "' + assigned + '".', { assigned: assigned });
    }
    var group = groups[0];
    var blocks = await q(db, 'SELECT * FROM TariffBlocks WHERE tariffGroupId = ? ORDER BY sortOrder', [group.id]);
    var check = checkGroup(group, blocks, now);
    if (!check.ok) { check.details = Object.assign({ assigned: assigned, source: source }, check.details || {}); return check; }
    return { ok: true, group: group, blocks: blocks, assigned: assigned, source: source };
  })().then(function(r) { callback(null, r); }, function(err) { callback(err); });
}

// Pure price calculation.
//   totalAmount  N$ paid, VAT-inclusive
//   config       effective charges (see effectiveConfig)
//   groupType    'Flat' | 'TOU' | 'Block'
//   blocks       TariffBlocks rows (rate N$/kWh excl. VAT and excl. levies)
//   touPeriod    'peak' | 'standard' | 'off-peak' for TOU
//   arrears      outstanding arrears for auto-deduction
// The per-kWh levies (ECB, NEF, LA surcharge) are part of what each kWh
// costs, so they are taken out of the purchase rather than added on top:
// energy + levies + fixed + REL + arrears + VAT == totalAmount (to the cent).
function computeBreakdown(totalAmount, config, groupType, blocks, touPeriod, arrears) {
  var vatRate = (parseFloat(config.vatRate) || 0) / 100;
  var vatAmount = round2(totalAmount - (totalAmount / (1 + vatRate)));
  var afterVat = round2(totalAmount - vatAmount);
  var fixedCharge = round2(parseFloat(config.fixedCharge) || 0);
  var relLevy = round2(parseFloat(config.relLevy) || 0);

  var arrearsDeducted = 0;
  if (config.arrearsMode === 'auto-deduct' && arrears > 0) {
    arrearsDeducted = round2(Math.min(arrears, afterVat * ((parseFloat(config.arrearsPercentage) || 0) / 100)));
  }

  var energyAmount = round2(afterVat - fixedCharge - relLevy - arrearsDeducted);
  if (energyAmount <= 0) return { error: 'Amount too low to generate energy units after deductions' };

  var levyPerKwh = (parseFloat(config.ecbLevy) || 0) + (parseFloat(config.nefLevy) || 0) + (parseFloat(config.laSurcharge) || 0);
  var totalKwh = 0;
  var blockBreakdown = [];

  function addSlice(name, rate, kwh, period) {
    totalKwh += kwh;
    var slice = { block: name, rate: rate, kWh: round2(kwh), amount: round2(kwh * rate) };
    if (period) slice.period = period;
    blockBreakdown.push(slice);
  }

  if (groupType === 'TOU') {
    var tb = blocks.find(function(b) { return b.period === touPeriod; });
    if (!tb) return { error: 'No rate for TOU period ' + touPeriod };
    var r = parseFloat(tb.rate);
    addSlice(tb.name + ' (' + String(touPeriod).toUpperCase() + ')', r, energyAmount / (r + levyPerKwh), touPeriod);
  } else if (groupType === 'Flat') {
    var fr = parseFloat(blocks[0].rate);
    addSlice(blocks[0].name || 'Flat Rate', fr, energyAmount / (fr + levyPerKwh));
  } else {
    var remaining = energyAmount;
    for (var i = 0; i < blocks.length && remaining > 0.000001; i++) {
      var b = blocks[i];
      var rate = parseFloat(b.rate);
      var range = (parseFloat(b.maxKwh) || 999999) - (parseFloat(b.minKwh) || 0);
      var unit = rate + levyPerKwh;
      var used = Math.min(remaining, range * unit);
      addSlice(b.name, rate, used / unit);
      remaining -= used;
    }
  }
  totalKwh = round2(totalKwh);

  var ecbLevyAmount = round2(totalKwh * (parseFloat(config.ecbLevy) || 0));
  var nefLevyAmount = round2(totalKwh * (parseFloat(config.nefLevy) || 0));
  var laSurchargeAmount = round2(totalKwh * (parseFloat(config.laSurcharge) || 0));

  return {
    vatRate: parseFloat(config.vatRate) || 0,
    vatAmount: vatAmount,
    afterVat: afterVat,
    fixedCharge: fixedCharge,
    relLevy: relLevy,
    arrearsDeducted: arrearsDeducted,
    energyAmount: energyAmount,
    totalKwh: totalKwh,
    blockBreakdown: blockBreakdown,
    ecbLevyAmount: ecbLevyAmount,
    nefLevyAmount: nefLevyAmount,
    laSurchargeAmount: laSurchargeAmount,
  };
}

module.exports = {
  OVERRIDABLE: OVERRIDABLE,
  effectiveConfig: effectiveConfig,
  checkGroup: checkGroup,
  resolveMeterTariff: resolveMeterTariff,
  computeBreakdown: computeBreakdown,
};
