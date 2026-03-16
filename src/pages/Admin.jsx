import { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Chip,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
  useTheme,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Alert,
  IconButton,
  Tooltip,
  Select,
  FormControl,
  InputLabel,
} from "@mui/material";
import {
  PersonOutlined,
  PersonAddOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircle,
  Cancel,
  FiberManualRecord,
  AdminPanelSettingsOutlined,
  LoginOutlined,
  LockOpenOutlined,
  SecurityOutlined,
  RefreshOutlined,
  BlockOutlined,
} from "@mui/icons-material";
import Header from "../components/Header";
import StatBox from "../components/StatBox";
import { tokens } from "../theme";
import { authAPI } from "../services/api";
import { useAuth } from "../context/AuthContext";

/* ---- role chip color map ---- */
const roleColor = {
  ADMIN: { bg: "rgba(0,180,216,0.15)", text: "#00b4d8" },
  SUPERVISOR: { bg: "rgba(104,112,250,0.15)", text: "#6870fa" },
  OPERATOR: { bg: "rgba(76,206,172,0.15)", text: "#4cceac" },
  VIEWER: { bg: "rgba(158,158,158,0.15)", text: "#9e9e9e" },
};

/* ---- audit type border colors ---- */
const auditTypeColor = {
  LOGIN: "#4cceac",
  LOGIN_FAILED: "#db4f4a",
  LOCKOUT: "#f2b705",
  PASSWORD_RESET: "#6870fa",
  USER_CREATE: "#00b4d8",
  USER_UPDATE: "#f2b705",
  USER_DELETE: "#db4f4a",
  "2FA": "#9c27b0",
  SYSTEM: "#9e9e9e",
};

/* ---- helpers ---- */
function formatDateTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-NA", { year: "numeric", month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString("en-NA", { hour: "2-digit", minute: "2-digit" })
  );
}

function formatTimestamp(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-NA", { year: "numeric", month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString("en-NA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  );
}

const initialForm = { Username: "", FirstName: "", LastName: "", Email: "", Password: "", AccessLevel: "OPERATOR", access_type: "PLATFORM" };

/* ==================================================================== */
/* Admin Page                                                           */
/* ==================================================================== */
export default function Admin() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.AccessLevel === "ADMIN";

  const [operators, setOperators] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [auditLoading, setAuditLoading] = useState(true);

  // Add/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...initialForm });
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Password reset dialog
  const [pwDialog, setPwDialog] = useState(null);
  const [newPassword, setNewPassword] = useState("");

  // Snackbar-like status
  const [statusMsg, setStatusMsg] = useState("");

  // Audit filter
  const [auditFilter, setAuditFilter] = useState("");

  const fetchAdmins = async () => {
    try {
      const res = await authAPI.getAllAdmins();
      if (res?.users) {
        const mapped = res.users.map((a) => ({
          id: a.Admin_ID,
          name: `${a.FirstName || ""} ${a.LastName || ""}`.trim() || a.Username,
          username: a.Username || a.Email,
          email: a.Email,
          firstName: a.FirstName || "",
          lastName: a.LastName || "",
          role: (a.AccessLevel || "OPERATOR").toUpperCase(),
          accessType: a.access_type || "PLATFORM",
          lastLogin: a.lastLoginTime || null,
          loginCount: a.login_count || 0,
          ipAddress: a.ip_address || "",
          status: a.IsActive == 1 ? "Active" : "Inactive",
          twofa: a.twofa_enabled == 1,
        }));
        setOperators(mapped);
      }
    } catch (err) {
      console.error("Failed to fetch admins:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAuditLog = async () => {
    try {
      const params = {};
      if (auditFilter) params.type = auditFilter;
      const res = await authAPI.getPlatformAuditLog(params);
      if (res?.data) setAuditLog(res.data);
    } catch (err) {
      console.error("Failed to fetch audit log:", err);
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => { fetchAdmins(); fetchAuditLog(); }, []);
  useEffect(() => { setAuditLoading(true); fetchAuditLog(); }, [auditFilter]);

  /* ---- counts ---- */
  const totalOperators = operators.length;
  const activeOperators = operators.filter((o) => o.status === "Active").length;
  const recentLogins = operators.filter((o) => {
    if (!o.lastLogin) return false;
    return Date.now() - new Date(o.lastLogin).getTime() < 24 * 60 * 60 * 1000;
  }).length;

  /* ---- handlers ---- */
  const openAddDialog = () => {
    setEditingId(null);
    setForm({ ...initialForm });
    setFormError("");
    setDialogOpen(true);
  };

  const openEditDialog = (op) => {
    setEditingId(op.id);
    setForm({
      Username: op.username,
      FirstName: op.firstName,
      LastName: op.lastName,
      Email: op.email,
      Password: "",
      AccessLevel: op.role,
      access_type: op.accessType,
    });
    setFormError("");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.Email || !form.Username) { setFormError("Username and Email are required"); return; }
    if (!editingId && !form.Password) { setFormError("Password is required for new users"); return; }
    setFormLoading(true);
    setFormError("");
    try {
      if (editingId) {
        await authAPI.updateAdmin(editingId, form);
        setStatusMsg("Admin updated successfully");
      } else {
        await authAPI.signup(form);
        setStatusMsg("New admin created successfully");
      }
      setDialogOpen(false);
      fetchAdmins();
      fetchAuditLog();
    } catch (err) {
      setFormError(err.message || "Operation failed");
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await authAPI.deleteAdmin(id);
      setStatusMsg("Admin deleted");
      setDeleteConfirm(null);
      fetchAdmins();
      fetchAuditLog();
    } catch (err) {
      setStatusMsg("Delete failed: " + err.message);
      setDeleteConfirm(null);
    }
  };

  const handleToggleStatus = async (id) => {
    try {
      await authAPI.updateAdminStatus(id);
      setStatusMsg("Status updated");
      fetchAdmins();
      fetchAuditLog();
    } catch (err) {
      setStatusMsg("Status update failed: " + err.message);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) { setStatusMsg("Password must be at least 6 characters"); return; }
    try {
      await authAPI.resetPassword(pwDialog, newPassword);
      setStatusMsg("Password reset successfully");
      setPwDialog(null);
      setNewPassword("");
      fetchAuditLog();
    } catch (err) {
      setStatusMsg("Password reset failed: " + err.message);
    }
  };

  const handleUnlock = async (id) => {
    try {
      await authAPI.unlockAccount(id);
      setStatusMsg("Account unlocked");
      fetchAuditLog();
    } catch (err) {
      setStatusMsg("Unlock failed: " + err.message);
    }
  };

  const inputSx = {
    "& .MuiOutlinedInput-root": {
      "& fieldset": { borderColor: "rgba(255,255,255,0.15)" },
      "&:hover fieldset": { borderColor: "rgba(76,206,172,0.4)" },
    },
    "& .MuiInputLabel-root": { color: "rgba(255,255,255,0.5)" },
    "& input, & .MuiSelect-select": { color: "#fff" },
  };

  return (
    <Box m="20px">
      <Header
        title="SYSTEM ADMINISTRATION"
        subtitle="User management, access control, and security audit trail"
      />

      {statusMsg && (
        <Alert
          severity="info"
          onClose={() => setStatusMsg("")}
          sx={{ mb: 2, backgroundColor: "rgba(76,206,172,0.1)", border: "1px solid rgba(76,206,172,0.3)", color: "#4cceac" }}
        >
          {statusMsg}
        </Alert>
      )}

      <Box display="grid" gridTemplateColumns="repeat(12, 1fr)" gridAutoRows="140px" gap="5px">
        {/* ---- Stat Boxes ---- */}
        <Box gridColumn="span 4" backgroundColor={colors.primary[400]} display="flex" alignItems="center" justifyContent="center">
          <StatBox
            title={String(activeOperators)}
            subtitle="Active Users"
            progress={totalOperators > 0 ? activeOperators / totalOperators : 0}
            increase={totalOperators > 0 ? `${((activeOperators / totalOperators) * 100).toFixed(0)}%` : "0%"}
            icon={<PersonOutlined sx={{ color: colors.greenAccent[600], fontSize: "26px" }} />}
            link="/admin"
          />
        </Box>

        <Box gridColumn="span 4" backgroundColor={colors.primary[400]} display="flex" alignItems="center" justifyContent="center">
          <StatBox
            title={String(totalOperators)}
            subtitle="Total Users"
            progress={1}
            increase="100%"
            icon={<AdminPanelSettingsOutlined sx={{ color: colors.greenAccent[600], fontSize: "26px" }} />}
            link="/admin"
          />
        </Box>

        <Box gridColumn="span 4" backgroundColor={colors.primary[400]} display="flex" alignItems="center" justifyContent="center">
          <StatBox
            title={String(recentLogins)}
            subtitle="Recent Logins (24h)"
            progress={totalOperators > 0 ? recentLogins / totalOperators : 0}
            increase={totalOperators > 0 ? `${((recentLogins / totalOperators) * 100).toFixed(0)}%` : "0%"}
            icon={<LoginOutlined sx={{ color: colors.greenAccent[600], fontSize: "26px" }} />}
            link="/admin"
          />
        </Box>

        {/* ---- Users Table (span 7, span 4) ---- */}
        <Box gridColumn="span 7" gridRow="span 4" backgroundColor={colors.primary[400]} borderRadius="4px" overflow="auto" p="15px">
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6" color={colors.grey[100]} fontWeight={600}>
              System Users
            </Typography>
            <Box display="flex" gap={1}>
              <Tooltip title="Refresh">
                <IconButton size="small" onClick={() => { setLoading(true); fetchAdmins(); }} sx={{ color: colors.greenAccent[500] }}>
                  <RefreshOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
              {isAdmin && (
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<PersonAddOutlined />}
                  onClick={openAddDialog}
                  sx={{
                    backgroundColor: colors.greenAccent[700],
                    "&:hover": { backgroundColor: colors.greenAccent[600] },
                    textTransform: "none",
                  }}
                >
                  Add User
                </Button>
              )}
            </Box>
          </Box>

          {loading ? (
            <Box display="flex" justifyContent="center" py={4}><CircularProgress sx={{ color: colors.greenAccent[500] }} /></Box>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {["Name", "Email", "Role", "Access", "Last Login", "2FA", "Status", "Actions"].map((col) => (
                      <TableCell
                        key={col}
                        sx={{
                          color: colors.greenAccent[500],
                          fontWeight: 600,
                          fontSize: "0.72rem",
                          borderBottom: `2px solid rgba(255,255,255,0.08)`,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {col}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {operators.map((op) => {
                    const rc = roleColor[op.role] || roleColor.VIEWER;
                    return (
                      <TableRow
                        key={op.id}
                        sx={{
                          "&:hover": { bgcolor: "rgba(0,180,216,0.06)" },
                          "& td": {
                            borderBottom: "1px solid rgba(255,255,255,0.05)",
                            color: colors.grey[100],
                            fontSize: "0.78rem",
                            py: 1,
                          },
                        }}
                      >
                        <TableCell sx={{ fontWeight: 500 }}>{op.name}</TableCell>
                        <TableCell sx={{ fontFamily: "monospace", fontSize: "0.74rem" }}>{op.email}</TableCell>
                        <TableCell>
                          <Chip label={op.role} size="small" sx={{ bgcolor: rc.bg, color: rc.text, fontWeight: 600, fontSize: "0.68rem", height: 22 }} />
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={op.accessType}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: "0.65rem", height: 20, borderColor: "rgba(255,255,255,0.15)", color: colors.grey[300] }}
                          />
                        </TableCell>
                        <TableCell>{formatDateTime(op.lastLogin)}</TableCell>
                        <TableCell>
                          {op.twofa ? (
                            <SecurityOutlined sx={{ fontSize: 16, color: "#4cceac" }} />
                          ) : (
                            <Typography variant="caption" color="rgba(255,255,255,0.3)">Off</Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Box display="flex" alignItems="center" gap={0.5}>
                            <FiberManualRecord sx={{ fontSize: 8, color: op.status === "Active" ? colors.greenAccent[500] : "#db4f4a" }} />
                            <Typography variant="body2" fontSize="0.74rem" color={op.status === "Active" ? colors.greenAccent[500] : "#db4f4a"}>
                              {op.status}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          {isAdmin && (
                            <Box display="flex" gap={0.5}>
                              <Tooltip title="Edit">
                                <IconButton size="small" onClick={() => openEditDialog(op)} sx={{ color: colors.greenAccent[500] }}>
                                  <EditOutlined sx={{ fontSize: 16 }} />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Reset Password">
                                <IconButton size="small" onClick={() => { setPwDialog(op.id); setNewPassword(""); }} sx={{ color: "#f2b705" }}>
                                  <LockOpenOutlined sx={{ fontSize: 16 }} />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title={op.status === "Active" ? "Deactivate" : "Activate"}>
                                <IconButton size="small" onClick={() => handleToggleStatus(op.id)} sx={{ color: op.status === "Active" ? "#db4f4a" : "#4cceac" }}>
                                  {op.status === "Active" ? <BlockOutlined sx={{ fontSize: 16 }} /> : <CheckCircle sx={{ fontSize: 16 }} />}
                                </IconButton>
                              </Tooltip>
                              {op.id !== currentUser?.Admin_ID && (
                                <Tooltip title="Delete">
                                  <IconButton size="small" onClick={() => setDeleteConfirm(op.id)} sx={{ color: "#db4f4a" }}>
                                    <DeleteOutlined sx={{ fontSize: 16 }} />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </Box>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>

        {/* ---- Platform Audit Log (span 5, span 4) ---- */}
        <Box gridColumn="span 5" gridRow="span 4" backgroundColor={colors.primary[400]} borderRadius="4px" overflow="auto" p="15px">
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6" color={colors.grey[100]} fontWeight={600}>
              Security Audit Log
            </Typography>
            <Box display="flex" gap={1} alignItems="center">
              <FormControl size="small" sx={{ minWidth: 100 }}>
                <Select
                  value={auditFilter}
                  onChange={(e) => setAuditFilter(e.target.value)}
                  displayEmpty
                  sx={{ color: "#fff", fontSize: "0.72rem", "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.1)" } }}
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="LOGIN">Logins</MenuItem>
                  <MenuItem value="LOGIN_FAILED">Failed</MenuItem>
                  <MenuItem value="LOCKOUT">Lockouts</MenuItem>
                  <MenuItem value="PASSWORD_RESET">Password</MenuItem>
                  <MenuItem value="USER_CREATE">Created</MenuItem>
                  <MenuItem value="USER_UPDATE">Updated</MenuItem>
                  <MenuItem value="USER_DELETE">Deleted</MenuItem>
                  <MenuItem value="2FA">2FA</MenuItem>
                  <MenuItem value="SYSTEM">System</MenuItem>
                </Select>
              </FormControl>
              <Tooltip title="Refresh">
                <IconButton size="small" onClick={() => { setAuditLoading(true); fetchAuditLog(); }} sx={{ color: colors.greenAccent[500] }}>
                  <RefreshOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>

          {auditLoading ? (
            <Box display="flex" justifyContent="center" py={4}><CircularProgress size={24} sx={{ color: colors.greenAccent[500] }} /></Box>
          ) : auditLog.length === 0 ? (
            <Typography sx={{ color: "rgba(255,255,255,0.3)", textAlign: "center", py: 4 }}>
              No audit entries found
            </Typography>
          ) : (
            auditLog.slice(0, 50).map((entry, idx) => {
              const borderColor = auditTypeColor[entry.type] || "#9e9e9e";
              return (
                <Box key={entry.id || idx}>
                  <Box
                    sx={{
                      borderLeft: `3px solid ${borderColor}`,
                      pl: 2,
                      py: 1,
                      "&:hover": { bgcolor: "rgba(0,180,216,0.04)" },
                    }}
                  >
                    <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={0.2}>
                      <Typography variant="body2" color={colors.grey[100]} fontWeight={600} fontSize="0.78rem" sx={{ flex: 1 }}>
                        {entry.event}
                      </Typography>
                      <Chip
                        label={entry.type}
                        size="small"
                        sx={{
                          bgcolor: `${borderColor}20`,
                          color: borderColor,
                          fontWeight: 600,
                          fontSize: "0.6rem",
                          height: 18,
                          ml: 1,
                          flexShrink: 0,
                        }}
                      />
                    </Box>
                    {entry.detail && (
                      <Typography variant="caption" color={colors.grey[400]} fontSize="0.72rem" display="block" mb={0.2}>
                        {entry.detail}
                      </Typography>
                    )}
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Typography variant="caption" color="rgba(255,255,255,0.3)" fontSize="0.68rem">
                        {formatTimestamp(entry.timestamp)}
                      </Typography>
                      <Box display="flex" gap={1}>
                        {entry.ip_address && (
                          <Typography variant="caption" color="rgba(255,255,255,0.25)" fontSize="0.65rem">
                            {entry.ip_address}
                          </Typography>
                        )}
                        {entry.geo_location && entry.geo_location !== "Unknown" && (
                          <Typography variant="caption" color="rgba(255,255,255,0.25)" fontSize="0.65rem">
                            {entry.geo_location}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  </Box>
                  {idx < auditLog.length - 1 && (
                    <Divider sx={{ borderColor: "rgba(255,255,255,0.04)" }} />
                  )}
                </Box>
              );
            })
          )}
        </Box>
      </Box>

      {/* ====== ADD / EDIT USER DIALOG ====== */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            background: "linear-gradient(180deg, #101624 0%, #0c101b 100%)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "12px",
          },
        }}
      >
        <DialogTitle sx={{ color: "#fff", fontWeight: 700 }}>
          {editingId ? "Edit User" : "Add New User"}
        </DialogTitle>
        <DialogContent>
          {formError && (
            <Alert severity="error" sx={{ mb: 2, backgroundColor: "rgba(219,79,74,0.1)", border: "1px solid rgba(219,79,74,0.3)", color: "#f1b9b7" }}>
              {formError}
            </Alert>
          )}
          <Box display="grid" gridTemplateColumns="1fr 1fr" gap={2} mt={1}>
            <TextField label="First Name" value={form.FirstName} onChange={(e) => setForm({ ...form, FirstName: e.target.value })} sx={inputSx} />
            <TextField label="Last Name" value={form.LastName} onChange={(e) => setForm({ ...form, LastName: e.target.value })} sx={inputSx} />
            <TextField label="Username" value={form.Username} onChange={(e) => setForm({ ...form, Username: e.target.value })} required sx={inputSx} />
            <TextField label="Email" value={form.Email} onChange={(e) => setForm({ ...form, Email: e.target.value })} required sx={inputSx} />
            {!editingId && (
              <TextField label="Password" type="password" value={form.Password} onChange={(e) => setForm({ ...form, Password: e.target.value })} required sx={inputSx} />
            )}
            <TextField
              label="Role"
              select
              value={form.AccessLevel}
              onChange={(e) => setForm({ ...form, AccessLevel: e.target.value })}
              sx={inputSx}
            >
              <MenuItem value="ADMIN">Admin</MenuItem>
              <MenuItem value="SUPERVISOR">Supervisor</MenuItem>
              <MenuItem value="OPERATOR">Operator</MenuItem>
              <MenuItem value="VIEWER">Viewer</MenuItem>
            </TextField>
            <TextField
              label="Access Type"
              select
              value={form.access_type}
              onChange={(e) => setForm({ ...form, access_type: e.target.value })}
              sx={inputSx}
            >
              <MenuItem value="PLATFORM">Platform Only</MenuItem>
              <MenuItem value="VENDING">Vending Only</MenuItem>
              <MenuItem value="BOTH">Both</MenuItem>
            </TextField>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)} sx={{ color: "rgba(255,255,255,0.4)", textTransform: "none" }}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={formLoading}
            variant="contained"
            sx={{
              background: "linear-gradient(135deg, #4cceac 0%, #2e7c67 100%)",
              color: "#040509",
              fontWeight: 700,
              textTransform: "none",
              "&:hover": { background: "linear-gradient(135deg, #70d8bd 0%, #3da58a 100%)" },
            }}
          >
            {formLoading ? <CircularProgress size={20} sx={{ color: "#040509" }} /> : editingId ? "Update" : "Create"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ====== DELETE CONFIRMATION ====== */}
      <Dialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        PaperProps={{
          sx: { background: "#101624", border: "1px solid rgba(219,79,74,0.3)", borderRadius: "12px" },
        }}
      >
        <DialogTitle sx={{ color: "#db4f4a", fontWeight: 700 }}>Confirm Deletion</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: "rgba(255,255,255,0.6)" }}>
            Are you sure you want to permanently delete this user? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteConfirm(null)} sx={{ color: "rgba(255,255,255,0.4)", textTransform: "none" }}>Cancel</Button>
          <Button
            onClick={() => handleDelete(deleteConfirm)}
            variant="contained"
            sx={{ backgroundColor: "#db4f4a", color: "#fff", textTransform: "none", "&:hover": { backgroundColor: "#c0392b" } }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* ====== PASSWORD RESET DIALOG ====== */}
      <Dialog
        open={!!pwDialog}
        onClose={() => setPwDialog(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: { background: "#101624", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px" },
        }}
      >
        <DialogTitle sx={{ color: "#fff", fontWeight: 700 }}>Reset Password</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="New Password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            sx={{ ...inputSx, mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setPwDialog(null)} sx={{ color: "rgba(255,255,255,0.4)", textTransform: "none" }}>Cancel</Button>
          <Button
            onClick={handleResetPassword}
            variant="contained"
            sx={{
              background: "linear-gradient(135deg, #4cceac 0%, #2e7c67 100%)",
              color: "#040509",
              fontWeight: 700,
              textTransform: "none",
            }}
          >
            Reset
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
