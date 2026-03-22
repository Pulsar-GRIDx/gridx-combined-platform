import { useState, useEffect, useMemo } from "react";
import { useParams, Link as RouterLink } from "react-router-dom";
import {
  Box,
  Typography,
  Chip,
  Button,
  Tabs,
  Tab,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  useTheme,
  CircularProgress,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Alert,
  Snackbar,
  TablePagination,
  ToggleButton,
  ToggleButtonGroup,
  LinearProgress,
  Card,
  CardContent,
  Tooltip,
  Divider,
  Grid,
} from "@mui/material";
import {
  BoltOutlined,
  ElectricalServicesOutlined,
  PowerOutlined,
  GraphicEqOutlined,
  SpeedOutlined,
  ThermostatOutlined,
  SignalCellularAltOutlined,
  SimCardOutlined,
  AccountBalanceWalletOutlined,
  ConfirmationNumberOutlined,
  ShoppingCartOutlined,
  HistoryOutlined,
  TuneOutlined,
  BarChartOutlined,
  PowerSettingsNewOutlined,
  ContentCopyOutlined,
  SendOutlined,
  RestartAltOutlined,
  LockResetOutlined,
  WaterDropOutlined,
  ArrowBackOutlined,
  CheckCircleOutlined,
  CancelOutlined,
  AssignmentOutlined,
  HomeOutlined,
  MapOutlined as MapOutlinedIcon,
  FavoriteBorderOutlined,
  SwapVertOutlined,
  ToggleOn,
  ToggleOff,
  HotTub,
  BluetoothDisabled,
  PersonRemoveOutlined,
} from "@mui/icons-material";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { GoogleMap, useJsApiLoader, Marker } from "@react-google-maps/api";
import Header from "../components/Header";
import DataBadge from "../components/DataBadge";
import { tokens } from "../theme";
import { useAuth } from "../context/AuthContext";
import { meterAPI, loadControlAPI, commissionReportAPI, homeClassificationAPI, meterHealthAPI, relayEventsAPI, energyAPI, meterConfigAPI } from "../services/api";
import {
  meters as mockMeters,
  transactions,
  tariffGroups,
  tariffConfig,
  customers,
} from "../services/mockData";

/* ---- helpers ---- */
const fmt = (n) => Number(n).toLocaleString();
const fmtCurrency = (n) =>
  `N$ ${Number(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function formatDateTime(isoStr) {
  if (!isoStr) return "---";
  const d = new Date(isoStr);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function signalLabel(dbm) {
  if (dbm >= -50) return { label: "Excellent", color: "#4cceac" };
  if (dbm >= -70) return { label: "Good", color: "#00b4d8" };
  if (dbm >= -85) return { label: "Fair", color: "#f2b705" };
  return { label: "Weak", color: "#db4f4a" };
}

function generateHourlyData() {
  const base = [
    0.3, 0.2, 0.15, 0.12, 0.1, 0.15, 0.4, 0.8, 1.2, 1.5, 1.8, 2.0, 2.2,
    2.1, 1.9, 1.7, 1.5, 1.8, 2.5, 3.0, 2.8, 2.2, 1.5, 0.8,
  ];
  return base.map((v, i) => ({
    hour: `${String(i).padStart(2, "0")}:00`,
    kWh: +(v + Math.random() * 0.5).toFixed(2),
  }));
}

/* ---- small components ---- */
function InfoRow({ label, value, color, mono }) {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        py: 0.6,
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <Typography
        variant="body2"
        sx={{ color: "rgba(255,255,255,0.5)", fontSize: "0.8rem" }}
      >
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          color: color || "#fff",
          fontWeight: 600,
          fontSize: "0.8rem",
          ...(mono ? { fontFamily: "monospace" } : {}),
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

/* ---- Progress Circle component ---- */
function ProgressCircle({ units, colors, size = 250 }) {
  const numUnits = parseFloat(units) || 0;
  const angle = Math.min(numUnits * 0.072, 360);
  const progressColor =
    numUnits < 200
      ? "#db4f4a"
      : numUnits < 1500
      ? "#f2b705"
      : colors.greenAccent[500];

  return (
    <Box
      sx={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: "50%",
        background: `conic-gradient(${progressColor} ${angle}deg, rgba(255,255,255,0.08) ${angle}deg 360deg)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        mx: "auto",
      }}
    >
      <Box
        sx={{
          width: size - 30,
          height: size - 30,
          borderRadius: "50%",
          backgroundColor: colors.primary[400],
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Typography
          variant="caption"
          sx={{ color: "rgba(255,255,255,0.5)", fontSize: "0.7rem", mb: 0.5 }}
        >
          Meter Units
        </Typography>
        <Typography
          variant="h3"
          sx={{ color: progressColor, fontWeight: 700, fontFamily: "monospace" }}
        >
          {numUnits.toFixed(1)}
        </Typography>
        <Typography
          variant="caption"
          sx={{ color: "rgba(255,255,255,0.4)", fontSize: "0.75rem" }}
        >
          kWh
        </Typography>
      </Box>
    </Box>
  );
}

/* ---- Metric Box (small stat below circle) ---- */
function MetricBox({ label, value, unit, color }) {
  return (
    <Box sx={{ textAlign: "center", minWidth: 80 }}>
      <Typography
        variant="h5"
        sx={{ color: color || "#fff", fontWeight: 700, fontFamily: "monospace" }}
      >
        {value}
      </Typography>
      <Typography
        variant="caption"
        sx={{ color: "rgba(255,255,255,0.4)", fontSize: "0.68rem" }}
      >
        {unit}
      </Typography>
      <Typography
        variant="caption"
        sx={{
          display: "block",
          color: "rgba(255,255,255,0.5)",
          fontSize: "0.65rem",
          mt: 0.2,
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}

/* ---- Load Control reasons ---- */
const LOAD_REASONS = [
  "Irregular performance",
  "System update",
  "Test",
  "Others",
];

/* ================================================================ */
/* MeterProfile Page                                                */
/* ================================================================ */
export default function MeterProfile() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const { drn } = useParams();
  const { user } = useAuth();
  const [tab, setTab] = useState(0);
  const [vendAmount, setVendAmount] = useState("");
  const [generatedToken, setGeneratedToken] = useState("");

  /* ---------- Google Maps loader (must match libraries used in Map.jsx) ---------- */
  const { isLoaded: mapsLoaded } = useJsApiLoader({
    googleMapsApiKey: "AIzaSyCdPt-Y9HoyNJF5I-sbyuS4n6U1KhKaIzk",
    libraries: ["drawing"],
  });

  /* ---------- API data state ---------- */
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [powerData, setPowerData] = useState(null);
  const [energyData, setEnergyData] = useState(null);
  const [loadControlData, setLoadControlData] = useState(null);
  const [cellNetwork, setCellNetwork] = useState(null);
  const [mainsControl, setMainsControl] = useState(null);
  const [heaterControl, setHeaterControl] = useState(null);
  const [mainsState, setMainsState] = useState(null);
  const [heaterState, setHeaterState] = useState(null);
  const [dailyPower, setDailyPower] = useState([]);
  const [meterLocation, setMeterLocation] = useState(null);
  const [commissionReports, setCommissionReports] = useState([]);
  const [homeClassifications, setHomeClassifications] = useState([]);

  /* ---------- Health & Relay Events state ---------- */
  const [healthData, setHealthData] = useState(null);
  const [healthHistory, setHealthHistory] = useState([]);
  const [healthLoading, setHealthLoading] = useState(false);
  const [relayEvents, setRelayEvents] = useState([]);
  const [relayTotal, setRelayTotal] = useState(0);
  const [relaySummary, setRelaySummary] = useState(null);
  const [relayLoading, setRelayLoading] = useState(false);
  const [relayPage, setRelayPage] = useState(0);
  const [relayRowsPerPage, setRelayRowsPerPage] = useState(25);
  const [relayFilter, setRelayFilter] = useState("");
  const [relayTypeFilter, setRelayTypeFilter] = useState("");

  /* ---------- Load Control UI state ---------- */
  const [mainsReason, setMainsReason] = useState("Irregular performance");
  const [heaterReason, setHeaterReason] = useState("Irregular performance");
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    type: "",
    action: "",
  });
  const [commandLoading, setCommandLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "success",
  });

  /* ---------- Fetch all data on mount ---------- */
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const results = await Promise.allSettled([
        meterAPI.getProfileByDRN(drn),
        meterAPI.getPower(drn),
        meterAPI.getEnergy(drn),
        meterAPI.getLoadControl(drn),
        meterAPI.getCellNetwork(drn),
        loadControlAPI.getMainsControl(drn),
        loadControlAPI.getHeaterControl(drn),
        loadControlAPI.getMainsState(drn),
        loadControlAPI.getHeaterState(drn),
        meterAPI.getDailyPower(drn),
        commissionReportAPI.getByDRN(drn),
        homeClassificationAPI.getByDRN(drn),
        meterAPI.getLocation(drn),
      ]);

      if (results[0].status === "fulfilled") setProfile(results[0].value);
      if (results[1].status === "fulfilled") setPowerData(results[1].value);
      if (results[2].status === "fulfilled") setEnergyData(results[2].value);
      if (results[3].status === "fulfilled")
        setLoadControlData(results[3].value);
      if (results[4].status === "fulfilled") setCellNetwork(results[4].value);
      if (results[5].status === "fulfilled") setMainsControl(results[5].value);
      if (results[6].status === "fulfilled")
        setHeaterControl(results[6].value);
      if (results[7].status === "fulfilled") setMainsState(results[7].value);
      if (results[8].status === "fulfilled") setHeaterState(results[8].value);
      if (results[9].status === "fulfilled" && Array.isArray(results[9].value))
        setDailyPower(results[9].value);
      if (results[10].status === "fulfilled" && Array.isArray(results[10].value))
        setCommissionReports(results[10].value);
      if (results[11].status === "fulfilled" && Array.isArray(results[11].value))
        setHomeClassifications(results[11].value);
      if (results[12].status === "fulfilled") setMeterLocation(results[12].value);

      setLoading(false);
    };
    fetchData();
  }, [drn]);

  /* ---------- Fetch health data when Health tab is selected ---------- */
  useEffect(() => {
    if (tab !== 9) return;
    const fetchHealth = async () => {
      setHealthLoading(true);
      try {
        const [latest, history] = await Promise.allSettled([
          meterHealthAPI.getLatest(drn),
          meterHealthAPI.getHistory(drn, 72),
        ]);
        if (latest.status === "fulfilled") setHealthData(latest.value?.data || latest.value);
        if (history.status === "fulfilled") setHealthHistory(history.value?.data || []);
      } catch (e) { /* ignore */ }
      setHealthLoading(false);
    };
    fetchHealth();
  }, [drn, tab]);

  /* ---------- Fetch relay events when Relay tab is selected ---------- */
  useEffect(() => {
    if (tab !== 10) return;
    const fetchRelays = async () => {
      setRelayLoading(true);
      try {
        const [eventsRes, summaryRes] = await Promise.allSettled([
          relayEventsAPI.getEvents(drn, { limit: relayRowsPerPage, offset: relayPage * relayRowsPerPage, relay: relayFilter, type: relayTypeFilter }),
          relayEventsAPI.getSummary(drn, 168),
        ]);
        if (eventsRes.status === "fulfilled") {
          setRelayEvents(eventsRes.value?.data || []);
          setRelayTotal(eventsRes.value?.pagination?.total || 0);
        }
        if (summaryRes.status === "fulfilled") setRelaySummary(summaryRes.value?.data || null);
      } catch (e) { /* ignore */ }
      setRelayLoading(false);
    };
    fetchRelays();
  }, [drn, tab, relayPage, relayRowsPerPage, relayFilter, relayTypeFilter]);

  /* ---------- Fetch hourly energy data when Energy Charts tab is selected ---------- */
  useEffect(() => {
    if (tab !== 5) return;
    const fetchHourly = async () => {
      try {
        const res = await energyAPI.getHourlyByDrn(drn);
        if (res?.data && Array.isArray(res.data)) {
          setHourlyData(res.data);
        } else {
          // Fallback: generate placeholder with zeros
          setHourlyData(Array.from({ length: 24 }, (_, i) => ({
            hour: `${String(i).padStart(2, "0")}:00`,
            kWh: 0,
          })));
        }
      } catch (e) {
        console.warn("Failed to fetch hourly data:", e);
        setHourlyData(Array.from({ length: 24 }, (_, i) => ({
          hour: `${String(i).padStart(2, "0")}:00`,
          kWh: 0,
        })));
      }
    };
    fetchHourly();
  }, [drn, tab]);

  /* ---------- fallback mock meter ---------- */
  const mockMeter = mockMeters.find((m) => m.drn === drn);

  /* ---------- Derived values from API or mock ---------- */
  const meterName = profile
    ? `${profile.Name || ""} ${profile.Surname || ""}`.trim()
    : mockMeter?.customerName || drn;
  const meterArea = profile?.City || mockMeter?.area || "-";
  const meterSuburb = profile?.Region || mockMeter?.suburb || "-";
  const meterNo = profile?.DRN || drn;
  const transformer = profile?.TransformerDRN || mockMeter?.transformer || "-";
  const simNumber = profile?.SIMNumber || mockMeter?.network?.simPhone || "-";
  const tariffType = profile?.tariff_type || "Prepaid";

  // Power
  const voltage = powerData?.voltage ?? mockMeter?.power?.voltage ?? 0;
  const current = powerData?.current ?? mockMeter?.power?.current ?? 0;
  const activePower =
    powerData?.active_power ?? mockMeter?.power?.activePower ?? 0;
  const reactivePower =
    powerData?.reactive_power ?? mockMeter?.power?.reactivePower ?? 0;
  const apparentPower =
    powerData?.apparent_power ?? mockMeter?.power?.apparentPower ?? 0;
  const frequency = powerData?.frequency ?? mockMeter?.power?.frequency ?? 0;
  const powerFactor =
    powerData?.power_factor ?? mockMeter?.power?.powerFactor ?? 0;
  const temperature =
    powerData?.temperature ?? mockMeter?.power?.temperature ?? 0;

  // Energy
  const activeEnergy =
    energyData?.active_energy ?? mockMeter?.energy?.activeEnergy ?? 0;
  const reactiveEnergy =
    energyData?.reactive_energy ?? mockMeter?.energy?.reactiveEnergy ?? 0;
  const units = energyData?.units ?? mockMeter?.energy?.units ?? 0;
  const tamperState =
    energyData?.tamper_state ?? mockMeter?.energy?.tamperState ?? "Normal";
  const lastUpdate =
    energyData?.date_time || powerData?.date_time || mockMeter?.lastUpdate;

  // Load control
  const lcMainsState =
    loadControlData?.mains_state ??
    (mockMeter?.loadControl?.mainsState === "ON" ? "1" : "0");
  const lcGeyserState =
    loadControlData?.geyser_state ??
    (mockMeter?.loadControl?.geyserState === "ON" ? "1" : "0");

  // Cell network
  const signalStrength =
    cellNetwork?.signal_strength ?? mockMeter?.network?.signalStrength ?? -70;
  const serviceProvider =
    cellNetwork?.service_provider ??
    mockMeter?.network?.serviceProvider ??
    "-";
  const simPhone =
    cellNetwork?.sim_phone_number ?? mockMeter?.network?.simPhone ?? "-";
  const imei = cellNetwork?.IMEU ?? mockMeter?.network?.imei ?? "-";

  // Status
  const status = lcMainsState === "1" ? "Online" : "Offline";
  const statusChipColor =
    status === "Online" ? colors.greenAccent[500] : colors.grey[400];

  /* ---------- related mock data ---------- */
  const customer = customers.find(
    (c) => c.meterNo === (mockMeter?.meterNo || drn)
  );
  const meterTxns = transactions
    .filter((t) => t.meterNo === (mockMeter?.meterNo || drn))
    .sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));
  const tariff = tariffGroups.find(
    (t) => t.name === (mockMeter?.billing?.tariffGroup || "Residential")
  );
  const [hourlyData, setHourlyData] = useState([]);

  /* ---------- Daily power: this week vs last week ---------- */
  const weeklyPowerChart = useMemo(() => {
    if (!dailyPower || dailyPower.length === 0) return [];
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayOfWeek = today.getDay();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - dayOfWeek);
    const lastWeekStart = new Date(weekStart);
    lastWeekStart.setDate(weekStart.getDate() - 7);

    // Parse API dates: "2026-03-01T22:00:00.000Z" → local date string "2026-03-02"
    const parsed = dailyPower.map((d) => {
      const dt = new Date(d.day);
      // Add a few hours to compensate for timezone offset from MySQL DATE
      dt.setHours(dt.getHours() + 12);
      const localDate = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      return { ...d, localDate };
    });

    const result = dayNames.map((name, i) => {
      const thisWeekDate = new Date(weekStart);
      thisWeekDate.setDate(weekStart.getDate() + i);
      const lastWeekDate = new Date(lastWeekStart);
      lastWeekDate.setDate(lastWeekStart.getDate() + i);

      const fmtDate = (dt) =>
        `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;

      const tw = parsed.find((d) => d.localDate === fmtDate(thisWeekDate));
      const lw = parsed.find((d) => d.localDate === fmtDate(lastWeekDate));

      return {
        day: name,
        thisWeek: tw ? parseFloat(tw.avg_power) : 0,
        lastWeek: lw ? parseFloat(lw.avg_power) : 0,
      };
    });
    return result;
  }, [dailyPower]);

  /* ---------- Load Control handlers ---------- */
  const handleLoadControlClick = (type, action) => {
    setConfirmDialog({
      open: true,
      type,
      action,
    });
  };

  const handleConfirmLoadControl = async () => {
    const { type, action } = confirmDialog;
    const isStateControl = type === "mains_state" || type === "heater_state";
    const state = isStateControl ? (action === "on" ? 1 : 0) : (action === "enable" ? 1 : 0);
    const baseType = type.replace("_state", "");
    const reason = baseType === "mains" ? mainsReason : heaterReason;
    const userName = user?.Name || user?.name || "Admin";

    setCommandLoading(true);
    setConfirmDialog({ open: false, type: "", action: "" });

    try {
      if (isStateControl) {
        if (baseType === "mains") {
          await loadControlAPI.setMainsState(drn, state, userName, reason);
        } else {
          await loadControlAPI.setHeaterState(drn, state, userName, reason);
        }
      } else {
        if (type === "mains") {
          await loadControlAPI.setMains(drn, state, userName, reason);
        } else {
          await loadControlAPI.setHeater(drn, state, userName, reason);
        }
      }
      const labelType = baseType === "mains" ? "Mains" : "Heater";
      const labelAction = isStateControl
        ? (action === "on" ? "Turn ON" : "Turn OFF")
        : (action === "enable" ? "Enable" : "Disable");
      setSnackbar({
        open: true,
        message: `${labelType} ${labelAction} command sent successfully`,
        severity: "success",
      });

      // Refresh control data
      try {
        if (type === "mains") {
          const mc = await loadControlAPI.getMainsControl(drn);
          setMainsControl(mc);
        } else {
          const hc = await loadControlAPI.getHeaterControl(drn);
          setHeaterControl(hc);
        }
      } catch (e) {
        /* ignore refresh error */
      }
    } catch (err) {
      setSnackbar({
        open: true,
        message: `Failed: ${err.message}`,
        severity: "error",
      });
    } finally {
      setCommandLoading(false);
    }
  };

  /* ---------- config action handler ---------- */
  const handleConfigAction = async (actionType) => {
    setCommandLoading(true);
    try {
      if (actionType === "reset_ble") {
        await meterConfigAPI.resetBLE(drn);
        setSnackbar({ open: true, message: "Reset BLE PIN command sent successfully", severity: "success" });
      } else if (actionType === "clear_auth") {
        await meterConfigAPI.resetAuthNumbers(drn);
        setSnackbar({ open: true, message: "Clear Authorized Numbers command sent successfully", severity: "success" });
      } else if (actionType === "restart_meter") {
        await meterConfigAPI.resetMeter(drn);
        setSnackbar({ open: true, message: "Restart Meter command sent successfully", severity: "success" });
      }
    } catch (err) {
      setSnackbar({ open: true, message: `Failed: ${err.message}`, severity: "error" });
    } finally {
      setCommandLoading(false);
    }
  };

  /* ---------- vend helpers ---------- */
  const handleVend = () => {
    const amt = parseFloat(vendAmount);
    if (!amt || amt < 5) return;
    const kWh = (amt / 1.68).toFixed(2);
    const token = Array.from({ length: 20 }, () =>
      Math.floor(Math.random() * 10)
    ).join("");
    setGeneratedToken(
      `Token: ${token} | Amount: ${fmtCurrency(amt)} | kWh: ${kWh}`
    );
  };

  const presets = [50, 100, 200, 500, 1000, 2000];

  /* ---------- loading state ---------- */
  if (loading) {
    return (
      <Box
        m="20px"
        display="flex"
        justifyContent="center"
        alignItems="center"
        height="60vh"
      >
        <CircularProgress sx={{ color: colors.greenAccent[500] }} />
      </Box>
    );
  }

  /* ---------- not found ---------- */
  if (!profile && !mockMeter) {
    return (
      <Box m="20px">
        <Header title="METER NOT FOUND" subtitle={`DRN: ${drn}`} />
        <Typography color={colors.grey[100]}>
          No meter found with that DRN.
        </Typography>
        <Button
          component={RouterLink}
          to="/meters"
          startIcon={<ArrowBackOutlined />}
          sx={{ mt: 2, color: colors.greenAccent[500] }}
        >
          Back to Meters
        </Button>
      </Box>
    );
  }

  return (
    <Box m="20px">
      {/* ---- Back link ---- */}
      <Button
        component={RouterLink}
        to="/meters"
        startIcon={<ArrowBackOutlined />}
        sx={{
          mb: 1,
          color: colors.greenAccent[500],
          textTransform: "none",
          fontSize: "0.82rem",
        }}
      >
        Back to Meters
      </Button>

      {/* ---- Header bar ---- */}
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        flexWrap="wrap"
        gap={2}
        mb={2}
      >
        <Box>
          <Typography
            variant="h3"
            color={colors.grey[100]}
            fontWeight="bold"
            fontFamily="monospace"
          >
            {meterNo}
          </Typography>
          <Typography variant="h5" color={colors.greenAccent[500]}>
            {meterName} &mdash; {meterArea}, {meterSuburb}
          </Typography>
        </Box>
        <Chip
          label={status}
          sx={{
            bgcolor:
              status === "Online"
                ? "rgba(76,206,172,0.15)"
                : "rgba(108,117,125,0.2)",
            color: statusChipColor,
            fontWeight: 700,
            fontSize: "0.85rem",
            height: 32,
          }}
        />
      </Box>

      {/* ---- Tabs ---- */}
      {(() => {
        const isDark = theme.palette.mode === "dark";
        const tabItems = [
          { icon: <SpeedOutlined sx={{ fontSize: 18 }} />, label: "Overview", accent: "#4cceac" },
          { icon: <ShoppingCartOutlined sx={{ fontSize: 18 }} />, label: "Vend Token", accent: "#f2b705" },
          { icon: <PowerSettingsNewOutlined sx={{ fontSize: 18 }} />, label: "Load Control", accent: "#e2726e" },
          { icon: <AccountBalanceWalletOutlined sx={{ fontSize: 18 }} />, label: "Billing & Tariff", accent: "#6870fa" },
          { icon: <TuneOutlined sx={{ fontSize: 18 }} />, label: "Configuration", accent: "#868dfb" },
          { icon: <BarChartOutlined sx={{ fontSize: 18 }} />, label: "Energy Charts", accent: "#00bcd4" },
          { icon: <HistoryOutlined sx={{ fontSize: 18 }} />, label: "History", accent: "#a3a3a3" },
          { icon: <AssignmentOutlined sx={{ fontSize: 18 }} />, label: "Commission Report", accent: "#ff9800" },
          { icon: <HomeOutlined sx={{ fontSize: 18 }} />, label: "Home Classification", accent: "#9c27b0" },
          { icon: <FavoriteBorderOutlined sx={{ fontSize: 18 }} />, label: "Meter Health", accent: "#e91e63" },
          { icon: <SwapVertOutlined sx={{ fontSize: 18 }} />, label: "Relay Events", accent: "#00897b" },
        ];
        return (
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              mb: 3,
              bgcolor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)",
              borderRadius: "14px",
              p: "6px",
              minHeight: "auto",
              "& .MuiTabs-indicator": { display: "none" },
              "& .MuiTabs-flexContainer": { gap: "6px" },
              "& .MuiTab-root": {
                minHeight: "40px",
                px: "16px",
                py: "8px",
                borderRadius: "10px",
                textTransform: "none",
                fontWeight: 600,
                fontSize: "0.82rem",
                color: isDark ? colors.grey[400] : colors.grey[300],
                transition: "all 0.2s ease",
                "&:hover": {
                  bgcolor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
                  color: isDark ? colors.grey[200] : colors.grey[100],
                },
              },
            }}
          >
            {tabItems.map((t, i) => (
              <Tab
                key={i}
                icon={t.icon}
                iconPosition="start"
                label={t.label}
                sx={{
                  ...(tab === i && {
                    bgcolor: `${t.accent}20`,
                    color: `${t.accent} !important`,
                    border: `1.5px solid ${t.accent}40`,
                    boxShadow: `0 0 12px ${t.accent}15`,
                    "& .MuiSvgIcon-root": { color: t.accent },
                  }),
                }}
              />
            ))}
          </Tabs>
        );
      })()}

      {/* ================================================================ */}
      {/* TAB 0: Overview                                                  */}
      {/* ================================================================ */}
      {tab === 0 && (
        <Box>
          <Box display="flex" justifyContent="flex-end" mb={0.5}>
            <DataBadge live />
          </Box>
          {/* ---- Progress Circle + Satellite Map side by side ---- */}
          <Box display="flex" gap="5px" mb="5px" sx={{ flexDirection: { xs: "column", md: "row" } }}>
            {/* Left: Mains/Heater icons + Progress Circle + Metrics */}
            <Box
              sx={{
                backgroundColor: colors.primary[400],
                borderRadius: "4px",
                p: 3,
                flex: 1,
              }}
            >
              {/* Mains/Heater ON/OFF indicators */}
              <Box
                display="flex"
                justifyContent="center"
                gap={4}
                mb={2}
              >
                <Box display="flex" alignItems="center" gap={0.8}>
                  <BoltOutlined
                    sx={{
                      color:
                        lcMainsState === "1"
                          ? colors.greenAccent[500]
                          : "#db4f4a",
                      fontSize: 22,
                    }}
                  />
                  <Typography
                    variant="body2"
                    sx={{
                      color:
                        lcMainsState === "1"
                          ? colors.greenAccent[500]
                          : "#db4f4a",
                      fontWeight: 600,
                      fontSize: "0.8rem",
                    }}
                  >
                    Mains {lcMainsState === "1" ? "ON" : "OFF"}
                  </Typography>
                </Box>
                <Box display="flex" alignItems="center" gap={0.8}>
                  <WaterDropOutlined
                    sx={{
                      color:
                        lcGeyserState === "1"
                          ? colors.greenAccent[500]
                          : "#db4f4a",
                      fontSize: 22,
                    }}
                  />
                  <Typography
                    variant="body2"
                    sx={{
                      color:
                        lcGeyserState === "1"
                          ? colors.greenAccent[500]
                          : "#db4f4a",
                      fontWeight: 600,
                      fontSize: "0.8rem",
                    }}
                  >
                    Heater {lcGeyserState === "1" ? "ON" : "OFF"}
                  </Typography>
                </Box>
              </Box>

              {/* Progress Circle */}
              <ProgressCircle units={units} colors={colors} size={250} />

              {/* 5 metrics below circle */}
              <Box
                display="flex"
                justifyContent="center"
                gap={3}
                mt={3}
                flexWrap="wrap"
              >
                <MetricBox
                  label="Power"
                  value={parseFloat(activePower).toFixed(1)}
                  unit="W"
                  color={colors.greenAccent[500]}
                />
                <MetricBox
                  label="Voltage"
                  value={parseFloat(voltage).toFixed(1)}
                  unit="V"
                  color="#f2b705"
                />
                <MetricBox
                  label="Current"
                  value={parseFloat(current).toFixed(2)}
                  unit="A"
                  color="#00b4d8"
                />
                <MetricBox
                  label="Frequency"
                  value={parseFloat(frequency).toFixed(2)}
                  unit="Hz"
                  color="#6870fa"
                />
                <MetricBox
                  label="Signal"
                  value={parseFloat(signalStrength).toFixed(0)}
                  unit="dBm"
                  color={signalLabel(signalStrength).color}
                />
              </Box>
            </Box>

            {/* Right: Google Maps Satellite View */}
            <Box
              sx={{
                backgroundColor: colors.primary[400],
                borderRadius: "4px",
                flex: 1,
                overflow: "hidden",
                position: "relative",
                minHeight: { xs: "300px", md: "auto" },
              }}
            >
              {meterLocation && meterLocation.Lat && meterLocation.Longitude && mapsLoaded ? (
                <>
                  <Box
                    sx={{
                      position: "absolute",
                      top: 12,
                      left: 12,
                      zIndex: 2,
                      bgcolor: "rgba(20,27,45,0.85)",
                      backdropFilter: "blur(6px)",
                      borderRadius: "8px",
                      px: 1.5,
                      py: 0.8,
                    }}
                  >
                    <Typography sx={{ fontSize: "0.7rem", color: colors.greenAccent[500], fontWeight: 700 }}>
                      METER LOCATION
                    </Typography>
                    <Typography sx={{ fontSize: "0.65rem", color: colors.grey[400] }}>
                      {meterLocation.LocationName || `${parseFloat(meterLocation.Lat).toFixed(5)}, ${parseFloat(meterLocation.Longitude).toFixed(5)}`}
                    </Typography>
                  </Box>
                  <GoogleMap
                    mapContainerStyle={{ width: "100%", height: "100%", minHeight: "300px" }}
                    center={{
                      lat: parseFloat(meterLocation.Lat),
                      lng: parseFloat(meterLocation.Longitude),
                    }}
                    zoom={19}
                    mapTypeId="satellite"
                    options={{
                      disableDefaultUI: true,
                      zoomControl: true,
                      mapTypeControl: false,
                      streetViewControl: false,
                      fullscreenControl: true,
                    }}
                  >
                    <Marker
                      position={{
                        lat: parseFloat(meterLocation.Lat),
                        lng: parseFloat(meterLocation.Longitude),
                      }}
                      title={meterLocation.LocationName || drn}
                    />
                  </GoogleMap>
                </>
              ) : (
                <Box
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  height="100%"
                  minHeight="300px"
                  flexDirection="column"
                  gap={1}
                >
                  <MapOutlinedIcon sx={{ fontSize: 48, color: colors.grey[600] }} />
                  <Typography color={colors.grey[500]} fontSize="0.85rem">
                    Location data not available
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>

          {/* ---- Existing cards grid ---- */}
          <Box
            display="grid"
            gridTemplateColumns="repeat(12, 1fr)"
            gridAutoRows="140px"
            gap="5px"
          >
            {/* ---- Power Measurements Card ---- */}
            <Box
              gridColumn="span 6"
              gridRow="span 2"
              backgroundColor={colors.primary[400]}
              p="15px"
              borderRadius="4px"
              overflow="auto"
            >
              <Typography
                variant="h6"
                color={colors.grey[100]}
                fontWeight="bold"
                mb={1}
              >
                Power Measurements
              </Typography>
              <InfoRow
                label="Voltage"
                value={`${parseFloat(voltage).toFixed(1)} V`}
                color="#f2b705"
              />
              <InfoRow
                label="Current"
                value={`${parseFloat(current).toFixed(2)} A`}
                color="#00b4d8"
              />
              <InfoRow
                label="Active Power"
                value={`${parseFloat(activePower).toFixed(2)} kW`}
                color={colors.greenAccent[500]}
              />
              <InfoRow
                label="Reactive Power"
                value={`${parseFloat(reactivePower).toFixed(2)} kVAR`}
              />
              <InfoRow
                label="Apparent Power"
                value={`${parseFloat(apparentPower).toFixed(2)} kVA`}
              />
              <InfoRow
                label="Frequency"
                value={`${parseFloat(frequency).toFixed(2)} Hz`}
                color="#6870fa"
              />
              <InfoRow
                label="Power Factor"
                value={parseFloat(powerFactor).toFixed(3)}
                color={colors.greenAccent[500]}
              />
              <InfoRow
                label="Temperature"
                value={`${parseFloat(temperature).toFixed(1)}\u00B0C`}
                color="#db4f4a"
              />
            </Box>

            {/* ---- Energy Readings Card ---- */}
            <Box
              gridColumn="span 6"
              gridRow="span 2"
              backgroundColor={colors.primary[400]}
              p="15px"
              borderRadius="4px"
              overflow="auto"
            >
              <Typography
                variant="h6"
                color={colors.grey[100]}
                fontWeight="bold"
                mb={1}
              >
                Energy Readings
              </Typography>
              <InfoRow
                label="Active Energy"
                value={`${fmt(activeEnergy)} kWh`}
                color={colors.greenAccent[500]}
              />
              <InfoRow
                label="Reactive Energy"
                value={`${fmt(reactiveEnergy)} kVARh`}
              />
              <InfoRow label="Units" value={units} />
              <InfoRow
                label="Tamper State"
                value={
                  tamperState === "0" || tamperState === "Normal"
                    ? "Normal"
                    : "Tampered"
                }
                color={
                  tamperState === "0" || tamperState === "Normal"
                    ? colors.greenAccent[500]
                    : "#db4f4a"
                }
              />
              <Box mt={2}>
                <Typography
                  variant="body2"
                  color="rgba(255,255,255,0.4)"
                  fontSize="0.72rem"
                >
                  Last Update
                </Typography>
                <Typography
                  variant="body2"
                  color={colors.grey[100]}
                  fontWeight={600}
                >
                  {formatDateTime(lastUpdate)}
                </Typography>
              </Box>
            </Box>

            {/* ---- Network Card ---- */}
            <Box
              gridColumn="span 6"
              gridRow="span 2"
              backgroundColor={colors.primary[400]}
              p="15px"
              borderRadius="4px"
              overflow="auto"
            >
              <Typography
                variant="h6"
                color={colors.grey[100]}
                fontWeight="bold"
                mb={1}
              >
                Network
              </Typography>
              {(() => {
                const sig = signalLabel(signalStrength);
                return (
                  <InfoRow
                    label="Signal Strength"
                    value={`${signalStrength} dBm (${sig.label})`}
                    color={sig.color}
                  />
                );
              })()}
              <InfoRow label="Service Provider" value={serviceProvider} />
              <InfoRow label="SIM Phone" value={simPhone} mono />
              <InfoRow label="IMEI" value={imei} mono />
            </Box>

            {/* ---- Quick Stats Card ---- */}
            <Box
              gridColumn="span 6"
              gridRow="span 2"
              backgroundColor={colors.primary[400]}
              p="15px"
              borderRadius="4px"
              overflow="auto"
            >
              <Typography
                variant="h6"
                color={colors.grey[100]}
                fontWeight="bold"
                mb={1}
              >
                Quick Stats
              </Typography>
              <InfoRow
                label="Tariff Type"
                value={tariffType}
                color={colors.greenAccent[500]}
              />
              <InfoRow
                label="Units Remaining"
                value={`${parseFloat(units).toFixed(1)} kWh`}
                color="#00b4d8"
              />
              <InfoRow label="Transformer" value={transformer} mono />
              <InfoRow label="SIM Number" value={simNumber} mono />
              <InfoRow label="Street" value={profile?.StreetName || "-"} />
              <InfoRow label="DRN" value={drn} mono />
            </Box>
          </Box>
        </Box>
      )}

      {/* ================================================================ */}
      {/* TAB 1: Vend Token                                                */}
      {/* ================================================================ */}
      {tab === 1 && (
        <Box>
        <Box display="flex" justifyContent="flex-end" mb={0.5}>
          <DataBadge />
        </Box>
        <Box
          display="grid"
          gridTemplateColumns="repeat(12, 1fr)"
          gridAutoRows="140px"
          gap="5px"
        >
          {/* ---- Customer Info ---- */}
          <Box
            gridColumn="span 5"
            gridRow="span 3"
            backgroundColor={colors.primary[400]}
            p="20px"
            borderRadius="4px"
            overflow="auto"
          >
            <Typography
              variant="h6"
              color={colors.grey[100]}
              fontWeight="bold"
              mb={2}
            >
              Customer Information
            </Typography>
            <InfoRow label="Customer" value={meterName} />
            <InfoRow label="Meter No" value={meterNo} mono />
            <InfoRow
              label="Account"
              value={mockMeter?.accountNo || drn}
              mono
            />
            <InfoRow label="Area" value={`${meterArea}, ${meterSuburb}`} />
            <InfoRow label="Tariff" value={tariffType} />
            <InfoRow
              label="Current Balance"
              value={`${parseFloat(units).toFixed(1)} kWh`}
              color="#00b4d8"
            />
          </Box>

          {/* ---- Vending Form ---- */}
          <Box
            gridColumn="span 7"
            gridRow="span 3"
            backgroundColor={colors.primary[400]}
            p="20px"
            borderRadius="4px"
            overflow="auto"
          >
            <Typography
              variant="h6"
              color={colors.grey[100]}
              fontWeight="bold"
              mb={2}
            >
              Vend Electricity Token
            </Typography>

            {/* Amount presets */}
            <Box display="flex" gap={1} flexWrap="wrap" mb={2}>
              {presets.map((p) => (
                <Button
                  key={p}
                  variant={
                    vendAmount === String(p) ? "contained" : "outlined"
                  }
                  size="small"
                  onClick={() => setVendAmount(String(p))}
                  sx={{
                    fontSize: "0.78rem",
                    textTransform: "none",
                    color:
                      vendAmount === String(p)
                        ? "#fff"
                        : colors.greenAccent[500],
                    borderColor: colors.greenAccent[500],
                    backgroundColor:
                      vendAmount === String(p)
                        ? colors.greenAccent[700]
                        : "transparent",
                  }}
                >
                  N$ {p}
                </Button>
              ))}
            </Box>

            <TextField
              size="small"
              label="Amount (N$)"
              type="number"
              value={vendAmount}
              onChange={(e) => setVendAmount(e.target.value)}
              sx={{ mb: 2, width: "200px" }}
              inputProps={{ min: 5 }}
            />

            {vendAmount && parseFloat(vendAmount) >= 5 && (
              <Box mb={2}>
                <Typography
                  variant="body2"
                  color={colors.grey[100]}
                  fontWeight={600}
                  mb={1}
                >
                  Breakdown
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableBody>
                      {(() => {
                        const amt = parseFloat(vendAmount);
                        const vat = amt * (tariffConfig.vatRate / 100);
                        const fixed = tariffConfig.fixedCharge;
                        const rel = tariffConfig.relLevy;
                        const arrearsDeduct =
                          customer && customer.arrears > 0
                            ? Math.min(
                                customer.arrears,
                                amt *
                                  (tariffConfig.arrearsPercentage / 100)
                              )
                            : 0;
                        const net = amt - vat - fixed - rel - arrearsDeduct;
                        const kWh = tariff?.blocks?.[0]
                          ? (net / tariff.blocks[0].rate).toFixed(2)
                          : (net / 1.68).toFixed(2);
                        const rows = [
                          {
                            label: "Purchase Amount",
                            value: fmtCurrency(amt),
                          },
                          {
                            label: `VAT (${tariffConfig.vatRate}%)`,
                            value: `- ${fmtCurrency(vat)}`,
                          },
                          {
                            label: "Fixed Charge",
                            value: `- ${fmtCurrency(fixed)}`,
                          },
                          {
                            label: "REL Levy",
                            value: `- ${fmtCurrency(rel)}`,
                          },
                        ];
                        if (arrearsDeduct > 0) {
                          rows.push({
                            label: "Arrears Deduction",
                            value: `- ${fmtCurrency(arrearsDeduct)}`,
                          });
                        }
                        rows.push({
                          label: "Net Amount",
                          value: fmtCurrency(net),
                        });
                        rows.push({
                          label: "Estimated kWh",
                          value: `${kWh} kWh`,
                        });
                        return rows.map((r) => (
                          <TableRow key={r.label}>
                            <TableCell
                              sx={{
                                color: colors.grey[100],
                                borderBottom:
                                  "1px solid rgba(255,255,255,0.05)",
                                fontSize: "0.8rem",
                              }}
                            >
                              {r.label}
                            </TableCell>
                            <TableCell
                              align="right"
                              sx={{
                                color: colors.greenAccent[500],
                                fontWeight: 600,
                                borderBottom:
                                  "1px solid rgba(255,255,255,0.05)",
                                fontSize: "0.8rem",
                              }}
                            >
                              {r.value}
                            </TableCell>
                          </TableRow>
                        ));
                      })()}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            <Button
              variant="contained"
              startIcon={<SendOutlined />}
              onClick={handleVend}
              disabled={!vendAmount || parseFloat(vendAmount) < 5}
              sx={{
                backgroundColor: colors.greenAccent[700],
                "&:hover": { backgroundColor: colors.greenAccent[600] },
                textTransform: "none",
              }}
            >
              Generate Token
            </Button>

            {generatedToken && (
              <Box
                mt={2}
                p={2}
                backgroundColor="rgba(76,206,172,0.1)"
                borderRadius="4px"
                border={`1px solid ${colors.greenAccent[700]}`}
              >
                <Box display="flex" alignItems="center" gap={1}>
                  <ConfirmationNumberOutlined
                    sx={{ color: colors.greenAccent[500] }}
                  />
                  <Typography
                    variant="body1"
                    color={colors.greenAccent[500]}
                    fontWeight={700}
                    fontFamily="monospace"
                    fontSize="0.9rem"
                  >
                    {generatedToken}
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() =>
                      navigator.clipboard.writeText(generatedToken)
                    }
                    sx={{ color: colors.greenAccent[500] }}
                  >
                    <ContentCopyOutlined sx={{ fontSize: 16 }} />
                  </IconButton>
                </Box>
              </Box>
            )}
          </Box>
        </Box>
        </Box>
      )}

      {/* ================================================================ */}
      {/* TAB 2: Load Control                                              */}
      {/* ================================================================ */}
      {tab === 2 && (
        <Box>
        <Box display="flex" justifyContent="flex-end" mb={0.5}>
          <DataBadge live />
        </Box>
        <Box
          display="grid"
          gridTemplateColumns="repeat(12, 1fr)"
          gridAutoRows="auto"
          gap="5px"
        >
          {/* ---- Mains Control ---- */}
          <Box
            gridColumn="span 6"
            backgroundColor={colors.primary[400]}
            p="20px"
            borderRadius="4px"
          >
            <Box display="flex" alignItems="center" gap={1} mb={2}>
              <BoltOutlined sx={{ color: "#f2b705" }} />
              <Typography
                variant="h6"
                color={colors.grey[100]}
                fontWeight="bold"
              >
                Mains Control
              </Typography>
            </Box>

            <InfoRow
              label="Current State"
              value={lcMainsState === "1" ? "ON" : "OFF"}
              color={
                lcMainsState === "1" ? colors.greenAccent[500] : "#db4f4a"
              }
            />
            {mainsControl && (
              <>
                <InfoRow
                  label="Last Command"
                  value={
                    mainsControl.state === "1" || mainsControl.state === 1
                      ? "Enable"
                      : "Disable"
                  }
                />
                <InfoRow
                  label="By"
                  value={mainsControl.user || "-"}
                />
                <InfoRow
                  label="Reason"
                  value={mainsControl.reason || "-"}
                />
                <InfoRow
                  label="Processed"
                  value={
                    mainsControl.processed === "1" ||
                    mainsControl.processed === 1
                      ? "Yes"
                      : "Pending"
                  }
                  color={
                    mainsControl.processed === "1" ||
                    mainsControl.processed === 1
                      ? colors.greenAccent[500]
                      : "#f2b705"
                  }
                />
                <InfoRow
                  label="Time"
                  value={formatDateTime(mainsControl.date_time)}
                />
              </>
            )}

            <FormControl fullWidth size="small" sx={{ mt: 2, mb: 1.5 }}>
              <InputLabel sx={{ color: colors.grey[400] }}>Reason</InputLabel>
              <Select
                value={mainsReason}
                onChange={(e) => setMainsReason(e.target.value)}
                label="Reason"
              >
                {LOAD_REASONS.map((r) => (
                  <MenuItem key={r} value={r}>
                    {r}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Typography variant="caption" color={colors.grey[400]} mt={1} mb={0.5}>Control Mode (Enable/Disable Relay Control)</Typography>
            <Box display="flex" gap={1}>
              <Button
                variant="contained"
                startIcon={<CheckCircleOutlined />}
                onClick={() => handleLoadControlClick("mains", "enable")}
                disabled={commandLoading}
                sx={{
                  backgroundColor: colors.greenAccent[700],
                  "&:hover": { backgroundColor: colors.greenAccent[600] },
                  textTransform: "none",
                  flex: 1,
                }}
              >
                Enable
              </Button>
              <Button
                variant="contained"
                startIcon={<CancelOutlined />}
                onClick={() => handleLoadControlClick("mains", "disable")}
                disabled={commandLoading}
                sx={{
                  backgroundColor: "#db4f4a",
                  "&:hover": { backgroundColor: "#c0413c" },
                  textTransform: "none",
                  flex: 1,
                }}
              >
                Disable
              </Button>
            </Box>

            <Typography variant="caption" color={colors.grey[400]} mt={1.5} mb={0.5}>Relay State (Turn Relay ON/OFF)</Typography>
            <Box display="flex" gap={1}>
              <Button
                variant="contained"
                startIcon={<PowerSettingsNewOutlined />}
                onClick={() => handleLoadControlClick("mains_state", "on")}
                disabled={commandLoading}
                sx={{
                  backgroundColor: "#1b5e20",
                  "&:hover": { backgroundColor: "#2e7d32" },
                  textTransform: "none",
                  flex: 1,
                }}
              >
                Turn ON
              </Button>
              <Button
                variant="contained"
                startIcon={<PowerSettingsNewOutlined />}
                onClick={() => handleLoadControlClick("mains_state", "off")}
                disabled={commandLoading}
                sx={{
                  backgroundColor: "#b71c1c",
                  "&:hover": { backgroundColor: "#c62828" },
                  textTransform: "none",
                  flex: 1,
                }}
              >
                Turn OFF
              </Button>
            </Box>
          </Box>

          {/* ---- Heater Control ---- */}
          <Box
            gridColumn="span 6"
            backgroundColor={colors.primary[400]}
            p="20px"
            borderRadius="4px"
          >
            <Box display="flex" alignItems="center" gap={1} mb={2}>
              <WaterDropOutlined sx={{ color: "#00b4d8" }} />
              <Typography
                variant="h6"
                color={colors.grey[100]}
                fontWeight="bold"
              >
                Heater Control
              </Typography>
            </Box>

            <InfoRow
              label="Current State"
              value={lcGeyserState === "1" ? "ON" : "OFF"}
              color={
                lcGeyserState === "1" ? colors.greenAccent[500] : "#db4f4a"
              }
            />
            {heaterControl && (
              <>
                <InfoRow
                  label="Last Command"
                  value={
                    heaterControl.state === "1" || heaterControl.state === 1
                      ? "Enable"
                      : "Disable"
                  }
                />
                <InfoRow
                  label="By"
                  value={heaterControl.user || "-"}
                />
                <InfoRow
                  label="Reason"
                  value={heaterControl.reason || "-"}
                />
                <InfoRow
                  label="Processed"
                  value={
                    heaterControl.processed === "1" ||
                    heaterControl.processed === 1
                      ? "Yes"
                      : "Pending"
                  }
                  color={
                    heaterControl.processed === "1" ||
                    heaterControl.processed === 1
                      ? colors.greenAccent[500]
                      : "#f2b705"
                  }
                />
                <InfoRow
                  label="Time"
                  value={formatDateTime(heaterControl.date_time)}
                />
              </>
            )}

            <FormControl fullWidth size="small" sx={{ mt: 2, mb: 1.5 }}>
              <InputLabel sx={{ color: colors.grey[400] }}>Reason</InputLabel>
              <Select
                value={heaterReason}
                onChange={(e) => setHeaterReason(e.target.value)}
                label="Reason"
              >
                {LOAD_REASONS.map((r) => (
                  <MenuItem key={r} value={r}>
                    {r}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Typography variant="caption" color={colors.grey[400]} mt={1} mb={0.5}>Control Mode (Enable/Disable Relay Control)</Typography>
            <Box display="flex" gap={1}>
              <Button
                variant="contained"
                startIcon={<CheckCircleOutlined />}
                onClick={() => handleLoadControlClick("heater", "enable")}
                disabled={commandLoading}
                sx={{
                  backgroundColor: colors.greenAccent[700],
                  "&:hover": { backgroundColor: colors.greenAccent[600] },
                  textTransform: "none",
                  flex: 1,
                }}
              >
                Enable
              </Button>
              <Button
                variant="contained"
                startIcon={<CancelOutlined />}
                onClick={() => handleLoadControlClick("heater", "disable")}
                disabled={commandLoading}
                sx={{
                  backgroundColor: "#db4f4a",
                  "&:hover": { backgroundColor: "#c0413c" },
                  textTransform: "none",
                  flex: 1,
                }}
              >
                Disable
              </Button>
            </Box>

            <Typography variant="caption" color={colors.grey[400]} mt={1.5} mb={0.5}>Relay State (Turn Relay ON/OFF)</Typography>
            <Box display="flex" gap={1}>
              <Button
                variant="contained"
                startIcon={<PowerSettingsNewOutlined />}
                onClick={() => handleLoadControlClick("heater_state", "on")}
                disabled={commandLoading}
                sx={{
                  backgroundColor: "#1b5e20",
                  "&:hover": { backgroundColor: "#2e7d32" },
                  textTransform: "none",
                  flex: 1,
                }}
              >
                Turn ON
              </Button>
              <Button
                variant="contained"
                startIcon={<PowerSettingsNewOutlined />}
                onClick={() => handleLoadControlClick("heater_state", "off")}
                disabled={commandLoading}
                sx={{
                  backgroundColor: "#b71c1c",
                  "&:hover": { backgroundColor: "#c62828" },
                  textTransform: "none",
                  flex: 1,
                }}
              >
                Turn OFF
              </Button>
            </Box>
          </Box>

          {/* ---- Mains State (read-only feedback) ---- */}
          <Box
            gridColumn="span 6"
            backgroundColor={colors.primary[400]}
            p="20px"
            borderRadius="4px"
          >
            <Box display="flex" alignItems="center" gap={1} mb={2}>
              <ElectricalServicesOutlined sx={{ color: "#f2b705" }} />
              <Typography
                variant="h6"
                color={colors.grey[100]}
                fontWeight="bold"
              >
                Mains State (Feedback)
              </Typography>
            </Box>
            {mainsState ? (
              <>
                <InfoRow
                  label="State"
                  value={
                    mainsState.state === "1" || mainsState.state === 1
                      ? "ON"
                      : mainsState.state === "0" || mainsState.state === 0
                      ? "OFF"
                      : mainsState.state || "Unknown"
                  }
                  color={
                    mainsState.state === "1" || mainsState.state === 1
                      ? colors.greenAccent[500]
                      : "#db4f4a"
                  }
                />
                <InfoRow
                  label="Last Updated"
                  value={formatDateTime(mainsState.date_time)}
                />
              </>
            ) : (
              <Typography
                variant="body2"
                color="rgba(255,255,255,0.35)"
              >
                No mains state data available
              </Typography>
            )}
          </Box>

          {/* ---- Heater State (read-only feedback) ---- */}
          <Box
            gridColumn="span 6"
            backgroundColor={colors.primary[400]}
            p="20px"
            borderRadius="4px"
          >
            <Box display="flex" alignItems="center" gap={1} mb={2}>
              <WaterDropOutlined sx={{ color: "#00b4d8" }} />
              <Typography
                variant="h6"
                color={colors.grey[100]}
                fontWeight="bold"
              >
                Heater State (Feedback)
              </Typography>
            </Box>
            {heaterState ? (
              <>
                <InfoRow
                  label="State"
                  value={
                    heaterState.state === "1" || heaterState.state === 1
                      ? "ON"
                      : heaterState.state === "0" || heaterState.state === 0
                      ? "OFF"
                      : heaterState.state || "Unknown"
                  }
                  color={
                    heaterState.state === "1" || heaterState.state === 1
                      ? colors.greenAccent[500]
                      : "#db4f4a"
                  }
                />
                <InfoRow
                  label="Last Updated"
                  value={formatDateTime(heaterState.date_time)}
                />
              </>
            ) : (
              <Typography
                variant="body2"
                color="rgba(255,255,255,0.35)"
              >
                No heater state data available
              </Typography>
            )}
          </Box>
        </Box>
        </Box>
      )}

      {/* ================================================================ */}
      {/* TAB 3: Billing & Tariff                                          */}
      {/* ================================================================ */}
      {tab === 3 && (
        <Box>
        <Box display="flex" justifyContent="flex-end" mb={0.5}>
          <DataBadge />
        </Box>
        <Box
          display="grid"
          gridTemplateColumns="repeat(12, 1fr)"
          gridAutoRows="140px"
          gap="5px"
        >
          <Box
            gridColumn="span 6"
            gridRow="span 2"
            backgroundColor={colors.primary[400]}
            p="20px"
            borderRadius="4px"
            overflow="auto"
          >
            <Typography
              variant="h6"
              color={colors.grey[100]}
              fontWeight="bold"
              mb={1}
            >
              Billing Information
            </Typography>
            <InfoRow
              label="Billing Type"
              value={mockMeter?.billing?.type || tariffType}
            />
            <InfoRow
              label="Credit Option"
              value={mockMeter?.billing?.creditOption || "Standard"}
            />
            <InfoRow
              label="Current Balance"
              value={`${parseFloat(units).toFixed(1)} kWh`}
              color="#00b4d8"
            />
            <InfoRow
              label="Last Token"
              value={mockMeter?.billing?.lastToken || "---"}
              mono
              color={colors.greenAccent[500]}
            />
            <InfoRow
              label="Tariff Group"
              value={mockMeter?.billing?.tariffGroup || tariffType}
            />
            {customer && (
              <>
                <InfoRow
                  label="Customer Status"
                  value={customer.status}
                  color={
                    customer.status === "Active"
                      ? colors.greenAccent[500]
                      : "#db4f4a"
                  }
                />
                <InfoRow
                  label="Arrears"
                  value={fmtCurrency(customer.arrears)}
                  color={
                    customer.arrears > 0
                      ? "#db4f4a"
                      : colors.greenAccent[500]
                  }
                />
              </>
            )}
          </Box>

          <Box
            gridColumn="span 6"
            gridRow="span 2"
            backgroundColor={colors.primary[400]}
            p="20px"
            borderRadius="4px"
            overflow="auto"
          >
            <Typography
              variant="h6"
              color={colors.grey[100]}
              fontWeight="bold"
              mb={1}
            >
              Tariff Structure: {tariff?.name || "---"}
            </Typography>
            <Typography
              variant="body2"
              color="rgba(255,255,255,0.5)"
              mb={1.5}
              fontSize="0.78rem"
            >
              {tariff?.description || ""}
            </Typography>
            {tariff?.blocks && (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      {["Block", "Range", "Rate (N$/kWh)"].map((col) => (
                        <TableCell
                          key={col}
                          align={col.includes("Rate") ? "right" : "left"}
                          sx={{
                            color: colors.greenAccent[500],
                            fontWeight: 600,
                            fontSize: "0.75rem",
                            borderBottom:
                              "1px solid rgba(255,255,255,0.1)",
                          }}
                        >
                          {col}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tariff.blocks.map((b) => (
                      <TableRow key={b.name}>
                        <TableCell
                          sx={{
                            color: colors.grey[100],
                            fontSize: "0.8rem",
                            borderBottom:
                              "1px solid rgba(255,255,255,0.05)",
                          }}
                        >
                          {b.name}
                        </TableCell>
                        <TableCell
                          sx={{
                            color: colors.grey[100],
                            fontSize: "0.8rem",
                            borderBottom:
                              "1px solid rgba(255,255,255,0.05)",
                          }}
                        >
                          {b.range}
                        </TableCell>
                        <TableCell
                          align="right"
                          sx={{
                            color: "#f2b705",
                            fontWeight: 600,
                            fontSize: "0.8rem",
                            borderBottom:
                              "1px solid rgba(255,255,255,0.05)",
                          }}
                        >
                          {Number(b.rate).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>

          <Box
            gridColumn="span 12"
            gridRow="span 1"
            backgroundColor={colors.primary[400]}
            p="15px"
            borderRadius="4px"
            overflow="auto"
          >
            <Typography
              variant="h6"
              color={colors.grey[100]}
              fontWeight="bold"
              mb={1}
            >
              System Charges
            </Typography>
            <Box display="flex" gap={4} flexWrap="wrap">
              <Box>
                <Typography
                  variant="body2"
                  color={colors.greenAccent[500]}
                  fontSize="0.72rem"
                >
                  VAT Rate
                </Typography>
                <Typography
                  variant="body1"
                  color={colors.grey[100]}
                  fontWeight={600}
                >
                  {tariffConfig.vatRate}%
                </Typography>
              </Box>
              <Box>
                <Typography
                  variant="body2"
                  color={colors.greenAccent[500]}
                  fontSize="0.72rem"
                >
                  Fixed Charge
                </Typography>
                <Typography
                  variant="body1"
                  color={colors.grey[100]}
                  fontWeight={600}
                >
                  {fmtCurrency(tariffConfig.fixedCharge)}
                </Typography>
              </Box>
              <Box>
                <Typography
                  variant="body2"
                  color={colors.greenAccent[500]}
                  fontSize="0.72rem"
                >
                  REL Levy
                </Typography>
                <Typography
                  variant="body1"
                  color={colors.grey[100]}
                  fontWeight={600}
                >
                  {fmtCurrency(tariffConfig.relLevy)}
                </Typography>
              </Box>
              <Box>
                <Typography
                  variant="body2"
                  color={colors.greenAccent[500]}
                  fontSize="0.72rem"
                >
                  Min Purchase
                </Typography>
                <Typography
                  variant="body1"
                  color={colors.grey[100]}
                  fontWeight={600}
                >
                  {fmtCurrency(tariffConfig.minPurchase)}
                </Typography>
              </Box>
              <Box>
                <Typography
                  variant="body2"
                  color={colors.greenAccent[500]}
                  fontSize="0.72rem"
                >
                  Arrears Deduction
                </Typography>
                <Typography
                  variant="body1"
                  color={colors.grey[100]}
                  fontWeight={600}
                >
                  {tariffConfig.arrearsPercentage}%
                </Typography>
              </Box>
            </Box>
          </Box>
        </Box>
        </Box>
      )}

      {/* ================================================================ */}
      {/* TAB 4: Configuration                                             */}
      {/* ================================================================ */}
      {tab === 4 && (
        <Box>
        <Box display="flex" justifyContent="flex-end" mb={0.5}>
          <DataBadge live />
        </Box>
        <Box
          display="grid"
          gridTemplateColumns="repeat(12, 1fr)"
          gridAutoRows="140px"
          gap="5px"
        >
          <Box
            gridColumn="span 6"
            gridRow="span 2"
            backgroundColor={colors.primary[400]}
            p="20px"
            borderRadius="4px"
            overflow="auto"
          >
            <Typography
              variant="h6"
              color={colors.grey[100]}
              fontWeight="bold"
              mb={1}
            >
              Meter Configuration
            </Typography>
            <InfoRow label="DRN" value={drn} mono />
            <InfoRow label="Meter No" value={meterNo} mono />
            <InfoRow label="Transformer" value={transformer} mono />
            <InfoRow label="Area" value={meterArea} />
            <InfoRow label="Suburb" value={meterSuburb} />
            <InfoRow
              label="Street"
              value={profile?.StreetName || mockMeter?.street || "-"}
            />
            <InfoRow label="Tariff Type" value={tariffType} />
          </Box>

          <Box
            gridColumn="span 6"
            gridRow="span 2"
            backgroundColor={colors.primary[400]}
            p="20px"
            borderRadius="4px"
          >
            <Typography
              variant="h6"
              color={colors.grey[100]}
              fontWeight="bold"
              mb={2}
            >
              Configuration Actions
            </Typography>
            <Box display="flex" flexDirection="column" gap={1.5}>
              <Button
                variant="outlined"
                startIcon={<BluetoothDisabled />}
                disabled={commandLoading}
                onClick={() => {
                  setConfirmDialog({ open: true, type: "config_reset_ble", action: "reset_ble" });
                }}
                sx={{
                  textTransform: "none",
                  justifyContent: "flex-start",
                  color: "#00b4d8",
                  borderColor: "#00b4d8",
                }}
              >
                Reset BLE PIN to Default
              </Button>
              <Button
                variant="outlined"
                startIcon={<PersonRemoveOutlined />}
                disabled={commandLoading}
                onClick={() => {
                  setConfirmDialog({ open: true, type: "config_clear_auth", action: "clear_auth" });
                }}
                sx={{
                  textTransform: "none",
                  justifyContent: "flex-start",
                  color: "#f2b705",
                  borderColor: "#f2b705",
                }}
              >
                Clear All Authorized Numbers
              </Button>
              <Button
                variant="outlined"
                startIcon={<RestartAltOutlined />}
                disabled={commandLoading}
                onClick={() => {
                  setConfirmDialog({ open: true, type: "config_restart", action: "restart_meter" });
                }}
                sx={{
                  textTransform: "none",
                  justifyContent: "flex-start",
                  color: "#db4f4a",
                  borderColor: "#db4f4a",
                }}
              >
                Restart Meter
              </Button>
            </Box>
          </Box>
        </Box>
        </Box>
      )}

      {/* ================================================================ */}
      {/* TAB 5: Energy Charts                                             */}
      {/* ================================================================ */}
      {tab === 5 && (
        <Box>
        <Box display="flex" justifyContent="flex-end" mb={0.5}>
          <DataBadge />
        </Box>
        <Box
          display="grid"
          gridTemplateColumns="repeat(12, 1fr)"
          gridAutoRows="140px"
          gap="5px"
        >
          <Box
            gridColumn="span 12"
            gridRow="span 3"
            backgroundColor={colors.primary[400]}
            p="20px"
            borderRadius="4px"
          >
            <Typography
              variant="h6"
              color={colors.grey[100]}
              fontWeight="bold"
              mb={2}
            >
              24-Hour Energy Consumption
            </Typography>
            <ResponsiveContainer width="100%" height="80%">
              <AreaChart
                data={hourlyData}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.06)"
                />
                <XAxis
                  dataKey="hour"
                  tick={{ fill: colors.grey[100], fontSize: 11 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: colors.grey[100], fontSize: 11 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  tickLine={false}
                  unit=" kWh"
                />
                <RechartsTooltip
                  contentStyle={{
                    background: colors.primary[400],
                    border: `1px solid ${colors.greenAccent[700]}`,
                    borderRadius: 4,
                    color: colors.grey[100],
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="kWh"
                  stroke={colors.greenAccent[500]}
                  fill={colors.greenAccent[500]}
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Box>

          {/* Weekly Power Comparison Bar Chart */}
          <Box
            gridColumn="span 12"
            gridRow="span 3"
            backgroundColor={colors.primary[400]}
            p="20px"
            borderRadius="4px"
            mt="5px"
          >
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
              <Typography variant="h6" color={colors.grey[100]} fontWeight="bold">
                Weekly Power Consumption — This Week vs Last Week
              </Typography>
              <DataBadge live />
            </Box>
            {weeklyPowerChart.length > 0 && weeklyPowerChart.some((d) => d.thisWeek > 0 || d.lastWeek > 0) ? (
              <ResponsiveContainer width="100%" height="80%">
                <BarChart
                  data={weeklyPowerChart}
                  margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: colors.grey[100], fontSize: 12 }}
                    axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: colors.grey[100], fontSize: 11 }}
                    axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                    tickLine={false}
                    unit=" W"
                  />
                  <RechartsTooltip
                    contentStyle={{
                      background: colors.primary[400],
                      border: `1px solid ${colors.greenAccent[700]}`,
                      borderRadius: 4,
                      color: colors.grey[100],
                    }}
                    formatter={(value) => [`${Number(value).toFixed(2)} W`]}
                  />
                  <Legend
                    wrapperStyle={{ color: colors.grey[100], fontSize: 12 }}
                  />
                  <Bar
                    dataKey="thisWeek"
                    name="This Week"
                    fill={colors.greenAccent[500]}
                    radius={[4, 4, 0, 0]}
                    barSize={20}
                  />
                  <Bar
                    dataKey="lastWeek"
                    name="Last Week"
                    fill={colors.blueAccent[400]}
                    radius={[4, 4, 0, 0]}
                    barSize={20}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Box display="flex" alignItems="center" justifyContent="center" height="80%">
                <Typography variant="body2" color={colors.grey[400]}>
                  No power data available for comparison
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
        </Box>
      )}

      {/* ================================================================ */}
      {/* TAB 6: Transaction History                                       */}
      {/* ================================================================ */}
      {tab === 6 && (
        <Box>
        <Box display="flex" justifyContent="flex-end" mb={0.5}>
          <DataBadge />
        </Box>
        <Box
          display="grid"
          gridTemplateColumns="repeat(12, 1fr)"
          gridAutoRows="140px"
          gap="5px"
        >
          <Box
            gridColumn="span 12"
            gridRow="span 4"
            backgroundColor={colors.primary[400]}
            p="20px"
            borderRadius="4px"
            overflow="auto"
          >
            <Typography
              variant="h6"
              color={colors.grey[100]}
              fontWeight="bold"
              mb={2}
            >
              Transaction History
            </Typography>
            {meterTxns.length > 0 ? (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      {[
                        "Ref",
                        "Date/Time",
                        "Amount",
                        "kWh",
                        "Token",
                        "Status",
                        "Operator",
                      ].map((col) => (
                        <TableCell
                          key={col}
                          sx={{
                            color: colors.greenAccent[500],
                            fontWeight: 600,
                            fontSize: "0.75rem",
                            borderBottom:
                              "1px solid rgba(255,255,255,0.1)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {col}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {meterTxns.map((t) => {
                      const sc =
                        t.status === "Completed"
                          ? {
                              bg: "rgba(76,206,172,0.15)",
                              text: colors.greenAccent[500],
                            }
                          : t.status === "Failed"
                          ? { bg: "rgba(219,79,74,0.15)", text: "#db4f4a" }
                          : {
                              bg: "rgba(242,183,5,0.15)",
                              text: "#f2b705",
                            };
                      return (
                        <TableRow
                          key={t.id}
                          sx={{
                            "&:hover": {
                              bgcolor: "rgba(0,180,216,0.05)",
                            },
                          }}
                        >
                          <TableCell
                            sx={{
                              color: colors.grey[100],
                              fontSize: "0.78rem",
                              fontFamily: "monospace",
                              borderBottom:
                                "1px solid rgba(255,255,255,0.05)",
                            }}
                          >
                            {t.refNo}
                          </TableCell>
                          <TableCell
                            sx={{
                              color: colors.grey[100],
                              fontSize: "0.78rem",
                              borderBottom:
                                "1px solid rgba(255,255,255,0.05)",
                            }}
                          >
                            {formatDateTime(t.dateTime)}
                          </TableCell>
                          <TableCell
                            sx={{
                              color: colors.grey[100],
                              fontWeight: 600,
                              fontSize: "0.78rem",
                              borderBottom:
                                "1px solid rgba(255,255,255,0.05)",
                            }}
                          >
                            {fmtCurrency(t.amount)}
                          </TableCell>
                          <TableCell
                            sx={{
                              color: colors.greenAccent[500],
                              fontSize: "0.78rem",
                              borderBottom:
                                "1px solid rgba(255,255,255,0.05)",
                            }}
                          >
                            {Number(t.kWh).toFixed(2)}
                          </TableCell>
                          <TableCell
                            sx={{
                              color: colors.grey[100],
                              fontFamily: "monospace",
                              fontSize: "0.72rem",
                              borderBottom:
                                "1px solid rgba(255,255,255,0.05)",
                            }}
                          >
                            {t.token}
                          </TableCell>
                          <TableCell
                            sx={{
                              borderBottom:
                                "1px solid rgba(255,255,255,0.05)",
                            }}
                          >
                            <Chip
                              label={t.status}
                              size="small"
                              sx={{
                                bgcolor: sc.bg,
                                color: sc.text,
                                fontWeight: 600,
                                fontSize: "0.68rem",
                                height: 22,
                              }}
                            />
                          </TableCell>
                          <TableCell
                            sx={{
                              color: colors.grey[100],
                              fontSize: "0.78rem",
                              borderBottom:
                                "1px solid rgba(255,255,255,0.05)",
                            }}
                          >
                            {t.operator}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Typography
                color="rgba(255,255,255,0.35)"
                sx={{ textAlign: "center", py: 4 }}
              >
                No transactions found for this meter.
              </Typography>
            )}
          </Box>
        </Box>
        </Box>
      )}

      {/* ================================================================ */}
      {/* TAB 7: Commission Report                                       */}
      {/* ================================================================ */}
      {tab === 7 && (
        <Box>
          <Box display="flex" justifyContent="flex-end" mb={0.5}>
            <DataBadge />
          </Box>
          <Box
            display="grid"
            gridTemplateColumns="repeat(12, 1fr)"
            gap="5px"
          >
            {/* Commission Reports Table */}
            <Box
              gridColumn="span 12"
              backgroundColor={colors.primary[400]}
              p="20px"
              borderRadius="4px"
            >
              <Typography
                variant="h6"
                color={colors.grey[100]}
                fontWeight="bold"
                mb={2}
              >
                Commission Test Reports
              </Typography>

              {commissionReports.length > 0 ? (
                commissionReports.map((report, idx) => (
                  <Box
                    key={report.id || idx}
                    mb={2}
                    p={2}
                    sx={{
                      backgroundColor: colors.primary[500],
                      borderLeft: `4px solid ${
                        report.overall_passed
                          ? colors.greenAccent[500]
                          : "#db4f4a"
                      }`,
                      borderRadius: "2px",
                    }}
                  >
                    {/* Report Header */}
                    <Box
                      display="flex"
                      justifyContent="space-between"
                      alignItems="center"
                      mb={1.5}
                    >
                      <Box display="flex" alignItems="center" gap={1.5}>
                        <Chip
                          label={report.report_type?.replace(/_/g, " ").toUpperCase() || "TEST"}
                          size="small"
                          sx={{
                            backgroundColor: report.overall_passed
                              ? "rgba(76,206,172,0.15)"
                              : "rgba(219,79,74,0.15)",
                            color: report.overall_passed
                              ? colors.greenAccent[500]
                              : "#db4f4a",
                            fontWeight: 700,
                            fontSize: "0.7rem",
                            textTransform: "uppercase",
                          }}
                        />
                        <Chip
                          label={report.overall_passed ? "PASSED" : "FAILED"}
                          size="small"
                          sx={{
                            backgroundColor: report.overall_passed
                              ? "rgba(76,206,172,0.2)"
                              : "rgba(219,79,74,0.2)",
                            color: report.overall_passed
                              ? colors.greenAccent[400]
                              : "#f44336",
                            fontWeight: 700,
                            fontSize: "0.7rem",
                          }}
                        />
                      </Box>
                      <Typography
                        color={colors.grey[300]}
                        fontSize="0.75rem"
                      >
                        {report.date_time
                          ? formatDateTime(report.date_time)
                          : "---"}
                      </Typography>
                    </Box>

                    {/* Report Details Grid */}
                    <Box
                      display="grid"
                      gridTemplateColumns="repeat(auto-fit, minmax(180px, 1fr))"
                      gap={1.5}
                    >
                      {/* Measurement Results */}
                      {(report.report_type === "measurement" ||
                        report.report_type === "auto_calibration" ||
                        report.report_type === "full_system") &&
                        report.voltage_measured != null && (
                          <Box>
                            <Typography
                              color={colors.grey[300]}
                              fontSize="0.7rem"
                              fontWeight={600}
                              mb={0.5}
                            >
                              MEASUREMENT
                            </Typography>
                            <Box display="flex" flexDirection="column" gap={0.3}>
                              <Box display="flex" justifyContent="space-between">
                                <Typography color={colors.grey[400]} fontSize="0.72rem">
                                  Voltage
                                </Typography>
                                <Typography
                                  color={
                                    report.voltage_passed
                                      ? colors.greenAccent[500]
                                      : "#db4f4a"
                                  }
                                  fontSize="0.72rem"
                                  fontWeight={600}
                                >
                                  {Number(report.voltage_measured).toFixed(1)}V
                                  ({Number(report.voltage_error).toFixed(1)}%)
                                </Typography>
                              </Box>
                              <Box display="flex" justifyContent="space-between">
                                <Typography color={colors.grey[400]} fontSize="0.72rem">
                                  Current
                                </Typography>
                                <Typography
                                  color={
                                    report.current_passed
                                      ? colors.greenAccent[500]
                                      : "#db4f4a"
                                  }
                                  fontSize="0.72rem"
                                  fontWeight={600}
                                >
                                  {Number(report.current_measured).toFixed(3)}A
                                  ({Number(report.current_error).toFixed(1)}%)
                                </Typography>
                              </Box>
                              <Box display="flex" justifyContent="space-between">
                                <Typography color={colors.grey[400]} fontSize="0.72rem">
                                  Power
                                </Typography>
                                <Typography
                                  color={
                                    report.power_passed
                                      ? colors.greenAccent[500]
                                      : "#db4f4a"
                                  }
                                  fontSize="0.72rem"
                                  fontWeight={600}
                                >
                                  {Number(report.power_measured).toFixed(0)}W
                                  ({Number(report.power_error).toFixed(1)}%)
                                </Typography>
                              </Box>
                            </Box>
                          </Box>
                        )}

                      {/* Load Test Results */}
                      {(report.report_type === "load" ||
                        report.report_type === "auto_calibration" ||
                        report.report_type === "full_system") &&
                        report.load_off_current != null && (
                          <Box>
                            <Typography
                              color={colors.grey[300]}
                              fontSize="0.7rem"
                              fontWeight={600}
                              mb={0.5}
                            >
                              LOAD TEST
                            </Typography>
                            <Box display="flex" flexDirection="column" gap={0.3}>
                              <Box display="flex" justifyContent="space-between">
                                <Typography color={colors.grey[400]} fontSize="0.72rem">
                                  OFF Current
                                </Typography>
                                <Typography
                                  color={
                                    report.load_off_passed
                                      ? colors.greenAccent[500]
                                      : "#db4f4a"
                                  }
                                  fontSize="0.72rem"
                                  fontWeight={600}
                                >
                                  {Number(report.load_off_current).toFixed(3)}A
                                  {report.load_off_passed ? " PASS" : " FAIL"}
                                </Typography>
                              </Box>
                              <Box display="flex" justifyContent="space-between">
                                <Typography color={colors.grey[400]} fontSize="0.72rem">
                                  ON Current
                                </Typography>
                                <Typography
                                  color={
                                    report.load_on_passed
                                      ? colors.greenAccent[500]
                                      : "#db4f4a"
                                  }
                                  fontSize="0.72rem"
                                  fontWeight={600}
                                >
                                  {Number(report.load_on_current).toFixed(3)}A
                                  {report.load_on_passed ? " PASS" : " FAIL"}
                                </Typography>
                              </Box>
                            </Box>
                          </Box>
                        )}

                      {/* API Test Results */}
                      {(report.report_type === "api" ||
                        report.report_type === "full_system") &&
                        report.api_tests_total != null && (
                          <Box>
                            <Typography
                              color={colors.grey[300]}
                              fontSize="0.7rem"
                              fontWeight={600}
                              mb={0.5}
                            >
                              API TEST
                            </Typography>
                            <Box display="flex" justifyContent="space-between">
                              <Typography color={colors.grey[400]} fontSize="0.72rem">
                                Endpoints
                              </Typography>
                              <Typography
                                color={
                                  report.api_tests_passed === report.api_tests_total
                                    ? colors.greenAccent[500]
                                    : "#db4f4a"
                                }
                                fontSize="0.72rem"
                                fontWeight={600}
                              >
                                {report.api_tests_passed}/{report.api_tests_total} passed
                              </Typography>
                            </Box>
                          </Box>
                        )}

                      {/* Full System Summary */}
                      {report.report_type === "full_system" && (
                        <Box>
                          <Typography
                            color={colors.grey[300]}
                            fontSize="0.7rem"
                            fontWeight={600}
                            mb={0.5}
                          >
                            SYSTEM SUMMARY
                          </Typography>
                          <Box display="flex" flexDirection="column" gap={0.3}>
                            <Box display="flex" justifyContent="space-between">
                              <Typography color={colors.grey[400]} fontSize="0.72rem">
                                Measurement
                              </Typography>
                              <Typography
                                color={
                                  report.measurement_test_passed
                                    ? colors.greenAccent[500]
                                    : "#db4f4a"
                                }
                                fontSize="0.72rem"
                                fontWeight={600}
                              >
                                {report.measurement_test_passed ? "PASS" : "FAIL"}
                              </Typography>
                            </Box>
                            <Box display="flex" justifyContent="space-between">
                              <Typography color={colors.grey[400]} fontSize="0.72rem">
                                Load
                              </Typography>
                              <Typography
                                color={
                                  report.load_test_passed
                                    ? colors.greenAccent[500]
                                    : "#db4f4a"
                                }
                                fontSize="0.72rem"
                                fontWeight={600}
                              >
                                {report.load_test_passed ? "PASS" : "FAIL"}
                              </Typography>
                            </Box>
                            <Box display="flex" justifyContent="space-between">
                              <Typography color={colors.grey[400]} fontSize="0.72rem">
                                API
                              </Typography>
                              <Typography
                                color={
                                  report.api_test_passed
                                    ? colors.greenAccent[500]
                                    : "#db4f4a"
                                }
                                fontSize="0.72rem"
                                fontWeight={600}
                              >
                                {report.api_test_passed ? "PASS" : "FAIL"}
                              </Typography>
                            </Box>
                          </Box>
                        </Box>
                      )}

                      {/* Commissioning Location & Owner Info */}
                      {report.report_type === "commissioning" && (
                        <Box>
                          <Typography
                            color={colors.grey[300]}
                            fontSize="0.7rem"
                            fontWeight={600}
                            mb={0.5}
                          >
                            COMMISSIONING DETAILS
                          </Typography>
                          <Box display="flex" flexDirection="column" gap={0.3}>
                            {report.region && (
                              <Box display="flex" justifyContent="space-between">
                                <Typography color={colors.grey[400]} fontSize="0.72rem">Region</Typography>
                                <Typography color={colors.grey[100]} fontSize="0.72rem">{report.region}</Typography>
                              </Box>
                            )}
                            {report.sub_region && (
                              <Box display="flex" justifyContent="space-between">
                                <Typography color={colors.grey[400]} fontSize="0.72rem">Sub-Region</Typography>
                                <Typography color={colors.grey[100]} fontSize="0.72rem">{report.sub_region}</Typography>
                              </Box>
                            )}
                            {report.area && (
                              <Box display="flex" justifyContent="space-between">
                                <Typography color={colors.grey[400]} fontSize="0.72rem">Area</Typography>
                                <Typography color={colors.grey[100]} fontSize="0.72rem">{report.area}</Typography>
                              </Box>
                            )}
                            {report.erf_number && (
                              <Box display="flex" justifyContent="space-between">
                                <Typography color={colors.grey[400]} fontSize="0.72rem">ERF Number</Typography>
                                <Typography color={colors.grey[100]} fontSize="0.72rem">{report.erf_number}</Typography>
                              </Box>
                            )}
                            {report.sim_number && (
                              <Box display="flex" justifyContent="space-between">
                                <Typography color={colors.grey[400]} fontSize="0.72rem">SIM Number</Typography>
                                <Typography color={colors.grey[100]} fontSize="0.72rem">{report.sim_number}</Typography>
                              </Box>
                            )}
                            {(report.gps_latitude || report.gps_longitude) && (
                              <Box display="flex" justifyContent="space-between">
                                <Typography color={colors.grey[400]} fontSize="0.72rem">GPS</Typography>
                                <Typography color={colors.grey[100]} fontSize="0.72rem">
                                  {report.gps_latitude?.toFixed(6)}, {report.gps_longitude?.toFixed(6)}
                                </Typography>
                              </Box>
                            )}
                            {report.firmware_version && (
                              <Box display="flex" justifyContent="space-between">
                                <Typography color={colors.grey[400]} fontSize="0.72rem">Firmware</Typography>
                                <Typography color={colors.grey[100]} fontSize="0.72rem">{report.firmware_version}</Typography>
                              </Box>
                            )}
                            {report.owner_name && (
                              <Box display="flex" justifyContent="space-between">
                                <Typography color={colors.grey[400]} fontSize="0.72rem">Owner</Typography>
                                <Typography color={colors.grey[100]} fontSize="0.72rem">
                                  {report.owner_name} {report.owner_surname || ""}
                                </Typography>
                              </Box>
                            )}
                            {report.owner_phone && (
                              <Box display="flex" justifyContent="space-between">
                                <Typography color={colors.grey[400]} fontSize="0.72rem">Phone</Typography>
                                <Typography color={colors.grey[100]} fontSize="0.72rem">{report.owner_phone}</Typography>
                              </Box>
                            )}
                            {report.owner_email && (
                              <Box display="flex" justifyContent="space-between">
                                <Typography color={colors.grey[400]} fontSize="0.72rem">Email</Typography>
                                <Typography color={colors.grey[100]} fontSize="0.72rem">{report.owner_email}</Typography>
                              </Box>
                            )}
                            {report.nextion_connected != null && (
                              <Box display="flex" justifyContent="space-between">
                                <Typography color={colors.grey[400]} fontSize="0.72rem">Nextion</Typography>
                                <Typography
                                  color={report.nextion_connected ? colors.greenAccent[500] : "#db4f4a"}
                                  fontSize="0.72rem"
                                  fontWeight={600}
                                >
                                  {report.nextion_connected ? "Connected" : "Disconnected"}
                                </Typography>
                              </Box>
                            )}
                            {report.gsm_registered != null && (
                              <Box display="flex" justifyContent="space-between">
                                <Typography color={colors.grey[400]} fontSize="0.72rem">GSM</Typography>
                                <Typography
                                  color={report.gsm_registered ? colors.greenAccent[500] : "#db4f4a"}
                                  fontSize="0.72rem"
                                  fontWeight={600}
                                >
                                  {report.gsm_registered ? "Registered" : "Not Registered"}
                                </Typography>
                              </Box>
                            )}
                          </Box>
                        </Box>
                      )}

                      {/* Test Metadata */}
                      <Box>
                        <Typography
                          color={colors.grey[300]}
                          fontSize="0.7rem"
                          fontWeight={600}
                          mb={0.5}
                        >
                          INFO
                        </Typography>
                        <Box display="flex" flexDirection="column" gap={0.3}>
                          {report.attempts != null && (
                            <Box display="flex" justifyContent="space-between">
                              <Typography color={colors.grey[400]} fontSize="0.72rem">
                                Attempts
                              </Typography>
                              <Typography color={colors.grey[100]} fontSize="0.72rem">
                                {report.attempts}
                              </Typography>
                            </Box>
                          )}
                          {report.sample_count != null && (
                            <Box display="flex" justifyContent="space-between">
                              <Typography color={colors.grey[400]} fontSize="0.72rem">
                                Samples
                              </Typography>
                              <Typography color={colors.grey[100]} fontSize="0.72rem">
                                {report.sample_count}
                              </Typography>
                            </Box>
                          )}
                          {report.tester_app_version && (
                            <Box display="flex" justifyContent="space-between">
                              <Typography color={colors.grey[400]} fontSize="0.72rem">
                                App Version
                              </Typography>
                              <Typography color={colors.grey[100]} fontSize="0.72rem">
                                {report.tester_app_version}
                              </Typography>
                            </Box>
                          )}
                        </Box>
                      </Box>
                    </Box>
                  </Box>
                ))
              ) : (
                <Typography
                  color="rgba(255,255,255,0.35)"
                  sx={{ textAlign: "center", py: 4 }}
                >
                  No commission reports found for this meter. Run a commission
                  test from the GRIDx Maintenance app to generate reports.
                </Typography>
              )}
            </Box>
          </Box>
        </Box>
      )}

      {/* ================================================================ */}
      {/* TAB 8: Home Classification                                      */}
      {/* ================================================================ */}
      {tab === 8 && (
        <Box>
          <Box display="flex" justifyContent="flex-end" mb={0.5}>
            <DataBadge />
          </Box>
          <Box
            display="grid"
            gridTemplateColumns="repeat(12, 1fr)"
            gap="5px"
          >
            {/* Home Classifications List */}
            <Box
              gridColumn="span 12"
              backgroundColor={colors.primary[400]}
              p="20px"
              borderRadius="4px"
            >
              <Typography
                variant="h6"
                color={colors.grey[100]}
                fontWeight="bold"
                mb={2}
              >
                Home Classification Records
              </Typography>

              {homeClassifications.length > 0 ? (
                homeClassifications.map((cls, idx) => {
                  const loads = Array.isArray(cls.selected_loads)
                    ? cls.selected_loads
                    : typeof cls.selected_loads === "string"
                    ? (() => { try { return JSON.parse(cls.selected_loads); } catch { return []; } })()
                    : [];
                  const calStatus = cls.calibration_status === "completed"
                    ? (cls.calibration_passed ? "CALIBRATED" : "FAILED")
                    : (cls.calibration_status?.toUpperCase() || "PENDING");
                  const calColor = cls.calibration_passed ? "#4cceac" : cls.calibration_status === "pending" ? "#6870fa" : "#f44336";
                  const totalPower = cls.total_expected_power || 0;
                  const totalCurrent = cls.total_expected_current || 0;

                  return (
                    <Box key={cls.id || idx} mb={3}>
                      {/* Classification Card Header */}
                      <Box
                        display="flex" justifyContent="space-between" alignItems="center"
                        p={2} sx={{ backgroundColor: colors.primary[500], borderRadius: "8px 8px 0 0", borderBottom: `3px solid ${calColor}` }}
                      >
                        <Box display="flex" alignItems="center" gap={2}>
                          <Box sx={{ width: 48, height: 48, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: `${calColor}22`, border: `2px solid ${calColor}` }}>
                            <HomeOutlined sx={{ color: calColor, fontSize: 24 }} />
                          </Box>
                          <Box>
                            <Typography variant="h6" fontWeight="bold" color={colors.grey[100]}>
                              {cls.classification_type || "Unclassified"}
                            </Typography>
                            <Typography variant="caption" color={colors.grey[400]}>
                              {cls.date_time ? formatDateTime(cls.date_time) : "---"}
                              {cls.technician_name ? ` | Technician: ${cls.technician_name}` : ""}
                            </Typography>
                          </Box>
                        </Box>
                        <Chip
                          label={calStatus}
                          sx={{ backgroundColor: `${calColor}22`, color: calColor, fontWeight: 700, fontSize: "0.75rem", px: 1, border: `1px solid ${calColor}44` }}
                        />
                      </Box>

                      {/* Power Metrics Cards */}
                      <Box sx={{ backgroundColor: colors.primary[500], p: 2, borderRadius: "0 0 0 0" }}>
                        <Grid container spacing={1.5}>
                          <Grid item xs={6} sm={3}>
                            <Box sx={{ backgroundColor: colors.primary[400], borderRadius: 2, p: 1.5, textAlign: "center", border: "1px solid rgba(129,140,248,0.2)" }}>
                              <Typography variant="caption" color={colors.grey[400]}>Expected Power</Typography>
                              <Typography variant="h5" fontWeight="bold" color="#818CF8">
                                {totalPower >= 1000 ? `${(totalPower / 1000).toFixed(1)}` : Number(totalPower).toFixed(0)}
                              </Typography>
                              <Typography variant="caption" color={colors.grey[400]}>{totalPower >= 1000 ? "kW" : "W"}</Typography>
                            </Box>
                          </Grid>
                          <Grid item xs={6} sm={3}>
                            <Box sx={{ backgroundColor: colors.primary[400], borderRadius: 2, p: 1.5, textAlign: "center", border: "1px solid rgba(76,206,172,0.2)" }}>
                              <Typography variant="caption" color={colors.grey[400]}>Expected Current</Typography>
                              <Typography variant="h5" fontWeight="bold" color="#4cceac">
                                {Number(totalCurrent).toFixed(1)}
                              </Typography>
                              <Typography variant="caption" color={colors.grey[400]}>A</Typography>
                            </Box>
                          </Grid>
                          <Grid item xs={6} sm={3}>
                            <Box sx={{ backgroundColor: colors.primary[400], borderRadius: 2, p: 1.5, textAlign: "center", border: `1px solid ${cls.measured_power != null ? "rgba(255,152,0,0.2)" : "rgba(255,255,255,0.05)"}` }}>
                              <Typography variant="caption" color={colors.grey[400]}>Measured Power</Typography>
                              <Typography variant="h5" fontWeight="bold" color={cls.measured_power != null ? "#ff9800" : colors.grey[600]}>
                                {cls.measured_power != null ? Number(cls.measured_power).toFixed(0) : "--"}
                              </Typography>
                              <Typography variant="caption" color={colors.grey[400]}>W</Typography>
                            </Box>
                          </Grid>
                          <Grid item xs={6} sm={3}>
                            <Box sx={{ backgroundColor: colors.primary[400], borderRadius: 2, p: 1.5, textAlign: "center", border: `1px solid ${cls.power_deviation != null ? (cls.power_deviation <= 30 ? "rgba(76,206,172,0.2)" : "rgba(244,67,54,0.2)") : "rgba(255,255,255,0.05)"}` }}>
                              <Typography variant="caption" color={colors.grey[400]}>Deviation</Typography>
                              <Typography variant="h5" fontWeight="bold" color={cls.power_deviation != null ? (cls.power_deviation <= 30 ? "#4cceac" : "#f44336") : colors.grey[600]}>
                                {cls.power_deviation != null ? `${Number(cls.power_deviation).toFixed(1)}%` : "--"}
                              </Typography>
                              <Typography variant="caption" color={colors.grey[400]}>{cls.power_deviation != null ? (cls.power_deviation <= 30 ? "Within range" : "Out of range") : ""}</Typography>
                            </Box>
                          </Grid>
                        </Grid>

                        {/* Additional metrics row */}
                        {(cls.measured_voltage != null || cls.measured_current != null) && (
                          <Box display="flex" gap={2} mt={1.5} flexWrap="wrap">
                            {cls.measured_voltage != null && (
                              <Chip label={`Voltage: ${Number(cls.measured_voltage).toFixed(1)} V`} size="small" variant="outlined" sx={{ color: colors.grey[300], borderColor: colors.grey[600] }} />
                            )}
                            {cls.measured_current != null && (
                              <Chip label={`Measured Current: ${Number(cls.measured_current).toFixed(3)} A`} size="small" variant="outlined" sx={{ color: colors.grey[300], borderColor: colors.grey[600] }} />
                            )}
                            {cls.tester_app_version && (
                              <Chip label={`App: ${cls.tester_app_version}`} size="small" variant="outlined" sx={{ color: colors.grey[300], borderColor: colors.grey[600] }} />
                            )}
                          </Box>
                        )}
                      </Box>

                      {/* Household Loads Table */}
                      {loads.length > 0 && (
                        <Box sx={{ backgroundColor: colors.primary[500], p: 2, borderRadius: "0 0 8px 8px", borderTop: `1px solid ${colors.primary[600]}` }}>
                          <Typography variant="subtitle2" color={colors.grey[300]} fontWeight={700} mb={1}>
                            HOUSEHOLD LOADS ({loads.length} appliances)
                          </Typography>
                          <TableContainer sx={{ maxHeight: 300 }}>
                            <Table size="small" stickyHeader>
                              <TableHead>
                                <TableRow>
                                  {["Appliance", "Power (W)", "Current (A)", "Category"].map((h, hi) => (
                                    <TableCell
                                      key={h}
                                      align={hi > 0 && hi < 3 ? "right" : "left"}
                                      sx={{
                                        backgroundColor: colors.primary[400],
                                        color: colors.greenAccent[500],
                                        fontSize: "0.72rem",
                                        fontWeight: 700,
                                        py: 0.8,
                                        borderBottom: `2px solid ${colors.greenAccent[700]}`,
                                      }}
                                    >
                                      {h}
                                    </TableCell>
                                  ))}
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {loads.map((load, li) => (
                                  <TableRow key={li} sx={{ "&:hover": { backgroundColor: "rgba(255,255,255,0.03)" } }}>
                                    <TableCell sx={{ color: colors.grey[100], fontSize: "0.78rem", fontWeight: 500, py: 0.6, borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
                                      {load.name}
                                    </TableCell>
                                    <TableCell align="right" sx={{ color: "#818CF8", fontSize: "0.78rem", fontWeight: 600, py: 0.6, borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
                                      {load.powerRating}
                                    </TableCell>
                                    <TableCell align="right" sx={{ color: colors.greenAccent[400], fontSize: "0.78rem", fontWeight: 600, py: 0.6, borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
                                      {load.currentRating}
                                    </TableCell>
                                    <TableCell sx={{ color: colors.grey[400], fontSize: "0.72rem", py: 0.6, borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
                                      <Chip label={load.category || "General"} size="small" sx={{ fontSize: "0.65rem", height: 20, backgroundColor: "rgba(129,140,248,0.1)", color: colors.grey[300] }} />
                                    </TableCell>
                                  </TableRow>
                                ))}
                                {/* Totals row */}
                                <TableRow>
                                  <TableCell sx={{ color: colors.grey[100], fontSize: "0.78rem", fontWeight: 700, py: 0.8, borderTop: `2px solid ${colors.primary[600]}` }}>
                                    Total ({loads.length})
                                  </TableCell>
                                  <TableCell align="right" sx={{ color: "#818CF8", fontSize: "0.78rem", fontWeight: 700, py: 0.8, borderTop: `2px solid ${colors.primary[600]}` }}>
                                    {loads.reduce((s, l) => s + (Number(l.powerRating) || 0), 0)}
                                  </TableCell>
                                  <TableCell align="right" sx={{ color: colors.greenAccent[400], fontSize: "0.78rem", fontWeight: 700, py: 0.8, borderTop: `2px solid ${colors.primary[600]}` }}>
                                    {loads.reduce((s, l) => s + (Number(l.currentRating) || 0), 0).toFixed(1)}
                                  </TableCell>
                                  <TableCell sx={{ py: 0.8, borderTop: `2px solid ${colors.primary[600]}` }} />
                                </TableRow>
                              </TableBody>
                            </Table>
                          </TableContainer>

                          {cls.notes && (
                            <Box mt={1.5} p={1.5} sx={{ backgroundColor: colors.primary[400], borderRadius: 1, borderLeft: `3px solid ${colors.grey[600]}` }}>
                              <Typography variant="caption" color={colors.grey[400]} fontWeight={600}>Notes</Typography>
                              <Typography variant="body2" color={colors.grey[200]} sx={{ fontStyle: "italic", mt: 0.3 }}>{cls.notes}</Typography>
                            </Box>
                          )}
                        </Box>
                      )}
                    </Box>
                  );
                })
              ) : (
                <Typography
                  color="rgba(255,255,255,0.35)"
                  sx={{ textAlign: "center", py: 4 }}
                >
                  No home classification records found for this meter. Use the
                  GRIDx Maintenance app to classify the home&apos;s electrical loads
                  and run a calibration.
                </Typography>
              )}
            </Box>
          </Box>
        </Box>
      )}

      {/* ================================================================ */}
      {/* TAB 9: Meter Health                                              */}
      {/* ================================================================ */}
      {tab === 9 && (
        <Box>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6" fontWeight="bold" color={colors.grey[100]}>Meter Health</Typography>
            <Button
              variant="contained"
              startIcon={healthLoading ? <CircularProgress size={16} color="inherit" /> : <FavoriteBorderOutlined />}
              disabled={healthLoading}
              onClick={async () => {
                setHealthLoading(true);
                try {
                  const [latest, history] = await Promise.allSettled([
                    meterHealthAPI.getLatest(drn),
                    meterHealthAPI.getHistory(drn, 72),
                  ]);
                  if (latest.status === "fulfilled") setHealthData(latest.value?.data || latest.value);
                  if (history.status === "fulfilled") setHealthHistory(history.value?.data || []);
                  setSnackbar({ open: true, message: healthData ? "Health data refreshed" : "No health data available yet", severity: healthData ? "success" : "info" });
                } catch (e) {
                  setSnackbar({ open: true, message: "Failed to fetch health data", severity: "error" });
                }
                setHealthLoading(false);
              }}
              sx={{
                textTransform: "none",
                backgroundColor: colors.greenAccent[700],
                "&:hover": { backgroundColor: colors.greenAccent[600] },
              }}
            >
              {healthLoading ? "Checking..." : "Run Health Check"}
            </Button>
          </Box>
          {healthLoading && <LinearProgress sx={{ mb: 2, "& .MuiLinearProgress-bar": { backgroundColor: "#e91e63" } }} />}
          {healthData ? (() => {
            const score = healthData.health_score ?? 0;
            const scoreColor = score >= 80 ? "#00e676" : score >= 50 ? "#ffab00" : "#ff1744";
            const scoreBg = score >= 80 ? "rgba(0,230,118,0.08)" : score >= 50 ? "rgba(255,171,0,0.08)" : "rgba(255,23,68,0.08)";
            const scoreLabel = score >= 80 ? "GOOD" : score >= 50 ? "WARNING" : "CRITICAL";
            const scoreGlow = score >= 80 ? "0 0 40px rgba(0,230,118,0.3)" : score >= 50 ? "0 0 40px rgba(255,171,0,0.3)" : "0 0 40px rgba(255,23,68,0.3)";
            return (
              <Box>
                {/* Header */}
                <Box display="flex" alignItems="center" flexWrap="wrap" gap={2} mb={3}>
                  <Box sx={{ width: 40, height: 40, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: scoreBg, border: `2px solid ${scoreColor}` }}>
                    <FavoriteBorderOutlined sx={{ color: scoreColor, fontSize: 22 }} />
                  </Box>
                  <Typography variant="h5" fontWeight="bold" color={colors.grey[100]}>Meter Health Report</Typography>
                  <Chip label={scoreLabel} size="small" sx={{ backgroundColor: scoreColor, color: "#000", fontWeight: 800, letterSpacing: 1, px: 1 }} />
                  {healthData.firmware && <Chip label={`FW: ${healthData.firmware}`} size="small" sx={{ backgroundColor: "rgba(104,112,250,0.15)", color: "#868dfb", border: "1px solid rgba(104,112,250,0.4)", fontWeight: 600 }} />}
                  {healthData.uptime_seconds && <Chip label={`Uptime: ${Math.floor(healthData.uptime_seconds / 3600)}h`} size="small" sx={{ backgroundColor: "rgba(33,150,243,0.15)", color: "#64b5f6", border: "1px solid rgba(33,150,243,0.4)", fontWeight: 600 }} />}
                </Box>

                <Grid container spacing={2.5}>
                  {/* Score gauge */}
                  <Grid item xs={12} md={4}>
                    <Box sx={{
                      background: `linear-gradient(145deg, ${colors.primary[400]} 0%, ${colors.primary[500]} 100%)`,
                      borderRadius: 3, p: 4, textAlign: "center",
                      border: `1px solid ${scoreColor}33`,
                      boxShadow: scoreGlow,
                      position: "relative", overflow: "hidden",
                    }}>
                      {/* Subtle radial glow behind the gauge */}
                      <Box sx={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 200, height: 200, borderRadius: "50%", background: `radial-gradient(circle, ${scoreColor}15 0%, transparent 70%)` }} />
                      <Box sx={{ position: "relative", display: "inline-flex", mb: 2 }}>
                        {/* Track ring */}
                        <CircularProgress variant="determinate" value={100} size={160} thickness={5} sx={{ color: colors.primary[600], position: "absolute" }} />
                        {/* Score ring */}
                        <CircularProgress variant="determinate" value={score} size={160} thickness={5} sx={{ color: scoreColor, "& .MuiCircularProgress-circle": { strokeLinecap: "round", filter: `drop-shadow(0 0 6px ${scoreColor})` } }} />
                        <Box sx={{ position: "absolute", top: 0, left: 0, bottom: 0, right: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
                          <Typography variant="h2" fontWeight="900" color={scoreColor} sx={{ lineHeight: 1, textShadow: `0 0 20px ${scoreColor}55` }}>{score}</Typography>
                          <Typography variant="caption" color={colors.grey[400]} fontWeight={600}>/ 100</Typography>
                        </Box>
                      </Box>
                      <Typography variant="subtitle1" color={colors.grey[100]} fontWeight={700} letterSpacing={1}>Health Score</Typography>
                      <Typography variant="caption" color={colors.grey[400]}>Overall meter condition</Typography>
                    </Box>

                    {/* Status indicators below gauge */}
                    <Box mt={2} display="flex" gap={1}>
                      {[
                        { label: "Mains", on: healthData.mains_state, icon: <PowerSettingsNewOutlined sx={{ fontSize: 16 }} /> },
                        { label: "Geyser", on: healthData.geyser_state, icon: <HotTub sx={{ fontSize: 16 }} /> },
                      ].map((s) => (
                        <Box key={s.label} sx={{
                          flex: 1, borderRadius: 2, p: 1.5, textAlign: "center",
                          backgroundColor: s.on ? "rgba(0,230,118,0.1)" : "rgba(255,23,68,0.1)",
                          border: `1px solid ${s.on ? "rgba(0,230,118,0.4)" : "rgba(255,23,68,0.4)"}`,
                        }}>
                          <Box display="flex" alignItems="center" justifyContent="center" gap={0.5}>
                            <Box sx={{ color: s.on ? "#00e676" : "#ff1744" }}>{s.icon}</Box>
                            <Typography variant="caption" color={colors.grey[300]} fontWeight={600}>{s.label}</Typography>
                          </Box>
                          <Typography variant="subtitle2" fontWeight="bold" color={s.on ? "#00e676" : "#ff1744"} mt={0.5}>{s.on ? "ON" : "OFF"}</Typography>
                        </Box>
                      ))}
                    </Box>
                  </Grid>

                  {/* Power readings + Error counters */}
                  <Grid item xs={12} md={8}>
                    <Typography variant="overline" color={colors.grey[400]} fontWeight={700} letterSpacing={2} mb={1} display="block">Live Readings</Typography>
                    <Grid container spacing={1.5}>
                      {[
                        { label: "Voltage", value: healthData.voltage, unit: "V", color: "#00e676", bg: "rgba(0,230,118,0.08)", icon: <BoltOutlined sx={{ fontSize: 20 }} /> },
                        { label: "Current", value: healthData.current_a, unit: "A", color: "#768fff", bg: "rgba(118,143,255,0.08)", icon: <ElectricalServicesOutlined sx={{ fontSize: 20 }} /> },
                        { label: "Power", value: healthData.active_power, unit: "W", color: "#ffab00", bg: "rgba(255,171,0,0.08)", icon: <PowerOutlined sx={{ fontSize: 20 }} /> },
                        { label: "Temperature", value: healthData.temperature, unit: "°C", color: "#ff6e40", bg: "rgba(255,110,64,0.08)", icon: <ThermostatOutlined sx={{ fontSize: 20 }} /> },
                        { label: "Frequency", value: healthData.frequency, unit: "Hz", color: "#40c4ff", bg: "rgba(64,196,255,0.08)", icon: <GraphicEqOutlined sx={{ fontSize: 20 }} /> },
                        { label: "Power Factor", value: healthData.power_factor, unit: "", color: "#ea80fc", bg: "rgba(234,128,252,0.08)", icon: <SpeedOutlined sx={{ fontSize: 20 }} /> },
                      ].map((stat) => (
                        <Grid item xs={6} sm={4} key={stat.label}>
                          <Box sx={{
                            background: `linear-gradient(135deg, ${stat.bg} 0%, ${colors.primary[500]} 100%)`,
                            borderRadius: 2, p: 2,
                            border: `1px solid ${stat.color}30`,
                            transition: "all 0.2s ease",
                            "&:hover": { border: `1px solid ${stat.color}60`, transform: "translateY(-2px)", boxShadow: `0 4px 20px ${stat.color}15` },
                          }}>
                            <Box display="flex" alignItems="center" gap={1} mb={1}>
                              <Box sx={{ color: stat.color, opacity: 0.7 }}>{stat.icon}</Box>
                              <Typography variant="caption" color={colors.grey[400]} fontWeight={600}>{stat.label}</Typography>
                            </Box>
                            <Typography variant="h5" fontWeight="800" color={stat.color}>
                              {stat.value != null ? stat.value : "-"}
                              {stat.value != null && stat.unit && <Typography component="span" variant="body2" color={colors.grey[400]} ml={0.5}>{stat.unit}</Typography>}
                            </Typography>
                          </Box>
                        </Grid>
                      ))}
                    </Grid>

                    {/* Error counters */}
                    <Typography variant="overline" color={colors.grey[400]} fontWeight={700} letterSpacing={2} mt={2.5} mb={1} display="block">Diagnostics</Typography>
                    <Grid container spacing={1.5}>
                      {[
                        { label: "UART Errors", value: healthData.uart_errors, color: "#ff1744", bg: "rgba(255,23,68,0.06)" },
                        { label: "Relay Mismatches", value: healthData.relay_mismatches, color: "#ffab00", bg: "rgba(255,171,0,0.06)" },
                        { label: "Power Anomalies", value: healthData.power_anomalies, color: "#ea80fc", bg: "rgba(234,128,252,0.06)" },
                      ].map((err) => {
                        const hasError = (err.value ?? 0) > 0;
                        return (
                          <Grid item xs={4} key={err.label}>
                            <Box sx={{
                              background: hasError ? err.bg : colors.primary[500],
                              borderRadius: 2, p: 2, textAlign: "center",
                              border: `1px solid ${hasError ? `${err.color}50` : colors.primary[600]}`,
                              position: "relative", overflow: "hidden",
                            }}>
                              {hasError && <Box sx={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, backgroundColor: err.color, opacity: 0.8 }} />}
                              <Typography variant="caption" color={colors.grey[400]} fontWeight={600}>{err.label}</Typography>
                              <Typography variant="h4" fontWeight="900" color={hasError ? err.color : colors.grey[500]} sx={{ textShadow: hasError ? `0 0 10px ${err.color}40` : "none" }}>{err.value ?? 0}</Typography>
                            </Box>
                          </Grid>
                        );
                      })}
                    </Grid>
                  </Grid>
                </Grid>

                {/* Health trend chart */}
                {healthHistory.length > 1 && (
                  <Box mt={3} sx={{
                    background: `linear-gradient(145deg, ${colors.primary[400]} 0%, ${colors.primary[500]} 100%)`,
                    borderRadius: 3, p: 3,
                    border: `1px solid ${colors.primary[600]}`,
                  }}>
                    <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                      <Box display="flex" alignItems="center" gap={1}>
                        <BarChartOutlined sx={{ color: "#00e676", fontSize: 20 }} />
                        <Typography variant="subtitle1" color={colors.grey[100]} fontWeight={700}>Health Score Trend</Typography>
                      </Box>
                      <Chip label={`${healthHistory.length} readings`} size="small" sx={{ backgroundColor: "rgba(0,230,118,0.1)", color: "#00e676", fontWeight: 600, fontSize: 11 }} />
                    </Box>
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={healthHistory.slice().reverse().map((h) => ({ time: new Date(h.created_at).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }), score: h.health_score }))}>
                        <defs>
                          <linearGradient id="healthGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#00e676" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="#00e676" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={colors.primary[600]} opacity={0.5} />
                        <XAxis dataKey="time" tick={{ fill: colors.grey[400], fontSize: 10 }} axisLine={{ stroke: colors.primary[600] }} />
                        <YAxis domain={[0, 100]} tick={{ fill: colors.grey[400], fontSize: 10 }} axisLine={{ stroke: colors.primary[600] }} />
                        <RechartsTooltip contentStyle={{ backgroundColor: colors.primary[400], border: `1px solid ${colors.primary[600]}`, borderRadius: 8, color: colors.grey[100] }} />
                        <Area type="monotone" dataKey="score" stroke="#00e676" strokeWidth={2.5} fill="url(#healthGradient)" dot={false} activeDot={{ r: 5, fill: "#00e676", stroke: colors.primary[400], strokeWidth: 2 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </Box>
                )}

                {healthData.created_at && (
                  <Box mt={2} display="flex" alignItems="center" gap={1}>
                    <Box sx={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#00e676", boxShadow: "0 0 8px rgba(0,230,118,0.5)" }} />
                    <Typography variant="caption" color={colors.grey[400]}>
                      Last updated: {new Date(healthData.created_at).toLocaleString("en-ZA")}
                    </Typography>
                  </Box>
                )}
              </Box>
            );
          })() : !healthLoading && (
            <Box sx={{ textAlign: "center", py: 8 }}>
              <FavoriteBorderOutlined sx={{ fontSize: 48, color: colors.grey[600], mb: 2 }} />
              <Typography color={colors.grey[400]}>
                No health data received yet. The meter sends health reports every hour via SIM800.
              </Typography>
            </Box>
          )}
        </Box>
      )}

      {/* ================================================================ */}
      {/* TAB 10: Relay Events                                             */}
      {/* ================================================================ */}
      {tab === 10 && (() => {
        const REASON_COLORS = ["#868dfb","#4cceac","#f44336","#ff9800","#2196f3","#ab47bc","#78909c","#e91e63","#ff5722"];
        const REASON_LABELS = ["Unknown","Manual Control","Credit Expired","Power Limit","Scheduled","Remote Command","System Startup","Tamper Detected","Overcurrent"];
        const fmtTime = (ts) => ts ? new Date(ts).toLocaleString("en-ZA", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "-";

        // Pie chart data from summary (supports both old and new API formats)
        const pieData = relaySummary?.byReason ? relaySummary.byReason :
          relaySummary?.summary ? Object.entries(
            relaySummary.summary.reduce((acc, s) => {
              const label = s.reason_name || REASON_LABELS[s.reason_code] || "Unknown";
              acc[label] = (acc[label] || 0) + (s.event_count || s.count || 0);
              return acc;
            }, {})
          ).map(([name, value]) => ({ name, value })) : [];

        return (
          <Box>
            {/* Header */}
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={1}>
              <Box display="flex" alignItems="center" gap={1}>
                <SwapVertOutlined sx={{ color: "#4cceac", fontSize: 28 }} />
                <Typography variant="h5" fontWeight="bold" color={colors.grey[100]}>Relay Event Log</Typography>
                {relayTotal > 0 && <Chip label={`${relayTotal} events`} size="small" sx={{ backgroundColor: colors.primary[500], color: colors.grey[100] }} />}
              </Box>
              <Box display="flex" gap={1} flexWrap="wrap">
                <ToggleButtonGroup size="small" value={relayFilter} exclusive onChange={(_, v) => { setRelayFilter(v === null ? "" : v); setRelayPage(0); }}
                  sx={{ "& .MuiToggleButton-root": { color: colors.grey[300], borderColor: colors.primary[600], textTransform: "none", "&.Mui-selected": { backgroundColor: colors.primary[500], color: colors.greenAccent[500] } } }}>
                  <ToggleButton value="">All</ToggleButton>
                  <ToggleButton value="0"><PowerOutlined sx={{ fontSize: 14, mr: 0.5 }} />Mains</ToggleButton>
                  <ToggleButton value="1"><HotTub sx={{ fontSize: 14, mr: 0.5 }} />Geyser</ToggleButton>
                </ToggleButtonGroup>
                <ToggleButtonGroup size="small" value={relayTypeFilter} exclusive onChange={(_, v) => { setRelayTypeFilter(v === null ? "" : v); setRelayPage(0); }}
                  sx={{ "& .MuiToggleButton-root": { color: colors.grey[300], borderColor: colors.primary[600], textTransform: "none", "&.Mui-selected": { backgroundColor: colors.primary[500], color: colors.greenAccent[500] } } }}>
                  <ToggleButton value="">All</ToggleButton>
                  <ToggleButton value="0"><SwapVertOutlined sx={{ fontSize: 14, mr: 0.5 }} />State</ToggleButton>
                  <ToggleButton value="1"><TuneOutlined sx={{ fontSize: 14, mr: 0.5 }} />Control</ToggleButton>
                </ToggleButtonGroup>
              </Box>
            </Box>

            {relayLoading && <LinearProgress sx={{ mb: 2 }} />}

            {/* Summary charts */}
            {pieData.length > 0 && (
              <Grid container spacing={2} mb={2}>
                <Grid item xs={12} md={6}>
                  <Box sx={{ backgroundColor: colors.primary[500], borderRadius: 2, p: 2, border: `1px solid ${colors.primary[600]}` }}>
                    <Typography variant="subtitle2" color={colors.grey[300]} mb={1}>Event Reasons (Last 7 Days)</Typography>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} >
                          {pieData.map((_, i) => <Cell key={i} fill={REASON_COLORS[i % REASON_COLORS.length]} />)}
                        </Pie>
                        <RechartsTooltip contentStyle={{ backgroundColor: colors.primary[400], border: "none", color: colors.grey[100] }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </Box>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Box sx={{ backgroundColor: colors.primary[500], borderRadius: 2, p: 2, border: `1px solid ${colors.primary[600]}` }}>
                    <Typography variant="subtitle2" color={colors.grey[300]} mb={1}>Event Breakdown</Typography>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={relaySummary?.byRelay ? relaySummary.byRelay.map(r => ({ name: r.name, count: (r.state || 0) + (r.control || 0) })) : [
                        { name: "Mains", count: relaySummary?.summary?.filter(s => s.relay_index === 0).reduce((sum, s) => sum + (s.event_count || s.count || 0), 0) || 0 },
                        { name: "Geyser", count: relaySummary?.summary?.filter(s => s.relay_index === 1).reduce((sum, s) => sum + (s.event_count || s.count || 0), 0) || 0 },
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" stroke={colors.primary[600]} />
                        <XAxis dataKey="name" tick={{ fill: colors.grey[400] }} />
                        <YAxis tick={{ fill: colors.grey[400] }} />
                        <RechartsTooltip contentStyle={{ backgroundColor: colors.primary[400], border: "none", color: colors.grey[100] }} />
                        <Bar dataKey="count" fill="#4cceac" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                </Grid>
              </Grid>
            )}

            {/* Events table */}
            <TableContainer sx={{ backgroundColor: colors.primary[500], borderRadius: 2, border: `1px solid ${colors.primary[600]}` }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {["Time", "Relay", "Type", "Action", "Reason", "Detail"].map((h) => (
                      <TableCell key={h} sx={{ color: colors.grey[300], fontWeight: 600, borderBottom: `1px solid ${colors.primary[600]}` }}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {relayEvents.length === 0 && !relayLoading ? (
                    <TableRow><TableCell colSpan={6} align="center"><Typography color={colors.grey[400]} py={3}>No relay events recorded yet</Typography></TableCell></TableRow>
                  ) : relayEvents.map((evt, i) => (
                    <TableRow key={evt.id || i} sx={{ "&:hover": { backgroundColor: colors.primary[600] }, "& td": { borderBottom: `1px solid ${colors.primary[600]}` } }}>
                      <TableCell sx={{ color: colors.grey[100], fontSize: 12, whiteSpace: "nowrap" }}>{fmtTime(evt.meter_timestamp || evt.received_at)}</TableCell>
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={0.5}>
                          {evt.relay_index === 0 ? <PowerOutlined sx={{ fontSize: 16, color: "#4cceac" }} /> : <HotTub sx={{ fontSize: 16, color: "#f4a261" }} />}
                          <Typography variant="body2" color={colors.grey[100]} fontWeight={500}>{evt.relay_name || (evt.relay_index === 0 ? "Mains" : "Geyser")}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip label={evt.entry_type === 0 ? "State" : "Control"} size="small" variant="outlined"
                          sx={{ color: evt.entry_type === 0 ? "#4cceac" : "#ab47bc", borderColor: evt.entry_type === 0 ? "#4cceac" : "#ab47bc", fontSize: 11 }} />
                      </TableCell>
                      <TableCell>
                        {evt.entry_type === 0 ? (
                          <Chip icon={evt.state ? <ToggleOn /> : <ToggleOff />} label={evt.state ? "ON" : "OFF"} size="small"
                            sx={{ backgroundColor: evt.state ? "#1b5e20" : "#b71c1c", color: "#fff", fontWeight: 600 }} />
                        ) : (
                          <Chip icon={evt.control ? <ToggleOn /> : <ToggleOff />} label={evt.control ? "ENABLED" : "DISABLED"} size="small"
                            sx={{ backgroundColor: evt.control ? "#0d47a1" : "#4a148c", color: "#fff", fontWeight: 600 }} />
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip label={evt.reason_name || REASON_LABELS[evt.reason_code] || "Unknown"} size="small"
                          sx={{ backgroundColor: REASON_COLORS[evt.reason_code] || "#868dfb", color: "#fff", fontSize: 11, fontWeight: 500 }} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color={colors.grey[200]} sx={{ fontSize: 12, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {evt.reason_text || "-"}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {relayTotal > 0 && (
              <TablePagination component="div" count={relayTotal} page={relayPage} onPageChange={(_, p) => setRelayPage(p)}
                rowsPerPage={relayRowsPerPage} onRowsPerPageChange={(e) => { setRelayRowsPerPage(parseInt(e.target.value, 10)); setRelayPage(0); }}
                rowsPerPageOptions={[10, 25, 50, 100]} sx={{ color: colors.grey[100] }} />
            )}
          </Box>
        );
      })()}

      {/* ---- Confirmation Dialog ---- */}
      <Dialog
        open={confirmDialog.open}
        onClose={() =>
          setConfirmDialog({ open: false, type: "", action: "" })
        }
        PaperProps={{
          sx: {
            backgroundColor: colors.primary[400],
            color: colors.grey[100],
          },
        }}
      >
        <DialogTitle>
          {confirmDialog.type?.startsWith("config_")
            ? `Confirm ${confirmDialog.action === "reset_ble" ? "Reset BLE PIN" : confirmDialog.action === "clear_auth" ? "Clear Authorized Numbers" : "Restart Meter"}`
            : `Confirm ${confirmDialog.type?.replace("_state", "").replace("mains", "Mains").replace("heater", "Heater")} ${confirmDialog.action === "enable" ? "Enable" : confirmDialog.action === "disable" ? "Disable" : confirmDialog.action === "on" ? "Turn ON" : "Turn OFF"}`
          }
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: colors.grey[100] }}>
            {confirmDialog.type?.startsWith("config_") ? (
              <>
                Are you sure you want to{" "}
                <strong>
                  {confirmDialog.action === "reset_ble" ? "reset the BLE PIN to default" : confirmDialog.action === "clear_auth" ? "clear all authorized numbers" : "restart the meter"}
                </strong>{" "}
                for meter <strong>{drn}</strong>?
                {confirmDialog.action === "restart_meter" && (
                  <>
                    <br /><br />
                    This will cause the meter to reboot. It may be temporarily offline.
                  </>
                )}
              </>
            ) : (
              <>
                Are you sure you want to{" "}
                <strong>
                  {confirmDialog.action === "enable" ? "enable" : confirmDialog.action === "disable" ? "disable" : confirmDialog.action === "on" ? "turn ON" : "turn OFF"}
                </strong>{" "}
                the{" "}
                <strong>
                  {confirmDialog.type?.includes("mains") ? "mains relay" : "heater relay"}
                </strong>{" "}
                for meter <strong>{drn}</strong>?
                <br />
                <br />
                Reason:{" "}
                <strong>
                  {confirmDialog.type?.includes("mains") ? mainsReason : heaterReason}
                </strong>
              </>
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() =>
              setConfirmDialog({ open: false, type: "", action: "" })
            }
            sx={{ color: colors.grey[400], textTransform: "none" }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (confirmDialog.type?.startsWith("config_")) {
                setConfirmDialog({ open: false, type: "", action: "" });
                handleConfigAction(confirmDialog.action);
              } else {
                handleConfirmLoadControl();
              }
            }}
            variant="contained"
            sx={{
              backgroundColor:
                confirmDialog.action === "enable" || confirmDialog.action === "on" || confirmDialog.action === "reset_ble" || confirmDialog.action === "clear_auth"
                  ? colors.greenAccent[700]
                  : "#db4f4a",
              "&:hover": {
                backgroundColor:
                  confirmDialog.action === "enable" || confirmDialog.action === "on" || confirmDialog.action === "reset_ble" || confirmDialog.action === "clear_auth"
                    ? colors.greenAccent[600]
                    : "#c0413c",
              },
              textTransform: "none",
            }}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      {/* ---- Snackbar ---- */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
