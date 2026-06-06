/**
 * PrismToken Direct Thrift HSM Service
 *
 * Provides direct Thrift (TLS/TFramedTransport/TBinaryProtocol) communication
 * to the PrismToken / TSM250 hardware security module on port 9443.
 *
 * This bypasses the PrismVend Web Vending API (HTTP/INI) and talks to the
 * underlying PrismToken Thrift API directly for token generation, verification,
 * key changes, and HSM status queries.
 *
 * Protocol stack:
 *   TLS socket -> TFramedTransport -> TBinaryProtocol -> TokenApi client
 *
 * All functions use Node.js callback style: callback(err, result)
 */

var thrift = require('thrift');
var Int64 = require('node-int64');
var TokenApi = require('../thrift/gen-nodejs/TokenApi');
var ttypes = require('../thrift/gen-nodejs/PrismToken1.TokenApi_types');

// ─── Thrift Connection Config ──────────────────────────────────────────────

var thriftConfig = {
  host: null,              // PrismToken/TSM250 host IP
  port: 9443,              // Default Thrift TLS port
  username: null,           // PrismToken username
  password: null,           // PrismToken password
  realm: 'local',           // Auth realm
  accessToken: null,        // Current session token
  tokenExpiry: null,        // When accessToken expires (Date.now() + sessionTimeoutSec * 1000)
  sessionTimeoutSec: 300,   // Default 5 min
  connected: false,
  lastError: null
};

// ─── Internal State ────────────────────────────────────────────────────────

var _connection = null;
var _client = null;
var _messageCounter = 0;

/**
 * Generate a unique message ID for Thrift calls.
 */
function genMessageId() {
  _messageCounter++;
  return 'gridx-' + Date.now() + '-' + _messageCounter;
}

// ─── Connection Management ─────────────────────────────────────────────────

/**
 * Create a TLS socket + TFramedTransport + TBinaryProtocol + TokenApi client.
 *
 * @param {function} callback - callback(err)
 */
function connect(callback) {
  if (!thriftConfig.host) {
    return callback(new Error('Thrift HSM host is not configured. Set thriftConfig.host first.'));
  }

  // Close existing connection if any
  if (_connection) {
    try { _connection.end(); } catch (e) { /* ignore */ }
    _connection = null;
    _client = null;
    thriftConfig.connected = false;
  }

  var port = thriftConfig.port || 9443;

  console.log('[ThriftHSM] Connecting to PrismToken at %s:%d (TLS/TFramedTransport/TBinaryProtocol)...',
    thriftConfig.host, port);

  try {
    _connection = thrift.createConnection(thriftConfig.host, port, {
      transport: thrift.TFramedTransport,
      protocol: thrift.TBinaryProtocol,
      tls: {
        rejectUnauthorized: false  // PrismToken uses self-signed certs
      }
    });

    var callbackFired = false;

    _connection.on('error', function(err) {
      console.error('[ThriftHSM] Connection error:', err.message);
      thriftConfig.connected = false;
      thriftConfig.lastError = err.message;
      if (!callbackFired) {
        callbackFired = true;
        callback(new Error('Thrift connection error: ' + err.message));
      }
    });

    _connection.on('close', function() {
      console.log('[ThriftHSM] Connection closed');
      thriftConfig.connected = false;
      _client = null;
    });

    _connection.on('connect', function() {
      console.log('[ThriftHSM] Connected to PrismToken at %s:%d', thriftConfig.host, port);
      _client = thrift.createClient(TokenApi, _connection);
      thriftConfig.connected = true;
      thriftConfig.lastError = null;
      if (!callbackFired) {
        callbackFired = true;
        callback(null);
      }
    });

    // Timeout for connection establishment
    setTimeout(function() {
      if (!callbackFired) {
        callbackFired = true;
        thriftConfig.connected = false;
        thriftConfig.lastError = 'Connection timeout after 10s';
        try { _connection.end(); } catch (e) { /* ignore */ }
        _connection = null;
        _client = null;
        callback(new Error('Thrift connection timed out after 10 seconds to ' + thriftConfig.host + ':' + port));
      }
    }, 10000);
  } catch (err) {
    thriftConfig.connected = false;
    thriftConfig.lastError = err.message;
    callback(new Error('Failed to create Thrift connection: ' + err.message));
  }
}

/**
 * Close the Thrift connection.
 */
function disconnect() {
  if (_connection) {
    try { _connection.end(); } catch (e) { /* ignore */ }
    _connection = null;
  }
  _client = null;
  thriftConfig.connected = false;
  thriftConfig.accessToken = null;
  thriftConfig.tokenExpiry = null;
  thriftConfig.lastError = null;
  console.log('[ThriftHSM] Disconnected');
}

/**
 * Return the current Thrift client instance.
 *
 * @returns {object|null} TokenApi client or null if not connected
 */
function getClient() {
  return _client;
}

// ─── Authentication ────────────────────────────────────────────────────────

/**
 * Check if the access token is still valid, re-authenticate if expired.
 *
 * @param {function} callback - callback(err)
 */
function ensureAuthenticated(callback) {
  if (!thriftConfig.connected || !_client) {
    return callback(new Error('Not connected to PrismToken. Call connect() first.'));
  }

  // Check if token is still valid
  if (thriftConfig.accessToken && thriftConfig.tokenExpiry) {
    var now = Date.now();
    // Re-auth if within 30 seconds of expiry
    if (now < (thriftConfig.tokenExpiry - 30000)) {
      return callback(null);
    }
  }

  // Need to sign in
  signIn(callback);
}

/**
 * Sign in to PrismToken with username/password to get an accessToken.
 *
 * @param {function} callback - callback(err)
 */
function signIn(callback) {
  if (!thriftConfig.connected || !_client) {
    return callback(new Error('Not connected to PrismToken. Call connect() first.'));
  }

  if (!thriftConfig.username || !thriftConfig.password) {
    return callback(new Error('Thrift HSM credentials not configured. Set username and password.'));
  }

  var msgId = genMessageId();
  var sessionOpts = new ttypes.SessionOptions({ version: '1.1', culture: 'en' });

  console.log('[ThriftHSM] Signing in as "%s" (realm: %s)...', thriftConfig.username, thriftConfig.realm);

  _client.signInWithPassword(
    msgId,
    thriftConfig.realm || 'local',
    thriftConfig.username,
    thriftConfig.password,
    sessionOpts,
    function(err, result) {
      if (err) {
        var errMsg = (err.eMsgEn || err.message || String(err));
        console.error('[ThriftHSM] Sign-in failed: %s', errMsg);
        thriftConfig.lastError = errMsg;
        return callback(new Error('Sign-in failed: ' + errMsg));
      }

      if (result && result.accessToken) {
        thriftConfig.accessToken = result.accessToken;
        thriftConfig.tokenExpiry = Date.now() + (thriftConfig.sessionTimeoutSec * 1000);
        thriftConfig.lastError = null;
        console.log('[ThriftHSM] Signed in successfully. Token expires in %ds', thriftConfig.sessionTimeoutSec);
        callback(null);
      } else {
        var noTokenErr = 'Sign-in response did not contain accessToken';
        thriftConfig.lastError = noTokenErr;
        callback(new Error(noTokenErr));
      }
    }
  );
}

// ─── Core Operations ───────────────────────────────────────────────────────

/**
 * Ping the PrismToken service.
 *
 * @param {function} callback - callback(err, echoResponse)
 */
function ping(callback) {
  if (!thriftConfig.connected || !_client) {
    return callback(new Error('Not connected to PrismToken'));
  }

  var startTime = Date.now();

  _client.ping(0, 'gridx-test', function(err, result) {
    var elapsed = Date.now() - startTime;

    if (err) {
      var errMsg = (err.eMsgEn || err.message || String(err));
      return callback(new Error('Ping failed: ' + errMsg));
    }

    callback(null, {
      echo: result,
      responseTimeMs: elapsed,
      timestamp: new Date().toISOString()
    });
  });
}

/**
 * Get HSM status — returns node info and alerts.
 *
 * @param {function} callback - callback(err, statusInfo)
 */
function getStatus(callback) {
  if (!thriftConfig.connected || !_client) {
    return callback(new Error('Not connected to PrismToken'));
  }

  ensureAuthenticated(function(authErr) {
    if (authErr) return callback(authErr);

    var msgId = genMessageId();

    _client.getStatus(msgId, thriftConfig.accessToken, function(err, result) {
      if (err) {
        var errMsg = (err.eMsgEn || err.message || String(err));
        return callback(new Error('getStatus failed: ' + errMsg));
      }

      // result is a list of NodeStatus structs
      // Each NodeStatus has .info (map<string,string>) and .alerts (list<Alert>)
      var nodes = [];
      if (result && Array.isArray(result)) {
        for (var i = 0; i < result.length; i++) {
          var node = result[i];
          var alerts = [];
          if (node.alerts && Array.isArray(node.alerts)) {
            for (var a = 0; a < node.alerts.length; a++) {
              alerts.push({
                eCode: node.alerts[a].eCode || '',
                eMsgEn: node.alerts[a].eMsgEn || ''
              });
            }
          }
          nodes.push({
            info: node.info || {},
            alerts: alerts
          });
        }
      }

      // Extract useful fields from the first node's info map
      var primaryInfo = (nodes.length > 0 && nodes[0].info) ? nodes[0].info : {};
      var primaryAlerts = (nodes.length > 0) ? nodes[0].alerts : [];

      callback(null, {
        nodes: nodes,
        moduleId: primaryInfo.ModuleId || primaryInfo.moduleId || '',
        firmwareId: primaryInfo.FirmwareId || primaryInfo.firmwareId || '',
        txCounter: primaryInfo.TxCounter || primaryInfo.txCounter || primaryInfo.txCredit || '',
        apiType: primaryInfo.ApiType || primaryInfo.apiType || '',
        serialNumber: primaryInfo.SerialNumber || primaryInfo.serialNumber || '',
        info: primaryInfo,
        alerts: primaryAlerts,
        timestamp: new Date().toISOString()
      });
    });
  });
}

/**
 * Issue a credit token via Thrift.
 *
 * @param {object} meterConfig - MeterConfigIn struct (or params to build one)
 * @param {number} subclass - Token subclass (0 = electricity)
 * @param {number} transferAmount - Transfer amount in STS units (e.g. kWh * 10)
 * @param {function} callback - callback(err, tokenList)
 */
function issueCreditToken(meterConfig, subclass, transferAmount, callback) {
  if (!thriftConfig.connected || !_client) {
    return callback(new Error('Not connected to PrismToken'));
  }

  ensureAuthenticated(function(authErr) {
    if (authErr) return callback(authErr);

    var msgId = genMessageId();
    var config = (meterConfig instanceof ttypes.MeterConfigIn) ? meterConfig : buildMeterConfig(meterConfig);
    var tokenTime = new Int64(0);  // 0 = use HSM internal clock
    var flags = new Int64(0);      // No special flags

    console.log('[ThriftHSM] Issuing credit token for DRN %s, subclass=%d, amount=%s',
      config.drn, subclass, transferAmount);

    var startTime = Date.now();

    _client.issueCreditToken(
      msgId,
      thriftConfig.accessToken,
      config,
      subclass,
      parseFloat(transferAmount),
      tokenTime,
      flags,
      function(err, result) {
        var elapsed = Date.now() - startTime;

        if (err) {
          var errMsg = (err.eMsgEn || err.message || String(err));
          console.error('[ThriftHSM] issueCreditToken failed: %s', errMsg);
          return callback(new Error('issueCreditToken failed: ' + errMsg));
        }

        // result is a list of Token structs
        var tokens = [];
        if (result && Array.isArray(result)) {
          for (var i = 0; i < result.length; i++) {
            tokens.push(serializeToken(result[i]));
          }
        }

        console.log('[ThriftHSM] Credit token issued for DRN %s: %d token(s) in %dms',
          config.drn, tokens.length, elapsed);

        callback(null, {
          tokens: tokens,
          numTokens: tokens.length,
          durationMs: elapsed,
          messageId: msgId,
          timestamp: new Date().toISOString()
        });
      }
    );
  });
}

/**
 * Issue an engineering (MSE) token via Thrift.
 *
 * @param {object} meterConfig - MeterConfigIn struct or params
 * @param {number} subclass - Engineering subclass (0=SetMaxPowerLimit, 1=ClearCredit, 5=ClearTamper, etc.)
 * @param {number} transferAmount - Transfer amount (supplementary value)
 * @param {function} callback - callback(err, tokenList)
 */
function issueMseToken(meterConfig, subclass, transferAmount, callback) {
  if (!thriftConfig.connected || !_client) {
    return callback(new Error('Not connected to PrismToken'));
  }

  ensureAuthenticated(function(authErr) {
    if (authErr) return callback(authErr);

    var msgId = genMessageId();
    var config = (meterConfig instanceof ttypes.MeterConfigIn) ? meterConfig : buildMeterConfig(meterConfig);
    var tokenTime = new Int64(0);
    var flags = new Int64(0);

    console.log('[ThriftHSM] Issuing MSE token for DRN %s, subclass=%d, amount=%s',
      config.drn, subclass, transferAmount);

    var startTime = Date.now();

    _client.issueMseToken(
      msgId,
      thriftConfig.accessToken,
      config,
      subclass,
      parseFloat(transferAmount || 0),
      tokenTime,
      flags,
      function(err, result) {
        var elapsed = Date.now() - startTime;

        if (err) {
          var errMsg = (err.eMsgEn || err.message || String(err));
          console.error('[ThriftHSM] issueMseToken failed: %s', errMsg);
          return callback(new Error('issueMseToken failed: ' + errMsg));
        }

        var tokens = [];
        if (result && Array.isArray(result)) {
          for (var i = 0; i < result.length; i++) {
            tokens.push(serializeToken(result[i]));
          }
        }

        console.log('[ThriftHSM] MSE token issued for DRN %s: %d token(s) in %dms',
          config.drn, tokens.length, elapsed);

        callback(null, {
          tokens: tokens,
          numTokens: tokens.length,
          durationMs: elapsed,
          messageId: msgId,
          timestamp: new Date().toISOString()
        });
      }
    );
  });
}

/**
 * Issue key change tokens via Thrift.
 *
 * @param {object} meterConfig - Current MeterConfigIn struct or params
 * @param {object} newConfig - MeterConfigAmendment { toSgc, toKrn, toTi }
 * @param {function} callback - callback(err, tokenList)
 */
function issueKeyChangeTokens(meterConfig, newConfig, callback) {
  if (!thriftConfig.connected || !_client) {
    return callback(new Error('Not connected to PrismToken'));
  }

  ensureAuthenticated(function(authErr) {
    if (authErr) return callback(authErr);

    var msgId = genMessageId();
    var config = (meterConfig instanceof ttypes.MeterConfigIn) ? meterConfig : buildMeterConfig(meterConfig);
    var amendment = new ttypes.MeterConfigAmendment({
      toSgc: parseInt(newConfig.toSgc),
      toKrn: parseInt(newConfig.toKrn),
      toTi: parseInt(newConfig.toTi)
    });

    console.log('[ThriftHSM] Issuing key change tokens for DRN %s: SGC->%d, KRN->%d, TI->%d',
      config.drn, amendment.toSgc, amendment.toKrn, amendment.toTi);

    var startTime = Date.now();

    _client.issueKeyChangeTokens(
      msgId,
      thriftConfig.accessToken,
      config,
      amendment,
      function(err, result) {
        var elapsed = Date.now() - startTime;

        if (err) {
          var errMsg = (err.eMsgEn || err.message || String(err));
          console.error('[ThriftHSM] issueKeyChangeTokens failed: %s', errMsg);
          return callback(new Error('issueKeyChangeTokens failed: ' + errMsg));
        }

        var tokens = [];
        if (result && Array.isArray(result)) {
          for (var i = 0; i < result.length; i++) {
            tokens.push(serializeToken(result[i]));
          }
        }

        console.log('[ThriftHSM] Key change tokens issued for DRN %s: %d token(s) in %dms',
          config.drn, tokens.length, elapsed);

        callback(null, {
          tokens: tokens,
          numTokens: tokens.length,
          newConfig: { toSgc: amendment.toSgc, toKrn: amendment.toKrn, toTi: amendment.toTi },
          durationMs: elapsed,
          messageId: msgId,
          timestamp: new Date().toISOString()
        });
      }
    );
  });
}

/**
 * Verify a token via Thrift.
 *
 * @param {object} meterConfig - MeterConfigIn struct or params
 * @param {string} tokenDec - 20-digit token to verify
 * @param {function} callback - callback(err, tokenResult)
 */
function verifyToken(meterConfig, tokenDec, callback) {
  if (!thriftConfig.connected || !_client) {
    return callback(new Error('Not connected to PrismToken'));
  }

  ensureAuthenticated(function(authErr) {
    if (authErr) return callback(authErr);

    var msgId = genMessageId();
    var config = (meterConfig instanceof ttypes.MeterConfigIn) ? meterConfig : buildMeterConfig(meterConfig);
    var cleanToken = String(tokenDec).replace(/[^0-9]/g, '');

    if (cleanToken.length !== 20) {
      return callback(new Error('Token must be exactly 20 digits'));
    }

    console.log('[ThriftHSM] Verifying token for DRN %s: %s...', config.drn, cleanToken.substring(0, 8));

    var startTime = Date.now();

    _client.verifyToken(
      msgId,
      thriftConfig.accessToken,
      config,
      cleanToken,
      function(err, result) {
        var elapsed = Date.now() - startTime;

        if (err) {
          var errMsg = (err.eMsgEn || err.message || String(err));
          console.error('[ThriftHSM] verifyToken failed: %s', errMsg);
          return callback(new Error('verifyToken failed: ' + errMsg));
        }

        // result is a Token struct
        var tokenResult = result ? serializeToken(result) : null;

        console.log('[ThriftHSM] Token verified for DRN %s in %dms', config.drn, elapsed);

        callback(null, {
          token: tokenResult,
          verified: !!tokenResult,
          durationMs: elapsed,
          messageId: msgId,
          timestamp: new Date().toISOString()
        });
      }
    );
  });
}

/**
 * Parse an ID record via Thrift.
 *
 * @param {string} idRecord - The ID record string to parse
 * @param {function} callback - callback(err, meterConfig)
 */
function parseIdRecord(idRecord, callback) {
  if (!thriftConfig.connected || !_client) {
    return callback(new Error('Not connected to PrismToken'));
  }

  ensureAuthenticated(function(authErr) {
    if (authErr) return callback(authErr);

    var msgId = genMessageId();

    console.log('[ThriftHSM] Parsing ID record: %s', idRecord);

    _client.parseIdRecord(
      msgId,
      thriftConfig.accessToken,
      idRecord,
      function(err, result) {
        if (err) {
          var errMsg = (err.eMsgEn || err.message || String(err));
          console.error('[ThriftHSM] parseIdRecord failed: %s', errMsg);
          return callback(new Error('parseIdRecord failed: ' + errMsg));
        }

        // result is a MeterConfigIn struct
        var config = null;
        if (result) {
          config = {
            drn: result.drn || '',
            ea: result.ea,
            tct: result.tct,
            sgc: result.sgc,
            krn: result.krn,
            ti: result.ti,
            ken: result.ken,
            doe: result.doe || '',
            allowKrnUpdate: result.allowKrnUpdate,
            allow3Kct: result.allow3Kct,
            allowKenUpdate: result.allowKenUpdate
          };
          if (result.newConfig) {
            config.newConfig = {
              toSgc: result.newConfig.toSgc,
              toKrn: result.newConfig.toKrn,
              toTi: result.newConfig.toTi
            };
          }
        }

        callback(null, {
          meterConfig: config,
          timestamp: new Date().toISOString()
        });
      }
    );
  });
}

// ─── Helper: Build MeterConfigIn from GRIDx params ─────────────────────────

/**
 * Build a MeterConfigIn Thrift struct from GRIDx meter parameters.
 *
 * @param {object} params - Meter parameters
 *   - drn/meterPAN: Decoder reference number
 *   - ea: Encryption algorithm (default 7)
 *   - tct: Token carrier type (default 2)
 *   - sgc: Supply group code (default 999907)
 *   - krn: Key revision number (default 2)
 *   - ti: Tariff index (default 1)
 *   - ken: Key expiry number (default 255)
 * @returns {MeterConfigIn} Thrift MeterConfigIn struct
 */
function buildMeterConfig(params) {
  var config = new ttypes.MeterConfigIn({
    drn: String(params.drn || params.meterPAN || '').replace(/[^0-9]/g, ''),
    ea: parseInt(params.ea) || 7,
    tct: parseInt(params.tct) || 2,
    sgc: parseInt(params.sgc) || 999907,
    krn: parseInt(params.krn) || 2,
    ti: parseInt(params.ti) || 1,
    ken: parseInt(params.ken) || 255
  });
  return config;
}

// ─── Helper: Serialize Token struct to plain object ─────────────────────────

/**
 * Convert a Thrift Token struct to a plain JS object for JSON serialization.
 *
 * @param {Token} token - Thrift Token struct
 * @returns {object} Plain object
 */
function serializeToken(token) {
  if (!token) return null;

  var result = {
    drn: token.drn || '',
    pan: token.pan || '',
    ea: token.ea,
    tct: token.tct,
    sgc: token.sgc,
    krn: token.krn,
    ti: token.ti,
    tokenClass: token.tokenClass,
    subclass: token.subclass,
    tid: token.tid,
    transferAmount: token.transferAmount,
    isReservedTid: token.isReservedTid,
    description: token.description || '',
    stsUnitName: token.stsUnitName || '',
    scaledAmount: token.scaledAmount,
    scaledUnitName: token.scaledUnitName || '',
    tokenDec: token.tokenDec || '',
    tokenHex: token.tokenHex || '',
    idSm: token.idSm || '',
    vkKcv: token.vkKcv || ''
  };

  if (token.newConfig) {
    result.newConfig = {
      toSgc: token.newConfig.toSgc,
      toKrn: token.newConfig.toKrn,
      toTi: token.newConfig.toTi,
      toKen: token.newConfig.toKen,
      idRecord: token.newConfig.idRecord || '',
      record2: token.newConfig.record2 || '',
      rollover: token.newConfig.rollover,
      toVkKcv: token.newConfig.toVkKcv || ''
    };
  }

  return result;
}

// ─── Connection Health Check ───────────────────────────────────────────────

/**
 * Check the Thrift connection health by pinging and optionally fetching status.
 * Returns a status object similar to hsmService.checkConnection.
 *
 * @param {function} callback - callback(err, statusObject)
 */
function checkConnection(callback) {
  if (!thriftConfig.host) {
    return callback(null, {
      connected: false,
      hsmOnline: false,
      txCreditsRemaining: null,
      status: 'not_configured',
      message: 'Thrift HSM host is not configured. Set the host IP and credentials on the Direct HSM tab.',
      checkedAt: new Date().toISOString()
    });
  }

  if (!thriftConfig.connected || !_client) {
    return callback(null, {
      connected: false,
      hsmOnline: false,
      txCreditsRemaining: null,
      status: 'disconnected',
      message: 'Not connected to PrismToken at ' + thriftConfig.host + ':' + (thriftConfig.port || 9443) + '. Click Connect to establish a Thrift connection.',
      checkedAt: new Date().toISOString()
    });
  }

  // Try a ping to verify liveness
  ping(function(err, pingResult) {
    if (err) {
      return callback(null, {
        connected: false,
        hsmOnline: false,
        txCreditsRemaining: null,
        status: 'ping_failed',
        message: 'Thrift connection exists but ping failed: ' + err.message,
        checkedAt: new Date().toISOString()
      });
    }

    // If we have auth, try getStatus for full info
    if (thriftConfig.accessToken) {
      getStatus(function(statusErr, statusResult) {
        if (statusErr) {
          // Ping worked but status failed — still partially online
          return callback(null, {
            connected: true,
            hsmOnline: true,
            txCreditsRemaining: null,
            status: 'connected',
            message: 'Connected to PrismToken (ping OK in ' + pingResult.responseTimeMs + 'ms). Status query failed: ' + statusErr.message,
            pingMs: pingResult.responseTimeMs,
            checkedAt: new Date().toISOString()
          });
        }

        var txCounter = statusResult.txCounter ? parseInt(statusResult.txCounter) : null;

        return callback(null, {
          connected: true,
          hsmOnline: true,
          txCreditsRemaining: txCounter,
          status: 'connected',
          message: 'Connected to PrismToken. Module: ' + (statusResult.moduleId || 'unknown') +
            ', Firmware: ' + (statusResult.firmwareId || 'unknown') +
            (txCounter !== null ? ', TX credits: ' + txCounter : ''),
          moduleId: statusResult.moduleId,
          firmwareId: statusResult.firmwareId,
          apiType: statusResult.apiType,
          pingMs: pingResult.responseTimeMs,
          alerts: statusResult.alerts,
          checkedAt: new Date().toISOString()
        });
      });
    } else {
      // Not authenticated yet — ping is enough
      callback(null, {
        connected: true,
        hsmOnline: true,
        txCreditsRemaining: null,
        status: 'connected_no_auth',
        message: 'Connected to PrismToken (ping OK in ' + pingResult.responseTimeMs + 'ms). Not signed in — click Sign In to authenticate.',
        pingMs: pingResult.responseTimeMs,
        checkedAt: new Date().toISOString()
      });
    }
  });
}

// ─── Exports ───────────────────────────────────────────────────────────────

module.exports = {
  thriftConfig: thriftConfig,
  connect: connect,
  disconnect: disconnect,
  getClient: getClient,
  ensureAuthenticated: ensureAuthenticated,
  ping: ping,
  signIn: signIn,
  getStatus: getStatus,
  issueCreditToken: issueCreditToken,
  issueMseToken: issueMseToken,
  issueKeyChangeTokens: issueKeyChangeTokens,
  verifyToken: verifyToken,
  parseIdRecord: parseIdRecord,
  checkConnection: checkConnection,
  buildMeterConfig: buildMeterConfig
};
