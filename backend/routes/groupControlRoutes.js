/**
 * Group Control Routes — Ripple Control / Load Management
 * Manages groups of meters for bulk load shedding operations
 */
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken } = require('../admin/authMiddllware');
const mqttHandler = require('../services/mqttHandler');

// Helper: run a query and return all rows
function queryAll(sql, params) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

// Helper: run a query and return first row
function queryOne(sql, params) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows && rows.length > 0 ? rows[0] : null);
    });
  });
}

// Helper: run insert/update/delete
function execute(sql, params) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

// ─── INIT TABLES (auto-create if not exist) ──────────────────
async function ensureTables() {
  await execute(`
    CREATE TABLE IF NOT EXISTS LoadControlGroups (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      control_type ENUM('mains', 'geyser', 'both') DEFAULT 'geyser',
      is_active TINYINT(1) DEFAULT 1,
      created_by VARCHAR(100) DEFAULT 'Admin',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS LoadControlGroupMembers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      group_id INT NOT NULL,
      meter_drn VARCHAR(50) NOT NULL,
      added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_group_meter (group_id, meter_drn),
      FOREIGN KEY (group_id) REFERENCES LoadControlGroups(id) ON DELETE CASCADE
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS LoadControlActions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      group_id INT,
      action_type ENUM('mains_off', 'mains_on', 'geyser_off', 'geyser_on', 'calibrate_auto', 'calibrate_verify', 'calibrate_exercise') NOT NULL,
      meter_count INT DEFAULT 0,
      executed_by VARCHAR(100) DEFAULT 'Admin',
      reason TEXT,
      status ENUM('pending', 'in_progress', 'completed', 'failed') DEFAULT 'pending',
      meters_affected TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP NULL,
      FOREIGN KEY (group_id) REFERENCES LoadControlGroups(id) ON DELETE SET NULL
    )
  `);
}

// Initialize tables on module load
ensureTables().catch(err => console.warn('Group control tables init:', err.message));

// ─── IN-MEMORY CACHE FOR HEAVY QUERIES ─────────────────────
var _metersStateCache = { data: null, ts: 0 };
var _topologyCache = { data: null, ts: 0 };
var METERS_STATE_CACHE_TTL = 30000; // 30 seconds
var TOPOLOGY_CACHE_TTL = 60000; // 60 seconds

function getCachedMetersState(callback) {
  if (_metersStateCache.data && Date.now() - _metersStateCache.ts < METERS_STATE_CACHE_TTL) {
    return callback(null, _metersStateCache.data);
  }
  queryAll(`
    SELECT
      ml.DRN, ml.Lat, ml.Longitude, ml.LocationName, ml.Status,
      CONCAT(mpr.Name, ' ', mpr.Surname) as customerName,
      mpr.City, mpr.Region, mpr.TransformerDRN,
      mpr.tariff_type,
      COALESCE(ms.state, '0') as mains_state,
      COALESCE(hs.state, '0') as geyser_state,
      ROUND(COALESCE(CAST(eu.units AS DECIMAL(14,2)), 0), 1) as CumulativeUnits
    FROM MeterLocationInfoTable ml
    LEFT JOIN MeterProfileReal mpr ON ml.DRN = mpr.DRN
    LEFT JOIN (
      SELECT DRN, state,
             ROW_NUMBER() OVER (PARTITION BY DRN ORDER BY date_time DESC) as rn
      FROM MeterMainsStateTable
    ) ms ON ml.DRN = ms.DRN AND ms.rn = 1
    LEFT JOIN (
      SELECT DRN, state,
             ROW_NUMBER() OVER (PARTITION BY DRN ORDER BY date_time DESC) as rn
      FROM MeterHeaterStateTable
    ) hs ON ml.DRN = hs.DRN AND hs.rn = 1
    LEFT JOIN (
      SELECT DRN, units,
             ROW_NUMBER() OVER (PARTITION BY DRN ORDER BY date_time DESC) as rn
      FROM MeterCumulativeEnergyUsage
    ) eu ON ml.DRN = eu.DRN AND eu.rn = 1
    ORDER BY ml.LocationName, ml.DRN
  `).then(function(rows) {
    _metersStateCache.data = rows;
    _metersStateCache.ts = Date.now();
    callback(null, rows);
  }).catch(function(err) {
    callback(err, null);
  });
}

function getCachedTopology(callback) {
  if (_topologyCache.data && Date.now() - _topologyCache.ts < TOPOLOGY_CACHE_TTL) {
    return callback(null, _topologyCache.data);
  }
  // Build topology data (same logic as the route handler)
  var topoResult = {};
  queryAll('SELECT * FROM GridHierarchy ORDER BY node_type, node_name').then(function(nodes) {
    topoResult.nodes = nodes || [];
    return queryAll(`
      SELECT ml.DRN, ml.LocationName, ml.Lat, ml.Longitude, ml.Status, ml.Suburb,
             CONCAT(mpr.Name, ' ', mpr.Surname) as customerName,
             mpr.City, mpr.Region, mpr.tariff_type,
             mpr.TransformerDRN
      FROM MeterLocationInfoTable ml
      LEFT JOIN MeterProfileReal mpr ON ml.DRN = mpr.DRN
      WHERE ml.DRN != 'TEST'
    `);
  }).then(function(meters) {
    topoResult.meters = meters || [];
    return queryAll('SELECT * FROM SubstationConfig').catch(function() { return []; });
  }).then(function(substations) {
    topoResult.substations = substations || [];
    // Get tamper count
    return queryOne("SELECT COUNT(DISTINCT DRN) as cnt FROM MeterTamperAlerts WHERE resolved = 0")
      .catch(function() {
        return queryOne("SELECT COUNT(DISTINCT DRN) as cnt FROM MeterAlerts WHERE alert_type = 'tamper' AND status = 'active'")
          .catch(function() { return { cnt: 0 }; });
      });
  }).then(function(tamperResult) {
    var tamperCount = tamperResult ? tamperResult.cnt : 0;
    var nodes = topoResult.nodes;
    var meters = topoResult.meters;
    var substations = topoResult.substations;

    var distNodes = nodes.filter(function(n) { return n.node_type === 'distribution'; });
    var transformerNodes = nodes.filter(function(n) { return n.node_type === 'transformer'; });
    var substationNodes = nodes.filter(function(n) { return n.node_type === 'substation'; });
    var warningNodes = nodes.filter(function(n) { return n.status === 'warning'; });
    var criticalNodes = nodes.filter(function(n) { return n.status === 'critical'; });

    var topology = {
      nodes: nodes,
      meters: meters,
      substations: substations,
      stats: {
        totalMeters: meters.length,
        onlineMeters: meters.filter(function(m) { return m.Status == '1' || m.Status == 1; }).length,
        offlineMeters: meters.filter(function(m) { return m.Status != '1' && m.Status != 1; }).length,
        totalSubstations: substationNodes.length + substations.length,
        totalDistribution: distNodes.length,
        totalTransformers: transformerNodes.length,
        tamperCount: tamperCount,
        warningAlerts: warningNodes.length,
        criticalAlerts: criticalNodes.length,
      }
    };

    _topologyCache.data = topology;
    _topologyCache.ts = Date.now();
    callback(null, topology);
  }).catch(function(err) {
    callback(err, null);
  });
}

// Pre-warm caches on startup
setTimeout(function() {
  getCachedMetersState(function(err) {
    if (err) console.warn('[GroupControl] Pre-warm meters-state cache failed:', err.message);
    else console.log('[GroupControl] Pre-warmed meters-state cache');
  });
  getCachedTopology(function(err) {
    if (err) console.warn('[GroupControl] Pre-warm topology cache failed:', err.message);
    else console.log('[GroupControl] Pre-warmed topology cache');
  });
}, 3000);

// Extend ENUM to include calibration action types (safe to run multiple times)
execute(`ALTER TABLE LoadControlActions MODIFY COLUMN action_type
  ENUM('mains_off', 'mains_on', 'geyser_off', 'geyser_on', 'calibrate_auto', 'calibrate_verify', 'calibrate_exercise') NOT NULL`)
  .catch(() => { /* ignore if already correct */ });

// Add schedule, calibration, power_limit columns if they don't exist
['schedule TEXT', 'calibration TEXT', 'power_limit INT DEFAULT 0'].forEach(function(col) {
  var colName = col.split(' ')[0];
  execute("SELECT " + colName + " FROM LoadControlGroups LIMIT 1")
    .catch(function() {
      execute("ALTER TABLE LoadControlGroups ADD COLUMN " + col)
        .then(function() { console.log('[GroupControl] Added column: ' + colName); })
        .catch(function() { /* already exists */ });
    });
});

// ─── GET ALL GROUPS ─────────────────────────────────────────
router.get('/loadcontrol/groups', authenticateToken, async (req, res) => {
  try {
    const groups = await queryAll(`
      SELECT g.*, COUNT(gm.id) as member_count
      FROM LoadControlGroups g
      LEFT JOIN LoadControlGroupMembers gm ON g.id = gm.group_id
      GROUP BY g.id
      ORDER BY g.created_at DESC
    `);
    // Parse JSON fields for each group
    groups.forEach(function(g) {
      try { g.schedule = g.schedule ? JSON.parse(g.schedule) : null; } catch(e) { g.schedule = null; }
      try { g.calibration = g.calibration ? JSON.parse(g.calibration) : null; } catch(e) { g.calibration = null; }
    });
    res.json({ success: true, data: groups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET GROUP BY ID (with members) ─────────────────────────
router.get('/loadcontrol/groups/:id', authenticateToken, async (req, res) => {
  try {
    const group = await queryOne(
      `SELECT * FROM LoadControlGroups WHERE id = ?`,
      [req.params.id]
    );
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const members = await queryAll(`
      SELECT gm.meter_drn as DRN, gm.added_at,
             ml.Lat, ml.Longitude, ml.LocationName, ml.Status,
             CONCAT(mpr.Name, ' ', mpr.Surname) as customerName,
             mpr.City, mpr.Region
      FROM LoadControlGroupMembers gm
      LEFT JOIN MeterLocationInfoTable ml ON gm.meter_drn = ml.DRN
      LEFT JOIN MeterProfileReal mpr ON gm.meter_drn = mpr.DRN
      WHERE gm.group_id = ?
    `, [req.params.id]);

    // Parse JSON fields
    try { group.schedule = group.schedule ? JSON.parse(group.schedule) : null; } catch(e) { group.schedule = null; }
    try { group.calibration = group.calibration ? JSON.parse(group.calibration) : null; } catch(e) { group.calibration = null; }
    res.json({ success: true, data: { ...group, members } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CREATE GROUP ───────────────────────────────────────────
router.post('/loadcontrol/groups', authenticateToken, async (req, res) => {
  try {
    const { name, description, control_type, created_by } = req.body;
    if (!name) return res.status(400).json({ error: 'Group name is required' });

    const result = await execute(
      `INSERT INTO LoadControlGroups (name, description, control_type, created_by)
       VALUES (?, ?, ?, ?)`,
      [name, description || '', control_type || 'geyser', created_by || 'Admin']
    );
    res.json({ success: true, id: result.insertId, message: 'Group created' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── UPDATE GROUP ───────────────────────────────────────────
router.put('/loadcontrol/groups/:id', authenticateToken, async (req, res) => {
  try {
    var updates = [];
    var params = [];
    var fields = ['name', 'description', 'control_type', 'is_active', 'schedule', 'calibration', 'power_limit'];
    fields.forEach(function(f) {
      if (req.body[f] !== undefined) {
        var val = req.body[f];
        if (typeof val === 'object') val = JSON.stringify(val);
        updates.push(f + ' = ?');
        params.push(val);
      }
    });
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    params.push(req.params.id);
    await execute(
      'UPDATE LoadControlGroups SET ' + updates.join(', ') + ' WHERE id = ?',
      params
    );
    res.json({ success: true, message: 'Group updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE GROUP ───────────────────────────────────────────
router.delete('/loadcontrol/groups/:id', authenticateToken, async (req, res) => {
  try {
    await execute(`DELETE FROM LoadControlGroups WHERE id = ?`, [req.params.id]);
    res.json({ success: true, message: 'Group deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ADD METERS TO GROUP ────────────────────────────────────
router.post('/loadcontrol/groups/:id/meters', authenticateToken, async (req, res) => {
  try {
    const { meters } = req.body; // array of DRN strings
    if (!Array.isArray(meters) || meters.length === 0) {
      return res.status(400).json({ error: 'Provide an array of meter DRNs' });
    }

    const values = meters.map(drn => [parseInt(req.params.id), drn]);
    await execute(
      `INSERT IGNORE INTO LoadControlGroupMembers (group_id, meter_drn) VALUES ?`,
      [values]
    );
    res.json({ success: true, message: `${meters.length} meter(s) added to group` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── REMOVE METERS FROM GROUP ───────────────────────────────
router.post('/loadcontrol/groups/:id/meters/remove', authenticateToken, async (req, res) => {
  try {
    const { meters } = req.body;
    if (!Array.isArray(meters) || meters.length === 0) {
      return res.status(400).json({ error: 'Provide an array of meter DRNs' });
    }

    const placeholders = meters.map(() => '?').join(',');
    await execute(
      `DELETE FROM LoadControlGroupMembers WHERE group_id = ? AND meter_drn IN (${placeholders})`,
      [req.params.id, ...meters]
    );
    res.json({ success: true, message: `Meter(s) removed from group` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── EXECUTE GROUP CONTROL (bulk mains/geyser on/off) ───────
router.post('/loadcontrol/execute', authenticateToken, async (req, res) => {
  try {
    const { group_id, action_type, reason, executed_by, meter_drns } = req.body;
    // action_type: mains_off, mains_on, geyser_off, geyser_on

    if (!action_type) return res.status(400).json({ error: 'action_type is required' });

    // Get target meters — either from group or explicit list
    let targetMeters = [];
    if (meter_drns && Array.isArray(meter_drns) && meter_drns.length > 0) {
      targetMeters = meter_drns;
    } else if (group_id) {
      const members = await queryAll(
        `SELECT meter_drn FROM LoadControlGroupMembers WHERE group_id = ?`,
        [group_id]
      );
      targetMeters = members.map(m => m.meter_drn);
    }

    if (targetMeters.length === 0) {
      return res.status(400).json({ error: 'No meters to control' });
    }

    // Log the action
    const actionResult = await execute(
      `INSERT INTO LoadControlActions (group_id, action_type, meter_count, executed_by, reason, status, meters_affected)
       VALUES (?, ?, ?, ?, ?, 'in_progress', ?)`,
      [group_id || null, action_type, targetMeters.length, executed_by || 'Admin',
       reason || 'Load control', JSON.stringify(targetMeters)]
    );
    const actionId = actionResult.insertId;

    const isCalibration = action_type.startsWith('calibrate_');
    const isMainsAction = action_type.startsWith('mains');
    let successCount = 0;
    let failCount = 0;

    if (isCalibration) {
      // Calibration group action
      const calAction = action_type.replace('calibrate_', ''); // auto, verify, or exercise
      const mqttCmd = { type: 'calibrate', action: calAction };

      for (const drn of targetMeters) {
        try {
          // Log calibration command
          await execute(
            `INSERT INTO MeterCalibrationLog (DRN, action, requested_by, status)
             VALUES (?, ?, ?, 'pending')`,
            [drn, calAction, executed_by || 'Admin']
          );

          // Publish MQTT command
          try {
            mqttHandler.publishCommand(drn, mqttCmd, 1);
          } catch (mqttErr) {
            console.error(`[GroupControl] MQTT calibrate to ${drn} failed:`, mqttErr.message);
          }

          successCount++;
        } catch (e) {
          failCount++;
        }
      }
    } else {
      // Relay control group action (existing logic)
      const state = action_type.endsWith('_on') ? '1' : '0';
      const tableName = isMainsAction ? 'MeterMainsStateTable' : 'MeterHeaterStateTable';
      const controlReason = reason || `Group load control: ${action_type}`;

      // Build MQTT command: { ms: 0|1 } for mains state, { gs: 0|1 } for geyser state
      const mqttCmd = isMainsAction ? { ms: parseInt(state) } : { gs: parseInt(state) };

      for (const drn of targetMeters) {
        try {
          await execute(
            `INSERT INTO ${tableName} (DRN, user, state, processed, reason)
             VALUES (?, ?, ?, '0', ?)`,
            [drn, executed_by || 'Admin', state, controlReason]
          );

          // Publish MQTT command to the meter
          try {
            mqttHandler.publishCommand(drn, mqttCmd);
          } catch (mqttErr) {
            console.error(`[GroupControl] MQTT publish to ${drn} failed:`, mqttErr.message);
          }

          successCount++;
        } catch (e) {
          failCount++;
        }
      }
    }

    // Update action status
    await execute(
      `UPDATE LoadControlActions SET status = ?, completed_at = NOW() WHERE id = ?`,
      [failCount === 0 ? 'completed' : (successCount > 0 ? 'completed' : 'failed'), actionId]
    );

    res.json({
      success: true,
      message: `${action_type} sent to ${successCount} meter(s)`,
      action_id: actionId,
      total: targetMeters.length,
      succeeded: successCount,
      failed: failCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET CONTROL ACTION HISTORY ─────────────────────────────
router.get('/loadcontrol/history', authenticateToken, async (req, res) => {
  try {
    const history = await queryAll(`
      SELECT a.*, g.name as group_name
      FROM LoadControlActions a
      LEFT JOIN LoadControlGroups g ON a.group_id = g.id
      ORDER BY a.created_at DESC
      LIMIT 100
    `);
    res.json({ success: true, data: history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET ALL METERS WITH MAINS+GEYSER STATE (for map) ───────
router.get('/loadcontrol/meters-state', authenticateToken, function(req, res) {
  getCachedMetersState(function(err, meters) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, data: meters });
  });
});

// ─── RANDOMIZE METERS FOR CONTROL ───────────────────────────
router.post('/loadcontrol/randomize', authenticateToken, async (req, res) => {
  try {
    const { count, area, exclude_drns } = req.body;
    if (!count || count < 1) return res.status(400).json({ error: 'Count is required' });

    let sql = `SELECT DRN FROM MeterLocationInfoTable WHERE Status IN ('1', 'Active')`;
    const params = [];

    if (area) {
      sql += ` AND LocationName = ?`;
      params.push(area);
    }

    if (exclude_drns && Array.isArray(exclude_drns) && exclude_drns.length > 0) {
      const placeholders = exclude_drns.map(() => '?').join(',');
      sql += ` AND DRN NOT IN (${placeholders})`;
      params.push(...exclude_drns);
    }

    sql += ` ORDER BY RAND() LIMIT ?`;
    params.push(parseInt(count));

    const meters = await queryAll(sql, params);
    res.json({ success: true, data: meters.map(m => m.DRN) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GRID TOPOLOGY / DISTRIBUTION MANAGEMENT ─────────────────

// Grid Distribution Hierarchy
execute(`CREATE TABLE IF NOT EXISTS GridHierarchy (
  id INT AUTO_INCREMENT PRIMARY KEY,
  node_type ENUM('main_station','substation','feeder','distribution','transformer','meter') NOT NULL,
  node_id VARCHAR(50) NOT NULL,
  node_name VARCHAR(200),
  node_code VARCHAR(50),
  parent_id INT DEFAULT NULL,
  lat DECIMAL(10,6),
  lng DECIMAL(10,6),
  status ENUM('online','offline','warning','critical') DEFAULT 'online',
  capacity_rating VARCHAR(50),
  voltage_level VARCHAR(50),
  description TEXT,
  metadata TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_node (node_type, node_id),
  INDEX idx_parent (parent_id),
  INDEX idx_type (node_type),
  INDEX idx_status (status)
) ENGINE=InnoDB`).catch(() => {});

// Add new columns if they don't exist
['node_code VARCHAR(50)', 'capacity_rating VARCHAR(50)', 'voltage_level VARCHAR(50)', 'description TEXT'].forEach(function(col) {
  var colName = col.split(' ')[0];
  execute("SELECT " + colName + " FROM GridHierarchy LIMIT 1").catch(function() {
    execute("ALTER TABLE GridHierarchy ADD COLUMN " + col).catch(function() {});
  });
});

// Helper: build full hierarchy path for a node
function buildNodePath(nodes, nodeId) {
  var path = [];
  var current = nodes.find(function(n) { return n.id === nodeId; });
  while (current) {
    path.unshift(current.node_name || current.node_id);
    current = current.parent_id ? nodes.find(function(n) { return n.id === current.parent_id; }) : null;
  }
  return path.join(' → ');
}

// GET /loadcontrol/grid-topology — Full hierarchy with auto-mapped meters
router.get('/loadcontrol/grid-topology', authenticateToken, function(req, res) {
  getCachedTopology(function(err, topology) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, data: topology });
  });
});

// GET /loadcontrol/grid-topology/nodes — All hierarchy nodes only
router.get('/loadcontrol/grid-topology/nodes', authenticateToken, async function(req, res) {
  try {
    var nodes = await queryAll('SELECT * FROM GridHierarchy ORDER BY node_type, node_name');
    // Add path to each node
    (nodes || []).forEach(function(n) {
      n.path = buildNodePath(nodes, n.id);
    });
    res.json({ success: true, data: nodes || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /loadcontrol/grid-topology/nodes — Create a new distribution asset
router.post('/loadcontrol/grid-topology/nodes', authenticateToken, async function(req, res) {
  try {
    var body = req.body;
    var nodeType = body.node_type;
    var nodeName = body.node_name;
    var nodeCode = body.node_code || null;
    var parentId = body.parent_id || null;
    var lat = body.lat || null;
    var lng = body.lng || null;
    var capacityRating = body.capacity_rating || null;
    var voltageLevel = body.voltage_level || null;
    var description = body.description || null;
    var metadata = body.metadata ? JSON.stringify(body.metadata) : null;

    if (!nodeType || !nodeName) {
      return res.status(400).json({ error: 'node_type and node_name are required' });
    }

    var validTypes = ['main_station', 'substation', 'feeder', 'distribution', 'transformer'];
    if (validTypes.indexOf(nodeType) === -1) {
      return res.status(400).json({ error: 'Invalid node_type. Must be one of: ' + validTypes.join(', ') });
    }

    // Validate parent_id exists if provided
    if (parentId) {
      var parent = await queryOne('SELECT id, node_name, node_type FROM GridHierarchy WHERE id = ?', [parentId]);
      if (!parent) {
        return res.status(400).json({ error: 'Parent node not found with id: ' + parentId });
      }
    }

    // Generate node_id
    var nodeId = nodeType.substring(0, 3).toUpperCase() + '-' + Date.now();

    var result = await execute(
      `INSERT INTO GridHierarchy (node_type, node_id, node_name, node_code, parent_id, lat, lng, capacity_rating, voltage_level, description, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [nodeType, nodeId, nodeName, nodeCode, parentId, lat, lng, capacityRating, voltageLevel, description, metadata]
    );

    // Get full path
    var allNodes = await queryAll('SELECT * FROM GridHierarchy ORDER BY node_type, node_name');
    var path = buildNodePath(allNodes, result.insertId);

    res.json({
      success: true,
      message: 'Distribution node created',
      id: result.insertId,
      node_id: nodeId,
      path: path
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /loadcontrol/grid-topology/nodes/:id — Update a node
router.put('/loadcontrol/grid-topology/nodes/:id', authenticateToken, async function(req, res) {
  try {
    var existing = await queryOne('SELECT * FROM GridHierarchy WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Node not found' });
    }

    var updates = [];
    var params = [];
    var fields = ['node_name', 'node_code', 'parent_id', 'lat', 'lng', 'status', 'capacity_rating', 'voltage_level', 'description', 'metadata'];
    fields.forEach(function(f) {
      if (req.body[f] !== undefined) {
        var val = req.body[f];
        if (f === 'metadata' && typeof val === 'object') val = JSON.stringify(val);
        updates.push(f + ' = ?');
        params.push(val);
      }
    });

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(req.params.id);
    await execute('UPDATE GridHierarchy SET ' + updates.join(', ') + ' WHERE id = ?', params);

    res.json({ success: true, message: 'Node updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /loadcontrol/grid-topology/nodes/:id — Delete a node (and re-parent children)
router.delete('/loadcontrol/grid-topology/nodes/:id', authenticateToken, async function(req, res) {
  try {
    var existing = await queryOne('SELECT * FROM GridHierarchy WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Node not found' });
    }

    // Re-parent children to this node's parent
    await execute('UPDATE GridHierarchy SET parent_id = ? WHERE parent_id = ?', [existing.parent_id || null, req.params.id]);

    // Delete the node
    await execute('DELETE FROM GridHierarchy WHERE id = ?', [req.params.id]);

    res.json({ success: true, message: 'Node deleted, children re-parented' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /loadcontrol/grid-topology/assign-meter — Assign meter to distribution node (removes previous)
router.post('/loadcontrol/grid-topology/assign-meter', authenticateToken, async function(req, res) {
  try {
    var drn = req.body.drn;
    var parentId = req.body.parent_id;

    if (!drn || !parentId) {
      return res.status(400).json({ error: 'drn and parent_id are required' });
    }

    // Validate parent exists and is not a meter
    var parent = await queryOne('SELECT id, node_name, node_type FROM GridHierarchy WHERE id = ?', [parentId]);
    if (!parent) {
      return res.status(400).json({ error: 'Parent distribution node not found' });
    }
    if (parent.node_type === 'meter') {
      return res.status(400).json({ error: 'Cannot assign a meter under another meter' });
    }

    // Check if meter was previously assigned
    var previousAssignment = await queryOne("SELECT id, parent_id FROM GridHierarchy WHERE node_type = 'meter' AND node_id = ?", [drn]);
    var previousParentName = null;
    if (previousAssignment && previousAssignment.parent_id) {
      var prevParent = await queryOne('SELECT node_name FROM GridHierarchy WHERE id = ?', [previousAssignment.parent_id]);
      previousParentName = prevParent ? prevParent.node_name : null;
    }

    // Remove any existing assignment for this DRN
    await execute("DELETE FROM GridHierarchy WHERE node_type = 'meter' AND node_id = ?", [drn]);

    // Get meter info for the name
    var meterInfo = await queryOne(
      "SELECT ml.LocationName, CONCAT(mpr.Name, ' ', mpr.Surname) as customerName FROM MeterLocationInfoTable ml LEFT JOIN MeterProfileReal mpr ON ml.DRN = mpr.DRN WHERE ml.DRN = ?",
      [drn]
    );
    var meterName = drn;
    if (meterInfo && meterInfo.customerName) {
      meterName = drn + ' (' + meterInfo.customerName.trim() + ')';
    }

    // Insert new assignment
    await execute(
      "INSERT INTO GridHierarchy (node_type, node_id, node_name, parent_id) VALUES ('meter', ?, ?, ?)",
      [drn, meterName, parentId]
    );

    // Get full path
    var allNodes = await queryAll('SELECT * FROM GridHierarchy ORDER BY node_type, node_name');
    var newNode = allNodes.find(function(n) { return n.node_type === 'meter' && n.node_id === drn; });
    var path = newNode ? buildNodePath(allNodes, newNode.id) : '';

    res.json({
      success: true,
      message: 'Meter ' + drn + ' assigned to ' + parent.node_name,
      path: path,
      previousParent: previousParentName
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /loadcontrol/grid-topology/orphans — Unmapped meters
router.get('/loadcontrol/grid-topology/orphans', authenticateToken, async function(req, res) {
  try {
    var allMeters = await queryAll(`
      SELECT ml.DRN, ml.LocationName, ml.Lat, ml.Longitude, ml.Status,
             CONCAT(mpr.Name, ' ', mpr.Surname) as customerName
      FROM MeterLocationInfoTable ml
      LEFT JOIN MeterProfileReal mpr ON ml.DRN = mpr.DRN
      WHERE ml.DRN != 'TEST'
    `);
    var mappedMeters = await queryAll("SELECT node_id FROM GridHierarchy WHERE node_type = 'meter'");
    var mappedSet = {};
    (mappedMeters || []).forEach(function(m) { mappedSet[m.node_id] = true; });
    var orphans = (allMeters || []).filter(function(m) { return !mappedSet[m.DRN]; });
    res.json({ success: true, data: orphans, count: orphans.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /loadcontrol/grid-topology/meter-path/:drn — Get full hierarchy path for a meter
router.get('/loadcontrol/grid-topology/meter-path/:drn', authenticateToken, async function(req, res) {
  try {
    var drn = req.params.drn;
    var meterNode = await queryOne("SELECT * FROM GridHierarchy WHERE node_type = 'meter' AND node_id = ?", [drn]);
    if (!meterNode) {
      return res.json({ success: true, data: { drn: drn, path: 'Unassigned', assigned: false } });
    }
    var allNodes = await queryAll('SELECT * FROM GridHierarchy ORDER BY node_type, node_name');
    var path = buildNodePath(allNodes, meterNode.id);
    res.json({ success: true, data: { drn: drn, path: path, assigned: true, parent_id: meterNode.parent_id } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
