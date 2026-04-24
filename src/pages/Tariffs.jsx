import { useState, useEffect, useCallback } from "react";
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Chip,
  CircularProgress,
  useTheme,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from "@mui/material";
import {
  SaveOutlined,
  AddOutlined,
  DeleteOutline,
  DeleteOutlined,
  SendOutlined,
  EditOutlined,
  ScheduleOutlined,
  ElectricBoltOutlined,
} from "@mui/icons-material";
import { tokens } from "../theme";
import Header from "../components/Header";
import { vendingAPI, postpaidAPI } from "../services/api";
import {
  tariffGroups as mockTariffGroups,
  tariffConfig as mockTariffConfig,
} from "../services/mockData";

const blockColors = ["#4cceac", "#00b4d8", "#f2b705", "#db4f4a", "#9b59b6", "#e67e22", "#1abc9c", "#e74c3c", "#3498db", "#2ecc71"];
const periodColors = { peak: "#db4f4a", standard: "#f2b705", "off-peak": "#4cceac" };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
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
  const [applyLoading, setApplyLoading] = useState(false);

  // Config state (shared between prepaid and ECB tabs)
  const [config, setConfig] = useState({
    vatRate: mockTariffConfig.vatRate,
    fixedCharge: mockTariffConfig.fixedCharge,
    relLevy: mockTariffConfig.relLevy,
    ecbLevy: mockTariffConfig.ecbLevy ?? 0.0212,
    nefLevy: mockTariffConfig.nefLevy ?? 0.0160,
    laSurcharge: mockTariffConfig.laSurcharge ?? 0.1200,
    minPurchase: mockTariffConfig.minPurchase,
  });

  // ECB Tariff Groups state
  const [selectedTab, setSelectedTab] = useState(0);
  const [tariffGroups, setTariffGroups] = useState(mockTariffGroups);
  const [touSchedule, setTouSchedule] = useState([]);
  const [touDialogOpen, setTouDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editGroup, setEditGroup] = useState(null);
  const [newGroup, setNewGroup] = useState({
    name: "", sgc: "", description: "", type: "Flat", flatRate: 2.45, effectiveDate: "",
    blocks: [{ name: "All Usage", rangeLabel: "0+ kWh", rate: 2.45, minKwh: 0, maxKwh: 999999, period: null }],
  });

  // Postpaid state
  const [postpaidTariffs, setPostpaidTariffs] = useState([]);
  const [tariffDialog, setTariffDialog] = useState({ open: false, data: null });
  const [deleteId, setDeleteId] = useState(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [prepaidRes, configRes, postpaidRes, groupsRes] = await Promise.all([
        postpaidAPI.getPrepaidTariffRates().catch(() => null),
        vendingAPI.getTariffConfig().catch(() => null),
        postpaidAPI.getPostpaidTariffs().catch(() => ({ tariffs: [] })),
        vendingAPI.getTariffGroups().catch(() => null),
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
          ecbLevy: configRes.data.ecbLevy ?? 0.0212,
          nefLevy: configRes.data.nefLevy ?? 0.0160,
          laSurcharge: configRes.data.laSurcharge ?? 0.1200,
          minPurchase: configRes.data.minPurchase ?? mockTariffConfig.minPurchase,
        });
      }
      setPostpaidTariffs(postpaidRes.tariffs || []);
      if (groupsRes?.success && groupsRes.data?.length > 0) setTariffGroups(groupsRes.data);
    } catch (err) {
      console.error("Tariff load error:", err);
    }
    setLoading(false);
  };

  const handleChange = (field) => (e) => {
    setConfig((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSaveConfig = async () => {
    try {
      await vendingAPI.updateTariffConfig(config);
      setSnackbar({ open: true, message: "System configuration saved", severity: "success" });
    } catch (err) {
      setSnackbar({ open: true, message: err.message || "Save failed", severity: "error" });
    }
  };

  // ─── Prepaid handlers ───
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

  // ─── ECB Tariff Group handlers ───
  const selectedGroup = tariffGroups[selectedTab] || tariffGroups[0];

  const handleDeleteGroup = async (id) => {
    if (!window.confirm("Delete this tariff group? This cannot be undone.")) return;
    try {
      await vendingAPI.deleteTariffGroup(id);
      setSnackbar({ open: true, message: "Tariff group deleted", severity: "success" });
      loadData();
      setSelectedTab(0);
    } catch (err) {
      setSnackbar({ open: true, message: err.message, severity: "error" });
    }
  };

  const handleCreateGroup = async () => {
    try {
      const payload = { ...newGroup };
      if (payload.type === "Flat") {
        payload.blocks = [{ name: "All Usage", rangeLabel: "0+ kWh", rate: parseFloat(payload.flatRate), minKwh: 0, maxKwh: 999999 }];
      }
      await vendingAPI.createTariffGroup(payload);
      setSnackbar({ open: true, message: "Tariff group created", severity: "success" });
      setAddDialogOpen(false);
      setNewGroup({ name: "", sgc: "", description: "", type: "Flat", flatRate: 2.45, effectiveDate: "", blocks: [{ name: "All Usage", rangeLabel: "0+ kWh", rate: 2.45, minKwh: 0, maxKwh: 999999, period: null }] });
      loadData();
    } catch (err) {
      setSnackbar({ open: true, message: err.message, severity: "error" });
    }
  };

  const handleUpdateGroup = async () => {
    if (!editGroup) return;
    try {
      await vendingAPI.updateTariffGroup(editGroup.id, editGroup);
      setSnackbar({ open: true, message: "Tariff group updated", severity: "success" });
      setEditDialogOpen(false);
      loadData();
    } catch (err) {
      setSnackbar({ open: true, message: err.message, severity: "error" });
    }
  };

  const handleOpenTOU = async () => {
    if (!selectedGroup?.id) return;
    try {
      const r = await vendingAPI.getTOUSchedule(selectedGroup.id);
      if (r.success) setTouSchedule(r.data || []);
    } catch { setTouSchedule([]); }
    setTouDialogOpen(true);
  };

  const handleSaveTOU = async () => {
    try {
      await vendingAPI.updateTOUSchedule(selectedGroup.id, touSchedule);
      setSnackbar({ open: true, message: "TOU schedule saved", severity: "success" });
      setTouDialogOpen(false);
    } catch (err) {
      setSnackbar({ open: true, message: err.message, severity: "error" });
    }
  };

  const toggleTOUCell = (day, hour) => {
    setTouSchedule((prev) => {
      const existing = prev.find((s) => s.dayOfWeek === day && s.startHour <= hour && s.endHour > hour);
      if (existing) {
        const currentPeriod = existing.period;
        const nextPeriod = currentPeriod === "off-peak" ? "standard" : currentPeriod === "standard" ? "peak" : "off-peak";
        return prev.map((s) =>
          s.dayOfWeek === day && s.startHour <= hour && s.endHour > hour ? { ...s, period: nextPeriod } : s
        );
      }
      return [...prev, { tariffGroupId: selectedGroup.id, dayOfWeek: day, startHour: hour, endHour: hour + 1, period: "off-peak" }];
    });
  };

  const getTOUPeriod = (day, hour) => {
    const entry = touSchedule.find((s) => s.dayOfWeek === day && s.startHour <= hour && s.endHour > hour);
    return entry ? entry.period : null;
  };

  const handlePushToAll = async () => {
    if (!selectedGroup?.name) return;
    if (!window.confirm(`Push "${selectedGroup.name}" tariff config to ALL assigned meters?`)) return;
    try {
      const r = await vendingAPI.pushTariffToAll(selectedGroup.name);
      setSnackbar({ open: true, message: `Pushed to ${r.pushed || 0}/${r.total || 0} meters`, severity: "success" });
    } catch (err) {
      setSnackbar({ open: true, message: err.message, severity: "error" });
    }
  };

  const applyWindhoekPreset = () => {
    const preset = [];
    for (let d = 1; d <= 5; d++) {
      [[0,6,"off-peak"],[6,8,"standard"],[8,11,"peak"],[11,17,"standard"],[17,20,"peak"],[20,22,"standard"],[22,24,"off-peak"]].forEach(([s,e,p]) => {
        preset.push({ tariffGroupId: selectedGroup.id, dayOfWeek: d, startHour: s, endHour: e, period: p });
      });
    }
    [0, 6].forEach((d) => {
      preset.push({ tariffGroupId: selectedGroup.id, dayOfWeek: d, startHour: 0, endHour: 24, period: "off-peak" });
    });
    setTouSchedule(preset);
  };

  // ─── Postpaid handlers ───
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
      <Header title="TARIFF MANAGEMENT" subtitle="Prepaid, Postpaid and ECB Tariff Configuration" />

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
        <Tab label="ECB Tariff Groups" />
        <Tab label="Postpaid Tariff Setting" />
      </Tabs>

      {/* ═══════════ TAB 0: PREPAID TARIFF ═══════════ */}
      {mainTab === 0 && (
        <Box display="grid" gridTemplateColumns="repeat(12, 1fr)" gridAutoRows="140px" gap="5px">
          <Box gridColumn="span 4" gridRow="span 2" backgroundColor={colors.primary[400]} borderRadius="4px" p="20px"
            display="flex" flexDirection="column" justifyContent="space-between">
            <Typography variant="h5" color={colors.grey[100]} fontWeight="bold" mb="10px">
              System Configuration
            </Typography>
            <Box display="flex" flexDirection="column" gap="12px" flex="1">
              <TextField label="VAT Rate (%)" type="number" size="small" fullWidth value={config.vatRate} onChange={handleChange("vatRate")} />
              <TextField label="Fixed Charge (N$)" type="number" size="small" fullWidth value={config.fixedCharge} onChange={handleChange("fixedCharge")} />
              <TextField label="REL Levy (N$)" type="number" size="small" fullWidth value={config.relLevy} onChange={handleChange("relLevy")} />
              <TextField label="Min Purchase (N$)" type="number" size="small" fullWidth value={config.minPurchase} onChange={handleChange("minPurchase")} />
            </Box>
            <Button variant="contained" startIcon={<SaveOutlined />} onClick={handleSaveConfig}
              sx={{ mt: "10px", backgroundColor: colors.greenAccent[500], color: "#000", fontWeight: 600, "&:hover": { backgroundColor: colors.greenAccent[600] } }}>
              Save Configuration
            </Button>
          </Box>

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
                        <TextField type="number" size="small" value={rate}
                          onChange={(e) => { const u = [...prepaidRates]; u[i] = Number(e.target.value); setPrepaidRates(u); }}
                          inputProps={{ step: 0.01, min: 0, style: { textAlign: "right", width: 80 } }}
                          sx={{ "& .MuiInputBase-root": { color: blockColors[i] } }} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </Box>
      )}

      {/* ═══════════ TAB 1: ECB TARIFF GROUPS (Windhoek 2024) ═══════════ */}
      {mainTab === 1 && (
        <Box display="grid" gridTemplateColumns="repeat(12, 1fr)" gridAutoRows="140px" gap="5px">
          <Box gridColumn="span 4" gridRow="span 3" backgroundColor={colors.primary[400]}
            borderRadius="4px" p="20px" display="flex" flexDirection="column" justifyContent="space-between">
            <Typography variant="h5" color={colors.grey[100]} fontWeight="bold" mb="10px">
              System Configuration
            </Typography>
            <Box display="flex" flexDirection="column" gap="10px" flex="1" overflow="auto">
              <TextField label="VAT Rate (%)" type="number" size="small" fullWidth value={config.vatRate} onChange={handleChange("vatRate")} />
              <TextField label="Fixed Charge (N$)" type="number" size="small" fullWidth value={config.fixedCharge} onChange={handleChange("fixedCharge")} />
              <TextField label="REL Levy (N$)" type="number" size="small" fullWidth value={config.relLevy} onChange={handleChange("relLevy")} />
              <Typography variant="subtitle2" color={colors.greenAccent[500]} mt="4px">
                Regulatory Levies (per kWh)
              </Typography>
              <TextField label="ECB Levy (N$/kWh)" type="number" size="small" fullWidth value={config.ecbLevy} onChange={handleChange("ecbLevy")} inputProps={{ step: 0.0001 }} />
              <TextField label="NEF Levy (N$/kWh)" type="number" size="small" fullWidth value={config.nefLevy} onChange={handleChange("nefLevy")} inputProps={{ step: 0.0001 }} />
              <TextField label="LA Surcharge (N$/kWh)" type="number" size="small" fullWidth value={config.laSurcharge} onChange={handleChange("laSurcharge")} inputProps={{ step: 0.0001 }} />
              <TextField label="Min Purchase (N$)" type="number" size="small" fullWidth value={config.minPurchase} onChange={handleChange("minPurchase")} />
            </Box>
            <Button variant="contained" startIcon={<SaveOutlined />} onClick={handleSaveConfig}
              sx={{ mt: "10px", backgroundColor: colors.greenAccent[500], color: "#000", fontWeight: 600, "&:hover": { backgroundColor: colors.greenAccent[600] } }}>
              Save Configuration
            </Button>
          </Box>

          <Box gridColumn="span 8" gridRow="span 3" backgroundColor={colors.primary[400]}
            borderRadius="4px" p="20px" display="flex" flexDirection="column">
            <Box display="flex" justifyContent="space-between" alignItems="center" mb="10px">
              <Typography variant="h5" color={colors.grey[100]} fontWeight="bold">
                Tariff Groups (Windhoek 2024)
              </Typography>
              <Button size="small" startIcon={<AddOutlined />} onClick={() => setAddDialogOpen(true)}
                sx={{ color: colors.greenAccent[500], textTransform: "none" }}>
                Add Group
              </Button>
            </Box>

            <Tabs value={selectedTab} onChange={(_, v) => setSelectedTab(v)} variant="scrollable" scrollButtons="auto"
              sx={{
                mb: "10px",
                "& .MuiTab-root": { color: colors.grey[300], textTransform: "none", fontWeight: 600, fontSize: "0.75rem", minWidth: "auto", "&.Mui-selected": { color: colors.greenAccent[500] } },
                "& .MuiTabs-indicator": { backgroundColor: colors.greenAccent[500] },
              }}>
              {tariffGroups.map((g) => (
                <Tab key={g.id} label={g.name} />
              ))}
            </Tabs>

            {selectedGroup && (
              <Box flex="1" overflow="auto">
                <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb="8px">
                  <Box>
                    <Typography variant="h6" color={colors.grey[100]} fontWeight="bold">{selectedGroup.name}</Typography>
                    <Typography variant="body2" color={colors.grey[300]}>{selectedGroup.description}</Typography>
                  </Box>
                  <Box textAlign="right">
                    <Typography variant="body2" color={colors.greenAccent[500]} fontWeight="600">SGC: {selectedGroup.sgc}</Typography>
                    <Typography variant="body2" color={colors.grey[400]}>{Number(selectedGroup.customerCount || 0).toLocaleString()} meters</Typography>
                  </Box>
                </Box>

                <Box display="flex" gap="8px" alignItems="center" flexWrap="wrap" mb="8px">
                  <Chip size="small" label={selectedGroup.type === "Block" ? "Block Tariff" : selectedGroup.type === "Flat" ? "Flat Rate" : "Time-of-Use"}
                    sx={{ backgroundColor: `${selectedGroup.type === "TOU" ? "#db4f4a" : colors.blueAccent[500]}22`,
                      color: selectedGroup.type === "TOU" ? "#db4f4a" : colors.blueAccent[500], fontWeight: 600 }} />
                  <Chip size="small" label={selectedGroup.billingType || "prepaid"}
                    sx={{ backgroundColor: selectedGroup.billingType === "postpaid" ? "#f2b70522" : "#4cceac22",
                      color: selectedGroup.billingType === "postpaid" ? "#f2b705" : "#4cceac", fontWeight: 600 }} />
                  {selectedGroup.capacityCharge > 0 && (
                    <Chip size="small" label={`Capacity: N$${Number(selectedGroup.capacityCharge).toFixed(2)}/Amp`} sx={{ backgroundColor: "#00b4d822", color: "#00b4d8", fontWeight: 600 }} />
                  )}
                  {selectedGroup.demandCharge > 0 && (
                    <Chip size="small" label={`Demand: N$${Number(selectedGroup.demandCharge).toFixed(2)}/kVA`} sx={{ backgroundColor: "#9b59b622", color: "#9b59b6", fontWeight: 600 }} />
                  )}
                  {selectedGroup.networkAccessCharge > 0 && (
                    <Chip size="small" label={`Network: N$${Number(selectedGroup.networkAccessCharge).toFixed(2)}/kVA`} sx={{ backgroundColor: "#e67e2222", color: "#e67e22", fontWeight: 600 }} />
                  )}
                  <Typography variant="caption" color={colors.grey[400]}>
                    Effective: {selectedGroup.effectiveDate ? new Date(selectedGroup.effectiveDate).toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" }) : "N/A"}
                  </Typography>
                </Box>

                <Box display="flex" gap="8px" mt="8px">
                  <Button size="small" startIcon={<EditOutlined />}
                    onClick={() => { setEditGroup({ ...selectedGroup }); setEditDialogOpen(true); }}
                    sx={{ color: colors.blueAccent[500], textTransform: "none", fontSize: "0.75rem" }}>Edit</Button>
                  {selectedGroup.type === "TOU" && (
                    <Button size="small" startIcon={<ScheduleOutlined />} onClick={handleOpenTOU}
                      sx={{ color: colors.greenAccent[500], textTransform: "none", fontSize: "0.75rem" }}>TOU Schedule</Button>
                  )}
                  <Button size="small" startIcon={<SendOutlined />} onClick={handlePushToAll}
                    sx={{ color: "#f2b705", textTransform: "none", fontSize: "0.75rem" }}>Push to Meters</Button>
                  <Button size="small" startIcon={<DeleteOutline />} onClick={() => handleDeleteGroup(selectedGroup.id)}
                    sx={{ color: "#db4f4a", textTransform: "none", fontSize: "0.75rem" }}>Delete</Button>
                </Box>
              </Box>
            )}
          </Box>

          <Box gridColumn="span 12" gridRow="span 3" backgroundColor={colors.primary[400]} borderRadius="4px" overflow="auto">
            <Box p="20px" pb="0" display="flex" justifyContent="space-between" alignItems="center">
              <Typography variant="h5" color={colors.grey[100]} fontWeight="bold">
                {selectedGroup?.name} - Rate {selectedGroup?.type === "TOU" ? "Periods" : "Blocks"}
              </Typography>
              {selectedGroup?.type === "TOU" && (
                <Box display="flex" gap="10px">
                  {["peak", "standard", "off-peak"].map((p) => (
                    <Box key={p} display="flex" alignItems="center" gap="4px">
                      <Box sx={{ width: 12, height: 12, borderRadius: "2px", backgroundColor: periodColors[p] }} />
                      <Typography variant="caption" color={colors.grey[300]} textTransform="capitalize">{p}</Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
            <TableContainer sx={{ px: "20px", pb: "20px" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={headerSx}>{selectedGroup?.type === "TOU" ? "Period" : "Block Name"}</TableCell>
                    <TableCell sx={headerSx}>{selectedGroup?.type === "TOU" ? "Time Window" : "Range"}</TableCell>
                    <TableCell align="right" sx={headerSx}>Rate per kWh</TableCell>
                    {selectedGroup?.type === "TOU" && <TableCell align="center" sx={headerSx}>Status</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(selectedGroup?.blocks || []).map((block, idx) => {
                    const color = selectedGroup?.type === "TOU"
                      ? periodColors[block.period] || blockColors[idx % blockColors.length]
                      : blockColors[idx % blockColors.length];
                    return (
                      <TableRow key={idx}>
                        <TableCell sx={cellSx}>
                          <Box display="flex" alignItems="center" gap="10px">
                            <Box sx={{ width: 5, height: 36, borderRadius: "2px", backgroundColor: color, flexShrink: 0 }} />
                            <Typography color={colors.grey[100]} fontWeight="600">{block.name}</Typography>
                          </Box>
                        </TableCell>
                        <TableCell sx={cellSx}>{block.rangeLabel || block.range}</TableCell>
                        <TableCell align="right" sx={{ ...cellSx, color: color, fontWeight: 700, fontSize: "1rem" }}>
                          N$ {Number(block.rate).toFixed(2)}/kWh
                        </TableCell>
                        {selectedGroup?.type === "TOU" && (
                          <TableCell align="center" sx={cellSx}>
                            <Chip size="small" label={block.period?.toUpperCase() || "N/A"}
                              sx={{ backgroundColor: `${color}22`, color: color, fontWeight: 700 }} />
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>

            <Box px="20px" pb="20px">
              <Typography variant="subtitle2" color={colors.grey[300]} mb="6px">
                Regulatory Levy Breakdown (applied per kWh sold)
              </Typography>
              <Box display="flex" gap="20px" flexWrap="wrap">
                <Box>
                  <Typography variant="caption" color={colors.grey[400]}>ECB Levy</Typography>
                  <Typography variant="body2" color={colors.greenAccent[500]} fontWeight="600">N$ {Number(config.ecbLevy).toFixed(4)}/kWh</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color={colors.grey[400]}>NEF Levy</Typography>
                  <Typography variant="body2" color={colors.greenAccent[500]} fontWeight="600">N$ {Number(config.nefLevy).toFixed(4)}/kWh</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color={colors.grey[400]}>LA Surcharge</Typography>
                  <Typography variant="body2" color={colors.greenAccent[500]} fontWeight="600">N$ {Number(config.laSurcharge).toFixed(4)}/kWh</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color={colors.grey[400]}>Total Levies</Typography>
                  <Typography variant="body2" color="#f2b705" fontWeight="600">
                    N$ {(Number(config.ecbLevy) + Number(config.nefLevy) + Number(config.laSurcharge)).toFixed(4)}/kWh
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Box>
        </Box>
      )}

      {/* ═══════════ TAB 2: POSTPAID TARIFF ═══════════ */}
      {mainTab === 2 && (
        <Box>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb="15px">
            <Typography variant="h5" color={colors.grey[100]} fontWeight="bold">Postpaid Tariff Configurations</Typography>
            <Button variant="contained" startIcon={<AddOutlined />}
              onClick={() => setTariffDialog({ open: true, data: { tariff_name: "", tariff_type: "Flat", rate_per_kwh: 2.80, fixed_charge: 8.50, vat_rate: 15.00, is_default: false, description: "", tier_rates: null } })}
              sx={{ backgroundColor: colors.greenAccent[500], color: "#000", fontWeight: 600, "&:hover": { backgroundColor: colors.greenAccent[600] } }}>
              Add Tariff
            </Button>
          </Box>

          {postpaidTariffs.length === 0 ? (
            <Box backgroundColor={colors.primary[400]} borderRadius="4px" p="40px" textAlign="center">
              <ElectricBoltOutlined sx={{ fontSize: 48, color: colors.grey[500], mb: 1 }} />
              <Typography variant="h6" color={colors.grey[300]} mb="10px">No postpaid tariffs configured yet</Typography>
              <Typography variant="body2" color={colors.grey[500]} mb="20px">
                Create a tariff configuration to define rates for postpaid billing.
              </Typography>
              <Button variant="outlined" startIcon={<AddOutlined />}
                onClick={() => setTariffDialog({ open: true, data: { tariff_name: "", tariff_type: "Flat", rate_per_kwh: 2.80, fixed_charge: 8.50, vat_rate: 15.00, is_default: true, description: "", tier_rates: null } })}
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
                        <Typography variant="h6" color={colors.grey[100]} fontWeight="bold">{t.tariff_name}</Typography>
                        {t.is_default && <Chip label="Default" size="small" sx={{ backgroundColor: `${colors.greenAccent[500]}22`, color: colors.greenAccent[500], fontWeight: 600, fontSize: "0.7rem" }} />}
                      </Box>
                      <Chip label={t.tariff_type} size="small" sx={{ backgroundColor: `${colors.blueAccent[500]}22`, color: colors.blueAccent[500], fontWeight: 600, fontSize: "0.7rem" }} />
                    </Box>
                    <Box>
                      <IconButton size="small" onClick={() => setTariffDialog({ open: true, data: { ...t, tier_rates: t.tier_rates ? (typeof t.tier_rates === 'string' ? JSON.parse(t.tier_rates) : t.tier_rates) : null } })} sx={{ color: colors.grey[300] }}>
                        <EditOutlined fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => setDeleteId(t.id)} sx={{ color: colors.redAccent[500] }}>
                        <DeleteOutlined fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>
                  {t.description && <Typography variant="body2" color={colors.grey[400]} mb="12px">{t.description}</Typography>}
                  <Box display="flex" flexDirection="column" gap="8px">
                    {t.tariff_type === "Flat" && (
                      <Box display="flex" justifyContent="space-between">
                        <Typography variant="body2" color={colors.grey[300]}>Rate per kWh</Typography>
                        <Typography variant="body2" color={colors.greenAccent[500]} fontWeight="700">N$ {Number(t.rate_per_kwh).toFixed(4)}</Typography>
                      </Box>
                    )}
                    {t.tariff_type === "Tiered" && t.tier_rates && (
                      <Box>
                        <Typography variant="body2" color={colors.grey[300]} mb="4px">Tiered Rates:</Typography>
                        {(typeof t.tier_rates === 'string' ? JSON.parse(t.tier_rates) : t.tier_rates).map((tier, idx) => (
                          <Box key={idx} display="flex" justifyContent="space-between" px="8px">
                            <Typography variant="caption" color={colors.grey[400]}>{tier.from} - {tier.to || "Unlimited"} kWh</Typography>
                            <Typography variant="caption" color={blockColors[idx]} fontWeight="700">N$ {Number(tier.rate).toFixed(4)}/kWh</Typography>
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

      {/* ─── TOU Schedule Editor Dialog ─── */}
      <Dialog open={touDialogOpen} onClose={() => setTouDialogOpen(false)} maxWidth="lg" fullWidth
        PaperProps={{ sx: { backgroundColor: colors.primary[400], backgroundImage: "none" } }}>
        <DialogTitle sx={{ color: colors.grey[100], fontWeight: 700 }}>
          TOU Schedule Editor - {selectedGroup?.name}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color={colors.grey[300]} mb="10px">
            Click cells to cycle through periods: Off-Peak (green) &rarr; Standard (yellow) &rarr; Peak (red)
          </Typography>
          <Button size="small" onClick={applyWindhoekPreset}
            sx={{ mb: "10px", color: colors.greenAccent[500], textTransform: "none" }}>
            Apply Windhoek 2024 Preset
          </Button>
          <TableContainer>
            <Table size="small" sx={{ tableLayout: "fixed" }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 50, color: colors.grey[100], fontWeight: 700, p: "4px" }}>Day</TableCell>
                  {HOURS.map((h) => (
                    <TableCell key={h} align="center" sx={{ width: 30, color: colors.grey[300], fontWeight: 600, p: "2px", fontSize: "0.65rem" }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {DAYS.map((dayName, dayIdx) => (
                  <TableRow key={dayIdx}>
                    <TableCell sx={{ color: colors.grey[100], fontWeight: 600, p: "4px", fontSize: "0.75rem" }}>{dayName}</TableCell>
                    {HOURS.map((h) => {
                      const period = getTOUPeriod(dayIdx, h);
                      const bg = period ? periodColors[period] : colors.primary[500];
                      return (
                        <TableCell key={h} align="center" onClick={() => toggleTOUCell(dayIdx, h)}
                          sx={{ p: "2px", cursor: "pointer", backgroundColor: bg, border: `1px solid ${colors.primary[400]}`,
                            "&:hover": { opacity: 0.8 }, minWidth: 20, height: 28 }}>
                          <Typography variant="caption" sx={{ fontSize: "0.55rem", color: period ? "#000" : colors.grey[600] }}>
                            {period ? period[0].toUpperCase() : ""}
                          </Typography>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Box display="flex" gap="16px" mt="10px">
            {["peak", "standard", "off-peak"].map((p) => (
              <Box key={p} display="flex" alignItems="center" gap="6px">
                <Box sx={{ width: 16, height: 16, borderRadius: "3px", backgroundColor: periodColors[p] }} />
                <Typography variant="body2" color={colors.grey[300]} textTransform="capitalize">{p}</Typography>
              </Box>
            ))}
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: "16px" }}>
          <Button onClick={() => setTouDialogOpen(false)} sx={{ color: colors.grey[300] }}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveTOU}
            sx={{ backgroundColor: colors.greenAccent[500], color: "#000", fontWeight: 600 }}>Save Schedule</Button>
        </DialogActions>
      </Dialog>

      {/* ─── Edit Group Dialog ─── */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { backgroundColor: colors.primary[400], backgroundImage: "none" } }}>
        <DialogTitle sx={{ color: colors.grey[100], fontWeight: 700 }}>Edit Tariff Group</DialogTitle>
        <DialogContent>
          {editGroup && (
            <Box display="flex" flexDirection="column" gap="12px" mt="10px">
              <TextField label="Name" size="small" fullWidth value={editGroup.name || ""} onChange={(e) => setEditGroup({ ...editGroup, name: e.target.value })} />
              <TextField label="SGC" size="small" fullWidth value={editGroup.sgc || ""} onChange={(e) => setEditGroup({ ...editGroup, sgc: e.target.value })} />
              <TextField label="Description" size="small" fullWidth multiline rows={2} value={editGroup.description || ""} onChange={(e) => setEditGroup({ ...editGroup, description: e.target.value })} />
              <FormControl size="small" fullWidth>
                <InputLabel>Type</InputLabel>
                <Select label="Type" value={editGroup.type || "Block"} onChange={(e) => setEditGroup({ ...editGroup, type: e.target.value })}>
                  <MenuItem value="Block">Block (Inclining)</MenuItem>
                  <MenuItem value="Flat">Flat Rate</MenuItem>
                  <MenuItem value="TOU">Time-of-Use</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel>Billing</InputLabel>
                <Select label="Billing" value={editGroup.billingType || "prepaid"} onChange={(e) => setEditGroup({ ...editGroup, billingType: e.target.value })}>
                  <MenuItem value="prepaid">Prepaid</MenuItem>
                  <MenuItem value="postpaid">Postpaid</MenuItem>
                </Select>
              </FormControl>
              {editGroup.type === "Flat" && (
                <TextField label="Flat Rate (N$/kWh)" type="number" size="small" fullWidth value={editGroup.flatRate || ""} onChange={(e) => setEditGroup({ ...editGroup, flatRate: e.target.value })} />
              )}
              <TextField label="Effective Date" type="date" size="small" fullWidth InputLabelProps={{ shrink: true }}
                value={editGroup.effectiveDate ? editGroup.effectiveDate.substring(0, 10) : ""} onChange={(e) => setEditGroup({ ...editGroup, effectiveDate: e.target.value })} />
              <Typography variant="subtitle2" color={colors.grey[400]} mt="4px">Capacity & Demand Charges</Typography>
              <Box display="flex" gap="8px">
                <TextField label="Capacity (N$/Amp/mo)" type="number" size="small" value={editGroup.capacityCharge ?? ""} inputProps={{ step: 0.1 }}
                  onChange={(e) => setEditGroup({ ...editGroup, capacityCharge: e.target.value || null })} sx={{ flex: 1 }} />
                <TextField label="Demand (N$/kVA/mo)" type="number" size="small" value={editGroup.demandCharge ?? ""} inputProps={{ step: 0.1 }}
                  onChange={(e) => setEditGroup({ ...editGroup, demandCharge: e.target.value || null })} sx={{ flex: 1 }} />
                <TextField label="Network (N$/kVA/mo)" type="number" size="small" value={editGroup.networkAccessCharge ?? ""} inputProps={{ step: 0.1 }}
                  onChange={(e) => setEditGroup({ ...editGroup, networkAccessCharge: e.target.value || null })} sx={{ flex: 1 }} />
              </Box>
              <Typography variant="subtitle2" color={colors.greenAccent[500]} mt="8px">Rate {editGroup.type === "TOU" ? "Periods" : "Blocks"}</Typography>
              {(editGroup.blocks || []).map((block, idx) => (
                <Box key={idx} display="flex" gap="8px" alignItems="center">
                  <TextField size="small" label="Name" value={block.name || ""} sx={{ flex: 2 }}
                    onChange={(e) => { const blocks = [...editGroup.blocks]; blocks[idx] = { ...blocks[idx], name: e.target.value }; setEditGroup({ ...editGroup, blocks }); }} />
                  <TextField size="small" label="Rate" type="number" value={block.rate || ""} sx={{ flex: 1 }}
                    onChange={(e) => { const blocks = [...editGroup.blocks]; blocks[idx] = { ...blocks[idx], rate: parseFloat(e.target.value) }; setEditGroup({ ...editGroup, blocks }); }} />
                  {editGroup.type === "TOU" && (
                    <FormControl size="small" sx={{ flex: 1 }}>
                      <InputLabel>Period</InputLabel>
                      <Select label="Period" value={block.period || ""}
                        onChange={(e) => { const blocks = [...editGroup.blocks]; blocks[idx] = { ...blocks[idx], period: e.target.value }; setEditGroup({ ...editGroup, blocks }); }}>
                        <MenuItem value="peak">Peak</MenuItem>
                        <MenuItem value="standard">Standard</MenuItem>
                        <MenuItem value="off-peak">Off-Peak</MenuItem>
                      </Select>
                    </FormControl>
                  )}
                  {editGroup.type === "Block" && (
                    <>
                      <TextField size="small" label="Min" type="number" value={block.minKwh ?? block.min ?? 0} sx={{ width: 70 }}
                        onChange={(e) => { const blocks = [...editGroup.blocks]; blocks[idx] = { ...blocks[idx], minKwh: parseFloat(e.target.value) }; setEditGroup({ ...editGroup, blocks }); }} />
                      <TextField size="small" label="Max" type="number" value={block.maxKwh ?? block.max ?? 999999} sx={{ width: 80 }}
                        onChange={(e) => { const blocks = [...editGroup.blocks]; blocks[idx] = { ...blocks[idx], maxKwh: parseFloat(e.target.value) }; setEditGroup({ ...editGroup, blocks }); }} />
                    </>
                  )}
                  <IconButton size="small" onClick={() => { const blocks = editGroup.blocks.filter((_, i) => i !== idx); setEditGroup({ ...editGroup, blocks }); }} sx={{ color: "#db4f4a" }}>
                    <DeleteOutline fontSize="small" />
                  </IconButton>
                </Box>
              ))}
              <Button size="small" startIcon={<AddOutlined />}
                onClick={() => {
                  const newBlock = editGroup.type === "TOU"
                    ? { name: "New Period", rangeLabel: "All kWh", rate: 2.0, minKwh: 0, maxKwh: 999999, period: "standard" }
                    : { name: "New Block", rangeLabel: "0+ kWh", rate: 2.0, minKwh: 0, maxKwh: 999999 };
                  setEditGroup({ ...editGroup, blocks: [...(editGroup.blocks || []), newBlock] });
                }}
                sx={{ color: colors.greenAccent[500], textTransform: "none", alignSelf: "flex-start" }}>
                Add {editGroup.type === "TOU" ? "Period" : "Block"}
              </Button>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: "16px" }}>
          <Button onClick={() => setEditDialogOpen(false)} sx={{ color: colors.grey[300] }}>Cancel</Button>
          <Button variant="contained" onClick={handleUpdateGroup} sx={{ backgroundColor: colors.greenAccent[500], color: "#000", fontWeight: 600 }}>Save Changes</Button>
        </DialogActions>
      </Dialog>

      {/* ─── Add Group Dialog ─── */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { backgroundColor: colors.primary[400], backgroundImage: "none" } }}>
        <DialogTitle sx={{ color: colors.grey[100], fontWeight: 700 }}>Create Tariff Group</DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap="12px" mt="10px">
            <TextField label="Name" size="small" fullWidth value={newGroup.name} onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })} />
            <TextField label="SGC" size="small" fullWidth value={newGroup.sgc} onChange={(e) => setNewGroup({ ...newGroup, sgc: e.target.value })} />
            <TextField label="Description" size="small" fullWidth multiline rows={2} value={newGroup.description} onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })} />
            <FormControl size="small" fullWidth>
              <InputLabel>Type</InputLabel>
              <Select label="Type" value={newGroup.type} onChange={(e) => setNewGroup({ ...newGroup, type: e.target.value })}>
                <MenuItem value="Block">Block (Inclining)</MenuItem>
                <MenuItem value="Flat">Flat Rate</MenuItem>
                <MenuItem value="TOU">Time-of-Use</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel>Billing</InputLabel>
              <Select label="Billing" value={newGroup.billingType || "prepaid"} onChange={(e) => setNewGroup({ ...newGroup, billingType: e.target.value })}>
                <MenuItem value="prepaid">Prepaid</MenuItem>
                <MenuItem value="postpaid">Postpaid</MenuItem>
              </Select>
            </FormControl>
            {newGroup.type === "Flat" && (
              <TextField label="Flat Rate (N$/kWh)" type="number" size="small" fullWidth value={newGroup.flatRate} onChange={(e) => setNewGroup({ ...newGroup, flatRate: e.target.value })} />
            )}
            <TextField label="Effective Date" type="date" size="small" fullWidth InputLabelProps={{ shrink: true }}
              value={newGroup.effectiveDate} onChange={(e) => setNewGroup({ ...newGroup, effectiveDate: e.target.value })} />
            <Typography variant="subtitle2" color={colors.grey[400]} mt="4px">Capacity & Demand Charges</Typography>
            <Box display="flex" gap="8px">
              <TextField label="Capacity (N$/Amp)" type="number" size="small" value={newGroup.capacityCharge ?? ""} inputProps={{ step: 0.1 }}
                onChange={(e) => setNewGroup({ ...newGroup, capacityCharge: e.target.value || null })} sx={{ flex: 1 }} />
              <TextField label="Demand (N$/kVA)" type="number" size="small" value={newGroup.demandCharge ?? ""} inputProps={{ step: 0.1 }}
                onChange={(e) => setNewGroup({ ...newGroup, demandCharge: e.target.value || null })} sx={{ flex: 1 }} />
              <TextField label="Network (N$/kVA)" type="number" size="small" value={newGroup.networkAccessCharge ?? ""} inputProps={{ step: 0.1 }}
                onChange={(e) => setNewGroup({ ...newGroup, networkAccessCharge: e.target.value || null })} sx={{ flex: 1 }} />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: "16px" }}>
          <Button onClick={() => setAddDialogOpen(false)} sx={{ color: colors.grey[300] }}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateGroup} sx={{ backgroundColor: colors.greenAccent[500], color: "#000", fontWeight: 600 }}>Create</Button>
        </DialogActions>
      </Dialog>

      {/* ─── Postpaid Tariff Dialog ─── */}
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
                <Select value={tariffDialog.data.tariff_type} label="Tariff Type"
                  onChange={(e) => {
                    const newType = e.target.value;
                    setTariffDialog({ ...tariffDialog, data: { ...tariffDialog.data, tariff_type: newType,
                      tier_rates: newType === "Tiered" && !tariffDialog.data.tier_rates ? [{ from: 0, to: 100, rate: 1.50 }, { from: 101, to: 500, rate: 2.80 }, { from: 501, to: "", rate: 3.50 }] : tariffDialog.data.tier_rates } });
                  }}
                  sx={{ color: colors.grey[100], "& .MuiOutlinedInput-notchedOutline": { borderColor: colors.grey[700] } }}>
                  <MenuItem value="Flat">Flat Rate</MenuItem>
                  <MenuItem value="Tiered">Tiered Rates</MenuItem>
                </Select>
              </FormControl>
              {tariffDialog.data.tariff_type === "Flat" && (
                <TextField label="Rate per kWh (N$)" type="number" fullWidth value={tariffDialog.data.rate_per_kwh}
                  onChange={(e) => setTariffDialog({ ...tariffDialog, data: { ...tariffDialog.data, rate_per_kwh: Number(e.target.value) } })}
                  inputProps={{ step: 0.01, min: 0 }}
                  sx={{ "& .MuiInputBase-root": { color: colors.grey[100] }, "& .MuiInputLabel-root": { color: colors.grey[300] }, "& .MuiOutlinedInput-notchedOutline": { borderColor: colors.grey[700] } }} />
              )}
              {tariffDialog.data.tariff_type === "Tiered" && tariffDialog.data.tier_rates && (
                <Box>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb="8px">
                    <Typography variant="body2" color={colors.grey[300]}>Tier Rates</Typography>
                    <Button size="small" startIcon={<AddOutlined />}
                      onClick={() => { const tiers = [...(tariffDialog.data.tier_rates || [])]; const lastTo = tiers.length > 0 ? (Number(tiers[tiers.length - 1].to) || 0) + 1 : 0; tiers.push({ from: lastTo, to: "", rate: 2.80 }); setTariffDialog({ ...tariffDialog, data: { ...tariffDialog.data, tier_rates: tiers } }); }}
                      sx={{ color: colors.greenAccent[500], fontSize: "0.75rem" }}>Add Tier</Button>
                  </Box>
                  {tariffDialog.data.tier_rates.map((tier, idx) => (
                    <Box key={idx} display="flex" gap="8px" mb="8px" alignItems="center">
                      <TextField label="From (kWh)" type="number" size="small" value={tier.from}
                        onChange={(e) => { const tiers = [...tariffDialog.data.tier_rates]; tiers[idx] = { ...tiers[idx], from: Number(e.target.value) }; setTariffDialog({ ...tariffDialog, data: { ...tariffDialog.data, tier_rates: tiers } }); }}
                        sx={{ flex: 1, "& .MuiInputBase-root": { color: colors.grey[100] }, "& .MuiInputLabel-root": { color: colors.grey[300] }, "& .MuiOutlinedInput-notchedOutline": { borderColor: colors.grey[700] } }} />
                      <TextField label="To (kWh)" type="number" size="small" value={tier.to} placeholder="Unlimited"
                        onChange={(e) => { const tiers = [...tariffDialog.data.tier_rates]; tiers[idx] = { ...tiers[idx], to: e.target.value ? Number(e.target.value) : "" }; setTariffDialog({ ...tariffDialog, data: { ...tariffDialog.data, tier_rates: tiers } }); }}
                        sx={{ flex: 1, "& .MuiInputBase-root": { color: colors.grey[100] }, "& .MuiInputLabel-root": { color: colors.grey[300] }, "& .MuiOutlinedInput-notchedOutline": { borderColor: colors.grey[700] } }} />
                      <TextField label="Rate (N$/kWh)" type="number" size="small" value={tier.rate}
                        onChange={(e) => { const tiers = [...tariffDialog.data.tier_rates]; tiers[idx] = { ...tiers[idx], rate: Number(e.target.value) }; setTariffDialog({ ...tariffDialog, data: { ...tariffDialog.data, tier_rates: tiers } }); }}
                        inputProps={{ step: 0.01, min: 0 }}
                        sx={{ flex: 1, "& .MuiInputBase-root": { color: colors.grey[100] }, "& .MuiInputLabel-root": { color: colors.grey[300] }, "& .MuiOutlinedInput-notchedOutline": { borderColor: colors.grey[700] } }} />
                      {tariffDialog.data.tier_rates.length > 1 && (
                        <IconButton size="small" onClick={() => { const tiers = tariffDialog.data.tier_rates.filter((_, i) => i !== idx); setTariffDialog({ ...tariffDialog, data: { ...tariffDialog.data, tier_rates: tiers } }); }} sx={{ color: colors.redAccent[500] }}>
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
                <input type="checkbox" id="is_default" checked={tariffDialog.data.is_default || false}
                  onChange={(e) => setTariffDialog({ ...tariffDialog, data: { ...tariffDialog.data, is_default: e.target.checked } })} />
                <label htmlFor="is_default" style={{ color: colors.grey[300], cursor: "pointer" }}>Set as default tariff for new postpaid meters</label>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ backgroundColor: colors.primary[400] }}>
          <Button onClick={() => setTariffDialog({ open: false, data: null })} sx={{ color: colors.grey[300] }}>Cancel</Button>
          <Button onClick={handleSavePostpaidTariff} variant="contained" disabled={!tariffDialog.data?.tariff_name}
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
          <Button onClick={handleDeletePostpaidTariff} variant="contained" sx={{ backgroundColor: colors.redAccent[500], color: "#fff" }}>Delete</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })} anchorOrigin={{ vertical: "bottom", horizontal: "right" }}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
