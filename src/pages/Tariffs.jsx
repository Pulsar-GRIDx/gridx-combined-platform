import { useState, useEffect } from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Snackbar,
  Alert,
  useTheme,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Chip,
  CircularProgress,
} from "@mui/material";
import {
  SaveOutlined,
  SendOutlined,
  AddOutlined,
  EditOutlined,
  DeleteOutlined,
  ElectricBoltOutlined,
} from "@mui/icons-material";
import { tokens } from "../theme";
import Header from "../components/Header";
import { vendingAPI, postpaidAPI } from "../services/api";
import { tariffConfig as mockTariffConfig } from "../services/mockData";

const blockColors = ["#4cceac", "#00b4d8", "#f2b705", "#db4f4a", "#9b59b6", "#e67e22", "#1abc9c", "#e74c3c", "#3498db", "#2ecc71"];

const rateLabels = ['Free/Emergency', 'Lifeline', 'Standard', 'Commercial', 'Industrial',
                    'Custom 5', 'Custom 6', 'Custom 7', 'Custom 8', 'Custom 9'];

export default function Tariffs() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const [mainTab, setMainTab] = useState(0);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });
  const [loading, setLoading] = useState(true);

  // Prepaid state
  const [prepaidRates, setPrepaidRates] = useState([0.00, 1.50, 2.80, 3.50, 4.50, 2.80, 2.80, 2.80, 2.80, 2.80]);
  const [prepaidUpdatedAt, setPrepaidUpdatedAt] = useState(null);
  const [config, setConfig] = useState({
    vatRate: mockTariffConfig.vatRate,
    fixedCharge: mockTariffConfig.fixedCharge,
    relLevy: mockTariffConfig.relLevy,
    minPurchase: mockTariffConfig.minPurchase,
  });
  const [applyLoading, setApplyLoading] = useState(false);

  // Postpaid state
  const [postpaidTariffs, setPostpaidTariffs] = useState([]);
  const [tariffDialog, setTariffDialog] = useState({ open: false, data: null });
  const [deleteId, setDeleteId] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [prepaidRes, configRes, postpaidRes] = await Promise.all([
        postpaidAPI.getPrepaidTariffRates().catch(() => null),
        vendingAPI.getTariffConfig().catch(() => null),
        postpaidAPI.getPostpaidTariffs().catch(() => ({ tariffs: [] })),
      ]);

      if (prepaidRes?.rates) {
        setPrepaidRates(prepaidRes.rates.map(r => r.rate));
        setPrepaidUpdatedAt(prepaidRes.updated_at);
      }
      if (configRes?.success && configRes.data) {
        setConfig({
          vatRate: configRes.data.vatRate ?? mockTariffConfig.vatRate,
          fixedCharge: configRes.data.fixedCharge ?? mockTariffConfig.fixedCharge,
          relLevy: configRes.data.relLevy ?? mockTariffConfig.relLevy,
          minPurchase: configRes.data.minPurchase ?? mockTariffConfig.minPurchase,
        });
      }
      setPostpaidTariffs(postpaidRes.tariffs || []);
    } catch (err) {
      console.error("Tariff load error:", err);
    }
    setLoading(false);
  };

  const handleSaveConfig = async () => {
    try {
      await vendingAPI.updateTariffConfig(config);
      setSnackbar({ open: true, message: "System configuration saved", severity: "success" });
    } catch (err) {
      setSnackbar({ open: true, message: err.message || "Save failed", severity: "error" });
    }
  };

  const handleApplyPrepaidRates = async () => {
    setApplyLoading(true);
    try {
      const res = await postpaidAPI.applyPrepaidTariff({ rates: prepaidRates });
      setSnackbar({ open: true, message: res.message || `Tariff rates sent to ${res.sentCount} meters`, severity: "success" });
      loadData();
    } catch (err) {
      setSnackbar({ open: true, message: err.message || "Failed to apply rates", severity: "error" });
    }
    setApplyLoading(false);
  };

  const handleSavePostpaidTariff = async () => {
    try {
      const d = tariffDialog.data;
      await postpaidAPI.savePostpaidTariff(d);
      setTariffDialog({ open: false, data: null });
      setSnackbar({ open: true, message: d.id ? "Tariff updated" : "Tariff created", severity: "success" });
      loadData();
    } catch (err) {
      setSnackbar({ open: true, message: err.message, severity: "error" });
    }
  };

  const handleDeletePostpaidTariff = async () => {
    try {
      await postpaidAPI.deletePostpaidTariff(deleteId);
      setDeleteId(null);
      setSnackbar({ open: true, message: "Tariff deleted", severity: "success" });
      loadData();
    } catch (err) {
      setSnackbar({ open: true, message: err.message, severity: "error" });
    }
  };

  const cellSx = { color: colors.grey[200], borderBottom: `1px solid ${colors.grey[800]}` };
  const headerSx = { color: colors.grey[100], fontWeight: 700, borderBottom: `1px solid ${colors.grey[700]}` };

  if (loading) {
    return (
      <Box m="20px" display="flex" justifyContent="center" alignItems="center" height="60vh">
        <CircularProgress sx={{ color: colors.greenAccent[500] }} />
      </Box>
    );
  }

  return (
    <Box m="20px">
      <Header title="TARIFF MANAGEMENT" subtitle="Prepaid and Postpaid Tariff Configuration" />

      <Tabs
        value={mainTab}
        onChange={(_, v) => setMainTab(v)}
        sx={{
          mb: 2,
          "& .MuiTab-root": { color: colors.grey[300], fontWeight: 600 },
          "& .Mui-selected": { color: colors.greenAccent[500] },
          "& .MuiTabs-indicator": { backgroundColor: colors.greenAccent[500] },
        }}
      >
        <Tab label="Prepaid Tariff Setting" />
        <Tab label="Postpaid Tariff Setting" />
      </Tabs>

      {/* ═══════════ PREPAID TARIFF TAB ═══════════ */}
      {mainTab === 0 && (
        <Box display="grid" gridTemplateColumns="repeat(12, 1fr)" gridAutoRows="140px" gap="5px">
          {/* System Configuration */}
          <Box gridColumn="span 4" gridRow="span 2" backgroundColor={colors.primary[400]} borderRadius="4px" p="20px"
            display="flex" flexDirection="column" justifyContent="space-between">
            <Typography variant="h5" color={colors.grey[100]} fontWeight="bold" mb="10px">
              System Configuration
            </Typography>
            <Box display="flex" flexDirection="column" gap="12px" flex="1">
              <TextField label="VAT Rate (%)" type="number" size="small" fullWidth value={config.vatRate} onChange={(e) => setConfig({ ...config, vatRate: e.target.value })} />
              <TextField label="Fixed Charge (N$)" type="number" size="small" fullWidth value={config.fixedCharge} onChange={(e) => setConfig({ ...config, fixedCharge: e.target.value })} />
              <TextField label="REL Levy (N$)" type="number" size="small" fullWidth value={config.relLevy} onChange={(e) => setConfig({ ...config, relLevy: e.target.value })} />
              <TextField label="Min Purchase (N$)" type="number" size="small" fullWidth value={config.minPurchase} onChange={(e) => setConfig({ ...config, minPurchase: e.target.value })} />
            </Box>
            <Button variant="contained" startIcon={<SaveOutlined />} onClick={handleSaveConfig}
              sx={{ mt: "10px", backgroundColor: colors.greenAccent[500], color: "#000", fontWeight: 600, "&:hover": { backgroundColor: colors.greenAccent[600] } }}>
              Save Configuration
            </Button>
          </Box>

          {/* Tariff Rate Table */}
          <Box gridColumn="span 8" gridRow="span 2" backgroundColor={colors.primary[400]} borderRadius="4px" p="20px"
            display="flex" flexDirection="column">
            <Box display="flex" justifyContent="space-between" alignItems="center" mb="10px">
              <Box>
                <Typography variant="h5" color={colors.grey[100]} fontWeight="bold">
                  Prepaid Tariff Rate Table
                </Typography>
                <Typography variant="caption" color={colors.grey[400]}>
                  10-slot rate table applied to all prepaid meters
                  {prepaidUpdatedAt && ` | Last updated: ${new Date(prepaidUpdatedAt).toLocaleDateString("en-ZA")}`}
                </Typography>
              </Box>
              <Button
                variant="contained"
                startIcon={applyLoading ? <CircularProgress size={16} sx={{ color: "#000" }} /> : <SendOutlined />}
                disabled={applyLoading}
                onClick={handleApplyPrepaidRates}
                sx={{ backgroundColor: colors.blueAccent[500], color: "#000", fontWeight: 600,
                  "&:hover": { backgroundColor: colors.blueAccent[600] } }}
              >
                Apply to All Prepaid Meters
              </Button>
            </Box>
            <TableContainer sx={{ flex: 1, overflow: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={headerSx}>Index</TableCell>
                    <TableCell sx={headerSx}>Tier Name</TableCell>
                    <TableCell align="right" sx={headerSx}>Rate (N$/kWh)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {prepaidRates.map((rate, i) => (
                    <TableRow key={i} hover>
                      <TableCell sx={cellSx}>
                        <Box display="flex" alignItems="center" gap="8px">
                          <Box sx={{ width: 5, height: 28, borderRadius: "2px", backgroundColor: blockColors[i], flexShrink: 0 }} />
                          {i}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ ...cellSx, fontWeight: 600 }}>{rateLabels[i]}</TableCell>
                      <TableCell align="right" sx={cellSx}>
                        <TextField
                          type="number"
                          size="small"
                          value={rate}
                          onChange={(e) => {
                            const updated = [...prepaidRates];
                            updated[i] = Number(e.target.value);
                            setPrepaidRates(updated);
                          }}
                          inputProps={{ step: 0.01, min: 0, style: { textAlign: "right", width: 80 } }}
                          sx={{ "& .MuiInputBase-root": { color: blockColors[i] } }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </Box>
      )}

      {/* ═══════════ POSTPAID TARIFF TAB ═══════════ */}
      {mainTab === 1 && (
        <Box>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb="15px">
            <Typography variant="h5" color={colors.grey[100]} fontWeight="bold">
              Postpaid Tariff Configurations
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddOutlined />}
              onClick={() => setTariffDialog({
                open: true,
                data: { tariff_name: "", tariff_type: "Flat", rate_per_kwh: 2.80, fixed_charge: 8.50, vat_rate: 15.00, is_default: false, description: "", tier_rates: null }
              })}
              sx={{ backgroundColor: colors.greenAccent[500], color: "#000", fontWeight: 600,
                "&:hover": { backgroundColor: colors.greenAccent[600] } }}
            >
              Add Tariff
            </Button>
          </Box>

          {postpaidTariffs.length === 0 ? (
            <Box backgroundColor={colors.primary[400]} borderRadius="4px" p="40px" textAlign="center">
              <ElectricBoltOutlined sx={{ fontSize: 48, color: colors.grey[500], mb: 1 }} />
              <Typography variant="h6" color={colors.grey[300]} mb="10px">
                No postpaid tariffs configured yet
              </Typography>
              <Typography variant="body2" color={colors.grey[500]} mb="20px">
                Create a tariff configuration to define rates for postpaid billing.
                You can set a single flat rate or configure tiered pricing.
              </Typography>
              <Button variant="outlined" startIcon={<AddOutlined />}
                onClick={() => setTariffDialog({
                  open: true,
                  data: { tariff_name: "", tariff_type: "Flat", rate_per_kwh: 2.80, fixed_charge: 8.50, vat_rate: 15.00, is_default: true, description: "", tier_rates: null }
                })}
                sx={{ color: colors.greenAccent[500], borderColor: colors.greenAccent[500] }}>
                Create First Tariff
              </Button>
            </Box>
          ) : (
            <Box display="grid" gridTemplateColumns="repeat(auto-fill, minmax(350px, 1fr))" gap="15px">
              {postpaidTariffs.map((t) => (
                <Box key={t.id} backgroundColor={colors.primary[400]} borderRadius="4px" p="20px"
                  sx={{ border: t.is_default ? `2px solid ${colors.greenAccent[500]}` : "none" }}>
                  <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb="12px">
                    <Box>
                      <Box display="flex" alignItems="center" gap="8px" mb="4px">
                        <Typography variant="h6" color={colors.grey[100]} fontWeight="bold">
                          {t.tariff_name}
                        </Typography>
                        {t.is_default ? (
                          <Chip label="Default" size="small" sx={{ backgroundColor: `${colors.greenAccent[500]}22`, color: colors.greenAccent[500], fontWeight: 600, fontSize: "0.7rem" }} />
                        ) : null}
                      </Box>
                      <Chip label={t.tariff_type} size="small"
                        sx={{ backgroundColor: `${colors.blueAccent[500]}22`, color: colors.blueAccent[500], fontWeight: 600, fontSize: "0.7rem" }} />
                    </Box>
                    <Box>
                      <IconButton size="small" onClick={() => setTariffDialog({ open: true, data: { ...t, tier_rates: t.tier_rates ? (typeof t.tier_rates === 'string' ? JSON.parse(t.tier_rates) : t.tier_rates) : null } })}
                        sx={{ color: colors.grey[300] }}>
                        <EditOutlined fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => setDeleteId(t.id)} sx={{ color: colors.redAccent[500] }}>
                        <DeleteOutlined fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>

                  {t.description && (
                    <Typography variant="body2" color={colors.grey[400]} mb="12px">{t.description}</Typography>
                  )}

                  <Box display="flex" flexDirection="column" gap="8px">
                    {t.tariff_type === "Flat" && (
                      <Box display="flex" justifyContent="space-between">
                        <Typography variant="body2" color={colors.grey[300]}>Rate per kWh</Typography>
                        <Typography variant="body2" color={colors.greenAccent[500]} fontWeight="700">
                          N$ {Number(t.rate_per_kwh).toFixed(4)}
                        </Typography>
                      </Box>
                    )}
                    {t.tariff_type === "Tiered" && t.tier_rates && (
                      <Box>
                        <Typography variant="body2" color={colors.grey[300]} mb="4px">Tiered Rates:</Typography>
                        {(typeof t.tier_rates === 'string' ? JSON.parse(t.tier_rates) : t.tier_rates).map((tier, idx) => (
                          <Box key={idx} display="flex" justifyContent="space-between" px="8px">
                            <Typography variant="caption" color={colors.grey[400]}>
                              {tier.from} - {tier.to || "Unlimited"} kWh
                            </Typography>
                            <Typography variant="caption" color={blockColors[idx]} fontWeight="700">
                              N$ {Number(tier.rate).toFixed(4)}/kWh
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    )}
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="body2" color={colors.grey[300]}>Fixed Charge</Typography>
                      <Typography variant="body2" color={colors.grey[100]}>N$ {Number(t.fixed_charge).toFixed(2)}</Typography>
                    </Box>
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="body2" color={colors.grey[300]}>VAT Rate</Typography>
                      <Typography variant="body2" color={colors.grey[100]}>{Number(t.vat_rate).toFixed(2)}%</Typography>
                    </Box>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      )}

      {/* ═══════════ POSTPAID TARIFF DIALOG ═══════════ */}
      <Dialog open={tariffDialog.open} onClose={() => setTariffDialog({ open: false, data: null })} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ backgroundColor: colors.primary[400], color: colors.grey[100] }}>
          {tariffDialog.data?.id ? "Edit Postpaid Tariff" : "Create Postpaid Tariff"}
        </DialogTitle>
        <DialogContent sx={{ backgroundColor: colors.primary[400] }}>
          {tariffDialog.data && (
            <Box display="flex" flexDirection="column" gap="16px" mt={1}>
              <TextField label="Tariff Name" fullWidth value={tariffDialog.data.tariff_name}
                onChange={(e) => setTariffDialog({ ...tariffDialog, data: { ...tariffDialog.data, tariff_name: e.target.value } })}
                sx={{ "& .MuiInputBase-root": { color: colors.grey[100] }, "& .MuiInputLabel-root": { color: colors.grey[300] }, "& .MuiOutlinedInput-notchedOutline": { borderColor: colors.grey[700] } }} />
              <TextField label="Description" fullWidth multiline rows={2} value={tariffDialog.data.description || ""}
                onChange={(e) => setTariffDialog({ ...tariffDialog, data: { ...tariffDialog.data, description: e.target.value } })}
                sx={{ "& .MuiInputBase-root": { color: colors.grey[100] }, "& .MuiInputLabel-root": { color: colors.grey[300] }, "& .MuiOutlinedInput-notchedOutline": { borderColor: colors.grey[700] } }} />
              <FormControl fullWidth>
                <InputLabel sx={{ color: colors.grey[300] }}>Tariff Type</InputLabel>
                <Select
                  value={tariffDialog.data.tariff_type}
                  label="Tariff Type"
                  onChange={(e) => {
                    const newType = e.target.value;
                    setTariffDialog({
                      ...tariffDialog,
                      data: {
                        ...tariffDialog.data,
                        tariff_type: newType,
                        tier_rates: newType === "Tiered" && !tariffDialog.data.tier_rates
                          ? [{ from: 0, to: 100, rate: 1.50 }, { from: 101, to: 500, rate: 2.80 }, { from: 501, to: "", rate: 3.50 }]
                          : tariffDialog.data.tier_rates,
                      }
                    });
                  }}
                  sx={{ color: colors.grey[100], "& .MuiOutlinedInput-notchedOutline": { borderColor: colors.grey[700] } }}
                >
                  <MenuItem value="Flat">Flat Rate</MenuItem>
                  <MenuItem value="Tiered">Tiered Rates</MenuItem>
                </Select>
              </FormControl>

              {tariffDialog.data.tariff_type === "Flat" && (
                <TextField label="Rate per kWh (N$)" type="number" fullWidth
                  value={tariffDialog.data.rate_per_kwh}
                  onChange={(e) => setTariffDialog({ ...tariffDialog, data: { ...tariffDialog.data, rate_per_kwh: Number(e.target.value) } })}
                  inputProps={{ step: 0.01, min: 0 }}
                  sx={{ "& .MuiInputBase-root": { color: colors.grey[100] }, "& .MuiInputLabel-root": { color: colors.grey[300] }, "& .MuiOutlinedInput-notchedOutline": { borderColor: colors.grey[700] } }} />
              )}

              {tariffDialog.data.tariff_type === "Tiered" && tariffDialog.data.tier_rates && (
                <Box>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb="8px">
                    <Typography variant="body2" color={colors.grey[300]}>Tier Rates</Typography>
                    <Button size="small" startIcon={<AddOutlined />}
                      onClick={() => {
                        const tiers = [...(tariffDialog.data.tier_rates || [])];
                        const lastTo = tiers.length > 0 ? (Number(tiers[tiers.length - 1].to) || 0) + 1 : 0;
                        tiers.push({ from: lastTo, to: "", rate: 2.80 });
                        setTariffDialog({ ...tariffDialog, data: { ...tariffDialog.data, tier_rates: tiers } });
                      }}
                      sx={{ color: colors.greenAccent[500], fontSize: "0.75rem" }}>
                      Add Tier
                    </Button>
                  </Box>
                  {tariffDialog.data.tier_rates.map((tier, idx) => (
                    <Box key={idx} display="flex" gap="8px" mb="8px" alignItems="center">
                      <TextField label="From (kWh)" type="number" size="small" value={tier.from}
                        onChange={(e) => {
                          const tiers = [...tariffDialog.data.tier_rates];
                          tiers[idx] = { ...tiers[idx], from: Number(e.target.value) };
                          setTariffDialog({ ...tariffDialog, data: { ...tariffDialog.data, tier_rates: tiers } });
                        }}
                        sx={{ flex: 1, "& .MuiInputBase-root": { color: colors.grey[100] }, "& .MuiInputLabel-root": { color: colors.grey[300] }, "& .MuiOutlinedInput-notchedOutline": { borderColor: colors.grey[700] } }} />
                      <TextField label="To (kWh)" type="number" size="small" value={tier.to}
                        placeholder="Unlimited"
                        onChange={(e) => {
                          const tiers = [...tariffDialog.data.tier_rates];
                          tiers[idx] = { ...tiers[idx], to: e.target.value ? Number(e.target.value) : "" };
                          setTariffDialog({ ...tariffDialog, data: { ...tariffDialog.data, tier_rates: tiers } });
                        }}
                        sx={{ flex: 1, "& .MuiInputBase-root": { color: colors.grey[100] }, "& .MuiInputLabel-root": { color: colors.grey[300] }, "& .MuiOutlinedInput-notchedOutline": { borderColor: colors.grey[700] } }} />
                      <TextField label="Rate (N$/kWh)" type="number" size="small" value={tier.rate}
                        onChange={(e) => {
                          const tiers = [...tariffDialog.data.tier_rates];
                          tiers[idx] = { ...tiers[idx], rate: Number(e.target.value) };
                          setTariffDialog({ ...tariffDialog, data: { ...tariffDialog.data, tier_rates: tiers } });
                        }}
                        inputProps={{ step: 0.01, min: 0 }}
                        sx={{ flex: 1, "& .MuiInputBase-root": { color: colors.grey[100] }, "& .MuiInputLabel-root": { color: colors.grey[300] }, "& .MuiOutlinedInput-notchedOutline": { borderColor: colors.grey[700] } }} />
                      {tariffDialog.data.tier_rates.length > 1 && (
                        <IconButton size="small" onClick={() => {
                          const tiers = tariffDialog.data.tier_rates.filter((_, i) => i !== idx);
                          setTariffDialog({ ...tariffDialog, data: { ...tariffDialog.data, tier_rates: tiers } });
                        }} sx={{ color: colors.redAccent[500] }}>
                          <DeleteOutlined fontSize="small" />
                        </IconButton>
                      )}
                    </Box>
                  ))}
                </Box>
              )}

              <Box display="flex" gap="16px">
                <TextField label="Fixed Charge (N$)" type="number" fullWidth value={tariffDialog.data.fixed_charge}
                  onChange={(e) => setTariffDialog({ ...tariffDialog, data: { ...tariffDialog.data, fixed_charge: Number(e.target.value) } })}
                  inputProps={{ step: 0.01, min: 0 }}
                  sx={{ "& .MuiInputBase-root": { color: colors.grey[100] }, "& .MuiInputLabel-root": { color: colors.grey[300] }, "& .MuiOutlinedInput-notchedOutline": { borderColor: colors.grey[700] } }} />
                <TextField label="VAT Rate (%)" type="number" fullWidth value={tariffDialog.data.vat_rate}
                  onChange={(e) => setTariffDialog({ ...tariffDialog, data: { ...tariffDialog.data, vat_rate: Number(e.target.value) } })}
                  inputProps={{ step: 0.01, min: 0 }}
                  sx={{ "& .MuiInputBase-root": { color: colors.grey[100] }, "& .MuiInputLabel-root": { color: colors.grey[300] }, "& .MuiOutlinedInput-notchedOutline": { borderColor: colors.grey[700] } }} />
              </Box>

              <Box display="flex" alignItems="center" gap="8px">
                <input type="checkbox" id="is_default"
                  checked={tariffDialog.data.is_default || false}
                  onChange={(e) => setTariffDialog({ ...tariffDialog, data: { ...tariffDialog.data, is_default: e.target.checked } })} />
                <label htmlFor="is_default" style={{ color: colors.grey[300], cursor: "pointer" }}>Set as default tariff for new postpaid meters</label>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ backgroundColor: colors.primary[400] }}>
          <Button onClick={() => setTariffDialog({ open: false, data: null })} sx={{ color: colors.grey[300] }}>Cancel</Button>
          <Button onClick={handleSavePostpaidTariff} variant="contained"
            disabled={!tariffDialog.data?.tariff_name}
            sx={{ backgroundColor: colors.greenAccent[500], color: "#000" }}>
            {tariffDialog.data?.id ? "Update Tariff" : "Create Tariff"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* DELETE CONFIRM */}
      <Dialog open={!!deleteId} onClose={() => setDeleteId(null)} maxWidth="xs">
        <DialogTitle sx={{ backgroundColor: colors.primary[400], color: colors.grey[100] }}>Delete Tariff?</DialogTitle>
        <DialogContent sx={{ backgroundColor: colors.primary[400] }}>
          <Typography color={colors.grey[300]}>This action cannot be undone.</Typography>
        </DialogContent>
        <DialogActions sx={{ backgroundColor: colors.primary[400] }}>
          <Button onClick={() => setDeleteId(null)} sx={{ color: colors.grey[300] }}>Cancel</Button>
          <Button onClick={handleDeletePostpaidTariff} variant="contained"
            sx={{ backgroundColor: colors.redAccent[500], color: "#fff" }}>Delete</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })} anchorOrigin={{ vertical: "bottom", horizontal: "right" }}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
