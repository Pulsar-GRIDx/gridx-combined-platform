/*
 * BLE maintenance-access certificate issuance.
 *
 * Issues the short-lived certificate that lets a GRIDx Maintenance App prove to
 * a meter, over BLE, that it is authorised. This replaces the old model where
 * the meter was protected by a static BLE passkey (default 111111) and an
 * AES key compiled identically into both the firmware and the APK.
 *
 * WHAT THIS SIGNS, AND WHY IT IS NOT A PASSWORD
 *   The app generates an RSA-2048 key pair inside the Android Keystore. The
 *   private key is non-exportable and, on supporting hardware, lives in the
 *   TEE/StrongBox - it cannot be pulled out of the APK or off a rooted device
 *   in usable form. The app sends only its PUBLIC key here. We bind that public
 *   key to a technician identity and a validity window, and sign the binding.
 *
 *   The certificate is therefore a bearer credential and, on its own, would be
 *   replayable by anyone who captured it. It is not sufficient on its own by
 *   design: the meter additionally requires a signature over a fresh random
 *   challenge, which only the Keystore private key can produce. Certificate
 *   proves "GRIDx authorised this key"; challenge proves "I hold that key now".
 *
 * KEY HANDLING
 *   GRIDX_BLE_SIGNING_KEY (PEM, RSA-2048 private) must be supplied via the
 *   environment - never committed, never shipped to a device. Only the matching
 *   PUBLIC key is compiled into meter firmware (see ble_auth.cpp), so a stolen
 *   meter or a decompiled APK yields nothing that can authenticate.
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const authenticateTokenAndGetAdmin_ID = require('../middleware/authenticateTokenAndGet Admin_ID');

// Must match BLE_AUTH_PROTOCOL_VERSION in the firmware's ble_auth.h.
const CERT_VERSION = 1;

// Deliberately short. A technician re-authenticates to the portal at least
// daily; a leaked certificate is useless once it expires, and the window is the
// only thing bounding damage if a device is lost while unlocked.
const CERT_LIFETIME_SECONDS = 12 * 60 * 60;

// Guard rails on the client-supplied key. An RSA-2048 SubjectPublicKeyInfo DER
// is ~294 bytes; anything far outside that is either not what we asked for or an
// attempt to push the meter's 1024-byte reassembly buffer.
const MIN_SPKI_LEN = 256;
const MAX_SPKI_LEN = 512;

function getSigningKey() {
  const pem = process.env.GRIDX_BLE_SIGNING_KEY;
  if (!pem) {
    throw new Error(
      'GRIDX_BLE_SIGNING_KEY is not set - refusing to issue BLE certificates'
    );
  }
  return pem.replace(/\\n/g, '\n');
}

/*
 * Build the certificate body exactly as the firmware parses it in
 * process_response() (ble_auth.cpp). Any change here is a wire-format change
 * and must be made on both sides together.
 *
 *   u8  version
 *   u32 not_before   (unix seconds, big-endian)
 *   u32 not_after    (unix seconds, big-endian)
 *   u8  tech_id_len, tech_id bytes
 *   u16 pubkey_der_len, pubkey DER (SubjectPublicKeyInfo)
 */
function buildCert(techId, notBefore, notAfter, spkiDer) {
  const techBuf = Buffer.from(techId, 'utf8').slice(0, 32);

  const head = Buffer.alloc(1 + 4 + 4 + 1);
  let o = 0;
  head.writeUInt8(CERT_VERSION, o); o += 1;
  head.writeUInt32BE(notBefore, o); o += 4;
  head.writeUInt32BE(notAfter, o); o += 4;
  head.writeUInt8(techBuf.length, o); o += 1;

  const pkLen = Buffer.alloc(2);
  pkLen.writeUInt16BE(spkiDer.length, 0);

  return Buffer.concat([head, techBuf, pkLen, spkiDer]);
}

/*
 * POST /cb/ble/certificate
 *   Authorization: Bearer <token from /cb/signin>
 *   { "publicKey": "<base64 DER SubjectPublicKeyInfo>" }
 *
 * The caller must already be an authenticated GRIDx user - that existing login
 * is what decides WHO is allowed a maintenance certificate. This endpoint only
 * binds an app instance's key to that identity.
 */
router.post('/certificate', authenticateTokenAndGetAdmin_ID, (req, res) => {
  try {
    const { publicKey } = req.body || {};
    if (!publicKey || typeof publicKey !== 'string') {
      return res.status(400).json({ error: 'publicKey (base64 DER SPKI) is required' });
    }

    let spkiDer;
    try {
      spkiDer = Buffer.from(publicKey, 'base64');
    } catch (e) {
      return res.status(400).json({ error: 'publicKey is not valid base64' });
    }

    if (spkiDer.length < MIN_SPKI_LEN || spkiDer.length > MAX_SPKI_LEN) {
      return res.status(400).json({ error: 'publicKey is not an RSA-2048 SPKI' });
    }

    // Parse it before signing. Signing an unvalidated blob would let a caller
    // have us certify arbitrary bytes, and the meter would then try to parse
    // them as a key.
    let parsed;
    try {
      parsed = crypto.createPublicKey({ key: spkiDer, format: 'der', type: 'spki' });
    } catch (e) {
      return res.status(400).json({ error: 'publicKey could not be parsed' });
    }
    if (parsed.asymmetricKeyType !== 'rsa') {
      return res.status(400).json({ error: 'publicKey must be RSA' });
    }

    // Identity comes from the verified JWT, never from the request body - the
    // client must not get to choose whose name is on the certificate.
    const techId = String(
      req.Admin_ID || req.admin_id || req.userId || req.user_id || 'unknown'
    );

    const now = Math.floor(Date.now() / 1000);
    const notBefore = now - 300;                       // small clock-skew allowance
    const notAfter = now + CERT_LIFETIME_SECONDS;

    const cert = buildCert(techId, notBefore, notAfter, spkiDer);

    const signature = crypto.sign('sha256', cert, {
      key: getSigningKey(),
      padding: crypto.constants.RSA_PKCS1_PADDING,
    });

    return res.json({
      certificate: cert.toString('base64'),
      signature: signature.toString('base64'),
      techId,
      notBefore,
      notAfter,
      version: CERT_VERSION,
    });
  } catch (err) {
    console.error('[ble-auth] certificate issuance failed:', err.message);
    return res.status(500).json({ error: 'certificate issuance failed' });
  }
});

module.exports = router;
