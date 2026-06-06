/**
 * PrismVend HSM Service — PrismVend Web Vending API (PR-D2-1112 rev 5.22.2)
 *
 * Handles the Backend <-> PrismVend communication for the City of Windhoek vending system:
 * 1. Makes HTTP/HTTPS requests to PrismVend's TsmWeb-STS web service
 * 2. Supports credit token generation, engineering tokens, key changes, meter registration
 * 3. Generates PrismVend-compatible CSV files for bulk operations
 *
 * PrismVend runs on a Windows PC with a TSM250 USB security module and exposes
 * a Web API over HTTP/HTTPS for external STS token generation.
 *
 * API notes (PR-D2-1112 rev 5.22.2):
 *   - No authentication mechanism — the API is designed for secured/localhost networks
 *   - POST bodies use application/x-www-form-urlencoded (HTML form encoding)
 *   - Responses are INI format (key=value lines) when using .ini endpoints
 *   - All monetary values are in CENTS (multiply N$ by 100)
 *
 * Configuration:
 *   Set hsmConfig.host to match the PrismVend server on the local network.
 *   The system will refuse to generate tokens until connected to a real PrismVend instance.
 */
var http = require('http');
var https = require('https');
var fs = require('fs');
var path = require('path');
var querystring = require('querystring');

// ─── PrismVend Connection Config ──────────────────────────────────────────
var hsmConfig = {
  mode: 'prismvend',       // only mode now
  host: null,              // PrismVend server IP (e.g. '192.168.1.100')
  port: 8080,              // Web service port (default 8080)
  uiPort: 80,              // Web UI port (default 80)
  tlsPort: 9443,           // TLS/Thrift service port (default 9443)
  useTLS: false,           // use HTTPS for API requests
  timeout: 15000,          // ms
  nsssession: null,        // nsssession cookie if PrismVend sets one
  // API endpoint paths per PR-D2-1112 rev 5.22.2
  endpoints: {
    creditVend: '/stsvend/VendCredit2.ini',
    engineeringToken: '/stsvend/VendMse.ini',
    meterInfo: '/stsvend/Meter/{drnOrPan}.ini',
    meterRegister: '/stsvend/Meter/{drnOrPan}.ini',
    keyChange: '/stsvend/EngineeringKeyChange.ini',
    updateMeterKey: '/stsvend/UpdateMeterKey.ini',
    queryTx: '/stsvend/QueryTx.ini'
  }
};

// ─── STS Constants ─────────────────────────────────────────────────────────

var TOKEN_CLASS = { ELECTRICITY: 0, WATER: 1, GAS: 2 };
var TOKEN_SUBCLASS = { CREDIT: 0, ENGINEERING: 1, KEY_CHANGE: 2 };
var DEFAULT_EA = 7;       // EA07 (STS standard, always 7)
var DEFAULT_TCT = 2;      // Token carrier type (always 2)
var DEFAULT_SGC = '999907';
var DEFAULT_KRN = 2;
var DEFAULT_TI = 1;

// ─── Engineering Token Subclasses (VendMse) ────────────────────────────────

var MSE_SUBCLASS = {
  SET_MAX_POWER_LIMIT: 0,
  CLEAR_CREDIT: 1,
  CLEAR_TAMPER: 5,
  SET_MAX_PHASE_POWER_UNBALANCE_LIMIT: 6,
  SET_WATER_METER_FACTOR: 7
};

// ─── CSV Output Directory ──────────────────────────────────────────────────

var CSV_OUTPUT_DIR = '/tmp/gridx-prismvend';

function ensureOutputDir() {
  try {
    if (!fs.existsSync(CSV_OUTPUT_DIR)) {
      fs.mkdirSync(CSV_OUTPUT_DIR, { recursive: true });
    }
  } catch (e) {
    console.error('[PrismVend] Could not create CSV output dir:', e.message);
  }
}

// ─── INI Response Parser ──────────────────────────────────────────────────

/**
 * Parse a PrismVend INI response body into a JS object.
 * INI format: lines of key=value separated by \n.
 * Values that look numeric are left as strings (caller converts as needed).
 *
 * @param {string} body - Raw INI response text
 * @returns {object} Parsed key-value pairs
 */
function parseINIResponse(body) {
  var result = {};
  if (!body || typeof body !== 'string') return result;

  var lines = body.split('\n');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].replace(/\r$/, '');
    if (!line || line.charAt(0) === '#') continue;
    var eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    var key = line.substring(0, eqIdx).trim();
    var val = line.substring(eqIdx + 1).trim();
    if (key) {
      result[key] = val;
    }
  }
  return result;
}

// ─── Form Body Builder ───────────────────────────────────────────────────

/**
 * Build a URL-encoded form body string from a params object.
 * Skips null/undefined values.
 *
 * @param {object} params - Key-value pairs to encode
 * @returns {string} URL-encoded form body (e.g. "meterId=12345&subclass=0&value=5000")
 */
function buildFormBody(params) {
  var filtered = {};
  var keys = Object.keys(params);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (params[k] !== null && params[k] !== undefined) {
      filtered[k] = params[k];
    }
  }
  return querystring.stringify(filtered);
}

// ─── HTTP Client for PrismVend ─────────────────────────────────────────────

/**
 * Make an HTTP/HTTPS request to PrismVend's web vending API.
 * No authentication is required (PR-D2-1112 rev 5.22.2 specifies no auth).
 * POST requests use application/x-www-form-urlencoded body format.
 * Responses are parsed as INI (key=value) format.
 *
 * @param {string} method - HTTP method (GET or POST)
 * @param {string} apiPath - API endpoint path (e.g. '/stsvend/VendCredit2.ini')
 * @param {object|null} params - For POST: key-value params to form-encode; for GET: ignored
 * @param {function} callback - callback(err, parsedINIObject)
 */
function prismvendRequest(method, apiPath, params, callback) {
  if (!hsmConfig.host) {
    return callback(new Error(
      'PrismVend not configured. Set hsmConfig.host to the PrismVend server IP address.'
    ));
  }

  var postData = null;
  var headers = {
    'Accept': '*/*'
  };

  if (method === 'POST' && params) {
    postData = buildFormBody(params);
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    headers['Content-Length'] = Buffer.byteLength(postData);
  }

  // Forward nsssession cookie if we have one
  if (hsmConfig.nsssession) {
    headers['Cookie'] = hsmConfig.nsssession;
  }

  var port = hsmConfig.port || 8080;
  var options = {
    hostname: hsmConfig.host,
    port: port,
    path: apiPath,
    method: method,
    headers: headers,
    timeout: hsmConfig.timeout,
    rejectUnauthorized: false // PrismVend often uses self-signed certs
  };

  var httpModule = hsmConfig.useTLS ? https : http;
  var responded = false;

  var req = httpModule.request(options, function(res) {
    var responseBody = '';
    res.on('data', function(chunk) { responseBody += chunk; });
    res.on('end', function() {
      if (responded) return;
      responded = true;

      // Capture nsssession cookie if PrismVend sets one
      var setCookie = res.headers['set-cookie'];
      if (setCookie && setCookie.length > 0) {
        for (var ci = 0; ci < setCookie.length; ci++) {
          var cookieStr = setCookie[ci].split(';')[0];
          if (cookieStr.indexOf('nsssession') !== -1 || !hsmConfig.nsssession) {
            hsmConfig.nsssession = cookieStr;
          }
        }
      }

      if (res.statusCode >= 500) {
        return callback(new Error('PrismVend server error (' + res.statusCode + '): ' + responseBody));
      }

      if (res.statusCode >= 400) {
        return callback(new Error('PrismVend error (' + res.statusCode + '): ' + responseBody));
      }

      // Parse INI response
      var parsed = parseINIResponse(responseBody);

      // Check for error indicators in the parsed response
      if (parsed.error || parsed.Error) {
        return callback(new Error('PrismVend API error: ' + (parsed.error || parsed.Error)));
      }
      if (parsed.errorDescription || parsed.ErrorDescription) {
        return callback(new Error('PrismVend API error: ' + (parsed.errorDescription || parsed.ErrorDescription)));
      }

      callback(null, parsed);
    });
  });

  req.on('timeout', function() {
    if (responded) return;
    responded = true;
    req.destroy();
    callback(new Error('PrismVend request timed out after ' + hsmConfig.timeout + 'ms. Check network connectivity to ' + hsmConfig.host + ':' + port));
  });

  req.on('error', function(err) {
    if (responded) return;
    responded = true;
    callback(new Error('PrismVend connection error: ' + err.message + '. Is the TsmWeb-STS service running on ' + hsmConfig.host + ':' + port + '?'));
  });

  if (postData) {
    req.write(postData);
  }
  req.end();
}


// ─── Generate STS Token (Main Entry Point) ─────────────────────────────────

/**
 * Generate a credit token via PrismVend.
 * Uses POST /stsvend/VendCredit2.ini
 *
 * @param {object} meterSecurityParams - Meter security parameters from DB
 *   - meterNumber/meterPAN/decoderReferenceNumber: DRN or 35-digit IDRecord
 *   - sgc: 6-digit supply group code
 *   - keyRevisionNumber/KRN: key revision number
 *   - tariffIndex/TI: tariff index
 *   - ea: encryption algorithm (always 7)
 *   - tct: token carrier type (always 2)
 * @param {number} purchaseAmountNAD - Purchase amount in N$ (Namibian dollars)
 * @param {function} callback - callback(err, result)
 */
function generateSTSToken(meterSecurityParams, purchaseAmountNAD, callback) {
  if (!hsmConfig.host) {
    return callback(new Error(
      'PrismVend not configured. Set hsmConfig.host to the PrismVend server IP. ' +
      'The PrismVend TsmWeb-STS service must be running on the target machine.'
    ));
  }

  var meterId = meterSecurityParams.decoderReferenceNumber ||
    meterSecurityParams.meterPAN || meterSecurityParams.meterNumber || '';
  meterId = String(meterId).replace(/[^0-9]/g, '');

  if (!meterId) {
    return callback(new Error('Meter DRN/PAN is required for token generation'));
  }

  // Convert N$ to cents
  var valueCents = Math.round(parseFloat(purchaseAmountNAD) * 100);
  if (isNaN(valueCents) || valueCents <= 0) {
    return callback(new Error('Invalid purchase amount: ' + purchaseAmountNAD));
  }

  // Generate a messageId for idempotency/replay prevention
  var messageId = 'gx-' + Date.now() + '-' + Math.floor(Math.random() * 10000);

  var formParams = {
    meterId: meterId,
    subclass: 0,           // 0 = electricity
    value: valueCents,     // in CENTS
    messageId: messageId
  };

  console.log('[PrismVend] Generating credit token for meter %s, amount: N$%s (%s cents), messageId: %s',
    meterId, purchaseAmountNAD, valueCents, messageId);

  var endpoint = hsmConfig.endpoints.creditVend;

  prismvendRequest('POST', endpoint, formParams, function(err, response) {
    if (err) {
      console.error('[PrismVend] Token generation failed for meter %s: %s', meterId, err.message);
      return callback(err);
    }

    try {
      var result = parsePrismVendTokenResponse(response, meterSecurityParams);
      console.log('[PrismVend] Token generated successfully for meter %s: %s',
        meterId, formatTokenForDisplay(result.token20Digit));
      callback(null, result);
    } catch (parseErr) {
      callback(new Error('PrismVend response parse error: ' + parseErr.message +
        '. Raw response keys: ' + Object.keys(response).join(',')));
    }
  });
}


// ─── Parse PrismVend Token Response ────────────────────────────────────────

/**
 * Parse the PrismVend VendCredit2.ini INI response and extract the 20-digit token(s).
 *
 * Expected response fields:
 *   idRecord, tariff, subclass, description, vendTimeUnix, unitsActual,
 *   unitName, valueActual, tillslipSv, numTokens, toIdRecord,
 *   tokenDec_1..tokenDec_N, description_1..description_N
 */
function parsePrismVendTokenResponse(response, securityParams) {
  if (!response || Object.keys(response).length === 0) {
    throw new Error('Empty response from PrismVend');
  }

  // The primary token is in tokenDec_1
  var token20 = response.tokenDec_1 || response.tokenDec || '';
  token20 = String(token20).replace(/[\s\-\.]/g, '');

  if (!token20 || token20.length !== 20 || !/^\d{20}$/.test(token20)) {
    // Fallback: search all response values for a 20-digit number
    var keys = Object.keys(response);
    for (var i = 0; i < keys.length; i++) {
      var val = String(response[keys[i]]);
      if (/^\d{20}$/.test(val)) {
        token20 = val;
        break;
      }
    }
    if (!token20 || token20.length !== 20 || !/^\d{20}$/.test(token20)) {
      throw new Error('PrismVend response did not contain a valid 20-digit STS token');
    }
  }

  // Collect all tokens if numTokens > 1
  var numTokens = parseInt(response.numTokens || '1');
  var allTokens = [];
  for (var t = 1; t <= numTokens; t++) {
    var tk = response['tokenDec_' + t];
    if (tk) {
      allTokens.push(String(tk).replace(/[\s\-\.]/g, ''));
    }
  }
  if (allTokens.length === 0) {
    allTokens.push(token20);
  }

  var meterNumber = securityParams.meterNumber || securityParams.meterPAN ||
    securityParams.decoderReferenceNumber || '';

  return {
    token20Digit: token20,
    allTokens: allTokens,
    numTokens: numTokens,
    idRecord: response.idRecord || '',
    toIdRecord: response.toIdRecord || '',
    tariff: response.tariff || '',
    subclass: response.subclass || '',
    description: response.description || '',
    vendTimeUnix: response.vendTimeUnix || '',
    unitsActual: parseFloat(response.unitsActual || '0'),
    unitName: response.unitName || 'kWh',
    valueActual: parseFloat(response.valueActual || '0'),
    tillslipSv: response.tillslipSv || '',
    TCT: String(securityParams.tct || DEFAULT_TCT),
    IDRecord: padRight(meterNumber, 35),
    PRNRecord: formatPRNRecord(token20, securityParams),
    simulated: false
  };
}


// ─── Meter Info (GET) ─────────────────────────────────────────────────────

/**
 * Get meter information from PrismVend.
 * Uses GET /stsvend/Meter/{drnOrPan}.ini
 *
 * @param {string} drnOrPan - Meter DRN or PAN
 * @param {function} callback - callback(err, result)
 *
 * Response fields: drn, sgc, krn, ti, ea, tct, resType, name, organisation,
 *   balanceCf, meterPan, idRecord, isRegistered, queuedKct, docId,
 *   channelFee, tariffRate
 */
function getMeterInfo(drnOrPan, callback) {
  if (!hsmConfig.host) {
    return callback(new Error('PrismVend not configured'));
  }

  var cleanId = String(drnOrPan).replace(/[^0-9]/g, '');
  if (!cleanId) {
    return callback(new Error('Meter DRN or PAN is required'));
  }

  var endpoint = hsmConfig.endpoints.meterInfo.replace('{drnOrPan}', cleanId);

  console.log('[PrismVend] Getting meter info for %s', cleanId);

  prismvendRequest('GET', endpoint, null, function(err, response) {
    if (err) {
      console.error('[PrismVend] Get meter info failed for %s: %s', cleanId, err.message);
      return callback(err);
    }

    console.log('[PrismVend] Meter info retrieved for %s', cleanId);
    callback(null, {
      drn: response.drn || '',
      sgc: response.sgc || '',
      krn: response.krn || '',
      ti: response.ti || '',
      ea: response.ea || '',
      tct: response.tct || '',
      resType: response.resType || '',
      name: response.name || '',
      organisation: response.organisation || '',
      balanceCf: response.balanceCf || '',
      meterPan: response.meterPan || '',
      idRecord: response.idRecord || '',
      isRegistered: response.isRegistered || '',
      queuedKct: response.queuedKct || '',
      docId: response.docId || '',
      channelFee: response.channelFee || '',
      tariffRate: response.tariffRate || ''
    });
  });
}


// ─── Meter Registration ────────────────────────────────────────────────────

/**
 * Register or set a meter with PrismVend.
 * Uses POST /stsvend/Meter/{drn}.ini
 *
 * @param {object} meterParams - Meter parameters
 *   - meterPAN/meterNumber/decoderReferenceNumber: DRN
 *   - organisation: org name
 *   - customerName/name: customer name
 *   - sgc: 6-digit supply group code
 *   - krn: key revision number
 *   - ti: tariff index
 *   - resourceType/resType: 0 (electricity) or 1 (water)
 *   - docId: document ID (use "new" for new meters)
 * @param {function} callback - callback(err, result)
 */
function registerMeter(meterParams, callback) {
  if (!hsmConfig.host) {
    return callback(new Error('PrismVend not configured'));
  }

  var drn = String(meterParams.meterPAN || meterParams.meterNumber ||
    meterParams.decoderReferenceNumber || '').replace(/[^0-9]/g, '');
  if (!drn) {
    return callback(new Error('Meter DRN/PAN is required for registration'));
  }

  var sgc = String(meterParams.sgc || DEFAULT_SGC).replace(/[^0-9]/g, '');
  if (sgc.length !== 6) {
    return callback(new Error('SGC must be 6 digits. Got: ' + sgc));
  }

  var formParams = {
    docId: meterParams.docId || 'new',
    sgc: sgc,
    krn: parseInt(meterParams.krn || meterParams.keyRevisionNumber || DEFAULT_KRN),
    ti: parseInt(meterParams.ti || meterParams.tariffIndex || DEFAULT_TI),
    resType: parseInt(meterParams.resourceType || meterParams.resType || 0),
    ea: DEFAULT_EA,
    tct: DEFAULT_TCT,
    name: meterParams.customerName || meterParams.name || '',
    organisation: meterParams.organisation || meterParams.organization || ''
  };

  var endpoint = hsmConfig.endpoints.meterRegister.replace('{drnOrPan}', drn);

  console.log('[PrismVend] Registering meter %s with SGC %s', drn, sgc);

  prismvendRequest('POST', endpoint, formParams, function(err, response) {
    if (err) {
      console.error('[PrismVend] Meter registration failed: %s', err.message);
      return callback(err);
    }

    console.log('[PrismVend] Meter %s registered successfully', drn);
    callback(null, {
      success: true,
      drn: drn,
      sgc: sgc,
      isRegistered: response.isRegistered || '',
      idRecord: response.idRecord || '',
      name: response.name || '',
      organisation: response.organisation || '',
      response: response
    });
  });
}


// ─── Key Change Tokens (Engineering Key Change) ──────────────────────────

/**
 * Generate engineering key change tokens for a meter via PrismVend.
 * Uses POST /stsvend/EngineeringKeyChange.ini
 *
 * @param {object} meterParams - Current meter security params
 *   - meterPAN/meterNumber/decoderReferenceNumber: DRN
 *   - sgc: current (from) SGC
 *   - krn: current (from) KRN
 *   - ti: current (from) TI
 * @param {string} toSgc - Destination SGC
 * @param {number} toKrn - Destination KRN
 * @param {number} toTi - Destination TI
 * @param {function} callback - callback(err, result)
 */
function generateKeyChangeTokens(meterParams, toSgc, toKrn, toTi, callback) {
  if (!hsmConfig.host) {
    return callback(new Error('PrismVend not configured'));
  }

  var meterId = String(meterParams.meterPAN || meterParams.meterNumber ||
    meterParams.decoderReferenceNumber || '').replace(/[^0-9]/g, '');
  var fromSgc = String(meterParams.sgc || DEFAULT_SGC).replace(/[^0-9]/g, '');
  var fromKrn = parseInt(meterParams.krn || meterParams.keyRevisionNumber || DEFAULT_KRN);
  var fromTi = parseInt(meterParams.ti || meterParams.tariffIndex || DEFAULT_TI);

  var messageId = 'gx-kc-' + Date.now() + '-' + Math.floor(Math.random() * 10000);

  var formParams = {
    meterId: meterId,
    fromSgc: fromSgc,
    fromKrn: fromKrn,
    fromTi: fromTi,
    toSgc: String(toSgc).replace(/[^0-9]/g, ''),
    toKrn: parseInt(toKrn),
    toTi: parseInt(toTi),
    messageId: messageId
  };

  console.log('[PrismVend] Generating key change tokens for meter %s: SGC %s->%s, KRN %s->%s',
    meterId, fromSgc, toSgc, fromKrn, toKrn);

  var endpoint = hsmConfig.endpoints.keyChange;

  prismvendRequest('POST', endpoint, formParams, function(err, response) {
    if (err) {
      console.error('[PrismVend] Key change failed for meter %s: %s', meterId, err.message);
      return callback(err);
    }

    // Key change returns multiple tokens: tokenDec_1..tokenDec_N
    var numTokens = parseInt(response.numTokens || '0');
    var tokens = [];
    for (var i = 1; i <= numTokens; i++) {
      var tk = response['tokenDec_' + i];
      if (tk) {
        tokens.push({
          tokenDec: String(tk).replace(/[\s\-\.]/g, ''),
          description: response['description_' + i] || ''
        });
      }
    }

    console.log('[PrismVend] Key change tokens generated for meter %s: %d tokens', meterId, tokens.length);
    callback(null, {
      success: true,
      meterId: meterId,
      fromSgc: fromSgc,
      fromKrn: fromKrn,
      toSgc: String(toSgc).replace(/[^0-9]/g, ''),
      toKrn: parseInt(toKrn),
      description: response.description || '',
      vendTimeUnix: response.vendTimeUnix || '',
      fromIdRecord: response.fromIdRecord || '',
      toIdRecord: response.toIdRecord || '',
      isRegistered: response.isRegistered || '',
      numTokens: numTokens,
      tokens: tokens,
      response: response
    });
  });
}


// ─── Engineering Tokens (VendMse) ─────────────────────────────────────────

/**
 * Generate an engineering (MSE) token for a meter via PrismVend.
 * Uses POST /stsvend/VendMse.ini
 *
 * Engineering subclasses:
 *   0 = SetMaxPowerLimit
 *   1 = ClearCredit
 *   5 = ClearTamper
 *   6 = SetMaxPhasePowerUnbalanceLimit
 *   7 = SetWaterMeterFactor
 *
 * @param {object} meterParams - Meter security params
 *   - meterPAN/meterNumber/decoderReferenceNumber: DRN
 * @param {object} options - Engineering token options
 *   - subclass: MSE subclass number (0/1/5/6/7)
 *   - supp: supplementary value (default 0)
 *   OR legacy boolean options:
 *   - maxPowerLimit: boolean (subclass 0)
 *   - clearCredit: boolean (subclass 1)
 *   - clearTamper: boolean (subclass 5)
 *   - maxPhaseLimit: boolean (subclass 6)
 *   - maxPowerLimitValue: value for subclass 0
 *   - maxPhaseLimitValue: value for subclass 6
 * @param {function} callback - callback(err, result)
 */
function generateEngineeringTokens(meterParams, options, callback) {
  if (!hsmConfig.host) {
    return callback(new Error('PrismVend not configured'));
  }

  var meterId = String(meterParams.meterPAN || meterParams.meterNumber ||
    meterParams.decoderReferenceNumber || '').replace(/[^0-9]/g, '');

  // Determine subclass and supp value
  var subclass;
  var supp = 0;

  if (options.subclass !== undefined) {
    // Direct subclass specification
    subclass = parseInt(options.subclass);
    supp = options.supp !== undefined ? parseInt(options.supp) : 0;
  } else {
    // Legacy boolean-style options — pick the first enabled one
    if (options.maxPowerLimit) {
      subclass = MSE_SUBCLASS.SET_MAX_POWER_LIMIT;
      supp = options.maxPowerLimitValue !== undefined ? parseInt(options.maxPowerLimitValue) : 0;
    } else if (options.clearCredit) {
      subclass = MSE_SUBCLASS.CLEAR_CREDIT;
    } else if (options.clearTamper) {
      subclass = MSE_SUBCLASS.CLEAR_TAMPER;
    } else if (options.maxPhaseLimit) {
      subclass = MSE_SUBCLASS.SET_MAX_PHASE_POWER_UNBALANCE_LIMIT;
      supp = options.maxPhaseLimitValue !== undefined ? parseInt(options.maxPhaseLimitValue) : 0;
    } else {
      return callback(new Error('Engineering token type not specified. Provide subclass (0/1/5/6/7) or a boolean option.'));
    }
  }

  var messageId = 'gx-mse-' + Date.now() + '-' + Math.floor(Math.random() * 10000);

  var formParams = {
    meterId: meterId,
    subclass: subclass,
    supp: supp,
    messageId: messageId
  };

  console.log('[PrismVend] Generating engineering token (subclass=%d, supp=%d) for meter %s',
    subclass, supp, meterId);

  var endpoint = hsmConfig.endpoints.engineeringToken;

  prismvendRequest('POST', endpoint, formParams, function(err, response) {
    if (err) {
      console.error('[PrismVend] Engineering token generation failed for meter %s: %s', meterId, err.message);
      return callback(err);
    }

    var tokenDec = response.tokenDec || '';
    var tokenHex = response.tokenHex || '';

    console.log('[PrismVend] Engineering token generated for meter %s: %s', meterId,
      tokenDec ? formatTokenForDisplay(tokenDec) : '(hex: ' + tokenHex + ')');

    callback(null, {
      success: true,
      meterId: meterId,
      subclass: subclass,
      supp: supp,
      tokenDec: String(tokenDec).replace(/[\s\-\.]/g, ''),
      tokenHex: tokenHex,
      idRecord: response.idRecord || '',
      description: response.description || '',
      vendTimeUnix: response.vendTimeUnix || '',
      unitsActual: response.unitsActual || '',
      unitName: response.unitName || '',
      response: response
    });
  });
}


// ─── Query Transaction Counter ────────────────────────────────────────────

/**
 * Query the transaction counter from PrismVend.
 * Uses GET /stsvend/QueryTx.ini
 *
 * @param {function} callback - callback(err, result)
 *   result: { txCredit: number }
 */
function queryTransactionCounter(callback) {
  if (!hsmConfig.host) {
    return callback(new Error('PrismVend not configured'));
  }

  var endpoint = hsmConfig.endpoints.queryTx;

  console.log('[PrismVend] Querying transaction counter');

  prismvendRequest('GET', endpoint, null, function(err, response) {
    if (err) {
      console.error('[PrismVend] QueryTx failed: %s', err.message);
      return callback(err);
    }

    var txCredit = parseInt(response.txCredit || '0');
    console.log('[PrismVend] Transaction counter: txCredit=%d', txCredit);

    callback(null, {
      txCredit: txCredit
    });
  });
}


// ─── Update Meter Key (KCT) ──────────────────────────────────────────────

/**
 * Update a meter's key via PrismVend.
 * Uses POST /stsvend/UpdateMeterKey.ini
 *
 * @param {object} params - Update params
 *   - meterId: DRN
 *   - fromSgc: source SGC
 *   - fromKrn: source KRN
 *   - fromTi: source TI
 *   - skipIfSameMeterKey: default 1
 * @param {function} callback - callback(err, result)
 */
function updateMeterKey(params, callback) {
  if (!hsmConfig.host) {
    return callback(new Error('PrismVend not configured'));
  }

  var messageId = 'gx-umk-' + Date.now() + '-' + Math.floor(Math.random() * 10000);

  var formParams = {
    meterId: String(params.meterId || '').replace(/[^0-9]/g, ''),
    fromSgc: String(params.fromSgc || '').replace(/[^0-9]/g, ''),
    fromKrn: parseInt(params.fromKrn || DEFAULT_KRN),
    fromTi: parseInt(params.fromTi || DEFAULT_TI),
    messageId: messageId,
    skipIfSameMeterKey: params.skipIfSameMeterKey !== undefined ? parseInt(params.skipIfSameMeterKey) : 1
  };

  console.log('[PrismVend] Updating meter key for %s', formParams.meterId);

  var endpoint = hsmConfig.endpoints.updateMeterKey;

  prismvendRequest('POST', endpoint, formParams, function(err, response) {
    if (err) {
      console.error('[PrismVend] UpdateMeterKey failed for %s: %s', formParams.meterId, err.message);
      return callback(err);
    }

    // Collect key change tokens
    var numTokens = parseInt(response.numTokens || '0');
    var tokens = [];
    for (var i = 1; i <= numTokens; i++) {
      var tk = response['tokenDec_' + i];
      if (tk) {
        tokens.push({
          tokenDec: String(tk).replace(/[\s\-\.]/g, ''),
          description: response['description_' + i] || ''
        });
      }
    }

    console.log('[PrismVend] Meter key updated for %s: %d tokens', formParams.meterId, tokens.length);
    callback(null, {
      success: true,
      meterId: formParams.meterId,
      description: response.description || '',
      vendTimeUnix: response.vendTimeUnix || '',
      fromIdRecord: response.fromIdRecord || '',
      toIdRecord: response.toIdRecord || '',
      isRegistered: response.isRegistered || '',
      numTokens: numTokens,
      tokens: tokens,
      response: response
    });
  });
}


// ─── Token Verification ────────────────────────────────────────────────────

/**
 * Verify a token — note: PrismVend Web Vending API (PR-D2-1112) does not
 * define a dedicated verify endpoint. This uses meter info + credit vend
 * with messageId replay to check. Left as a stub for future API extensions.
 *
 * @param {string} meterPan - Meter PAN/DRN
 * @param {string} token - 20-digit token to verify
 * @param {function} callback - callback(err, result)
 */
function verifyToken(meterPan, token, callback) {
  if (!hsmConfig.host) {
    return callback(new Error('PrismVend not configured'));
  }

  var cleanPan = String(meterPan).replace(/[^0-9]/g, '');
  var cleanToken = String(token).replace(/[^0-9]/g, '');

  if (cleanToken.length !== 20) {
    return callback(new Error('Token must be exactly 20 digits'));
  }

  // No dedicated verify endpoint in PR-D2-1112 rev 5.22.2
  // Use getMeterInfo as a basic connectivity/existence check
  getMeterInfo(cleanPan, function(err, meterInfo) {
    if (err) {
      return callback(err);
    }

    callback(null, {
      meterExists: !!(meterInfo && meterInfo.drn),
      isRegistered: meterInfo.isRegistered || '',
      meterPAN: cleanPan,
      token: cleanToken,
      meterInfo: meterInfo
    });
  });
}


// ─── Meter History ─────────────────────────────────────────────────────────

/**
 * Get meter transaction history.
 * Note: PrismVend Web Vending API (PR-D2-1112) does not define a history endpoint.
 * This uses getMeterInfo as a fallback. For full history, use PrismVend's UI.
 *
 * @param {string} meterPan - Meter PAN/DRN
 * @param {function} callback - callback(err, result)
 */
function getMeterHistory(meterPan, callback) {
  if (!hsmConfig.host) {
    return callback(new Error('PrismVend not configured'));
  }

  var cleanPan = String(meterPan).replace(/[^0-9]/g, '');

  console.log('[PrismVend] Fetching info for meter %s (no dedicated history endpoint)', cleanPan);

  getMeterInfo(cleanPan, function(err, meterInfo) {
    if (err) {
      return callback(err);
    }

    callback(null, {
      meterPAN: cleanPan,
      meterInfo: meterInfo,
      history: [] // No history endpoint in PR-D2-1112
    });
  });
}


// ═══════════════════════════════════════════════════════════════════════════
// BULK CSV GENERATION — PrismVend Import Compatible
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a CSV file for bulk meter registration import into PrismVend.
 *
 * PrismVend CSV format:
 * Meta,MeterPAN,Organisation,Name,SGC,KRN,TI,EA,TCT,restype,isregistered,result
 *
 * @param {Array} meters - Array of meter objects
 *   Each meter: { meterPAN, organisation, name, sgc, krn, ti, resourceType, isRegistered }
 * @returns {object} { csv: string, filename: string, filepath: string }
 */
function generateBulkMeterImportCSV(meters) {
  var header = 'Meta,MeterPAN,Organisation,Name,SGC,KRN,TI,EA,TCT,restype,isregistered,result';
  var lines = [header];

  for (var i = 0; i < meters.length; i++) {
    var m = meters[i];
    var pan = String(m.meterPAN || m.meterNumber || '').replace(/[^0-9]/g, '');
    var sgc = String(m.sgc || DEFAULT_SGC).replace(/[^0-9]/g, '');

    // PrismVend requires # prefix on PAN and SGC
    var formattedPAN = '#' + pan;
    var formattedSGC = '#' + padLeft(sgc, 6, '0');

    var line = [
      '',                                                       // Meta (empty)
      formattedPAN,                                             // MeterPAN
      csvEscape(m.organisation || m.organization || ''),        // Organisation
      csvEscape(m.customerName || m.name || ''),                // Name
      formattedSGC,                                             // SGC
      String(parseInt(m.krn || m.keyRevisionNumber || DEFAULT_KRN)),  // KRN
      String(parseInt(m.ti || m.tariffIndex || DEFAULT_TI)),    // TI
      String(DEFAULT_EA),                                       // EA (always 7)
      String(DEFAULT_TCT),                                      // TCT (always 2)
      String(parseInt(m.resourceType || 0)),                    // restype (0=electricity, 1=water)
      m.isRegistered ? 'y' : 'n',                               // isregistered
      ''                                                         // result (filled by PrismVend)
    ].join(',');

    lines.push(line);
  }

  var csv = lines.join('\r\n') + '\r\n';
  var filename = 'meter_import_' + Date.now() + '.csv';
  var filepath = path.join(CSV_OUTPUT_DIR, filename);

  ensureOutputDir();
  try {
    fs.writeFileSync(filepath, csv, 'utf8');
  } catch (e) {
    console.error('[PrismVend] Failed to write CSV file:', e.message);
  }

  return {
    csv: csv,
    filename: filename,
    filepath: filepath,
    meterCount: meters.length
  };
}


/**
 * Generate a CSV file for bulk key change import into PrismVend.
 *
 * PrismVend CSV format:
 * Meta,MeterPan,Sgc,Krn,Ti,Ea,Tct,toSgc,toKrn,toTi,Tokens,Result
 *
 * @param {Array} meters - Array of meter objects with source and destination params
 *   Each meter: { meterPAN, sgc, krn, ti, toSgc, toKrn, toTi }
 * @returns {object} { csv: string, filename: string, filepath: string }
 */
function generateBulkKeyChangeCSV(meters) {
  var header = 'Meta,MeterPan,Sgc,Krn,Ti,Ea,Tct,toSgc,toKrn,toTi,Tokens,Result';
  var lines = [header];

  for (var i = 0; i < meters.length; i++) {
    var m = meters[i];
    var pan = String(m.meterPAN || m.meterNumber || '').replace(/[^0-9]/g, '');
    var sgc = String(m.sgc || DEFAULT_SGC).replace(/[^0-9]/g, '');
    var toSgc = String(m.toSgc || sgc).replace(/[^0-9]/g, '');

    var line = [
      '',                                                       // Meta
      '#' + pan,                                                // MeterPan
      '#' + padLeft(sgc, 6, '0'),                               // Sgc
      String(parseInt(m.krn || m.keyRevisionNumber || DEFAULT_KRN)),  // Krn
      String(parseInt(m.ti || m.tariffIndex || DEFAULT_TI)),    // Ti
      String(DEFAULT_EA),                                       // Ea
      String(DEFAULT_TCT),                                      // Tct
      '#' + padLeft(toSgc, 6, '0'),                             // toSgc
      String(parseInt(m.toKrn || m.krn || DEFAULT_KRN)),        // toKrn
      String(parseInt(m.toTi || m.ti || DEFAULT_TI)),           // toTi
      '',                                                        // Tokens (filled by PrismVend)
      ''                                                         // Result (filled by PrismVend)
    ].join(',');

    lines.push(line);
  }

  var csv = lines.join('\r\n') + '\r\n';
  var filename = 'key_change_' + Date.now() + '.csv';
  var filepath = path.join(CSV_OUTPUT_DIR, filename);

  ensureOutputDir();
  try {
    fs.writeFileSync(filepath, csv, 'utf8');
  } catch (e) {
    console.error('[PrismVend] Failed to write CSV file:', e.message);
  }

  return {
    csv: csv,
    filename: filename,
    filepath: filepath,
    meterCount: meters.length
  };
}


/**
 * Generate a CSV file for bulk engineering token generation in PrismVend.
 *
 * PrismVend CSV format:
 * #HDR:meta,meterpan,sgc,krn,ti,ea,tct,maxPowerLimitToken,clearCreditToken,clearTamperToken,maxPhaseLimitInputToken,result
 *
 * @param {Array} meters - Array of meter objects with engineering token options
 *   Each meter: { meterPAN, sgc, krn, ti, maxPowerLimit, clearCredit, clearTamper, maxPhaseLimit }
 * @returns {object} { csv: string, filename: string, filepath: string }
 */
function generateBulkEngineeringCSV(meters) {
  var header = '#HDR:meta,meterpan,sgc,krn,ti,ea,tct,maxPowerLimitToken,clearCreditToken,clearTamperToken,maxPhaseLimitInputToken,result';
  var lines = [header];

  for (var i = 0; i < meters.length; i++) {
    var m = meters[i];
    var pan = String(m.meterPAN || m.meterNumber || '').replace(/[^0-9]/g, '');
    var sgc = String(m.sgc || DEFAULT_SGC).replace(/[^0-9]/g, '');

    var line = [
      '',                                                       // meta
      '#' + pan,                                                // meterpan
      '#' + padLeft(sgc, 6, '0'),                               // sgc
      String(parseInt(m.krn || m.keyRevisionNumber || DEFAULT_KRN)),  // krn
      String(parseInt(m.ti || m.tariffIndex || DEFAULT_TI)),    // ti
      String(DEFAULT_EA),                                       // ea
      String(DEFAULT_TCT),                                      // tct
      '',                                                        // maxPowerLimitToken (filled by PrismVend)
      '',                                                        // clearCreditToken (filled by PrismVend)
      '',                                                        // clearTamperToken (filled by PrismVend)
      '',                                                        // maxPhaseLimitInputToken (filled by PrismVend)
      ''                                                         // result (filled by PrismVend)
    ].join(',');

    lines.push(line);
  }

  var csv = lines.join('\r\n') + '\r\n';
  var filename = 'engineering_tokens_' + Date.now() + '.csv';
  var filepath = path.join(CSV_OUTPUT_DIR, filename);

  ensureOutputDir();
  try {
    fs.writeFileSync(filepath, csv, 'utf8');
  } catch (e) {
    console.error('[PrismVend] Failed to write CSV file:', e.message);
  }

  return {
    csv: csv,
    filename: filename,
    filepath: filepath,
    meterCount: meters.length
  };
}


// ─── Connection Health Check ──────────────────────────────────────────────

/**
 * Cached connection status — avoids hammering PrismVend on every operation.
 * Cache expires after 30 seconds.
 */
var _connectionCache = {
  result: null,
  timestamp: 0,
  ttl: 30000  // 30 seconds
};

/**
 * Check PrismVend connection health by hitting the lightweight QueryTx endpoint.
 * Verifies:
 *   1. PrismVend host is configured
 *   2. The PrismVend API is reachable (HTTP response from TsmWeb-STS)
 *   3. The TSM250 HSM is connected (txCredit comes back if HSM is working)
 *
 * Results are cached for 30 seconds to avoid excessive polling.
 *
 * @param {function} callback - callback(err, statusObject)
 */
function checkConnection(callback) {
  var now = Date.now();

  // Return cached result if still fresh
  if (_connectionCache.result && (now - _connectionCache.timestamp) < _connectionCache.ttl) {
    return callback(null, _connectionCache.result);
  }

  // Check if host is configured
  if (!hsmConfig.host) {
    var notConfigured = {
      connected: false,
      apiReachable: false,
      hsmOnline: false,
      txCreditsRemaining: null,
      status: 'not_configured',
      message: 'PrismVend host is not configured. Set the host IP address on the PrismVend Config tab.',
      checkedAt: new Date().toISOString()
    };
    _connectionCache.result = notConfigured;
    _connectionCache.timestamp = now;
    return callback(null, notConfigured);
  }

  // Hit the QueryTx endpoint — lightweight, confirms API + HSM connectivity
  var endpoint = hsmConfig.endpoints.queryTx;

  prismvendRequest('GET', endpoint, null, function(err, response) {
    var result;

    if (err) {
      // Distinguish between network errors and API errors
      var errMsg = err.message || '';
      var isTimeout = errMsg.indexOf('timed out') !== -1;
      var isConnErr = errMsg.indexOf('connection error') !== -1 || errMsg.indexOf('ECONNREFUSED') !== -1 || errMsg.indexOf('EHOSTUNREACH') !== -1;

      if (isTimeout || isConnErr) {
        result = {
          connected: false,
          apiReachable: false,
          hsmOnline: false,
          txCreditsRemaining: null,
          status: 'api_unreachable',
          message: 'Cannot reach PrismVend at ' + hsmConfig.host + ':' + (hsmConfig.port || 8080) + '. ' + errMsg,
          checkedAt: new Date().toISOString()
        };
      } else {
        // API responded but with an error — API is reachable but HSM may be offline
        result = {
          connected: false,
          apiReachable: true,
          hsmOnline: false,
          txCreditsRemaining: null,
          status: 'hsm_offline',
          message: 'PrismVend API is reachable but HSM may be offline: ' + errMsg,
          checkedAt: new Date().toISOString()
        };
      }
    } else {
      // Successful response — check if txCredit is present (indicates HSM is working)
      var txCredit = response.txCredit !== undefined ? parseInt(response.txCredit) : null;
      var hsmOnline = txCredit !== null && !isNaN(txCredit);

      if (hsmOnline) {
        result = {
          connected: true,
          apiReachable: true,
          hsmOnline: true,
          txCreditsRemaining: txCredit,
          status: 'connected',
          message: 'PrismVend is online. HSM connected with ' + txCredit + ' transaction credits remaining.',
          checkedAt: new Date().toISOString()
        };
      } else {
        result = {
          connected: false,
          apiReachable: true,
          hsmOnline: false,
          txCreditsRemaining: null,
          status: 'hsm_offline',
          message: 'PrismVend API responded but HSM status could not be confirmed (no txCredit in response).',
          checkedAt: new Date().toISOString()
        };
      }
    }

    _connectionCache.result = result;
    _connectionCache.timestamp = Date.now();
    callback(null, result);
  });
}

/**
 * Gate function — verifies PrismVend is connected before allowing an operation.
 * If not connected, calls back with an error containing the connection status.
 * If connected, calls the provided proceed callback.
 *
 * @param {function} callback - callback(err, connectionStatus) — err is set if not connected
 */
function requireConnection(callback) {
  checkConnection(function(err, status) {
    if (err) {
      return callback(new Error('Connection check failed: ' + err.message), status);
    }
    if (!status.connected) {
      var connErr = new Error('PrismVend not connected: ' + status.message);
      connErr.connectionStatus = status;
      return callback(connErr, status);
    }
    callback(null, status);
  });
}


// ─── HSM Status Check ──────────────────────────────────────────────────────

/**
 * Returns current PrismVend configuration and connection state.
 */
function getHSMStatus() {
  var configured = !!(hsmConfig.host && hsmConfig.port);

  return {
    mode: hsmConfig.mode,
    host: hsmConfig.host,
    port: hsmConfig.port,
    uiPort: hsmConfig.uiPort,
    tlsPort: hsmConfig.tlsPort,
    useTLS: hsmConfig.useTLS,
    configured: configured,
    hasSession: !!hsmConfig.nsssession,
    timeout: hsmConfig.timeout,
    endpoints: hsmConfig.endpoints,
    defaultSGC: DEFAULT_SGC,
    defaultKRN: DEFAULT_KRN,
    defaultTI: DEFAULT_TI,
    defaultEA: DEFAULT_EA,
    defaultTCT: DEFAULT_TCT,
    csvOutputDir: CSV_OUTPUT_DIR,
    mseSubclasses: MSE_SUBCLASS
  };
}


// ─── Utility Functions ──────────────────────────────────────────────────────

function padRight(str, len) {
  str = String(str || '');
  while (str.length < len) str += ' ';
  return str.substring(0, len);
}

function padLeft(str, len, ch) {
  str = String(str || '');
  while (str.length < len) str = (ch || '0') + str;
  return str.substring(0, len);
}

function formatTokenForDisplay(token20) {
  var clean = String(token20).replace(/\D/g, '');
  return clean.replace(/(.{4})/g, '$1-').replace(/-$/, '');
}

function formatPRNRecord(token20, securityParams) {
  var formatted = formatTokenForDisplay(token20);
  var meterNumber = securityParams.meterNumber || securityParams.meterPAN ||
    securityParams.decoderReferenceNumber || '';
  return 'METER: ' + meterNumber + ' | TOKEN: ' + formatted;
}

/**
 * Escape a value for CSV output — wrap in quotes if it contains commas or quotes.
 */
function csvEscape(val) {
  var str = String(val || '');
  if (str.indexOf(',') !== -1 || str.indexOf('"') !== -1 || str.indexOf('\n') !== -1) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}


// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  // Core token generation
  generateSTSToken: generateSTSToken,
  formatTokenForDisplay: formatTokenForDisplay,
  getHSMStatus: getHSMStatus,
  hsmConfig: hsmConfig,
  TOKEN_CLASS: TOKEN_CLASS,
  TOKEN_SUBCLASS: TOKEN_SUBCLASS,
  MSE_SUBCLASS: MSE_SUBCLASS,

  // PrismVend API operations
  registerMeter: registerMeter,
  generateKeyChangeTokens: generateKeyChangeTokens,
  generateEngineeringTokens: generateEngineeringTokens,
  verifyToken: verifyToken,
  getMeterHistory: getMeterHistory,
  getMeterInfo: getMeterInfo,
  queryTransactionCounter: queryTransactionCounter,
  updateMeterKey: updateMeterKey,

  // Bulk CSV generation
  generateBulkMeterImportCSV: generateBulkMeterImportCSV,
  generateBulkKeyChangeCSV: generateBulkKeyChangeCSV,
  generateBulkEngineeringCSV: generateBulkEngineeringCSV,

  // Helpers
  parseINIResponse: parseINIResponse,
  buildFormBody: buildFormBody,

  // Connection health check
  checkConnection: checkConnection,
  requireConnection: requireConnection,

  // Low-level HTTP client (for custom endpoint calls)
  prismvendRequest: prismvendRequest
};
