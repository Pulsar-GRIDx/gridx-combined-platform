import { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
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
  Chip,
} from "@mui/material";
import {
  PersonAddOutlined,
  DeleteOutlined,
  RefreshOutlined,
  EngineeringOutlined,
  ContentCopyOutlined,
  VisibilityOutlined,
  VisibilityOffOutlined,
} from "@mui/icons-material";
import Header from "../components/Header";
import { tokens } from "../theme";
import { authAPI } from "../services/api";
import { useAuth } from "../context/AuthContext";

const typeChip = {
  INTERNAL: { bg: "rgba(76,206,172,0.15)", text: "#4cceac", label: "Internal" },
  THIRD_PARTY: { bg: "rgba(255,152,0,0.15)", text: "#ff9800", label: "3rd Party" },
};

const initialForm = {
  FirstName: "",
  LastName: "",
  Username: "",
  Email: "",
  Password: "",
  company_name: "",
  installer_type: "",
};

export default function Installers() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.AccessLevel === "ADMIN";

  const [installers, setInstallers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ ...initialForm });
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [showPasswords, setShowPasswords] = useState({});

  const fetchInstallers = async () => {
    try {
      const res = await authAPI.getAllInstallers();
      if (res?.installers) {
        setInstallers(
          res.installers.map((i) => ({
            id: i.Admin_ID,
            name: `${i.FirstName || ""} ${i.LastName || ""}`.trim() || i.Username,
            email: i.Email,
            username: i.Username,
            companyName: i.company_name || "",
            installerType: i.installer_type || "INTERNAL",
            displayPassword: i.display_password || "***",
            lastLogin: i.lastLoginTime || null,
            isActive: i.IsActive == 1,
          }))
        );
      }
    } catch (err) {
      console.error("Failed to fetch installers:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInstallers();
  }, []);

  const openAddDialog = () => {
    setForm({ ...initialForm });
    setFormError("");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.Email || !form.Username || !form.Password) {
      setFormError("Username, Email, and Password are required");
      return;
    }
    if (!form.company_name) {
      setFormError("Company name is required");
      return;
    }
    if (!form.installer_type) {
      setFormError("Installer type is required");
      return;
    }
    setFormLoading(true);
    setFormError("");
    try {
      await authAPI.signup({
        ...form,
        AccessLevel: "TECHNICIAN",
        access_type: "PLATFORM",
      });
      setStatusMsg("Installer added successfully");
      setDialogOpen(false);
      fetchInstallers();
    } catch (err) {
      setFormError(err.message || "Failed to create installer");
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await authAPI.deleteAdmin(id);
      setStatusMsg("Installer removed");
      setDeleteConfirm(null);
      fetchInstallers();
    } catch (err) {
      setStatusMsg("Delete failed: " + err.message);
      setDeleteConfirm(null);
    }
  };

  const togglePasswordVisibility = (id) => {
    setShowPasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setStatusMsg("Copied to clipboard");
    setTimeout(() => setStatusMsg(""), 2000);
  };

  const inputSx = {
    "& .MuiOutlinedInput-root": {
      "& fieldset": { borderColor: "rgba(255,255,255,0.15)" },
      "&:hover fieldset": { borderColor: "rgba(255,152,0,0.4)" },
    },
    "& .MuiInputLabel-root": { color: colors.grey[400] },
    "& input, & .MuiSelect-select": { color: "#fff" },
  };

  const internalCount = installers.filter((i) => i.installerType === "INTERNAL").length;
  const externalCount = installers.filter((i) => i.installerType === "THIRD_PARTY").length;

  return (
    <Box m="20px">
      <Header
        title="FIELD INSTALLERS"
        subtitle="Manage technicians and engineers for meter commissioning"
      />

      {statusMsg && (
        <Alert
          severity="info"
          onClose={() => setStatusMsg("")}
          sx={{
            mb: 2,
            backgroundColor: "rgba(255,152,0,0.1)",
            border: "1px solid rgba(255,152,0,0.3)",
            color: "#ff9800",
          }}
        >
          {statusMsg}
        </Alert>
      )}

      {/* Summary Cards */}
      <Box display="flex" gap={2} mb={3}>
        <Box
          sx={{
            flex: 1,
            p: 2,
            borderRadius: "12px",
            background: "linear-gradient(135deg, rgba(255,152,0,0.1) 0%, rgba(255,152,0,0.05) 100%)",
            border: "1px solid rgba(255,152,0,0.2)",
          }}
        >
          <Typography variant="h4" fontWeight={700} color="#ff9800">
            {installers.length}
          </Typography>
          <Typography variant="body2" color={colors.grey[300]}>
            Total Installers
          </Typography>
        </Box>
        <Box
          sx={{
            flex: 1,
            p: 2,
            borderRadius: "12px",
            background: "linear-gradient(135deg, rgba(76,206,172,0.1) 0%, rgba(76,206,172,0.05) 100%)",
            border: "1px solid rgba(76,206,172,0.2)",
          }}
        >
          <Typography variant="h4" fontWeight={700} color="#4cceac">
            {internalCount}
          </Typography>
          <Typography variant="body2" color={colors.grey[300]}>
            Internal Personnel
          </Typography>
        </Box>
        <Box
          sx={{
            flex: 1,
            p: 2,
            borderRadius: "12px",
            background: "linear-gradient(135deg, rgba(104,112,250,0.1) 0%, rgba(104,112,250,0.05) 100%)",
            border: "1px solid rgba(104,112,250,0.2)",
          }}
        >
          <Typography variant="h4" fontWeight={700} color="#6870fa">
            {externalCount}
          </Typography>
          <Typography variant="body2" color={colors.grey[300]}>
            Third-Party Installers
          </Typography>
        </Box>
      </Box>

      {/* Installers Table */}
      <Box
        sx={{
          backgroundColor: colors.primary[400],
          borderRadius: "12px",
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          px={3}
          py={2}
          sx={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <Box display="flex" alignItems="center" gap={1}>
            <EngineeringOutlined sx={{ color: "#ff9800", fontSize: 22 }} />
            <Typography variant="h6" color={colors.grey[100]} fontWeight={600}>
              Commissioning App Users
            </Typography>
          </Box>
          <Box display="flex" gap={1}>
            <Tooltip title="Refresh">
              <IconButton
                size="small"
                onClick={() => {
                  setLoading(true);
                  fetchInstallers();
                }}
                sx={{ color: colors.greenAccent[500] }}
              >
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
                  background: "linear-gradient(135deg, #ff9800 0%, #e65100 100%)",
                  "&:hover": {
                    background: "linear-gradient(135deg, #ffb74d 0%, #ff9800 100%)",
                  },
                  textTransform: "none",
                  fontWeight: 600,
                }}
              >
                Add Installer
              </Button>
            )}
          </Box>
        </Box>

        {loading ? (
          <Box display="flex" justifyContent="center" py={6}>
            <CircularProgress sx={{ color: "#ff9800" }} />
          </Box>
        ) : installers.length === 0 ? (
          <Box py={6} textAlign="center">
            <EngineeringOutlined sx={{ fontSize: 48, color: colors.grey[500], mb: 1 }} />
            <Typography color={colors.grey[500]}>
              No installers added yet. Click "Add Installer" to get started.
            </Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {["Name", "Email (Username)", "Password", "Company", "Type", "Actions"].map(
                    (col) => (
                      <TableCell
                        key={col}
                        sx={{
                          color: "#ff9800",
                          fontWeight: 600,
                          fontSize: "0.75rem",
                          borderBottom: "2px solid rgba(255,152,0,0.15)",
                          whiteSpace: "nowrap",
                          px: 3,
                        }}
                      >
                        {col}
                      </TableCell>
                    )
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {installers.map((inst) => {
                  const tc = typeChip[inst.installerType] || typeChip.INTERNAL;
                  const pwVisible = showPasswords[inst.id];
                  return (
                    <TableRow
                      key={inst.id}
                      sx={{
                        "&:hover": { bgcolor: "rgba(255,152,0,0.04)" },
                        "& td": {
                          borderBottom: "1px solid rgba(255,255,255,0.05)",
                          color: colors.grey[100],
                          fontSize: "0.82rem",
                          py: 1.5,
                          px: 3,
                        },
                      }}
                    >
                      <TableCell sx={{ fontWeight: 500 }}>{inst.name}</TableCell>
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={0.5}>
                          <Typography
                            sx={{
                              fontFamily: "monospace",
                              fontSize: "0.8rem",
                              color: colors.grey[200],
                            }}
                          >
                            {inst.email}
                          </Typography>
                          <Tooltip title="Copy email">
                            <IconButton
                              size="small"
                              onClick={() => copyToClipboard(inst.email)}
                              sx={{ color: colors.grey[500], p: "2px" }}
                            >
                              <ContentCopyOutlined sx={{ fontSize: 13 }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={0.5}>
                          <Typography
                            sx={{
                              fontFamily: "monospace",
                              fontSize: "0.8rem",
                              color: pwVisible ? "#ff9800" : colors.grey[400],
                              letterSpacing: pwVisible ? "0px" : "2px",
                            }}
                          >
                            {pwVisible ? inst.displayPassword : "••••••••"}
                          </Typography>
                          <Tooltip title={pwVisible ? "Hide" : "Show"}>
                            <IconButton
                              size="small"
                              onClick={() => togglePasswordVisibility(inst.id)}
                              sx={{ color: colors.grey[500], p: "2px" }}
                            >
                              {pwVisible ? (
                                <VisibilityOffOutlined sx={{ fontSize: 15 }} />
                              ) : (
                                <VisibilityOutlined sx={{ fontSize: 15 }} />
                              )}
                            </IconButton>
                          </Tooltip>
                          {pwVisible && (
                            <Tooltip title="Copy password">
                              <IconButton
                                size="small"
                                onClick={() => copyToClipboard(inst.displayPassword)}
                                sx={{ color: colors.grey[500], p: "2px" }}
                              >
                                <ContentCopyOutlined sx={{ fontSize: 13 }} />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>{inst.companyName}</TableCell>
                      <TableCell>
                        <Chip
                          label={tc.label}
                          size="small"
                          sx={{
                            bgcolor: tc.bg,
                            color: tc.text,
                            fontWeight: 600,
                            fontSize: "0.7rem",
                            height: 22,
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        {isAdmin && (
                          <Tooltip title="Remove Installer">
                            <IconButton
                              size="small"
                              onClick={() => setDeleteConfirm(inst.id)}
                              sx={{ color: "#db4f4a" }}
                            >
                              <DeleteOutlined sx={{ fontSize: 18 }} />
                            </IconButton>
                          </Tooltip>
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

      {/* Add Installer Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            background: "linear-gradient(180deg, #101624 0%, #0c101b 100%)",
            border: "1px solid rgba(255,152,0,0.15)",
            borderRadius: "12px",
          },
        }}
      >
        <DialogTitle sx={{ color: "#ff9800", fontWeight: 700 }}>
          Add New Installer
        </DialogTitle>
        <DialogContent>
          {formError && (
            <Alert
              severity="error"
              sx={{
                mb: 2,
                backgroundColor: "rgba(219,79,74,0.1)",
                border: "1px solid rgba(219,79,74,0.3)",
                color: "#f1b9b7",
              }}
            >
              {formError}
            </Alert>
          )}
          <Typography
            variant="body2"
            sx={{ color: colors.grey[400], mb: 2, fontSize: "0.8rem" }}
          >
            These credentials will be used to log into the commissioning app only. Installers
            cannot access the main dashboard.
          </Typography>
          <Box display="grid" gridTemplateColumns="1fr 1fr" gap={2}>
            <TextField
              label="First Name"
              value={form.FirstName}
              onChange={(e) => setForm({ ...form, FirstName: e.target.value })}
              sx={inputSx}
            />
            <TextField
              label="Last Name"
              value={form.LastName}
              onChange={(e) => setForm({ ...form, LastName: e.target.value })}
              sx={inputSx}
            />
            <TextField
              label="Username"
              value={form.Username}
              onChange={(e) => setForm({ ...form, Username: e.target.value })}
              required
              sx={inputSx}
            />
            <TextField
              label="Email"
              value={form.Email}
              onChange={(e) => setForm({ ...form, Email: e.target.value })}
              required
              sx={inputSx}
            />
            <TextField
              label="Password"
              value={form.Password}
              onChange={(e) => setForm({ ...form, Password: e.target.value })}
              required
              helperText="This password will be visible in the installer list"
              sx={{
                ...inputSx,
                gridColumn: "1 / -1",
                "& .MuiFormHelperText-root": { color: "rgba(255,152,0,0.5)" },
              }}
            />
            <TextField
              label="Company Name"
              value={form.company_name}
              onChange={(e) => setForm({ ...form, company_name: e.target.value })}
              required
              placeholder="e.g. Pulsar Electronic"
              sx={{ ...inputSx, gridColumn: "1 / -1" }}
            />
            <TextField
              label="Installer Type"
              select
              value={form.installer_type}
              onChange={(e) => setForm({ ...form, installer_type: e.target.value })}
              required
              sx={{ ...inputSx, gridColumn: "1 / -1" }}
            >
              <MenuItem value="INTERNAL">Internal Personnel</MenuItem>
              <MenuItem value="THIRD_PARTY">Third-Party Installer</MenuItem>
            </TextField>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setDialogOpen(false)}
            sx={{ color: colors.grey[400], textTransform: "none" }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={formLoading}
            variant="contained"
            sx={{
              background: "linear-gradient(135deg, #ff9800 0%, #e65100 100%)",
              color: "#fff",
              fontWeight: 700,
              textTransform: "none",
              "&:hover": {
                background: "linear-gradient(135deg, #ffb74d 0%, #ff9800 100%)",
              },
            }}
          >
            {formLoading ? <CircularProgress size={20} sx={{ color: "#fff" }} /> : "Add Installer"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        PaperProps={{
          sx: {
            background: "#101624",
            border: "1px solid rgba(219,79,74,0.3)",
            borderRadius: "12px",
          },
        }}
      >
        <DialogTitle sx={{ color: "#db4f4a", fontWeight: 700 }}>
          Remove Installer
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ color: colors.grey[300] }}>
            Are you sure you want to remove this installer? They will no longer be able to access
            the commissioning app.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setDeleteConfirm(null)}
            sx={{ color: colors.grey[400], textTransform: "none" }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => handleDelete(deleteConfirm)}
            variant="contained"
            sx={{
              backgroundColor: "#db4f4a",
              color: "#fff",
              textTransform: "none",
              "&:hover": { backgroundColor: "#c0392b" },
            }}
          >
            Remove
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
