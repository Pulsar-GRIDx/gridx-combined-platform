import { useState, useEffect, useCallback } from "react";
import { Box, Typography, useTheme, ToggleButton, ToggleButtonGroup, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip } from "@mui/material";
import { tokens } from "../theme";
import Header from "../components/Header";
import { dataUsageAPI } from "../services/api";
import CellTowerIcon from "@mui/icons-material/CellTower";
import DataUsageIcon from "@mui/icons-material/DataUsage";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import MessageIcon from "@mui/icons-material/Message";
import RouterIcon from "@mui/icons-material/Router";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell as RCell,
} from "recharts";

const COLORS = ["#3b82f6", "#22c55e", "#f97316", "#a855f7", "#06b6d4", "#eab308", "#ef4444", "#64748b"];

const DataUsage = () => {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const isDark = theme.palette.mode === "dark";

  const [networkToday, setNetworkToday] = useState(null);
  const [networkDaily, setNetworkDaily] = useState(null);
  const [meterRanking, setMeterRanking] = useState(null);
  const [view, setView] = useState("today");
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [today, daily, meters] = await Promise.all([
        dataUsageAPI.getNetworkToday(),
        dataUsageAPI.getNetworkDaily(30),
        dataUsageAPI.getNetworkMeters(7),
      ]);
      setNetworkToday(today);
      setNetworkDaily(daily);
      setMeterRanking(meters);
    } catch (err) {
      console.error("Data usage fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const formatBytes = (bytes) => {
    if (!bytes) return "0 B";
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  const cardBg = isDark ? colors.primary[400] : "#fff";

  const StatCard = ({ title, value, subtitle, icon, color }) => (
    <Box sx={{ bgcolor: cardBg, borderRadius: "12px", p: "20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <Box>
        <Typography sx={{ fontSize: "13px", color: colors.grey[300], mb: "4px" }}>{title}</Typography>
        <Typography sx={{ fontSize: "28px", fontWeight: 700, color: colors.grey[100], lineHeight: 1.2 }}>{value}</Typography>
        {subtitle && <Typography sx={{ fontSize: "12px", color: colors.grey[400], mt: "4px" }}>{subtitle}</Typography>}
      </Box>
      <Box sx={{ p: "10px", borderRadius: "10px", bgcolor: `${color}20`, display: "flex" }}>
        {icon}
      </Box>
    </Box>
  );

  const hourlyData = networkToday ? networkToday.hourly.map(h => ({
    time: h.label,
    data: +(h.bytes / 1024).toFixed(2),
    cost: h.cost,
    msgs: h.msgs,
    meters: h.meters,
  })) : [];

  const dailyChartData = networkDaily ? networkDaily.daily.map(d => {
    const dt = new Date(d.date);
    return {
      date: `${dt.getDate()}/${dt.getMonth() + 1}`,
      data: +(d.mb * 1024).toFixed(1),
      cost: d.cost,
      meters: d.meters,
    };
  }) : [];

  return (
    <Box m="20px">
      <Header title="DATA USAGE" subtitle="Network-wide cellular data transmission monitoring & cost analysis" />

      <Box display="flex" justifyContent="space-between" alignItems="center" mb="20px">
        <ToggleButtonGroup value={view} exclusive onChange={(e, v) => { if (v) setView(v); }} size="small">
          <ToggleButton value="today" sx={{ textTransform: "none", px: 2 }}>Today</ToggleButton>
          <ToggleButton value="monthly" sx={{ textTransform: "none", px: 2 }}>30 Days</ToggleButton>
        </ToggleButtonGroup>
        <Chip
          icon={<CellTowerIcon sx={{ fontSize: 16 }} />}
          label="Live Tracking"
          size="small"
          sx={{ bgcolor: `${colors.greenAccent[500]}20`, color: colors.greenAccent[400], fontWeight: 600 }}
        />
      </Box>

      {/* KPI Cards */}
      <Box display="grid" gridTemplateColumns="repeat(12, 1fr)" gap="15px" mb="20px">
        <Box gridColumn="span 3">
          <StatCard
            title={view === "today" ? "Today's Data" : "30-Day Data"}
            value={formatBytes(view === "today" ? (networkToday?.totalBytes || 0) : (networkDaily?.totalBytes || 0))}
            subtitle={`${view === "today" ? (networkToday?.totalMsgs || 0) : networkDaily?.daily?.reduce((s, d) => s + d.msgs, 0) || 0} messages`}
            icon={<DataUsageIcon sx={{ fontSize: 26, color: "#3b82f6" }} />}
            color="#3b82f6"
          />
        </Box>
        <Box gridColumn="span 3">
          <StatCard
            title={view === "today" ? "Today's Cost" : "30-Day Cost"}
            value={`N$ ${(view === "today" ? (networkToday?.totalCost || 0) : (networkDaily?.totalCost || 0)).toFixed(2)}`}
            subtitle={`@ N$ ${networkToday?.costPerMb || 0.50}/MB`}
            icon={<AttachMoneyIcon sx={{ fontSize: 26, color: "#f97316" }} />}
            color="#f97316"
          />
        </Box>
        <Box gridColumn="span 3">
          <StatCard
            title="Active Meters"
            value={networkToday?.activeMeters || 0}
            subtitle="Transmitting today"
            icon={<RouterIcon sx={{ fontSize: 26, color: "#22c55e" }} />}
            color="#22c55e"
          />
        </Box>
        <Box gridColumn="span 3">
          <StatCard
            title="Total Messages"
            value={(view === "today" ? (networkToday?.totalMsgs || 0) : networkDaily?.daily?.reduce((s, d) => s + d.msgs, 0) || 0).toLocaleString()}
            subtitle="MQTT transmissions"
            icon={<MessageIcon sx={{ fontSize: 26, color: "#a855f7" }} />}
            color="#a855f7"
          />
        </Box>
      </Box>

      {/* Charts row */}
      <Box display="grid" gridTemplateColumns="repeat(12, 1fr)" gap="15px" mb="20px">
        {/* Main chart */}
        <Box gridColumn="span 8" sx={{ bgcolor: cardBg, borderRadius: "12px", p: "20px" }}>
          <Typography sx={{ fontSize: "15px", fontWeight: 600, color: colors.grey[100], mb: "15px" }}>
            {view === "today" ? "Hourly Data Consumption (KB)" : "Daily Data Consumption (KB)"}
          </Typography>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={view === "today" ? hourlyData : dailyChartData}>
              <defs>
                <linearGradient id="dataGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(148,163,184,0.1)" : "rgba(0,0,0,0.06)"} />
              <XAxis dataKey={view === "today" ? "time" : "date"} tick={{ fill: colors.grey[400], fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: colors.grey[400], fontSize: 11 }} axisLine={false} tickLine={false} />
              <RTooltip contentStyle={{ backgroundColor: isDark ? "#1e293b" : "#fff", border: "none", borderRadius: 8, fontSize: 13 }} />
              <Area type="monotone" dataKey="data" stroke="#3b82f6" strokeWidth={2} fill="url(#dataGrad)" name="Data (KB)" />
            </AreaChart>
          </ResponsiveContainer>
        </Box>

        {/* Cost chart */}
        <Box gridColumn="span 4" sx={{ bgcolor: cardBg, borderRadius: "12px", p: "20px" }}>
          <Typography sx={{ fontSize: "15px", fontWeight: 600, color: colors.grey[100], mb: "15px" }}>
            {view === "today" ? "Hourly Cost (N$)" : "Daily Cost (N$)"}
          </Typography>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={view === "today" ? hourlyData : dailyChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(148,163,184,0.1)" : "rgba(0,0,0,0.06)"} />
              <XAxis dataKey={view === "today" ? "time" : "date"} tick={{ fill: colors.grey[400], fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: colors.grey[400], fontSize: 11 }} axisLine={false} tickLine={false} />
              <RTooltip contentStyle={{ backgroundColor: isDark ? "#1e293b" : "#fff", border: "none", borderRadius: 8, fontSize: 13 }} />
              <Bar dataKey="cost" fill="#f97316" radius={[4, 4, 0, 0]} name="Cost (N$)" />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </Box>

      {/* Meter ranking table */}
      <Box sx={{ bgcolor: cardBg, borderRadius: "12px", p: "20px" }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb="15px">
          <Typography sx={{ fontSize: "15px", fontWeight: 600, color: colors.grey[100] }}>
            Per-Meter Data Usage (Last 7 Days)
          </Typography>
          <Chip label={`${meterRanking?.meters?.length || 0} meters`} size="small" sx={{ bgcolor: `${colors.blueAccent[500]}20`, color: colors.blueAccent[400] }} />
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ color: colors.grey[300], fontWeight: 600, fontSize: 12, borderColor: isDark ? colors.primary[400] : "#eee" }}>#</TableCell>
                <TableCell sx={{ color: colors.grey[300], fontWeight: 600, fontSize: 12, borderColor: isDark ? colors.primary[400] : "#eee" }}>DRN</TableCell>
                <TableCell sx={{ color: colors.grey[300], fontWeight: 600, fontSize: 12, borderColor: isDark ? colors.primary[400] : "#eee" }}>Customer</TableCell>
                <TableCell sx={{ color: colors.grey[300], fontWeight: 600, fontSize: 12, borderColor: isDark ? colors.primary[400] : "#eee" }}>Area</TableCell>
                <TableCell align="right" sx={{ color: colors.grey[300], fontWeight: 600, fontSize: 12, borderColor: isDark ? colors.primary[400] : "#eee" }}>Messages</TableCell>
                <TableCell align="right" sx={{ color: colors.grey[300], fontWeight: 600, fontSize: 12, borderColor: isDark ? colors.primary[400] : "#eee" }}>Data</TableCell>
                <TableCell align="right" sx={{ color: colors.grey[300], fontWeight: 600, fontSize: 12, borderColor: isDark ? colors.primary[400] : "#eee" }}>Cost</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(meterRanking?.meters || []).map((m, i) => (
                <TableRow key={m.drn} sx={{ "&:hover": { bgcolor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" } }}>
                  <TableCell sx={{ color: colors.grey[300], fontSize: 12, borderColor: isDark ? colors.primary[400] : "#eee" }}>{i + 1}</TableCell>
                  <TableCell sx={{ color: colors.grey[100], fontSize: 12, fontWeight: 600, fontFamily: "monospace", borderColor: isDark ? colors.primary[400] : "#eee" }}>{m.drn}</TableCell>
                  <TableCell sx={{ color: colors.grey[200], fontSize: 12, borderColor: isDark ? colors.primary[400] : "#eee" }}>{m.name}</TableCell>
                  <TableCell sx={{ color: colors.grey[300], fontSize: 12, borderColor: isDark ? colors.primary[400] : "#eee" }}>{m.area}</TableCell>
                  <TableCell align="right" sx={{ color: colors.grey[200], fontSize: 12, borderColor: isDark ? colors.primary[400] : "#eee" }}>{m.msgs.toLocaleString()}</TableCell>
                  <TableCell align="right" sx={{ color: "#3b82f6", fontSize: 12, fontWeight: 600, borderColor: isDark ? colors.primary[400] : "#eee" }}>{formatBytes(m.bytes)}</TableCell>
                  <TableCell align="right" sx={{ color: "#f97316", fontSize: 12, fontWeight: 600, borderColor: isDark ? colors.primary[400] : "#eee" }}>N$ {m.cost.toFixed(2)}</TableCell>
                </TableRow>
              ))}
              {(!meterRanking?.meters || meterRanking.meters.length === 0) && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ color: colors.grey[400], py: 4, borderColor: isDark ? colors.primary[400] : "#eee" }}>
                    No data available yet. Tracking starts when meters begin transmitting.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Box>
  );
};

export default DataUsage;
