// ═══════════════════════════════════════════════════════════════════════════
// STS GUARD — refuse to issue a credit token unless the STS parameters the
// backend would use are known to match what the meter is actually running.
//
// MeterSecurityParams holds what the backend *intends* (sgc, keyRevisionNumber,
// tariffIndex, keyType). Those values have historically been filled from
// compiled defaults (SGC 999907, KRN 2, TI 1, key type 3) by registration and
// a startup migration, so on their own they prove nothing. A token issued
// under the wrong SGC/KRN/TI/key is rejected by the meter at best, and burns a
// paid-for sale at worst.
//
// The guard therefore also requires the meter's own key state, read from the
// meter (Maintenance app over BLE: `sys:key_state`, page 60) and recorded with
// POST /vending/sts-params/:drn/meter-report. Any key change invalidates that
// reading until the meter is read again.
// ═══════════════════════════════════════════════════════════════════════════

// STS key types (IEC 62055-41) as numbered by the firmware and the HSM.
var KEY_TYPES = { 0: 'DITK', 1: 'DDTK', 2: 'DUTK', 3: 'DCTK' };

// Values the firmware and the backend fall back to when nothing was
// provisioned. A meter on one of these has not been shown to belong to a
// production supply group; an admin must confirm the SGC explicitly.
var FACTORY_DEFAULT_SGCS = ['999907', '999901'];

var SGC_RE = /^\d{6}$/;

function int(v) {
  if (v === null || v === undefined || v === '') return null;
  var n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

function fail(code, message, details) {
  return { ok: false, code: code, message: message, details: details || null };
}

// Pure check over one MeterSecurityParams row. Returns { ok: true, params }
// with the values to hand to the HSM, or { ok: false, code, message }.
function checkStsParams(row) {
  if (!row) {
    return fail('STS_PARAMS_MISSING',
      'This meter has no STS security parameters. Register it with the HSM and record its key state before vending.');
  }
  if (Number(row.isActive) !== 1) {
    return fail('STS_PARAMS_INACTIVE', 'The STS security parameters for this meter are inactive.');
  }
  var sgc = String(row.sgc || '');
  var krn = int(row.keyRevisionNumber);
  var ti = int(row.tariffIndex);
  var kt = int(row.keyType);
  if (!SGC_RE.test(sgc)) return fail('STS_SGC_INVALID', 'The configured supply group code is not a 6-digit value.');
  if (krn === null || krn < 1 || krn > 9) return fail('STS_KRN_INVALID', 'The configured key revision number must be 1-9.');
  if (ti === null || ti < 0 || ti > 99) return fail('STS_TI_INVALID', 'The configured tariff index must be 0-99.');
  if (!(kt in KEY_TYPES)) return fail('STS_KEY_TYPE_INVALID', 'The configured key type is not a valid STS key type.');

  if (!row.meterReportedAt) {
    return fail('STS_METER_STATE_UNVERIFIED',
      "The meter's own key state has not been read since registration or the last key change. " +
      'Read it with the Maintenance app (STS key state) and record it before vending.');
  }

  var reported = {
    sgc: String(row.meterReportedSgc || ''),
    krn: int(row.meterReportedKrn),
    ti: int(row.meterReportedTi),
    keyType: int(row.meterReportedKeyType),
  };
  var mismatches = [];
  if (reported.sgc !== sgc) mismatches.push({ field: 'sgc', backend: sgc, meter: reported.sgc });
  if (reported.krn !== krn) mismatches.push({ field: 'krn', backend: krn, meter: reported.krn });
  if (reported.ti !== ti) mismatches.push({ field: 'ti', backend: ti, meter: reported.ti });
  if (reported.keyType !== kt) {
    mismatches.push({ field: 'keyType', backend: KEY_TYPES[kt], meter: KEY_TYPES[reported.keyType] || reported.keyType });
  }
  if (mismatches.length) {
    return fail('STS_CONFIG_MISMATCH',
      'The backend STS parameters do not match the key state reported by the meter.', { mismatches: mismatches });
  }

  // The initialisation key only exists so the meter can accept its first key
  // change into the utility's supply group; credit is not vended under it.
  if (reported.keyType === 0) {
    return fail('STS_METER_NOT_COMMISSIONED',
      'The meter is still on its initialisation key (DITK). Key-change it into the production supply group before vending.');
  }

  if (FACTORY_DEFAULT_SGCS.indexOf(sgc) !== -1 && !row.sgcConfirmedAt) {
    return fail('STS_SGC_DEFAULT_UNCONFIRMED',
      'The supply group code ' + sgc + ' is the factory default. An admin must confirm it is the allocated production SGC before vending.');
  }

  return { ok: true, params: { sgc: sgc, krn: krn, ti: ti, keyType: kt, ken: int(row.keyExpiryNumber), ea: row.ea } };
}

// Loads the row for a meter and checks it. callback(err, result) where err is
// only a database failure; a refusal comes back as result.ok === false.
function verifyMeter(db, meterNo, callback) {
  db.query('SELECT * FROM MeterSecurityParams WHERE meterNumber = ?', [meterNo], function(err, rows) {
    if (err) return callback(err);
    var row = (rows && rows[0]) || null;
    callback(null, checkStsParams(row), row);
  });
}

// Validates a key state reading from the meter before it is stored.
function parseMeterReport(body) {
  var sgc = String((body && body.sgc) || '').trim();
  var krn = int(body && body.krn);
  var ti = int(body && body.ti);
  var kt = body && body.keyType;
  if (typeof kt === 'string' && !/^\d+$/.test(kt)) {
    var name = kt.toUpperCase();
    kt = Object.keys(KEY_TYPES).filter(function(k) { return KEY_TYPES[k] === name; })[0];
  }
  kt = int(kt);
  if (!SGC_RE.test(sgc)) return fail('INVALID_REPORT', 'sgc must be the 6-digit value read from the meter');
  if (krn === null || krn < 1 || krn > 9) return fail('INVALID_REPORT', 'krn must be 1-9');
  if (ti === null || ti < 0 || ti > 99) return fail('INVALID_REPORT', 'ti must be 0-99');
  if (!(kt in KEY_TYPES)) return fail('INVALID_REPORT', 'keyType must be DITK, DDTK, DUTK or DCTK (0-3)');
  var ken = int(body.ken);
  var ea = body.ea ? String(body.ea).replace(/^EA/i, '').padStart(2, '0') : null;
  return { ok: true, report: { sgc: sgc, krn: krn, ti: ti, keyType: kt, ken: ken, ea: ea } };
}

// Checks the parameters the HSM reports it encoded into a token against the
// ones requested. Fields the HSM did not return are not compared.
function checkIssuedToken(token, expected) {
  var diffs = [];
  function cmp(field, got, want) {
    if (got === undefined || got === null || got === '') return;
    if (String(Number(got)) !== String(Number(want))) diffs.push({ field: field, requested: want, issued: got });
  }
  if (token.drn) {
    var d = String(token.drn).replace(/\D/g, '');
    if (d && d.slice(-String(expected.drn).length) !== String(expected.drn)) diffs.push({ field: 'drn', requested: expected.drn, issued: token.drn });
  }
  cmp('sgc', token.sgc, expected.sgc);
  cmp('krn', token.krn, expected.krn);
  cmp('ti', token.ti, expected.ti);
  if (expected.transferAmount !== undefined) cmp('transferAmount', token.transferAmount, expected.transferAmount);
  if (diffs.length) {
    return fail('STS_TOKEN_PARAMS_MISMATCH', 'The HSM issued a token with different parameters than requested; it was not recorded.', { mismatches: diffs });
  }
  return { ok: true };
}

module.exports = {
  KEY_TYPES: KEY_TYPES,
  FACTORY_DEFAULT_SGCS: FACTORY_DEFAULT_SGCS,
  checkStsParams: checkStsParams,
  checkIssuedToken: checkIssuedToken,
  verifyMeter: verifyMeter,
  parseMeterReport: parseMeterReport,
};
