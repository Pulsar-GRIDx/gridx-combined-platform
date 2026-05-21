import { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, useTheme, Grid, CircularProgress, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Tab, Tabs, Select, MenuItem,
  TextField, Button, Snackbar, Alert, FormControl, InputLabel,
  IconButton, InputAdornment, Tooltip,
} from "@mui/material";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
} from "recharts";
import Header from "../components/Header";
import { tokens } from "../theme";
import { netMeteringAPI } from "../services/api";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import RefreshIcon from "@mui/icons-material/Refresh";
import SettingsIcon from "@mui/icons-material/Settings";
import SaveIcon from "@mui/icons-material/Save";
import EditIcon from "@mui/icons-material/Edit";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import ElectricMeterOutlinedIcon from "@mui/icons-material/ElectricMeterOutlined";
import BoltIcon from "@mui/icons-material/Bolt";
import SolarPowerIcon from "@mui/icons-material/SolarPower";
import OpenInNewOutlinedIcon from "@mui/icons-material/OpenInNewOutlined";
import ElectricBoltIcon from "@mui/icons-material/ElectricBolt";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import { useNavigate } from "react-router-dom";

// Tariff rates (N$ per kWh)
var TARIFF_RETAIL = 2.45;
var TARIFF_FEEDIN = 1.60;

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

function SummaryCard({ colors, label, value, icon, color, subtitle }) {
  var Icon = icon;
  return (
    <Box sx={{ backgroundColor: colors.primary[400], borderRadius: "8px", p: "16px 20px", display: "flex", alignItems: "center", gap: "14px", flex: 1, minWidth: "180px" }}>
      <Box sx={{ width: 44, height: 44, borderRadius: "10px", bgcolor: color + "18", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon sx={{ color: color, fontSize: 22 }} />
      </Box>
      <Box>
        <Typography fontSize="22px" fontWeight="700" color={colors.grey[100]}>{value}</Typography>
        <Typography fontSize="12px" color={colors.grey[400]}>{label}</Typography>
        {subtitle && <Typography fontSize="10px" color={colors.grey[500]}>{subtitle}</Typography>}
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
          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? colors.grey[700] : "#f0f0f0"} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: colors.grey[400] }} />
          <YAxis tick={{ fontSize: 10, fill: colors.grey[400] }} label={{ value: "kWh", angle: -90, position: "insideLeft", style: { fontSize: 10, fill: colors.grey[400] } }} />
          <RechartsTooltip contentStyle={{ backgroundColor: isDark ? colors.primary[500] : "#fff", border: "1px solid " + colors.grey[600], borderRadius: "8px", fontSize: "12px" }} />
          <Bar dataKey="delivered" fill={COLOR_DELIVERED} name="Delivered to Customer (kWh)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="received" fill={COLOR_RECEIVED} name="Received from Solar (kWh)" radius={[4, 4, 0, 0]} />
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
          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? colors.grey[700] : "#f0f0f0"} />
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

function processChartData(raw) {
  return (raw || []).map(function(d) {
    var deliveredKwh = (d.import || 0) / 1000;
    var receivedKwh = (d.export || 0) / 1000;
    return {
      label: d.label || "",
      delivered: Number(deliveredKwh.toFixed(2)),
      received: Number(receivedKwh.toFixed(2)),
      revenue: Number((deliveredKwh * TARIFF_RETAIL).toFixed(2)),
      feedInCost: Number((receivedKwh * TARIFF_FEEDIN).toFixed(2)),
    };
  });
}

function FleetDashboardTab({ colors, isDark, dashData, activeMeters, lastUpdated, allPeriodData, fetchDashboard }) {
  var totalDelivered = dashData?.total_import || 0;
  var totalReceived = dashData?.total_export || 0;
  var totalMeters = dashData?.total_meters || activeMeters.length || 0;
  var salesRevenue = (totalDelivered / 1000) * TARIFF_RETAIL;
  var feedInCost = (totalReceived / 1000) * TARIFF_FEEDIN;
  var netRevenue = salesRevenue - feedInCost;
  var todayDelivered = dashData?.today_import || 0;
  var todayReceived = dashData?.today_export || 0;
  var todayRevenue = (todayDelivered / 1000) * TARIFF_RETAIL;
  var todayFeedIn = (todayReceived / 1000) * TARIFF_FEEDIN;

  var hourlyData = (dashData?.hourly || []).map(function(h, i) {
    return {
      hour: String(i).padStart(2, "0") + ":00",
      delivered: (h?.import || 0) / 1000,
      received: (h?.export || 0) / 1000,
    };
  });

  var dailyData = processChartData(allPeriodData.daily);
  var weeklyData = processChartData(allPeriodData.thisweek);
  var monthlyData = processChartData(allPeriodData.thisyear);
  var yearlyData = processChartData(allPeriodData.yearly);

  var consumingMeters = activeMeters.filter(function(m) { return m.power_direction === "IMPORT"; }).length;
  var feedingMeters = activeMeters.filter(function(m) { return m.power_direction === "EXPORT"; }).length;

  var cardStyle = { p: "20px", borderRadius: "8px", bgcolor: colors.primary[400] };

  return (
    <>
      {/* Summary Cards - Utility Perspective */}
      <Box display="flex" gap="12px" mb="16px" flexWrap="wrap">
        <SummaryCard colors={colors} label="Net Metered Customers" value={totalMeters} icon={ElectricMeterOutlinedIcon} color={COLOR_DELIVERED}
          subtitle={consumingMeters + " consuming, " + feedingMeters + " feeding in"} />
        <SummaryCard colors={colors} label="Today's Grid Supply" value={toKwh(todayDelivered) + " kWh"} icon={ElectricBoltIcon} color={COLOR_DELIVERED}
          subtitle={"Revenue: " + fmtCurrency(todayRevenue)} />
        <SummaryCard colors={colors} label="Today's Solar Feed-in" value={toKwh(todayReceived) + " kWh"} icon={SolarPowerIcon} color={COLOR_RECEIVED}
          subtitle={"Feed-in credit: " + fmtCurrency(todayFeedIn)} />
        <SummaryCard colors={colors} label="Net Revenue" value={fmtCurrency(netRevenue)} icon={AttachMoneyIcon} color={netRevenue >= 0 ? COLOR_REVENUE : COLOR_COST}
          subtitle={netRevenue >= 0 ? "Positive margin" : "Feed-in exceeds sales"} />
      </Box>

      <Box display="flex" gap="12px" mb="16px" alignItems="center" justifyContent="flex-end">
        {lastUpdated && <Typography sx={{ fontSize: "11px", color: colors.grey[400] }}>Updated {lastUpdated.toLocaleTimeString()}</Typography>}
        <IconButton size="small" onClick={function() { fetchDashboard(false); }} sx={{ color: colors.grey[400], "&:hover": { color: COLOR_DELIVERED } }}>
          <RefreshIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>

      {/* Row 1: Hourly Flow + Utility Balance */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={8}>
          <Box sx={cardStyle}>
            <Typography sx={{ fontSize: "14px", fontWeight: 700, color: colors.grey[100], mb: 2 }}>Today - Hourly Grid Activity</Typography>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={hourlyData}>
                <defs>
                  <linearGradient id="gradDelivered" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLOR_DELIVERED} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLOR_DELIVERED} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradReceived" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLOR_RECEIVED} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLOR_RECEIVED} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? colors.grey[700] : "#f0f0f0"} />
                <XAxis dataKey="hour" tick={{ fontSize: 10, fill: colors.grey[400] }} />
                <YAxis tick={{ fontSize: 10, fill: colors.grey[400] }} label={{ value: "kWh", angle: -90, position: "insideLeft", style: { fontSize: 10, fill: colors.grey[400] } }} />
                <RechartsTooltip contentStyle={{ backgroundColor: isDark ? colors.primary[500] : "#fff", border: "1px solid " + colors.grey[600], borderRadius: "8px", fontSize: "12px" }} />
                <Area type="monotone" dataKey="delivered" stroke={COLOR_DELIVERED} fill="url(#gradDelivered)" name="Grid Supply (kWh)" strokeWidth={2} />
                <Area type="monotone" dataKey="received" stroke={COLOR_RECEIVED} fill="url(#gradReceived)" name="Solar Feed-in (kWh)" strokeWidth={2} />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
              </AreaChart>
            </ResponsiveContainer>
          </Box>
        </Grid>
        <Grid item xs={12} md={4}>
          <Box sx={{ ...cardStyle, height: "100%", display: "flex", flexDirection: "column" }}>
            <Typography sx={{ fontSize: "14px", fontWeight: 700, color: colors.grey[100], mb: 2 }}>Utility Net Position</Typography>
            <Box sx={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 1.5 }}>
              <Box sx={{
                width: 100, height: 100, borderRadius: "50%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                background: netRevenue >= 0 ? "linear-gradient(135deg, rgba(76,175,80,0.08), rgba(76,175,80,0.16))" : "linear-gradient(135deg, rgba(244,67,54,0.08), rgba(244,67,54,0.16))",
                border: "3px solid " + (netRevenue >= 0 ? COLOR_REVENUE : COLOR_COST),
              }}>
                <Typography sx={{ fontSize: "14px", fontWeight: 800, color: netRevenue >= 0 ? COLOR_REVENUE : COLOR_COST }}>
                  {fmtCurrency(Math.abs(netRevenue))}
                </Typography>
                <Typography sx={{ fontSize: "9px", color: colors.grey[400] }}>Net Revenue</Typography>
              </Box>
              <Chip label={netRevenue >= 0 ? "Positive Margin" : "Negative Margin"} size="small"
                sx={{ bgcolor: (netRevenue >= 0 ? COLOR_REVENUE : COLOR_COST) + "20", color: netRevenue >= 0 ? COLOR_REVENUE : COLOR_COST, fontWeight: 600, fontSize: "10px" }} />

              <Box sx={{ display: "flex", gap: 3, mt: 1 }}>
                <Box sx={{ textAlign: "center" }}>
                  <Typography sx={{ fontSize: "9px", color: COLOR_DELIVERED, fontWeight: 600 }}>GRID SUPPLY</Typography>
                  <Typography sx={{ fontSize: "14px", fontWeight: 700, color: colors.grey[100] }}>{toKwh(totalDelivered)}</Typography>
                  <Typography sx={{ fontSize: "10px", color: colors.grey[400] }}>kWh delivered</Typography>
                </Box>
                <Box sx={{ width: "1px", bgcolor: colors.grey[600] }} />
                <Box sx={{ textAlign: "center" }}>
                  <Typography sx={{ fontSize: "9px", color: COLOR_RECEIVED, fontWeight: 600 }}>SOLAR FEED-IN</Typography>
                  <Typography sx={{ fontSize: "14px", fontWeight: 700, color: colors.grey[100] }}>{toKwh(totalReceived)}</Typography>
                  <Typography sx={{ fontSize: "10px", color: colors.grey[400] }}>kWh received</Typography>
                </Box>
              </Box>

              <Box sx={{ width: "100%", mt: 1.5, px: 1 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                  <Typography sx={{ fontSize: "10px", color: colors.grey[300] }}>Sales Revenue</Typography>
                  <Typography sx={{ fontSize: "11px", fontWeight: 700, color: COLOR_REVENUE }}>{fmtCurrency(salesRevenue)}</Typography>
                </Box>
                <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                  <Typography sx={{ fontSize: "10px", color: colors.grey[300] }}>Feed-in Credits</Typography>
                  <Typography sx={{ fontSize: "11px", fontWeight: 700, color: COLOR_COST }}>-{fmtCurrency(feedInCost)}</Typography>
                </Box>
                <Box sx={{ height: "1px", bgcolor: colors.grey[700], my: 0.5 }} />
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography sx={{ fontSize: "10px", fontWeight: 600, color: colors.grey[200] }}>Net</Typography>
                  <Typography sx={{ fontSize: "12px", fontWeight: 700, color: netRevenue >= 0 ? COLOR_REVENUE : COLOR_COST }}>{fmtCurrency(netRevenue)}</Typography>
                </Box>
              </Box>
            </Box>

            <Box sx={{ mt: 1, pt: 1.5, borderTop: "1px solid " + colors.grey[700] }}>
              <Typography sx={{ fontSize: "10px", fontWeight: 600, color: colors.grey[300], mb: 0.5 }}>Tariff Rates</Typography>
              <Box sx={{ display: "flex", gap: 2 }}>
                <Box>
                  <Typography sx={{ fontSize: "9px", color: COLOR_DELIVERED, fontWeight: 600 }}>RETAIL</Typography>
                  <Typography sx={{ fontSize: "13px", fontWeight: 700, color: colors.grey[100] }}>N$ {TARIFF_RETAIL}</Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: "9px", color: COLOR_RECEIVED, fontWeight: 600 }}>FEED-IN</Typography>
                  <Typography sx={{ fontSize: "13px", fontWeight: 700, color: colors.grey[100] }}>N$ {TARIFF_FEEDIN}</Typography>
                </Box>
              </Box>
            </Box>
          </Box>
        </Grid>
      </Grid>

      {/* This Week: Mon-Sun */}
      <Grid container spacing={2} sx={{ mb: 0 }}>
        <Grid item xs={12} md={6}>
          <EnergyBarChart colors={colors} isDark={isDark} title="This Week - Energy (Mon-Sun)" data={weeklyData} />
        </Grid>
        <Grid item xs={12} md={6}>
          <RevenueBarChart colors={colors} isDark={isDark} title="This Week - Revenue & Feed-in Cost (Mon-Sun)" data={weeklyData} />
        </Grid>
      </Grid>

      {/* Daily: Last 30 Days */}
      <Grid container spacing={2} sx={{ mb: 0 }}>
        <Grid item xs={12} md={6}>
          <EnergyBarChart colors={colors} isDark={isDark} title="Daily Energy - Last 30 Days" data={dailyData} height={280} />
        </Grid>
        <Grid item xs={12} md={6}>
          <RevenueBarChart colors={colors} isDark={isDark} title="Daily Revenue & Feed-in Cost - Last 30 Days" data={dailyData} height={280} />
        </Grid>
      </Grid>

      {/* Monthly: Jan-Dec */}
      <Grid container spacing={2} sx={{ mb: 0 }}>
        <Grid item xs={12} md={6}>
          <EnergyBarChart colors={colors} isDark={isDark} title="Monthly Energy - This Year (Jan-Dec)" data={monthlyData} />
        </Grid>
        <Grid item xs={12} md={6}>
          <RevenueBarChart colors={colors} isDark={isDark} title="Monthly Revenue & Feed-in Cost (Jan-Dec)" data={monthlyData} />
        </Grid>
      </Grid>

      {/* Yearly: All Time */}
      <Grid container spacing={2} sx={{ mb: 0 }}>
        <Grid item xs={12} md={6}>
          <EnergyBarChart colors={colors} isDark={isDark} title="Yearly Energy - All Time" data={yearlyData} />
        </Grid>
        <Grid item xs={12} md={6}>
          <RevenueBarChart colors={colors} isDark={isDark} title="Yearly Revenue & Feed-in Cost - All Time" data={yearlyData} />
        </Grid>
      </Grid>
    </>
  );
}

function ActiveMetersTab({ colors, isDark, activeMeters, fetchDashboard, lastUpdated }) {
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
        <SummaryCard colors={colors} label="Feeding In (Solar)" value={feedingCnt} icon={SolarPowerIcon} color={COLOR_RECEIVED} subtitle="Sending to grid" />
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
            <MenuItem value="feeding">Feeding In (Solar)</MenuItem>
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
            <SolarPowerIcon sx={{ fontSize: 48, color: COLOR_DELIVERED, opacity: 0.4 }} />
            <Typography color={colors.grey[400]}>No net metering customers found</Typography>
          </Box>
        ) : (
          <TableContainer sx={{ maxHeight: "600px" }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {["DRN", "Customer", "Flow Direction", "Live Power", "Grid Supply (kWh)", "Solar Feed-in (kWh)", "Net (kWh)", "Revenue", "Last Seen", "Status", ""].map(function(h) {
                    return <TableCell key={h} sx={{ backgroundColor: colors.primary[400], color: colors.grey[100], fontWeight: 700, borderBottom: "1px solid " + colors.grey[700], fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px" }}
                      align={["Live Power", "Grid Supply (kWh)", "Solar Feed-in (kWh)", "Net (kWh)", "Revenue"].includes(h) ? "right" : "left"}>{h}</TableCell>;
                  })}
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map(function(m) {
                  var delivered = m.total_import || 0;
                  var received = m.total_export || 0;
                  var netKwh = (delivered - received) / 1000;
                  var meterRevenue = (delivered / 1000) * TARIFF_RETAIL - (received / 1000) * TARIFF_FEEDIN;
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
    { value: 0, label: "Gross Metering", desc: "Energy billed at full retail rate. Solar feed-in is recorded but not credited against consumption." },
    { value: 1, label: "Net Billing", desc: "Customer pays net of consumption minus generation. Feed-in offsets grid supply in the same billing period." },
    { value: 2, label: "Feed-in Tariff", desc: "Solar feed-in is credited at a separate feed-in rate (typically lower than retail). Configurable per meter." },
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
          Configure how the utility bills each net metered customer. Determines how solar feed-in is credited against grid consumption. Changes are pushed to meters via MQTT.
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
  var [activeTab, setActiveTab] = useState(0);
  var [allPeriodData, setAllPeriodData] = useState({ daily: [], thisweek: [], thisyear: [], yearly: [] });

  var fetchDashboard = useCallback(async function(showLoading) {
    if (showLoading) setLoading(true);
    try {
      var [dashRes, metersRes, dailyRes, weekRes, monthRes, yearRes] = await Promise.allSettled([
        netMeteringAPI.getDashboard(),
        netMeteringAPI.getActiveMeters(),
        netMeteringAPI.getDashboard("daily"),
        netMeteringAPI.getDashboard("thisweek"),
        netMeteringAPI.getDashboard("thisyear"),
        netMeteringAPI.getDashboard("yearly"),
      ]);
      if (dashRes.status === "fulfilled" && dashRes.value?.data) setDashData(dashRes.value.data);
      if (metersRes.status === "fulfilled" && metersRes.value?.data) setActiveMeters(metersRes.value.data);
      setAllPeriodData({
        daily: dailyRes.status === "fulfilled" ? dailyRes.value?.data?.daily || [] : [],
        thisweek: weekRes.status === "fulfilled" ? weekRes.value?.data?.daily || [] : [],
        thisyear: monthRes.status === "fulfilled" ? monthRes.value?.data?.daily || [] : [],
        yearly: yearRes.status === "fulfilled" ? yearRes.value?.data?.daily || [] : [],
      });
      setLastUpdated(new Date());
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(function() {
    fetchDashboard(true);
    var interval = setInterval(function() { fetchDashboard(false); }, 30000);
    return function() { clearInterval(interval); };
  }, [fetchDashboard]);

  var tabLabels = ["Fleet Dashboard", "Active Meters", "Configuration"];
  var tabSubtitles = [
    "Utility-wide net metering analytics - grid supply vs solar feed-in",
    "All net metered customers - live status and energy flow",
    "Billing mode configuration per customer meter",
  ];

  if (loading) {
    return (
      <Box m="20px">
        <Header title="NET METERING" subtitle="Utility Net Metering Management" />
        <Box sx={{ display: "flex", justifyContent: "center", mt: "80px" }}><CircularProgress sx={{ color: COLOR_DELIVERED }} /></Box>
      </Box>
    );
  }

  return (
    <Box m="20px">
      <Header title="NET METERING" subtitle={tabSubtitles[activeTab]} />
      <Tabs value={activeTab} onChange={function(_, v) { setActiveTab(v); }}
        sx={{
          mb: "20px",
          "& .MuiTab-root": { color: colors.grey[300], textTransform: "none", fontWeight: 600, fontSize: "14px", "&.Mui-selected": { color: COLOR_DELIVERED } },
          "& .MuiTabs-indicator": { backgroundColor: COLOR_DELIVERED, height: "3px", borderRadius: "3px 3px 0 0" },
        }}>
        {tabLabels.map(function(label) { return <Tab key={label} label={label} />; })}
      </Tabs>

      {activeTab === 0 && <FleetDashboardTab colors={colors} isDark={isDark} dashData={dashData} activeMeters={activeMeters} lastUpdated={lastUpdated} allPeriodData={allPeriodData} fetchDashboard={fetchDashboard} />}
      {activeTab === 1 && <ActiveMetersTab colors={colors} isDark={isDark} activeMeters={activeMeters} fetchDashboard={fetchDashboard} lastUpdated={lastUpdated} />}
      {activeTab === 2 && <ConfigurationTab colors={colors} isDark={isDark} activeMeters={activeMeters} />}
    </Box>
  );
}
