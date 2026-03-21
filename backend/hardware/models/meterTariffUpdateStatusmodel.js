const connection = require("../service/hwDatabase.js");

const TariffUpdateStatus = function (data) {
  this.meterDRN = data.meterDRN;
  this.tariff_id = data.tariff_id || null;
  this.system_tariff_rate = data.system_tariff_rate || null;
  this.meter_tariff_rate = data.meter_tariff_rate || null;
  this.tariff_value = data.tariff_value || null;
  this.tariff_type = data.tariff_type || null;
  this.implementation_date_time = data.implementation_date_time || null;
  this.user = data.user || null;
  this.update_status = data.update_status || "Pending";
  this.confirmation_time = data.confirmation_time || null;
  this.last_attempt_time = data.last_attempt_time || null;
  this.remarks = data.remarks || null;
};

// ➕ CREATE new records for all meters under a tariff type
TariffUpdateStatus.create= (data, result) =>  {
  const { tariff_type, implementation_date_time, user, tariff_id, system_tariff_rate, tariff_value, remarks } = data;

  // 1️⃣ Validate required fields
  if (!tariff_type || !tariff_id) {
    return result(null, {
      success: false,
      message: "Missing required fields: tariff_type or tariff_id.",
    });
  }

  // 2️⃣ Fetch all meters for the specified tariff type
  const getMetersQuery = `SELECT DRN FROM MeterProfileReal WHERE tariff_type = ?`;
  connection.query(getMetersQuery, [tariff_type], (err, meters) => {
    if (err) {
      console.error("❌ Error fetching meters:", err);
      return result(null, { success: false, message: "Database error.", error: err });
    }

    if (!meters.length) {
      return result(null, {
        success: false,
        message: `No meters found for tariff type '${tariff_type}'`,
      });
    }

    const drns = meters.map(m => m.DRN);

    // 3️⃣ Check which meters already exist in tariff_update_status
    const checkExistingSql = `
      SELECT DISTINCT meterDRN
      FROM tariff_update_status
      WHERE meterDRN IN (?) AND tariff_type = ?
    `;

    connection.query(checkExistingSql, [drns, tariff_type], (checkErr, existingRows) => {
      if (checkErr) {
        console.error("❌ Error checking existing records:", checkErr);
        return result(null, { success: false, message: "Database error.", error: checkErr });
      }

      const existingSet = new Set((existingRows || []).map(r => r.meterDRN));
      const metersToUpdate = meters.filter(m => existingSet.has(m.DRN));
      const metersToInsert = meters.filter(m => !existingSet.has(m.DRN));

      let updatedCount = 0;
      let createdCount = 0;

      // 4️⃣ Update all existing records and reset update_status to 'Pending'
      if (metersToUpdate.length > 0) {
        const updatePromises = metersToUpdate.map(m => {
          return new Promise((resolveUpdate) => {
            const updateSql = `
              UPDATE tariff_update_status
              SET system_tariff_rate = ?, 
                  tariff_value = ?, 
                  implementation_date_time = ?, 
                  user = ?, 
                  remarks = ?, 
                  update_status = 'Pending'
              WHERE meterDRN = ? AND tariff_type = ?
            `;
            connection.query(updateSql, [
              system_tariff_rate || null,
              tariff_value || null,
              implementation_date_time || new Date(),
              user || "system",
              remarks || null,
              m.DRN,
              tariff_type
            ], (updateErr, updateRes) => {
              if (!updateErr) updatedCount += updateRes.affectedRows;
              resolveUpdate();
            });
          });
        });

        Promise.all(updatePromises).then(() => insertNewRecords());
      } else {
        insertNewRecords();
      }

      // 5️⃣ Insert new records (also with update_status = 'Pending')
      function insertNewRecords() {
        if (metersToInsert.length === 0) {
          return result(null, {
            success: true,
            message: `Tariff updates processed successfully.`,
            tariff_type,
            tariff_id,
            created: createdCount,
            updated: updatedCount,
            update_status: "Pending"
          });
        }

        const insertData = metersToInsert.map((m) => [
          m.DRN,
          tariff_id,
          system_tariff_rate || null,
          null, // meter_tariff_rate
          tariff_value || null,
          tariff_type,
          implementation_date_time || new Date(),
          user || "system",
          "Pending", // Always set Pending for new records
          null,
          null,
          remarks || null
        ]);

        const insertQuery = `
          INSERT INTO tariff_update_status 
          (meterDRN, tariff_id, system_tariff_rate, meter_tariff_rate, tariff_value, 
           tariff_type, implementation_date_time, user, update_status, 
           confirmation_time, last_attempt_time, remarks)
          VALUES ?
        `;

        connection.query(insertQuery, [insertData], (insertErr, insertRes) => {
          if (insertErr) {
            console.error("❌ Error inserting records:", insertErr);
            return result(null, { success: false, message: "Insert error.", error: insertErr });
          }

          createdCount = insertRes.affectedRows;

          // 6️⃣ Return JSON summary
          result(null, {
            success: true,
            message: `Tariff updates processed successfully.`,
            tariff_type,
            tariff_id,
            created: createdCount,
            updated: updatedCount,
            update_status: "Pending"
          });
        });
      }
    });
  });
};


// 🔍 Get ALL records
TariffUpdateStatus.getAll = (result) => {
  connection.query("SELECT * FROM tariff_update_status", (err, res) => {
    if (err) {
      console.error("❌ Error fetching records:", err);
      return result(null, { success: false, message: "Database error.", error: err });
    }

    result(null, { success: true, data: res });
  });
};

// 🔍 Get most recent pending record for a single meter
TariffUpdateStatus.getPendingMeterByDRN = (meterDRN, result) => {
  const sql = `
    SELECT id, meterDRN, tariff_id, system_tariff_rate, meter_tariff_rate, tariff_value,
           tariff_type, update_status, implementation_date_time, user
    FROM tariff_update_status
    WHERE meterDRN = ?
      AND update_status = 'Pending'
    ORDER BY id DESC
    LIMIT 1;
  `;

  connection.query(sql, [meterDRN], (err, res) => {
    if (err) {
      console.error(`❌ Error fetching pending record for meter ${meterDRN}:`, err);
      return result(null, { success: false, message: "Database error.", error: err });
    }

    if (res.length === 0) {
      return result(null, { data: false });
    }

    result(null, { success: true, data: res[0] });
  });
};

// 🔄 Confirm update (meter reports successful update)
TariffUpdateStatus.confirmUpdate = (meterDRN, tariff_id, status, remarks, meter_tariff_rate, result) => {
  const sql = `
    UPDATE tariff_update_status
    SET update_status = ?, 
        confirmation_time = NOW(), 
        remarks = ?, 
        meter_tariff_rate = ?
    WHERE meterDRN = ? AND tariff_id = ?;
  `;

  connection.query(sql, [status, remarks, meter_tariff_rate, meterDRN, tariff_id], (err, res) => {
    if (err) {
      console.error("❌ Error confirming update:", err);
      return result(null, { success: false, message: "Database error.", error: err });
    }

    if (res.affectedRows === 0) {
      return result(null, { success: false, message: "No matching record found." });
    }

    result(null, {
      success: true,
      message: `Meter ${meterDRN} confirmed tariff ${tariff_id} as '${status}'.`,
    });
  });
};

// 🔄 Update last attempt timestamp
TariffUpdateStatus.updateLastAttempt = (meterDRN, tariff_id, result) => {
  const sql = `
    UPDATE tariff_update_status
    SET last_attempt_time = NOW()
    WHERE meterDRN = ? AND tariff_id = ?;
  `;

  connection.query(sql, [meterDRN, tariff_id], (err, res) => {
    if (err) {
      console.error("❌ Error updating last attempt:", err);
      return result(null, { success: false, message: "Database error.", error: err });
    }

    result(null, { success: true, message: "Last attempt updated.", data: res });
  });
};

// 🔄 Manually update tariff value
TariffUpdateStatus.updateTariffValue = (meterDRN, tariff_id, tariff_value, user, result) => {
  const sql = `
    UPDATE tariff_update_status
    SET tariff_value = ?, user = ?, last_attempt_time = NOW()
    WHERE meterDRN = ? AND tariff_id = ?;
  `;

  connection.query(sql, [tariff_value, user, meterDRN, tariff_id], (err, res) => {
    if (err) {
      console.error("❌ Error updating tariff value:", err);
      return result(null, { success: false, message: "Database error.", error: err });
    }

    result(null, {
      success: true,
      message: `Tariff value updated for meter ${meterDRN}.`,
      data: res,
    });
  });
};


// ❌ Delete all records
TariffUpdateStatus.deleteAll = (result) => {
  connection.query("DELETE FROM tariff_update_status", (err, res) => {
    if (err) {
      console.error("❌ Error deleting all records:", err);
      return result(null, { success: false, message: "Database error.", error: err });
    }

    result(null, {
      success: true,
      message: `Deleted ${res.affectedRows} records.`,
    });
  });
};


TariffUpdateStatus.updateStatusToUpdated = (meterDRN, tariff_id, result) => {
  // 1️⃣ Update the status to 'Updated'
  const updateSql = `
    UPDATE tariff_update_status
    SET update_status = 'Updated', updated_at = NOW()
    WHERE meterDRN = ?;
  `;

  connection.query(updateSql, [meterDRN, tariff_id], (err, res) => {
    if (err) {
      console.error("❌ Error updating status to 'Updated':", err);
      return result(null, {
        success: false,
        message: "Database error while updating tariff status.",
        error: err
      });
    }

    if (res.affectedRows === 0) {
      return result(null, {
        success: false,
        message: `No matching tariff update found for meter ${meterDRN} and tariff_id ${tariff_id}.`,
        data: {}
      });
    }

    // 2️⃣ Fetch the updated row to return all fields
    const selectSql = `
      SELECT * 
      FROM tariff_update_status
      WHERE meterDRN = ? AND tariff_id = ?;
    `;

    connection.query(selectSql, [meterDRN, tariff_id], (selectErr, rows) => {
      if (selectErr) {
        console.error("❌ Error fetching updated tariff record:", selectErr);
        return result(null, {
          success: false,
          message: "Database error while fetching updated tariff record.",
          error: selectErr
        });
      }

      result(null, {
        success: true,
        message: `Tariff marked as 'Updated' for meter ${meterDRN}.`,
        data: rows[0] || {}
      });
    });
  });
};


module.exports = TariffUpdateStatus;
