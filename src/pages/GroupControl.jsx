import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
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
  Checkbox,
  Snackbar,
  Alert,
  Switch,
  FormControlLabel,
  InputLabel,
} from "@mui/material";
import {
  SearchOutlined,
  FiberManualRecord,
  AddOutlined,
  GroupWorkOutlined,
  ElectricMeterOutlined,
  RefreshOutlined,
  WifiOutlined,
  WifiOffOutlined,
  ArrowForwardOutlined,
  BoltOutlined,
  WaterDropOutlined,
  PolylineOutlined,
  ClearOutlined,
} from "@mui/icons-material";
import {
  GoogleMap,
  useJsApiLoader,
  Marker,
  InfoWindow,
  Polygon,
  Polyline,
} from "@react-google-maps/api";
import { tokens } from "../theme";
import { groupControlAPI, energyAnalyticsAPI } from "../services/api";
import { getSubstationMarkers, getConnectionLines } from "../components/EnergyAnalytics";

const GOOGLE_MAPS_KEY = "AIzaSyCdPt-Y9HoyNJF5I-sbyuS4n6U1KhKaIzk";
const LIBRARIES = ["geometry"];
const MAP_CONTAINER = { width: "100%", height: "650px" };
const DEFAULT_CENTER = { lat: -22.5609, lng: 17.0658 };

const DARK_MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#0a1628" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0a1628" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#5a6884" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#141d2e" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#1a2640" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1a2b" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

const LIGHT_MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#f5f5f5" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f5f5f5" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#e0e0e0" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#c9e8fc" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

/* Simple dot marker */
function makeDotIcon(color, size = 14) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="${color}" stroke="white" stroke-width="1.5"/>
  </svg>`;
  return {
    url: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    scaledSize: { width: size, height: size, equals: () => false },
    anchor: { x: size / 2, y: size / 2, equals: () => false },
  };
}

/* Substation marker (square for primary, diamond for distribution) */
function makeSubstationIcon(color, isPrimary) {
  const size = isPrimary ? 28 : 22;
  const half = size / 2;
  if (isPrimary) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <rect x="2" y="2" width="${size-4}" height="${size-4}" rx="4" fill="${color}" stroke="white" stroke-width="1.5"/>
      <path d="M${half-4} ${half-5} L${half-6} ${half+1} H${half-2} L${half-4} ${half+5} L${half+4} ${half-1} H${half} L${half+2} ${half-5} Z" fill="white" opacity="0.9"/>
    </svg>`;
    return { url: `data:image/svg+xml,${encodeURIComponent(svg)}`, scaledSize: { width: size, height: size, equals: () => false }, anchor: { x: half, y: half, equals: () => false } };
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <polygon points="${half},2 ${size-2},${half} ${half},${size-2} 2,${half}" fill="${color}" stroke="white" stroke-width="1.5"/>
  </svg>`;
  return { url: `data:image/svg+xml,${encodeURIComponent(svg)}`, scaledSize: { width: size, height: size, equals: () => false }, anchor: { x: half, y: half, equals: () => false } };
}

const MeterDot = memo(function MeterDot({ meter, icon, onClick }) {
  const lat = parseFloat(meter.Lat);
  const lng = parseFloat(meter.Longitude);
  if (isNaN(lat) || isNaN(lng)) return null;
  return <Marker position={{ lat, lng }} icon={icon} onClick={onClick} />;
});

/* ================================================================== */
export default function GroupControl() {
  const navigate = useNavigate();
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const isDark = theme.palette.mode === "dark";

  const [loading, setLoading] = useState(true);
  const [meters, setMeters] = useState([]);
  const [groups, setGroups] = useState([]);
  const [search, setSearch] = useState("");
  const [clickedMeter, setClickedMeter] = useState(null);
  const [selectedMeters, setSelectedMeters] = useState(new Set());
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });

  // Network topology
  const [substations, setSubstations] = useState([]);
  const [connectionLines, setConnectionLines] = useState([]);
  const [showSubstations, setShowSubstations] = useState(true);
  const [showConnections, setShowConnections] = useState(true);
  const [clickedSubstation, setClickedSubstation] = useState(null);

  // Polygon drawing
  const [drawingMode, setDrawingMode] = useState(false);
  const [drawnPolygon, setDrawnPolygon] = useState(null); // array of {lat, lng}
  const [drawingPoints, setDrawingPoints] = useState([]);

  // Create group dialog
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newType, setNewType] = useState("geyser");
  const [newPowerLimit, setNewPowerLimit] = useState(0);

  // Schedule state for create dialog
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleStartTime, setScheduleStartTime] = useState("08:00");
  const [scheduleEndTime, setScheduleEndTime] = useState("17:00");
  const [scheduleDays, setScheduleDays] = useState([1, 2, 3, 4, 5]);
  const [scheduleStartDate, setScheduleStartDate] = useState("");
  const [scheduleEndDate, setScheduleEndDate] = useState("");

  // Calibration state for create dialog
  const [calibrationEnabled, setCalibrationEnabled] = useState(false);
  const [calibrationPeriod, setCalibrationPeriod] = useState("weekly");
  const [calibrationTime, setCalibrationTime] = useState("02:00");

  // Left sidebar state
  const [selectedArea, setSelectedArea] = useState(null);
  const [selectedSidebarSubstation, setSelectedSidebarSubstation] = useState(null);

  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: GOOGLE_MAPS_KEY, libraries: LIBRARIES });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [metersRes, groupsRes, subConfigRes, powerFlowRes, regionalRes] = await Promise.allSettled([
        groupControlAPI.getMetersState(),
        groupControlAPI.getGroups(),
        energyAnalyticsAPI.getSubstationConfig(),
        energyAnalyticsAPI.getPowerFlow(),
        energyAnalyticsAPI.getRegionalSummary(),
      ]);
      if (metersRes.status === "fulfilled") {
        const d = metersRes.value?.data || metersRes.value || [];
        setMeters(Array.isArray(d) ? d : []);
      }
      if (groupsRes.status === "fulfilled") {
        const d = groupsRes.value?.data || groupsRes.value || [];
        setGroups(Array.isArray(d) ? d : []);
      }

      // Process substation / connection data
      const subConfig = subConfigRes.status === "fulfilled"
        ? (subConfigRes.value?.data || subConfigRes.value || [])
        : [];
      const powerFlow = powerFlowRes.status === "fulfilled"
        ? (powerFlowRes.value?.data || powerFlowRes.value || [])
        : [];
      const regions = regionalRes.status === "fulfilled"
        ? (regionalRes.value?.data || regionalRes.value || [])
        : [];

      if (Array.isArray(subConfig) && subConfig.length > 0) {
        setSubstations(getSubstationMarkers(subConfig, Array.isArray(regions) ? regions : []));
        setConnectionLines(getConnectionLines(subConfig, Array.isArray(powerFlow) ? powerFlow : []));
      }
    } catch (err) {
      console.error("Fetch error:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* Stats */
  const onlineCount = useMemo(() =>
    meters.filter(m => m.Status === "1" || m.Status === 1 || m.Status === "Active").length,
  [meters]);
  const offlineCount = useMemo(() => meters.length - onlineCount, [meters, onlineCount]);

  /* Areas derived from meters */
  const areas = useMemo(() => {
    const areaMap = {};
    meters.forEach(m => {
      const area = m.LocationName || m.Suburb || m.City || "Unknown";
      if (!areaMap[area]) areaMap[area] = { name: area, count: 0, drns: [] };
      areaMap[area].count++;
      areaMap[area].drns.push(m.DRN);
    });
    return Object.values(areaMap).sort((a, b) => b.count - a.count);
  }, [meters]);

  /* Filtered meters */
  const filteredMeters = useMemo(() => {
    if (!search) return meters;
    const q = search.toLowerCase();
    return meters.filter(m =>
      (m.DRN || "").toLowerCase().includes(q) ||
      (m.LocationName || "").toLowerCase().includes(q) ||
      (m.customerName || "").toLowerCase().includes(q)
    );
  }, [meters, search]);

  /* Handle map click in drawing mode — add point to polygon */
  const handleMapClick = useCallback((e) => {
    if (!drawingMode) return;
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    setDrawingPoints(prev => [...prev, { lat, lng }]);
  }, [drawingMode]);

  /* Finish drawing — close polygon and select meters inside */
  const finishDrawing = useCallback(() => {
    if (drawingPoints.length < 3) return;
    setDrawnPolygon(drawingPoints);
    setDrawingMode(false);

    // Find meters inside the polygon
    const googlePolygon = new window.google.maps.Polygon({ paths: drawingPoints });
    const inside = new Set();
    meters.forEach(m => {
      const lat = parseFloat(m.Lat);
      const lng = parseFloat(m.Longitude);
      if (!isNaN(lat) && !isNaN(lng)) {
        const point = new window.google.maps.LatLng(lat, lng);
        if (window.google.maps.geometry.poly.containsLocation(point, googlePolygon)) {
          inside.add(m.DRN);
        }
      }
    });
    setSelectedMeters(prev => {
      const next = new Set(prev);
      inside.forEach(drn => next.add(drn));
      return next;
    });
    setDrawingPoints([]);
  }, [drawingPoints, meters]);

  /* Clear polygon selection */
  const clearPolygonSelection = () => {
    setDrawnPolygon(null);
    setDrawingPoints([]);
    setDrawingMode(false);
    setSelectedMeters(new Set());
    setSelectedArea(null);
    setSelectedSidebarSubstation(null);
  };

  /* Select area — highlight meters in that area */
  const selectArea = (area) => {
    if (selectedArea === area.name) {
      setSelectedArea(null);
      setSelectedMeters(new Set());
    } else {
      setSelectedArea(area.name);
      setSelectedSidebarSubstation(null);
      setSelectedMeters(new Set(area.drns));
    }
  };

  /* Select substation — find nearby meters */
  const selectSubstation = (sub) => {
    if (selectedSidebarSubstation === sub.id) {
      setSelectedSidebarSubstation(null);
      setSelectedMeters(new Set());
    } else {
      setSelectedSidebarSubstation(sub.id);
      setSelectedArea(null);
      const nearby = new Set();
      meters.forEach(m => {
        const lat = parseFloat(m.Lat);
        const lng = parseFloat(m.Longitude);
        if (!isNaN(lat) && !isNaN(lng)) {
          const dist = Math.sqrt(Math.pow(lat - sub.lat, 2) + Math.pow(lng - sub.lng, 2));
          if (dist < 0.05) nearby.add(m.DRN);
        }
      });
      setSelectedMeters(nearby);
    }
  };

  /* Create group */
  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const groupData = {
        name: newName,
        description: newDesc,
        control_type: newType,
        power_limit: newPowerLimit,
      };
      if (scheduleEnabled) {
        groupData.schedule = {
          enabled: true,
          periods: [{
            startTime: scheduleStartTime,
            endTime: scheduleEndTime,
            days: scheduleDays,
          }],
          startDate: scheduleStartDate,
          endDate: scheduleEndDate || null,
        };
      }
      if (calibrationEnabled) {
        groupData.calibration = {
          enabled: true,
          period: calibrationPeriod,
          preferredTime: calibrationTime,
        };
      }
      const res = await groupControlAPI.createGroup(groupData);
      if (selectedMeters.size > 0 && res?.id) {
        await groupControlAPI.addMeters(res.id, Array.from(selectedMeters));
      }
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      setNewType("geyser");
      setNewPowerLimit(0);
      setScheduleEnabled(false);
      setScheduleStartTime("08:00");
      setScheduleEndTime("17:00");
      setScheduleDays([1, 2, 3, 4, 5]);
      setScheduleStartDate("");
      setScheduleEndDate("");
      setCalibrationEnabled(false);
      setCalibrationPeriod("weekly");
      setCalibrationTime("02:00");
      setSelectedMeters(new Set());
      setDrawnPolygon(null);
      await fetchData();
      setSnackbar({ open: true, message: "Group created successfully", severity: "success" });
    } catch (err) {
      setSnackbar({ open: true, message: err.message, severity: "error" });
    }
  };

  /* Toggle meter selection */
  const toggleMeter = (drn) => {
    setSelectedMeters(prev => {
      const next = new Set(prev);
      next.has(drn) ? next.delete(drn) : next.add(drn);
      return next;
    });
  };

  /* Helpers */
  const isOnline = (m) => m.Status === "1" || m.Status === 1 || m.Status === "Active";
  const cardBg = isDark ? colors.primary[400] : "#FFFFFF";
  const cardBorder = `1px solid ${isDark ? "#1E293B" : "#E5E7EB"}`;
  const headingColor = isDark ? colors.grey[100] : "#111827";
  const labelColor = isDark ? colors.grey[300] : "#6B7280";

  /* Check if a group is currently active */
  const isGroupActive = (g) => {
    const schedule = g.schedule || null;
    if (!schedule?.enabled || !schedule.periods) return false;
    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = now.getHours().toString().padStart(2, "0") + ":" + now.getMinutes().toString().padStart(2, "0");
    let active = false;
    schedule.periods.forEach(p => {
      if (p.days?.includes(currentDay) && currentTime >= (p.startTime || "") && currentTime <= (p.endTime || "23:59")) {
        active = true;
      }
    });
    return active;
  };

  if (loading || !isLoaded) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="80vh">
        <CircularProgress sx={{ color: "#2563EB" }} />
      </Box>
    );
  }

  return (
    <Box sx={{ bgcolor: isDark ? colors.primary[500] : "#F9FAFB", minHeight: "calc(100vh - 70px)" }}>

      {/* ===== HEADER ===== */}
      <Box sx={{ px: 3, pt: 3, pb: 1 }}>
        <Typography variant="h4" fontWeight={700} color={headingColor}>
          Group Control
        </Typography>
        <Typography variant="body2" color={labelColor} mt={0.5}>
          Manage load control groups, view meter status, and send commands
        </Typography>
      </Box>

      {/* ===== STATS ROW ===== */}
      <Box sx={{ px: 3, py: 2, display: "flex", gap: 2, flexWrap: "wrap" }}>
        {[
          { label: "Total Meters", value: meters.length, icon: <ElectricMeterOutlined sx={{ fontSize: 20 }} />, iconColor: "#2563EB" },
          { label: "Online", value: onlineCount, icon: <WifiOutlined sx={{ fontSize: 20 }} />, iconColor: "#10B981" },
          { label: "Offline", value: offlineCount, icon: <WifiOffOutlined sx={{ fontSize: 20 }} />, iconColor: "#EF4444" },
          { label: "Groups", value: groups.length, icon: <GroupWorkOutlined sx={{ fontSize: 20 }} />, iconColor: "#2563EB" },
        ].map((s) => (
          <Box
            key={s.label}
            sx={{
              flex: "1 1 180px",
              bgcolor: cardBg,
              border: cardBorder,
              borderRadius: "12px",
              p: "16px 20px",
              display: "flex",
              alignItems: "center",
              gap: 2,
            }}
          >
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: "10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: isDark ? "rgba(37,99,235,0.1)" : "#EFF6FF",
                color: s.iconColor,
              }}
            >
              {s.icon}
            </Box>
            <Box>
              <Typography variant="h5" fontWeight={700} color={headingColor}>{s.value}</Typography>
              <Typography variant="caption" color={labelColor}>{s.label}</Typography>
            </Box>
          </Box>
        ))}
      </Box>

      {/* ===== MAP AREA WITH SIDEBARS ===== */}
      <Box sx={{ display: "flex", gap: 0, px: 3, pb: 2 }}>

        {/* ===== LEFT SIDEBAR ===== */}
        <Box sx={{
          width: 220,
          flexShrink: 0,
          borderRight: `1px solid ${isDark ? "#1E293B" : "#E5E7EB"}`,
          pr: 0,
          display: "flex",
          flexDirection: "column",
          height: 710, // map controls + map height
          overflowY: "auto",
          "&::-webkit-scrollbar": { width: 4 },
          "&::-webkit-scrollbar-thumb": { bgcolor: isDark ? "#374151" : "#D1D5DB", borderRadius: 4 },
        }}>
          {/* Areas Section */}
          <Box sx={{ px: 1.5, pt: 1.5, pb: 1 }}>
            <Typography
              variant="caption"
              fontWeight={700}
              color={labelColor}
              letterSpacing="0.5px"
              textTransform="uppercase"
              display="block"
              mb={1}
              fontSize="10px"
            >
              Areas
            </Typography>
            {areas.map(area => {
              const isActive = selectedArea === area.name;
              return (
                <Box
                  key={area.name}
                  onClick={() => selectArea(area)}
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    px: 1.5,
                    py: "6px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    mb: "2px",
                    bgcolor: isActive ? "rgba(37,99,235,0.1)" : "transparent",
                    transition: "all 0.15s",
                    "&:hover": {
                      bgcolor: isActive ? "rgba(37,99,235,0.15)" : (isDark ? "rgba(100,116,139,0.08)" : "#F3F4F6"),
                    },
                  }}
                >
                  <Typography
                    fontSize="12px"
                    fontWeight={isActive ? 600 : 400}
                    color={isActive ? "#2563EB" : headingColor}
                    noWrap
                    sx={{ maxWidth: 140 }}
                  >
                    {area.name}
                  </Typography>
                  <Chip
                    label={area.count}
                    size="small"
                    sx={{
                      height: 18,
                      minWidth: 28,
                      fontSize: 10,
                      fontWeight: 600,
                      bgcolor: isActive
                        ? "rgba(37,99,235,0.15)"
                        : (isDark ? "rgba(100,116,139,0.12)" : "#F3F4F6"),
                      color: isActive ? "#2563EB" : labelColor,
                      "& .MuiChip-label": { px: "6px" },
                    }}
                  />
                </Box>
              );
            })}
          </Box>

          {/* Divider */}
          <Box sx={{ mx: 1.5, my: 1, borderTop: `1px solid ${isDark ? "#1E293B" : "#E5E7EB"}` }} />

          {/* Substations Section */}
          <Box sx={{ px: 1.5, pb: 1, flex: 1 }}>
            <Typography
              variant="caption"
              fontWeight={700}
              color={labelColor}
              letterSpacing="0.5px"
              textTransform="uppercase"
              display="block"
              mb={1}
              fontSize="10px"
            >
              Substations
            </Typography>
            {substations.length === 0 ? (
              <Typography fontSize="11px" color={labelColor} sx={{ px: 1.5, py: 1 }}>
                No substations loaded
              </Typography>
            ) : (
              substations.map(sub => {
                const isActive = selectedSidebarSubstation === sub.id;
                return (
                  <Box
                    key={sub.id}
                    onClick={() => selectSubstation(sub)}
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      px: 1.5,
                      py: "6px",
                      borderRadius: "6px",
                      cursor: "pointer",
                      mb: "2px",
                      bgcolor: isActive ? "rgba(37,99,235,0.1)" : "transparent",
                      transition: "all 0.15s",
                      "&:hover": {
                        bgcolor: isActive ? "rgba(37,99,235,0.15)" : (isDark ? "rgba(100,116,139,0.08)" : "#F3F4F6"),
                      },
                    }}
                  >
                    <Typography
                      fontSize="12px"
                      fontWeight={isActive ? 600 : 400}
                      color={isActive ? "#2563EB" : headingColor}
                      noWrap
                      sx={{ maxWidth: 110 }}
                    >
                      {sub.name || `Sub ${sub.id}`}
                    </Typography>
                    <Chip
                      label={sub.isPrimary ? "Primary" : "Dist"}
                      size="small"
                      sx={{
                        height: 18,
                        fontSize: 9,
                        fontWeight: 600,
                        bgcolor: sub.isPrimary
                          ? (isDark ? "rgba(37,99,235,0.15)" : "#DBEAFE")
                          : (isDark ? "rgba(245,158,11,0.15)" : "#FEF3C7"),
                        color: sub.isPrimary ? "#2563EB" : "#D97706",
                        "& .MuiChip-label": { px: "6px" },
                      }}
                    />
                  </Box>
                );
              })
            )}

            {/* Create Group from Selection button */}
            {selectedMeters.size > 0 && (
              <Button
                fullWidth
                size="small"
                variant="contained"
                startIcon={<AddOutlined sx={{ fontSize: 14 }} />}
                onClick={() => setShowCreate(true)}
                sx={{
                  mt: 1.5,
                  textTransform: "none",
                  fontSize: 11,
                  borderRadius: "6px",
                  bgcolor: "#2563EB",
                  py: "5px",
                  "&:hover": { bgcolor: "#1D4ED8" },
                }}
              >
                Create Group ({selectedMeters.size})
              </Button>
            )}
          </Box>

          {/* Divider */}
          <Box sx={{ mx: 1.5, my: 1, borderTop: `1px solid ${isDark ? "#1E293B" : "#E5E7EB"}` }} />

          {/* Legend */}
          <Box sx={{ px: 1.5, pb: 1.5 }}>
            <Typography
              variant="caption"
              fontWeight={700}
              color={labelColor}
              letterSpacing="0.5px"
              textTransform="uppercase"
              display="block"
              mb={0.75}
              fontSize="10px"
            >
              Legend
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
              <Box display="flex" alignItems="center" gap={0.75}>
                <FiberManualRecord sx={{ fontSize: 8, color: "#10B981" }} />
                <Typography fontSize="11px" color={labelColor}>Online</Typography>
              </Box>
              <Box display="flex" alignItems="center" gap={0.75}>
                <FiberManualRecord sx={{ fontSize: 8, color: "#EF4444" }} />
                <Typography fontSize="11px" color={labelColor}>Offline</Typography>
              </Box>
              <Box display="flex" alignItems="center" gap={0.75}>
                <Box sx={{ width: 8, height: 8, borderRadius: "2px", bgcolor: "#3b82f6" }} />
                <Typography fontSize="11px" color={labelColor}>Primary</Typography>
              </Box>
              <Box display="flex" alignItems="center" gap={0.75}>
                <Box sx={{ width: 8, height: 8, transform: "rotate(45deg)", bgcolor: "#f59e0b" }} />
                <Typography fontSize="11px" color={labelColor}>Distribution</Typography>
              </Box>
            </Box>
          </Box>
        </Box>

        {/* ===== MAP COLUMN ===== */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {/* Layer toggles + drawing tools */}
          <Box display="flex" gap={1} mb={1} px={1.5}>
            <Button
              variant={drawingMode ? "contained" : "outlined"}
              size="small"
              startIcon={<PolylineOutlined sx={{ fontSize: 16 }} />}
              onClick={() => { setDrawingMode(prev => !prev); setDrawingPoints([]); }}
              sx={{
                textTransform: "none",
                fontSize: 12,
                borderRadius: "8px",
                ...(drawingMode
                  ? { bgcolor: "#2563EB", color: "#fff", "&:hover": { bgcolor: "#1D4ED8" } }
                  : { borderColor: isDark ? "#374151" : "#D1D5DB", color: headingColor, "&:hover": { borderColor: "#2563EB", bgcolor: isDark ? "rgba(37,99,235,0.08)" : "#EFF6FF" } }),
              }}
            >
              {drawingMode ? `Drawing (${drawingPoints.length} points)` : "Draw Selection"}
            </Button>
            {drawingMode && drawingPoints.length >= 3 && (
              <Button size="small" variant="contained"
                onClick={finishDrawing}
                sx={{ textTransform: "none", fontSize: 12, borderRadius: "8px", bgcolor: "#10B981", "&:hover": { bgcolor: "#059669" } }}>
                Finish Drawing
              </Button>
            )}
            {drawingMode && drawingPoints.length > 0 && drawingPoints.length < 3 && (
              <Typography variant="caption" color={labelColor} sx={{ alignSelf: "center" }}>
                Click {3 - drawingPoints.length} more point{drawingPoints.length < 2 ? "s" : ""} on the map
              </Typography>
            )}
            {drawnPolygon && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<ClearOutlined sx={{ fontSize: 16 }} />}
                onClick={clearPolygonSelection}
                sx={{
                  textTransform: "none",
                  fontSize: 12,
                  borderRadius: "8px",
                  borderColor: isDark ? "#374151" : "#D1D5DB",
                  color: "#EF4444",
                  "&:hover": { borderColor: "#EF4444", bgcolor: isDark ? "rgba(239,68,68,0.08)" : "#FEF2F2" },
                }}
              >
                Clear Selection
              </Button>
            )}

            {/* Network topology layer toggles */}
            <Box sx={{ ml: "auto", display: "flex", gap: 0.75 }}>
              <Chip
                label="Substations"
                size="small"
                variant={showSubstations ? "filled" : "outlined"}
                onClick={() => setShowSubstations(prev => !prev)}
                sx={{
                  height: 28,
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: "pointer",
                  borderRadius: "8px",
                  ...(showSubstations
                    ? { bgcolor: isDark ? "rgba(37,99,235,0.2)" : "#DBEAFE", color: "#2563EB", border: "1px solid #2563EB" }
                    : { bgcolor: "transparent", color: labelColor, borderColor: isDark ? "#374151" : "#D1D5DB" }),
                  "&:hover": { bgcolor: showSubstations ? (isDark ? "rgba(37,99,235,0.3)" : "#BFDBFE") : (isDark ? "rgba(100,116,139,0.12)" : "#F3F4F6") },
                }}
              />
              <Chip
                label="Connections"
                size="small"
                variant={showConnections ? "filled" : "outlined"}
                onClick={() => setShowConnections(prev => !prev)}
                sx={{
                  height: 28,
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: "pointer",
                  borderRadius: "8px",
                  ...(showConnections
                    ? { bgcolor: isDark ? "rgba(37,99,235,0.2)" : "#DBEAFE", color: "#2563EB", border: "1px solid #2563EB" }
                    : { bgcolor: "transparent", color: labelColor, borderColor: isDark ? "#374151" : "#D1D5DB" }),
                  "&:hover": { bgcolor: showConnections ? (isDark ? "rgba(37,99,235,0.3)" : "#BFDBFE") : (isDark ? "rgba(100,116,139,0.12)" : "#F3F4F6") },
                }}
              />
            </Box>
          </Box>

          {/* Map */}
          <Box sx={{ height: 650, borderRadius: "12px", overflow: "hidden", border: cardBorder, position: "relative" }}>
            <GoogleMap
              mapContainerStyle={{ width: "100%", height: "100%" }}
              center={DEFAULT_CENTER}
              zoom={13}
              onClick={handleMapClick}
              options={{
                disableDefaultUI: false,
                zoomControl: true,
                mapTypeControl: false,
                streetViewControl: false,
                fullscreenControl: true,
                styles: isDark ? DARK_MAP_STYLES : LIGHT_MAP_STYLES,
                draggableCursor: drawingMode ? "crosshair" : undefined,
              }}
            >
              {/* In-progress drawing: show polyline of clicked points */}
              {drawingMode && drawingPoints.length > 0 && (
                <Polyline
                  path={drawingPoints}
                  options={{
                    strokeColor: "#2563EB",
                    strokeOpacity: 0.9,
                    strokeWeight: 2,
                  }}
                />
              )}
              {/* Show dot markers at each drawing point */}
              {drawingMode && drawingPoints.map((pt, i) => (
                <Marker key={`dp-${i}`} position={pt} icon={makeDotIcon("#2563EB", 10)} />
              ))}

              {drawnPolygon && (
                <Polygon
                  paths={drawnPolygon}
                  options={{
                    fillColor: "#2563EB",
                    fillOpacity: 0.12,
                    strokeColor: "#2563EB",
                    strokeOpacity: 0.6,
                    strokeWeight: 2,
                    clickable: false,
                  }}
                />
              )}

              {/* Connection lines (render behind markers) */}
              {showConnections && connectionLines.map(line => (
                <Polyline
                  key={line.id}
                  path={[line.from, line.to]}
                  options={{
                    strokeColor: line.type === "substation" ? "#3b82f6" : "#64748B",
                    strokeOpacity: line.type === "substation" ? 0.4 : 0.3,
                    strokeWeight: line.type === "substation" ? 2 : 1,
                    clickable: false,
                  }}
                />
              ))}

              {/* Substation markers */}
              {showSubstations && substations.map(sub => (
                <Marker
                  key={`sub-${sub.id}`}
                  position={{ lat: sub.lat, lng: sub.lng }}
                  icon={makeSubstationIcon(sub.markerColor, sub.isPrimary)}
                  onClick={() => setClickedSubstation(sub)}
                  zIndex={sub.isPrimary ? 10 : 5}
                />
              ))}

              {meters.map(meter => {
                const online = isOnline(meter);
                return (
                  <MeterDot
                    key={meter.DRN}
                    meter={meter}
                    icon={makeDotIcon(online ? "#10B981" : "#EF4444")}
                    onClick={() => setClickedMeter(meter)}
                  />
                );
              })}

              {/* Substation InfoWindow */}
              {clickedSubstation && (
                <InfoWindow
                  position={{ lat: clickedSubstation.lat, lng: clickedSubstation.lng }}
                  onCloseClick={() => setClickedSubstation(null)}
                  options={{ pixelOffset: { width: 0, height: -14, equals: () => false } }}
                >
                  <Box sx={{ p: "4px 2px", minWidth: 160, color: "#1a1a2e" }}>
                    <Typography variant="subtitle2" fontWeight={700} fontSize="13px">
                      {clickedSubstation.name || `Substation ${clickedSubstation.id}`}
                    </Typography>
                    <Chip
                      label={clickedSubstation.isPrimary ? "Primary" : "Distribution"}
                      size="small"
                      sx={{
                        mt: 0.5,
                        height: 20,
                        fontSize: 10,
                        bgcolor: clickedSubstation.isPrimary ? "#DBEAFE" : "#FEF3C7",
                        color: clickedSubstation.isPrimary ? "#2563EB" : "#D97706",
                      }}
                    />
                    {clickedSubstation.district && (
                      <Typography variant="caption" display="block" color="#6B7280" mt={0.5} fontSize="10px">
                        District: {clickedSubstation.district}
                      </Typography>
                    )}
                    {clickedSubstation.regionData?.energy && (
                      <Typography variant="caption" display="block" color="#6B7280" mt={0.3} fontSize="10px">
                        Flow: {clickedSubstation.regionData.energy.direction === "net_exporting" ? "Exporting" : "Importing"}
                      </Typography>
                    )}
                    <Button
                      size="small"
                      onClick={() => { setClickedSubstation(null); navigate(`/substation/${clickedSubstation.drn || clickedSubstation.id}`); }}
                      sx={{
                        mt: 1,
                        width: "100%",
                        fontSize: "10px",
                        textTransform: "none",
                        bgcolor: "#2563EB",
                        color: "#fff",
                        py: "3px",
                        borderRadius: "6px",
                        "&:hover": { bgcolor: "#1D4ED8" },
                      }}
                    >
                      View Substation
                    </Button>
                  </Box>
                </InfoWindow>
              )}

              {clickedMeter && (() => {
                const lat = parseFloat(clickedMeter.Lat);
                const lng = parseFloat(clickedMeter.Longitude);
                if (isNaN(lat) || isNaN(lng)) return null;
                const online = isOnline(clickedMeter);
                return (
                  <InfoWindow
                    position={{ lat, lng }}
                    onCloseClick={() => setClickedMeter(null)}
                    options={{ pixelOffset: { width: 0, height: -10, equals: () => false } }}
                  >
                    <Box sx={{ p: "4px 2px", minWidth: 140, color: "#1a1a2e" }}>
                      <Typography variant="subtitle2" fontWeight={700} fontSize="13px" fontFamily="monospace">
                        {clickedMeter.DRN}
                      </Typography>
                      <Chip
                        label={online ? "Online" : "Offline"}
                        size="small"
                        sx={{
                          mt: 0.5,
                          height: 20,
                          fontSize: 10,
                          bgcolor: online ? "#ECFDF5" : "#FEF2F2",
                          color: online ? "#059669" : "#DC2626",
                        }}
                      />
                      {clickedMeter.LocationName && (
                        <Typography variant="caption" display="block" color="#6B7280" mt={0.5} fontSize="10px">
                          {clickedMeter.LocationName}
                        </Typography>
                      )}
                      <Button
                        size="small"
                        onClick={() => navigate(`/meter/${clickedMeter.DRN}`)}
                        sx={{
                          mt: 1,
                          width: "100%",
                          fontSize: "10px",
                          textTransform: "none",
                          bgcolor: "#2563EB",
                          color: "#fff",
                          py: "3px",
                          borderRadius: "6px",
                          "&:hover": { bgcolor: "#1D4ED8" },
                        }}
                      >
                        View Profile
                      </Button>
                    </Box>
                  </InfoWindow>
                );
              })()}
            </GoogleMap>
          </Box>
        </Box>

        {/* ===== RIGHT SIDEBAR ===== */}
        <Box sx={{
          width: 260,
          flexShrink: 0,
          borderLeft: `1px solid ${isDark ? "#1E293B" : "#E5E7EB"}`,
          pl: 0,
          display: "flex",
          flexDirection: "column",
          height: 710,
          overflowY: "auto",
          "&::-webkit-scrollbar": { width: 4 },
          "&::-webkit-scrollbar-thumb": { bgcolor: isDark ? "#374151" : "#D1D5DB", borderRadius: 4 },
        }}>
          <Box sx={{ px: 1.5, pt: 1.5, pb: 1 }}>
            {/* Header */}
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5}>
              <Box display="flex" alignItems="center" gap={0.75}>
                <Typography
                  variant="caption"
                  fontWeight={700}
                  color={labelColor}
                  letterSpacing="0.5px"
                  textTransform="uppercase"
                  fontSize="10px"
                >
                  Control Groups
                </Typography>
                <Chip
                  label={groups.length}
                  size="small"
                  sx={{
                    height: 18,
                    minWidth: 24,
                    fontSize: 10,
                    fontWeight: 600,
                    bgcolor: isDark ? "rgba(37,99,235,0.15)" : "#DBEAFE",
                    color: "#2563EB",
                    "& .MuiChip-label": { px: "5px" },
                  }}
                />
              </Box>
              <Button
                size="small"
                startIcon={<AddOutlined sx={{ fontSize: 14 }} />}
                onClick={() => setShowCreate(true)}
                sx={{
                  textTransform: "none",
                  fontSize: 11,
                  borderRadius: "6px",
                  color: "#2563EB",
                  minWidth: 0,
                  px: 1,
                  py: "3px",
                  "&:hover": { bgcolor: isDark ? "rgba(37,99,235,0.08)" : "#EFF6FF" },
                }}
              >
                Create
              </Button>
            </Box>

            {/* Groups list */}
            {groups.length === 0 ? (
              <Box sx={{ textAlign: "center", py: 3 }}>
                <GroupWorkOutlined sx={{ fontSize: 32, color: isDark ? colors.grey[500] : "#D1D5DB", mb: 0.5 }} />
                <Typography fontSize="12px" color={labelColor}>No groups yet</Typography>
                <Typography fontSize="10px" color={labelColor} mt={0.25}>
                  Create a group to organize meters
                </Typography>
              </Box>
            ) : (
              groups.map(g => {
                const meterCount = g.meters?.length || g.member_count || g.meter_count || 0;
                const typeColor = g.control_type === "mains" ? "#EF4444"
                  : g.control_type === "geyser" ? "#F59E0B" : "#2563EB";
                const schedule = g.schedule || null;
                const active = isGroupActive(g);
                return (
                  <Box
                    key={g.id}
                    onClick={() => navigate(`/load-control/group/${g.id}`)}
                    sx={{
                      p: "10px 12px",
                      mb: "6px",
                      borderRadius: "8px",
                      bgcolor: isDark ? "rgba(30,41,59,0.4)" : "rgba(249,250,251,0.8)",
                      border: `1px solid ${active ? "#10B981" : (isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)")}`,
                      cursor: "pointer",
                      transition: "all 0.15s",
                      "&:hover": {
                        borderColor: "#2563EB",
                        bgcolor: isDark ? "rgba(37,99,235,0.06)" : "rgba(37,99,235,0.03)",
                      },
                    }}
                  >
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.5}>
                      <Typography
                        fontSize="12px"
                        fontWeight={600}
                        color={headingColor}
                        noWrap
                        sx={{ maxWidth: 140 }}
                      >
                        {g.name}
                      </Typography>
                      {active ? (
                        <Chip label="ACTIVE" size="small" sx={{
                          height: 18, fontSize: 9, fontWeight: 700,
                          bgcolor: "rgba(16,185,129,0.15)", color: "#10B981",
                          border: "1px solid #10B981",
                          "& .MuiChip-label": { px: "5px" },
                        }} />
                      ) : (
                        <Chip label="IDLE" size="small" sx={{
                          height: 18, fontSize: 9, fontWeight: 600,
                          bgcolor: isDark ? "rgba(100,116,139,0.15)" : "rgba(100,116,139,0.1)",
                          color: "#94A3AF",
                          "& .MuiChip-label": { px: "5px" },
                        }} />
                      )}
                    </Box>
                    <Box display="flex" gap={0.5} alignItems="center" flexWrap="wrap">
                      <Typography fontSize="10px" color={labelColor}>
                        {meterCount} meters
                      </Typography>
                      <Chip
                        label={g.control_type || "load"}
                        size="small"
                        sx={{
                          height: 16,
                          fontSize: 8,
                          fontWeight: 500,
                          bgcolor: isDark ? `${typeColor}1A` : `${typeColor}15`,
                          color: typeColor,
                          textTransform: "capitalize",
                          "& .MuiChip-label": { px: "5px" },
                        }}
                      />
                    </Box>
                    {schedule?.enabled && schedule.periods?.[0] && (
                      <Typography fontSize="9px" color={labelColor} mt={0.5}>
                        {schedule.periods[0].startTime || "—"} – {schedule.periods[0].endTime || "—"}
                      </Typography>
                    )}
                  </Box>
                );
              })
            )}
          </Box>
        </Box>
      </Box>

      {/* ===== METERS TABLE ===== */}
      <Box sx={{ px: 3, pb: 4 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h5" fontWeight={600} color={headingColor}>
            All Meters
          </Typography>
          <Box display="flex" gap={1.5} alignItems="center">
            <TextField
              size="small"
              placeholder="Search DRN, name, area..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{
                width: 260,
                "& .MuiOutlinedInput-root": {
                  bgcolor: isDark ? colors.primary[400] : "#FFFFFF",
                  borderRadius: "8px",
                  height: 36,
                  fontSize: 13,
                  border: cardBorder,
                  "& fieldset": { border: "none" },
                },
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlined sx={{ fontSize: 18, color: labelColor }} />
                  </InputAdornment>
                ),
              }}
            />
            <IconButton
              size="small"
              onClick={fetchData}
              sx={{ color: labelColor, border: cardBorder, borderRadius: "8px", width: 36, height: 36 }}
            >
              <RefreshOutlined sx={{ fontSize: 18 }} />
            </IconButton>
            {selectedMeters.size > 0 && (
              <Button
                variant="contained"
                size="small"
                startIcon={<AddOutlined />}
                onClick={() => setShowCreate(true)}
                sx={{
                  textTransform: "none",
                  fontSize: 12,
                  borderRadius: "8px",
                  bgcolor: "#2563EB",
                  height: 36,
                  "&:hover": { bgcolor: "#1D4ED8" },
                }}
              >
                Create Group ({selectedMeters.size})
              </Button>
            )}
          </Box>
        </Box>

        <Box
          sx={{
            bgcolor: cardBg,
            border: cardBorder,
            borderRadius: "12px",
            overflow: "hidden",
          }}
        >
          <Box sx={{ maxHeight: 520, overflowY: "auto" }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell
                    padding="checkbox"
                    sx={{
                      bgcolor: isDark ? colors.primary[400] : "#F9FAFB",
                      borderColor: isDark ? "#1E293B" : "#E5E7EB",
                    }}
                  >
                    <Checkbox
                      size="small"
                      checked={selectedMeters.size === filteredMeters.length && filteredMeters.length > 0}
                      indeterminate={selectedMeters.size > 0 && selectedMeters.size < filteredMeters.length}
                      onChange={() => {
                        if (selectedMeters.size === filteredMeters.length) {
                          setSelectedMeters(new Set());
                        } else {
                          setSelectedMeters(new Set(filteredMeters.map(m => m.DRN)));
                        }
                      }}
                      sx={{ color: labelColor, "&.Mui-checked": { color: "#2563EB" } }}
                    />
                  </TableCell>
                  {["DRN", "Customer", "Area", "Status", "Mains", "Geyser", "Units (kWh)", "Tariff"].map(col => (
                    <TableCell
                      key={col}
                      sx={{
                        bgcolor: isDark ? colors.primary[400] : "#F9FAFB",
                        color: labelColor,
                        fontWeight: 600,
                        fontSize: 12,
                        borderColor: isDark ? "#1E293B" : "#E5E7EB",
                        py: 1.5,
                      }}
                    >
                      {col}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredMeters.map(m => {
                  const online = isOnline(m);
                  const mainsOn = m.mains_state === "1" || m.mains_state === 1;
                  const geyserOn = m.geyser_state === "1" || m.geyser_state === 1;
                  return (
                    <TableRow
                      key={m.DRN}
                      hover
                      sx={{
                        cursor: "pointer",
                        "&:hover": { bgcolor: isDark ? "rgba(37,99,235,0.05)" : "#F9FAFB" },
                      }}
                    >
                      <TableCell
                        padding="checkbox"
                        sx={{ borderColor: isDark ? "#1E293B" : "#E5E7EB" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          size="small"
                          checked={selectedMeters.has(m.DRN)}
                          onChange={() => toggleMeter(m.DRN)}
                          sx={{ color: labelColor, "&.Mui-checked": { color: "#2563EB" } }}
                        />
                      </TableCell>
                      <TableCell
                        sx={{
                          color: headingColor,
                          fontWeight: 600,
                          fontSize: 12,
                          fontFamily: "monospace",
                          borderColor: isDark ? "#1E293B" : "#E5E7EB",
                        }}
                        onClick={() => navigate(`/meter/${m.DRN}`)}
                      >
                        {m.DRN}
                      </TableCell>
                      <TableCell
                        sx={{ color: isDark ? colors.grey[200] : "#374151", fontSize: 12, borderColor: isDark ? "#1E293B" : "#E5E7EB" }}
                        onClick={() => navigate(`/meter/${m.DRN}`)}
                      >
                        {m.customerName || "---"}
                      </TableCell>
                      <TableCell
                        sx={{ color: labelColor, fontSize: 12, borderColor: isDark ? "#1E293B" : "#E5E7EB" }}
                        onClick={() => navigate(`/meter/${m.DRN}`)}
                      >
                        {m.LocationName || "---"}
                      </TableCell>
                      <TableCell sx={{ borderColor: isDark ? "#1E293B" : "#E5E7EB" }} onClick={() => navigate(`/meter/${m.DRN}`)}>
                        <Chip
                          label={online ? "Online" : "Offline"}
                          size="small"
                          sx={{
                            height: 22,
                            fontSize: 10,
                            fontWeight: 500,
                            bgcolor: online
                              ? isDark ? "rgba(16,185,129,0.15)" : "#ECFDF5"
                              : isDark ? "rgba(239,68,68,0.15)" : "#FEF2F2",
                            color: online ? "#10B981" : "#EF4444",
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ borderColor: isDark ? "#1E293B" : "#E5E7EB" }} onClick={() => navigate(`/meter/${m.DRN}`)}>
                        <Chip
                          icon={<BoltOutlined sx={{ fontSize: 12 }} />}
                          label={mainsOn ? "ON" : "OFF"}
                          size="small"
                          sx={{
                            height: 22,
                            fontSize: 10,
                            bgcolor: mainsOn
                              ? isDark ? "rgba(16,185,129,0.12)" : "#ECFDF5"
                              : isDark ? "rgba(239,68,68,0.12)" : "#FEF2F2",
                            color: mainsOn ? "#10B981" : "#EF4444",
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ borderColor: isDark ? "#1E293B" : "#E5E7EB" }} onClick={() => navigate(`/meter/${m.DRN}`)}>
                        <Chip
                          icon={<WaterDropOutlined sx={{ fontSize: 12 }} />}
                          label={geyserOn ? "ON" : "OFF"}
                          size="small"
                          sx={{
                            height: 22,
                            fontSize: 10,
                            bgcolor: geyserOn
                              ? isDark ? "rgba(245,158,11,0.12)" : "#FFFBEB"
                              : isDark ? "rgba(100,116,139,0.12)" : "#F3F4F6",
                            color: geyserOn ? "#F59E0B" : (isDark ? colors.grey[500] : "#9CA3AF"),
                          }}
                        />
                      </TableCell>
                      <TableCell
                        sx={{ color: isDark ? colors.grey[200] : "#374151", fontSize: 12, borderColor: isDark ? "#1E293B" : "#E5E7EB" }}
                        onClick={() => navigate(`/meter/${m.DRN}`)}
                      >
                        {m.CumulativeUnits || m.credit || "—"}
                      </TableCell>
                      <TableCell
                        sx={{ color: isDark ? colors.grey[200] : "#374151", fontSize: 12, borderColor: isDark ? "#1E293B" : "#E5E7EB" }}
                        onClick={() => navigate(`/meter/${m.DRN}`)}
                      >
                        {m.tariff_type || m.TariffType || "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        </Box>
      </Box>

      {/* ===== CREATE GROUP DIALOG ===== */}
      <Dialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: isDark ? colors.primary[400] : "#FFFFFF",
            borderRadius: "16px",
            border: cardBorder,
          },
        }}
      >
        <DialogTitle sx={{ color: headingColor, fontWeight: 600, pb: 1 }}>
          Create Control Group
        </DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Group Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            sx={{ mt: 1, mb: 2 }}
            size="small"
          />
          <TextField
            fullWidth
            label="Description (optional)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            sx={{ mb: 2 }}
            size="small"
            multiline
            rows={2}
          />
          <FormControl fullWidth size="small" sx={{ mb: 2 }}>
            <Select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              displayEmpty
            >
              <MenuItem value="geyser">Geyser Only</MenuItem>
              <MenuItem value="mains">Mains Only</MenuItem>
              <MenuItem value="both">Both (Mains + Geyser)</MenuItem>
              <MenuItem value="calibration">Calibration</MenuItem>
            </Select>
          </FormControl>

          {/* Power Limit */}
          <TextField
            fullWidth
            label="Power Limit (Watts)"
            type="number"
            value={newPowerLimit}
            onChange={(e) => setNewPowerLimit(Math.min(10000, Math.max(0, Number(e.target.value))))}
            size="small"
            sx={{ mb: 2 }}
            inputProps={{ min: 0, max: 10000 }}
            InputProps={{
              endAdornment: <InputAdornment position="end">W</InputAdornment>,
            }}
          />

          {/* Schedule Section */}
          <Box sx={{ border: cardBorder, borderRadius: "10px", p: 2, mb: 2 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={scheduleEnabled}
                  onChange={(e) => setScheduleEnabled(e.target.checked)}
                  size="small"
                  sx={{ "& .MuiSwitch-switchBase.Mui-checked": { color: "#2563EB" }, "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": { bgcolor: "#2563EB" } }}
                />
              }
              label={<Typography variant="subtitle2" fontWeight={600} color={headingColor}>Enable Schedule</Typography>}
            />
            {scheduleEnabled && (
              <Box sx={{ mt: 1.5 }}>
                <Box display="flex" gap={1.5} mb={1.5}>
                  <TextField
                    label="Start Time"
                    type="time"
                    value={scheduleStartTime}
                    onChange={(e) => setScheduleStartTime(e.target.value)}
                    size="small"
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                  />
                  <TextField
                    label="End Time"
                    type="time"
                    value={scheduleEndTime}
                    onChange={(e) => setScheduleEndTime(e.target.value)}
                    size="small"
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                  />
                </Box>
                <Typography variant="caption" color={labelColor} display="block" mb={0.5}>Days of Week</Typography>
                <Box display="flex" gap={0.5} flexWrap="wrap" mb={1.5}>
                  {[
                    { label: "Mon", value: 1 },
                    { label: "Tue", value: 2 },
                    { label: "Wed", value: 3 },
                    { label: "Thu", value: 4 },
                    { label: "Fri", value: 5 },
                    { label: "Sat", value: 6 },
                    { label: "Sun", value: 0 },
                  ].map(day => {
                    const active = scheduleDays.includes(day.value);
                    return (
                      <Chip
                        key={day.value}
                        label={day.label}
                        size="small"
                        onClick={() => {
                          setScheduleDays(prev =>
                            active ? prev.filter(d => d !== day.value) : [...prev, day.value]
                          );
                        }}
                        sx={{
                          height: 28,
                          fontSize: 11,
                          fontWeight: 500,
                          cursor: "pointer",
                          bgcolor: active ? (isDark ? "rgba(37,99,235,0.2)" : "#DBEAFE") : (isDark ? "rgba(100,116,139,0.12)" : "#F3F4F6"),
                          color: active ? "#2563EB" : labelColor,
                          border: active ? "1px solid #2563EB" : "1px solid transparent",
                          "&:hover": { bgcolor: active ? (isDark ? "rgba(37,99,235,0.3)" : "#BFDBFE") : (isDark ? "rgba(100,116,139,0.2)" : "#E5E7EB") },
                        }}
                      />
                    );
                  })}
                </Box>
                <Box display="flex" gap={1.5}>
                  <TextField
                    label="Start Date"
                    type="date"
                    value={scheduleStartDate}
                    onChange={(e) => setScheduleStartDate(e.target.value)}
                    size="small"
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                  />
                  <TextField
                    label="End Date (optional)"
                    type="date"
                    value={scheduleEndDate}
                    onChange={(e) => setScheduleEndDate(e.target.value)}
                    size="small"
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                  />
                </Box>
              </Box>
            )}
          </Box>

          {/* Calibration Section */}
          {(newType === "calibration" || newType === "both") && (
            <Box sx={{ border: cardBorder, borderRadius: "10px", p: 2, mb: 1 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={calibrationEnabled}
                    onChange={(e) => setCalibrationEnabled(e.target.checked)}
                    size="small"
                    sx={{ "& .MuiSwitch-switchBase.Mui-checked": { color: "#8B5CF6" }, "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": { bgcolor: "#8B5CF6" } }}
                  />
                }
                label={<Typography variant="subtitle2" fontWeight={600} color={headingColor}>Enable Calibration Routine</Typography>}
              />
              {calibrationEnabled && (
                <Box sx={{ mt: 1.5 }}>
                  <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
                    <InputLabel>Recalibration Period</InputLabel>
                    <Select
                      value={calibrationPeriod}
                      onChange={(e) => setCalibrationPeriod(e.target.value)}
                      label="Recalibration Period"
                    >
                      <MenuItem value="daily">Daily</MenuItem>
                      <MenuItem value="weekly">Weekly</MenuItem>
                      <MenuItem value="bi-weekly">Bi-Weekly</MenuItem>
                      <MenuItem value="monthly">Monthly</MenuItem>
                    </Select>
                  </FormControl>
                  <TextField
                    label="Preferred Time"
                    type="time"
                    value={calibrationTime}
                    onChange={(e) => setCalibrationTime(e.target.value)}
                    size="small"
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                  />
                </Box>
              )}
            </Box>
          )}

          {selectedMeters.size > 0 && (
            <Alert severity="info" sx={{ mt: 2, borderRadius: "8px" }}>
              {selectedMeters.size} selected meter(s) will be added to this group
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setShowCreate(false)}
            sx={{ color: labelColor, borderRadius: "8px", textTransform: "none" }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            variant="contained"
            sx={{ bgcolor: "#2563EB", borderRadius: "8px", textTransform: "none", "&:hover": { bgcolor: "#1D4ED8" } }}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* ===== SNACKBAR ===== */}
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
          sx={{ borderRadius: "10px" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
