import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableContainer,
  useTheme,
  Avatar,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  Alert,
} from "@mui/material";
import {
  StorefrontOutlined,
  PersonOutlined,
  PhoneOutlined,
  AccessTimeOutlined,
  PercentOutlined,
  AddOutlined,
  EditOutlined,
  DeleteOutlined,
  RefreshOutlined,
  ReceiptLongOutlined,
  VpnKeyOutlined,
  ContentCopyOutlined,
  CheckCircleOutlined,
  RadioButtonUncheckedOutlined,
} from "@mui/icons-material";
import { tokens } from "../theme";
import Header from "../components/Header";
import { vendingAPI } from "../services/api";

const fmtCurrency = (n) =>
  `N$ ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt = (n) => Number(n).toLocaleString();

function formatDateTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("en-NA", { year: "numeric", month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString("en-NA", { hour: "2-digit", minute: "2-digit" });
}

function getInitials(name) {
  return name.split(" ").map((w) => w[0]).join("").substring(0, 2).toUpperCase();
}

const vendorColors = ["#6870fa", "#4cceac", "#f2b705", "#db4f4a", "#a4a9fc", "#70d8bd"];
const emptyForm = { name: "", location: "", commissionRate: "1.5", operatorName: "", operatorPhone: "" };

export default function Vendors() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState({ open: false, mode: "add", id: null });
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, id: null, name: "" });
  const [apiKeyDialog, setApiKeyDialog] = useState({ open: false, vendor: null, apiKey: "", apiSecret: "", loading: false });
  const [copied, setCopied] = useState("");

  const loadVendors = useCallback(async () => {
    setLoading(true);
    try {
      const r = await vendingAPI.getVendors();
      if (r.success) setVendors(r.data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { loadVendors(); }, [loadVendors]);

  const openAdd = () => {
    setForm(emptyForm);
    setError(null);
    setDialog({ open: true, mode: "add", id: null });
  };

  const openEdit = (v) => {
    setForm({
      name: v.name || "",
      location: v.location || "",
      commissionRate: String(v.commissionRate || "1.5"),
      operatorName: v.operatorName || "",
      operatorPhone: v.operatorPhone || "",
    });
    setError(null);
    setDialog({ open: true, mode: "edit", id: v.id });
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError("Vendor name is required"); return; }
    setSaving(true);
    setError(null);
    try {
      if (dialog.mode === "add") {
        await vendingAPI.createVendor({
          name: form.name.trim(),
          location: form.location.trim(),
          commissionRate: Number(form.commissionRate) || 1.5,
          operatorName: form.operatorName.trim(),
          operatorPhone: form.operatorPhone.trim(),
        });
      } else {
        await vendingAPI.updateVendor(dialog.id, {
          name: form.name.trim(),
          location: form.location.trim(),
          commissionRate: Number(form.commissionRate) || 1.5,
          operatorName: form.operatorName.trim(),
          operatorPhone: form.operatorPhone.trim(),
        });
      }
      setDialog({ open: false, mode: "add", id: null });
      loadVendors();
    } catch (e) {
      setError(e.message || "Failed to save vendor");
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    try {
      await vendingAPI.deleteVendor(deleteConfirm.id);
      setDeleteConfirm({ open: false, id: null, name: "" });
      loadVendors();
    } catch (e) {
      alert(e.message || "Failed to delete vendor");
    }
  };

  const handleGenerateApiKey = async (vendor) => {
    setApiKeyDialog({ open: true, vendor, apiKey: "", apiSecret: "", loading: true });
    try {
      const r = await vendingAPI.generateVendorApiKey(vendor.id);
      if (r.success) {
        setApiKeyDialog((prev) => ({ ...prev, apiKey: r.data.apiKey, apiSecret: r.data.apiSecret, loading: false }));
        loadVendors();
      }
    } catch (e) {
      setApiKeyDialog((prev) => ({ ...prev, loading: false }));
      alert(e.message || "Failed to generate API key");
    }
  };

  const handleActivateApi = async (vendor, env) => {
    try {
      await vendingAPI.activateVendorApi(vendor.id, env);
      loadVendors();
    } catch (e) { alert(e.message || "Failed to activate"); }
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 2000);
  };

  const totalSales = vendors.reduce((s, v) => s + Number(v.totalSales || 0), 0);

  const headerCellSx = {
    color: colors.grey[100],
    fontWeight: 700,
    fontSize: "0.78rem",
    borderBottom: `1px solid ${colors.grey[700]}`,
    whiteSpace: "nowrap",
  };

  const bodyCellSx = {
    color: colors.grey[200],
    borderBottom: `1px solid ${colors.grey[800]}`,
    fontSize: "0.85rem",
  };

  const inputSx = {
    "& .MuiInputBase-root": { color: colors.grey[100] },
    "& .MuiInputLabel-root": { color: colors.grey[300] },
    "& .MuiOutlinedInput-notchedOutline": { borderColor: colors.grey[700] },
  };

  if (loading) {
    return (
      <Box m="20px" display="flex" justifyContent="center" alignItems="center" height="60vh">
        <CircularProgress sx={{ color: colors.greenAccent[500] }} />
      </Box>
    );
  }

  return (
    <Box m="20px">
      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Header title="VENDORS" subtitle="Vending Point Operators & Commission Management" />
        <Box display="flex" gap="8px">
          <IconButton onClick={loadVendors} sx={{ color: colors.grey[300] }}>
            <RefreshOutlined />
          </IconButton>
          <Button
            variant="contained"
            startIcon={<AddOutlined />}
            onClick={openAdd}
            sx={{
              backgroundColor: colors.greenAccent[500],
              color: "#000",
              fontWeight: 600,
              textTransform: "none",
              borderRadius: "8px",
              "&:hover": { backgroundColor: colors.greenAccent[600] },
            }}
          >
            Add Vendor
          </Button>
        </Box>
      </Box>

      {/* ═══════════ VENDOR DIRECTORY TABLE ═══════════ */}
      <Box
        sx={{
          backgroundColor: colors.primary[400],
          borderRadius: "8px",
          overflow: "hidden",
          mb: "20px",
        }}
      >
        <Box display="flex" justifyContent="space-between" alignItems="center" p="16px 20px"
          borderBottom={`1px solid ${colors.grey[800]}`}>
          <Box display="flex" alignItems="center" gap="8px">
            <StorefrontOutlined sx={{ color: colors.blueAccent[400], fontSize: 20 }} />
            <Typography variant="h6" fontWeight="600" color={colors.grey[100]}>
              Vendor Directory
            </Typography>
          </Box>
          <Chip label={`${vendors.length} vendor${vendors.length !== 1 ? "s" : ""}`} size="small"
            sx={{ bgcolor: `${colors.blueAccent[500]}15`, color: colors.blueAccent[400], fontWeight: 600, fontSize: "0.7rem" }} />
        </Box>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                {["Vendor", "Location", "Status", "API Key", "Total Sales", "Transactions", "Balance", "Commission", "Operator", "Phone", "Last Activity", "Actions"].map((h) => (
                  <TableCell key={h} sx={{ ...headerCellSx, ...(["Total Sales", "Transactions", "Balance"].includes(h) ? { textAlign: "right" } : {}), ...(h === "Commission" ? { textAlign: "center" } : {}) }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {vendors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} sx={{ textAlign: "center", color: colors.grey[500], py: 6 }}>
                    No vendors yet. Click "Add Vendor" to create one.
                  </TableCell>
                </TableRow>
              ) : vendors.map((v, idx) => (
                <TableRow key={v.id} hover>
                  <TableCell sx={{ ...bodyCellSx, fontWeight: 600 }}>
                    <Box display="flex" alignItems="center" gap="8px">
                      <Avatar sx={{ width: 28, height: 28, bgcolor: `${vendorColors[idx % vendorColors.length]}25`, fontSize: "0.65rem", fontWeight: 700, color: vendorColors[idx % vendorColors.length] }}>
                        {getInitials(v.name)}
                      </Avatar>
                      {v.name}
                    </Box>
                  </TableCell>
                  <TableCell sx={bodyCellSx}>{v.location || "-"}</TableCell>
                  <TableCell sx={bodyCellSx}>
                    <Chip label={v.status || "Active"} size="small" sx={{
                      backgroundColor: v.status === "Active" ? `${colors.greenAccent[500]}22` : `${colors.redAccent[500]}22`,
                      color: v.status === "Active" ? colors.greenAccent[400] : colors.redAccent[400],
                      fontWeight: 600, fontSize: "0.72rem",
                    }} />
                  </TableCell>
                  <TableCell sx={bodyCellSx}>
                    {v.apiKey ? (
                      <Box display="flex" alignItems="center" gap="4px">
                        <Chip
                          icon={<CheckCircleOutlined sx={{ fontSize: 14 }} />}
                          label={v.apiEnvironment || "Sandbox"}
                          size="small"
                          sx={{
                            backgroundColor: v.apiEnvironment === "Production" ? `${colors.greenAccent[500]}22` : `${colors.blueAccent[500]}22`,
                            color: v.apiEnvironment === "Production" ? colors.greenAccent[400] : colors.blueAccent[400],
                            fontWeight: 600, fontSize: "0.68rem",
                          }}
                        />
                        <IconButton size="small" onClick={() => setApiKeyDialog({ open: true, vendor: v, apiKey: v.apiKey, apiSecret: v.apiSecret || "", loading: false })}
                          sx={{ color: colors.grey[400] }} title="View API Key">
                          <VpnKeyOutlined sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Box>
                    ) : (
                      <Button size="small" startIcon={<VpnKeyOutlined sx={{ fontSize: 14 }} />}
                        onClick={() => handleGenerateApiKey(v)}
                        sx={{ color: colors.blueAccent[400], textTransform: "none", fontSize: "0.72rem", fontWeight: 600, p: "2px 8px", minWidth: 0 }}>
                        Generate
                      </Button>
                    )}
                  </TableCell>
                  <TableCell align="right" sx={{ ...bodyCellSx, color: colors.greenAccent[400], fontWeight: 600 }}>
                    {fmtCurrency(v.totalSales || 0)}
                  </TableCell>
                  <TableCell align="right" sx={bodyCellSx}>{fmt(v.transactionCount || 0)}</TableCell>
                  <TableCell align="right" sx={bodyCellSx}>{fmtCurrency(v.balance || 0)}</TableCell>
                  <TableCell align="center" sx={{ ...bodyCellSx, color: colors.yellowAccent[400], fontWeight: 600 }}>
                    {v.commissionRate || 0}%
                  </TableCell>
                  <TableCell sx={bodyCellSx}>
                    <Box display="flex" alignItems="center" gap="4px">
                      <PersonOutlined sx={{ fontSize: 15, color: colors.grey[400] }} />
                      {v.operatorName || "-"}
                    </Box>
                  </TableCell>
                  <TableCell sx={bodyCellSx}>
                    <Box display="flex" alignItems="center" gap="4px">
                      <PhoneOutlined sx={{ fontSize: 15, color: colors.grey[400] }} />
                      {v.operatorPhone || "-"}
                    </Box>
                  </TableCell>
                  <TableCell sx={{ ...bodyCellSx, whiteSpace: "nowrap" }}>
                    <Box display="flex" alignItems="center" gap="4px">
                      <AccessTimeOutlined sx={{ fontSize: 15, color: colors.grey[400] }} />
                      {formatDateTime(v.lastActivity)}
                    </Box>
                  </TableCell>
                  <TableCell sx={bodyCellSx}>
                    <Box display="flex" gap="4px">
                      <IconButton size="small" onClick={() => openEdit(v)} sx={{ color: colors.blueAccent[400] }}>
                        <EditOutlined sx={{ fontSize: 18 }} />
                      </IconButton>
                      <IconButton size="small" onClick={() => setDeleteConfirm({ open: true, id: v.id, name: v.name })} sx={{ color: colors.redAccent[400] }}>
                        <DeleteOutlined sx={{ fontSize: 18 }} />
                      </IconButton>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* ═══════════ COMMISSION SUMMARY ═══════════ */}
      {vendors.length > 0 && (
        <Box sx={{ backgroundColor: colors.primary[400], borderRadius: "8px", overflow: "hidden" }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" p="16px 20px"
            borderBottom={`1px solid ${colors.grey[800]}`}>
            <Box display="flex" alignItems="center" gap="8px">
              <PercentOutlined sx={{ color: colors.yellowAccent[400], fontSize: 20 }} />
              <Typography variant="h6" fontWeight="600" color={colors.grey[100]}>
                Commission Summary
              </Typography>
            </Box>
          </Box>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={headerCellSx}>Vendor</TableCell>
                  <TableCell sx={headerCellSx} align="center">Rate</TableCell>
                  <TableCell sx={headerCellSx} align="right">Gross Sales</TableCell>
                  <TableCell sx={headerCellSx} align="right">Commission Earned</TableCell>
                  <TableCell sx={headerCellSx} align="right">Net to Utility</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {vendors.map((v) => {
                  const commAmt = (v.totalSales || 0) * ((v.commissionRate || 0) / 100);
                  const net = (v.totalSales || 0) - commAmt;
                  return (
                    <TableRow key={v.id} hover>
                      <TableCell sx={{ ...bodyCellSx, fontWeight: 600 }}>{v.name}</TableCell>
                      <TableCell sx={{ ...bodyCellSx, color: colors.yellowAccent[400] }} align="center">
                        {v.commissionRate || 0}%
                      </TableCell>
                      <TableCell sx={bodyCellSx} align="right">{fmtCurrency(v.totalSales || 0)}</TableCell>
                      <TableCell sx={{ ...bodyCellSx, color: colors.yellowAccent[400], fontWeight: 600 }} align="right">
                        {fmtCurrency(commAmt)}
                      </TableCell>
                      <TableCell sx={{ ...bodyCellSx, color: colors.greenAccent[400], fontWeight: 600 }} align="right">
                        {fmtCurrency(net)}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow sx={{ backgroundColor: `${colors.primary[500]}88` }}>
                  <TableCell sx={{ ...bodyCellSx, fontWeight: 700, color: colors.grey[100], borderBottom: "none" }}>TOTAL</TableCell>
                  <TableCell sx={{ borderBottom: "none" }} />
                  <TableCell sx={{ ...bodyCellSx, fontWeight: 700, color: colors.grey[100], borderBottom: "none" }} align="right">
                    {fmtCurrency(totalSales)}
                  </TableCell>
                  <TableCell sx={{ ...bodyCellSx, fontWeight: 700, color: colors.yellowAccent[400], borderBottom: "none" }} align="right">
                    {fmtCurrency(vendors.reduce((s, v) => s + (v.totalSales || 0) * ((v.commissionRate || 0) / 100), 0))}
                  </TableCell>
                  <TableCell sx={{ ...bodyCellSx, fontWeight: 700, color: colors.greenAccent[400], borderBottom: "none" }} align="right">
                    {fmtCurrency(vendors.reduce((s, v) => s + ((v.totalSales || 0) - (v.totalSales || 0) * ((v.commissionRate || 0) / 100)), 0))}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* ═══════════ ADD / EDIT VENDOR DIALOG ═══════════ */}
      <Dialog open={dialog.open} onClose={() => setDialog({ open: false, mode: "add", id: null })} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ backgroundColor: colors.primary[400], color: colors.grey[100] }}>
          {dialog.mode === "add" ? "Add New Vendor" : "Edit Vendor"}
        </DialogTitle>
        <DialogContent sx={{ backgroundColor: colors.primary[400] }}>
          {error && <Alert severity="error" sx={{ mt: 1, mb: 1 }}>{error}</Alert>}
          <TextField label="Vendor Name *" fullWidth value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            sx={{ mt: 2, ...inputSx }} />
          <TextField label="Location" fullWidth value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            sx={{ mt: 2, ...inputSx }} />
          <TextField label="Commission Rate (%)" fullWidth type="number" value={form.commissionRate}
            onChange={(e) => setForm({ ...form, commissionRate: e.target.value })}
            inputProps={{ step: "0.1", min: "0", max: "100" }}
            sx={{ mt: 2, ...inputSx }} />
          <TextField label="Operator Name" fullWidth value={form.operatorName}
            onChange={(e) => setForm({ ...form, operatorName: e.target.value })}
            sx={{ mt: 2, ...inputSx }} />
          <TextField label="Operator Phone" fullWidth value={form.operatorPhone}
            onChange={(e) => setForm({ ...form, operatorPhone: e.target.value })}
            sx={{ mt: 2, ...inputSx }} />
        </DialogContent>
        <DialogActions sx={{ backgroundColor: colors.primary[400], px: 3, pb: 2 }}>
          <Button onClick={() => setDialog({ open: false, mode: "add", id: null })} sx={{ color: colors.grey[300] }}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} variant="contained"
            sx={{ backgroundColor: colors.greenAccent[500], color: "#000", fontWeight: 600, "&:hover": { backgroundColor: colors.greenAccent[600] } }}>
            {saving ? <CircularProgress size={20} /> : dialog.mode === "add" ? "Add Vendor" : "Save Changes"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ═══════════ DELETE CONFIRM DIALOG ═══════════ */}
      <Dialog open={deleteConfirm.open} onClose={() => setDeleteConfirm({ open: false, id: null, name: "" })} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ backgroundColor: colors.primary[400], color: colors.grey[100] }}>
          Delete Vendor
        </DialogTitle>
        <DialogContent sx={{ backgroundColor: colors.primary[400] }}>
          <Typography color={colors.grey[300]} mt={1}>
            Are you sure you want to delete <strong>{deleteConfirm.name}</strong>? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ backgroundColor: colors.primary[400] }}>
          <Button onClick={() => setDeleteConfirm({ open: false, id: null, name: "" })} sx={{ color: colors.grey[300] }}>Cancel</Button>
          <Button onClick={handleDelete} variant="contained"
            sx={{ backgroundColor: colors.redAccent[500], color: "#fff", "&:hover": { backgroundColor: colors.redAccent[600] } }}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* ═══════════ API KEY DIALOG ═══════════ */}
      <Dialog open={apiKeyDialog.open} onClose={() => setApiKeyDialog({ open: false, vendor: null, apiKey: "", apiSecret: "", loading: false })} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ backgroundColor: colors.primary[400], color: colors.grey[100], display: "flex", alignItems: "center", gap: "8px" }}>
          <VpnKeyOutlined sx={{ color: colors.blueAccent[400] }} />
          API Credentials {apiKeyDialog.vendor ? `- ${apiKeyDialog.vendor.name}` : ""}
        </DialogTitle>
        <DialogContent sx={{ backgroundColor: colors.primary[400] }}>
          {apiKeyDialog.loading ? (
            <Box display="flex" justifyContent="center" py={4}>
              <CircularProgress sx={{ color: colors.greenAccent[500] }} />
            </Box>
          ) : (
            <Box mt={2}>
              <Alert severity="info" sx={{ mb: 2, "& .MuiAlert-message": { color: "#1a202c" } }}>
                Store these credentials securely. The API secret is only shown once during generation.
              </Alert>

              <Typography variant="body2" color={colors.grey[400]} mb={0.5}>API Key</Typography>
              <Box display="flex" alignItems="center" gap="8px" mb={2}
                sx={{ backgroundColor: colors.primary[500], borderRadius: "6px", p: "10px 14px", border: `1px solid ${colors.grey[700]}` }}>
                <Typography variant="body2" sx={{ color: colors.greenAccent[400], fontFamily: "monospace", fontSize: "0.82rem", flex: 1, wordBreak: "break-all" }}>
                  {apiKeyDialog.apiKey || "-"}
                </Typography>
                {apiKeyDialog.apiKey && (
                  <IconButton size="small" onClick={() => copyToClipboard(apiKeyDialog.apiKey, "key")}
                    sx={{ color: copied === "key" ? colors.greenAccent[400] : colors.grey[400] }}>
                    {copied === "key" ? <CheckCircleOutlined sx={{ fontSize: 18 }} /> : <ContentCopyOutlined sx={{ fontSize: 18 }} />}
                  </IconButton>
                )}
              </Box>

              {apiKeyDialog.apiSecret && (
                <>
                  <Typography variant="body2" color={colors.grey[400]} mb={0.5}>API Secret</Typography>
                  <Box display="flex" alignItems="center" gap="8px" mb={2}
                    sx={{ backgroundColor: colors.primary[500], borderRadius: "6px", p: "10px 14px", border: `1px solid ${colors.grey[700]}` }}>
                    <Typography variant="body2" sx={{ color: colors.yellowAccent[400], fontFamily: "monospace", fontSize: "0.82rem", flex: 1, wordBreak: "break-all" }}>
                      {apiKeyDialog.apiSecret}
                    </Typography>
                    <IconButton size="small" onClick={() => copyToClipboard(apiKeyDialog.apiSecret, "secret")}
                      sx={{ color: copied === "secret" ? colors.greenAccent[400] : colors.grey[400] }}>
                      {copied === "secret" ? <CheckCircleOutlined sx={{ fontSize: 18 }} /> : <ContentCopyOutlined sx={{ fontSize: 18 }} />}
                    </IconButton>
                  </Box>
                </>
              )}

              {apiKeyDialog.vendor && (
                <Box display="flex" alignItems="center" gap="12px" mt={2}>
                  <Typography variant="body2" color={colors.grey[400]}>Environment:</Typography>
                  <Chip
                    label={apiKeyDialog.vendor.apiEnvironment || "Sandbox"}
                    size="small"
                    sx={{
                      backgroundColor: (apiKeyDialog.vendor.apiEnvironment === "Production") ? `${colors.greenAccent[500]}22` : `${colors.blueAccent[500]}22`,
                      color: (apiKeyDialog.vendor.apiEnvironment === "Production") ? colors.greenAccent[400] : colors.blueAccent[400],
                      fontWeight: 600,
                    }}
                  />
                  {apiKeyDialog.vendor.apiEnvironment !== "Production" && apiKeyDialog.vendor.apiKey && (
                    <Button size="small" variant="outlined"
                      onClick={() => { handleActivateApi(apiKeyDialog.vendor, "Production"); setApiKeyDialog((prev) => ({ ...prev, open: false })); }}
                      sx={{ color: colors.greenAccent[400], borderColor: colors.greenAccent[500], textTransform: "none", fontSize: "0.75rem" }}>
                      Activate Production
                    </Button>
                  )}
                </Box>
              )}

              <Box mt={3} p="12px" sx={{ backgroundColor: `${colors.blueAccent[500]}10`, borderRadius: "6px", border: `1px solid ${colors.blueAccent[500]}30` }}>
                <Typography variant="body2" color={colors.grey[300]} fontWeight={600} mb={1}>Usage</Typography>
                <Typography variant="body2" color={colors.grey[400]} sx={{ fontFamily: "monospace", fontSize: "0.78rem" }}>
                  curl -X POST https://gridx-meters.com/cb/integration/external/vend \{"\n"}
                  {"  "}-H "X-Api-Key: {apiKeyDialog.apiKey ? apiKeyDialog.apiKey.substring(0, 12) + "..." : "gx_..."}" \{"\n"}
                  {"  "}-H "Content-Type: application/json" \{"\n"}
                  {"  "}-d '{"{"}\"meterNo\":\"04040512001\",\"amount\":500{"}"}'
                </Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ backgroundColor: colors.primary[400], px: 3, pb: 2 }}>
          {apiKeyDialog.vendor && apiKeyDialog.vendor.apiKey && (
            <Button size="small" onClick={() => handleGenerateApiKey(apiKeyDialog.vendor)}
              sx={{ color: colors.yellowAccent[400], textTransform: "none", mr: "auto" }}>
              Regenerate Keys
            </Button>
          )}
          <Button onClick={() => setApiKeyDialog({ open: false, vendor: null, apiKey: "", apiSecret: "", loading: false })}
            sx={{ color: colors.grey[300] }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
