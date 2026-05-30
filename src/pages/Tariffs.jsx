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
  SendOutlined,
  EditOutlined,
  ScheduleOutlined,
  PeopleOutlined,
  SwapHorizOutlined,
  WifiOutlined,
  WifiOffOutlined,
  HistoryOutlined,
  AssignmentOutlined,
} from "@mui/icons-material";
import { tokens } from "../theme";
import Header from "../components/Header";
import { vendingAPI } from "../services/api";
import {
  tariffGroups as mockTariffGroups,
  tariffConfig as mockTariffConfig,
} from "../services/mockData";

const blockColors = ["#4cceac", "#00b4d8", "#f2b705", "#db4f4a", "#9b59b6", "#e67e22", "#1abc9c", "#e74c3c", "#3498db", "#2ecc71"];
const periodColors = { peak: "#db4f4a", standard: "#f2b705", "off-peak": "#4cceac" };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function Tariffs() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });
  const [loading, setLoading] = useState(true);

  // Config state
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

  // Meters-by-group state
  const [groupMeters, setGroupMeters] = useState([]);
  const [metersLoading, setMetersLoading] = useState(false);
  const [metersVisible, setMetersVisible] = useState(false);
  const [changeTariffDialog, setChangeTariffDialog] = useState({ open: false, drn: null, currentTariff: "" });
  const [changeTariffTarget, setChangeTariffTarget] = useState("");
  const [changeTariffReason, setChangeTariffReason] = useState("");
  const [changeTariffLoading, setChangeTariffLoading] = useState(false);
  const [bulkAssignLoading, setBulkAssignLoading] = useState(false);
  const [tariffHistoryDialog, setTariffHistoryDialog] = useState({ open: false, drn: null, data: [] });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [configRes, groupsRes] = await Promise.all([
        vendingAPI.getTariffConfig().catch(() => null),
        vendingAPI.getTariffGroups().catch(() => null),
      ]);

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

  // ─── Meters by group handlers ───
  const loadGroupMeters = useCallback(async (groupId) => {
    if (!groupId) return;
    setMetersLoading(true);
    try {
      const res = await vendingAPI.getMetersByGroup(groupId);
      setGroupMeters(res.data || []);
    } catch { setGroupMeters([]); }
    setMetersLoading(false);
  }, []);

  useEffect(() => {
    if (metersVisible && selectedGroup?.id) loadGroupMeters(selectedGroup.id);
  }, [selectedGroup?.id, metersVisible, loadGroupMeters]);

  const handleChangeTariff = async () => {
    if (!changeTariffDialog.drn || !changeTariffTarget) return;
    setChangeTariffLoading(true);
    try {
      const res = await vendingAPI.assignTariff(changeTariffDialog.drn, changeTariffTarget, changeTariffReason || "Manual reassignment");
      setSnackbar({ open: true, message: `Tariff changed for ${changeTariffDialog.drn} — MQTT: ${res.mqttStatus || "sent"}`, severity: "success" });
      setChangeTariffDialog({ open: false, drn: null, currentTariff: "" });
      setChangeTariffTarget("");
      setChangeTariffReason("");
      if (selectedGroup?.id) loadGroupMeters(selectedGroup.id);
    } catch (err) {
      setSnackbar({ open: true, message: err.message, severity: "error" });
    }
    setChangeTariffLoading(false);
  };

  const handleBulkAssign = async (tariffName) => {
    if (!window.confirm(`Assign ALL meters in the database to "${tariffName}"?\nThis will update every meter's tariff group and push MQTT commands.`)) return;
    setBulkAssignLoading(true);
    try {
      const res = await vendingAPI.bulkAssignTariff(tariffName);
      setSnackbar({ open: true, message: `Bulk assigned ${res.updated || 0} meters to "${tariffName}" — MQTT pushed: ${res.pushed || 0}`, severity: "success" });
      if (selectedGroup?.id) loadGroupMeters(selectedGroup.id);
    } catch (err) {
      setSnackbar({ open: true, message: err.message, severity: "error" });
    }
    setBulkAssignLoading(false);
  };

  const handleViewTariffHistory = async (drn) => {
    try {
      const res = await vendingAPI.getTariffHistory(drn);
      setTariffHistoryDialog({ open: true, drn, data: res.data || [] });
    } catch { setTariffHistoryDialog({ open: true, drn, data: [] }); }
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
      <Header title="TARIFF MANAGEMENT" subtitle="ECB Tariff Configuration" />

      {/* ═══════════ ECB TARIFF GROUPS (Windhoek 2024) ═══════════ */}
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

          {/* ─── Assigned Meters List ─── */}
          <Box gridColumn="span 12" gridRow="span 4" backgroundColor={colors.primary[400]} borderRadius="4px" overflow="auto">
            <Box p="20px" pb="10px" display="flex" justifyContent="space-between" alignItems="center">
              <Box display="flex" alignItems="center" gap="12px">
                <PeopleOutlined sx={{ color: colors.greenAccent[500] }} />
                <Box>
                  <Typography variant="h5" color={colors.grey[100]} fontWeight="bold">
                    Assigned Meters — {selectedGroup?.name}
                  </Typography>
                  <Typography variant="caption" color={colors.grey[400]}>
                    {groupMeters.length} meter{groupMeters.length !== 1 ? "s" : ""} assigned to this tariff group
                  </Typography>
                </Box>
              </Box>
              <Box display="flex" gap="8px" alignItems="center">
                {selectedGroup?.name?.toLowerCase().includes("commercial") && selectedGroup?.type === "Flat" && (
                  <Button size="small" variant="contained" startIcon={bulkAssignLoading ? <CircularProgress size={14} sx={{ color: "#000" }} /> : <AssignmentOutlined />}
                    disabled={bulkAssignLoading}
                    onClick={() => handleBulkAssign(selectedGroup.name)}
                    sx={{ backgroundColor: "#f2b705", color: "#000", fontWeight: 600, textTransform: "none", fontSize: "0.75rem",
                      "&:hover": { backgroundColor: "#d4a005" } }}>
                    Assign ALL Meters Here
                  </Button>
                )}
                <Button size="small" variant={metersVisible ? "contained" : "outlined"}
                  startIcon={<PeopleOutlined />}
                  onClick={() => setMetersVisible(!metersVisible)}
                  sx={metersVisible
                    ? { backgroundColor: colors.greenAccent[500], color: "#000", fontWeight: 600, textTransform: "none", fontSize: "0.75rem" }
                    : { color: colors.greenAccent[500], borderColor: colors.greenAccent[500], fontWeight: 600, textTransform: "none", fontSize: "0.75rem" }}>
                  {metersVisible ? "Hide Meters" : "View Meters"}
                </Button>
              </Box>
            </Box>
            {metersVisible && (
              <Box px="20px" pb="20px">
                {metersLoading ? (
                  <Box display="flex" justifyContent="center" py="30px">
                    <CircularProgress size={28} sx={{ color: colors.greenAccent[500] }} />
                  </Box>
                ) : groupMeters.length === 0 ? (
                  <Box textAlign="center" py="30px">
                    <Typography color={colors.grey[500]}>No meters assigned to this tariff group</Typography>
                  </Box>
                ) : (
                  <TableContainer sx={{ maxHeight: 420 }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ ...headerSx, backgroundColor: colors.primary[400] }}>DRN</TableCell>
                          <TableCell sx={{ ...headerSx, backgroundColor: colors.primary[400] }}>Customer</TableCell>
                          <TableCell sx={{ ...headerSx, backgroundColor: colors.primary[400] }}>Area</TableCell>
                          <TableCell sx={{ ...headerSx, backgroundColor: colors.primary[400] }}>Billing</TableCell>
                          <TableCell align="right" sx={{ ...headerSx, backgroundColor: colors.primary[400] }}>Credit (kWh)</TableCell>
                          <TableCell align="center" sx={{ ...headerSx, backgroundColor: colors.primary[400] }}>Status</TableCell>
                          <TableCell sx={{ ...headerSx, backgroundColor: colors.primary[400] }}>Last Seen</TableCell>
                          <TableCell align="center" sx={{ ...headerSx, backgroundColor: colors.primary[400] }}>Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {groupMeters.map((m) => (
                          <TableRow key={m.DRN} hover>
                            <TableCell sx={{ ...cellSx, fontWeight: 600, fontFamily: "monospace" }}>{m.DRN}</TableCell>
                            <TableCell sx={cellSx}>{[m.Name, m.Surname].filter(Boolean).join(" ") || "—"}</TableCell>
                            <TableCell sx={cellSx}>{m.City || "—"}</TableCell>
                            <TableCell sx={cellSx}>
                              <Chip size="small" label={m.account_type || "prepaid"}
                                sx={{ backgroundColor: m.account_type === "postpaid" ? "#f2b70522" : "#4cceac22",
                                  color: m.account_type === "postpaid" ? "#f2b705" : "#4cceac", fontWeight: 600, fontSize: "0.7rem" }} />
                            </TableCell>
                            <TableCell align="right" sx={{ ...cellSx, fontWeight: 600, color: colors.greenAccent[500] }}>
                              {m.credit_remaining != null ? Number(m.credit_remaining).toFixed(2) : "—"}
                            </TableCell>
                            <TableCell align="center" sx={cellSx}>
                              <Chip size="small"
                                icon={m.status === "Online" ? <WifiOutlined sx={{ fontSize: 14 }} /> : <WifiOffOutlined sx={{ fontSize: 14 }} />}
                                label={m.status || "Offline"}
                                sx={{ backgroundColor: m.status === "Online" ? "#4cceac22" : "#db4f4a22",
                                  color: m.status === "Online" ? "#4cceac" : "#db4f4a",
                                  fontWeight: 600, fontSize: "0.7rem",
                                  "& .MuiChip-icon": { color: "inherit" } }} />
                            </TableCell>
                            <TableCell sx={{ ...cellSx, fontSize: "0.75rem" }}>
                              {m.last_seen ? new Date(m.last_seen).toLocaleString("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "Never"}
                            </TableCell>
                            <TableCell align="center" sx={cellSx}>
                              <Box display="flex" gap="4px" justifyContent="center">
                                <IconButton size="small" title="Change Tariff"
                                  onClick={() => { setChangeTariffDialog({ open: true, drn: m.DRN, currentTariff: m.assignedTariff || selectedGroup?.name }); setChangeTariffTarget(""); setChangeTariffReason(""); }}
                                  sx={{ color: colors.blueAccent[500] }}>
                                  <SwapHorizOutlined fontSize="small" />
                                </IconButton>
                                <IconButton size="small" title="Tariff History"
                                  onClick={() => handleViewTariffHistory(m.DRN)}
                                  sx={{ color: colors.grey[400] }}>
                                  <HistoryOutlined fontSize="small" />
                                </IconButton>
                              </Box>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Box>
            )}
          </Box>
        </Box>

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

      {/* ─── Change Tariff Dialog ─── */}
      <Dialog open={changeTariffDialog.open} onClose={() => setChangeTariffDialog({ open: false, drn: null, currentTariff: "" })} maxWidth="sm" fullWidth
        PaperProps={{ sx: { backgroundColor: colors.primary[400], backgroundImage: "none" } }}>
        <DialogTitle sx={{ color: colors.grey[100], fontWeight: 700 }}>
          <Box display="flex" alignItems="center" gap="8px">
            <SwapHorizOutlined sx={{ color: colors.blueAccent[500] }} />
            Change Tariff — {changeTariffDialog.drn}
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap="16px" mt="10px">
            <Box backgroundColor={colors.primary[500]} p="12px" borderRadius="4px">
              <Typography variant="caption" color={colors.grey[400]}>Current Tariff</Typography>
              <Typography variant="body1" color={colors.grey[100]} fontWeight="600">{changeTariffDialog.currentTariff}</Typography>
            </Box>
            <FormControl fullWidth size="small">
              <InputLabel>New Tariff Group</InputLabel>
              <Select label="New Tariff Group" value={changeTariffTarget} onChange={(e) => setChangeTariffTarget(e.target.value)}>
                {tariffGroups.filter(g => g.name !== changeTariffDialog.currentTariff).map((g) => (
                  <MenuItem key={g.id} value={g.name}>
                    <Box display="flex" justifyContent="space-between" width="100%" alignItems="center">
                      <span>{g.name}</span>
                      <Chip size="small" label={g.type} sx={{ ml: 1, fontSize: "0.65rem", height: 20 }} />
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField label="Reason (optional)" size="small" fullWidth multiline rows={2} value={changeTariffReason}
              onChange={(e) => setChangeTariffReason(e.target.value)} placeholder="e.g., Customer reclassified to commercial" />
            {changeTariffTarget && (
              <Box backgroundColor="#f2b70511" border="1px solid #f2b70533" p="12px" borderRadius="4px">
                <Typography variant="caption" color="#f2b705" fontWeight="600">
                  This will update the meter's tariff and push new rates via MQTT
                </Typography>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: "16px" }}>
          <Button onClick={() => setChangeTariffDialog({ open: false, drn: null, currentTariff: "" })} sx={{ color: colors.grey[300] }}>Cancel</Button>
          <Button variant="contained" disabled={!changeTariffTarget || changeTariffLoading}
            onClick={handleChangeTariff}
            startIcon={changeTariffLoading ? <CircularProgress size={14} sx={{ color: "#000" }} /> : <SendOutlined />}
            sx={{ backgroundColor: colors.greenAccent[500], color: "#000", fontWeight: 600 }}>
            Assign & Push MQTT
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Tariff History Dialog ─── */}
      <Dialog open={tariffHistoryDialog.open} onClose={() => setTariffHistoryDialog({ open: false, drn: null, data: [] })} maxWidth="md" fullWidth
        PaperProps={{ sx: { backgroundColor: colors.primary[400], backgroundImage: "none" } }}>
        <DialogTitle sx={{ color: colors.grey[100], fontWeight: 700 }}>
          <Box display="flex" alignItems="center" gap="8px">
            <HistoryOutlined sx={{ color: colors.greenAccent[500] }} />
            Tariff History — {tariffHistoryDialog.drn}
          </Box>
        </DialogTitle>
        <DialogContent>
          {tariffHistoryDialog.data.length === 0 ? (
            <Box textAlign="center" py="30px">
              <Typography color={colors.grey[500]}>No tariff change history found</Typography>
            </Box>
          ) : (
            <TableContainer sx={{ mt: 1 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={headerSx}>Date</TableCell>
                    <TableCell sx={headerSx}>Previous</TableCell>
                    <TableCell sx={headerSx}>New</TableCell>
                    <TableCell sx={headerSx}>Changed By</TableCell>
                    <TableCell sx={headerSx}>Reason</TableCell>
                    <TableCell align="center" sx={headerSx}>MQTT</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tariffHistoryDialog.data.map((h, idx) => (
                    <TableRow key={idx}>
                      <TableCell sx={{ ...cellSx, fontSize: "0.8rem" }}>
                        {new Date(h.created_at).toLocaleString("en-ZA", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </TableCell>
                      <TableCell sx={{ ...cellSx, color: "#db4f4a" }}>{h.previousTariff}</TableCell>
                      <TableCell sx={{ ...cellSx, color: colors.greenAccent[500], fontWeight: 600 }}>{h.newTariff}</TableCell>
                      <TableCell sx={cellSx}>{h.changedBy}</TableCell>
                      <TableCell sx={{ ...cellSx, fontSize: "0.8rem" }}>{h.reason}</TableCell>
                      <TableCell align="center" sx={cellSx}>
                        <Chip size="small" label={h.mqttStatus || "—"}
                          sx={{ backgroundColor: h.mqttStatus === "sent" ? "#4cceac22" : h.mqttStatus === "failed" ? "#db4f4a22" : "#f2b70522",
                            color: h.mqttStatus === "sent" ? "#4cceac" : h.mqttStatus === "failed" ? "#db4f4a" : "#f2b705",
                            fontWeight: 600, fontSize: "0.65rem" }} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions sx={{ p: "16px" }}>
          <Button onClick={() => setTariffHistoryDialog({ open: false, drn: null, data: [] })} sx={{ color: colors.grey[300] }}>Close</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })} anchorOrigin={{ vertical: "bottom", horizontal: "right" }}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
