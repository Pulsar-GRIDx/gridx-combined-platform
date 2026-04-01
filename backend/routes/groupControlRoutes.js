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
      action_type ENUM('mains_off', 'mains_on', 'geyser_off', 'geyser_on') NOT NULL,
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
    const { name, description, control_type, is_active } = req.body;
    await execute(
      `UPDATE LoadControlGroups SET name = ?, description = ?, control_type = ?, is_active = ? WHERE id = ?`,
      [name, description, control_type, is_active !== undefined ? is_active : 1, req.params.id]
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

    // Determine which control table to insert into
    const isMainsAction = action_type.startsWith('mains');
    const state = action_type.endsWith('_on') ? '1' : '0';
    const tableName = isMainsAction ? 'MeterMainsControlTable' : 'MeterHeaterControlTable';
    const controlReason = reason || `Group load control: ${action_type}`;

    // Insert control commands for each meter
    let successCount = 0;
    let failCount = 0;

    // Build MQTT command: { mc: 0|1 } for mains, { gc: 0|1 } for geyser
    const mqttCmd = isMainsAction ? { mc: parseInt(state) } : { gc: parseInt(state) };

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
router.get('/loadcontrol/meters-state', authenticateToken, async (req, res) => {
  try {
    const meters = await queryAll(`
      SELECT
        ml.DRN, ml.Lat, ml.Longitude, ml.LocationName, ml.Status,
        CONCAT(mpr.Name, ' ', mpr.Surname) as customerName,
        mpr.City, mpr.Region, mpr.TransformerDRN,
        COALESCE(ms.state, '0') as mains_state,
        COALESCE(hs.state, '0') as geyser_state
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
      ORDER BY ml.LocationName, ml.DRN
    `);
    res.json({ success: true, data: meters });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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

module.exports = router;
