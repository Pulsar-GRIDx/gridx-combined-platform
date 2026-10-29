var express = require('express');
var router = express.Router();
var customerController = require('../customer/customerControllers');
var customerMeters = require('../services/customerMeterService');
var tokens = require('../middleware/tokens');
var auth = require('../admin/authMiddllware');

// ═══════════════════════════════════════════════════════════════════════════
// SIGNED-IN CUSTOMER ROUTES — mounted at /customer, after the public
// customerAuthRoutes. authenticateToken applies the customer policy
// (middleware/meterOwnership.js): these paths are on its allow-list, and
// :drn must be one of the caller's own meters.
// ═══════════════════════════════════════════════════════════════════════════

function requireCustomer(req, res, next) {
  if (tokens.kind(req.user) !== 'customer') {
    return res.status(403).json({ error: 'This endpoint requires a customer account', code: 'WRONG_TOKEN_KIND' });
  }
  next();
}

var customer = [auth.authenticateToken, requireCustomer];

router.get('/me', customer, customerController.me);
router.get('/meters', customer, customerController.listMeters);
router.post('/meters/link/request', customer, customerController.linkRequest);
router.get('/meters/link/status/:token', customer, customerController.linkStatus);
router.post('/meters/link/complete', customer, customerController.linkComplete);
router.patch('/meters/:drn', customer, customerController.renameMeter);
router.delete('/meters/:drn', customer, customerController.unlinkMeter);
router.get('/meters/:drn/members', customer, customerController.meterMembers);
router.delete('/meters/:drn/members/:userId', customer, customerController.removeMember);
router.post('/logout', customer, customerController.logout);

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN — manage customer <-> meter associations (support desk, ownership
// decisions, accounts set up on a customer's behalf).
// ═══════════════════════════════════════════════════════════════════════════
var admin = express.Router();
admin.use(auth.authenticateToken, auth.requireAdmin);

function lookupUser(body) {
  var db = require('../config/db');
  var byId = body.UserID !== undefined && body.UserID !== null && body.UserID !== '';
  return new Promise(function(resolve, reject) {
    db.query(byId ? 'SELECT UserID, Email FROM SystemUsers WHERE UserID = ?' : 'SELECT UserID, Email FROM SystemUsers WHERE Email = ?',
      [byId ? body.UserID : body.Email], function(err, rows) { if (err) reject(err); else resolve(rows[0] || null); });
  });
}

admin.get('/meters/:drn/customers', async function(req, res) {
  try {
    res.json({ drn: req.params.drn, customers: await customerMeters.membersOfMeter(req.params.drn) });
  } catch (err) { res.status(500).json({ error: 'Failed to load customers' }); }
});

admin.get('/customers/:userId/meters', async function(req, res) {
  try {
    var meters = await customerMeters.listForUser(req.params.userId);
    res.json({ UserID: Number(req.params.userId), meterCount: meters.length, meters: meters });
  } catch (err) { res.status(500).json({ error: 'Failed to load meters' }); }
});

// Body: { UserID | Email, DRN, role?: 'owner'|'member' }
admin.post('/customer-meters', async function(req, res) {
  try {
    var user = await lookupUser(req.body || {});
    if (!user) return res.status(404).json({ error: 'Customer account not found' });
    var r = await customerMeters.link(user.UserID, String(req.body.DRN || ''), {
      via: 'admin', role: req.body.role === 'owner' ? 'owner' : undefined, actor: 'admin:' + req.user.Admin_ID,
    });
    res.status(r.created ? 201 : 200).json(Object.assign({ UserID: user.UserID, DRN: String(req.body.DRN) }, r));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Failed to link meter', code: err.code });
  }
});

admin.delete('/customer-meters/:userId/:drn', async function(req, res) {
  try {
    await customerMeters.revoke(req.params.userId, req.params.drn, { kind: 'admin' });
    res.json({ revoked: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Failed to revoke', code: err.code });
  }
});

module.exports = { customer: router, admin: admin };
