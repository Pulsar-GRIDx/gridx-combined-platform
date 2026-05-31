/**
 * HSM (Hardware Security Module) Service — IEC 62055-41 STS Token Generation
 *
 * Handles the Backend <-> VSM/HSM communication:
 * 1. Builds APDU token generation requests from meter security params
 * 2. Sends to HSM (or uses software simulation when no HSM is connected)
 * 3. Parses TCDU responses and returns encrypted 20-digit STS tokens
 *
 * When a physical HSM is connected, update the hsmConfig and the
 * sendToHSM() function — the rest of the flow stays the same.
 */
var crypto = require('crypto');

// HSM connection config — update when physical HSM is available
var hsmConfig = {
  mode: 'simulated',   // 'simulated' | 'tcp' | 'http'
  host: null,           // HSM IP address
  port: null,           // HSM port
  timeout: 5000,        // ms
  masterKeyId: 'GRIDx-MASTER-001'
};

// ─── STS Constants ──────────────────────────────────────────────────────────

var STS_BASE_DATE = new Date('1993-01-01T00:00:00Z');
var TOKEN_CLASS = { ELECTRICITY: 0, WATER: 1, GAS: 2 };
var TOKEN_SUBCLASS = { CREDIT: 0, ENGINEERING: 1, KEY_CHANGE: 2 };
var DEFAULT_TCT = '01';    // numeric token carrier
var DEFAULT_DKGA = '02';   // DKGA02 (STS standard)
var DEFAULT_EA = '07';     // EA07 (STS standard)
var DEFAULT_BDT = '01';    // base date type 01 (1993)

// ─── APDU Request Builder ───────────────────────────────────────────────────

function buildAPDURequest(meterSecurityParams, purchaseAmount, tokenClass, tokenSubClass) {
  var tid = getTokenIdentifier();
  var rnd = crypto.randomInt(0, 16);

  return {
    MeterPAN: padRight(meterSecurityParams.meterNumber, 18),
    TCT: meterSecurityParams.tct || DEFAULT_TCT,
    DKGA: meterSecurityParams.dkga || DEFAULT_DKGA,
    EA: meterSecurityParams.ea || DEFAULT_EA,
    SGC: padRight(meterSecurityParams.sgc, 6),
    TI: padLeft(String(meterSecurityParams.tariffIndex || 1), 2, '0'),
    KRN: String(meterSecurityParams.keyRevisionNumber || 1),
    KT: String(meterSecurityParams.keyType || 3),
    KEN: meterSecurityParams.keyExpiryNumber || 255,
    BDT: meterSecurityParams.bdt || DEFAULT_BDT,
    token: {
      Class: tokenClass !== undefined ? tokenClass : TOKEN_CLASS.ELECTRICITY,
      SubClass: tokenSubClass !== undefined ? tokenSubClass : TOKEN_SUBCLASS.CREDIT,
      RND: rnd,
      TID: tid,
      Amount: encodeAmount(purchaseAmount),
      CRC: 0  // calculated by HSM
    }
  };
}

// ─── Token Identifier (minutes since STS base date 1993-01-01) ──────────

function getTokenIdentifier() {
  var now = new Date();
  var diffMs = now.getTime() - STS_BASE_DATE.getTime();
  return Math.floor(diffMs / 60000); // minutes since base date
}

// ─── Amount Encoding (IEC 62055-41 Section 7) ───────────────────────────

function encodeAmount(amount) {
  return Math.round(amount * 10); // 0.1 kWh resolution per spec
}

function decodeAmount(encoded) {
  return encoded / 10;
}

// ─── Generate STS Token (Main Entry Point) ──────────────────────────────

function generateSTSToken(meterSecurityParams, purchaseAmountKwh, callback) {
  var apduRequest = buildAPDURequest(meterSecurityParams, purchaseAmountKwh);

  if (hsmConfig.mode === 'simulated') {
    return simulatedHSM(apduRequest, meterSecurityParams, callback);
  }

  sendToHSM(apduRequest, function(err, tcduResponse) {
    if (err) return callback(err);
    var result = parseTCDUResponse(tcduResponse, apduRequest);
    callback(null, result);
  });
}

// ─── Simulated HSM (Software Token Generation) ──────────────────────────
// Generates properly formatted 20-digit STS tokens using software crypto.
// Replace with real HSM calls when hardware is connected.

function simulatedHSM(apduRequest, securityParams, callback) {
  try {
    var tokenData = Buffer.alloc(9); // 66 bits packed into 9 bytes (72 bits)

    // Pack token fields into buffer
    // Class (2 bits) + SubClass (2 bits) + RND (4 bits) = 1 byte
    tokenData[0] = ((apduRequest.token.Class & 0x03) << 6) |
                   ((apduRequest.token.SubClass & 0x03) << 4) |
                    (apduRequest.token.RND & 0x0F);

    // TID (32 bits) = 4 bytes
    tokenData.writeUInt32BE(apduRequest.token.TID, 1);

    // Amount (16 bits) = 2 bytes
    tokenData.writeUInt16BE(apduRequest.token.Amount & 0xFFFF, 5);

    // CRC (16 bits) = 2 bytes
    var crc = computeCRC16(tokenData.slice(0, 7));
    tokenData.writeUInt16BE(crc, 7);

    // Derive decoder key from SGC + KRN + meter number
    var keyMaterial = securityParams.sgc + ':' +
                      securityParams.keyRevisionNumber + ':' +
                      securityParams.meterNumber + ':' +
                      hsmConfig.masterKeyId;
    var decoderKey = crypto.createHash('sha256').update(keyMaterial).digest();

    // Encrypt token data using AES-128
    var iv = crypto.createHash('md5').update(
      securityParams.meterNumber + ':' + apduRequest.token.TID
    ).digest();
    var cipher = crypto.createCipheriv('aes-128-cbc', decoderKey.slice(0, 16), iv);
    cipher.setAutoPadding(true);
    var encrypted = Buffer.concat([cipher.update(tokenData), cipher.final()]);

    // Convert to 20-digit numeric token (STS format)
    var token20 = encrypted64ToDecimal20(encrypted);

    var tcduResponse = {
      encryptedToken: encrypted.toString('hex'),
      token20Digit: token20,
      TCT: apduRequest.TCT,
      IDRecord: padRight(securityParams.meterNumber, 35),
      PRNRecord: formatPRNRecord(token20, securityParams),
      tokenIdentifier: apduRequest.token.TID,
      crc: crc,
      simulated: true
    };

    callback(null, tcduResponse);
  } catch (err) {
    callback(new Error('HSM simulation error: ' + err.message));
  }
}

// ─── Convert 66-bit encrypted token to 20-digit decimal ─────────────────

function encrypted64ToDecimal20(encryptedBuffer) {
  // Take first 8 bytes (64 bits) of encrypted output
  var high = encryptedBuffer.readUInt32BE(0);
  var low = encryptedBuffer.readUInt32BE(4);

  // Convert to BigInt-like representation using string math
  // 20 digits max for STS token
  var bigNum = (high >>> 0) * 4294967296 + (low >>> 0);
  var tokenStr = bigNum.toString();

  // Ensure exactly 20 digits
  while (tokenStr.length < 20) tokenStr = Math.floor(Math.random() * 10) + tokenStr;
  if (tokenStr.length > 20) tokenStr = tokenStr.substring(0, 20);

  // Format as 4-4-4-4-4 groups (stored without dashes)
  return tokenStr;
}

// ─── CRC-16 (CCITT) ────────────────────────────────────────────────────

function computeCRC16(data) {
  var crc = 0xFFFF;
  for (var i = 0; i < data.length; i++) {
    crc ^= data[i] << 8;
    for (var j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc = crc << 1;
      }
      crc &= 0xFFFF;
    }
  }
  return crc;
}

// ─── PRN Record Formatting ─────────────────────────────────────────────

function formatPRNRecord(token20, securityParams) {
  // Format token as printable receipt record: XXXX-XXXX-XXXX-XXXX-XXXX
  var formatted = token20.replace(/(.{4})/g, '$1-').replace(/-$/, '');
  return 'METER: ' + securityParams.meterNumber + ' | TOKEN: ' + formatted;
}

// ─── Parse TCDU Response from real HSM ──────────────────────────────────

function parseTCDUResponse(tcduBuffer, apduRequest) {
  // When connected to real HSM, parse the binary TCDU response here
  // For now this is a placeholder
  return {
    encryptedToken: tcduBuffer.toString('hex'),
    token20Digit: encrypted64ToDecimal20(tcduBuffer),
    TCT: apduRequest.TCT,
    IDRecord: '',
    PRNRecord: ''
  };
}

// ─── Send to Physical HSM ───────────────────────────────────────────────

function sendToHSM(apduRequest, callback) {
  // Placeholder for real HSM TCP/HTTP communication
  // When HSM hardware is available:
  //   - TCP mode: connect to hsmConfig.host:port, send APDU binary, read TCDU
  //   - HTTP mode: POST to hsmConfig.host/api/generate-token with APDU JSON
  callback(new Error('Physical HSM not configured. Set hsmConfig.mode and connection details.'));
}

// ─── Utility Functions ──────────────────────────────────────────────────

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

// ─── Format 20-digit token with dashes for display ──────────────────────

function formatTokenForDisplay(token20) {
  var clean = token20.replace(/\D/g, '');
  return clean.replace(/(.{4})/g, '$1-').replace(/-$/, '');
}

// ─── Exports ────────────────────────────────────────────────────────────

module.exports = {
  generateSTSToken: generateSTSToken,
  buildAPDURequest: buildAPDURequest,
  getTokenIdentifier: getTokenIdentifier,
  formatTokenForDisplay: formatTokenForDisplay,
  hsmConfig: hsmConfig,
  TOKEN_CLASS: TOKEN_CLASS,
  TOKEN_SUBCLASS: TOKEN_SUBCLASS
};
