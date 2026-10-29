import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Box, Typography, useTheme, Grid, CircularProgress, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Select, MenuItem,
  TextField, Button, Snackbar, Alert, FormControl, InputLabel,
  IconButton, InputAdornment, Tooltip, Tabs, Tab, Popover,
} from "@mui/material";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
} from "recharts";
import { GoogleMap, useJsApiLoader, Marker, Polyline, InfoWindow } from "@react-google-maps/api";
import Header from "../components/Header";
import { tokens } from "../theme";
import { netMeteringAPI, vendingAPI } from "../services/api";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import RefreshIcon from "@mui/icons-material/Refresh";
import SettingsIcon from "@mui/icons-material/Settings";
import SaveIcon from "@mui/icons-material/Save";
import EditIcon from "@mui/icons-material/Edit";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import ElectricMeterOutlinedIcon from "@mui/icons-material/ElectricMeterOutlined";
import BoltIcon from "@mui/icons-material/Bolt";
import UploadOutlinedIcon from "@mui/icons-material/UploadOutlined";
import OpenInNewOutlinedIcon from "@mui/icons-material/OpenInNewOutlined";
import ElectricBoltIcon from "@mui/icons-material/ElectricBolt";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import ChevronLeftOutlinedIcon from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlinedIcon from "@mui/icons-material/ChevronRightOutlined";
import CalendarTodayOutlinedIcon from "@mui/icons-material/CalendarTodayOutlined";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import MyLocationOutlinedIcon from "@mui/icons-material/MyLocationOutlined";
import { useNavigate } from "react-router-dom";

// ─── Shared date helpers (day-level, calendar-driven navigation) ───────────
// Hoisted to module scope so both FleetDashboardTab's period sections and the
// new calendar/date-header components below can use the same date math —
// deliberately NOT using toISOString() anywhere here, since that converts
// through UTC and can shift a local midnight into the previous calendar day
// for any timezone ahead of UTC (Namibia is UTC+2).
var MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
var MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
var CAL_DOW = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function getMonday(d) {
  var dt = new Date(d);
  var day = dt.getDay();
  var diff = dt.getDate() - day + (day === 0 ? -6 : 1);
  dt.setDate(diff);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function addDays(d, n) {
  var dt = new Date(d);
  dt.setDate(dt.getDate() + n);
  return dt;
}

function fmtDateLabel(d) {
  return MONTH_SHORT[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
}

function dateToStr(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function strToLocalDate(s) {
  // "YYYY-MM-DD" -> local Date at midnight. Deliberately NOT `new Date(s)`,
  // which parses a bare date string as UTC midnight and can render as the
  // previous day in any timezone behind UTC on the viewer's own machine.
  var parts = (s || "").split("-");
  if (parts.length !== 3) return new Date();
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function isSameDay(a, b) {
  return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Compact month-grid calendar popup content — day selection only (no time),
// month navigation, today indicator, selected highlight, min/max bounds.
function MiniCalendar({ colors, isDark, value, onSelect, minDate, maxDate }) {
  var _viewState = useState(function() { return new Date(value.getFullYear(), value.getMonth(), 1); });
  var viewMonth = _viewState[0]; var setViewMonth = _viewState[1];
  var today = new Date(); today.setHours(0, 0, 0, 0);

  var year = viewMonth.getFullYear();
  var month = viewMonth.getMonth();
  var firstOfMonth = new Date(year, month, 1);
  var startOffset = (firstOfMonth.getDay() + 6) % 7; // Monday-first grid
  var totalDays = daysInMonth(year, month);

  var cells = [];
  for (var i = 0; i < startOffset; i++) cells.push(null);
  for (var d = 1; d <= totalDays; d++) cells.push(new Date(year, month, d));

  function inBounds(d) {
    if (minDate && d < minDate) return false;
    if (maxDate && d > maxDate) return false;
    return true;
  }

  var canPrevMonth = !minDate || new Date(year, month, 0) >= minDate;
  var canNextMonth = !maxDate || new Date(year, month + 1, 1) <= maxDate;

  return (
    <Box sx={{ p: "14px", width: "260px" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: "10px" }}>
        <IconButton size="small" disabled={!canPrevMonth} onClick={function() { setViewMonth(new Date(year, month - 1, 1)); }}>
          <ChevronLeftOutlinedIcon sx={{ fontSize: 18 }} />
        </IconButton>
        <Typography sx={{ fontSize: "13px", fontWeight: 700, color: colors.grey[100] }}>{MONTH_NAMES[month] + " " + year}</Typography>
        <IconButton size="small" disabled={!canNextMonth} onClick={function() { setViewMonth(new Date(year, month + 1, 1)); }}>
          <ChevronRightOutlinedIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px", mb: "4px" }}>
        {CAL_DOW.map(function(dow) {
          return <Typography key={dow} sx={{ fontSize: "10px", fontWeight: 700, color: colors.grey[500], textAlign: "center" }}>{dow}</Typography>;
        })}
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px" }}>
        {cells.map(function(d, i) {
          if (!d) return <Box key={"e" + i} />;
          var selected = isSameDay(d, value);
          var isToday = isSameDay(d, today);
          var disabled = !inBounds(d);
          return (
            <Box
              key={i}
              onClick={disabled ? undefined : function() { onSelect(d); }}
              sx={{
                aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: "6px", fontSize: "12px", fontWeight: selected ? 700 : 500,
                cursor: disabled ? "default" : "pointer",
                color: disabled ? colors.grey[600] : (selected ? "#fff" : colors.grey[200]),
                bgcolor: selected ? COLOR_DELIVERED : "transparent",
                border: isToday && !selected ? "1px solid " + COLOR_DELIVERED : "1px solid transparent",
                opacity: disabled ? 0.4 : 1,
                "&:hover": disabled ? {} : { bgcolor: selected ? COLOR_DELIVERED : (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)") },
              }}
            >
              {d.getDate()}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

// Compact chart-header control: title/subtitle on the left, [<] [date ▼] [>]
// on the right, clicking the date opens a MiniCalendar popover. Replaces the
// old full-width centered arrow bar — every chart with day-level historical
// navigation should use this, not its own bespoke prev/next UI.
function ChartDateHeader({ colors, isDark, title, subtitle, date, onDateChange, minDate, maxDate, accentFrom, accentTo }) {
  var _anchorState = useState(null);
  var anchorEl = _anchorState[0]; var setAnchorEl = _anchorState[1];
  var atMax = maxDate ? date >= maxDate : false;
  var atMin = minDate ? date <= minDate : false;

  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: "6px", flexWrap: "wrap", gap: "10px" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {(accentFrom || accentTo) && <Box sx={{ width: 5, height: 28, borderRadius: "3px", background: "linear-gradient(180deg, " + (accentFrom || COLOR_DELIVERED) + ", " + (accentTo || COLOR_RECEIVED) + ")" }} />}
        <Box>
          <Typography sx={{ fontSize: "18px", fontWeight: 800, color: colors.grey[100], letterSpacing: "-0.3px" }}>{title}</Typography>
          {subtitle && <Typography sx={{ fontSize: "12px", color: colors.grey[400] }}>{subtitle}</Typography>}
        </Box>
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: "2px", border: "1px solid " + (isDark ? colors.grey[700] : "#ddd"), borderRadius: "8px", p: "2px" }}>
        <IconButton size="small" disabled={atMin} onClick={function() { onDateChange(addDays(date, -1)); }} sx={{ width: 28, height: 28 }}>
          <ChevronLeftOutlinedIcon sx={{ fontSize: 16 }} />
        </IconButton>
        <Box
          onClick={function(e) { setAnchorEl(e.currentTarget); }}
          sx={{
            display: "flex", alignItems: "center", gap: "6px", px: "10px", height: 28, borderRadius: "6px",
            cursor: "pointer", "&:hover": { bgcolor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)" },
          }}
        >
          <CalendarTodayOutlinedIcon sx={{ fontSize: 13, color: colors.grey[400] }} />
          <Typography sx={{ fontSize: "12px", fontWeight: 700, color: colors.grey[100], whiteSpace: "nowrap" }}>{fmtDateLabel(date)}</Typography>
          <ArrowDropDownIcon sx={{ fontSize: 16, color: colors.grey[400] }} />
        </Box>
        <IconButton size="small" disabled={atMax} onClick={function() { onDateChange(addDays(date, 1)); }} sx={{ width: 28, height: 28 }}>
          <ChevronRightOutlinedIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={function() { setAnchorEl(null); }}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        PaperProps={{ sx: { bgcolor: colors.primary[400], border: "1px solid " + colors.grey[700] } }}
      >
        <MiniCalendar
          colors={colors} isDark={isDark} value={date} minDate={minDate} maxDate={maxDate}
          onSelect={function(d) { onDateChange(d); setAnchorEl(null); }}
        />
      </Popover>
    </Box>
  );
}

// Compact prev/next control for period-offset navigation (week/month/year
// windows, where "pick a specific day" doesn't apply the way it does for the
// hourly chart above) — same compact, header-integrated visual language as
// ChartDateHeader, without a calendar popup.
function CompactPeriodHeader({ colors, isDark, title, subtitle, label, onPrev, onNext, disableNext, accentFrom, accentTo }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: "6px", flexWrap: "wrap", gap: "10px" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {(accentFrom || accentTo) && <Box sx={{ width: 5, height: 28, borderRadius: "3px", background: "linear-gradient(180deg, " + (accentFrom || COLOR_DELIVERED) + ", " + (accentTo || COLOR_RECEIVED) + ")" }} />}
        <Box>
          <Typography sx={{ fontSize: "18px", fontWeight: 800, color: colors.grey[100], letterSpacing: "-0.3px" }}>{title}</Typography>
          {subtitle && <Typography sx={{ fontSize: "12px", color: colors.grey[400] }}>{subtitle}</Typography>}
        </Box>
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: "2px", border: "1px solid " + (isDark ? colors.grey[700] : "#ddd"), borderRadius: "8px", p: "2px" }}>
        <IconButton size="small" onClick={onPrev} sx={{ width: 28, height: 28 }}>
          <ChevronLeftOutlinedIcon sx={{ fontSize: 16 }} />
        </IconButton>
        <Typography sx={{ fontSize: "12px", fontWeight: 700, color: colors.grey[100], minWidth: "120px", textAlign: "center" }}>{label}</Typography>
        <IconButton size="small" disabled={disableNext} onClick={onNext} sx={{ width: 28, height: 28 }}>
          <ChevronRightOutlinedIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>
    </Box>
  );
}

// ─── Grid Flow Map ──────────────────────────────────────────────────────────
// Same Google Maps key already live in src/pages/Map.jsx — one Google Cloud
// project, already authorized for this domain, no new credential needed.
var GOOGLE_MAPS_KEY = "AIzaSyCdPt-Y9HoyNJF5I-sbyuS4n6U1KhKaIzk";
var MAP_LIBRARIES = ["geometry"];
var DEFAULT_MAP_CENTER = { lat: -22.57, lng: 17.08 }; // Windhoek — used only when no meter has GPS yet

// Standard muted dark Google Maps theme so the map doesn't jar against the
// rest of a dark-mode admin page.
var DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#1d2530" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1d2530" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8a97a8" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#3a4552" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a3542" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#7d8ba0" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#111820" }] },
];

var FLOW_STATE_COLOR = {
  IMPORT: "#2196f3",
  EXPORT: "#ff9800",
  IDLE: "#9e9e9e",
  OFFLINE: "#f44336",
};
var FLOW_STATE_LABEL = {
  IMPORT: "Importing from grid",
  EXPORT: "Exporting to grid",
  IDLE: "Neutral / no significant flow",
  OFFLINE: "Offline / stale data",
};

// Encodes each state as BOTH a color and a distinct glyph (arrow in/out, dot,
// cross) so direction is never conveyed by color alone.
function meterGlyphPath(state) {
  if (state === "IMPORT") return "M12 5 L12 16 M7 11 L12 16 L17 11"; // arrow pointing down/in
  if (state === "EXPORT") return "M12 19 L12 8 M7 13 L12 8 L17 13"; // arrow pointing up/out
  if (state === "OFFLINE") return "M8 8 L16 16 M16 8 L8 16"; // x
  return "M12 12 m -2.2 0 a 2.2 2.2 0 1 0 4.4 0 a 2.2 2.2 0 1 0 -4.4 0"; // dot
}

function meterMarkerIcon(state) {
  var color = FLOW_STATE_COLOR[state] || FLOW_STATE_COLOR.IDLE;
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24">' +
    '<circle cx="12" cy="12" r="10" fill="' + color + '" stroke="#ffffff" stroke-width="2"/>' +
    '<path d="' + meterGlyphPath(state) + '" stroke="#ffffff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';
  var hasGoogle = typeof window !== "undefined" && window.google && window.google.maps;
  return {
    url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
    scaledSize: hasGoogle ? new window.google.maps.Size(30, 30) : undefined,
    anchor: hasGoogle ? new window.google.maps.Point(15, 15) : undefined,
  };
}

function substationMarkerIcon() {
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24">' +
    '<rect x="3" y="3" width="18" height="18" rx="4" fill="#37474f" stroke="#ffffff" stroke-width="2"/>' +
    '<path d="M9 6 L9 18 M15 6 L15 18 M9 12 L15 12" stroke="#ffffff" stroke-width="1.6" fill="none"/>' +
    '</svg>';
  var hasGoogle = typeof window !== "undefined" && window.google && window.google.maps;
  return {
    url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
    scaledSize: hasGoogle ? new window.google.maps.Size(26, 26) : undefined,
    anchor: hasGoogle ? new window.google.maps.Point(13, 13) : undefined,
  };
}

// Cap on how many flowing connection lines get the moving-arrow animation at
// once. Above this, lines still show direction via color+dashing, just
// without the per-frame icon-offset animation — avoids re-rendering hundreds
// of Polyline objects on every tick (Phase 24's performance requirement).
var MAX_ANIMATED_LINES = 120;

function GridFlowMap({ colors, isDark }) {
  var jsApi = useJsApiLoader({ googleMapsApiKey: GOOGLE_MAPS_KEY, libraries: MAP_LIBRARIES });
  var isLoaded = jsApi.isLoaded;
  var _metersState = useState([]);
  var meters = _metersState[0]; var setMeters = _metersState[1];
  var _mapLoadingState = useState(true);
  var mapLoading = _mapLoadingState[0]; var setMapLoading = _mapLoadingState[1];
  var _filterState = useState("all");
  var filter = _filterState[0]; var setFilter = _filterState[1];
  var _selectedState = useState(null);
  var selected = _selectedState[0]; var setSelected = _selectedState[1];
  var _tariffState = useState(null);
  var selectedTariff = _tariffState[0]; var setSelectedTariff = _tariffState[1];
  var _tariffLoadingState = useState(false);
  var tariffLoading = _tariffLoadingState[0]; var setTariffLoading = _tariffLoadingState[1];
  var _animState = useState(0);
  var animTick = _animState[0]; var setAnimTick = _animState[1];
  var _lastFetchState = useState(null);
  var lastFetch = _lastFetchState[0]; var setLastFetch = _lastFetchState[1];

  var fetchMapData = useCallback(function() {
    netMeteringAPI.getMapData().then(function(res) {
      setMeters((res && res.data) || []);
      setLastFetch(new Date());
    }).catch(function(err) { console.error(err); }).finally(function() { setMapLoading(false); });
  }, []);

  useEffect(function() {
    fetchMapData();
    var interval = setInterval(fetchMapData, 30000); // same cadence as the rest of the page, not a separate aggressive poll
    return function() { clearInterval(interval); };
  }, [fetchMapData]);

  // One shared animation clock for every flowing line, instead of N
  // independent intervals — a single state update per tick regardless of
  // fleet size.
  useEffect(function() {
    var interval = setInterval(function() { setAnimTick(function(t) { return (t + 2) % 100; }); }, 200);
    return function() { clearInterval(interval); };
  }, []);

  // Stale telemetry must never be shown as a live directional flow — a meter
  // whose last reading is more than 10 minutes old (same threshold the
  // backend uses for its own Online/Offline status) is always OFFLINE on the
  // map regardless of what power_direction its last-known reading implied.
  var located = useMemo(function() {
    return (meters || [])
      .filter(function(m) { return m.meter_lat != null && m.meter_lng != null; })
      .map(function(m) {
        var mapState = m.status !== "Online" ? "OFFLINE" : (m.power_direction || "IDLE");
        return Object.assign({}, m, { mapState: mapState });
      });
  }, [meters]);

  var filtered = filter === "all" ? located : located.filter(function(m) { return m.mapState === filter; });
  var animateLines = filtered.length <= MAX_ANIMATED_LINES;

  var counts = useMemo(function() {
    var c = { total: located.length, IMPORT: 0, EXPORT: 0, IDLE: 0, OFFLINE: 0, importPower: 0, exportPower: 0 };
    located.forEach(function(m) {
      c[m.mapState] = (c[m.mapState] || 0) + 1;
      var p = Number(m.live_power) || 0;
      if (m.mapState === "IMPORT") c.importPower += p;
      else if (m.mapState === "EXPORT") c.exportPower += Math.abs(p);
    });
    return c;
  }, [located]);

  var mapCenter = useMemo(function() {
    if (located.length === 0) return DEFAULT_MAP_CENTER;
    var sumLat = 0, sumLng = 0;
    located.forEach(function(m) { sumLat += Number(m.meter_lat); sumLng += Number(m.meter_lng); });
    return { lat: sumLat / located.length, lng: sumLng / located.length };
  }, [located]);

  // Unique substation positions among the currently filtered meters, so one
  // substation serving many meters gets exactly one marker.
  var substations = useMemo(function() {
    var seen = {};
    var list = [];
    filtered.forEach(function(m) {
      if (m.substation_lat == null || m.substation_lng == null) return;
      var key = m.substation_lat + "," + m.substation_lng;
      if (seen[key]) return;
      seen[key] = true;
      list.push({ key: key, lat: Number(m.substation_lat), lng: Number(m.substation_lng), name: m.substation_name || "Substation" });
    });
    return list;
  }, [filtered]);

  function openMeter(m) {
    setSelected(m);
    setSelectedTariff(null);
    setTariffLoading(true);
    vendingAPI.getTariffInfo(m.DRN).then(function(res) {
      setSelectedTariff((res && res.data) || null);
    }).catch(function() { setSelectedTariff(null); }).finally(function() { setTariffLoading(false); });
  }

  var filterChips = [
    { key: "all", label: "All", count: counts.total },
    { key: "IMPORT", label: "Importing", count: counts.IMPORT },
    { key: "EXPORT", label: "Exporting", count: counts.EXPORT },
    { key: "IDLE", label: "Neutral", count: counts.IDLE },
    { key: "OFFLINE", label: "Offline", count: counts.OFFLINE },
  ];

  return (
    <Box sx={{ ...{ p: "24px", borderRadius: "12px", bgcolor: colors.primary[400], border: "1px solid " + (isDark ? colors.primary[500] : "#e8e8e8") }, mb: 0 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: "14px", flexWrap: "wrap", gap: "10px" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Box sx={{ width: 5, height: 28, borderRadius: "3px", background: "linear-gradient(180deg, " + COLOR_DELIVERED + ", " + COLOR_RECEIVED + ")" }} />
          <Box>
            <Typography sx={{ fontSize: "18px", fontWeight: 800, color: colors.grey[100], letterSpacing: "-0.3px" }}>Grid Flow Map</Typography>
            <Typography sx={{ fontSize: "12px", color: colors.grey[400] }}>Real-time power-flow direction between each net-metering meter and its substation</Typography>
          </Box>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {lastFetch && <Typography sx={{ fontSize: "11px", color: colors.grey[400] }}>Updated {lastFetch.toLocaleTimeString()}</Typography>}
          <IconButton size="small" onClick={fetchMapData} sx={{ color: colors.grey[400], "&:hover": { color: COLOR_DELIVERED } }}>
            <RefreshIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
      </Box>

      {/* KPI overlay */}
      <Box display="flex" gap="12px" mb="14px" flexWrap="wrap">
        <Box sx={{ flex: 1, minWidth: 130, p: "12px 14px", borderRadius: "10px", bgcolor: isDark ? colors.primary[500] : "#fafbfc", border: "1px solid " + (isDark ? colors.primary[600] || colors.grey[700] : "#eee") }}>
          <Typography sx={{ fontSize: "9px", fontWeight: 600, color: colors.grey[400], textTransform: "uppercase" }}>Total Meters</Typography>
          <Typography sx={{ fontSize: "20px", fontWeight: 800, color: colors.grey[100] }}>{counts.total}</Typography>
        </Box>
        <Box sx={{ flex: 1, minWidth: 130, p: "12px 14px", borderRadius: "10px", bgcolor: isDark ? colors.primary[500] : "#fafbfc", border: "1px solid " + FLOW_STATE_COLOR.IMPORT + "55" }}>
          <Typography sx={{ fontSize: "9px", fontWeight: 600, color: colors.grey[400], textTransform: "uppercase" }}>Importing</Typography>
          <Typography sx={{ fontSize: "20px", fontWeight: 800, color: FLOW_STATE_COLOR.IMPORT }}>{counts.IMPORT}</Typography>
        </Box>
        <Box sx={{ flex: 1, minWidth: 130, p: "12px 14px", borderRadius: "10px", bgcolor: isDark ? colors.primary[500] : "#fafbfc", border: "1px solid " + FLOW_STATE_COLOR.EXPORT + "55" }}>
          <Typography sx={{ fontSize: "9px", fontWeight: 600, color: colors.grey[400], textTransform: "uppercase" }}>Exporting</Typography>
          <Typography sx={{ fontSize: "20px", fontWeight: 800, color: FLOW_STATE_COLOR.EXPORT }}>{counts.EXPORT}</Typography>
        </Box>
        <Box sx={{ flex: 1, minWidth: 130, p: "12px 14px", borderRadius: "10px", bgcolor: isDark ? colors.primary[500] : "#fafbfc", border: "1px solid " + (isDark ? colors.grey[700] : "#eee") }}>
          <Typography sx={{ fontSize: "9px", fontWeight: 600, color: colors.grey[400], textTransform: "uppercase" }}>Neutral / Offline</Typography>
          <Typography sx={{ fontSize: "20px", fontWeight: 800, color: colors.grey[100] }}>{counts.IDLE} / {counts.OFFLINE}</Typography>
        </Box>
        <Box sx={{ flex: 1, minWidth: 130, p: "12px 14px", borderRadius: "10px", bgcolor: isDark ? colors.primary[500] : "#fafbfc", border: "1px solid " + (isDark ? colors.grey[700] : "#eee") }}>
          <Typography sx={{ fontSize: "9px", fontWeight: 600, color: colors.grey[400], textTransform: "uppercase" }}>Import / Export Power</Typography>
          <Typography sx={{ fontSize: "16px", fontWeight: 800, color: colors.grey[100] }}>{formatPower(counts.importPower)} / {formatPower(counts.exportPower)}</Typography>
        </Box>
        <Box sx={{ flex: 1, minWidth: 130, p: "12px 14px", borderRadius: "10px", bgcolor: isDark ? colors.primary[500] : "#fafbfc", border: "1px solid " + (isDark ? colors.grey[700] : "#eee") }}>
          <Typography sx={{ fontSize: "9px", fontWeight: 600, color: colors.grey[400], textTransform: "uppercase" }}>Net Power</Typography>
          <Typography sx={{ fontSize: "16px", fontWeight: 800, color: (counts.importPower - counts.exportPower) >= 0 ? FLOW_STATE_COLOR.IMPORT : FLOW_STATE_COLOR.EXPORT }}>
            {formatPower(counts.importPower - counts.exportPower)}
          </Typography>
        </Box>
      </Box>

      {/* Filters */}
      <Box display="flex" gap="8px" mb="14px" flexWrap="wrap">
        {filterChips.map(function(f) {
          var active = filter === f.key;
          var chipColor = FLOW_STATE_COLOR[f.key] || COLOR_DELIVERED;
          return (
            <Chip key={f.key} label={f.label + " (" + f.count + ")"} onClick={function() { setFilter(f.key); }}
              size="small"
              sx={{
                fontWeight: 700, fontSize: "11px", cursor: "pointer",
                bgcolor: active ? chipColor : (isDark ? colors.primary[500] : "#f0f0f0"),
                color: active ? "#fff" : colors.grey[300],
                border: "1px solid " + (active ? chipColor : (isDark ? colors.grey[700] : "#ddd")),
              }} />
          );
        })}
      </Box>

      {/* Map */}
      <Box sx={{ borderRadius: "10px", overflow: "hidden", border: "1px solid " + (isDark ? colors.grey[700] : "#eee"), position: "relative" }}>
        {(!isLoaded || mapLoading) ? (
          <Box sx={{ height: 480, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: isDark ? colors.primary[500] : "#f5f5f5" }}>
            <CircularProgress size={28} sx={{ color: COLOR_DELIVERED }} />
          </Box>
        ) : located.length === 0 ? (
          <Box sx={{ height: 480, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px", bgcolor: isDark ? colors.primary[500] : "#f5f5f5" }}>
            <MyLocationOutlinedIcon sx={{ fontSize: 40, color: colors.grey[500], opacity: 0.5 }} />
            <Typography sx={{ color: colors.grey[400], fontSize: "13px" }}>No net-metering meters have GPS coordinates on file yet</Typography>
          </Box>
        ) : (
          <GoogleMap
            mapContainerStyle={{ width: "100%", height: "480px" }}
            center={mapCenter}
            zoom={12}
            options={{
              styles: isDark ? DARK_MAP_STYLE : undefined,
              streetViewControl: false, mapTypeControl: false, fullscreenControl: true,
            }}
          >
            {substations.map(function(s) {
              return (
                <Marker key={"sub-" + s.key} position={{ lat: s.lat, lng: s.lng }} icon={substationMarkerIcon()} title={s.name} zIndex={1} />
              );
            })}
            {filtered.map(function(m) {
              if (m.substation_lat == null || m.substation_lng == null) return null;
              var color = FLOW_STATE_COLOR[m.mapState];
              var flowing = m.mapState === "IMPORT" || m.mapState === "EXPORT";
              // IMPORT: substation -> meter. EXPORT: meter -> substation.
              // The arrow icon's direction is set by the path order, not by
              // reversing offsets, so it always points the true way.
              var path = m.mapState === "IMPORT"
                ? [{ lat: Number(m.substation_lat), lng: Number(m.substation_lng) }, { lat: Number(m.meter_lat), lng: Number(m.meter_lng) }]
                : [{ lat: Number(m.meter_lat), lng: Number(m.meter_lng) }, { lat: Number(m.substation_lat), lng: Number(m.substation_lng) }];
              var icons = flowing && window.google ? [{
                icon: { path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3, strokeColor: color },
                offset: (animateLines ? animTick : 50) + "%",
                repeat: "90px",
              }] : undefined;
              return (
                <Polyline key={"line-" + m.DRN} path={path} options={{
                  strokeColor: color,
                  strokeOpacity: flowing ? 0.55 : 0.25,
                  strokeWeight: 2,
                  icons: icons,
                }} />
              );
            })}
            {filtered.map(function(m) {
              return (
                <Marker key={"meter-" + m.DRN} position={{ lat: Number(m.meter_lat), lng: Number(m.meter_lng) }}
                  icon={meterMarkerIcon(m.mapState)} title={m.DRN} zIndex={2}
                  onClick={function() { openMeter(m); }} />
              );
            })}
            {selected && selected.meter_lat != null && (
              <InfoWindow position={{ lat: Number(selected.meter_lat), lng: Number(selected.meter_lng) }} onCloseClick={function() { setSelected(null); }}>
                <Box sx={{ minWidth: 220, color: "#1a1a1a" }}>
                  <Typography sx={{ fontSize: "11px", fontWeight: 700, color: "#666" }}>GRIDx METER</Typography>
                  <Typography sx={{ fontSize: "14px", fontWeight: 800, mb: "6px" }}>{selected.DRN}</Typography>
                  <Chip label={FLOW_STATE_LABEL[selected.mapState]} size="small" sx={{
                    bgcolor: FLOW_STATE_COLOR[selected.mapState] + "22", color: FLOW_STATE_COLOR[selected.mapState],
                    fontWeight: 700, fontSize: "10px", mb: "8px",
                  }} />
                  <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", fontSize: "12px" }}>
                    <Box><b>Power:</b> {selected.live_power != null ? formatPower(selected.live_power) : "--"}</Box>
                    <Box><b>Status:</b> {selected.status}</Box>
                    <Box><b>Import today:</b> {toKwh(selected.today_import_wh)} kWh</Box>
                    <Box><b>Export today:</b> {toKwh(selected.today_export_wh)} kWh</Box>
                    <Box><b>Import (mo.):</b> {toKwh(selected.month_import_wh)} kWh</Box>
                    <Box><b>Export (mo.):</b> {toKwh(selected.month_export_wh)} kWh</Box>
                  </Box>
                  <Box sx={{ mt: "8px", pt: "8px", borderTop: "1px solid #eee" }}>
                    {tariffLoading ? (
                      <Typography sx={{ fontSize: "11px", color: "#888" }}>Loading tariff…</Typography>
                    ) : selectedTariff && selectedTariff.tariffGroup ? (
                      <>
                        <Typography sx={{ fontSize: "11px" }}><b>Tariff:</b> {selectedTariff.tariffGroup.name}</Typography>
                        <Typography sx={{ fontSize: "11px" }}><b>Period:</b> {selectedTariff.currentPeriod || "—"} · N$ {Number(selectedTariff.currentRate || 0).toFixed(2)}/kWh</Typography>
                      </>
                    ) : (
                      <Typography sx={{ fontSize: "11px", color: "#888" }}>Tariff not available</Typography>
                    )}
                  </Box>
                  <Typography sx={{ fontSize: "10px", color: "#999", mt: "6px" }}>
                    Updated {selected.last_reading ? timeAgo(selected.last_reading) : "--"}
                  </Typography>
                </Box>
              </InfoWindow>
            )}
          </GoogleMap>
        )}
      </Box>

      {/* Legend */}
      <Box display="flex" gap="16px" mt="12px" flexWrap="wrap">
        {["IMPORT", "EXPORT", "IDLE", "OFFLINE"].map(function(state) {
          return (
            <Box key={state} sx={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Box component="svg" width={16} height={16} viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" fill={FLOW_STATE_COLOR[state]} />
                <path d={meterGlyphPath(state)} stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </Box>
              <Typography sx={{ fontSize: "11px", color: colors.grey[400] }}>{FLOW_STATE_LABEL[state]}</Typography>
            </Box>
          );
        })}
        <Box sx={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <HubOutlinedIcon sx={{ fontSize: 16, color: "#37474f" }} />
          <Typography sx={{ fontSize: "11px", color: colors.grey[400] }}>Substation / grid node</Typography>
        </Box>
      </Box>
    </Box>
  );
}

// Last-resort fallback rates (N$ per kWh) — used only if the backend
// /mqtt/net-energy/tariff-rates fetch fails, so a revenue figure never goes
// blank. The real numbers come from the backend (TariffGroups /
// MeterNetMeteringConfig), not from these constants — see fetchDashboard()
// in the exported NetMetering component below.
var FALLBACK_RETAIL = 2.45;
var FALLBACK_FEEDIN = 1.60;

// Utility-perspective color scheme
var COLOR_DELIVERED = "#2196f3";
var COLOR_RECEIVED = "#ff9800";
var COLOR_REVENUE = "#4caf50";
var COLOR_COST = "#f44336";

var toKwh = function(wh) { return ((wh || 0) / 1000).toFixed(1); };
var fmtCurrency = function(n) { return "N$ " + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
var formatPower = function(watts) {
  if (watts == null) return "N/A";
  var kw = Math.abs(watts) / 1000;
  return kw < 1 ? Math.abs(watts).toFixed(0) + " W" : kw.toFixed(2) + " kW";
};

function timeAgo(val) {
  if (!val) return "";
  var d = new Date(val);
  if (isNaN(d.getTime())) return "";
  var diff = Date.now() - d.getTime();
  var mins = Math.floor(diff / 60000);
  if (mins < 60) return mins + "m ago";
  var hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  return Math.floor(hrs / 24) + "d ago";
}

function SummaryCard({ colors, isDark, label, value, icon, color, subtitle }) {
  var Icon = icon;
  var cardBg = isDark ? colors.primary[400] : "#FFFFFF";
  var cardBorder = "1px solid " + (isDark ? "#1E293B" : "#E5E7EB");
  return (
    <Box sx={{
      bgcolor: cardBg,
      border: cardBorder,
      borderRadius: "12px",
      borderLeft: "4px solid " + color,
      p: "18px 22px",
      display: "flex",
      alignItems: "center",
      gap: "16px",
      flex: 1,
      minWidth: "200px",
    }}>
      <Box sx={{
        width: 48,
        height: 48,
        borderRadius: "12px",
        background: "linear-gradient(135deg, " + color + "22, " + color + "08)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}>
        <Icon sx={{ color: color, fontSize: 24 }} />
      </Box>
      <Box>
        <Typography variant="h4" sx={{ fontSize: "24px", fontWeight: 800, color: colors.grey[100], lineHeight: 1.2 }}>{value}</Typography>
        <Typography sx={{ fontSize: "12px", fontWeight: 600, color: colors.grey[400], mt: "2px" }}>{label}</Typography>
        {subtitle && <Typography sx={{ fontSize: "10px", color: colors.grey[500], mt: "2px" }}>{subtitle}</Typography>}
      </Box>
    </Box>
  );
}

function EnergyBarChart({ colors, isDark, title, data, height }) {
  return (
    <Box sx={{ p: "20px", borderRadius: "8px", bgcolor: colors.primary[400], mb: 2 }}>
      <Typography sx={{ fontSize: "14px", fontWeight: 700, color: colors.grey[100], mb: 2 }}>{title}</Typography>
      <ResponsiveContainer width="100%" height={height || 260}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#334155" : "#D1D5DB"} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: colors.grey[400] }} />
          <YAxis tick={{ fontSize: 10, fill: colors.grey[400] }} label={{ value: "kWh", angle: -90, position: "insideLeft", style: { fontSize: 10, fill: colors.grey[400] } }} />
          <RechartsTooltip contentStyle={{ backgroundColor: isDark ? colors.primary[500] : "#fff", border: "1px solid " + colors.grey[600], borderRadius: "8px", fontSize: "12px" }} />
          <Bar dataKey="delivered" fill={COLOR_DELIVERED} name="Delivered to Customer (kWh)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="received" fill={COLOR_RECEIVED} name="Exported to Grid (kWh)" radius={[4, 4, 0, 0]} />
          <Legend wrapperStyle={{ fontSize: "10px" }} />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}

function RevenueBarChart({ colors, isDark, title, data, height }) {
  return (
    <Box sx={{ p: "20px", borderRadius: "8px", bgcolor: colors.primary[400], mb: 2 }}>
      <Typography sx={{ fontSize: "14px", fontWeight: 700, color: colors.grey[100], mb: 2 }}>{title}</Typography>
      <ResponsiveContainer width="100%" height={height || 260}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#334155" : "#D1D5DB"} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: colors.grey[400] }} />
          <YAxis tick={{ fontSize: 10, fill: colors.grey[400] }} label={{ value: "N$", angle: -90, position: "insideLeft", style: { fontSize: 10, fill: colors.grey[400] } }} />
          <RechartsTooltip
            contentStyle={{ backgroundColor: isDark ? colors.primary[500] : "#fff", border: "1px solid " + colors.grey[600], borderRadius: "8px", fontSize: "12px" }}
            formatter={function(value, name) { return ["N$ " + Number(value).toFixed(2), name]; }}
          />
          <Bar dataKey="revenue" fill={COLOR_REVENUE} name="Sales Revenue (N$)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="feedInCost" fill={COLOR_COST} name="Feed-in Credits Paid (N$)" radius={[4, 4, 0, 0]} />
          <Legend wrapperStyle={{ fontSize: "10px" }} />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}

function safeNum(val) {
  var n = Number(val);
  return isNaN(n) ? 0 : n;
}

function processChartData(raw, retailRate, feedInRate) {
  return (raw || []).map(function(d) {
    var deliveredKwh = safeNum(d.import) / 1000;
    var receivedKwh = safeNum(d.export) / 1000;
    return {
      label: d.label || "",
      date: d.date || d.label || "",
      delivered: safeNum(deliveredKwh.toFixed(2)),
      received: safeNum(receivedKwh.toFixed(2)),
      revenue: safeNum((deliveredKwh * retailRate).toFixed(2)),
      feedInCost: safeNum((receivedKwh * feedInRate).toFixed(2)),
    };
  });
}

function FleetDashboardTab({ colors, isDark, dashData, activeMeters, lastUpdated, allPeriodData, fetchDashboard, tariffRetail, tariffFeedIn, tariffIsFallback }) {
  // Navigation offsets for the Daily/Monthly analytics tabs: 0 = current, -1 = previous, etc.
  var _monthState = useState(0);
  var monthOffset = _monthState[0]; var setMonthOffset = _monthState[1];
  var _yearState = useState(0);
  var yearOffset = _yearState[0]; var setYearOffset = _yearState[1];

  // Which Energy Analytics sub-tab is active: 0 Hourly, 1 Daily, 2 Monthly.
  var _analyticsTabState = useState(0);
  var analyticsTab = _analyticsTabState[0]; var setAnalyticsTab = _analyticsTabState[1];

  // Day selected for the Fleet Hourly Energy Flow chart + the Hourly
  // analytics tab (they share one date so there's only one picker to keep
  // in sync with). Defaults to today; fetched independently of the parent's
  // 30s dashboard poll so picking a historical day doesn't force a refetch
  // of everything else on the page.
  var today = useMemo(function() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  var _hourDateState = useState(today);
  var selectedHourDate = _hourDateState[0]; var setSelectedHourDate = _hourDateState[1];
  var _hourlyForDateState = useState(null);
  var hourlyForDate = _hourlyForDateState[0]; var setHourlyForDate = _hourlyForDateState[1];
  var _hourlyLoadingState = useState(true);
  var hourlyLoading = _hourlyLoadingState[0]; var setHourlyLoading = _hourlyLoadingState[1];
  var _earliestDateState = useState(null);
  var earliestDate = _earliestDateState[0]; var setEarliestDate = _earliestDateState[1];

  useEffect(function() {
    var cancelled = false;
    setHourlyLoading(true);
    netMeteringAPI.getDashboard(null, dateToStr(selectedHourDate)).then(function(res) {
      if (cancelled) return;
      var d = res && res.data;
      setHourlyForDate((d && d.hourly) || []);
      if (d && d.earliest_date) setEarliestDate(strToLocalDate(d.earliest_date));
    }).catch(function(err) {
      if (!cancelled) { console.error(err); setHourlyForDate([]); }
    }).finally(function() {
      if (!cancelled) setHourlyLoading(false);
    });
    return function() { cancelled = true; };
  }, [selectedHourDate]);

  var totalDelivered = safeNum(dashData?.total_import);
  var totalReceived = safeNum(dashData?.total_export);
  var totalMeters = safeNum(dashData?.total_meters) || activeMeters.length || 0;
  var salesRevenue = (totalDelivered / 1000) * tariffRetail;
  var feedInCost = (totalReceived / 1000) * tariffFeedIn;
  var netRevenue = salesRevenue - feedInCost;
  var todayDelivered = safeNum(dashData?.today_import);
  var todayReceived = safeNum(dashData?.today_export);
  var todayRevenue = (todayDelivered / 1000) * tariffRetail;
  var todayFeedIn = (todayReceived / 1000) * tariffFeedIn;

  var hourlyData = (hourlyForDate || []).map(function(h, i) {
    return {
      hour: String(i).padStart(2, "0") + ":00",
      delivered: safeNum(safeNum(h?.import) / 1000),
      received: safeNum(safeNum(h?.export) / 1000),
    };
  });

  var allDailyData = processChartData(allPeriodData.daily, tariffRetail, tariffFeedIn);
  var allMonthlyData = processChartData(allPeriodData.thisyear, tariffRetail, tariffFeedIn);
  var allYearlyData = processChartData(allPeriodData.yearly, tariffRetail, tariffFeedIn);

  // ---- Monthly data with navigation ----
  var monthInfo = useMemo(function() {
    var now = new Date();
    var targetDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    var year = targetDate.getFullYear();
    var month = targetDate.getMonth();
    var label = MONTH_NAMES[month] + " " + year;
    var numDays = daysInMonth(year, month);

    // Build the full month day range
    var monthDates = [];
    for (var i = 1; i <= numDays; i++) {
      monthDates.push(dateToStr(new Date(year, month, i)));
    }

    // Try to match from daily API data - handle ISO date strings
    var dateMap = {};
    allDailyData.forEach(function(d) {
      if (d.date) {
        var key = d.date;
        if (key.indexOf("T") !== -1) {
          var parsed = new Date(key);
          key = parsed.getFullYear() + "-" + String(parsed.getMonth() + 1).padStart(2, "0") + "-" + String(parsed.getDate()).padStart(2, "0");
        }
        dateMap[key] = d;
        if (d.label) dateMap[d.label] = d;
      }
    });

    var data = monthDates.map(function(ds, idx) {
      var existing = dateMap[ds];
      if (existing) {
        return { ...existing, label: String(idx + 1) };
      }
      return { label: String(idx + 1), date: ds, delivered: 0, received: 0, revenue: 0, feedInCost: 0 };
    });

    return { label: label, data: data };
  }, [monthOffset, allDailyData]);

  var monthlyChartData = monthInfo.data;

  // ---- Yearly data with navigation ----
  var yearInfo = useMemo(function() {
    var now = new Date();
    var targetYear = now.getFullYear() + yearOffset;
    var label = String(targetYear);

    // Use thisyear (monthly) data for current year, otherwise fill with zeros
    var data;
    if (yearOffset === 0 && allMonthlyData.length > 0) {
      // Ensure all 12 months
      data = MONTH_SHORT.map(function(m, idx) {
        var existing = allMonthlyData.find(function(d) { return d.label === m || d.label === MONTH_NAMES[idx]; });
        if (existing) return { ...existing, label: m };
        return { label: m, delivered: 0, received: 0, revenue: 0, feedInCost: 0 };
      });
    } else if (allYearlyData.length > 0) {
      // Try to find the year in yearly data
      var yearEntry = allYearlyData.find(function(d) { return d.label === label; });
      if (yearEntry) {
        // Spread single year value across months (just show yearly total once)
        data = MONTH_SHORT.map(function(m) {
          return { label: m, delivered: 0, received: 0, revenue: 0, feedInCost: 0 };
        });
        // Put all yearly data into a single "Total" placeholder for Jan
        data[0] = { label: "Jan", delivered: safeNum(yearEntry.delivered), received: safeNum(yearEntry.received), revenue: safeNum(yearEntry.revenue), feedInCost: safeNum(yearEntry.feedInCost) };
      } else {
        data = MONTH_SHORT.map(function(m) {
          return { label: m, delivered: 0, received: 0, revenue: 0, feedInCost: 0 };
        });
      }
    } else {
      data = MONTH_SHORT.map(function(m) {
        return { label: m, delivered: 0, received: 0, revenue: 0, feedInCost: 0 };
      });
    }

    return { label: label, data: data };
  }, [yearOffset, allMonthlyData, allYearlyData]);

  var yearlyChartData = yearInfo.data;

  var consumingMeters = activeMeters.filter(function(m) { return m.power_direction === "IMPORT"; }).length;
  var feedingMeters = activeMeters.filter(function(m) { return m.power_direction === "EXPORT"; }).length;

  // --- Hourly insights (for the SELECTED date, not necessarily today) ---
  var isViewingToday = isSameDay(selectedHourDate, today);
  var selectedDayImport = 0; var selectedDayExport = 0;
  var peakHourVal = 0; var peakHourLabel = "--";
  hourlyData.forEach(function(h) {
    selectedDayImport += safeNum(h.delivered);
    selectedDayExport += safeNum(h.received);
    var total = safeNum(h.delivered) + safeNum(h.received);
    if (total > peakHourVal) { peakHourVal = total; peakHourLabel = h.hour; }
  });
  var selectedDayTotalUsage = selectedDayImport + selectedDayExport;
  var gridDependencyPct = selectedDayTotalUsage > 0 ? (selectedDayImport / selectedDayTotalUsage * 100) : 0;

  // --- Monthly insights (Daily analytics tab: per-day bars across one month) ---
  var monthTotalImport = 0; var monthTotalExport = 0;
  var bestExportDay = ""; var bestExportVal = 0;
  monthlyChartData.forEach(function(d) {
    monthTotalImport += safeNum(d.delivered);
    monthTotalExport += safeNum(d.received);
    if (safeNum(d.received) > bestExportVal) { bestExportVal = safeNum(d.received); bestExportDay = d.label; }
  });
  var monthNetBalance = (monthTotalImport - monthTotalExport);
  var selfConsumptionRate = (monthTotalImport + monthTotalExport) > 0
    ? (monthTotalImport / (monthTotalImport + monthTotalExport) * 100) : 0;
  var monthRevenue = monthTotalImport * tariffRetail;
  var monthFeedInCost = monthTotalExport * tariffFeedIn;
  var monthNetRevenue = monthRevenue - monthFeedInCost;

  // --- Yearly insights ---
  var yearTotalImport = 0; var yearTotalExport = 0;
  yearlyChartData.forEach(function(d) { yearTotalImport += safeNum(d.delivered); yearTotalExport += safeNum(d.received); });
  var yearRevenue = yearTotalImport * tariffRetail;
  var yearFeedInCost = yearTotalExport * tariffFeedIn;
  var yearNetRevenue = yearRevenue - yearFeedInCost;
  var gridDepScore = (yearTotalImport + yearTotalExport) > 0
    ? (yearTotalImport / (yearTotalImport + yearTotalExport) * 100) : 0;

  // --- Shared styles ---
  var sectionCardSx = {
    p: "24px", borderRadius: "12px", bgcolor: colors.primary[400],
    border: "1px solid " + (isDark ? colors.primary[500] : "#e8e8e8"),
  };
  var kpiCardSx = function(accentColor) {
    return {
      flex: 1, minWidth: "180px", p: "18px 20px", borderRadius: "10px",
      bgcolor: isDark ? colors.primary[500] : "#fafbfc",
      border: "1px solid " + (isDark ? colors.primary[600] || colors.grey[700] : "#eee"),
      position: "relative", overflow: "hidden",
      "&::before": {
        content: '""', position: "absolute", top: 0, left: 0,
        width: "4px", height: "100%", borderRadius: "10px 0 0 10px",
        background: "linear-gradient(180deg, " + accentColor + ", " + accentColor + "44)",
      },
    };
  };
  var sectionDividerSx = {
    my: "40px", height: "1px", width: "100%",
    background: "linear-gradient(90deg, transparent, " + colors.grey[700] + ", transparent)",
  };
  var tooltipStyle = {
    backgroundColor: isDark ? colors.primary[500] : "#fff",
    border: "1px solid " + colors.grey[600], borderRadius: "10px", fontSize: "12px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
  };

  // --- Trend indicator helper ---
  var TrendBadge = function(props) {
    var val = props.value; var suffix = props.suffix || "%"; var label = props.label || "";
    var isUp = val > 0; var isNeutral = val === 0;
    var color = isNeutral ? colors.grey[400] : (isUp ? COLOR_REVENUE : COLOR_COST);
    var Icon = isUp ? TrendingUpIcon : TrendingDownIcon;
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: "4px", mt: "6px" }}>
        {!isNeutral && <Icon sx={{ fontSize: 14, color: color }} />}
        <Typography sx={{ fontSize: "11px", fontWeight: 600, color: color }}>
          {isNeutral ? "--" : ((isUp ? "+" : "") + val.toFixed(1) + suffix)}
        </Typography>
        {label && <Typography sx={{ fontSize: "10px", color: colors.grey[500], ml: "2px" }}>{label}</Typography>}
      </Box>
    );
  };

  return (
    <>
      {/* ===== HERO SUMMARY ROW ===== */}
      <Box display="flex" gap="14px" mb="20px" flexWrap="wrap">
        <SummaryCard colors={colors} isDark={isDark} label="Net Metered Customers" value={totalMeters} icon={ElectricMeterOutlinedIcon} color={COLOR_DELIVERED}
          subtitle={consumingMeters + " consuming, " + feedingMeters + " feeding in"} />
        <SummaryCard colors={colors} isDark={isDark} label="Today's Grid Supply" value={toKwh(todayDelivered) + " kWh"} icon={ElectricBoltIcon} color={COLOR_DELIVERED}
          subtitle={"Revenue: " + fmtCurrency(todayRevenue)} />
        <SummaryCard colors={colors} isDark={isDark} label="Today's Exported to Grid" value={toKwh(todayReceived) + " kWh"} icon={UploadOutlinedIcon} color={COLOR_RECEIVED}
          subtitle={"Feed-in credit: " + fmtCurrency(todayFeedIn)} />
        <SummaryCard colors={colors} isDark={isDark} label="Net Revenue" value={fmtCurrency(netRevenue)} icon={AttachMoneyIcon} color={netRevenue >= 0 ? COLOR_REVENUE : COLOR_COST}
          subtitle={netRevenue >= 0 ? "Positive margin" : "Feed-in exceeds sales"} />
      </Box>

      <Box display="flex" gap="12px" mb="24px" alignItems="center" justifyContent="flex-end">
        {lastUpdated && <Typography sx={{ fontSize: "11px", color: colors.grey[400] }}>Updated {lastUpdated.toLocaleTimeString()}</Typography>}
        <IconButton size="small" onClick={function() { fetchDashboard(false); }} sx={{ color: colors.grey[400], "&:hover": { color: COLOR_DELIVERED } }}>
          <RefreshIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>

      {/* ===== GRID FLOW MAP ===== */}
      <GridFlowMap colors={colors} isDark={isDark} />

      <Box sx={sectionDividerSx} />

      {/* ===== FLEET HOURLY ENERGY FLOW ===== */}
      <ChartDateHeader
        colors={colors} isDark={isDark}
        title="Fleet Hourly Energy Flow"
        subtitle={(isViewingToday ? "Today, " : "") + fmtDateLabel(selectedHourDate) + " — grid import vs export by hour"}
        date={selectedHourDate} onDateChange={setSelectedHourDate}
        minDate={earliestDate} maxDate={today}
        accentFrom={COLOR_DELIVERED} accentTo={COLOR_RECEIVED}
      />
      {/* Hourly KPIs */}
      <Box display="flex" gap="14px" mb="16px" flexWrap="wrap">
        <Box sx={kpiCardSx(COLOR_DELIVERED)}>
          <Typography sx={{ fontSize: "10px", fontWeight: 600, color: colors.grey[400], textTransform: "uppercase", letterSpacing: "0.5px" }}>Import — Selected Day</Typography>
          <Typography sx={{ fontSize: "22px", fontWeight: 800, color: colors.grey[100], mt: "4px" }}>{selectedDayImport.toFixed(2)} kWh</Typography>
          <Typography sx={{ fontSize: "10px", color: colors.grey[500], mt: "2px" }}>{fmtDateLabel(selectedHourDate)}</Typography>
        </Box>
        <Box sx={kpiCardSx(COLOR_RECEIVED)}>
          <Typography sx={{ fontSize: "10px", fontWeight: 600, color: colors.grey[400], textTransform: "uppercase", letterSpacing: "0.5px" }}>Export — Selected Day</Typography>
          <Typography sx={{ fontSize: "22px", fontWeight: 800, color: colors.grey[100], mt: "4px" }}>{selectedDayExport.toFixed(2)} kWh</Typography>
          <Typography sx={{ fontSize: "10px", color: colors.grey[500], mt: "2px" }}>Exported to grid</Typography>
        </Box>
        <Box sx={kpiCardSx("#ab47bc")}>
          <Typography sx={{ fontSize: "10px", fontWeight: 600, color: colors.grey[400], textTransform: "uppercase", letterSpacing: "0.5px" }}>Peak Hour</Typography>
          <Typography sx={{ fontSize: "22px", fontWeight: 800, color: colors.grey[100], mt: "4px" }}>{peakHourLabel}</Typography>
          <Typography sx={{ fontSize: "10px", color: colors.grey[500], mt: "2px" }}>{peakHourVal.toFixed(2)} kWh total flow</Typography>
        </Box>
        <Box sx={kpiCardSx(gridDependencyPct > 60 ? COLOR_COST : COLOR_REVENUE)}>
          <Typography sx={{ fontSize: "10px", fontWeight: 600, color: colors.grey[400], textTransform: "uppercase", letterSpacing: "0.5px" }}>Grid Dependency</Typography>
          <Typography sx={{ fontSize: "22px", fontWeight: 800, color: colors.grey[100], mt: "4px" }}>{gridDependencyPct.toFixed(1)}%</Typography>
          <Typography sx={{ fontSize: "10px", color: gridDependencyPct > 60 ? COLOR_COST : COLOR_REVENUE, fontWeight: 600, mt: "2px" }}>
            {gridDependencyPct > 60 ? "High grid reliance" : "Good export offset"}
          </Typography>
        </Box>
      </Box>
      {/* Hourly Chart — AreaChart, full width */}
      <Box sx={{ ...sectionCardSx, mb: 0, position: "relative" }}>
        {hourlyLoading && (
          <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: isDark ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.6)", zIndex: 1, borderRadius: "12px" }}>
            <CircularProgress size={28} sx={{ color: COLOR_DELIVERED }} />
          </Box>
        )}
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={hourlyData}>
            <defs>
              <linearGradient id="gradDeliveredFull" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLOR_DELIVERED} stopOpacity={0.35} />
                <stop offset="100%" stopColor={COLOR_DELIVERED} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gradReceivedFull" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLOR_RECEIVED} stopOpacity={0.35} />
                <stop offset="100%" stopColor={COLOR_RECEIVED} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#334155" : "#D1D5DB"} vertical={false} />
            <XAxis dataKey="hour" tick={{ fontSize: 11, fill: colors.grey[400] }} axisLine={{ stroke: isDark ? "#475569" : "#9CA3AF" }} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: colors.grey[400] }} axisLine={false} tickLine={false}
              label={{ value: "kWh", angle: -90, position: "insideLeft", style: { fontSize: 10, fill: colors.grey[400] } }} />
            <RechartsTooltip contentStyle={tooltipStyle} />
            <Area type="monotone" dataKey="delivered" stroke={COLOR_DELIVERED} fill="url(#gradDeliveredFull)" name="Grid Supply (kWh)" strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 2 }} />
            <Area type="monotone" dataKey="received" stroke={COLOR_RECEIVED} fill="url(#gradReceivedFull)" name="Exported to Grid (kWh)" strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 2 }} />
            <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "12px" }} />
          </AreaChart>
        </ResponsiveContainer>
      </Box>

      {/* ===== DIVIDER ===== */}
      <Box sx={sectionDividerSx} />

      {/* ===== ENERGY ANALYTICS ===== */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: "16px", flexWrap: "wrap", gap: "10px" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Box sx={{ width: 5, height: 28, borderRadius: "3px", background: "linear-gradient(180deg, " + COLOR_REVENUE + ", " + "#7c4dff" + ")" }} />
          <Typography sx={{ fontSize: "18px", fontWeight: 800, color: colors.grey[100], letterSpacing: "-0.3px" }}>Energy Analytics</Typography>
        </Box>
        <Box sx={{ display: "flex", gap: "4px", bgcolor: isDark ? colors.primary[500] : "#f0f0f0", borderRadius: "8px", p: "3px" }}>
          {["Hourly", "Daily", "Monthly"].map(function(t, i) {
            var active = analyticsTab === i;
            return (
              <Box key={t} onClick={function() { setAnalyticsTab(i); }} sx={{
                px: "14px", py: "6px", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer",
                color: active ? "#fff" : colors.grey[400], bgcolor: active ? COLOR_DELIVERED : "transparent",
                transition: "background-color 0.15s",
              }}>{t}</Box>
            );
          })}
        </Box>
      </Box>

      {analyticsTab === 0 && (
        <Box sx={{ ...sectionCardSx, mb: 0 }}>
          <Typography sx={{ fontSize: "13px", fontWeight: 700, color: colors.grey[100], mb: "12px" }}>
            Hour-by-hour breakdown — {fmtDateLabel(selectedHourDate)}
          </Typography>
          <TableContainer sx={{ maxHeight: "420px" }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {["Hour", "Import (kWh)", "Export (kWh)", "Net (kWh)"].map(function(h) {
                    return <TableCell key={h} align={h === "Hour" ? "left" : "right"} sx={{ backgroundColor: colors.primary[400], color: colors.grey[100], fontWeight: 700, borderBottom: "1px solid " + colors.grey[700], fontSize: "11px", textTransform: "uppercase" }}>{h}</TableCell>;
                  })}
                </TableRow>
              </TableHead>
              <TableBody>
                {hourlyData.map(function(h) {
                  var net = h.delivered - h.received;
                  return (
                    <TableRow key={h.hour}>
                      <TableCell sx={{ borderBottom: "1px solid " + colors.grey[800], color: colors.grey[200], fontSize: "12px" }}>{h.hour}</TableCell>
                      <TableCell align="right" sx={{ borderBottom: "1px solid " + colors.grey[800], color: COLOR_DELIVERED, fontSize: "12px" }}>{h.delivered.toFixed(2)}</TableCell>
                      <TableCell align="right" sx={{ borderBottom: "1px solid " + colors.grey[800], color: COLOR_RECEIVED, fontSize: "12px" }}>{h.received.toFixed(2)}</TableCell>
                      <TableCell align="right" sx={{ borderBottom: "1px solid " + colors.grey[800], color: net >= 0 ? COLOR_DELIVERED : COLOR_RECEIVED, fontSize: "12px", fontWeight: 600 }}>{net >= 0 ? "+" : ""}{net.toFixed(2)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {analyticsTab === 1 && (
        <>
          <CompactPeriodHeader
            colors={colors} isDark={isDark}
            title="Daily Breakdown" subtitle="Per-day energy flow for the selected month"
            label={monthInfo.label}
            onPrev={function() { setMonthOffset(function(p) { return p - 1; }); }}
            onNext={function() { setMonthOffset(function(p) { return p + 1; }); }}
            disableNext={monthOffset >= 0}
            accentFrom={COLOR_RECEIVED} accentTo="#ab47bc"
          />
          <Box display="flex" gap="14px" mb="16px" flexWrap="wrap">
            <Box sx={kpiCardSx(COLOR_DELIVERED)}>
              <Typography sx={{ fontSize: "10px", fontWeight: 600, color: colors.grey[400], textTransform: "uppercase", letterSpacing: "0.5px" }}>Month Import</Typography>
              <Typography sx={{ fontSize: "22px", fontWeight: 800, color: colors.grey[100], mt: "4px" }}>{monthTotalImport.toFixed(1)} kWh</Typography>
              <Typography sx={{ fontSize: "10px", color: colors.grey[500], mt: "2px" }}>Revenue: {fmtCurrency(monthRevenue)}</Typography>
            </Box>
            <Box sx={kpiCardSx(COLOR_RECEIVED)}>
              <Typography sx={{ fontSize: "10px", fontWeight: 600, color: colors.grey[400], textTransform: "uppercase", letterSpacing: "0.5px" }}>Month Export</Typography>
              <Typography sx={{ fontSize: "22px", fontWeight: 800, color: colors.grey[100], mt: "4px" }}>{monthTotalExport.toFixed(1)} kWh</Typography>
              <Typography sx={{ fontSize: "10px", color: colors.grey[500], mt: "2px" }}>Feed-in cost: {fmtCurrency(monthFeedInCost)}</Typography>
            </Box>
            <Box sx={kpiCardSx("#66bb6a")}>
              <Typography sx={{ fontSize: "10px", fontWeight: 600, color: colors.grey[400], textTransform: "uppercase", letterSpacing: "0.5px" }}>Best Export Day</Typography>
              <Typography sx={{ fontSize: "22px", fontWeight: 800, color: colors.grey[100], mt: "4px" }}>{bestExportDay || "--"}</Typography>
              <Typography sx={{ fontSize: "10px", color: COLOR_RECEIVED, fontWeight: 600, mt: "2px" }}>{bestExportVal.toFixed(1)} kWh exported</Typography>
            </Box>
            <Box sx={kpiCardSx(COLOR_REVENUE)}>
              <Typography sx={{ fontSize: "10px", fontWeight: 600, color: colors.grey[400], textTransform: "uppercase", letterSpacing: "0.5px" }}>Monthly Net Revenue</Typography>
              <Typography sx={{ fontSize: "22px", fontWeight: 800, color: monthNetRevenue >= 0 ? COLOR_REVENUE : COLOR_COST, mt: "4px" }}>
                {fmtCurrency(monthNetRevenue)}
              </Typography>
              <Typography sx={{ fontSize: "10px", color: colors.grey[500], mt: "2px" }}>After feed-in credits</Typography>
            </Box>
          </Box>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <Box sx={{ ...sectionCardSx, mb: 0 }}>
              <Typography sx={{ fontSize: "13px", fontWeight: 700, color: colors.grey[100], mb: "12px" }}>Energy (kWh)</Typography>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={monthlyChartData} barGap={2}>
                  <defs>
                    <linearGradient id="barGradMonthDel" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLOR_DELIVERED} stopOpacity={1} />
                      <stop offset="100%" stopColor={COLOR_DELIVERED} stopOpacity={0.55} />
                    </linearGradient>
                    <linearGradient id="barGradMonthRec" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLOR_RECEIVED} stopOpacity={1} />
                      <stop offset="100%" stopColor={COLOR_RECEIVED} stopOpacity={0.55} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#334155" : "#D1D5DB"} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: colors.grey[400] }} axisLine={{ stroke: isDark ? "#475569" : "#9CA3AF" }} tickLine={false} interval={0} />
                  <YAxis tick={{ fontSize: 10, fill: colors.grey[400] }} axisLine={false} tickLine={false}
                    label={{ value: "kWh", angle: -90, position: "insideLeft", style: { fontSize: 10, fill: colors.grey[400] } }} />
                  <RechartsTooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="delivered" fill="url(#barGradMonthDel)" name="Grid Supply (kWh)" radius={[4, 4, 0, 0]} maxBarSize={20} />
                  <Bar dataKey="received" fill="url(#barGradMonthRec)" name="Exported to Grid (kWh)" radius={[4, 4, 0, 0]} maxBarSize={20} />
                  <Legend wrapperStyle={{ fontSize: "10px", paddingTop: "12px" }} />
                </BarChart>
              </ResponsiveContainer>
            </Box>
            <Box sx={{ ...sectionCardSx, mb: 0 }}>
              <Typography sx={{ fontSize: "13px", fontWeight: 700, color: colors.grey[100], mb: "12px" }}>Revenue (N$)</Typography>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={monthlyChartData} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#334155" : "#D1D5DB"} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: colors.grey[400] }} axisLine={{ stroke: isDark ? "#475569" : "#9CA3AF" }} tickLine={false} interval={0} />
                  <YAxis tick={{ fontSize: 10, fill: colors.grey[400] }} axisLine={false} tickLine={false}
                    label={{ value: "N$", angle: -90, position: "insideLeft", style: { fontSize: 10, fill: colors.grey[400] } }} />
                  <RechartsTooltip contentStyle={tooltipStyle} formatter={function(value, name) { return ["N$ " + Number(value).toFixed(2), name]; }} />
                  <Bar dataKey="revenue" fill={COLOR_REVENUE} name="Sales Revenue (N$)" radius={[4, 4, 0, 0]} maxBarSize={20} />
                  <Bar dataKey="feedInCost" fill={COLOR_COST} name="Feed-in Credits Paid (N$)" radius={[4, 4, 0, 0]} maxBarSize={20} />
                  <Legend wrapperStyle={{ fontSize: "10px", paddingTop: "12px" }} />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </Box>
        </>
      )}

      {analyticsTab === 2 && (
        <>
          <CompactPeriodHeader
            colors={colors} isDark={isDark}
            title="Monthly Summary" subtitle="Per-month energy and financial performance for the selected year"
            label={yearInfo.label}
            onPrev={function() { setYearOffset(function(p) { return p - 1; }); }}
            onNext={function() { setYearOffset(function(p) { return p + 1; }); }}
            disableNext={yearOffset >= 0}
            accentFrom="#7c4dff" accentTo={COLOR_DELIVERED}
          />
          <Box display="flex" gap="14px" mb="16px" flexWrap="wrap">
            <Box sx={kpiCardSx(COLOR_DELIVERED)}>
              <Typography sx={{ fontSize: "10px", fontWeight: 600, color: colors.grey[400], textTransform: "uppercase", letterSpacing: "0.5px" }}>Year Import</Typography>
              <Typography sx={{ fontSize: "22px", fontWeight: 800, color: colors.grey[100], mt: "4px" }}>{yearTotalImport.toFixed(1)} kWh</Typography>
              <Typography sx={{ fontSize: "10px", color: colors.grey[500], mt: "2px" }}>Revenue: {fmtCurrency(yearRevenue)}</Typography>
            </Box>
            <Box sx={kpiCardSx(COLOR_RECEIVED)}>
              <Typography sx={{ fontSize: "10px", fontWeight: 600, color: colors.grey[400], textTransform: "uppercase", letterSpacing: "0.5px" }}>Year Export</Typography>
              <Typography sx={{ fontSize: "22px", fontWeight: 800, color: colors.grey[100], mt: "4px" }}>{yearTotalExport.toFixed(1)} kWh</Typography>
              <Typography sx={{ fontSize: "10px", color: colors.grey[500], mt: "2px" }}>Feed-in cost: {fmtCurrency(yearFeedInCost)}</Typography>
            </Box>
            <Box sx={kpiCardSx(yearNetRevenue >= 0 ? COLOR_REVENUE : COLOR_COST)}>
              <Typography sx={{ fontSize: "10px", fontWeight: 600, color: colors.grey[400], textTransform: "uppercase", letterSpacing: "0.5px" }}>Year Net Revenue</Typography>
              <Typography sx={{ fontSize: "22px", fontWeight: 800, color: yearNetRevenue >= 0 ? COLOR_REVENUE : COLOR_COST, mt: "4px" }}>
                {fmtCurrency(yearNetRevenue)}
              </Typography>
              <Chip label={yearNetRevenue >= 0 ? "Profitable" : "Loss"}
                size="small" sx={{ mt: "6px", height: 20, fontSize: "9px", fontWeight: 700,
                  bgcolor: (yearNetRevenue >= 0 ? COLOR_REVENUE : COLOR_COST) + "18",
                  color: yearNetRevenue >= 0 ? COLOR_REVENUE : COLOR_COST }} />
            </Box>
            <Box sx={kpiCardSx(gridDepScore > 60 ? COLOR_COST : COLOR_REVENUE)}>
              <Typography sx={{ fontSize: "10px", fontWeight: 600, color: colors.grey[400], textTransform: "uppercase", letterSpacing: "0.5px" }}>Grid Dependency Score</Typography>
              <Typography sx={{ fontSize: "22px", fontWeight: 800, color: colors.grey[100], mt: "4px" }}>{gridDepScore.toFixed(1)}%</Typography>
              <Typography sx={{ fontSize: "10px", color: gridDepScore > 60 ? COLOR_COST : COLOR_REVENUE, fontWeight: 600, mt: "2px" }}>
                {gridDepScore > 75 ? "Highly grid dependent" : gridDepScore > 50 ? "Moderate dependency" : "Net exporting fleet"}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <Box sx={{ ...sectionCardSx, mb: 0 }}>
              <Typography sx={{ fontSize: "13px", fontWeight: 700, color: colors.grey[100], mb: "12px" }}>Energy (kWh)</Typography>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={yearlyChartData} barGap={6}>
                  <defs>
                    <linearGradient id="barGradYearDel" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLOR_DELIVERED} stopOpacity={1} />
                      <stop offset="100%" stopColor={COLOR_DELIVERED} stopOpacity={0.5} />
                    </linearGradient>
                    <linearGradient id="barGradYearRec" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLOR_RECEIVED} stopOpacity={1} />
                      <stop offset="100%" stopColor={COLOR_RECEIVED} stopOpacity={0.5} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#334155" : "#D1D5DB"} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: colors.grey[400] }} axisLine={{ stroke: isDark ? "#475569" : "#9CA3AF" }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: colors.grey[400] }} axisLine={false} tickLine={false}
                    label={{ value: "kWh", angle: -90, position: "insideLeft", style: { fontSize: 10, fill: colors.grey[400] } }} />
                  <RechartsTooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="delivered" fill="url(#barGradYearDel)" name="Grid Supply (kWh)" radius={[8, 8, 0, 0]} maxBarSize={56} />
                  <Bar dataKey="received" fill="url(#barGradYearRec)" name="Exported to Grid (kWh)" radius={[8, 8, 0, 0]} maxBarSize={56} />
                  <Legend wrapperStyle={{ fontSize: "10px", paddingTop: "12px" }} />
                </BarChart>
              </ResponsiveContainer>
            </Box>
            <Box sx={{ ...sectionCardSx, mb: 0 }}>
              <Typography sx={{ fontSize: "13px", fontWeight: 700, color: colors.grey[100], mb: "12px" }}>Revenue (N$)</Typography>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={yearlyChartData} barGap={6}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#334155" : "#D1D5DB"} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: colors.grey[400] }} axisLine={{ stroke: isDark ? "#475569" : "#9CA3AF" }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: colors.grey[400] }} axisLine={false} tickLine={false}
                    label={{ value: "N$", angle: -90, position: "insideLeft", style: { fontSize: 10, fill: colors.grey[400] } }} />
                  <RechartsTooltip contentStyle={tooltipStyle} formatter={function(value, name) { return ["N$ " + Number(value).toFixed(2), name]; }} />
                  <Bar dataKey="revenue" fill={COLOR_REVENUE} name="Sales Revenue (N$)" radius={[8, 8, 0, 0]} maxBarSize={56} />
                  <Bar dataKey="feedInCost" fill={COLOR_COST} name="Feed-in Credits Paid (N$)" radius={[8, 8, 0, 0]} maxBarSize={56} />
                  <Legend wrapperStyle={{ fontSize: "10px", paddingTop: "12px" }} />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </Box>
        </>
      )}

      <Box sx={sectionDividerSx} />

      {/* ===== TARIFF FOOTER ===== */}
      <Box sx={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: "32px",
        py: "16px", px: "24px", borderRadius: "10px",
        bgcolor: isDark ? colors.primary[500] : "#f8f9fa",
        border: "1px solid " + (isDark ? colors.grey[700] : "#eee"),
        flexWrap: "wrap",
      }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: COLOR_DELIVERED }} />
          <Typography sx={{ fontSize: "11px", color: colors.grey[400] }}>Fleet Retail Tariff:</Typography>
          <Typography sx={{ fontSize: "12px", fontWeight: 700, color: colors.grey[100] }}>N$ {tariffRetail.toFixed(2)}/kWh</Typography>
        </Box>
        <Box sx={{ width: "1px", height: "20px", bgcolor: colors.grey[700] }} />
        <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: COLOR_RECEIVED }} />
          <Typography sx={{ fontSize: "11px", color: colors.grey[400] }}>Fleet Feed-in Tariff:</Typography>
          <Typography sx={{ fontSize: "12px", fontWeight: 700, color: colors.grey[100] }}>N$ {tariffFeedIn.toFixed(2)}/kWh</Typography>
        </Box>
        <Box sx={{ width: "1px", height: "20px", bgcolor: colors.grey[700] }} />
        <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Typography sx={{ fontSize: "11px", color: colors.grey[400] }}>Spread:</Typography>
          <Typography sx={{ fontSize: "12px", fontWeight: 700, color: COLOR_REVENUE }}>N$ {(tariffRetail - tariffFeedIn).toFixed(2)}/kWh</Typography>
        </Box>
        {tariffIsFallback && (
          <Tooltip title="Could not load real tariff rates from the backend — showing fallback defaults, not an authoritative figure.">
            <Chip label="Fallback rate" size="small" sx={{ height: 20, fontSize: "9px", fontWeight: 700, bgcolor: COLOR_COST + "18", color: COLOR_COST }} />
          </Tooltip>
        )}
      </Box>
      <Typography sx={{ fontSize: "10px", color: colors.grey[500], textAlign: "center", mt: "8px" }}>
        Fleet-representative rate, not necessarily each customer's actual tariff — see the Configuration tab for per-meter billing mode and feed-in rate.
      </Typography>
    </>
  );
}

function ActiveMetersTab({ colors, isDark, activeMeters, fetchDashboard, lastUpdated, tariffRetail, tariffFeedIn }) {
  var navigate = useNavigate();
  var [search, setSearch] = useState("");
  var [statusFilter, setStatusFilter] = useState("all");

  var filtered = activeMeters.filter(function(m) {
    if (statusFilter === "consuming" && m.power_direction !== "IMPORT") return false;
    if (statusFilter === "feeding" && m.power_direction !== "EXPORT") return false;
    if (statusFilter === "idle" && m.power_direction && m.power_direction !== "IDLE") return false;
    if (statusFilter === "online" && m.status !== "Online") return false;
    if (statusFilter === "offline" && m.status === "Online") return false;
    if (!search) return true;
    var s = search.toLowerCase();
    return (m.DRN && m.DRN.toLowerCase().includes(s)) || (m.customer_name && m.customer_name.toLowerCase().includes(s));
  });

  var consumingCnt = activeMeters.filter(function(m) { return m.power_direction === "IMPORT"; }).length;
  var feedingCnt = activeMeters.filter(function(m) { return m.power_direction === "EXPORT"; }).length;
  var onlineCnt = activeMeters.filter(function(m) { return m.status === "Online"; }).length;
  var offlineCnt = activeMeters.filter(function(m) { return m.status !== "Online"; }).length;

  return (
    <>
      <Box display="flex" gap="12px" mb="16px" flexWrap="wrap">
        <SummaryCard colors={colors} label="Net Metered Customers" value={activeMeters.length} icon={ElectricMeterOutlinedIcon} color={COLOR_DELIVERED} subtitle={onlineCnt + " online"} />
        <SummaryCard colors={colors} label="Consuming (Grid Supply)" value={consumingCnt} icon={ElectricBoltIcon} color={COLOR_DELIVERED} subtitle="Drawing from grid" />
        <SummaryCard colors={colors} label="Feeding In (Export)" value={feedingCnt} icon={UploadOutlinedIcon} color={COLOR_RECEIVED} subtitle="Sending to grid" />
        <SummaryCard colors={colors} label="Offline" value={offlineCnt} icon={BoltIcon} color="#ff7043" subtitle="No signal > 5m" />
      </Box>

      <Box display="flex" gap="12px" mb="16px" alignItems="center" flexWrap="wrap">
        <TextField size="small" placeholder="Search by DRN or customer..."
          value={search} onChange={function(e) { setSearch(e.target.value); }}
          sx={{ minWidth: 280, flex: 1, maxWidth: 400 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchOutlinedIcon sx={{ color: colors.grey[500], fontSize: 18 }} /></InputAdornment> }}
        />
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Filter</InputLabel>
          <Select value={statusFilter} label="Filter" onChange={function(e) { setStatusFilter(e.target.value); }}>
            <MenuItem value="all">All Meters</MenuItem>
            <MenuItem value="consuming">Consuming (Grid)</MenuItem>
            <MenuItem value="feeding">Feeding In (Export)</MenuItem>
            <MenuItem value="idle">Idle</MenuItem>
            <MenuItem value="online">Online</MenuItem>
            <MenuItem value="offline">Offline</MenuItem>
          </Select>
        </FormControl>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, ml: "auto" }}>
          {lastUpdated && <Typography sx={{ fontSize: "11px", color: colors.grey[400] }}>Updated {lastUpdated.toLocaleTimeString()}</Typography>}
          <IconButton size="small" onClick={function() { fetchDashboard(false); }} sx={{ color: colors.grey[400], "&:hover": { color: COLOR_DELIVERED } }}>
            <RefreshIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
      </Box>

      <Box sx={{ backgroundColor: colors.primary[400], borderRadius: "8px", overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <Box display="flex" flexDirection="column" alignItems="center" py="60px" gap="8px">
            <UploadOutlinedIcon sx={{ fontSize: 48, color: COLOR_DELIVERED, opacity: 0.4 }} />
            <Typography color={colors.grey[400]}>No net metering customers found</Typography>
          </Box>
        ) : (
          <TableContainer sx={{ maxHeight: "600px" }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {["DRN", "Customer", "Flow Direction", "Live Power", "Grid Supply (kWh)", "Exported (kWh)", "Net (kWh)", "Revenue", "Last Seen", "Status", ""].map(function(h) {
                    return <TableCell key={h} sx={{ backgroundColor: colors.primary[400], color: colors.grey[100], fontWeight: 700, borderBottom: "1px solid " + colors.grey[700], fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px" }}
                      align={["Live Power", "Grid Supply (kWh)", "Exported (kWh)", "Net (kWh)", "Revenue"].includes(h) ? "right" : "left"}>{h}</TableCell>;
                  })}
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map(function(m) {
                  var delivered = m.total_import || 0;
                  var received = m.total_export || 0;
                  var netKwh = (delivered - received) / 1000;
                  var meterRevenue = (delivered / 1000) * tariffRetail - (received / 1000) * tariffFeedIn;
                  var isOnline = m.status === "Online";
                  var rawDirection = m.power_direction || "IDLE";
                  var dirLabel = rawDirection === "IMPORT" ? "CONSUMING" : rawDirection === "EXPORT" ? "FEEDING IN" : "IDLE";
                  var dirColor = rawDirection === "IMPORT" ? COLOR_DELIVERED : rawDirection === "EXPORT" ? COLOR_RECEIVED : colors.grey[400];
                  return (
                    <TableRow key={m.DRN} sx={{ "&:hover": { bgcolor: "rgba(33,150,243,0.04)", cursor: "pointer" } }} onClick={function() { navigate("/meter/" + m.DRN); }}>
                      <TableCell sx={{ borderBottom: "1px solid " + colors.grey[800] }}><Typography fontWeight="600" fontSize="13px" color={colors.grey[100]}>{m.DRN}</Typography></TableCell>
                      <TableCell sx={{ borderBottom: "1px solid " + colors.grey[800], color: colors.grey[200], fontSize: "13px" }}>{m.customer_name || m.DRN}</TableCell>
                      <TableCell sx={{ borderBottom: "1px solid " + colors.grey[800] }}><Chip label={dirLabel} size="small" sx={{ bgcolor: dirColor + "20", color: dirColor, fontWeight: 700, fontSize: "9px", height: 22 }} /></TableCell>
                      <TableCell align="right" sx={{ borderBottom: "1px solid " + colors.grey[800], color: dirColor, fontSize: "12px", fontWeight: 600 }}>{m.live_power != null ? formatPower(m.live_power) : "--"}</TableCell>
                      <TableCell align="right" sx={{ borderBottom: "1px solid " + colors.grey[800], color: COLOR_DELIVERED, fontSize: "12px" }}>{toKwh(delivered)}</TableCell>
                      <TableCell align="right" sx={{ borderBottom: "1px solid " + colors.grey[800], color: COLOR_RECEIVED, fontSize: "12px" }}>{toKwh(received)}</TableCell>
                      <TableCell align="right" sx={{ borderBottom: "1px solid " + colors.grey[800], color: netKwh >= 0 ? COLOR_DELIVERED : COLOR_RECEIVED, fontSize: "12px", fontWeight: 600 }}>{netKwh >= 0 ? "+" : ""}{netKwh.toFixed(1)}</TableCell>
                      <TableCell align="right" sx={{ borderBottom: "1px solid " + colors.grey[800], color: meterRevenue >= 0 ? COLOR_REVENUE : COLOR_COST, fontSize: "12px", fontWeight: 600 }}>{fmtCurrency(meterRevenue)}</TableCell>
                      <TableCell sx={{ borderBottom: "1px solid " + colors.grey[800] }}>
                        <Tooltip title={m.last_reading ? new Date(m.last_reading).toLocaleString() : "--"}><Typography fontSize="12px" color={colors.grey[300]}>{m.last_reading ? timeAgo(m.last_reading) : "--"}</Typography></Tooltip>
                      </TableCell>
                      <TableCell sx={{ borderBottom: "1px solid " + colors.grey[800] }}>
                        <Chip label={isOnline ? "Online" : "Offline"} size="small" sx={{ bgcolor: isOnline ? "rgba(76,175,80,0.12)" : "rgba(244,67,54,0.12)", color: isOnline ? "#4caf50" : "#f44336", fontWeight: 600, fontSize: "10px", height: 22 }} />
                      </TableCell>
                      <TableCell sx={{ borderBottom: "1px solid " + colors.grey[800] }}>
                        <Button size="small" variant="outlined" startIcon={<OpenInNewOutlinedIcon sx={{ fontSize: 14 }} />}
                          onClick={function(e) { e.stopPropagation(); navigate("/meter/" + m.DRN); }}
                          sx={{ fontSize: "10px", textTransform: "none", py: "2px", px: "8px", color: colors.grey[300], borderColor: colors.grey[600], "&:hover": { borderColor: COLOR_DELIVERED, color: COLOR_DELIVERED } }}>View</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        {filtered.length > 0 && (
          <Box px="16px" py="8px" display="flex" justifyContent="space-between" borderTop={"1px solid " + colors.grey[800]}>
            <Typography fontSize="11px" color={colors.grey[500]}>Showing {filtered.length} of {activeMeters.length} customers</Typography>
          </Box>
        )}
      </Box>
    </>
  );
}

function ConfigurationTab({ colors, isDark, activeMeters }) {
  var [configs, setConfigs] = useState([]);
  var [configLoading, setConfigLoading] = useState(false);
  var [editingDrn, setEditingDrn] = useState(null);
  var [editMode, setEditMode] = useState(0);
  var [editFeedInRate, setEditFeedInRate] = useState("");
  var [snack, setSnack] = useState({ open: false, msg: "", severity: "success" });

  var NM_MODES = [
    { value: 0, label: "Gross Metering", desc: "Energy billed at full retail rate. Exported energy is recorded but not credited against consumption." },
    { value: 1, label: "Net Billing", desc: "Customer pays net of consumption minus generation. Feed-in offsets grid supply in the same billing period." },
    { value: 2, label: "Feed-in Tariff", desc: "Exported energy is credited at a separate feed-in rate (typically lower than retail). Configurable per meter." },
    { value: 3, label: "TOU Net Metering", desc: "Time-of-Use aware. Feed-in during peak hours earns higher credits. Off-peak feed-in at base rate." },
  ];

  var fetchConfigs = useCallback(async function() {
    setConfigLoading(true);
    try {
      var [metersRes, configsRes] = await Promise.allSettled([netMeteringAPI.getActiveMeters(), netMeteringAPI.getAllConfigs()]);
      var meters = metersRes.status === "fulfilled" ? metersRes.value?.data || [] : activeMeters;
      var cfgs = configsRes.status === "fulfilled" ? configsRes.value?.data || [] : [];
      var cfgMap = {};
      cfgs.forEach(function(c) { cfgMap[c.DRN] = c; });
      setConfigs(meters.map(function(m) {
        return { ...m, nm_mode: cfgMap[m.DRN]?.nm_mode ?? 0, feed_in_rate: cfgMap[m.DRN]?.feed_in_rate ?? 0, config_updated: cfgMap[m.DRN]?.updated_at || null };
      }));
    } catch (err) { console.error(err); }
    finally { setConfigLoading(false); }
  }, [activeMeters]);

  useEffect(function() { fetchConfigs(); }, [fetchConfigs]);

  var saveConfig = async function(drn) {
    try {
      await netMeteringAPI.setConfig(drn, { nm_mode: editMode, feed_in_rate: parseFloat(editFeedInRate) || 0 });
      setSnack({ open: true, msg: "Configuration updated for " + drn + " and sent to meter via MQTT", severity: "success" });
      setEditingDrn(null);
      fetchConfigs();
    } catch (err) { setSnack({ open: true, msg: "Error: " + err.message, severity: "error" }); }
  };

  return (
    <>
      <Box sx={{ backgroundColor: colors.primary[400], borderRadius: "8px", p: "20px", mb: 2 }}>
        <Typography sx={{ fontSize: "14px", fontWeight: 700, color: colors.grey[100], mb: 1 }}>Net Metering Billing Mode</Typography>
        <Typography sx={{ fontSize: "12px", color: colors.grey[300], mb: 3 }}>
          Configure how the utility bills each net metered customer. Determines how exported energy is credited against grid consumption. Changes are pushed to meters via MQTT.
        </Typography>
        <Grid container spacing={2}>
          {NM_MODES.map(function(m) {
            return (
              <Grid item xs={12} sm={6} md={3} key={m.value}>
                <Box sx={{ p: 2, borderRadius: "8px", border: "1px solid " + colors.grey[700], bgcolor: isDark ? colors.primary[500] : "#fafafa" }}>
                  <Chip label={"Mode " + m.value} size="small" sx={{
                    bgcolor: ["rgba(100,116,139,0.12)", "rgba(33,150,243,0.12)", "rgba(76,175,80,0.12)", "rgba(255,152,0,0.12)"][m.value],
                    color: ["#94a3b8", "#42a5f5", "#66bb6a", "#ffa726"][m.value], fontWeight: 700, fontSize: "10px", mb: 1,
                  }} />
                  <Typography sx={{ fontSize: "13px", fontWeight: 700, color: colors.grey[100], mb: 0.5 }}>{m.label}</Typography>
                  <Typography sx={{ fontSize: "11px", color: colors.grey[400], lineHeight: 1.4 }}>{m.desc}</Typography>
                </Box>
              </Grid>
            );
          })}
        </Grid>
      </Box>

      <Box sx={{ backgroundColor: colors.primary[400], borderRadius: "8px", overflow: "hidden" }}>
        <Box px="20px" pt="16px" pb="8px" display="flex" justifyContent="space-between" alignItems="center">
          <Box display="flex" alignItems="center" gap="10px">
            <Box sx={{ width: 4, height: 24, borderRadius: "2px", bgcolor: COLOR_DELIVERED }} />
            <Box>
              <Typography variant="h6" color={colors.grey[100]} fontWeight="bold">Customer Billing Configuration ({configs.length})</Typography>
              <Typography fontSize="11px" color={colors.grey[400]}>Set billing mode per customer meter</Typography>
            </Box>
          </Box>
          <IconButton size="small" onClick={fetchConfigs} sx={{ color: colors.grey[400], "&:hover": { color: COLOR_DELIVERED } }}><RefreshIcon sx={{ fontSize: 18 }} /></IconButton>
        </Box>
        {configLoading ? (
          <Box display="flex" justifyContent="center" py="60px"><CircularProgress sx={{ color: COLOR_DELIVERED }} /></Box>
        ) : configs.length === 0 ? (
          <Box display="flex" flexDirection="column" alignItems="center" py="60px" gap="8px">
            <SettingsIcon sx={{ fontSize: 48, color: colors.grey[500], opacity: 0.4 }} />
            <Typography color={colors.grey[400]}>No net metered customers found</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small" stickyHeader>
              <TableHead><TableRow>
                {["DRN", "Customer", "Billing Mode", "Feed-in Rate", "Last Updated", "Actions"].map(function(h) {
                  return <TableCell key={h} sx={{ backgroundColor: colors.primary[400], color: colors.grey[100], fontWeight: 700, borderBottom: "1px solid " + colors.grey[700], fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</TableCell>;
                })}
              </TableRow></TableHead>
              <TableBody>
                {configs.map(function(c) {
                  var isEditing = editingDrn === c.DRN;
                  var modeInfo = NM_MODES[c.nm_mode] || NM_MODES[0];
                  var modeColor = ["#94a3b8", "#42a5f5", "#66bb6a", "#ffa726"][c.nm_mode] || "#94a3b8";
                  return (
                    <TableRow key={c.DRN} sx={{ "&:hover": { bgcolor: "rgba(33,150,243,0.04)" } }}>
                      <TableCell sx={{ borderBottom: "1px solid " + colors.grey[800] }}><Typography fontWeight="600" fontSize="13px" color={colors.grey[100]}>{c.DRN}</Typography></TableCell>
                      <TableCell sx={{ borderBottom: "1px solid " + colors.grey[800], color: colors.grey[200], fontSize: "13px" }}>{c.customer_name || c.DRN}</TableCell>
                      <TableCell sx={{ borderBottom: "1px solid " + colors.grey[800] }}>
                        {isEditing ? (
                          <FormControl size="small" sx={{ minWidth: 180 }}>
                            <Select value={editMode} onChange={function(e) { setEditMode(e.target.value); }}
                              sx={{ fontSize: "12px", color: colors.grey[100], "& .MuiOutlinedInput-notchedOutline": { borderColor: colors.grey[600] } }}>
                              {NM_MODES.map(function(m) { return <MenuItem key={m.value} value={m.value} sx={{ fontSize: "12px" }}>{m.label}</MenuItem>; })}
                            </Select>
                          </FormControl>
                        ) : <Chip label={modeInfo.label} size="small" sx={{ bgcolor: modeColor + "20", color: modeColor, fontWeight: 600, fontSize: "10px" }} />}
                      </TableCell>
                      <TableCell sx={{ borderBottom: "1px solid " + colors.grey[800] }}>
                        {isEditing ? (
                          <TextField size="small" type="number" value={editFeedInRate} onChange={function(e) { setEditFeedInRate(e.target.value); }}
                            placeholder="0.00" inputProps={{ step: "0.01", min: "0" }} disabled={editMode !== 2}
                            sx={{ width: 120, "& input": { fontSize: "12px", color: colors.grey[100] }, "& .MuiOutlinedInput-notchedOutline": { borderColor: colors.grey[600] } }} />
                        ) : <Typography sx={{ fontSize: "12px", color: c.nm_mode === 2 ? COLOR_RECEIVED : colors.grey[500] }}>{c.nm_mode === 2 ? "N$ " + (c.feed_in_rate || 0).toFixed(4) + "/kWh" : "N/A"}</Typography>}
                      </TableCell>
                      <TableCell sx={{ borderBottom: "1px solid " + colors.grey[800], color: colors.grey[300], fontSize: "11px" }}>{c.config_updated ? new Date(c.config_updated).toLocaleString() : "Not configured"}</TableCell>
                      <TableCell sx={{ borderBottom: "1px solid " + colors.grey[800] }}>
                        {isEditing ? (
                          <Box sx={{ display: "flex", gap: 1 }}>
                            <Button size="small" variant="contained" startIcon={<SaveIcon sx={{ fontSize: 14 }} />}
                              onClick={function() { saveConfig(c.DRN); }}
                              sx={{ fontSize: "11px", textTransform: "none", bgcolor: COLOR_DELIVERED, "&:hover": { bgcolor: "#1976d2" } }}>Save</Button>
                            <Button size="small" variant="outlined" onClick={function() { setEditingDrn(null); }}
                              sx={{ fontSize: "11px", textTransform: "none", color: colors.grey[300], borderColor: colors.grey[600] }}>Cancel</Button>
                          </Box>
                        ) : (
                          <IconButton size="small" onClick={function() { setEditingDrn(c.DRN); setEditMode(c.nm_mode); setEditFeedInRate(String(c.feed_in_rate || 0)); }}
                            sx={{ color: colors.grey[400], "&:hover": { color: COLOR_DELIVERED } }}><EditIcon sx={{ fontSize: 16 }} /></IconButton>
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
      <Snackbar open={snack.open} autoHideDuration={4000} onClose={function() { setSnack({ ...snack, open: false }); }} anchorOrigin={{ vertical: "bottom", horizontal: "right" }}>
        <Alert severity={snack.severity} onClose={function() { setSnack({ ...snack, open: false }); }} sx={{ fontSize: "12px" }}>{snack.msg}</Alert>
      </Snackbar>
    </>
  );
}

export default function NetMetering() {
  var theme = useTheme();
  var colors = tokens(theme.palette.mode);
  var isDark = theme.palette.mode === "dark";
  var [loading, setLoading] = useState(true);
  var [dashData, setDashData] = useState(null);
  var [activeMeters, setActiveMeters] = useState([]);
  var [lastUpdated, setLastUpdated] = useState(null);
  var [allPeriodData, setAllPeriodData] = useState({ daily: [], thisweek: [], thisyear: [], yearly: [] });
  var [tariffRates, setTariffRates] = useState({ retailRate: null, feedInRate: null });
  var [activeTab, setActiveTab] = useState(0);

  var fetchDashboard = useCallback(async function(showLoading) {
    if (showLoading) setLoading(true);
    try {
      var [dashRes, metersRes, dailyRes, weekRes, monthRes, yearRes, tariffRes] = await Promise.allSettled([
        netMeteringAPI.getDashboard(),
        netMeteringAPI.getActiveMeters(),
        netMeteringAPI.getDashboard("daily"),
        netMeteringAPI.getDashboard("thisweek"),
        netMeteringAPI.getDashboard("thisyear"),
        netMeteringAPI.getDashboard("yearly"),
        netMeteringAPI.getTariffRates(),
      ]);
      if (dashRes.status === "fulfilled" && dashRes.value?.data) setDashData(dashRes.value.data);
      if (metersRes.status === "fulfilled" && metersRes.value?.data) setActiveMeters(metersRes.value.data);
      setAllPeriodData({
        daily: dailyRes.status === "fulfilled" ? dailyRes.value?.data?.daily || [] : [],
        thisweek: weekRes.status === "fulfilled" ? weekRes.value?.data?.daily || [] : [],
        thisyear: monthRes.status === "fulfilled" ? monthRes.value?.data?.daily || [] : [],
        yearly: yearRes.status === "fulfilled" ? yearRes.value?.data?.daily || [] : [],
      });
      if (tariffRes.status === "fulfilled" && tariffRes.value?.data) {
        setTariffRates({ retailRate: tariffRes.value.data.retailRate, feedInRate: tariffRes.value.data.feedInRate });
      }
      setLastUpdated(new Date());
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(function() {
    fetchDashboard(true);
    var interval = setInterval(function() { fetchDashboard(false); }, 30000);
    return function() { clearInterval(interval); };
  }, [fetchDashboard]);

  if (loading) {
    return (
      <Box m="20px">
        <Header title="NET METERING" subtitle="Utility Net Metering Management" />
        <Box sx={{ display: "flex", justifyContent: "center", mt: "80px" }}><CircularProgress sx={{ color: COLOR_DELIVERED }} /></Box>
      </Box>
    );
  }

  // Real backend rates when available; fall back to the last-resort
  // constants only if the tariff-rates fetch failed or returned nothing yet.
  var tariffIsFallback = tariffRates.retailRate == null || tariffRates.feedInRate == null;
  var tariffRetail = tariffRates.retailRate != null ? tariffRates.retailRate : FALLBACK_RETAIL;
  var tariffFeedIn = tariffRates.feedInRate != null ? tariffRates.feedInRate : FALLBACK_FEEDIN;

  var tabSharedProps = { colors: colors, isDark: isDark, tariffRetail: tariffRetail, tariffFeedIn: tariffFeedIn };

  return (
    <Box m="20px">
      <Header title="NET METERING" subtitle="Utility-wide net metering analytics — grid import vs export" />

      <Tabs value={activeTab} onChange={function(e, v) { setActiveTab(v); }} sx={{ mb: "20px", minHeight: 36, "& .MuiTab-root": { minHeight: 36, textTransform: "none", fontWeight: 600, fontSize: "13px" } }}>
        <Tab label="Fleet Dashboard" />
        <Tab label={"Active Meters (" + activeMeters.length + ")"} />
        <Tab label="Configuration" />
      </Tabs>

      {activeTab === 0 && (
        <FleetDashboardTab {...tabSharedProps} dashData={dashData} activeMeters={activeMeters} lastUpdated={lastUpdated} allPeriodData={allPeriodData} fetchDashboard={fetchDashboard} tariffIsFallback={tariffIsFallback} />
      )}
      {activeTab === 1 && (
        <ActiveMetersTab {...tabSharedProps} activeMeters={activeMeters} fetchDashboard={fetchDashboard} lastUpdated={lastUpdated} />
      )}
      {activeTab === 2 && (
        <ConfigurationTab colors={colors} isDark={isDark} activeMeters={activeMeters} />
      )}
    </Box>
  );
}
