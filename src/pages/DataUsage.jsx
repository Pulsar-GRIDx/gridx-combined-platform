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
  ResponsiveContainer, PieChart, Pie, Cell as RCell,
} from "recharts";

const COLORS = ["#3b82f6", "#f97316", "#22c55e", "#a855f7", "#ef4444", "#06b6d4", "#eab308", "#ec4899"];

const DataUsage = () => {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const isDark = theme.palette.mode === "dark";

  const [networkToday, setNetworkToday] = useState(null);
  const [networkDaily, setNetworkDaily] = useState(null);
  const [networkYearly, setNetworkYearly] = useState(null);
  const [meterRanking, setMeterRanking] = useState(null);
  const [networkBreakdown, setNetworkBreakdown] = useState(null);
  const [view, setView] = useState("today");
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [today, daily, yearly, meters, bk] = await Promise.all([
        dataUsageAPI.getNetworkToday(),
        dataUsageAPI.getNetworkDaily(30),
        dataUsageAPI.getNetworkDaily(365),
        dataUsageAPI.getNetworkMeters(7),
        dataUsageAPI.getNetworkBreakdown(7),
      ]);
      setNetworkToday(today);
      setNetworkDaily(daily);
      setNetworkYearly(yearly);
      setMeterRanking(meters);
      setNetworkBreakdown(bk);
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

  const getViewTotals = () => {
    if (view === "today") return { bytes: networkToday?.totalBytes || 0, cost: networkToday?.totalCost || 0, msgs: networkToday?.totalMsgs || 0 };
    if (view === "monthly") {
      const msgs = networkDaily?.daily?.reduce((s, d) => s + d.msgs, 0) || 0;
      return { bytes: networkDaily?.totalBytes || 0, cost: networkDaily?.totalCost || 0, msgs };
    }
    const msgs = networkYearly?.daily?.reduce((s, d) => s + d.msgs, 0) || 0;
    return { bytes: networkYearly?.totalBytes || 0, cost: networkYearly?.totalCost || 0, msgs };
  };

  const totals = getViewTotals();
  const viewLabel = view === "today" ? "Today's" : view === "monthly" ? "30-Day" : "Yearly";

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

  const aggregateMonthly = (daily) => {
    const months = {};
    daily.forEach(d => {
      const dt = new Date(d.date);
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      if (!months[key]) months[key] = { date: dt.toLocaleString("default", { month: "short", year: "2-digit" }), bytes: 0, cost: 0, msgs: 0, meters: 0 };
      months[key].bytes += d.bytes || 0;
      months[key].cost += d.cost || 0;
      months[key].msgs += d.msgs || 0;
      months[key].meters = Math.max(months[key].meters, d.meters || 0);
    });
    return Object.values(months);
  };

  const getDailyChartData = () => {
    const src = view === "yearly" ? networkYearly : networkDaily;
    if (!src?.daily) return [];
    if (view === "yearly") {
      return aggregateMonthly(src.daily).map(m => ({
        date: m.date,
        data: +(m.bytes / 1024).toFixed(1),
        cost: +m.cost.toFixed(4),
        meters: m.meters,
      }));
    }
    return src.daily.map(d => {
      const dt = new Date(d.date);
      return {
        date: `${dt.getDate()}/${dt.getMonth() + 1}`,
        data: +(d.bytes / 1024).toFixed(1),
        cost: d.cost,
        meters: d.meters,
      };
    });
  };

  const dailyChartData = getDailyChartData();

  return (
    <Box m="20px">
      <Header title="DATA USAGE" subtitle="Network-wide cellular data transmission monitoring & cost analysis" />

      <Box display="flex" justifyContent="space-between" alignItems="center" mb="20px">
        <ToggleButtonGroup value={view} exclusive onChange={(e, v) => { if (v) setView(v); }} size="small">
          <ToggleButton value="today" sx={{ textTransform: "none", px: 2 }}>Today</ToggleButton>
          <ToggleButton value="monthly" sx={{ textTransform: "none", px: 2 }}>30 Days</ToggleButton>
          <ToggleButton value="yearly" sx={{ textTransform: "none", px: 2 }}>Yearly</ToggleButton>
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
            title={`${viewLabel} Data`}
            value={formatBytes(totals.bytes)}
            subtitle={`${totals.msgs} messages`}
            icon={<DataUsageIcon sx={{ fontSize: 26, color: "#3b82f6" }} />}
            color="#3b82f6"
          />
        </Box>
        <Box gridColumn="span 3">
          <StatCard
            title={`${viewLabel} Cost`}
            value={`N$ ${totals.cost.toFixed(2)}`}
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
            value={totals.msgs.toLocaleString()}
            subtitle="Transmissions"
            icon={<MessageIcon sx={{ fontSize: 26, color: "#a855f7" }} />}
            color="#a855f7"
          />
        </Box>
      </Box>

      {/* Charts row */}
      <Box display="grid" gridTemplateColumns="repeat(12, 1fr)" gap="15px" mb="20px">
        <Box gridColumn="span 8" sx={{ bgcolor: cardBg, borderRadius: "12px", p: "20px" }}>
          <Typography sx={{ fontSize: "15px", fontWeight: 600, color: colors.grey[100], mb: "15px" }}>
            {view === "today" ? "Hourly Data Consumption (KB)" : view === "monthly" ? "Daily Data Consumption (KB)" : "Monthly Data Consumption (KB)"}
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

        <Box gridColumn="span 4" sx={{ bgcolor: cardBg, borderRadius: "12px", p: "20px" }}>
          <Typography sx={{ fontSize: "15px", fontWeight: 600, color: colors.grey[100], mb: "15px" }}>
            {view === "today" ? "Hourly Cost (N$)" : view === "monthly" ? "Daily Cost (N$)" : "Monthly Cost (N$)"}
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

      {/* Message Type Breakdown - Side by Side */}
      <Box display="grid" gridTemplateColumns="repeat(12, 1fr)" gap="15px" mb="20px">
        <Box gridColumn="span 6" sx={{ bgcolor: cardBg, borderRadius: "12px", p: "20px" }}>
          <Typography sx={{ fontSize: "15px", fontWeight: 600, color: colors.grey[100], mb: "15px" }}>
            Data Size by Message Type (7 Days)
          </Typography>
          {networkBreakdown?.breakdown?.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={networkBreakdown.breakdown}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(148,163,184,0.1)" : "rgba(0,0,0,0.06)"} />
                <XAxis dataKey="type" tick={{ fill: colors.grey[400], fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: colors.grey[400], fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1024 ? `${(v / 1024).toFixed(1)} KB` : `${v} B`} />
                <RTooltip
                  contentStyle={{ backgroundColor: isDark ? "#1e293b" : "#fff", border: "none", borderRadius: 8, fontSize: 13 }}
                  formatter={(val) => [val >= 1024 ? `${(val / 1024).toFixed(1)} KB` : `${val} B`, "Data Size"]}
                />
                <Bar dataKey="bytes" fill="#3b82f6" radius={[6, 6, 0, 0]} name="Data Size" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Box sx={{ textAlign: "center", py: 8 }}>
              <Typography sx={{ color: colors.grey[400], fontSize: 14 }}>No data available yet.</Typography>
            </Box>
          )}
        </Box>
        <Box gridColumn="span 6" sx={{ bgcolor: cardBg, borderRadius: "12px", p: "20px" }}>
          <Typography sx={{ fontSize: "15px", fontWeight: 600, color: colors.grey[100], mb: "15px" }}>
            Message Count by Type (7 Days)
          </Typography>
          {networkBreakdown?.breakdown?.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={networkBreakdown.breakdown}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(148,163,184,0.1)" : "rgba(0,0,0,0.06)"} />
                <XAxis dataKey="type" tick={{ fill: colors.grey[400], fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: colors.grey[400], fontSize: 11 }} axisLine={false} tickLine={false} />
                <RTooltip
                  contentStyle={{ backgroundColor: isDark ? "#1e293b" : "#fff", border: "none", borderRadius: 8, fontSize: 13 }}
                  formatter={(val) => [val.toLocaleString(), "Messages"]}
                />
                <Bar dataKey="count" fill="#a855f7" radius={[6, 6, 0, 0]} name="Messages" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Box sx={{ textAlign: "center", py: 8 }}>
              <Typography sx={{ color: colors.grey[400], fontSize: 14 }}>No data available yet.</Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* Message Type Breakdown - Donut Chart */}
      <Box display="grid" gridTemplateColumns="repeat(12, 1fr)" gap="15px" mb="20px">
        <Box gridColumn="span 12" sx={{ bgcolor: cardBg, borderRadius: "12px", p: "20px" }}>
          <Typography sx={{ fontSize: "15px", fontWeight: 600, color: colors.grey[100], mb: "15px" }}>
            Message Type Breakdown (7 Days)
          </Typography>
          {networkBreakdown?.breakdown?.length > 0 ? (
            <Box display="flex" alignItems="center" justifyContent="center" gap="40px">
              <ResponsiveContainer width="45%" height={280}>
                <PieChart>
                  <Pie
                    data={networkBreakdown.breakdown.map(b => ({ name: b.type, value: b.bytes }))}
                    cx="50%" cy="50%" innerRadius={70} outerRadius={120}
                    paddingAngle={3} dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {networkBreakdown.breakdown.map((b, i) => (
                      <RCell key={b.type} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <RTooltip
                    contentStyle={{ backgroundColor: isDark ? "#1e293b" : "#fff", border: "none", borderRadius: 8, fontSize: 13 }}
                    formatter={(val) => [formatBytes(val), "Data"]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <Box>
                {networkBreakdown.breakdown.map((b, i) => (
                  <Box key={b.type} display="flex" alignItems="center" gap="10px" mb="8px">
                    <Box sx={{ width: 12, height: 12, borderRadius: "3px", bgcolor: COLORS[i % COLORS.length] }} />
                    <Typography sx={{ fontSize: 13, color: colors.grey[200], minWidth: 90 }}>{b.type}</Typography>
                    <Typography sx={{ fontSize: 13, color: colors.grey[100], fontWeight: 600 }}>{formatBytes(b.bytes)}</Typography>
                    <Typography sx={{ fontSize: 12, color: colors.grey[400] }}>({b.count} msgs)</Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          ) : (
            <Box sx={{ textAlign: "center", py: 8 }}>
              <Typography sx={{ color: colors.grey[400], fontSize: 14 }}>No data available yet.</Typography>
            </Box>
          )}
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
