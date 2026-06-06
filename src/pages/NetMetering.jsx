import { useState, useEffect, useCallback, useMemo } from "react";
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
import ChevronLeftOutlinedIcon from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlinedIcon from "@mui/icons-material/ChevronRightOutlined";
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
          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#334155" : "#D1D5DB"} />
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

function processChartData(raw) {
  return (raw || []).map(function(d) {
    var deliveredKwh = safeNum(d.import) / 1000;
    var receivedKwh = safeNum(d.export) / 1000;
    return {
      label: d.label || "",
      date: d.date || d.label || "",
      delivered: safeNum(deliveredKwh.toFixed(2)),
      received: safeNum(receivedKwh.toFixed(2)),
      revenue: safeNum((deliveredKwh * TARIFF_RETAIL).toFixed(2)),
      feedInCost: safeNum((receivedKwh * TARIFF_FEEDIN).toFixed(2)),
    };
  });
}

function FleetDashboardTab({ colors, isDark, dashData, activeMeters, lastUpdated, allPeriodData, fetchDashboard }) {
  // Navigation offsets: 0 = current, -1 = previous, etc.
  var _weekState = useState(0);
  var weekOffset = _weekState[0]; var setWeekOffset = _weekState[1];
  var _monthState = useState(0);
  var monthOffset = _monthState[0]; var setMonthOffset = _monthState[1];
  var _yearState = useState(0);
  var yearOffset = _yearState[0]; var setYearOffset = _yearState[1];

  var totalDelivered = safeNum(dashData?.total_import);
  var totalReceived = safeNum(dashData?.total_export);
  var totalMeters = safeNum(dashData?.total_meters) || activeMeters.length || 0;
  var salesRevenue = (totalDelivered / 1000) * TARIFF_RETAIL;
  var feedInCost = (totalReceived / 1000) * TARIFF_FEEDIN;
  var netRevenue = salesRevenue - feedInCost;
  var todayDelivered = safeNum(dashData?.today_import);
  var todayReceived = safeNum(dashData?.today_export);
  var todayRevenue = (todayDelivered / 1000) * TARIFF_RETAIL;
  var todayFeedIn = (todayReceived / 1000) * TARIFF_FEEDIN;

  var hourlyData = (dashData?.hourly || []).map(function(h, i) {
    return {
      hour: String(i).padStart(2, "0") + ":00",
      delivered: safeNum(safeNum(h?.import) / 1000),
      received: safeNum(safeNum(h?.export) / 1000),
    };
  });

  var allDailyData = processChartData(allPeriodData.daily);
  var allMonthlyData = processChartData(allPeriodData.thisyear);
  var allYearlyData = processChartData(allPeriodData.yearly);

  // ---- Date helpers ----
  var MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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

  function fmtDate(d) {
    return MONTH_SHORT[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
  }

  function dateToStr(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function daysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  }

  // ---- Weekly data with navigation ----
  var weekInfo = useMemo(function() {
    var now = new Date();
    var thisMonday = getMonday(now);
    var targetMonday = addDays(thisMonday, weekOffset * 7);
    var targetSunday = addDays(targetMonday, 6);
    var label = fmtDate(targetMonday) + " - " + fmtDate(targetSunday);

    // Build the 7-day range
    var weekDates = [];
    for (var i = 0; i < 7; i++) {
      weekDates.push(dateToStr(addDays(targetMonday, i)));
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

    var data = weekDates.map(function(ds, idx) {
      var existing = dateMap[ds];
      if (existing) {
        return { ...existing, label: DAY_SHORT[idx] };
      }
      return { label: DAY_SHORT[idx], date: ds, delivered: 0, received: 0, revenue: 0, feedInCost: 0 };
    });

    return { label: label, data: data, monday: targetMonday, sunday: targetSunday };
  }, [weekOffset, allDailyData]);

  var weeklyData = weekInfo.data;

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

  // --- Hourly insights ---
  var currentHourIdx = new Date().getHours();
  var currentHourImport = hourlyData[currentHourIdx] ? safeNum(hourlyData[currentHourIdx].delivered) : 0;
  var currentHourExport = hourlyData[currentHourIdx] ? safeNum(hourlyData[currentHourIdx].received) : 0;
  var peakHourVal = 0; var peakHourLabel = "--";
  hourlyData.forEach(function(h) {
    var total = safeNum(h.delivered) + safeNum(h.received);
    if (total > peakHourVal) { peakHourVal = total; peakHourLabel = h.hour; }
  });
  var todayTotalUsage = (todayDelivered / 1000) + (todayReceived / 1000);
  var gridDependencyPct = todayTotalUsage > 0 ? ((todayDelivered / 1000) / todayTotalUsage * 100) : 0;

  // --- Weekly insights ---
  var weekTotalImport = 0; var weekTotalExport = 0;
  var bestExportDay = ""; var bestExportVal = 0;
  weeklyData.forEach(function(d) {
    weekTotalImport += safeNum(d.delivered);
    weekTotalExport += safeNum(d.received);
    if (safeNum(d.received) > bestExportVal) { bestExportVal = safeNum(d.received); bestExportDay = d.label; }
  });
  var weekSavings = weekTotalExport * TARIFF_FEEDIN;
  var weekRevenue = weekTotalImport * TARIFF_RETAIL;
  var weekNetRevenue = weekRevenue - weekSavings;

  // --- Monthly insights ---
  var monthTotalImport = 0; var monthTotalExport = 0;
  monthlyChartData.forEach(function(d) { monthTotalImport += safeNum(d.delivered); monthTotalExport += safeNum(d.received); });
  var monthNetBalance = (monthTotalImport - monthTotalExport);
  var selfConsumptionRate = (monthTotalImport + monthTotalExport) > 0
    ? (monthTotalImport / (monthTotalImport + monthTotalExport) * 100) : 0;
  var monthRevenue = monthTotalImport * TARIFF_RETAIL;
  var monthFeedInCost = monthTotalExport * TARIFF_FEEDIN;
  var monthNetRevenue = monthRevenue - monthFeedInCost;

  // --- Yearly insights ---
  var yearTotalImport = 0; var yearTotalExport = 0;
  yearlyChartData.forEach(function(d) { yearTotalImport += safeNum(d.delivered); yearTotalExport += safeNum(d.received); });
  var yearRevenue = yearTotalImport * TARIFF_RETAIL;
  var yearFeedInCost = yearTotalExport * TARIFF_FEEDIN;
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

  // --- Navigation header helper ---
  var NavHeader = function(props) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", mb: "4px" }}>
        <IconButton size="small" onClick={props.onPrev} sx={{ color: colors.grey[300], border: "1px solid " + (isDark ? colors.grey[700] : "#ddd"), borderRadius: "8px", width: 32, height: 32, "&:hover": { bgcolor: isDark ? "rgba(37,99,235,0.08)" : "#EFF6FF", borderColor: COLOR_DELIVERED } }}>
          <ChevronLeftOutlinedIcon sx={{ fontSize: 18 }} />
        </IconButton>
        <Typography sx={{ fontSize: "14px", fontWeight: 700, color: colors.grey[100], minWidth: "200px", textAlign: "center" }}>
          {props.label}
        </Typography>
        <IconButton size="small" onClick={props.onNext} disabled={props.disableNext} sx={{ color: props.disableNext ? colors.grey[600] : colors.grey[300], border: "1px solid " + (isDark ? colors.grey[700] : "#ddd"), borderRadius: "8px", width: 32, height: 32, "&:hover": { bgcolor: props.disableNext ? "transparent" : (isDark ? "rgba(37,99,235,0.08)" : "#EFF6FF"), borderColor: props.disableNext ? (isDark ? colors.grey[700] : "#ddd") : COLOR_DELIVERED } }}>
          <ChevronRightOutlinedIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>
    );
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
        <SummaryCard colors={colors} label="Net Metered Customers" value={totalMeters} icon={ElectricMeterOutlinedIcon} color={COLOR_DELIVERED}
          subtitle={consumingMeters + " consuming, " + feedingMeters + " feeding in"} />
        <SummaryCard colors={colors} label="Today's Grid Supply" value={toKwh(todayDelivered) + " kWh"} icon={ElectricBoltIcon} color={COLOR_DELIVERED}
          subtitle={"Revenue: " + fmtCurrency(todayRevenue)} />
        <SummaryCard colors={colors} label="Today's Solar Feed-in" value={toKwh(todayReceived) + " kWh"} icon={SolarPowerIcon} color={COLOR_RECEIVED}
          subtitle={"Feed-in credit: " + fmtCurrency(todayFeedIn)} />
        <SummaryCard colors={colors} label="Net Revenue" value={fmtCurrency(netRevenue)} icon={AttachMoneyIcon} color={netRevenue >= 0 ? COLOR_REVENUE : COLOR_COST}
          subtitle={netRevenue >= 0 ? "Positive margin" : "Feed-in exceeds sales"} />
      </Box>

      <Box display="flex" gap="12px" mb="24px" alignItems="center" justifyContent="flex-end">
        {lastUpdated && <Typography sx={{ fontSize: "11px", color: colors.grey[400] }}>Updated {lastUpdated.toLocaleTimeString()}</Typography>}
        <IconButton size="small" onClick={function() { fetchDashboard(false); }} sx={{ color: colors.grey[400], "&:hover": { color: COLOR_DELIVERED } }}>
          <RefreshIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>

      {/* ===== SECTION 1: HOURLY (Today) ===== */}
      <Box sx={{ mb: "12px" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: "12px", mb: "6px" }}>
          <Box sx={{ width: 5, height: 28, borderRadius: "3px", background: "linear-gradient(180deg, " + COLOR_DELIVERED + ", " + COLOR_RECEIVED + ")" }} />
          <Box>
            <Typography sx={{ fontSize: "18px", fontWeight: 800, color: colors.grey[100], letterSpacing: "-0.3px" }}>Hourly Grid Activity</Typography>
            <Typography sx={{ fontSize: "12px", color: colors.grey[400] }}>Real-time energy flow for today — import vs solar feed-in by hour</Typography>
          </Box>
        </Box>
      </Box>
      {/* Hourly KPIs */}
      <Box display="flex" gap="14px" mb="16px" flexWrap="wrap">
        <Box sx={kpiCardSx(COLOR_DELIVERED)}>
          <Typography sx={{ fontSize: "10px", fontWeight: 600, color: colors.grey[400], textTransform: "uppercase", letterSpacing: "0.5px" }}>Current Hour Import</Typography>
          <Typography sx={{ fontSize: "22px", fontWeight: 800, color: colors.grey[100], mt: "4px" }}>{currentHourImport.toFixed(2)} kWh</Typography>
          <Typography sx={{ fontSize: "10px", color: colors.grey[500], mt: "2px" }}>Hour {String(currentHourIdx).padStart(2, "0")}:00</Typography>
        </Box>
        <Box sx={kpiCardSx(COLOR_RECEIVED)}>
          <Typography sx={{ fontSize: "10px", fontWeight: 600, color: colors.grey[400], textTransform: "uppercase", letterSpacing: "0.5px" }}>Current Hour Export</Typography>
          <Typography sx={{ fontSize: "22px", fontWeight: 800, color: colors.grey[100], mt: "4px" }}>{currentHourExport.toFixed(2)} kWh</Typography>
          <Typography sx={{ fontSize: "10px", color: colors.grey[500], mt: "2px" }}>Solar feed-in this hour</Typography>
        </Box>
        <Box sx={kpiCardSx("#ab47bc")}>
          <Typography sx={{ fontSize: "10px", fontWeight: 600, color: colors.grey[400], textTransform: "uppercase", letterSpacing: "0.5px" }}>Peak Hour Today</Typography>
          <Typography sx={{ fontSize: "22px", fontWeight: 800, color: colors.grey[100], mt: "4px" }}>{peakHourLabel}</Typography>
          <Typography sx={{ fontSize: "10px", color: colors.grey[500], mt: "2px" }}>{peakHourVal.toFixed(2)} kWh total flow</Typography>
        </Box>
        <Box sx={kpiCardSx(gridDependencyPct > 60 ? COLOR_COST : COLOR_REVENUE)}>
          <Typography sx={{ fontSize: "10px", fontWeight: 600, color: colors.grey[400], textTransform: "uppercase", letterSpacing: "0.5px" }}>Grid Dependency</Typography>
          <Typography sx={{ fontSize: "22px", fontWeight: 800, color: colors.grey[100], mt: "4px" }}>{gridDependencyPct.toFixed(1)}%</Typography>
          <Typography sx={{ fontSize: "10px", color: gridDependencyPct > 60 ? COLOR_COST : COLOR_REVENUE, fontWeight: 600, mt: "2px" }}>
            {gridDependencyPct > 60 ? "High grid reliance" : "Good solar offset"}
          </Typography>
        </Box>
      </Box>
      {/* Hourly Chart — AreaChart, full width */}
      <Box sx={{ ...sectionCardSx, mb: 0 }}>
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
            <Area type="monotone" dataKey="received" stroke={COLOR_RECEIVED} fill="url(#gradReceivedFull)" name="Solar Feed-in (kWh)" strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 2 }} />
            <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "12px" }} />
          </AreaChart>
        </ResponsiveContainer>
      </Box>

      {/* ===== DIVIDER ===== */}
      <Box sx={sectionDividerSx} />

      {/* ===== SECTION 2: WEEKLY (Navigable Mon-Sun) ===== */}
      <Box sx={{ mb: "12px" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: "12px", mb: "6px" }}>
          <Box sx={{ width: 5, height: 28, borderRadius: "3px", background: "linear-gradient(180deg, " + COLOR_REVENUE + ", " + COLOR_DELIVERED + ")" }} />
          <Box flex={1}>
            <Typography sx={{ fontSize: "18px", fontWeight: 800, color: colors.grey[100], letterSpacing: "-0.3px" }}>Weekly Overview</Typography>
            <Typography sx={{ fontSize: "12px", color: colors.grey[400] }}>Energy balance Monday through Sunday</Typography>
          </Box>
        </Box>
        <NavHeader
          label={weekInfo.label}
          onPrev={function() { setWeekOffset(function(p) { return p - 1; }); }}
          onNext={function() { setWeekOffset(function(p) { return p + 1; }); }}
          disableNext={weekOffset >= 0}
        />
      </Box>
      {/* Weekly KPIs */}
      <Box display="flex" gap="14px" mb="16px" flexWrap="wrap">
        <Box sx={kpiCardSx(COLOR_DELIVERED)}>
          <Typography sx={{ fontSize: "10px", fontWeight: 600, color: colors.grey[400], textTransform: "uppercase", letterSpacing: "0.5px" }}>Total Week Import</Typography>
          <Typography sx={{ fontSize: "22px", fontWeight: 800, color: colors.grey[100], mt: "4px" }}>{weekTotalImport.toFixed(1)} kWh</Typography>
          <Typography sx={{ fontSize: "10px", color: colors.grey[500], mt: "2px" }}>Revenue: {fmtCurrency(weekRevenue)}</Typography>
        </Box>
        <Box sx={kpiCardSx(COLOR_RECEIVED)}>
          <Typography sx={{ fontSize: "10px", fontWeight: 600, color: colors.grey[400], textTransform: "uppercase", letterSpacing: "0.5px" }}>Total Week Export</Typography>
          <Typography sx={{ fontSize: "22px", fontWeight: 800, color: colors.grey[100], mt: "4px" }}>{weekTotalExport.toFixed(1)} kWh</Typography>
          <Typography sx={{ fontSize: "10px", color: colors.grey[500], mt: "2px" }}>Feed-in cost: {fmtCurrency(weekSavings)}</Typography>
        </Box>
        <Box sx={kpiCardSx("#66bb6a")}>
          <Typography sx={{ fontSize: "10px", fontWeight: 600, color: colors.grey[400], textTransform: "uppercase", letterSpacing: "0.5px" }}>Best Export Day</Typography>
          <Typography sx={{ fontSize: "22px", fontWeight: 800, color: colors.grey[100], mt: "4px" }}>{bestExportDay || "--"}</Typography>
          <Typography sx={{ fontSize: "10px", color: COLOR_RECEIVED, fontWeight: 600, mt: "2px" }}>{bestExportVal.toFixed(1)} kWh solar feed-in</Typography>
        </Box>
        <Box sx={kpiCardSx(COLOR_REVENUE)}>
          <Typography sx={{ fontSize: "10px", fontWeight: 600, color: colors.grey[400], textTransform: "uppercase", letterSpacing: "0.5px" }}>Weekly Net Revenue</Typography>
          <Typography sx={{ fontSize: "22px", fontWeight: 800, color: weekNetRevenue >= 0 ? COLOR_REVENUE : COLOR_COST, mt: "4px" }}>
            {fmtCurrency(weekNetRevenue)}
          </Typography>
          <Typography sx={{ fontSize: "10px", color: colors.grey[500], mt: "2px" }}>After feed-in credits</Typography>
        </Box>
      </Box>
      {/* Weekly Chart — BarChart, full width */}
      <Box sx={{ ...sectionCardSx, mb: 0 }}>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={weeklyData} barGap={4}>
            <defs>
              <linearGradient id="barGradDelivered" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLOR_DELIVERED} stopOpacity={1} />
                <stop offset="100%" stopColor={COLOR_DELIVERED} stopOpacity={0.6} />
              </linearGradient>
              <linearGradient id="barGradReceived" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLOR_RECEIVED} stopOpacity={1} />
                <stop offset="100%" stopColor={COLOR_RECEIVED} stopOpacity={0.6} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#334155" : "#D1D5DB"} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: colors.grey[400] }} axisLine={{ stroke: isDark ? "#475569" : "#9CA3AF" }} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: colors.grey[400] }} axisLine={false} tickLine={false}
              label={{ value: "kWh", angle: -90, position: "insideLeft", style: { fontSize: 10, fill: colors.grey[400] } }} />
            <RechartsTooltip contentStyle={tooltipStyle} />
            <Bar dataKey="delivered" fill="url(#barGradDelivered)" name="Grid Supply (kWh)" radius={[6, 6, 0, 0]} maxBarSize={48} />
            <Bar dataKey="received" fill="url(#barGradReceived)" name="Solar Feed-in (kWh)" radius={[6, 6, 0, 0]} maxBarSize={48} />
            <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "12px" }} />
          </BarChart>
        </ResponsiveContainer>
      </Box>

      {/* ===== DIVIDER ===== */}
      <Box sx={sectionDividerSx} />

      {/* ===== SECTION 3: MONTHLY (Navigable, days 1-28/30/31) ===== */}
      <Box sx={{ mb: "12px" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: "12px", mb: "6px" }}>
          <Box sx={{ width: 5, height: 28, borderRadius: "3px", background: "linear-gradient(180deg, " + COLOR_RECEIVED + ", " + "#ab47bc" + ")" }} />
          <Box flex={1}>
            <Typography sx={{ fontSize: "18px", fontWeight: 800, color: colors.grey[100], letterSpacing: "-0.3px" }}>Monthly Breakdown</Typography>
            <Typography sx={{ fontSize: "12px", color: colors.grey[400] }}>Daily energy flow for the selected month</Typography>
          </Box>
        </Box>
        <NavHeader
          label={monthInfo.label}
          onPrev={function() { setMonthOffset(function(p) { return p - 1; }); }}
          onNext={function() { setMonthOffset(function(p) { return p + 1; }); }}
          disableNext={monthOffset >= 0}
        />
      </Box>
      {/* Monthly KPIs */}
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
        <Box sx={kpiCardSx("#7c4dff")}>
          <Typography sx={{ fontSize: "10px", fontWeight: 600, color: colors.grey[400], textTransform: "uppercase", letterSpacing: "0.5px" }}>Net Balance</Typography>
          <Typography sx={{ fontSize: "22px", fontWeight: 800, color: monthNetBalance >= 0 ? COLOR_DELIVERED : COLOR_RECEIVED, mt: "4px" }}>
            {monthNetBalance >= 0 ? "+" : ""}{monthNetBalance.toFixed(1)} kWh
          </Typography>
          <Typography sx={{ fontSize: "10px", color: colors.grey[500], mt: "2px" }}>{monthNetBalance >= 0 ? "Net importer" : "Net exporter"}</Typography>
        </Box>
        <Box sx={kpiCardSx(COLOR_REVENUE)}>
          <Typography sx={{ fontSize: "10px", fontWeight: 600, color: colors.grey[400], textTransform: "uppercase", letterSpacing: "0.5px" }}>Monthly Net Revenue</Typography>
          <Typography sx={{ fontSize: "22px", fontWeight: 800, color: monthNetRevenue >= 0 ? COLOR_REVENUE : COLOR_COST, mt: "4px" }}>
            {fmtCurrency(monthNetRevenue)}
          </Typography>
          <Typography sx={{ fontSize: "10px", color: colors.grey[500], mt: "2px" }}>After feed-in credits</Typography>
        </Box>
      </Box>
      {/* Monthly Chart — BarChart, full width */}
      <Box sx={{ ...sectionCardSx, mb: 0 }}>
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
            <Bar dataKey="received" fill="url(#barGradMonthRec)" name="Solar Feed-in (kWh)" radius={[4, 4, 0, 0]} maxBarSize={20} />
            <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "12px" }} />
          </BarChart>
        </ResponsiveContainer>
      </Box>

      {/* ===== DIVIDER ===== */}
      <Box sx={sectionDividerSx} />

      {/* ===== SECTION 4: YEARLY (Navigable Jan-Dec) ===== */}
      <Box sx={{ mb: "12px" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: "12px", mb: "6px" }}>
          <Box sx={{ width: 5, height: 28, borderRadius: "3px", background: "linear-gradient(180deg, " + "#7c4dff" + ", " + COLOR_DELIVERED + ")" }} />
          <Box flex={1}>
            <Typography sx={{ fontSize: "18px", fontWeight: 800, color: colors.grey[100], letterSpacing: "-0.3px" }}>Yearly Summary</Typography>
            <Typography sx={{ fontSize: "12px", color: colors.grey[400] }}>Monthly energy and financial performance for the selected year</Typography>
          </Box>
        </Box>
        <NavHeader
          label={yearInfo.label}
          onPrev={function() { setYearOffset(function(p) { return p - 1; }); }}
          onNext={function() { setYearOffset(function(p) { return p + 1; }); }}
          disableNext={yearOffset >= 0}
        />
      </Box>
      {/* Yearly KPIs */}
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
            {gridDepScore > 75 ? "Highly grid dependent" : gridDepScore > 50 ? "Moderate dependency" : "Solar-forward fleet"}
          </Typography>
        </Box>
      </Box>
      {/* Yearly Chart — BarChart, full width */}
      <Box sx={{ ...sectionCardSx, mb: "16px" }}>
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
            <Bar dataKey="received" fill="url(#barGradYearRec)" name="Solar Feed-in (kWh)" radius={[8, 8, 0, 0]} maxBarSize={56} />
            <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "12px" }} />
          </BarChart>
        </ResponsiveContainer>
      </Box>

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
          <Typography sx={{ fontSize: "11px", color: colors.grey[400] }}>Retail Tariff:</Typography>
          <Typography sx={{ fontSize: "12px", fontWeight: 700, color: colors.grey[100] }}>N$ {TARIFF_RETAIL}/kWh</Typography>
        </Box>
        <Box sx={{ width: "1px", height: "20px", bgcolor: colors.grey[700] }} />
        <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: COLOR_RECEIVED }} />
          <Typography sx={{ fontSize: "11px", color: colors.grey[400] }}>Feed-in Tariff:</Typography>
          <Typography sx={{ fontSize: "12px", fontWeight: 700, color: colors.grey[100] }}>N$ {TARIFF_FEEDIN}/kWh</Typography>
        </Box>
        <Box sx={{ width: "1px", height: "20px", bgcolor: colors.grey[700] }} />
        <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Typography sx={{ fontSize: "11px", color: colors.grey[400] }}>Spread:</Typography>
          <Typography sx={{ fontSize: "12px", fontWeight: 700, color: COLOR_REVENUE }}>N$ {(TARIFF_RETAIL - TARIFF_FEEDIN).toFixed(2)}/kWh</Typography>
        </Box>
      </Box>
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
