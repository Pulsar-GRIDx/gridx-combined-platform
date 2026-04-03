import { useState, useEffect } from "react";
import { Box, Typography, useTheme, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, CircularProgress, Skeleton } from "@mui/material";
import { tokens } from "../theme";
import Header from "../components/Header";
import DataBadge from "../components/DataBadge";
import StatBox from "../components/StatBox";
import { meterAPI, tokenAPI, financeAPI, energyAPI } from "../services/api";
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
import { dashboardData as mockDashboard, notifications as mockNotifications } from "../services/mockData";
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

  const [kpis, setKpis] = useState(mockDashboard.kpis);
  const [salesTrend, setSalesTrend] = useState(mockDashboard.salesTrend);
  const [recentTxns, setRecentTxns] = useState(mockDashboard.recentTransactions);
  const [notifs, setNotifs] = useState(mockNotifications);
  const [areaPower, setAreaPower] = useState([]);
  const [areaRevenue, setAreaRevenue] = useState([]);
  const [hourlyData, setHourlyData] = useState([]);
  const [hourlyTotals, setHourlyTotals] = useState({ averagePower: 0, peakPower: 0 });
  const [suburbEnergy, setSuburbEnergy] = useState({});
  const [hourlyTokenCounts, setHourlyTokenCounts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const withTimeout = (promise, ms = 8000) =>
      Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

    // Fire-and-forget: each call updates state as soon as it resolves
    // KPIs load fast, charts load in background — UI is never blocked
    const fetchKpis = async () => {
      try {
        const [meterDash, tokenAmt, tokenCnt, dayEnergy] = await Promise.allSettled([
          withTimeout(meterAPI.getDashboard()),
          withTimeout(tokenAPI.getAmount()),
          withTimeout(tokenAPI.getCount()),
          withTimeout(energyAPI.getCurrentDay()),
        ]);
        if (meterDash.status === "fulfilled" && meterDash.value?.data) {
          const d = meterDash.value.data;
          setKpis((prev) => ({
            ...prev,
            totalMeters: d.totalMeters || d.total || prev.totalMeters,
            activeMeters: d.activeMeters || d.active || prev.activeMeters,
            inactiveMeters: d.inactiveMeters || d.inactive || prev.inactiveMeters,
            systemLoad: d.systemLoad || prev.systemLoad,
          }));
        }
        if (tokenAmt.status === "fulfilled") {
          setKpis((prev) => ({ ...prev, todayRevenue: parseFloat(tokenAmt.value?.grandTotal) || prev.todayRevenue }));
        }
        if (tokenCnt.status === "fulfilled") {
          setKpis((prev) => ({ ...prev, todayTokens: tokenCnt.value?.grandTotal || prev.todayTokens }));
        }
        if (dayEnergy.status === "fulfilled") {
          setKpis((prev) => ({ ...prev, avgConsumption: dayEnergy.value?.totalEnergy || prev.avgConsumption }));
        }
      } catch (e) { console.error("KPI fetch:", e); }
      setLoading(false);
    };

    const fetchCharts = async () => {
      // Week trend
      withTimeout(financeAPI.getPastWeekTokens()).then((val) => {
        if (Array.isArray(val)) {
          const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
          const trend = val.map((item) => {
            const d = new Date(item.date || item.Date);
            return {
              day: dayNames[d.getDay()] || "?",
              revenue: parseFloat(item.total_amount || item.amount || 0),
              tokens: parseInt(item.token_count || item.count || 0, 10),
              kWh: parseFloat(item.total_kwh || item.kwh || 0),
            };
          });
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

      // Hourly power
      withTimeout(energyAPI.getHourlyPower()).then((hData) => {
        if (Array.isArray(hData?.sums)) {
          setHourlyData(hData.sums.map((val, i) => ({
            hour: `${i < 10 ? '0' + i : i}:00`,
            kWh: Number(val) || 0,
          })));
        }
      }).catch(() => {});

      // Weekly amount
      withTimeout(energyAPI.getWeeklyAmount()).then((wData) => {
        if (wData) {
          const avgPower = typeof wData.averagePower === "number"
            ? wData.averagePower
            : wData?.enhancedSystemPowerAnalysis?.daily_analysis?.overall_average_power || 0;
          const peakPower = typeof wData.peakPower === "number"
            ? wData.peakPower
            : wData?.enhancedSystemPowerAnalysis?.daily_analysis?.overall_peak_power || 0;
          setHourlyTotals({ averagePower: avgPower, peakPower: peakPower });
        }
      }).catch(() => {});

      // Suburb energy (slowest — 10s timeout)
      withTimeout(energyAPI.getSuburbHourlyEnergy(ALL_SUBURBS), 10000).then((val) => {
        const sData = val?.data || val;
        if (typeof sData === "object" && !Array.isArray(sData)) {
          const fullData = {};
          ALL_SUBURBS.forEach((s) => { fullData[s] = Number(sData[s]) || 0; });
          setSuburbEnergy(fullData);
        }
      }).catch(() => {});

      // Token entries
      withTimeout(tokenAPI.getAllTokenEntries()).then((val) => {
        const data = Array.isArray(val?.data) ? val.data : Array.isArray(val) ? val : [];
        const channels = ["Console", "Touch Screen", "SMS", "BLE", "Server"];
        const txns = data.slice(0, 50).map((t, i) => ({
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
        if (txns.length > 0) setRecentTxns(txns);
      }).catch(() => {});

      // Hourly token counts
      withTimeout(tokenAPI.getHourlyTokenCounts()).then((val) => {
        const hData = Array.isArray(val?.data) ? val.data : Array.isArray(val) ? val : [];
        if (hData.length > 0) setHourlyTokenCounts(hData);
      }).catch(() => {});
    };

    // KPIs first (fast), then charts stream in
    fetchKpis();
    fetchCharts();
  }, []);

  return (
    <Box m="20px">
      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Header title="DASHBOARD" subtitle="Meters Network Summary" />
        <Box display="flex" gap={0.5}>
          <DataBadge live />
          <DataBadge />
        </Box>
      </Box>

      <Box
        display="grid"
        gridTemplateColumns="repeat(12, 1fr)"
        gridAutoRows="140px"
        gap="5px"
      >
        {/* ROW 1: 4 Stat Boxes */}
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
            progress="0.75"
            increase="+2.4%"
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
            title={fmt(kpis.activeMeters)}
            subtitle="Active Meters"
            progress="0.89"
            increase="+1.2%"
            link="/meters"
            icon={
              <ElectricBoltOutlinedIcon
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
            title={fmt(kpis.inactiveMeters)}
            subtitle="Inactive Meters"
            progress="0.11"
            increase="-0.8%"
            link="/meters"
            icon={
              <BatteryChargingFullIcon
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
            title={`${kpis.systemLoad}%`}
            subtitle="Current System Load"
            progress={String(kpis.systemLoad / 100)}
            increase="+3.1%"
            link="/"
            icon={
              <BoltIcon
                sx={{ color: colors.greenAccent[500], fontSize: "26px" }}
              />
            }
          />
        </Box>

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
                    <Typography variant="body2" color={colors.grey[300]}>Today's System Load</Typography>
                    <Typography variant="h5" sx={{ color: colors.greenAccent[500], fontWeight: 700 }}>
                      {hourlySum.toFixed(2)} kWh
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <ElectricalServicesIcon sx={{ color: colors.greenAccent[500], fontSize: "1.8rem" }} />
                  <Box>
                    <Typography variant="body2" color={colors.grey[300]}>Today's Average Power</Typography>
                    <Typography variant="h5" sx={{ color: colors.greenAccent[500], fontWeight: 700 }}>
                      {isNaN(hourlyTotals.averagePower) ? "0.00" : (hourlyTotals.averagePower / 1000).toFixed(2)} KW
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <FlashOnIcon sx={{ color: colors.greenAccent[500], fontSize: "1.8rem" }} />
                  <Box>
                    <Typography variant="body2" color={colors.grey[300]}>Today's Peak Power</Typography>
                    <Typography variant="h5" sx={{ color: colors.greenAccent[500], fontWeight: 700 }}>
                      {isNaN(hourlyTotals.peakPower) ? "0.00" : (hourlyTotals.peakPower / 1000).toFixed(2)} KW
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

        {/* ROW 3: Revenue & Energy Chart (span 9) + Notifications (span 3) */}
        <Box
          gridColumn="span 9"
          gridRow="span 3"
          backgroundColor={colors.primary[400]}
          p="15px"
        >
          <Typography
            variant="h5"
            fontWeight="600"
            color={colors.grey[100]}
            mb="10px"
          >
            Revenue & Energy Trend
          </Typography>
          <Box height="calc(100% - 40px)">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={salesTrend}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={colors.greenAccent[500]} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={colors.greenAccent[500]} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradKwh" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={colors.blueAccent[400]} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={colors.blueAccent[400]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.grey[700]} />
                <XAxis dataKey="day" stroke={colors.grey[300]} tick={{ fontSize: 12 }} />
                <YAxis
                  yAxisId="left"
                  stroke={colors.grey[300]}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `N$${(v / 1000).toFixed(0)}k`}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke={colors.grey[300]}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: colors.primary[400],
                    border: `1px solid ${colors.grey[700]}`,
                    borderRadius: 4,
                    color: colors.grey[100],
                  }}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="revenue"
                  stroke={colors.greenAccent[500]}
                  strokeWidth={2}
                  fill="url(#gradRevenue)"
                  name="Revenue (N$)"
                />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="kWh"
                  stroke={colors.blueAccent[400]}
                  strokeWidth={2}
                  fill="url(#gradKwh)"
                  name="Energy (kWh)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </Box>
        </Box>

        <Box
          gridColumn="span 3"
          gridRow="span 3"
          backgroundColor={colors.primary[400]}
          p="15px"
          overflow="auto"
        >
          <Box display="flex" alignItems="center" gap="8px" mb="15px">
            <NotificationsOutlinedIcon sx={{ color: colors.greenAccent[500] }} />
            <Typography variant="h5" fontWeight="600" color={colors.grey[100]}>
              Notifications
            </Typography>
          </Box>
          {notifs.slice(0, 8).map((notif, i) => (
            <Box
              key={notif.id}
              display="flex"
              gap="10px"
              py="10px"
              borderBottom={
                i < 7 ? `1px solid ${colors.grey[700]}` : "none"
              }
            >
              <Box mt="3px">{notifIcon(notif.type)}</Box>
              <Box flex={1}>
                <Typography
                  variant="h6"
                  fontWeight="600"
                  color={colors.grey[100]}
                >
                  {notif.title}
                </Typography>
                <Typography variant="body2" color={colors.grey[300]} sx={{ fontSize: "11px" }}>
                  {notif.message && notif.message.length > 80
                    ? notif.message.substring(0, 80) + "..."
                    : notif.message || ""}
                </Typography>
                <Typography
                  variant="caption"
                  color={colors.greenAccent[400]}
                  sx={{ fontSize: "10px" }}
                >
                  {formatTime(notif.timestamp)}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>

        {/* ROW 3: Token Transactions Chart (span 9) + Timeline (span 3) */}
        <Box
          gridColumn="span 9"
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
            Token Transaction Revenue (Today — Cumulative)
          </Typography>
          <Box height="calc(100% - 40px)">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={hourlyTokenCounts.length > 0 ? hourlyTokenCounts : salesTrend}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="gradTokens" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={colors.greenAccent[500]} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={colors.greenAccent[500]} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradAmount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={colors.blueAccent[500]} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={colors.blueAccent[500]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.grey[700]} />
                <XAxis dataKey="label" stroke={colors.grey[300]} tick={{ fontSize: 11 }} interval={2} />
                <YAxis
                  yAxisId="left"
                  stroke={colors.grey[300]}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `${v}`}
                  label={{ value: "Tokens", angle: -90, position: "insideLeft", style: { fill: colors.grey[300], fontSize: 11 } }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke={colors.grey[300]}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `${v}`}
                  label={{ value: "kWh", angle: 90, position: "insideRight", style: { fill: colors.grey[300], fontSize: 11 } }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: colors.primary[400],
                    border: `1px solid ${colors.grey[700]}`,
                    borderRadius: 4,
                    color: colors.grey[100],
                  }}
                  formatter={(value, name) => [value, name]}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="tokens"
                  stroke={colors.greenAccent[500]}
                  strokeWidth={2}
                  fill="url(#gradTokens)"
                  name="Cumulative Tokens"
                />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="amount"
                  stroke={colors.blueAccent[500]}
                  strokeWidth={2}
                  fill="url(#gradAmount)"
                  name="Cumulative kWh"
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
          {recentTxns.slice(0, 10).map((txn, i) => (
            <Box
              key={txn.id}
              display="flex"
              justifyContent="space-between"
              alignItems="center"
              py="10px"
              borderBottom={
                i < 9 ? `1px solid ${colors.grey[700]}` : "none"
              }
            >
              <Box>
                <Typography
                  variant="h6"
                  fontWeight="600"
                  color={colors.grey[100]}
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
                  txn.status === "Completed"
                    ? colors.greenAccent[500]
                    : txn.status === "Failed"
                    ? colors.redAccent[500]
                    : colors.yellowAccent?.[500] || colors.grey[100]
                }
              >
                {fmtCurrency(txn.amount)}
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
            title={fmtCurrency(kpis.todayRevenue)}
            subtitle="Total Units Purchased"
            progress="0.65"
            increase="+8.3%"
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
            title={`${fmt(kpis.avgConsumption)} kWh`}
            subtitle="Units Available Balance"
            progress="0.48"
            increase="+2.1%"
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
            subtitle="Total Energy Consumed"
            progress="0.72"
            increase="+5.7%"
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
                {recentTxns.map((txn) => (
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
      </Box>
    </Box>
  );
}
