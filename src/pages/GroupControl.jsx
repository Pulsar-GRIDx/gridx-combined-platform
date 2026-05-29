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
  InputLabel,
  Slider,
  Tooltip,
  Switch,
  FormControlLabel,
  Alert,
  Snackbar,
  Divider,
  Paper,
  Collapse,
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
  BuildOutlined,
  VerifiedOutlined,
  SpeedOutlined,
  LayersOutlined,
  MapOutlined,
  SignalCellularAltOutlined,
  RouterOutlined,
  InfoOutlined,
  AccountTreeOutlined,
} from "@mui/icons-material";
import {
  GoogleMap,
  useJsApiLoader,
  Marker,
  Polygon,
  Polyline,
  InfoWindow,
} from "@react-google-maps/api";
import Header from "../components/Header";
import { tokens } from "../theme";
import { groupControlAPI, meterAPI, energyAnalyticsAPI } from "../services/api";
import EnergyAnalytics, { getSubstationMarkers, getConnectionLines } from "../components/EnergyAnalytics";

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
function makeMarkerIcon(fillColor, borderColor, innerSymbol, size = 40) {
  const half = size / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="2" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <circle cx="${half}" cy="${half}" r="${half - 6}" fill="${fillColor}" filter="url(#glow)"/>
    <circle cx="${half}" cy="${half}" r="${half - 6}" fill="none" stroke="${borderColor}" stroke-width="2"/>
    ${innerSymbol}
  </svg>`;
  return {
    url: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    scaledSize: { width: size, height: size, equals: () => false },
    anchor: { x: half, y: half, equals: () => false },
  };
}

function iconMainsOnGeyserOn() {
  return makeMarkerIcon("#4cceac", "rgba(255,255,255,0.8)",
    `<path d="M17 12 L14 20 H18 L16 26 L24 18 H20 L22 12 Z" fill="white" opacity="0.95"/>`, 40);
}
function iconMainsOnGeyserOff() {
  return makeMarkerIcon("#f2b705", "rgba(255,255,255,0.8)",
    `<path d="M17 12 L14 20 H18 L16 26 L24 18 H20 L22 12 Z" fill="white" opacity="0.95"/>`, 40);
}
function iconMainsOff() {
  return makeMarkerIcon("#db4f4a", "rgba(255,255,255,0.8)",
    `<line x1="14" y1="14" x2="26" y2="26" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
     <line x1="26" y1="14" x2="14" y2="26" stroke="white" stroke-width="2.5" stroke-linecap="round"/>`, 40);
}
function iconOffline() {
  return makeMarkerIcon("#4a5568", "rgba(255,255,255,0.5)",
    `<circle cx="20" cy="20" r="3" fill="white" opacity="0.6"/>`, 40);
}
function iconSelected() {
  return makeMarkerIcon("#6870fa", "rgba(255,255,255,0.9)",
    `<path d="M17 12 L14 20 H18 L16 26 L24 18 H20 L22 12 Z" fill="white"/>`, 44);
}
function iconHighlighted() {
  return makeMarkerIcon("#06b6d4", "rgba(255,255,255,0.9)",
    `<path d="M17 12 L14 20 H18 L16 26 L24 18 H20 L22 12 Z" fill="white"/>`, 44);
}

function iconSubstationPrimary(highlighted = false) {
  const size = 52;
  const half = size / 2;
  const fillColor = highlighted ? "#06b6d4" : "#3b82f6";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs>
      <filter id="glow-p" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="3" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <rect x="6" y="6" width="${size-12}" height="${size-12}" rx="8" fill="${fillColor}" filter="url(#glow-p)" opacity="0.9"/>
    <rect x="6" y="6" width="${size-12}" height="${size-12}" rx="8" fill="none" stroke="white" stroke-width="2" opacity="0.8"/>
    <path d="M20 16 L17 24 H21 L19 30 L28 22 H24 L26 16 Z" fill="white" opacity="0.95"/>
    <path d="M30 16 L27 24 H31 L29 30 L38 22 H34 L36 16 Z" fill="white" opacity="0.7"/>
  </svg>`;
  return {
    url: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    scaledSize: { width: size, height: size, equals: () => false },
    anchor: { x: half, y: half, equals: () => false },
  };
}

function iconSubstationDist(color, highlighted = false) {
  const size = 44;
  const half = size / 2;
  const fillColor = highlighted ? "#06b6d4" : color;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs>
      <filter id="glow-d" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="2" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <polygon points="${half},4 ${size-4},${half} ${half},${size-4} 4,${half}" fill="${fillColor}" filter="url(#glow-d)" opacity="0.85"/>
    <polygon points="${half},4 ${size-4},${half} ${half},${size-4} 4,${half}" fill="none" stroke="white" stroke-width="1.5" opacity="0.7"/>
    <path d="M18 14 L15 22 H19 L17 28 L26 20 H22 L24 14 Z" fill="white" opacity="0.9"/>
  </svg>`;
  return {
    url: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    scaledSize: { width: size, height: size, equals: () => false },
    anchor: { x: half, y: half, equals: () => false },
  };
}

/* ---- Memoized Meter Marker ---- */
const MeterMarker = memo(function MeterMarker({ meter, icon, onClick }) {
  const lat = parseFloat(meter.Lat);
  const lng = parseFloat(meter.Longitude);
  if (isNaN(lat) || isNaN(lng)) return null;
  return (
    <Marker
      key={meter.DRN}
      position={{ lat, lng }}
      icon={icon}
      onClick={onClick}
      title={`${meter.DRN} - ${meter.LocationName || ""}`}
    />
  );
});

/* ================================================================== */
/* Group Control Page                                                  */
/* ================================================================== */
export default function GroupControl() {
  const navigate = useNavigate();
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
  const [selectionMode, setSelectionMode] = useState(false);

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

  // Energy analytics overlays
  const [substationConfig, setSubstationConfig] = useState([]);
  const [powerFlowData, setPowerFlowData] = useState([]);
  const [analyticsRegions, setAnalyticsRegions] = useState([]);

  // Substation popup
  const [hoveredSubstation, setHoveredSubstation] = useState(null);

  // ---- Layer toggles ----
  const [layerPanelOpen, setLayerPanelOpen] = useState(true);
  const [layers, setLayers] = useState({
    meterMarkers: true,
    meterToSubLines: false,
    substationToMainLines: true,
    flowAnimation: true,
    districtBoundaries: false,
    substationMarkers: true,
  });

  // ---- District boundary data ----
  const [suburbBoundaries, setSuburbBoundaries] = useState({});
  const [districtStats, setDistrictStats] = useState([]);
  const [clickedDistrict, setClickedDistrict] = useState(null);

  // ---- Meter detail popup ----
  const [clickedMeter, setClickedMeter] = useState(null);
  const [meterDetail, setMeterDetail] = useState(null);
  const [meterDetailLoading, setMeterDetailLoading] = useState(false);

  // ---- Topology highlight ----
  const [highlightedSubstations, setHighlightedSubstations] = useState(new Set());
  const [highlightedMeters, setHighlightedMeters] = useState(new Set());
  const [tracePathDrn, setTracePathDrn] = useState(null);

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

  // Fetch energy analytics overlay data
  useEffect(() => {
    async function loadAnalytics() {
      try {
        const [scRes, pfRes, regRes] = await Promise.allSettled([
          energyAnalyticsAPI.getSubstationConfig(),
          energyAnalyticsAPI.getPowerFlow(),
          energyAnalyticsAPI.getRegionalSummary(),
        ]);
        if (scRes.status === "fulfilled") setSubstationConfig(Array.isArray(scRes.value) ? scRes.value : []);
        if (pfRes.status === "fulfilled") setPowerFlowData(Array.isArray(pfRes.value) ? pfRes.value : []);
        if (regRes.status === "fulfilled") setAnalyticsRegions(Array.isArray(regRes.value) ? regRes.value : []);
      } catch {}
    }
    loadAnalytics();
    const interval = setInterval(loadAnalytics, 15000);
    return () => clearInterval(interval);
  }, []);

  // Fetch suburb boundaries and district stats on mount
  useEffect(() => {
    async function loadBoundaries() {
      try {
        const [boundRes, statsRes] = await Promise.allSettled([
          energyAnalyticsAPI.getSuburbBoundaries(),
          energyAnalyticsAPI.getDistrictStats(),
        ]);
        if (boundRes.status === "fulfilled" && boundRes.value) {
          setSuburbBoundaries(boundRes.value);
        }
        if (statsRes.status === "fulfilled" && Array.isArray(statsRes.value)) {
          setDistrictStats(statsRes.value);
        }
      } catch {}
    }
    loadBoundaries();
  }, []);

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

  /* ---- Substation markers & flow lines for map ---- */
  const substationMarkers = useMemo(() =>
    getSubstationMarkers(substationConfig, analyticsRegions),
  [substationConfig, analyticsRegions]);

  // All connection lines (substation-to-main)
  const allConnectionLines = useMemo(() =>
    getConnectionLines(substationConfig, powerFlowData),
  [substationConfig, powerFlowData]);

  // Filtered connection lines by layer visibility
  const connectionLines = useMemo(() => {
    if (!layers.substationToMainLines && !layers.meterToSubLines) return [];
    return allConnectionLines.filter(line => {
      if (line.type === "substation") return layers.substationToMainLines;
      if (line.type === "meter") return layers.meterToSubLines;
      return false;
    });
  }, [allConnectionLines, layers.substationToMainLines, layers.meterToSubLines]);

  /* ---- Polygon fill color based on district stats ---- */
  const getDistrictPolygonColor = useCallback((suburbName) => {
    const stat = districtStats.find(d =>
      d.district?.toLowerCase() === suburbName?.toLowerCase() ||
      d.suburb?.toLowerCase() === suburbName?.toLowerCase()
    );
    if (!stat) return { fill: "rgba(100,100,120,0.15)", stroke: "rgba(150,150,170,0.4)" };
    if (stat.net_direction === "exporting") return { fill: "rgba(34,197,94,0.12)", stroke: "rgba(34,197,94,0.5)" };
    if (stat.net_direction === "importing") return { fill: "rgba(245,158,11,0.12)", stroke: "rgba(245,158,11,0.5)" };
    return { fill: "rgba(100,100,120,0.10)", stroke: "rgba(150,150,170,0.35)" };
  }, [districtStats]);

  /* ---- Get marker icon based on state ---- */
  const getMarkerIcon = useCallback((meter) => {
    if (highlightedMeters.has(meter.DRN)) return iconHighlighted();
    if (selectedMeters.has(meter.DRN)) return iconSelected();
    const isOnline = meter.Status === "1" || meter.Status === 1 || meter.Status === "Active";
    if (!isOnline) return iconOffline();
    const mainsOn = meter.mains_state === "1" || meter.mains_state === 1;
    const geyserOn = meter.geyser_state === "1" || meter.geyser_state === 1;
    if (!mainsOn) return iconMainsOff();
    if (mainsOn && !geyserOn) return iconMainsOnGeyserOff();
    return iconMainsOnGeyserOn();
  }, [selectedMeters, highlightedMeters]);

  /* ---- Map click: select meter OR show detail ---- */
  const handleMeterClick = useCallback((meter) => {
    if (selectionMode) {
      setSelectedMeters(prev => {
        const next = new Set(prev);
        if (next.has(meter.DRN)) {
          next.delete(meter.DRN);
        } else {
          next.add(meter.DRN);
        }
        return next;
      });
      return;
    }
    // Show detail popup
    setClickedMeter(meter);
    setTracePathDrn(null);
  }, [selectionMode]);

  /* ---- Substation click: topology highlight ---- */
  const handleSubstationClick = useCallback((sub) => {
    setHoveredSubstation(prev => prev?.id === sub.id ? null : sub);

    if (sub.isPrimary) {
      // Highlight all child distribution substations
      const childIds = substationConfig
        .filter(s => s.type === "distribution" && (
          s.parent_id === sub.id ||
          (s.parent_lat && Math.abs(s.parent_lat - sub.lat) < 0.001 && Math.abs(s.parent_lng - sub.lng) < 0.001)
        ))
        .map(s => s.id);
      setHighlightedSubstations(new Set(childIds.length ? childIds : []));
      setHighlightedMeters(new Set());
    } else {
      // Distribution substation: highlight connected meters
      const distSub = substationConfig.find(s => s.id === sub.id);
      if (distSub) {
        const connectedMeters = powerFlowData
          .filter(m => m.lat && m.lng && Math.sqrt(
            Math.pow(m.lat - distSub.lat, 2) + Math.pow(m.lng - distSub.lng, 2)
          ) < 0.05)
          .map(m => m.drn);
        setHighlightedMeters(new Set(connectedMeters));
      }
      setHighlightedSubstations(new Set([sub.id]));
    }
  }, [substationConfig, powerFlowData]);

  /* ---- Trace path for open meter popup ---- */
  const handleTracePath = useCallback((drn) => {
    const meter = meters.find(m => m.DRN === drn);
    if (!meter) return;
    const lat = parseFloat(meter.Lat);
    const lng = parseFloat(meter.Longitude);
    if (isNaN(lat) || isNaN(lng)) return;

    const distSubs = substationConfig.filter(s => s.type === "distribution");
    let nearest = null;
    let minDist = Infinity;
    distSubs.forEach(sub => {
      const d = Math.sqrt(Math.pow(lat - sub.lat, 2) + Math.pow(lng - sub.lng, 2));
      if (d < minDist) { minDist = d; nearest = sub; }
    });
    if (nearest) {
      setHighlightedSubstations(new Set([nearest.id]));
      setHighlightedMeters(new Set([drn]));
      setTracePathDrn(drn);
    }
  }, [meters, substationConfig]);

  /* ---- View connected meters from substation popup ---- */
  const handleViewConnectedMeters = useCallback((sub) => {
    const distSub = substationConfig.find(s => s.id === sub.id);
    if (!distSub) return;
    const connectedMeters = powerFlowData
      .filter(m => m.lat && m.lng && Math.sqrt(
        Math.pow(m.lat - distSub.lat, 2) + Math.pow(m.lng - distSub.lng, 2)
      ) < 0.05)
      .map(m => m.drn);
    setHighlightedMeters(new Set(connectedMeters));
    setSnackbar({ open: true, message: `Highlighting ${connectedMeters.length} connected meter(s)`, severity: "info" });
  }, [substationConfig, powerFlowData]);

  /* ---- Clear topology highlights ---- */
  const clearHighlights = useCallback(() => {
    setHighlightedSubstations(new Set());
    setHighlightedMeters(new Set());
    setTracePathDrn(null);
  }, []);

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
        reason: controlReason || (controlAction.startsWith("calibrate") ? `Calibration: ${controlAction}` : `Load control: ${controlAction}`),
        meter_drns: Array.from(selectedMeters),
      });
      setShowControlDialog(false);
      setControlReason("");
      setSnackbar({
        open: true,
        message: `${res?.message || "Command sent"} (${res?.succeeded || 0}/${res?.total || 0})`,
        severity: "success",
      });
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

  /* ---- Trigger reverse geocode ---- */
  const handleTriggerReverseGeocode = async () => {
    try {
      await energyAnalyticsAPI.triggerReverseGeocode();
      setSnackbar({ open: true, message: "Reverse geocoding triggered for unassigned meters", severity: "success" });
    } catch (err) {
      setSnackbar({ open: true, message: err?.message || "Failed to trigger reverse geocoding", severity: "error" });
    }
  };

  /* ---- Toggle a single layer ---- */
  const toggleLayer = useCallback((key) => {
    setLayers(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

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
    <Box m="10px 20px" display="flex" flexDirection="column" sx={{ minHeight: "calc(100vh - 80px)" }}>
      <Header title="GROUP CONTROL" subtitle="Group-based ripple control, load management & calibration" />

      <Box height="calc(100vh - 200px)" minHeight="500px" display="flex" gap="12px" overflow="hidden" mt="8px">
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
          <Box sx={{ bgcolor: colors.primary[400], borderRadius: "8px", p: "8px" }}>
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
            <Box sx={{ bgcolor: colors.primary[400], borderRadius: "8px", p: "8px" }}>
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
          <Box sx={{ bgcolor: colors.primary[400], borderRadius: "8px", p: "8px", flex: 1, overflowY: "auto" }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb="6px">
              <Typography variant="subtitle2" color={colors.grey[300]}>
                Areas ({areaSummary.length})
              </Typography>
              <Tooltip title="Trigger reverse geocoding for meters without suburb assignment">
                <IconButton
                  size="small"
                  onClick={handleTriggerReverseGeocode}
                  sx={{ color: "#6870fa", p: "2px" }}
                >
                  <RouterOutlined sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
            </Box>
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
                    <Typography variant="caption" color="#4cceac" fontSize="9px">{a.online} online</Typography>
                    <Typography variant="caption" color="#db4f4a" fontSize="9px">{a.mainsOff} mains off</Typography>
                    <Typography variant="caption" color="#f2b705" fontSize="9px">{a.geyserOff} geyser off</Typography>
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
            <IconButton size="small" onClick={fetchData} sx={{ color: colors.grey[400] }}>
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
            {(highlightedSubstations.size > 0 || highlightedMeters.size > 0) && (
              <Button
                size="small"
                onClick={clearHighlights}
                startIcon={<CancelOutlined />}
                sx={{ textTransform: "none", fontSize: "11px", color: "#06b6d4", borderColor: "#06b6d4" }}
                variant="outlined"
              >
                Clear Highlights
              </Button>
            )}
          </Box>

          {/* Map */}
          <Box flex={1} borderRadius="10px" overflow="hidden" border={`1px solid ${colors.primary[400]}`} position="relative">
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
              {/* District boundary polygons */}
              {layers.districtBoundaries && Object.entries(suburbBoundaries).map(([suburbName, coords]) => {
                if (!Array.isArray(coords) || coords.length < 3) return null;
                const { fill, stroke } = getDistrictPolygonColor(suburbName);
                return (
                  <Polygon
                    key={`district-${suburbName}`}
                    paths={coords}
                    options={{
                      fillColor: fill,
                      fillOpacity: 1,
                      strokeColor: stroke,
                      strokeOpacity: 1,
                      strokeWeight: 1.5,
                    }}
                    onClick={() => {
                      const stat = districtStats.find(d =>
                        d.district?.toLowerCase() === suburbName?.toLowerCase() ||
                        d.suburb?.toLowerCase() === suburbName?.toLowerCase()
                      );
                      setClickedDistrict({ name: suburbName, stat, coords });
                    }}
                  />
                );
              })}

              {/* Meter markers */}
              {layers.meterMarkers && filteredMeters.map(meter => {
                const lat = parseFloat(meter.Lat);
                const lng = parseFloat(meter.Longitude);
                if (isNaN(lat) || isNaN(lng)) return null;
                return (
                  <MeterMarker
                    key={meter.DRN}
                    meter={meter}
                    icon={getMarkerIcon(meter)}
                    onClick={() => handleMeterClick(meter)}
                  />
                );
              })}

              {/* Substation markers */}
              {layers.substationMarkers && substationMarkers.map(sub => {
                if (!sub.lat || !sub.lng) return null;
                const isHighlighted = highlightedSubstations.has(sub.id);
                return (
                  <Marker
                    key={`sub-${sub.id}`}
                    position={{ lat: sub.lat, lng: sub.lng }}
                    icon={sub.isPrimary
                      ? iconSubstationPrimary(isHighlighted)
                      : iconSubstationDist(sub.markerColor, isHighlighted)
                    }
                    title={sub.name}
                    onClick={() => handleSubstationClick(sub)}
                    zIndex={sub.isPrimary ? 1000 : 900}
                  />
                );
              })}

              {/* Substation info window */}
              {hoveredSubstation && (
                <InfoWindow
                  position={{ lat: hoveredSubstation.lat, lng: hoveredSubstation.lng }}
                  onCloseClick={() => { setHoveredSubstation(null); clearHighlights(); }}
                  options={{ pixelOffset: { width: 0, height: -24, equals: () => false } }}
                >
                  <Box sx={{ p: "6px", minWidth: 160, color: "#1a1a2e", textAlign: "center" }}>
                    <Typography variant="caption" fontSize="10px" color="#888" display="block">
                      {hoveredSubstation.isPrimary ? "Primary Substation" : "Distribution Substation"}
                    </Typography>
                    <Typography variant="subtitle2" fontWeight={700} fontSize="13px" fontFamily="monospace" mt="2px">
                      {hoveredSubstation.drn || hoveredSubstation.name}
                    </Typography>
                    <Typography variant="caption" fontSize="10px" display="block" color="#555" mb="6px">
                      {hoveredSubstation.name}
                    </Typography>
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => navigate(`/substation/${hoveredSubstation.drn}`)}
                      sx={{
                        width: "100%",
                        fontSize: "10px",
                        textTransform: "none",
                        bgcolor: "#3b82f6",
                        color: "#fff",
                        py: "3px",
                        "&:hover": { bgcolor: "#2563eb" },
                      }}
                    >
                      View Profile
                    </Button>
                  </Box>
                </InfoWindow>
              )}

              {/* Meter info window */}
              {clickedMeter && (() => {
                const lat = parseFloat(clickedMeter.Lat);
                const lng = parseFloat(clickedMeter.Longitude);
                if (isNaN(lat) || isNaN(lng)) return null;
                return (
                  <InfoWindow
                    position={{ lat, lng }}
                    onCloseClick={() => { setClickedMeter(null); setMeterDetail(null); setTracePathDrn(null); clearHighlights(); }}
                    options={{ pixelOffset: { width: 0, height: -24, equals: () => false } }}
                  >
                    <Box sx={{ p: "6px", minWidth: 160, color: "#1a1a2e", textAlign: "center" }}>
                      <Typography variant="caption" fontSize="10px" color="#888" display="block">
                        Smart Meter
                      </Typography>
                      <Typography variant="subtitle2" fontWeight={700} fontSize="13px" fontFamily="monospace" mt="2px">
                        {clickedMeter.DRN}
                      </Typography>
                      <Typography variant="caption" fontSize="10px" display="block" color="#555" mb="6px">
                        {clickedMeter.LocationName || clickedMeter.Suburb || ""}
                      </Typography>
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() => navigate(`/meter/${clickedMeter.DRN}`)}
                        sx={{
                          width: "100%",
                          fontSize: "10px",
                          textTransform: "none",
                          bgcolor: "#3b82f6",
                          color: "#fff",
                          py: "3px",
                          "&:hover": { bgcolor: "#2563eb" },
                        }}
                      >
                        View Profile
                      </Button>
                    </Box>
                  </InfoWindow>
                );
              })()}

              {/* District stats info window */}
              {clickedDistrict && (() => {
                const centroid = clickedDistrict.coords.length > 0
                  ? {
                      lat: clickedDistrict.coords.reduce((s, c) => s + c.lat, 0) / clickedDistrict.coords.length,
                      lng: clickedDistrict.coords.reduce((s, c) => s + c.lng, 0) / clickedDistrict.coords.length,
                    }
                  : DEFAULT_CENTER;
                return (
                  <InfoWindow
                    position={centroid}
                    onCloseClick={() => setClickedDistrict(null)}
                    options={{ pixelOffset: { width: 0, height: -10, equals: () => false } }}
                  >
                    <Box sx={{ p: "4px", minWidth: 200, color: "#1a1a2e" }}>
                      <Typography variant="subtitle2" fontWeight={700} fontSize="12px" gutterBottom>
                        {clickedDistrict.name}
                      </Typography>
                      {clickedDistrict.stat ? (
                        <Box display="grid" gridTemplateColumns="1fr 1fr" gap="4px" mt="4px">
                          {[
                            { label: "Total Meters", value: clickedDistrict.stat.total_meters ?? "—" },
                            { label: "Online", value: clickedDistrict.stat.online_meters ?? "—" },
                            { label: "Offline", value: clickedDistrict.stat.offline_meters ?? "—" },
                            { label: "Total Load", value: clickedDistrict.stat.total_load_w != null ? `${(clickedDistrict.stat.total_load_w / 1000).toFixed(2)} kW` : "—" },
                            { label: "Total Export", value: clickedDistrict.stat.total_export_w != null ? `${(clickedDistrict.stat.total_export_w / 1000).toFixed(2)} kW` : "—" },
                            { label: "Net Demand", value: clickedDistrict.stat.net_demand_w != null ? `${(clickedDistrict.stat.net_demand_w / 1000).toFixed(2)} kW` : "—" },
                            { label: "Avg Voltage", value: clickedDistrict.stat.avg_voltage != null ? `${clickedDistrict.stat.avg_voltage.toFixed(1)} V` : "—" },
                            { label: "Direction", value: clickedDistrict.stat.net_direction || "—" },
                          ].map(item => (
                            <Box key={item.label}>
                              <Typography variant="caption" fontSize="9px" color="#9ca3af" display="block">{item.label}</Typography>
                              <Typography variant="caption" fontSize="10px" color="#374151" fontWeight={600}>{item.value}</Typography>
                            </Box>
                          ))}
                        </Box>
                      ) : (
                        <Typography variant="caption" fontSize="10px" color="#6b7280">No stats available</Typography>
                      )}
                    </Box>
                  </InfoWindow>
                );
              })()}

              {/* Power flow connection lines */}
              {connectionLines.map(line => (
                <Polyline
                  key={line.id}
                  path={[line.from, line.to]}
                  options={{
                    strokeColor: line.color,
                    strokeOpacity: 0.7,
                    strokeWeight: line.weight,
                    icons: layers.flowAnimation ? (line.type === "meter" ? [{
                      icon: {
                        path: 'M 0,-1 L 2,0 L 0,1',
                        scale: 3,
                        strokeColor: line.direction === "exporting" ? "#22c55e" : "#f59e0b",
                        strokeOpacity: 0.9,
                        fillColor: line.direction === "exporting" ? "#22c55e" : "#f59e0b",
                        fillOpacity: 0.7,
                      },
                      offset: "50%",
                    }] : [{
                      icon: {
                        path: 'M 0,-1 L 2,0 L 0,1',
                        scale: 4,
                        strokeColor: "#3b82f6",
                        strokeOpacity: 0.8,
                        fillColor: "#3b82f6",
                        fillOpacity: 0.5,
                      },
                      offset: "40%",
                    }, {
                      icon: {
                        path: 'M 0,-1 L 2,0 L 0,1',
                        scale: 4,
                        strokeColor: "#3b82f6",
                        strokeOpacity: 0.8,
                        fillColor: "#3b82f6",
                        fillOpacity: 0.5,
                      },
                      offset: "70%",
                    }]) : [],
                    geodesic: true,
                  }}
                />
              ))}

              {/* Trace path highlight polylines */}
              {tracePathDrn && (() => {
                const meter = meters.find(m => m.DRN === tracePathDrn);
                if (!meter) return null;
                const mLat = parseFloat(meter.Lat);
                const mLng = parseFloat(meter.Longitude);
                if (isNaN(mLat) || isNaN(mLng)) return null;
                const distSubs = substationConfig.filter(s => s.type === "distribution");
                let nearest = null;
                let minDist = Infinity;
                distSubs.forEach(sub => {
                  const d = Math.sqrt(Math.pow(mLat - sub.lat, 2) + Math.pow(mLng - sub.lng, 2));
                  if (d < minDist) { minDist = d; nearest = sub; }
                });
                if (!nearest) return null;
                const lines = [
                  <Polyline
                    key="trace-meter-sub"
                    path={[{ lat: mLat, lng: mLng }, { lat: nearest.lat, lng: nearest.lng }]}
                    options={{ strokeColor: "#06b6d4", strokeOpacity: 0.9, strokeWeight: 3, geodesic: true }}
                  />
                ];
                if (nearest.parent_lat && nearest.parent_lng) {
                  lines.push(
                    <Polyline
                      key="trace-sub-primary"
                      path={[{ lat: nearest.lat, lng: nearest.lng }, { lat: nearest.parent_lat, lng: nearest.parent_lng }]}
                      options={{ strokeColor: "#06b6d4", strokeOpacity: 0.9, strokeWeight: 3, geodesic: true }}
                    />
                  );
                }
                return lines;
              })()}
            </GoogleMap>

            {/* ---- Floating Layer Controls Panel ---- */}
            <Box
              sx={{
                position: "absolute",
                top: "10px",
                right: "50px",
                zIndex: 10,
                bgcolor: "rgba(10,22,40,0.92)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "10px",
                backdropFilter: "blur(8px)",
                minWidth: 180,
                overflow: "hidden",
                boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
              }}
            >
              <Box
                display="flex"
                alignItems="center"
                justifyContent="space-between"
                px="12px"
                py="8px"
                sx={{
                  borderBottom: layerPanelOpen ? "1px solid rgba(255,255,255,0.08)" : "none",
                  cursor: "pointer",
                  "&:hover": { bgcolor: "rgba(255,255,255,0.04)" },
                }}
                onClick={() => setLayerPanelOpen(prev => !prev)}
              >
                <Box display="flex" alignItems="center" gap="6px">
                  <LayersOutlined sx={{ fontSize: 15, color: "#94a3b8" }} />
                  <Typography variant="caption" color="#e2e8f0" fontWeight={600} fontSize="11px" letterSpacing="0.5px">
                    LAYERS
                  </Typography>
                </Box>
                {layerPanelOpen ? (
                  <ExpandLessOutlined sx={{ fontSize: 15, color: "#94a3b8" }} />
                ) : (
                  <ExpandMoreOutlined sx={{ fontSize: 15, color: "#94a3b8" }} />
                )}
              </Box>
              <Collapse in={layerPanelOpen}>
                <Box px="8px" py="6px">
                  {[
                    { key: "meterMarkers", label: "Meter Markers", color: "#4cceac" },
                    { key: "substationMarkers", label: "Substation Markers", color: "#3b82f6" },
                    { key: "substationToMainLines", label: "Substation Lines", color: "#3b82f6" },
                    { key: "meterToSubLines", label: "Meter-to-Sub Lines", color: "#f59e0b" },
                    { key: "flowAnimation", label: "Flow Animation", color: "#94a3b8" },
                    { key: "districtBoundaries", label: "District Boundaries", color: "#8b5cf6" },
                  ].map(item => (
                    <Box
                      key={item.key}
                      display="flex"
                      alignItems="center"
                      justifyContent="space-between"
                      py="3px"
                      sx={{ "&:hover": { bgcolor: "rgba(255,255,255,0.03)", borderRadius: "4px" } }}
                    >
                      <Box display="flex" alignItems="center" gap="6px">
                        <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: layers[item.key] ? item.color : "rgba(255,255,255,0.2)" }} />
                        <Typography variant="caption" color={layers[item.key] ? "#e2e8f0" : "#64748b"} fontSize="10px">
                          {item.label}
                        </Typography>
                      </Box>
                      <Switch
                        size="small"
                        checked={layers[item.key]}
                        onChange={() => toggleLayer(item.key)}
                        sx={{
                          "& .MuiSwitch-switchBase.Mui-checked": { color: item.color },
                          "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": { bgcolor: item.color },
                          transform: "scale(0.75)",
                        }}
                      />
                    </Box>
                  ))}
                </Box>
              </Collapse>
            </Box>
          </Box>

          {/* Legend */}
          <Box display="flex" gap="10px" justifyContent="center" alignItems="center" py="4px" flexWrap="wrap">
            {[
              { color: "#4cceac", label: "Mains ON + Geyser ON" },
              { color: "#f2b705", label: "Mains ON + Geyser OFF" },
              { color: "#db4f4a", label: "Mains OFF" },
              { color: "#4a5568", label: "Offline" },
              { color: "#6870fa", label: "Selected" },
              { color: "#06b6d4", label: "Highlighted" },
            ].map(item => (
              <Box key={item.label} display="flex" alignItems="center" gap="4px">
                <FiberManualRecord sx={{ fontSize: 10, color: item.color }} />
                <Typography variant="caption" color={colors.grey[400]} fontSize="10px">{item.label}</Typography>
              </Box>
            ))}
            <Box sx={{ width: "1px", height: 12, bgcolor: "rgba(255,255,255,0.15)", mx: "4px" }} />
            {[
              { color: "#3b82f6", label: "Primary Sub", shape: "square" },
              { color: "#f59e0b", label: "Dist. Sub (Load)", shape: "diamond" },
              { color: "#22c55e", label: "Dist. Sub (Export)", shape: "diamond" },
            ].map(item => (
              <Box key={item.label} display="flex" alignItems="center" gap="4px">
                {item.shape === "diamond" ? (
                  <Box sx={{ width: 8, height: 8, bgcolor: item.color, transform: "rotate(45deg)" }} />
                ) : (
                  <Box sx={{ width: 8, height: 8, bgcolor: item.color, borderRadius: "2px" }} />
                )}
                <Typography variant="caption" color={colors.grey[400]} fontSize="10px">{item.label}</Typography>
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
          sx={{ bgcolor: colors.primary[400], borderRadius: "8px", p: "8px", overflowY: "auto" }}
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

      {/* =============== ENERGY ANALYTICS DASHBOARD =============== */}
      <EnergyAnalytics />

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
            fullWidth label="Group Name"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            sx={{ mt: 1, mb: 2 }} size="small"
          />
          <TextField
            fullWidth label="Description (optional)"
            value={newGroupDesc}
            onChange={(e) => setNewGroupDesc(e.target.value)}
            sx={{ mb: 2 }} size="small" multiline rows={2}
          />
          <FormControl fullWidth size="small">
            <InputLabel>Control Type</InputLabel>
            <Select value={newGroupType} label="Control Type" onChange={(e) => setNewGroupType(e.target.value)}>
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
          <Button onClick={handleCreateGroup} variant="contained" sx={{ bgcolor: "#6870fa", "&:hover": { bgcolor: "#5a62e8" } }}>
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
            <Select value={randomArea} label="Area (optional)" onChange={(e) => setRandomArea(e.target.value)}>
              <MenuItem value="">All Areas</MenuItem>
              {areaSummary.map(a => (
                <MenuItem key={a.area} value={a.area}>{a.area} ({a.online} online)</MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowRandomDialog(false)} sx={{ color: colors.grey[400] }}>Cancel</Button>
          <Button onClick={handleRandomize} variant="contained"
            sx={{ bgcolor: "#f2b705", color: "#000", "&:hover": { bgcolor: "#d4a005" } }}>
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
          <Alert severity={controlAction.startsWith("calibrate") ? "info" : "warning"} sx={{ mb: 2 }}>
            {controlAction.startsWith("calibrate")
              ? `This will send a calibration command to ${totalSelected} meter(s).`
              : `This will send control commands to ${totalSelected} meter(s). This action affects real meters.`}
          </Alert>

          <FormControl fullWidth size="small" sx={{ mb: 2 }}>
            <InputLabel>Action</InputLabel>
            <Select value={controlAction} label="Action" onChange={(e) => setControlAction(e.target.value)}>
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
              <Divider sx={{ my: 0.5, borderColor: "rgba(255,255,255,0.1)" }} />
              <MenuItem value="calibrate_auto">
                <Box display="flex" alignItems="center" gap="8px">
                  <BuildOutlined sx={{ fontSize: 16, color: "#6870fa" }} /> Auto-Calibrate
                </Box>
              </MenuItem>
              <MenuItem value="calibrate_verify">
                <Box display="flex" alignItems="center" gap="8px">
                  <VerifiedOutlined sx={{ fontSize: 16, color: "#f2b705" }} /> Verify Calibration
                </Box>
              </MenuItem>
              <MenuItem value="calibrate_exercise">
                <Box display="flex" alignItems="center" gap="8px">
                  <SpeedOutlined sx={{ fontSize: 16, color: "#4cceac" }} /> Exercise Load Switch
                </Box>
              </MenuItem>
            </Select>
          </FormControl>

          <TextField
            fullWidth label="Reason (optional)"
            value={controlReason}
            onChange={(e) => setControlReason(e.target.value)}
            size="small"
            placeholder="e.g., Peak demand reduction"
            multiline rows={2}
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
              bgcolor: controlAction.startsWith("calibrate") ? "#6870fa" : controlAction.endsWith("_off") ? "#db4f4a" : "#4cceac",
              color: "#fff",
              "&:hover": { bgcolor: controlAction.startsWith("calibrate") ? "#5a60d8" : controlAction.endsWith("_off") ? "#c53030" : "#38a89d" },
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
                  {["Time", "Group", "Action", "Meters", "Status", "By", "Reason"].map(col => (
                    <TableCell key={col} sx={{ color: colors.grey[300], borderColor: colors.primary[300] }}>{col}</TableCell>
                  ))}
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
                          height: 20, fontSize: 10,
                          bgcolor: h.action_type?.endsWith("_off") ? "rgba(219,79,74,0.15)" : "rgba(76,206,172,0.15)",
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
                          height: 20, fontSize: 10,
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
