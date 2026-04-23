import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
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
  Switch,
  FormControlLabel,
  Tooltip,
  useTheme,
} from "@mui/material";
import {
  SaveOutlined,
  AddOutlined,
  DeleteOutline,
  SendOutlined,
  EditOutlined,
  ScheduleOutlined,
  ElectricBoltOutlined,
} from "@mui/icons-material";
import { tokens } from "../theme";
import Header from "../components/Header";
import { vendingAPI } from "../services/api";
import {
  tariffGroups as mockTariffGroups,
  tariffConfig as mockTariffConfig,
} from "../services/mockData";

const blockColors = ["#4cceac", "#00b4d8", "#f2b705", "#db4f4a"];
const periodColors = { peak: "#db4f4a", standard: "#f2b705", "off-peak": "#4cceac" };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function Tariffs() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);

  const [selectedTab, setSelectedTab] = useState(0);
  const [tariffGroups, setTariffGroups] = useState(mockTariffGroups);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });
  const [touSchedule, setTouSchedule] = useState([]);
  const [touDialogOpen, setTouDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const [config, setConfig] = useState({
    vatRate: mockTariffConfig.vatRate,
    fixedCharge: mockTariffConfig.fixedCharge,
    relLevy: mockTariffConfig.relLevy,
    ecbLevy: mockTariffConfig.ecbLevy,
    nefLevy: mockTariffConfig.nefLevy,
    laSurcharge: mockTariffConfig.laSurcharge,
    minPurchase: mockTariffConfig.minPurchase,
  });

  const [editGroup, setEditGroup] = useState(null);
  const [newGroup, setNewGroup] = useState({
    name: "", sgc: "", description: "", type: "Flat", flatRate: 2.45, effectiveDate: "",
    blocks: [{ name: "All Usage", rangeLabel: "0+ kWh", rate: 2.45, minKwh: 0, maxKwh: 999999, period: null }],
  });

  const loadData = useCallback(() => {
    vendingAPI.getTariffConfig().then((r) => {
      if (r.success && r.data) {
        setConfig({
          vatRate: r.data.vatRate ?? mockTariffConfig.vatRate,
          fixedCharge: r.data.fixedCharge ?? mockTariffConfig.fixedCharge,
          relLevy: r.data.relLevy ?? mockTariffConfig.relLevy,
          ecbLevy: r.data.ecbLevy ?? mockTariffConfig.ecbLevy,
          nefLevy: r.data.nefLevy ?? mockTariffConfig.nefLevy,
          laSurcharge: r.data.laSurcharge ?? mockTariffConfig.laSurcharge,
          minPurchase: r.data.minPurchase ?? mockTariffConfig.minPurchase,
        });
      }
    }).catch(() => {});
    vendingAPI.getTariffGroups().then((r) => {
      if (r.success && r.data?.length > 0) setTariffGroups(r.data);
    }).catch(() => {});
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const selectedGroup = tariffGroups[selectedTab] || tariffGroups[0];

  const handleChange = (field) => (e) => {
    setConfig((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSaveConfig = async () => {
    try {
      await vendingAPI.updateTariffConfig(config);
      setSnackbar({ open: true, message: "Configuration saved", severity: "success" });
    } catch (err) {
      setSnackbar({ open: true, message: err.message || "Save failed", severity: "error" });
    }
  };

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

  return (
    <Box m="20px">
      <Header title="TARIFF MANAGEMENT" subtitle="Windhoek 2024 ECB-Approved Tariff Configuration" />

      <Box display="grid" gridTemplateColumns="repeat(12, 1fr)" gridAutoRows="140px" gap="5px">
        {/* System config card */}
        <Box
          gridColumn="span 4" gridRow="span 3" backgroundColor={colors.primary[400]}
          borderRadius="4px" p="20px" display="flex" flexDirection="column" justifyContent="space-between"
        >
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
            <TextField label="ECB Levy (N$/kWh)" type="number" size="small" fullWidth value={config.ecbLevy} onChange={handleChange("ecbLevy")}
              inputProps={{ step: 0.0001 }} />
            <TextField label="NEF Levy (N$/kWh)" type="number" size="small" fullWidth value={config.nefLevy} onChange={handleChange("nefLevy")}
              inputProps={{ step: 0.0001 }} />
            <TextField label="LA Surcharge (N$/kWh)" type="number" size="small" fullWidth value={config.laSurcharge} onChange={handleChange("laSurcharge")}
              inputProps={{ step: 0.0001 }} />
            <TextField label="Min Purchase (N$)" type="number" size="small" fullWidth value={config.minPurchase} onChange={handleChange("minPurchase")} />
          </Box>
          <Button variant="contained" startIcon={<SaveOutlined />} onClick={handleSaveConfig}
            sx={{ mt: "10px", backgroundColor: colors.greenAccent[500], color: "#000", fontWeight: 600, "&:hover": { backgroundColor: colors.greenAccent[600] } }}>
            Save Configuration
          </Button>
        </Box>

        {/* Tariff groups tabs */}
        <Box
          gridColumn="span 8" gridRow="span 3" backgroundColor={colors.primary[400]}
          borderRadius="4px" p="20px" display="flex" flexDirection="column"
        >
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

          <Box flex="1" overflow="auto">
            <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb="8px">
              <Box>
                <Typography variant="h6" color={colors.grey[100]} fontWeight="bold">
                  {selectedGroup.name}
                </Typography>
                <Typography variant="body2" color={colors.grey[300]}>
                  {selectedGroup.description}
                </Typography>
              </Box>
              <Box textAlign="right">
                <Typography variant="body2" color={colors.greenAccent[500]} fontWeight="600">
                  SGC: {selectedGroup.sgc}
                </Typography>
                <Typography variant="body2" color={colors.grey[400]}>
                  {Number(selectedGroup.customerCount || 0).toLocaleString()} meters
                </Typography>
              </Box>
            </Box>

            <Box display="flex" gap="8px" alignItems="center" flexWrap="wrap" mb="8px">
              <Chip size="small" label={selectedGroup.type === "Block" ? "Block Tariff" : selectedGroup.type === "Flat" ? "Flat Rate" : "Time-of-Use"}
                sx={{ backgroundColor: `${selectedGroup.type === "TOU" ? colors.redAccent?.[500] || "#db4f4a" : colors.blueAccent[500]}22`,
                  color: selectedGroup.type === "TOU" ? colors.redAccent?.[500] || "#db4f4a" : colors.blueAccent[500], fontWeight: 600 }} />
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
                sx={{ color: colors.blueAccent[500], textTransform: "none", fontSize: "0.75rem" }}>
                Edit
              </Button>
              {selectedGroup.type === "TOU" && (
                <Button size="small" startIcon={<ScheduleOutlined />} onClick={handleOpenTOU}
                  sx={{ color: colors.greenAccent[500], textTransform: "none", fontSize: "0.75rem" }}>
                  TOU Schedule
                </Button>
              )}
              <Button size="small" startIcon={<SendOutlined />} onClick={handlePushToAll}
                sx={{ color: "#f2b705", textTransform: "none", fontSize: "0.75rem" }}>
                Push to Meters
              </Button>
              <Button size="small" startIcon={<DeleteOutline />} onClick={() => handleDeleteGroup(selectedGroup.id)}
                sx={{ color: colors.redAccent?.[500] || "#db4f4a", textTransform: "none", fontSize: "0.75rem" }}>
                Delete
              </Button>
            </Box>
          </Box>
        </Box>

        {/* Rate blocks table */}
        <Box gridColumn="span 12" gridRow="span 3" backgroundColor={colors.primary[400]} borderRadius="4px" overflow="auto">
          <Box p="20px" pb="0" display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h5" color={colors.grey[100]} fontWeight="bold">
              {selectedGroup.name} - Rate {selectedGroup.type === "TOU" ? "Periods" : "Blocks"}
            </Typography>
            {selectedGroup.type === "TOU" && (
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
                  <TableCell sx={{ color: colors.grey[100], fontWeight: 700, borderBottom: `1px solid ${colors.grey[700]}` }}>
                    {selectedGroup.type === "TOU" ? "Period" : "Block Name"}
                  </TableCell>
                  <TableCell sx={{ color: colors.grey[100], fontWeight: 700, borderBottom: `1px solid ${colors.grey[700]}` }}>
                    {selectedGroup.type === "TOU" ? "Time Window" : "Range"}
                  </TableCell>
                  <TableCell align="right" sx={{ color: colors.grey[100], fontWeight: 700, borderBottom: `1px solid ${colors.grey[700]}` }}>
                    Rate per kWh
                  </TableCell>
                  {selectedGroup.type === "TOU" && (
                    <TableCell align="center" sx={{ color: colors.grey[100], fontWeight: 700, borderBottom: `1px solid ${colors.grey[700]}` }}>
                      Status
                    </TableCell>
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {(selectedGroup.blocks || []).map((block, idx) => {
                  const color = selectedGroup.type === "TOU"
                    ? periodColors[block.period] || blockColors[idx % blockColors.length]
                    : blockColors[idx % blockColors.length];
                  return (
                    <TableRow key={idx}>
                      <TableCell sx={{ borderBottom: `1px solid ${colors.grey[800]}` }}>
                        <Box display="flex" alignItems="center" gap="10px">
                          <Box sx={{ width: 5, height: 36, borderRadius: "2px", backgroundColor: color, flexShrink: 0 }} />
                          <Typography color={colors.grey[100]} fontWeight="600">
                            {block.name}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ color: colors.grey[300], borderBottom: `1px solid ${colors.grey[800]}` }}>
                        {block.rangeLabel || block.range}
                      </TableCell>
                      <TableCell align="right" sx={{ color: color, fontWeight: 700, fontSize: "1rem", borderBottom: `1px solid ${colors.grey[800]}` }}>
                        N$ {Number(block.rate).toFixed(2)}/kWh
                      </TableCell>
                      {selectedGroup.type === "TOU" && (
                        <TableCell align="center" sx={{ borderBottom: `1px solid ${colors.grey[800]}` }}>
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

          {/* Levy summary */}
          <Box px="20px" pb="20px">
            <Typography variant="subtitle2" color={colors.grey[300]} mb="6px">
              Regulatory Levy Breakdown (applied per kWh sold)
            </Typography>
            <Box display="flex" gap="20px" flexWrap="wrap">
              <Box>
                <Typography variant="caption" color={colors.grey[400]}>ECB Levy</Typography>
                <Typography variant="body2" color={colors.greenAccent[500]} fontWeight="600">
                  N$ {Number(config.ecbLevy).toFixed(4)}/kWh
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color={colors.grey[400]}>NEF Levy</Typography>
                <Typography variant="body2" color={colors.greenAccent[500]} fontWeight="600">
                  N$ {Number(config.nefLevy).toFixed(4)}/kWh
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color={colors.grey[400]}>LA Surcharge</Typography>
                <Typography variant="body2" color={colors.greenAccent[500]} fontWeight="600">
                  N$ {Number(config.laSurcharge).toFixed(4)}/kWh
                </Typography>
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

      {/* ─── TOU Schedule Editor Dialog ─── */}
      <Dialog open={touDialogOpen} onClose={() => setTouDialogOpen(false)} maxWidth="lg" fullWidth
        PaperProps={{ sx: { backgroundColor: colors.primary[400], backgroundImage: "none" } }}>
        <DialogTitle sx={{ color: colors.grey[100], fontWeight: 700 }}>
          TOU Schedule Editor - {selectedGroup.name}
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
                    <TableCell key={h} align="center" sx={{ width: 30, color: colors.grey[300], fontWeight: 600, p: "2px", fontSize: "0.65rem" }}>
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {DAYS.map((dayName, dayIdx) => (
                  <TableRow key={dayIdx}>
                    <TableCell sx={{ color: colors.grey[100], fontWeight: 600, p: "4px", fontSize: "0.75rem" }}>
                      {dayName}
                    </TableCell>
                    {HOURS.map((h) => {
                      const period = getTOUPeriod(dayIdx, h);
                      const bg = period ? periodColors[period] : colors.primary[500];
                      return (
                        <TableCell key={h} align="center"
                          onClick={() => toggleTOUCell(dayIdx, h)}
                          sx={{
                            p: "2px", cursor: "pointer", backgroundColor: bg,
                            border: `1px solid ${colors.primary[400]}`,
                            "&:hover": { opacity: 0.8 },
                            minWidth: 20, height: 28,
                          }}>
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
            sx={{ backgroundColor: colors.greenAccent[500], color: "#000", fontWeight: 600 }}>
            Save Schedule
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Edit Group Dialog ─── */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { backgroundColor: colors.primary[400], backgroundImage: "none" } }}>
        <DialogTitle sx={{ color: colors.grey[100], fontWeight: 700 }}>Edit Tariff Group</DialogTitle>
        <DialogContent>
          {editGroup && (
            <Box display="flex" flexDirection="column" gap="12px" mt="10px">
              <TextField label="Name" size="small" fullWidth value={editGroup.name || ""}
                onChange={(e) => setEditGroup({ ...editGroup, name: e.target.value })} />
              <TextField label="SGC" size="small" fullWidth value={editGroup.sgc || ""}
                onChange={(e) => setEditGroup({ ...editGroup, sgc: e.target.value })} />
              <TextField label="Description" size="small" fullWidth multiline rows={2} value={editGroup.description || ""}
                onChange={(e) => setEditGroup({ ...editGroup, description: e.target.value })} />
              <FormControl size="small" fullWidth>
                <InputLabel>Type</InputLabel>
                <Select label="Type" value={editGroup.type || "Block"}
                  onChange={(e) => setEditGroup({ ...editGroup, type: e.target.value })}>
                  <MenuItem value="Block">Block (Inclining)</MenuItem>
                  <MenuItem value="Flat">Flat Rate</MenuItem>
                  <MenuItem value="TOU">Time-of-Use</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel>Billing</InputLabel>
                <Select label="Billing" value={editGroup.billingType || "prepaid"}
                  onChange={(e) => setEditGroup({ ...editGroup, billingType: e.target.value })}>
                  <MenuItem value="prepaid">Prepaid</MenuItem>
                  <MenuItem value="postpaid">Postpaid</MenuItem>
                </Select>
              </FormControl>
              {editGroup.type === "Flat" && (
                <TextField label="Flat Rate (N$/kWh)" type="number" size="small" fullWidth
                  value={editGroup.flatRate || ""} onChange={(e) => setEditGroup({ ...editGroup, flatRate: e.target.value })} />
              )}
              <TextField label="Effective Date" type="date" size="small" fullWidth InputLabelProps={{ shrink: true }}
                value={editGroup.effectiveDate ? editGroup.effectiveDate.substring(0, 10) : ""}
                onChange={(e) => setEditGroup({ ...editGroup, effectiveDate: e.target.value })} />
              <Typography variant="subtitle2" color={colors.grey[400]} mt="4px">Capacity & Demand Charges</Typography>
              <Box display="flex" gap="8px">
                <TextField label="Capacity (N$/Amp/mo)" type="number" size="small" value={editGroup.capacityCharge ?? ""} inputProps={{ step: 0.1 }}
                  onChange={(e) => setEditGroup({ ...editGroup, capacityCharge: e.target.value || null })} sx={{ flex: 1 }} />
                <TextField label="Demand (N$/kVA/mo)" type="number" size="small" value={editGroup.demandCharge ?? ""} inputProps={{ step: 0.1 }}
                  onChange={(e) => setEditGroup({ ...editGroup, demandCharge: e.target.value || null })} sx={{ flex: 1 }} />
                <TextField label="Network (N$/kVA/mo)" type="number" size="small" value={editGroup.networkAccessCharge ?? ""} inputProps={{ step: 0.1 }}
                  onChange={(e) => setEditGroup({ ...editGroup, networkAccessCharge: e.target.value || null })} sx={{ flex: 1 }} />
              </Box>

              <Typography variant="subtitle2" color={colors.greenAccent[500]} mt="8px">
                Rate {editGroup.type === "TOU" ? "Periods" : "Blocks"}
              </Typography>
              {(editGroup.blocks || []).map((block, idx) => (
                <Box key={idx} display="flex" gap="8px" alignItems="center">
                  <TextField size="small" label="Name" value={block.name || ""} sx={{ flex: 2 }}
                    onChange={(e) => {
                      const blocks = [...editGroup.blocks];
                      blocks[idx] = { ...blocks[idx], name: e.target.value };
                      setEditGroup({ ...editGroup, blocks });
                    }} />
                  <TextField size="small" label="Rate" type="number" value={block.rate || ""} sx={{ flex: 1 }}
                    onChange={(e) => {
                      const blocks = [...editGroup.blocks];
                      blocks[idx] = { ...blocks[idx], rate: parseFloat(e.target.value) };
                      setEditGroup({ ...editGroup, blocks });
                    }} />
                  {editGroup.type === "TOU" && (
                    <FormControl size="small" sx={{ flex: 1 }}>
                      <InputLabel>Period</InputLabel>
                      <Select label="Period" value={block.period || ""}
                        onChange={(e) => {
                          const blocks = [...editGroup.blocks];
                          blocks[idx] = { ...blocks[idx], period: e.target.value };
                          setEditGroup({ ...editGroup, blocks });
                        }}>
                        <MenuItem value="peak">Peak</MenuItem>
                        <MenuItem value="standard">Standard</MenuItem>
                        <MenuItem value="off-peak">Off-Peak</MenuItem>
                      </Select>
                    </FormControl>
                  )}
                  {editGroup.type === "Block" && (
                    <>
                      <TextField size="small" label="Min" type="number" value={block.minKwh ?? block.min ?? 0} sx={{ width: 70 }}
                        onChange={(e) => {
                          const blocks = [...editGroup.blocks];
                          blocks[idx] = { ...blocks[idx], minKwh: parseFloat(e.target.value) };
                          setEditGroup({ ...editGroup, blocks });
                        }} />
                      <TextField size="small" label="Max" type="number" value={block.maxKwh ?? block.max ?? 999999} sx={{ width: 80 }}
                        onChange={(e) => {
                          const blocks = [...editGroup.blocks];
                          blocks[idx] = { ...blocks[idx], maxKwh: parseFloat(e.target.value) };
                          setEditGroup({ ...editGroup, blocks });
                        }} />
                    </>
                  )}
                  <IconButton size="small" onClick={() => {
                    const blocks = editGroup.blocks.filter((_, i) => i !== idx);
                    setEditGroup({ ...editGroup, blocks });
                  }} sx={{ color: colors.redAccent?.[500] || "#db4f4a" }}>
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
          <Button variant="contained" onClick={handleUpdateGroup}
            sx={{ backgroundColor: colors.greenAccent[500], color: "#000", fontWeight: 600 }}>
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Add Group Dialog ─── */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { backgroundColor: colors.primary[400], backgroundImage: "none" } }}>
        <DialogTitle sx={{ color: colors.grey[100], fontWeight: 700 }}>Create Tariff Group</DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap="12px" mt="10px">
            <TextField label="Name" size="small" fullWidth value={newGroup.name}
              onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })} />
            <TextField label="SGC" size="small" fullWidth value={newGroup.sgc}
              onChange={(e) => setNewGroup({ ...newGroup, sgc: e.target.value })} />
            <TextField label="Description" size="small" fullWidth multiline rows={2} value={newGroup.description}
              onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })} />
            <FormControl size="small" fullWidth>
              <InputLabel>Type</InputLabel>
              <Select label="Type" value={newGroup.type}
                onChange={(e) => setNewGroup({ ...newGroup, type: e.target.value })}>
                <MenuItem value="Block">Block (Inclining)</MenuItem>
                <MenuItem value="Flat">Flat Rate</MenuItem>
                <MenuItem value="TOU">Time-of-Use</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel>Billing</InputLabel>
              <Select label="Billing" value={newGroup.billingType || "prepaid"}
                onChange={(e) => setNewGroup({ ...newGroup, billingType: e.target.value })}>
                <MenuItem value="prepaid">Prepaid</MenuItem>
                <MenuItem value="postpaid">Postpaid</MenuItem>
              </Select>
            </FormControl>
            {newGroup.type === "Flat" && (
              <TextField label="Flat Rate (N$/kWh)" type="number" size="small" fullWidth
                value={newGroup.flatRate} onChange={(e) => setNewGroup({ ...newGroup, flatRate: e.target.value })} />
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
          <Button variant="contained" onClick={handleCreateGroup}
            sx={{ backgroundColor: colors.greenAccent[500], color: "#000", fontWeight: 600 }}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })} anchorOrigin={{ vertical: "bottom", horizontal: "right" }}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
