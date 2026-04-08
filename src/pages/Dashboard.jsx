import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography, useTheme, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, CircularProgress, Skeleton } from "@mui/material";
import { tokens } from "../theme";
import Header from "../components/Header";
import DataBadge from "../components/DataBadge";
import StatBox from "../components/StatBox";
import { meterAPI, tokenAPI, financeAPI, energyAPI, mqttAPI, meterHealthAPI } from "../services/api";
import ReactECharts from "echarts-for-react";
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
// Mock data removed — dashboard uses only real MQTT data
import ElectricBoltOutlinedIcon from "@mui/icons-material/ElectricBoltOutlined";
import BatteryChargingFullIcon from "@mui/icons-material/BatteryChargingFull";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import BoltIcon from "@mui/icons-material/Bolt";
import ElectricMeterOutlinedIcon from "@mui/icons-material/ElectricMeterOutlined";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import PowerOutlinedIcon from "@mui/icons-material/PowerOutlined";
import NotificationsOutlinedIcon from "@mui/icons-material/NotificationsOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import BarChartIcon from "@mui/icons-material/BarChart";
import SettingsInputCompositeIcon from "@mui/icons-material/SettingsInputComposite";
import ElectricalServicesIcon from "@mui/icons-material/ElectricalServices";
import FlashOnIcon from "@mui/icons-material/FlashOn";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
  ReferenceLine,
} from "recharts";

// All suburbs list for regional chart (ensures all regions shown even with 0 consumption)
const ALL_SUBURBS = [
  "Academia", "Auasblick", "Avis", "Cimbebasia", "Dorado Park", "Donkerhoek",
  "Elisenheim", "Eros", "Eros Park", "Freedom Land", "Goreangab", "Groot Aub",
  "Greenwell", "Hakahana", "Havana", "Hochland Park", "Katutura", "Khomasdal",
  "Kleine Kuppe", "Klein Windhoek", "Lafrenz", "Ludwigsdorf", "Luxury Hill",
  "Maxuilili", "Northern Industrial", "Okuryangava", "Olympia", "Ombili",
  "Otjomuise", "Pionierspark", "Prosperita", "Rocky Crest", "Southern Industria",
  "Suiderhof", "Tauben Glen", "Wanaheda", "Windhoek Central", "Windhoek North",
  "Windhoek West",
];

// ---- Helpers ----
const fmt = (n) => Number(n || 0).toLocaleString();
const fmtCurrency = (n) => `N$ ${Number(n || 0).toLocaleString()}`;

function formatTime(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

// Status chip color map
const statusColor = {
  Completed: "#4cceac",
  Failed: "#db4f4a",
  Reversed: "#f2b705",
  Pending: "#6870fa",
};

// Notification icon by type
const notifIcon = (type) => {
  switch (type) {
    case "Critical":
      return <ErrorOutlineIcon sx={{ color: "#db4f4a", fontSize: 18 }} />;
    case "Warning":
      return <WarningAmberIcon sx={{ color: "#f2b705", fontSize: 18 }} />;
    case "Success":
      return <CheckCircleOutlineIcon sx={{ color: "#4cceac", fontSize: 18 }} />;
    default:
      return <InfoOutlinedIcon sx={{ color: "#6870fa", fontSize: 18 }} />;
  }
};

export default function Dashboard() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const navigate = useNavigate();

  const [kpis, setKpis] = useState({
    totalMeters: 0, activeMeters: 0, inactiveMeters: 0, todayRevenue: 0,
    todayTokens: 0, systemLoad: 0, avgConsumption: 0, liveMeters: 0,
    offlineMeters: 0, avgPower: 0, peakPower: 0, avgVoltage: 0, reportingMeters: 0,
  });
  const [salesTrend, setSalesTrend] = useState([]);
  const [recentTxns, setRecentTxns] = useState([]);
  const [notifs, setNotifs] = useState(() => {
    try { return JSON.parse(localStorage.getItem("gridx_notifs") || "[]"); } catch (_) { return []; }
  });
  const [areaPower, setAreaPower] = useState([]);
  const [areaRevenue, setAreaRevenue] = useState([]);
  const [hourlyData, setHourlyData] = useState([]);
  const [hourlyTotals, setHourlyTotals] = useState({ averagePower: 0, peakPower: 0 });
  const [suburbEnergy, setSuburbEnergy] = useState({});
  const [hourlyTokenCounts, setHourlyTokenCounts] = useState([]);
  const [hourlyEnergyData, setHourlyEnergyData] = useState([]);
  const [totalRemainingUnits, setTotalRemainingUnits] = useState(0);
  const [meterHealthData, setMeterHealthData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const refreshRef = useRef(null);

  // Primary data source: single MQTT dashboard-stats endpoint (fast, real-time)
  const fetchMqttStats = useCallback(async () => {
    try {
      const stats = await mqttAPI.getDashboardStats();
      if (!stats?.success) return;

      // Update KPIs from MQTT-derived data
      setKpis((prev) => ({
        ...prev,
        totalMeters: stats.kpis.totalMeters || prev.totalMeters,
        activeMeters: stats.kpis.liveMeters || prev.activeMeters,
        inactiveMeters: stats.kpis.offlineMeters || prev.inactiveMeters,
        systemLoad: stats.kpis.systemLoad || prev.systemLoad,
        todayRevenue: stats.tokens.todayRevenue || prev.todayRevenue,
        todayTokens: stats.tokens.todayCount || prev.todayTokens,
        avgConsumption: stats.energy.todayKwh || prev.avgConsumption,
        // Additional MQTT-specific KPIs
        liveMeters: stats.kpis.liveMeters || 0,
        offlineMeters: stats.kpis.offlineMeters || 0,
        avgPower: stats.power.avgPower || 0,
        peakPower: stats.power.peakPower || 0,
        avgVoltage: stats.power.avgVoltage || 0,
        reportingMeters: stats.power.reportingMeters || 0,
      }));

      // Hourly power chart from MQTT data
      // hourlyPower[i] = avgPower in Watts for that hour; convert to kWh (W * 1h / 1000)
      if (Array.isArray(stats.hourlyPower)) {
        const chartData = stats.hourlyPower.map((val, i) => ({
          hour: `${i < 10 ? "0" + i : i}:00`,
          kWh: Number(((Number(val) || 0) / 1000).toFixed(2)),
        }));
        setHourlyData(chartData);
        const vals = chartData.map((d) => d.kWh);
        const sum = vals.reduce((a, b) => a + b, 0);
        const avg = vals.length ? sum / vals.length : 0;
        setHourlyTotals({
          averagePower: stats.power.avgPower || 0,
          peakPower: stats.power.peakPower || 0,
        });
      }

      // Recent tokens from MQTT
      if (Array.isArray(stats.recentTokens) && stats.recentTokens.length > 0) {
        const channels = ["Console", "Touch Screen", "SMS", "BLE", "Server"];
        const txns = stats.recentTokens.map((t, i) => ({
          id: t.id || `TXN-${i}`,
          time: t.date_time || new Date().toISOString(),
          customer: t.DRN || "-",
          meterNo: t.DRN || "-",
          amount: parseFloat(t.token_amount || 0),
          channel: channels[parseInt(t.submission_Method)] || t.submission_Method || "-",
          token: t.token_id || "-",
          status: (t.display_msg || "").toLowerCase().includes("accept") ? "Accepted"
            : (t.display_msg || "").toLowerCase().includes("reject") || (t.display_msg || "").toLowerCase().includes("not authentic") || (t.display_msg || "").toLowerCase().includes("error") ? "Rejected"
            : t.display_msg || "Unknown",
        }));
        setRecentTxns(txns);
      }

      // Hourly token counts — map to chart-compatible field names
      if (Array.isArray(stats.hourlyTokens)) {
        const hTokens = stats.hourlyTokens
          .map((v, i) => {
            const obj = typeof v === "object" ? v : { count: 0, revenue: 0 };
            return {
              label: `${i < 10 ? "0" + i : i}:00`,
              tokens: obj.count || 0,
              amount: obj.revenue || 0,
            };
          })
          .filter((v) => v.tokens > 0);
        if (hTokens.length > 0) setHourlyTokenCounts(hTokens);
      }

      // Remaining units
      if (stats.credits) {
        setTotalRemainingUnits(stats.credits.totalRemainingUnits || 0);
      }

      // Build notifications from live data
      const newNotifs = [];
      let nid = 0;
      const ts = new Date().toISOString();
      // Offline meters
      if (stats.kpis.offlineMeters > 0) {
        newNotifs.push({ id: ++nid, type: "warning", title: `${stats.kpis.offlineMeters} Meter${stats.kpis.offlineMeters > 1 ? "s" : ""} Offline`, message: `${stats.kpis.offlineMeters} meter${stats.kpis.offlineMeters > 1 ? "s have" : " has"} not reported data in over 5 minutes`, timestamp: ts });
      }
      // Meters with no data (registered but never reported)
      const noDataCount = (stats.kpis.totalMeters || 0) - (stats.kpis.totalTracked || 0);
      if (noDataCount > 0) {
        newNotifs.push({ id: ++nid, type: "error", title: `${noDataCount} Meter${noDataCount > 1 ? "s" : ""} — No Data`, message: `${noDataCount} registered meter${noDataCount > 1 ? "s have" : " has"} never sent any data`, timestamp: ts });
      }
      // Tamper detection from health data (also rebuilt in useEffect when meterHealthData loads)
      if (meterHealthData.length > 0) {
        const suspicious = meterHealthData.filter(m => m.status === "suspicious");
        const warning = meterHealthData.filter(m => m.status === "warning");
        suspicious.forEach(m => {
          newNotifs.push({ id: ++nid, type: "error", title: `Tamper Alert: ${m.drn}`, drn: m.drn, message: `${m.name ? m.name + " — " : ""}Health score ${m.healthScore}/100. Flags: ${m.flags.join(", ")}`, timestamp: m.lastSeen || ts });
        });
        warning.forEach(m => {
          newNotifs.push({ id: ++nid, type: "warning", title: `Warning: ${m.drn}`, drn: m.drn, message: `${m.name ? m.name + " — " : ""}Health score ${m.healthScore}/100. ${m.flags.join(", ")}`, timestamp: m.lastSeen || ts });
        });
      }
      // Low voltage alerts
      if (stats.power.avgVoltage > 0 && stats.power.avgVoltage < 210) {
        newNotifs.push({ id: ++nid, type: "warning", title: "Low System Voltage", message: `Average voltage ${stats.power.avgVoltage.toFixed(1)}V is below normal range (220-240V)`, timestamp: ts });
      }
      // High power alert
      if (stats.power.peakPower > 4000) {
        newNotifs.push({ id: ++nid, type: "info", title: "High Peak Power", message: `Peak power reached ${stats.power.peakPower.toFixed(0)}W across meters`, timestamp: ts });
      }
      // Success notifications
      if (stats.kpis.liveMeters > 0) {
        newNotifs.push({ id: ++nid, type: "success", title: `${stats.kpis.liveMeters} Meter${stats.kpis.liveMeters > 1 ? "s" : ""} Online`, message: "Active MQTT connections reporting real-time data", timestamp: ts });
      }
      if (stats.tokens.todayCount > 0) {
        newNotifs.push({ id: ++nid, type: "success", title: `${stats.tokens.todayCount} Tokens Today`, message: `${stats.tokens.todayRevenue.toFixed(1)} kWh purchased across all meters`, timestamp: ts });
      }
      // Persist and set
      if (newNotifs.length > 0) {
        try { localStorage.setItem("gridx_notifs", JSON.stringify(newNotifs)); } catch (_) {}
        setNotifs(newNotifs);
      }

      // Hourly energy consumption (kWh per hour)
      if (Array.isArray(stats.hourlyEnergy)) {
        const eData = stats.hourlyEnergy.map((val, i) => ({
          hour: `${i < 10 ? "0" + i : i}:00`,
          kWh: Number(val) || 0,
        }));
        setHourlyEnergyData(eData);
      }

      setLastUpdate(new Date());
    } catch (e) {
      console.error("MQTT dashboard fetch:", e);
    }
    setLoading(false);
  }, []);

  // Secondary: slower chart data (suburb energy, weekly trends, area summary)
  const fetchSlowCharts = useCallback(async () => {
    const withTimeout = (promise, ms = 8000) =>
      Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);

    // Week trend — aggregated daily token data (Mon → Sun ordering)
    withTimeout(financeAPI.getPastWeekTokens()).then((val) => {
      if (Array.isArray(val)) {
        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const trend = val.map((item) => {
          const d = new Date(item.date || item.Date);
          return {
            day: dayNames[d.getDay()] || "?",
            dayIdx: d.getDay(), // 0=Sun, 1=Mon, ..., 6=Sat
            fullDate: d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" }),
            revenue: parseFloat(item.accepted_amount || item.total_amount || 0),
            tokens: parseInt(item.accepted_count || item.token_count || 0, 10),
            kWh: parseFloat(item.accepted_amount || item.total_amount || 0),
          };
        });
        // Sort Mon(1) → Sun(0): shift Sun to end
        trend.sort((a, b) => ((a.dayIdx || 7) % 7 || 7) - ((b.dayIdx || 7) % 7 || 7));
        if (trend.length > 0) setSalesTrend(trend);
      }
    }).catch(() => {});

    // Area summary
    withTimeout(meterAPI.getAreaSummary()).then((val) => {
      if (val) {
        if (Array.isArray(val.areaPower)) setAreaPower(val.areaPower);
        if (Array.isArray(val.areaRevenue)) setAreaRevenue(val.areaRevenue);
      }
    }).catch(() => {});

    // Suburb energy
    withTimeout(energyAPI.getSuburbHourlyEnergy(ALL_SUBURBS), 10000).then((val) => {
      const sData = val?.data || val;
      if (typeof sData === "object" && !Array.isArray(sData)) {
        const fullData = {};
        ALL_SUBURBS.forEach((s) => { fullData[s] = Number(sData[s]) || 0; });
        setSuburbEnergy(fullData);
      }
    }).catch(() => {});

    // Meter health summary for scatter chart
    withTimeout(meterHealthAPI.getAllSummary(), 12000).then((val) => {
      if (val?.data && Array.isArray(val.data)) setMeterHealthData(val.data);
    }).catch(() => {});
  }, []);

  // Rebuild tamper/warning notifications when meterHealthData loads asynchronously
  useEffect(() => {
    if (meterHealthData.length === 0) return;
    setNotifs(prev => {
      // Remove old tamper/warning entries (they have drn field)
      const filtered = prev.filter(n => !n.drn);
      let nid = Math.max(0, ...prev.map(n => n.id || 0));
      const suspicious = meterHealthData.filter(m => m.status === "suspicious");
      const warning = meterHealthData.filter(m => m.status === "warning");
      const healthNotifs = [];
      suspicious.forEach(m => {
        healthNotifs.push({ id: ++nid, type: "error", title: `Tamper Alert: ${m.drn}`, drn: m.drn, message: `${m.name ? m.name + " — " : ""}Health score ${m.healthScore}/100. Flags: ${m.flags.join(", ")}`, timestamp: m.lastSeen || new Date().toISOString() });
      });
      warning.forEach(m => {
        healthNotifs.push({ id: ++nid, type: "warning", title: `Warning: ${m.drn}`, drn: m.drn, message: `${m.name ? m.name + " — " : ""}Health score ${m.healthScore}/100. ${m.flags.join(", ")}`, timestamp: m.lastSeen || new Date().toISOString() });
      });
      // Put health alerts at the top
      const merged = [...healthNotifs, ...filtered];
      try { localStorage.setItem("gridx_notifs", JSON.stringify(merged)); } catch (_) {}
      return merged;
    });
  }, [meterHealthData]);

  useEffect(() => {
    // Initial load: fast MQTT stats first, then slow charts
    fetchMqttStats();
    fetchSlowCharts();

    // Auto-refresh MQTT stats every 30 seconds for real-time dashboard
    refreshRef.current = setInterval(fetchMqttStats, 30000);
    return () => clearInterval(refreshRef.current);
  }, [fetchMqttStats, fetchSlowCharts]);

  return (
    <Box m="20px">
      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Header title="DASHBOARD" subtitle="Meters Network Summary — MQTT Real-Time" />
        <Box display="flex" gap={0.5} alignItems="center">
          <DataBadge live />
          {lastUpdate && (
            <Typography variant="caption" sx={{ color: colors.grey[400], fontSize: "0.65rem" }}>
              Auto-refresh 30s
            </Typography>
          )}
        </Box>
      </Box>

      <Box
        display="grid"
        gridTemplateColumns="repeat(12, 1fr)"
        gridAutoRows="140px"
        gap="5px"
      >
        {/* ROW 1: 4 Stat Boxes */}
        {/* ROW 1a: 4 Meter Status Boxes (MQTT live data) */}
        <Box
          gridColumn="span 3"
          backgroundColor={colors.primary[400]}
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <StatBox
            title={fmt(kpis.totalMeters)}
            subtitle="Total Meters"
            progress={kpis.totalMeters > 0 ? String(Math.min(1, (kpis.liveMeters || kpis.activeMeters) / kpis.totalMeters)) : "0"}
            increase={kpis.reportingMeters ? `${kpis.reportingMeters} reporting` : ""}
            link="/meters"
            icon={
              <ElectricMeterOutlinedIcon
                sx={{ color: colors.greenAccent[500], fontSize: "26px" }}
              />
            }
          />
        </Box>

        <Box
          gridColumn="span 3"
          backgroundColor={colors.primary[400]}
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <StatBox
            title={fmt(kpis.liveMeters || kpis.activeMeters)}
            subtitle="Live Meters"
            progress={kpis.totalMeters > 0 ? String((kpis.liveMeters || kpis.activeMeters) / kpis.totalMeters) : "0"}
            increase="via MQTT"
            link="/meters"
            icon={
              <ElectricBoltOutlinedIcon
                sx={{ color: "#4cceac", fontSize: "26px" }}
              />
            }
          />
        </Box>

        <Box
          gridColumn="span 3"
          backgroundColor={colors.primary[400]}
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <StatBox
            title={fmt(kpis.offlineMeters || kpis.inactiveMeters)}
            subtitle="Offline Meters"
            progress={kpis.totalMeters > 0 ? String((kpis.offlineMeters || kpis.inactiveMeters) / kpis.totalMeters) : "0"}
            increase="no signal > 5m"
            link="/meters"
            icon={
              <BatteryChargingFullIcon
                sx={{ color: "#db4f4a", fontSize: "26px" }}
              />
            }
          />
        </Box>

        <Box
          gridColumn="span 3"
          backgroundColor={colors.primary[400]}
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <StatBox
            title={`${kpis.peakPower ? kpis.peakPower.toFixed(0) : "0"} W`}
            subtitle="Current System Load"
            progress={String(Math.min(1, (kpis.peakPower || 0) / 10000))}
            increase={kpis.reportingMeters ? `${kpis.reportingMeters} meter${kpis.reportingMeters > 1 ? "s" : ""} reporting` : ""}
            link="/"
            icon={
              <BoltIcon
                sx={{ color: colors.greenAccent[500], fontSize: "26px" }}
              />
            }
          />
        </Box>

        {/* ROW 1b removed — only 4 main cards above */}

        {/* ROW 2: Regional Consumption Chart (Suburban Energy Analytics) */}
        {(() => {
          const suburbEntries = Object.entries(suburbEnergy);
          const suburbValues = suburbEntries.map(([, v]) => Number(v) || 0);
          const suburbTotal = suburbValues.reduce((a, v) => a + v, 0);
          const suburbAvg = suburbValues.length ? suburbTotal / suburbValues.length : 0;
          const maxEntry = suburbEntries.length
            ? suburbEntries.reduce((p, c) => ((Number(c[1]) || 0) > (Number(p[1]) || 0) ? c : p))
            : null;
          const minEntry = suburbEntries.length
            ? suburbEntries.reduce((p, c) => ((Number(c[1]) || 0) < (Number(p[1]) || 0) ? c : p))
            : null;
          const suburbChartData = suburbEntries.map(([name, value]) => ({
            suburb: name,
            kWh: Number(value) || 0,
          }));

          return (
            <Box
              gridColumn="span 12"
              gridRow="span 4"
              backgroundColor={colors.primary[400]}
              p="15px"
            >
              <Box display="flex" alignItems="center" gap={1} mb="10px">
                <MapOutlinedIcon sx={{ color: colors.greenAccent[500], fontSize: 20 }} />
                <Typography variant="h5" fontWeight="600" color={colors.grey[100]}>
                  Suburban Energy Analytics
                </Typography>
                <DataBadge live sx={{ ml: "auto" }} />
              </Box>

              {/* Stats Header */}
              <Box sx={{
                display: "flex",
                justifyContent: "space-around",
                backgroundColor: colors.primary[500],
                borderRadius: "8px",
                p: 1.5,
                mb: 2,
                gap: 2,
                flexWrap: "wrap",
              }}>
                <Box sx={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <TrendingUpIcon sx={{ color: colors.greenAccent[500], fontSize: "2rem", mb: 0.5 }} />
                  <Typography variant="h5" sx={{ color: colors.greenAccent[500], fontWeight: 700 }}>
                    {maxEntry ? `${Number(maxEntry[1]).toFixed(2)} kWh` : "—"}
                  </Typography>
                  <Typography variant="body2" sx={{ color: colors.grey[300] }}>Highest usage area</Typography>
                  <Typography variant="caption" sx={{ color: colors.grey[400] }}>
                    {maxEntry ? maxEntry[0] : ""}
                  </Typography>
                </Box>
                <Box sx={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <TrendingDownIcon sx={{ color: colors.greenAccent[500], fontSize: "2rem", mb: 0.5 }} />
                  <Typography variant="h5" sx={{ color: colors.greenAccent[500], fontWeight: 700 }}>
                    {minEntry ? `${Number(minEntry[1]).toFixed(2)} kWh` : "—"}
                  </Typography>
                  <Typography variant="body2" sx={{ color: colors.grey[300] }}>Lowest usage area</Typography>
                  <Typography variant="caption" sx={{ color: colors.grey[400] }}>
                    {minEntry ? minEntry[0] : ""}
                  </Typography>
                </Box>
                <Box sx={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <BarChartIcon sx={{ color: colors.greenAccent[500], fontSize: "2rem", mb: 0.5 }} />
                  <Typography variant="h5" sx={{ color: colors.greenAccent[500], fontWeight: 700 }}>
                    {suburbValues.length ? `${suburbAvg.toFixed(2)} kWh` : "—"}
                  </Typography>
                  <Typography variant="body2" sx={{ color: colors.grey[300] }}>Average usage</Typography>
                  <Typography variant="caption" sx={{ color: colors.grey[400] }}>
                    {suburbValues.length ? `${suburbValues.length} suburbs` : ""}
                  </Typography>
                </Box>
              </Box>

              <Box height="350px">
                {suburbChartData.length === 0 ? (
                  <Skeleton variant="rectangular" width="100%" height="100%" sx={{ bgcolor: colors.primary[500], borderRadius: 1 }} />
                ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={suburbChartData} margin={{ top: 5, right: 20, left: 0, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.grey[700]} />
                    <XAxis
                      dataKey="suburb"
                      stroke={colors.grey[300]}
                      tick={{ fontSize: 10 }}
                      angle={-45}
                      textAnchor="end"
                      interval={0}
                      height={80}
                    />
                    <YAxis
                      stroke={colors.grey[300]}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => `${v.toFixed(1)}`}
                      label={{ value: "kWh", angle: -90, position: "insideLeft", style: { fill: colors.grey[400], fontSize: 11 } }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: colors.primary[400],
                        border: `1px solid ${colors.grey[700]}`,
                        borderRadius: 4,
                        color: colors.grey[100],
                      }}
                      formatter={(value) => [`${Number(value).toFixed(2)} kWh`, "Consumption"]}
                    />
                    <Bar dataKey="kWh" name="kWh" radius={[4, 4, 0, 0]}>
                      {suburbChartData.map((entry, index) => (
                        <Cell key={index} fill={index % 2 === 0 ? colors.greenAccent[500] : colors.blueAccent[400]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                )}
              </Box>
            </Box>
          );
        })()}

        {/* ROW 2b: Hourly Energy Consumption Chart */}
        {(() => {
          const hourlyValues = hourlyData.map((d) => d.kWh);
          const hourlySum = hourlyValues.reduce((a, b) => a + b, 0);
          const hourlyAvg = hourlyValues.length ? hourlySum / hourlyValues.length : 0;

          return (
            <Box
              gridColumn="span 12"
              gridRow="span 4"
              backgroundColor={colors.primary[400]}
              p="15px"
            >
              <Box display="flex" alignItems="center" gap={1} mb="10px">
                <AccessTimeIcon sx={{ color: colors.greenAccent[500], fontSize: 20 }} />
                <Typography variant="h5" fontWeight="600" color={colors.grey[100]}>
                  Hourly Energy Consumption
                </Typography>
                <DataBadge live sx={{ ml: "auto" }} />
              </Box>

              {/* Power Stats Header */}
              <Box sx={{
                display: "flex",
                justifyContent: "space-around",
                backgroundColor: colors.primary[500],
                borderRadius: "8px",
                p: 1.5,
                mb: 2,
                gap: 2,
                flexWrap: "wrap",
              }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <SettingsInputCompositeIcon sx={{ color: colors.greenAccent[500], fontSize: "1.8rem" }} />
                  <Box>
                    <Typography variant="body2" color={colors.grey[300]}>Today's Total Energy</Typography>
                    <Typography variant="h5" sx={{ color: colors.greenAccent[500], fontWeight: 700 }}>
                      {hourlySum.toFixed(2)} kWh
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <ElectricalServicesIcon sx={{ color: colors.greenAccent[500], fontSize: "1.8rem" }} />
                  <Box>
                    <Typography variant="body2" color={colors.grey[300]}>Average Power</Typography>
                    <Typography variant="h5" sx={{ color: colors.greenAccent[500], fontWeight: 700 }}>
                      {isNaN(hourlyTotals.averagePower) ? "0.00" : hourlyTotals.averagePower.toFixed(1)} W
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <FlashOnIcon sx={{ color: colors.greenAccent[500], fontSize: "1.8rem" }} />
                  <Box>
                    <Typography variant="body2" color={colors.grey[300]}>Peak Power</Typography>
                    <Typography variant="h5" sx={{ color: colors.greenAccent[500], fontWeight: 700 }}>
                      {isNaN(hourlyTotals.peakPower) ? "0.00" : hourlyTotals.peakPower.toFixed(1)} W
                    </Typography>
                  </Box>
                </Box>
              </Box>

              <Box height="350px">
                {hourlyData.length === 0 ? (
                  <Skeleton variant="rectangular" width="100%" height="100%" sx={{ bgcolor: colors.primary[500], borderRadius: 1 }} />
                ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={hourlyData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradHourly" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={colors.greenAccent[500]} stopOpacity={0.4} />
                        <stop offset="95%" stopColor={colors.greenAccent[500]} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.grey[700]} />
                    <XAxis
                      dataKey="hour"
                      stroke={colors.grey[300]}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      stroke={colors.grey[300]}
                      tick={{ fontSize: 11 }}
                      label={{ value: "kWh", angle: -90, position: "insideLeft", style: { fill: colors.grey[400], fontSize: 11 } }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: colors.primary[400],
                        border: `1px solid ${colors.grey[700]}`,
                        borderRadius: 4,
                        color: colors.grey[100],
                      }}
                      formatter={(value) => [`${Number(value).toFixed(2)} kWh`, "Energy"]}
                    />
                    {hourlyAvg > 0 && (
                      <ReferenceLine
                        y={hourlyAvg}
                        stroke={colors.blueAccent[400]}
                        strokeDasharray="5 5"
                        label={{
                          value: `Avg: ${hourlyAvg.toFixed(2)} kWh`,
                          fill: colors.blueAccent[400],
                          fontSize: 11,
                          fontWeight: 600,
                          position: "insideTopRight",
                        }}
                      />
                    )}
                    <Area
                      type="monotone"
                      dataKey="kWh"
                      stroke={colors.greenAccent[500]}
                      strokeWidth={2}
                      fill="url(#gradHourly)"
                      name="Energy (kWh)"
                      dot={{ r: 3, fill: colors.greenAccent[500] }}
                      activeDot={{ r: 5 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
                )}
              </Box>
            </Box>
          );
        })()}

        {/* ROW 3: Energy Trend Chart (span 9) + Notifications (span 3) */}
        <Box
          gridColumn="span 9"
          gridRow="span 3"
          backgroundColor={colors.primary[400]}
          p="15px"
        >
          <Box display="flex" justifyContent="space-between" alignItems="center" mb="10px">
            <Typography variant="h5" fontWeight="600" color={colors.grey[100]}>
              Weekly Energy Trend
            </Typography>
            <Box display="flex" gap="10px" alignItems="center" flexWrap="wrap">
              <Box display="flex" alignItems="center" gap="5px" sx={{ bgcolor: "rgba(76,206,172,0.1)", px: 1.2, py: 0.4, borderRadius: "8px" }}>
                <FlashOnIcon sx={{ color: colors.greenAccent[500], fontSize: 14 }} />
                <Typography variant="caption" color={colors.greenAccent[400]} fontWeight="600">
                  Total: {salesTrend.reduce((s, d) => s + (d.kWh || 0), 0).toFixed(1)} kWh
                </Typography>
              </Box>
              <Box display="flex" alignItems="center" gap="5px" sx={{ bgcolor: "rgba(242,183,5,0.1)", px: 1.2, py: 0.4, borderRadius: "8px" }}>
                <TrendingUpIcon sx={{ color: "#f2b705", fontSize: 14 }} />
                <Typography variant="caption" color="#f2b705" fontWeight="600">
                  Peak: {salesTrend.length > 0 ? Math.max(...salesTrend.map(d => d.kWh || 0)).toFixed(1) : "0"} kWh
                </Typography>
              </Box>
              <Box display="flex" alignItems="center" gap="5px" sx={{ bgcolor: "rgba(0,180,216,0.1)", px: 1.2, py: 0.4, borderRadius: "8px" }}>
                <BarChartIcon sx={{ color: "#00b4d8", fontSize: 14 }} />
                <Typography variant="caption" color="#00b4d8" fontWeight="600">
                  Avg: {salesTrend.length > 0 ? (salesTrend.reduce((s, d) => s + (d.kWh || 0), 0) / salesTrend.length).toFixed(1) : "0"} kWh
                </Typography>
              </Box>
              <Box display="flex" alignItems="center" gap="5px" sx={{ bgcolor: "rgba(111,66,193,0.1)", px: 1.2, py: 0.4, borderRadius: "8px" }}>
                <ShoppingCartIcon sx={{ color: "#8b5cf6", fontSize: 14 }} />
                <Typography variant="caption" color="#a78bfa" fontWeight="600">
                  {salesTrend.reduce((s, d) => s + (d.tokens || 0), 0)} tokens
                </Typography>
              </Box>
            </Box>
          </Box>
          <Box height="calc(100% - 45px)">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={salesTrend}
                margin={{ top: 5, right: 20, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="gradEnergyBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colors.greenAccent[500]} stopOpacity={0.9} />
                    <stop offset="100%" stopColor={colors.greenAccent[500]} stopOpacity={0.4} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.grey[700]} opacity={0.5} />
                <XAxis dataKey="day" stroke={colors.grey[300]} tick={{ fontSize: 11, fontWeight: 600 }} />
                <YAxis
                  stroke={colors.grey[300]}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `${v} kWh`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: colors.primary[400],
                    border: `1px solid ${colors.greenAccent[500]}40`,
                    borderRadius: 8,
                    color: colors.grey[100],
                    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                  }}
                  formatter={(value) => [`${Number(value).toFixed(1)} kWh`, "Energy"]}
                  cursor={{ fill: "rgba(76,206,172,0.08)" }}
                />
                <Bar
                  dataKey="kWh"
                  fill="url(#gradEnergyBar)"
                  name="Energy (kWh)"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={50}
                />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </Box>

        <Box
          gridColumn="span 3"
          gridRow="span 3"
          backgroundColor={colors.primary[400]}
          p="15px"
          overflow="auto"
          sx={{ "&::-webkit-scrollbar": { width: 4 }, "&::-webkit-scrollbar-thumb": { bgcolor: colors.grey[700], borderRadius: 2 } }}
        >
          <Box display="flex" alignItems="center" justifyContent="space-between" mb="12px">
            <Box display="flex" alignItems="center" gap="8px">
              <NotificationsOutlinedIcon sx={{ color: colors.greenAccent[500] }} />
              <Typography variant="h5" fontWeight="600" color={colors.grey[100]}>
                Alerts & Status
              </Typography>
            </Box>
            {notifs.filter(n => n.type === "error").length > 0 && (
              <Box sx={{ bgcolor: "rgba(219,79,74,0.15)", px: 1, py: 0.3, borderRadius: "10px", display: "flex", alignItems: "center", gap: "4px" }}>
                <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "#db4f4a", animation: "pulse 2s infinite" }} />
                <Typography variant="caption" color="#db4f4a" fontWeight="600">
                  {notifs.filter(n => n.type === "error").length} Alert{notifs.filter(n => n.type === "error").length > 1 ? "s" : ""}
                </Typography>
              </Box>
            )}
          </Box>
          {notifs.length === 0 && (
            <Box textAlign="center" py="30px">
              <CheckCircleOutlineIcon sx={{ color: colors.greenAccent[500], fontSize: 36, mb: 1 }} />
              <Typography variant="body2" color={colors.grey[300]}>All systems nominal</Typography>
            </Box>
          )}
          {notifs.slice(0, 10).map((notif, i) => {
            const borderColor = notif.type === "error" ? "#db4f4a" : notif.type === "warning" ? "#f2b705" : notif.type === "success" ? colors.greenAccent[500] : colors.blueAccent[400];
            return (
              <Box
                key={notif.id}
                display="flex"
                gap="10px"
                py="8px"
                px="8px"
                mb="6px"
                onClick={() => notif.drn ? navigate(`/meter/${notif.drn}`) : null}
                sx={{
                  cursor: notif.drn ? "pointer" : "default",
                  borderLeft: `3px solid ${borderColor}`,
                  borderRadius: "0 6px 6px 0",
                  bgcolor: `${borderColor}08`,
                  transition: "all 0.2s",
                  "&:hover": { bgcolor: `${borderColor}15`, transform: "translateX(2px)" },
                }}
              >
                <Box mt="2px" sx={{ minWidth: 20 }}>
                  {notif.type === "error" ? <ErrorOutlineIcon sx={{ color: "#db4f4a", fontSize: 18 }} /> :
                   notif.type === "warning" ? <WarningAmberIcon sx={{ color: "#f2b705", fontSize: 18 }} /> :
                   notif.type === "success" ? <CheckCircleOutlineIcon sx={{ color: colors.greenAccent[500], fontSize: 18 }} /> :
                   <InfoOutlinedIcon sx={{ color: colors.blueAccent[400], fontSize: 18 }} />}
                </Box>
                <Box flex={1}>
                  <Box display="flex" alignItems="center" gap="6px">
                    <Typography variant="body2" fontWeight="700" color={colors.grey[100]} sx={{ fontSize: "12px", lineHeight: 1.3 }}>
                      {notif.title}
                    </Typography>
                    {notif.drn && (
                      <Box sx={{ bgcolor: `${borderColor}20`, px: "5px", py: "1px", borderRadius: "4px", display: "inline-flex" }}>
                        <Typography variant="caption" sx={{ fontSize: "9px", fontWeight: 700, color: borderColor, fontFamily: "monospace", letterSpacing: "0.5px" }}>
                          {notif.drn}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                  <Typography variant="caption" color={colors.grey[300]} sx={{ fontSize: "10px", lineHeight: 1.4, display: "block", mt: "2px" }}>
                    {notif.message && notif.message.length > 90 ? notif.message.substring(0, 90) + "..." : notif.message || ""}
                  </Typography>
                </Box>
              </Box>
            );
          })}
        </Box>

        {/* ROW 3: Energy Consumed vs Remaining Units Chart (span 9) + Timeline (span 3) */}
        <Box
          gridColumn="span 9"
          gridRow="span 5"
          backgroundColor={colors.primary[400]}
          p="15px"
        >
          <Box display="flex" justifyContent="space-between" alignItems="center" mb="10px">
            <Typography variant="h5" fontWeight="600" color={colors.grey[100]}>
              Energy Consumed vs Remaining Units
            </Typography>
            <Box display="flex" gap="16px" alignItems="center">
              <Box display="flex" alignItems="center" gap="4px">
                <Box sx={{ width: 12, height: 3, bgcolor: "#f2b705", borderRadius: 1 }} />
                <Typography variant="caption" color={colors.grey[300]}>Consumed</Typography>
              </Box>
              <Box display="flex" alignItems="center" gap="4px">
                <Box sx={{ width: 12, height: 3, bgcolor: colors.greenAccent[500], borderRadius: 1 }} />
                <Typography variant="caption" color={colors.grey[300]}>Remaining Units</Typography>
              </Box>
              <Typography variant="body2" color={colors.greenAccent[400]} fontWeight="600">
                {fmt(totalRemainingUnits)} kWh total
              </Typography>
            </Box>
          </Box>
          <Box height="calc(100% - 45px)">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={(() => {
                  const src = hourlyEnergyData.length > 0 ? hourlyEnergyData : hourlyData;
                  // Build cumulative energy consumed and declining remaining units
                  let cumConsumed = 0;
                  return src.map((item) => {
                    cumConsumed += (item.kWh || 0);
                    return {
                      ...item,
                      consumed: parseFloat(cumConsumed.toFixed(3)),
                      remaining: parseFloat(Math.max(0, totalRemainingUnits - cumConsumed).toFixed(2)),
                    };
                  });
                })()}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="gradConsumed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f2b705" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#f2b705" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradRemaining" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={colors.greenAccent[500]} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={colors.greenAccent[500]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.grey[700]} opacity={0.5} />
                <XAxis dataKey="hour" stroke={colors.grey[300]} tick={{ fontSize: 11 }} interval={2} />
                <YAxis
                  yAxisId="left"
                  stroke={colors.grey[300]}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `${v} kWh`}
                  label={{ value: "Consumed", angle: -90, position: "insideLeft", style: { fill: "#f2b705", fontSize: 10 } }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke={colors.grey[300]}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `${v}`}
                  label={{ value: "Remaining", angle: 90, position: "insideRight", style: { fill: colors.greenAccent[400], fontSize: 10 } }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: colors.primary[400],
                    border: `1px solid ${colors.grey[700]}`,
                    borderRadius: 8,
                    color: colors.grey[100],
                    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                  }}
                  formatter={(value, name) => [`${Number(value).toFixed(2)} kWh`, name]}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="consumed"
                  stroke="#f2b705"
                  strokeWidth={2}
                  fill="url(#gradConsumed)"
                  name="Energy Consumed"
                  dot={{ r: 2, fill: "#f2b705" }}
                />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="remaining"
                  stroke={colors.greenAccent[500]}
                  strokeWidth={2}
                  fill="url(#gradRemaining)"
                  name="Remaining Units"
                  dot={{ r: 2, fill: colors.greenAccent[500] }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Box>
        </Box>

        <Box
          gridColumn="span 3"
          gridRow="span 5"
          backgroundColor={colors.primary[400]}
          p="15px"
          overflow="auto"
        >
          <Typography
            variant="h5"
            fontWeight="600"
            color={colors.grey[100]}
            mb="15px"
          >
            Token Timeline
          </Typography>
          {recentTxns.filter((t) => t.status === "Accepted").slice(0, 10).map((txn, i) => (
            <Box
              key={txn.id}
              display="flex"
              justifyContent="space-between"
              alignItems="center"
              py="10px"
              borderBottom={
                i < 9 ? `1px solid ${colors.grey[700]}` : "none"
              }
              sx={{ cursor: "pointer", "&:hover": { bgcolor: "rgba(0,180,216,0.05)" } }}
              onClick={() => navigate(`/meter/${txn.meterNo}`)}
            >
              <Box>
                <Typography
                  variant="h6"
                  fontWeight="600"
                  color={colors.greenAccent[400]}
                  sx={{ "&:hover": { textDecoration: "underline" } }}
                >
                  {txn.customer}
                </Typography>
                <Typography variant="caption" color={colors.greenAccent[400]}>
                  {formatTime(txn.time)} — {txn.meterNo}
                </Typography>
              </Box>
              <Typography
                variant="h6"
                fontWeight="bold"
                color={
                  txn.status === "Accepted"
                    ? colors.greenAccent[500]
                    : txn.status === "Rejected"
                    ? colors.redAccent?.[500] || "#db4f4a"
                    : colors.yellowAccent?.[500] || colors.grey[100]
                }
              >
                {txn.amount > 0 ? `${fmt(txn.amount)} kWh` : "0 kWh"}
              </Typography>
            </Box>
          ))}
        </Box>

        {/* ROW 4: Energy Overview Stat Boxes */}
        <Box
          gridColumn="span 4"
          backgroundColor={colors.primary[400]}
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <StatBox
            title={`${fmt(kpis.todayRevenue)} kWh`}
            subtitle="Today's kWh Purchased"
            progress={kpis.todayRevenue > 0 ? String(Math.min(1, kpis.todayRevenue / 5000)) : "0"}
            increase={kpis.todayTokens ? `${fmt(kpis.todayTokens)} tokens accepted` : ""}
            link="/vending"
            icon={
              <ShoppingCartIcon
                sx={{ color: colors.greenAccent[500], fontSize: "26px" }}
              />
            }
          />
        </Box>

        <Box
          gridColumn="span 4"
          backgroundColor={colors.primary[400]}
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <StatBox
            title={`${Number(kpis.avgConsumption || 0).toFixed(1)} kWh`}
            subtitle="Today's Energy Consumed"
            progress={kpis.avgConsumption > 0 ? String(Math.min(1, kpis.avgConsumption / 5000)) : "0"}
            increase="cumulative usage"
            link="/"
            icon={
              <AccountBalanceWalletOutlinedIcon
                sx={{ color: colors.greenAccent[500], fontSize: "26px" }}
              />
            }
          />
        </Box>

        <Box
          gridColumn="span 4"
          backgroundColor={colors.primary[400]}
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <StatBox
            title={fmt(kpis.todayTokens)}
            subtitle="Tokens Processed Today"
            progress={kpis.todayTokens > 0 ? String(Math.min(1, kpis.todayTokens / 100)) : "0"}
            increase="accepted + rejected"
            link="/"
            icon={
              <PowerOutlinedIcon
                sx={{ color: colors.greenAccent[500], fontSize: "26px" }}
              />
            }
          />
        </Box>

        {/* ROW 5: Recent Transactions Table */}
        <Box
          gridColumn="span 12"
          gridRow="span 4"
          backgroundColor={colors.primary[400]}
          p="15px"
          overflow="auto"
        >
          <Typography
            variant="h5"
            fontWeight="600"
            color={colors.grey[100]}
            mb="15px"
          >
            Recent Token Entries
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {["Date/Time", "Meter (DRN)", "Token ID", "Amount (kWh)", "Channel", "Status"].map(
                    (col) => (
                      <TableCell
                        key={col}
                        sx={{
                          color: colors.greenAccent[500],
                          fontWeight: 600,
                          fontSize: "12px",
                          borderBottom: `2px solid ${colors.grey[700]}`,
                          backgroundColor: colors.primary[400],
                        }}
                      >
                        {col}
                      </TableCell>
                    )
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {recentTxns.filter((txn) => txn.status === "Accepted").map((txn) => (
                  <TableRow
                    key={txn.id}
                    sx={{
                      "&:hover": {
                        backgroundColor: `${colors.primary[500]} !important`,
                      },
                      "& td": {
                        borderBottom: `1px solid ${colors.grey[700]}`,
                        color: colors.grey[100],
                        fontSize: "12px",
                        py: 1.2,
                      },
                    }}
                  >
                    <TableCell>{formatTime(txn.time)}</TableCell>
                    <TableCell sx={{ fontFamily: "monospace", fontSize: "11px !important" }}>
                      {txn.meterNo}
                    </TableCell>
                    <TableCell sx={{ fontFamily: "monospace", fontSize: "10px !important" }}>
                      {txn.token}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>
                      {txn.amount > 0 ? `${txn.amount} kWh` : "-"}
                    </TableCell>
                    <TableCell>{txn.channel}</TableCell>
                    <TableCell>
                      <Box
                        sx={{
                          display: "inline-block",
                          px: 1,
                          py: 0.3,
                          borderRadius: "4px",
                          backgroundColor:
                            txn.status === "Accepted"
                              ? "rgba(76,206,172,0.15)"
                              : txn.status === "Rejected"
                              ? "rgba(219,79,74,0.15)"
                              : "rgba(242,183,5,0.15)",
                          color:
                            txn.status === "Accepted"
                              ? colors.greenAccent[500]
                              : txn.status === "Rejected"
                              ? "#db4f4a"
                              : "#f2b705",
                          fontWeight: 600,
                          fontSize: "11px",
                        }}
                      >
                        {txn.status}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        {/* ROW 6: Meter Status Scatter (ECharts) */}
        {meterHealthData.length > 0 && (
          <Box
            gridColumn="span 12"
            gridRow="span 5"
            backgroundColor={colors.primary[400]}
            p="15px"
          >
            <Typography
              variant="h5"
              fontWeight="600"
              color={colors.grey[100]}
              mb="10px"
            >
              Meter Status Overview
            </Typography>
            <Box height="calc(100% - 40px)">
              <ReactECharts
                option={{
                  backgroundColor: "transparent",
                  tooltip: {
                    trigger: "item",
                    formatter: (p) => {
                      const d = p.data;
                      return `<strong>${d[4] || d[3]}</strong><br/>` +
                        `Health: <strong>${d[1]}</strong>/100<br/>` +
                        `Power: ${d[0].toFixed(1)} W<br/>` +
                        `Voltage: ${(d[5] || 0).toFixed(1)} V<br/>` +
                        `Temp: ${(d[6] || 0).toFixed(1)} °C<br/>` +
                        `Status: <strong>${d[7] || "unknown"}</strong><br/>` +
                        `Readings (24h): ${d[8] || 0}` +
                        (d[9] && d[9].length ? `<br/>Flags: ${d[9].join(", ")}` : "");
                    },
                  },
                  legend: {
                    data: ["Healthy", "Warning", "Suspicious"],
                    textStyle: { color: colors.grey[300] },
                    top: 0,
                    right: 0,
                  },
                  grid: { left: "8%", right: "5%", top: "12%", bottom: "12%" },
                  xAxis: {
                    name: "Avg Power (W)",
                    nameTextStyle: { color: colors.grey[300], fontSize: 11 },
                    axisLabel: { color: colors.grey[300], fontSize: 10 },
                    axisLine: { lineStyle: { color: colors.grey[700] } },
                    splitLine: { lineStyle: { color: colors.grey[700], type: "dashed" } },
                  },
                  yAxis: {
                    name: "Health Score",
                    nameTextStyle: { color: colors.grey[300], fontSize: 11 },
                    axisLabel: { color: colors.grey[300], fontSize: 10 },
                    axisLine: { lineStyle: { color: colors.grey[700] } },
                    splitLine: { lineStyle: { color: colors.grey[700], type: "dashed" } },
                    min: 0,
                    max: 100,
                  },
                  visualMap: {
                    show: false,
                    dimension: 1,
                    min: 0,
                    max: 100,
                    inRange: {
                      color: ["#db4f4a", "#f2b705", "#4cceac"],
                    },
                  },
                  series: [
                    {
                      name: "Healthy",
                      type: "scatter",
                      symbolSize: (d) => Math.max(10, Math.min(30, d[2] / 2)),
                      data: meterHealthData
                        .filter((m) => m.status === "healthy")
                        .map((m) => [
                          m.avgPower, m.healthScore, m.readings24h, m.drn,
                          m.name, m.avgVoltage, m.temperature, m.status, m.readings24h, m.flags,
                        ]),
                      itemStyle: { color: "#4cceac", shadowBlur: 8, shadowColor: "rgba(76,206,172,0.4)" },
                    },
                    {
                      name: "Warning",
                      type: "scatter",
                      symbolSize: (d) => Math.max(12, Math.min(30, d[2] / 2)),
                      data: meterHealthData
                        .filter((m) => m.status === "warning")
                        .map((m) => [
                          m.avgPower, m.healthScore, m.readings24h, m.drn,
                          m.name, m.avgVoltage, m.temperature, m.status, m.readings24h, m.flags,
                        ]),
                      itemStyle: { color: "#f2b705", shadowBlur: 10, shadowColor: "rgba(242,183,5,0.5)" },
                    },
                    {
                      name: "Suspicious",
                      type: "scatter",
                      symbol: "diamond",
                      symbolSize: (d) => Math.max(14, Math.min(35, d[2] / 2)),
                      data: meterHealthData
                        .filter((m) => m.status === "suspicious")
                        .map((m) => [
                          m.avgPower, m.healthScore, m.readings24h, m.drn,
                          m.name, m.avgVoltage, m.temperature, m.status, m.readings24h, m.flags,
                        ]),
                      itemStyle: { color: "#db4f4a", shadowBlur: 12, shadowColor: "rgba(219,79,74,0.6)" },
                    },
                    {
                      name: "Threshold",
                      type: "line",
                      markLine: {
                        silent: true,
                        lineStyle: { color: "#f2b705", type: "dashed", width: 1 },
                        data: [{ yAxis: 75, label: { formatter: "Warning", color: "#f2b705", fontSize: 10 } },
                               { yAxis: 50, label: { formatter: "Suspicious", color: "#db4f4a", fontSize: 10 } }],
                      },
                      data: [],
                    },
                  ],
                  animation: true,
                  animationDuration: 1500,
                  animationEasing: "elasticOut",
                }}
                style={{ height: "100%", width: "100%" }}
                notMerge
              />
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
