import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Box,
  Typography,
  Chip,
  TextField,
  InputAdornment,
  IconButton,
  CircularProgress,
  useTheme,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Slider,
  Tooltip,
  Switch,
  FormControlLabel,
  Alert,
  Snackbar,
  Divider,
  Paper,
} from "@mui/material";
import {
  SearchOutlined,
  FiberManualRecord,
  AddOutlined,
  DeleteOutlined,
  PlayArrowOutlined,
  StopOutlined,
  ShuffleOutlined,
  GroupWorkOutlined,
  ElectricMeterOutlined,
  PowerSettingsNewOutlined,
  WaterDropOutlined,
  BoltOutlined,
  CheckCircleOutlined,
  CancelOutlined,
  HistoryOutlined,
  EditOutlined,
  ExpandMoreOutlined,
  ExpandLessOutlined,
  SelectAllOutlined,
  DeselectOutlined,
  MyLocationOutlined,
  RefreshOutlined,
} from "@mui/icons-material";
import {
  GoogleMap,
  useJsApiLoader,
  Marker,
  Polygon,
} from "@react-google-maps/api";
import Header from "../components/Header";
import { tokens } from "../theme";
import { groupControlAPI, meterAPI } from "../services/api";
import markerBlue from "../assets/marker-blue.png";
import markerGreen from "../assets/marker-green.png";
import markerOrange from "../assets/marker-orange.png";
import markerRed from "../assets/marker-red.png";
import markerGrey from "../assets/marker-grey.png";
import markerPurple from "../assets/marker-purple.png";

const GOOGLE_MAPS_KEY = "AIzaSyCdPt-Y9HoyNJF5I-sbyuS4n6U1KhKaIzk";
const LIBRARIES = ["drawing"];
const MAP_CONTAINER = { width: "100%", height: "100%" };
const DEFAULT_CENTER = { lat: -22.5609, lng: 17.0658 };

const MAP_OPTIONS = {
  styles: [
    { elementType: "geometry", stylers: [{ color: "#0a1628" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#0a1628" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#5a6884" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#141d2e" }] },
    { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#1a2640" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1a2b" }] },
    { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
    { featureType: "transit", stylers: [{ visibility: "off" }] },
  ],
  disableDefaultUI: false,
  zoomControl: true,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: true,
};

/* ---- Marker icon helpers ---- */
function makePngIcon(img, w = 40, h = 60) {
  return {
    url: img,
    scaledSize: { width: w, height: h, equals: () => false },
    anchor: { x: w / 2, y: h, equals: () => false },
  };
}

// Mains ON + Geyser ON = fully powered (green)
function iconMainsOnGeyserOn() { return makePngIcon(markerGreen); }
// Mains ON + Geyser OFF = mains only (orange)
function iconMainsOnGeyserOff() { return makePngIcon(markerOrange); }
// Mains OFF = disconnected (red)
function iconMainsOff() { return makePngIcon(markerRed); }
// Offline / unknown (grey)
function iconOffline() { return makePngIcon(markerGrey); }
// Selected / in group (purple with ring)
function iconSelected() { return makePngIcon(markerPurple, 50, 75); }

/* ================================================================== */
/* Group Control Page                                                  */
/* ================================================================== */
export default function GroupControl() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);

  const [loading, setLoading] = useState(true);
  const [meters, setMeters] = useState([]);
  const [groups, setGroups] = useState([]);
  const [mapRef, setMapRef] = useState(null);
  const [search, setSearch] = useState("");

  // Group management
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupMembers, setGroupMembers] = useState([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [newGroupType, setNewGroupType] = useState("geyser");
  const [editingGroup, setEditingGroup] = useState(null);

  // Meter selection on map
  const [selectedMeters, setSelectedMeters] = useState(new Set());
  const [selectionMode, setSelectionMode] = useState(false); // click-to-select mode

  // Randomize
  const [showRandomDialog, setShowRandomDialog] = useState(false);
  const [randomCount, setRandomCount] = useState(10);
  const [randomArea, setRandomArea] = useState("");

  // Control action
  const [showControlDialog, setShowControlDialog] = useState(false);
  const [controlAction, setControlAction] = useState("geyser_off");
  const [controlReason, setControlReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // History
  const [history, setHistory] = useState([]);

  // Snackbar
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_KEY,
    libraries: LIBRARIES,
  });

  /* ---- Fetch all data ---- */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [metersRes, groupsRes] = await Promise.allSettled([
        groupControlAPI.getMetersState(),
        groupControlAPI.getGroups(),
      ]);
      if (metersRes.status === "fulfilled") {
        const data = metersRes.value?.data || metersRes.value || [];
        setMeters(Array.isArray(data) ? data : []);
      }
      if (groupsRes.status === "fulfilled") {
        const data = groupsRes.value?.data || groupsRes.value || [];
        setGroups(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Fetch error:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ---- Load group members when group selected ---- */
  const loadGroupMembers = useCallback(async (groupId) => {
    try {
      const res = await groupControlAPI.getGroup(groupId);
      const data = res?.data || res || {};
      setGroupMembers(data.members || []);
      setSelectedMeters(new Set((data.members || []).map(m => m.DRN)));
    } catch (err) {
      console.error("Load group error:", err);
      setGroupMembers([]);
    }
  }, []);

  /* ---- Area summary from meters ---- */
  const areaSummary = useMemo(() => {
    const areas = {};
    meters.forEach(m => {
      const area = m.LocationName || "Unknown";
      if (!areas[area]) areas[area] = { total: 0, online: 0, mainsOff: 0, geyserOff: 0 };
      areas[area].total++;
      const isOnline = m.Status === "1" || m.Status === 1 || m.Status === "Active";
      if (isOnline) areas[area].online++;
      if (m.mains_state === "0" || m.mains_state === 0) areas[area].mainsOff++;
      if (m.geyser_state === "0" || m.geyser_state === 0) areas[area].geyserOff++;
    });
    return Object.entries(areas)
      .map(([area, d]) => ({ area, ...d }))
      .sort((a, b) => b.total - a.total);
  }, [meters]);

  /* ---- Filtered meters for map ---- */
  const filteredMeters = useMemo(() => {
    if (!search) return meters;
    const q = search.toLowerCase();
    return meters.filter(m =>
      (m.DRN || "").toLowerCase().includes(q) ||
      (m.LocationName || "").toLowerCase().includes(q) ||
      (m.customerName || "").toLowerCase().includes(q)
    );
  }, [meters, search]);

  /* ---- Stats for selected meters ---- */
  const selectionStats = useMemo(() => {
    const sel = meters.filter(m => selectedMeters.has(m.DRN));
    return {
      total: sel.length,
      mainsOn: sel.filter(m => m.mains_state === "1" || m.mains_state === 1).length,
      mainsOff: sel.filter(m => m.mains_state === "0" || m.mains_state === 0).length,
      geyserOn: sel.filter(m => m.geyser_state === "1" || m.geyser_state === 1).length,
      geyserOff: sel.filter(m => m.geyser_state === "0" || m.geyser_state === 0).length,
    };
  }, [meters, selectedMeters]);

  /* ---- Get marker icon based on state ---- */
  const getMarkerIcon = useCallback((meter) => {
    if (selectedMeters.has(meter.DRN)) return iconSelected();
    const isOnline = meter.Status === "1" || meter.Status === 1 || meter.Status === "Active";
    if (!isOnline) return iconOffline();
    const mainsOn = meter.mains_state === "1" || meter.mains_state === 1;
    const geyserOn = meter.geyser_state === "1" || meter.geyser_state === 1;
    if (!mainsOn) return iconMainsOff();
    if (mainsOn && !geyserOn) return iconMainsOnGeyserOff();
    return iconMainsOnGeyserOn();
  }, [selectedMeters]);

  /* ---- Map click to select meter ---- */
  const handleMeterClick = useCallback((meter) => {
    if (!selectionMode) return;
    setSelectedMeters(prev => {
      const next = new Set(prev);
      if (next.has(meter.DRN)) {
        next.delete(meter.DRN);
      } else {
        next.add(meter.DRN);
      }
      return next;
    });
  }, [selectionMode]);

  /* ---- Select all meters in an area ---- */
  const selectArea = useCallback((areaName) => {
    const areaMeters = meters.filter(m => m.LocationName === areaName);
    setSelectedMeters(prev => {
      const next = new Set(prev);
      const allSelected = areaMeters.every(m => next.has(m.DRN));
      if (allSelected) {
        areaMeters.forEach(m => next.delete(m.DRN));
      } else {
        areaMeters.forEach(m => next.add(m.DRN));
      }
      return next;
    });
  }, [meters]);

  /* ---- Create group ---- */
  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      const res = await groupControlAPI.createGroup({
        name: newGroupName,
        description: newGroupDesc,
        control_type: newGroupType,
      });
      setShowCreateDialog(false);
      setNewGroupName("");
      setNewGroupDesc("");
      setNewGroupType("geyser");
      // If meters are selected, add them to the new group
      if (selectedMeters.size > 0 && res?.id) {
        await groupControlAPI.addMeters(res.id, Array.from(selectedMeters));
      }
      await fetchData();
      setSnackbar({ open: true, message: "Group created successfully", severity: "success" });
    } catch (err) {
      setSnackbar({ open: true, message: err.message, severity: "error" });
    }
  };

  /* ---- Delete group ---- */
  const handleDeleteGroup = async (groupId) => {
    try {
      await groupControlAPI.deleteGroup(groupId);
      if (selectedGroup?.id === groupId) {
        setSelectedGroup(null);
        setGroupMembers([]);
        setSelectedMeters(new Set());
      }
      await fetchData();
      setSnackbar({ open: true, message: "Group deleted", severity: "success" });
    } catch (err) {
      setSnackbar({ open: true, message: err.message, severity: "error" });
    }
  };

  /* ---- Select group ---- */
  const handleSelectGroup = async (group) => {
    setSelectedGroup(group);
    await loadGroupMembers(group.id);
    setSelectionMode(false);
  };

  /* ---- Save selection to group ---- */
  const handleSaveToGroup = async () => {
    if (!selectedGroup) return;
    try {
      // Remove all existing members first, then add selected
      if (groupMembers.length > 0) {
        await groupControlAPI.removeMeters(selectedGroup.id, groupMembers.map(m => m.DRN));
      }
      if (selectedMeters.size > 0) {
        await groupControlAPI.addMeters(selectedGroup.id, Array.from(selectedMeters));
      }
      await loadGroupMembers(selectedGroup.id);
      await fetchData();
      setSnackbar({ open: true, message: "Group members updated", severity: "success" });
    } catch (err) {
      setSnackbar({ open: true, message: err.message, severity: "error" });
    }
  };

  /* ---- Randomize meters ---- */
  const handleRandomize = async () => {
    try {
      const res = await groupControlAPI.randomize({
        count: randomCount,
        area: randomArea || undefined,
        exclude_drns: [],
      });
      const drns = res?.data || [];
      setSelectedMeters(new Set(drns));
      setShowRandomDialog(false);
      setSnackbar({ open: true, message: `${drns.length} meters randomly selected`, severity: "success" });
    } catch (err) {
      setSnackbar({ open: true, message: err.message, severity: "error" });
    }
  };

  /* ---- Execute control action ---- */
  const handleExecuteControl = async () => {
    if (selectedMeters.size === 0) return;
    setActionLoading(true);
    try {
      const res = await groupControlAPI.execute({
        group_id: selectedGroup?.id || null,
        action_type: controlAction,
        reason: controlReason || `Load control: ${controlAction}`,
        meter_drns: Array.from(selectedMeters),
      });
      setShowControlDialog(false);
      setControlReason("");
      setSnackbar({
        open: true,
        message: `${res?.message || "Command sent"} (${res?.succeeded || 0}/${res?.total || 0})`,
        severity: "success",
      });
      // Refresh data after short delay
      setTimeout(() => fetchData(), 2000);
    } catch (err) {
      setSnackbar({ open: true, message: err.message, severity: "error" });
    }
    setActionLoading(false);
  };

  /* ---- Load history ---- */
  const handleShowHistory = async () => {
    try {
      const res = await groupControlAPI.getHistory();
      setHistory(res?.data || []);
      setShowHistoryDialog(true);
    } catch (err) {
      setSnackbar({ open: true, message: err.message, severity: "error" });
    }
  };

  /* ---- Render ---- */
  if (loading || !isLoaded) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="80vh">
        <CircularProgress sx={{ color: colors.greenAccent[500] }} />
      </Box>
    );
  }

  const totalOnMap = filteredMeters.length;
  const totalSelected = selectedMeters.size;

  return (
    <Box m="10px 20px" height="calc(100vh - 80px)" display="flex" flexDirection="column">
      <Header title="LOAD CONTROL" subtitle="Group-based ripple control and load management" />

      <Box flex={1} display="flex" gap="12px" overflow="hidden" mt="8px">
        {/* =============== LEFT PANEL — Groups & Areas =============== */}
        <Box
          width="280px"
          minWidth="280px"
          display="flex"
          flexDirection="column"
          gap="8px"
          sx={{ overflowY: "auto", overflowX: "hidden" }}
        >
          {/* Action buttons */}
          <Box display="flex" gap="4px" flexWrap="wrap">
            <Button
              size="small"
              variant={selectionMode ? "contained" : "outlined"}
              onClick={() => setSelectionMode(!selectionMode)}
              startIcon={selectionMode ? <CheckCircleOutlined /> : <MyLocationOutlined />}
              sx={{
                flex: 1,
                textTransform: "none",
                fontSize: "11px",
                bgcolor: selectionMode ? colors.greenAccent[600] : "transparent",
                borderColor: colors.greenAccent[600],
                color: selectionMode ? "#fff" : colors.greenAccent[400],
                "&:hover": { bgcolor: colors.greenAccent[700] },
              }}
            >
              {selectionMode ? "Selecting" : "Select"}
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => setShowRandomDialog(true)}
              startIcon={<ShuffleOutlined />}
              sx={{
                flex: 1,
                textTransform: "none",
                fontSize: "11px",
                borderColor: "#f2b705",
                color: "#f2b705",
                "&:hover": { bgcolor: "rgba(242,183,5,0.1)" },
              }}
            >
              Random
            </Button>
          </Box>

          <Box display="flex" gap="4px">
            <Button
              size="small"
              variant="outlined"
              onClick={() => setShowCreateDialog(true)}
              startIcon={<AddOutlined />}
              sx={{
                flex: 1,
                textTransform: "none",
                fontSize: "11px",
                borderColor: "#6870fa",
                color: "#6870fa",
                "&:hover": { bgcolor: "rgba(104,112,250,0.1)" },
              }}
            >
              New Group
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={handleShowHistory}
              startIcon={<HistoryOutlined />}
              sx={{
                flex: 1,
                textTransform: "none",
                fontSize: "11px",
                borderColor: colors.grey[500],
                color: colors.grey[400],
                "&:hover": { bgcolor: "rgba(255,255,255,0.05)" },
              }}
            >
              History
            </Button>
          </Box>

          {/* Groups list */}
          <Box
            sx={{
              bgcolor: colors.primary[400],
              borderRadius: "8px",
              p: "8px",
            }}
          >
            <Typography variant="subtitle2" color={colors.grey[300]} mb="6px" display="flex" alignItems="center" gap="4px">
              <GroupWorkOutlined sx={{ fontSize: 16 }} /> Control Groups ({groups.length})
            </Typography>

            {groups.length === 0 ? (
              <Typography variant="caption" color={colors.grey[500]} sx={{ fontStyle: "italic" }}>
                No groups created yet
              </Typography>
            ) : (
              groups.map(g => (
                <Box
                  key={g.id}
                  onClick={() => handleSelectGroup(g)}
                  sx={{
                    p: "8px",
                    mb: "4px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    bgcolor: selectedGroup?.id === g.id ? "rgba(104,112,250,0.15)" : "rgba(255,255,255,0.03)",
                    border: selectedGroup?.id === g.id ? "1px solid rgba(104,112,250,0.4)" : "1px solid transparent",
                    "&:hover": { bgcolor: "rgba(104,112,250,0.1)" },
                    transition: "all 0.2s",
                  }}
                >
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="body2" fontWeight={600} color={colors.grey[100]}>
                      {g.name}
                    </Typography>
                    <Box display="flex" gap="2px">
                      <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); handleDeleteGroup(g.id); }}
                        sx={{ color: "#db4f4a", p: "2px" }}
                      >
                        <DeleteOutlined sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Box>
                  </Box>
                  <Box display="flex" gap="6px" mt="2px" alignItems="center">
                    <Chip
                      label={`${g.member_count || 0} meters`}
                      size="small"
                      sx={{ height: 18, fontSize: 10, bgcolor: "rgba(76,206,172,0.15)", color: colors.greenAccent[400] }}
                    />
                    <Chip
                      label={g.control_type}
                      size="small"
                      sx={{
                        height: 18,
                        fontSize: 10,
                        bgcolor: g.control_type === "mains" ? "rgba(219,79,74,0.15)" :
                                 g.control_type === "geyser" ? "rgba(242,183,5,0.15)" : "rgba(104,112,250,0.15)",
                        color: g.control_type === "mains" ? "#db4f4a" :
                               g.control_type === "geyser" ? "#f2b705" : "#6870fa",
                      }}
                    />
                  </Box>
                  {g.description && (
                    <Typography variant="caption" color={colors.grey[500]} mt="2px" display="block" noWrap>
                      {g.description}
                    </Typography>
                  )}
                </Box>
              ))
            )}
          </Box>

          {/* Selected meters info + save */}
          {totalSelected > 0 && (
            <Box
              sx={{
                bgcolor: colors.primary[400],
                borderRadius: "8px",
                p: "8px",
              }}
            >
              <Typography variant="subtitle2" color={colors.grey[300]} mb="4px">
                Selected: {totalSelected} meters
              </Typography>
              <Box display="flex" gap="6px" flexWrap="wrap" mb="6px">
                <Chip icon={<BoltOutlined sx={{ fontSize: 12 }} />} label={`Mains ON: ${selectionStats.mainsOn}`} size="small"
                  sx={{ height: 20, fontSize: 10, bgcolor: "rgba(76,206,172,0.12)", color: "#4cceac" }} />
                <Chip icon={<CancelOutlined sx={{ fontSize: 12 }} />} label={`Mains OFF: ${selectionStats.mainsOff}`} size="small"
                  sx={{ height: 20, fontSize: 10, bgcolor: "rgba(219,79,74,0.12)", color: "#db4f4a" }} />
                <Chip icon={<WaterDropOutlined sx={{ fontSize: 12 }} />} label={`Geyser ON: ${selectionStats.geyserOn}`} size="small"
                  sx={{ height: 20, fontSize: 10, bgcolor: "rgba(242,183,5,0.12)", color: "#f2b705" }} />
              </Box>
              <Box display="flex" gap="4px">
                {selectedGroup && (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={handleSaveToGroup}
                    startIcon={<CheckCircleOutlined />}
                    sx={{
                      flex: 1,
                      textTransform: "none",
                      fontSize: "10px",
                      borderColor: "#6870fa",
                      color: "#6870fa",
                    }}
                  >
                    Save to Group
                  </Button>
                )}
                <Button
                  size="small"
                  variant="contained"
                  onClick={() => setShowControlDialog(true)}
                  startIcon={<PowerSettingsNewOutlined />}
                  sx={{
                    flex: 1,
                    textTransform: "none",
                    fontSize: "10px",
                    bgcolor: "#db4f4a",
                    "&:hover": { bgcolor: "#c53030" },
                  }}
                >
                  Send Command
                </Button>
              </Box>
              <Button
                size="small"
                onClick={() => setSelectedMeters(new Set())}
                startIcon={<DeselectOutlined />}
                sx={{
                  mt: "4px",
                  width: "100%",
                  textTransform: "none",
                  fontSize: "10px",
                  color: colors.grey[400],
                }}
              >
                Clear Selection
              </Button>
            </Box>
          )}

          {/* Areas list */}
          <Box
            sx={{
              bgcolor: colors.primary[400],
              borderRadius: "8px",
              p: "8px",
              flex: 1,
              overflowY: "auto",
            }}
          >
            <Typography variant="subtitle2" color={colors.grey[300]} mb="6px">
              Areas ({areaSummary.length})
            </Typography>
            {areaSummary.map(a => {
              const allAreaSelected = meters
                .filter(m => m.LocationName === a.area)
                .every(m => selectedMeters.has(m.DRN));
              return (
                <Box
                  key={a.area}
                  onClick={() => selectArea(a.area)}
                  sx={{
                    p: "6px 8px",
                    mb: "3px",
                    borderRadius: "5px",
                    cursor: "pointer",
                    bgcolor: allAreaSelected ? "rgba(104,112,250,0.12)" : "rgba(255,255,255,0.02)",
                    "&:hover": { bgcolor: "rgba(255,255,255,0.06)" },
                    transition: "all 0.15s",
                  }}
                >
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="caption" color={colors.grey[200]} fontWeight={500}>
                      {a.area}
                    </Typography>
                    <Typography variant="caption" color={colors.grey[400]}>
                      {a.total}
                    </Typography>
                  </Box>
                  <Box display="flex" gap="8px" mt="1px">
                    <Typography variant="caption" color="#4cceac" fontSize="9px">
                      {a.online} online
                    </Typography>
                    <Typography variant="caption" color="#db4f4a" fontSize="9px">
                      {a.mainsOff} mains off
                    </Typography>
                    <Typography variant="caption" color="#f2b705" fontSize="9px">
                      {a.geyserOff} geyser off
                    </Typography>
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>

        {/* =============== CENTER — Map =============== */}
        <Box flex={1} display="flex" flexDirection="column" gap="8px">
          {/* Top bar */}
          <Box display="flex" gap="8px" alignItems="center">
            <TextField
              size="small"
              placeholder="Search meters..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{
                width: "260px",
                "& .MuiOutlinedInput-root": {
                  bgcolor: colors.primary[400],
                  borderRadius: "8px",
                  height: "34px",
                  fontSize: "13px",
                },
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlined sx={{ fontSize: 16, color: colors.grey[400] }} />
                  </InputAdornment>
                ),
              }}
            />
            <IconButton
              size="small"
              onClick={fetchData}
              sx={{ color: colors.grey[400] }}
            >
              <RefreshOutlined sx={{ fontSize: 18 }} />
            </IconButton>
            <Box flex={1} />
            <Typography variant="caption" color={colors.grey[400]}>
              {totalOnMap} meters on map
            </Typography>
            {selectionMode && (
              <Chip
                label="Click meters to select"
                size="small"
                color="success"
                variant="outlined"
                sx={{ height: 22, fontSize: 11 }}
              />
            )}
          </Box>

          {/* Map */}
          <Box flex={1} borderRadius="10px" overflow="hidden" border={`1px solid ${colors.primary[400]}`}>
            <GoogleMap
              mapContainerStyle={MAP_CONTAINER}
              center={DEFAULT_CENTER}
              zoom={13}
              options={{
                ...MAP_OPTIONS,
                draggableCursor: selectionMode ? "crosshair" : "grab",
              }}
              onLoad={setMapRef}
            >
              {filteredMeters.map(meter => {
                const lat = parseFloat(meter.Lat);
                const lng = parseFloat(meter.Longitude);
                if (isNaN(lat) || isNaN(lng)) return null;
                return (
                  <Marker
                    key={meter.DRN}
                    position={{ lat, lng }}
                    icon={getMarkerIcon(meter)}
                    onClick={() => handleMeterClick(meter)}
                    title={`${meter.DRN} - ${meter.LocationName || ""}`}
                  />
                );
              })}
            </GoogleMap>
          </Box>

          {/* Legend */}
          <Box display="flex" gap="16px" justifyContent="center" py="4px">
            {[
              { color: "#4cceac", label: "Mains ON + Geyser ON" },
              { color: "#f2b705", label: "Mains ON + Geyser OFF" },
              { color: "#db4f4a", label: "Mains OFF" },
              { color: "#4a5568", label: "Offline" },
              { color: "#6870fa", label: "Selected" },
            ].map(item => (
              <Box key={item.label} display="flex" alignItems="center" gap="4px">
                <FiberManualRecord sx={{ fontSize: 10, color: item.color }} />
                <Typography variant="caption" color={colors.grey[400]} fontSize="10px">
                  {item.label}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>

        {/* =============== RIGHT PANEL — Selected Meters List =============== */}
        <Box
          width="260px"
          minWidth="260px"
          display="flex"
          flexDirection="column"
          sx={{
            bgcolor: colors.primary[400],
            borderRadius: "8px",
            p: "8px",
            overflowY: "auto",
          }}
        >
          <Typography variant="subtitle2" color={colors.grey[300]} mb="6px" display="flex" alignItems="center" gap="4px">
            <ElectricMeterOutlined sx={{ fontSize: 16 }} />
            {selectedGroup ? `${selectedGroup.name}` : "Selected Meters"} ({totalSelected})
          </Typography>

          {totalSelected === 0 ? (
            <Box textAlign="center" py="30px">
              <Typography variant="caption" color={colors.grey[500]} sx={{ fontStyle: "italic" }}>
                {selectionMode
                  ? "Click meters on the map to select them"
                  : "Enable selection mode or click an area/group to see meters"}
              </Typography>
            </Box>
          ) : (
            <Box>
              {meters
                .filter(m => selectedMeters.has(m.DRN))
                .map(m => {
                  const mainsOn = m.mains_state === "1" || m.mains_state === 1;
                  const geyserOn = m.geyser_state === "1" || m.geyser_state === 1;
                  return (
                    <Box
                      key={m.DRN}
                      sx={{
                        p: "6px 8px",
                        mb: "3px",
                        borderRadius: "5px",
                        bgcolor: "rgba(255,255,255,0.03)",
                        "&:hover": { bgcolor: "rgba(255,255,255,0.06)" },
                      }}
                    >
                      <Box display="flex" justifyContent="space-between" alignItems="center">
                        <Typography variant="caption" color={colors.grey[100]} fontWeight={600} fontSize="11px">
                          {m.DRN}
                        </Typography>
                        <IconButton
                          size="small"
                          onClick={() => {
                            setSelectedMeters(prev => {
                              const next = new Set(prev);
                              next.delete(m.DRN);
                              return next;
                            });
                          }}
                          sx={{ p: "1px", color: colors.grey[500] }}
                        >
                          <CancelOutlined sx={{ fontSize: 12 }} />
                        </IconButton>
                      </Box>
                      <Typography variant="caption" color={colors.grey[400]} fontSize="9px" display="block">
                        {m.customerName || m.LocationName || "—"}
                      </Typography>
                      <Box display="flex" gap="6px" mt="2px">
                        <Chip
                          label={mainsOn ? "Mains ON" : "Mains OFF"}
                          size="small"
                          sx={{
                            height: 16,
                            fontSize: 9,
                            bgcolor: mainsOn ? "rgba(76,206,172,0.15)" : "rgba(219,79,74,0.15)",
                            color: mainsOn ? "#4cceac" : "#db4f4a",
                          }}
                        />
                        <Chip
                          label={geyserOn ? "Geyser ON" : "Geyser OFF"}
                          size="small"
                          sx={{
                            height: 16,
                            fontSize: 9,
                            bgcolor: geyserOn ? "rgba(242,183,5,0.15)" : "rgba(100,100,100,0.15)",
                            color: geyserOn ? "#f2b705" : colors.grey[500],
                          }}
                        />
                      </Box>
                    </Box>
                  );
                })}
            </Box>
          )}
        </Box>
      </Box>

      {/* =============== DIALOGS =============== */}

      {/* Create Group Dialog */}
      <Dialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        PaperProps={{ sx: { bgcolor: colors.primary[400], borderRadius: "12px", minWidth: 400 } }}
      >
        <DialogTitle sx={{ color: colors.grey[100] }}>Create Control Group</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Group Name"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            sx={{ mt: 1, mb: 2 }}
            size="small"
          />
          <TextField
            fullWidth
            label="Description (optional)"
            value={newGroupDesc}
            onChange={(e) => setNewGroupDesc(e.target.value)}
            sx={{ mb: 2 }}
            size="small"
            multiline
            rows={2}
          />
          <FormControl fullWidth size="small">
            <InputLabel>Control Type</InputLabel>
            <Select
              value={newGroupType}
              label="Control Type"
              onChange={(e) => setNewGroupType(e.target.value)}
            >
              <MenuItem value="geyser">Geyser Only</MenuItem>
              <MenuItem value="mains">Mains Only</MenuItem>
              <MenuItem value="both">Both (Mains + Geyser)</MenuItem>
            </Select>
          </FormControl>
          {totalSelected > 0 && (
            <Alert severity="info" sx={{ mt: 2 }}>
              {totalSelected} selected meter(s) will be added to this group
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowCreateDialog(false)} sx={{ color: colors.grey[400] }}>Cancel</Button>
          <Button
            onClick={handleCreateGroup}
            variant="contained"
            sx={{ bgcolor: "#6870fa", "&:hover": { bgcolor: "#5a62e8" } }}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Randomize Dialog */}
      <Dialog
        open={showRandomDialog}
        onClose={() => setShowRandomDialog(false)}
        PaperProps={{ sx: { bgcolor: colors.primary[400], borderRadius: "12px", minWidth: 400 } }}
      >
        <DialogTitle sx={{ color: colors.grey[100] }}>Random Meter Selection</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color={colors.grey[300]} mb={2}>
            Randomly select online meters for load control
          </Typography>
          <Typography variant="caption" color={colors.grey[400]} mb={1} display="block">
            Number of meters: {randomCount}
          </Typography>
          <Slider
            value={randomCount}
            onChange={(e, v) => setRandomCount(v)}
            min={1}
            max={Math.max(meters.length, 100)}
            valueLabelDisplay="auto"
            sx={{ color: "#f2b705", mb: 2 }}
          />
          <FormControl fullWidth size="small">
            <InputLabel>Area (optional)</InputLabel>
            <Select
              value={randomArea}
              label="Area (optional)"
              onChange={(e) => setRandomArea(e.target.value)}
            >
              <MenuItem value="">All Areas</MenuItem>
              {areaSummary.map(a => (
                <MenuItem key={a.area} value={a.area}>{a.area} ({a.online} online)</MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowRandomDialog(false)} sx={{ color: colors.grey[400] }}>Cancel</Button>
          <Button
            onClick={handleRandomize}
            variant="contained"
            sx={{ bgcolor: "#f2b705", color: "#000", "&:hover": { bgcolor: "#d4a005" } }}
          >
            Randomize
          </Button>
        </DialogActions>
      </Dialog>

      {/* Control Action Dialog */}
      <Dialog
        open={showControlDialog}
        onClose={() => setShowControlDialog(false)}
        PaperProps={{ sx: { bgcolor: colors.primary[400], borderRadius: "12px", minWidth: 450 } }}
      >
        <DialogTitle sx={{ color: colors.grey[100] }}>Send Control Command</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This will send control commands to {totalSelected} meter(s). This action affects real meters.
          </Alert>

          <FormControl fullWidth size="small" sx={{ mb: 2 }}>
            <InputLabel>Action</InputLabel>
            <Select
              value={controlAction}
              label="Action"
              onChange={(e) => setControlAction(e.target.value)}
            >
              <MenuItem value="geyser_off">
                <Box display="flex" alignItems="center" gap="8px">
                  <WaterDropOutlined sx={{ fontSize: 16, color: "#db4f4a" }} /> Turn OFF Geysers
                </Box>
              </MenuItem>
              <MenuItem value="geyser_on">
                <Box display="flex" alignItems="center" gap="8px">
                  <WaterDropOutlined sx={{ fontSize: 16, color: "#4cceac" }} /> Turn ON Geysers
                </Box>
              </MenuItem>
              <MenuItem value="mains_off">
                <Box display="flex" alignItems="center" gap="8px">
                  <BoltOutlined sx={{ fontSize: 16, color: "#db4f4a" }} /> Turn OFF Mains
                </Box>
              </MenuItem>
              <MenuItem value="mains_on">
                <Box display="flex" alignItems="center" gap="8px">
                  <BoltOutlined sx={{ fontSize: 16, color: "#4cceac" }} /> Turn ON Mains
                </Box>
              </MenuItem>
            </Select>
          </FormControl>

          <TextField
            fullWidth
            label="Reason (optional)"
            value={controlReason}
            onChange={(e) => setControlReason(e.target.value)}
            size="small"
            placeholder="e.g., Peak demand reduction"
            multiline
            rows={2}
          />

          <Box mt={2} p="8px" bgcolor="rgba(0,0,0,0.2)" borderRadius="6px">
            <Typography variant="caption" color={colors.grey[300]}>
              Summary: <strong>{controlAction.replace("_", " ").toUpperCase()}</strong> for{" "}
              <strong>{totalSelected}</strong> meters
              {selectedGroup && <> in group <strong>{selectedGroup.name}</strong></>}
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowControlDialog(false)} sx={{ color: colors.grey[400] }}>Cancel</Button>
          <Button
            onClick={handleExecuteControl}
            variant="contained"
            disabled={actionLoading}
            startIcon={actionLoading ? <CircularProgress size={16} /> : <PowerSettingsNewOutlined />}
            sx={{
              bgcolor: controlAction.endsWith("_off") ? "#db4f4a" : "#4cceac",
              color: "#fff",
              "&:hover": { bgcolor: controlAction.endsWith("_off") ? "#c53030" : "#38a89d" },
            }}
          >
            {actionLoading ? "Sending..." : "Execute"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* History Dialog */}
      <Dialog
        open={showHistoryDialog}
        onClose={() => setShowHistoryDialog(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { bgcolor: colors.primary[400], borderRadius: "12px" } }}
      >
        <DialogTitle sx={{ color: colors.grey[100] }}>Control Action History</DialogTitle>
        <DialogContent>
          {history.length === 0 ? (
            <Typography variant="body2" color={colors.grey[400]} textAlign="center" py={4}>
              No control actions recorded yet
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ color: colors.grey[300], borderColor: colors.primary[300] }}>Time</TableCell>
                  <TableCell sx={{ color: colors.grey[300], borderColor: colors.primary[300] }}>Group</TableCell>
                  <TableCell sx={{ color: colors.grey[300], borderColor: colors.primary[300] }}>Action</TableCell>
                  <TableCell sx={{ color: colors.grey[300], borderColor: colors.primary[300] }}>Meters</TableCell>
                  <TableCell sx={{ color: colors.grey[300], borderColor: colors.primary[300] }}>Status</TableCell>
                  <TableCell sx={{ color: colors.grey[300], borderColor: colors.primary[300] }}>By</TableCell>
                  <TableCell sx={{ color: colors.grey[300], borderColor: colors.primary[300] }}>Reason</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {history.map(h => (
                  <TableRow key={h.id}>
                    <TableCell sx={{ color: colors.grey[200], borderColor: colors.primary[300], fontSize: 12 }}>
                      {new Date(h.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell sx={{ color: colors.grey[200], borderColor: colors.primary[300], fontSize: 12 }}>
                      {h.group_name || "—"}
                    </TableCell>
                    <TableCell sx={{ borderColor: colors.primary[300] }}>
                      <Chip
                        label={h.action_type?.replace("_", " ")}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: 10,
                          bgcolor: h.action_type?.endsWith("_off")
                            ? "rgba(219,79,74,0.15)"
                            : "rgba(76,206,172,0.15)",
                          color: h.action_type?.endsWith("_off") ? "#db4f4a" : "#4cceac",
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ color: colors.grey[200], borderColor: colors.primary[300], fontSize: 12 }}>
                      {h.meter_count}
                    </TableCell>
                    <TableCell sx={{ borderColor: colors.primary[300] }}>
                      <Chip
                        label={h.status}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: 10,
                          bgcolor: h.status === "completed" ? "rgba(76,206,172,0.15)" :
                                   h.status === "failed" ? "rgba(219,79,74,0.15)" : "rgba(242,183,5,0.15)",
                          color: h.status === "completed" ? "#4cceac" :
                                 h.status === "failed" ? "#db4f4a" : "#f2b705",
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ color: colors.grey[200], borderColor: colors.primary[300], fontSize: 12 }}>
                      {h.executed_by}
                    </TableCell>
                    <TableCell sx={{ color: colors.grey[400], borderColor: colors.primary[300], fontSize: 11 }}>
                      {h.reason || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowHistoryDialog(false)} sx={{ color: colors.grey[400] }}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
