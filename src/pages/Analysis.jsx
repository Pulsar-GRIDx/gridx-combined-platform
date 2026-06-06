import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Tabs,
  Tab,
  LinearProgress,
  Grid,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  ToggleButton,
  ToggleButtonGroup,
  CircularProgress,
  useTheme,
} from "@mui/material";
import {
  BoltOutlined,
  AttachMoneyOutlined,
  MapOutlined,
  LightMode,
  InsertInvitation,
  CalendarMonth,
  TrendingUp,
  TrendingDown,
} from "@mui/icons-material";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import Header from "../components/Header";
import { tokens } from "../theme";
import { meterAPI, energyAPI, financeAPI } from "../services/api";

const fmt = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n) => Number(n || 0).toLocaleString();

const ALL_SUBURBS = [
  "Academia", "Auasblick", "Avis", "Cimbebasia", "Dorado Park", "Donkerhoek",
  "Elisenheim", "Eros", "Eros Park", "Freedom Land", "Goreangab", "Groot Aub",
  "Greenwell", "Hakahana", "Havana", "Hochland Park", "Katutura", "Khomasdal",
  "Klein Windhoek", "Kleine Kuppe", "Lafrenz", "Ludwigsdorf", "Luxury Hill",
  "Olympia", "Okuryangava", "Otjomuise", "Pionierspark", "Prosperita",
  "Rocky Crest", "Suiderhof", "Tauben Glen", "Wanaheda", "Windhoek North",
  "Windhoek West",
];

const WEEK_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* ---- Display Card ---- */
function DisplayCard({ title, count, percentage, icon, colors }) {
  const pct = Number(percentage) || 0;
  const isUp = pct >= 0;
  return (
    <Box sx={{ border: `1px solid ${colors.greenAccent[500]}`, bgcolor: colors.primary[400], display: "flex", overflow: "hidden" }}>
      <Box sx={{ bgcolor: "#6870fa", width: 80, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {icon}
      </Box>
      <Box sx={{ p: 2, flex: 1 }}>
        <Typography variant="body2" color={colors.grey[300]}>{title}</Typography>
        <Typography variant="h4" color={colors.greenAccent[500]} fontWeight="bold">{count}</Typography>
        {pct !== 0 && (
          <Typography variant="caption" color={isUp ? colors.greenAccent[500] : "#db4f4a"} sx={{ display: "flex", alignItems: "center", gap: 0.3 }}>
            {isUp ? <TrendingUp sx={{ fontSize: 14 }} /> : <TrendingDown sx={{ fontSize: 14 }} />}
            {Math.abs(pct).toFixed(1)}%
          </Typography>
        )}
      </Box>
    </Box>
  );
}

/* ---- Weekly Bar Chart (recharts, Mon-Sun, two series) ---- */
function WeeklyChart({ lastWeek, currentWeek, unit, colors }) {
  const data = WEEK_LABELS.map((day, i) => ({
    day,
    "Last Week": Number(lastWeek?.[i]) || 0,
    "Current Week": Number(currentWeek?.[i]) || 0,
  }));
  return (
    <Box sx={{ border: `1px solid ${colors.greenAccent[500]}`, bgcolor: colors.primary[400], p: 2 }}>
      <Typography variant="h6" color={colors.grey[100]} fontWeight="bold" mb={1}>Weekly Comparison</Typography>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#334155" : "#D1D5DB"}  />
          <XAxis dataKey="day" stroke={colors.grey[300]} tick={{ fontSize: 11 }} />
          <YAxis stroke={colors.grey[300]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}`} />
          <Tooltip contentStyle={{ backgroundColor: colors.primary[400], border: `1px solid ${colors.grey[700]}`, color: colors.grey[100] }}
            formatter={(v) => [`${fmt(v)} ${unit}`, undefined]} />
          <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
          <Bar dataKey="Last Week" fill="#F08080" radius={[3, 3, 0, 0]} barSize={12} />
          <Bar dataKey="Current Week" fill="#3498db" radius={[3, 3, 0, 0]} barSize={12} />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}

/* ---- Yearly Bar Chart (recharts, Jan-Dec, two series) ---- */
function YearlyChart({ lastYear, currentYear, unit, colors }) {
  const data = MONTH_LABELS.map((month, i) => ({
    month,
    "Last Year": Number(lastYear?.[i]) || 0,
    "Current Year": Number(currentYear?.[i]) || 0,
  }));
  return (
    <Box sx={{ border: `1px solid ${colors.greenAccent[500]}`, bgcolor: colors.primary[400], p: 2 }}>
      <Typography variant="h6" color={colors.grey[100]} fontWeight="bold" mb={1}>Yearly Comparison</Typography>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#334155" : "#D1D5DB"}  />
          <XAxis dataKey="month" stroke={colors.grey[300]} tick={{ fontSize: 11 }} />
          <YAxis stroke={colors.grey[300]} tick={{ fontSize: 11 }} />
          <Tooltip contentStyle={{ backgroundColor: colors.primary[400], border: `1px solid ${colors.grey[700]}`, color: colors.grey[100] }}
            formatter={(v) => [`${fmt(v)} ${unit}`, undefined]} />
          <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
          <Bar dataKey="Last Year" fill="#F08080" radius={[3, 3, 0, 0]} barSize={12} />
          <Bar dataKey="Current Year" fill="#3498db" radius={[3, 3, 0, 0]} barSize={12} />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}

/* ---- Area Consumption/Revenue Chart with time period toggle ---- */
function AreaBarChart({ title, data, unit, timePeriod, setTimePeriod, colors, navigate }) {
  const chartData = Array.isArray(data) ? data.map((d) => ({
    label: d.label || d.suburb || "",
    value: Math.round((Number(d.value) || 0) * 100) / 100,
  })) : [];
  return (
    <Box sx={{ border: `1px solid ${colors.greenAccent[500]}`, borderRadius: 2, bgcolor: colors.primary[400], p: 2 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
        <Typography variant="h6" color={colors.grey[100]} fontWeight="bold">{title}</Typography>
        <ToggleButtonGroup size="small" exclusive value={timePeriod}
          onChange={(_, v) => v && setTimePeriod(v)} color="success"
          sx={{ "& .MuiToggleButton-root": { color: colors.grey[300], textTransform: "none" } }}>
          <ToggleButton value="week">Week</ToggleButton>
          <ToggleButton value="month">Month</ToggleButton>
          <ToggleButton value="year">Year</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#334155" : "#D1D5DB"}  />
          <XAxis dataKey="label" stroke={colors.grey[300]} tick={{ fontSize: 10, angle: -25, textAnchor: "end" }} interval={0} height={80} />
          <YAxis stroke={colors.grey[300]} tick={{ fontSize: 11 }} />
          <Tooltip contentStyle={{ backgroundColor: colors.primary[400], border: `1px solid ${colors.grey[700]}`, color: colors.grey[100] }}
            formatter={(v) => [`${fmt(v)} ${unit}`, undefined]} />
          <Bar dataKey="value" fill={colors.greenAccent[500]} radius={[4, 4, 0, 0]} maxBarSize={30}
            onClick={(d) => d?.label && navigate(`/map/${d.label}`)}
            cursor="pointer" />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}

/* ---- Availability color helper ---- */
function availabilityColor(pct) {
  if (pct >= 90) return "#4cceac";
  if (pct >= 70) return "#f2b705";
  return "#db4f4a";
}

/* ==================================================================== */
/* Analysis Page                                                        */
/* ==================================================================== */
export default function Analysis() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const isDark = theme.palette.mode === "dark";
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);

  // ---- Meters ----
  const [activeMeters, setActiveMeters] = useState(0);
  const [inactiveMeters, setInactiveMeters] = useState(0);
  const [totalMeters, setTotalMeters] = useState(0);

  // ---- Energy ----
  const [energyTimePeriods, setEnergyTimePeriods] = useState({ day: 0, month: 0, year: 0 });
  const [energyPercentage, setEnergyPercentage] = useState({ day: 0, month: 0, year: 0 });
  const [energyWeekly, setEnergyWeekly] = useState({ lastweek: [], currentweek: [] });
  const [energyYearly, setEnergyYearly] = useState({ Last: [], Current: [] });
  const [suburbEnergyData, setSuburbEnergyData] = useState({ WeekResult: [], MonthResult: [], YearResult: [] });
  const [energyTimePeriod, setEnergyTimePeriod] = useState("week");

  // ---- Revenue ----
  const [revenueTimePeriods, setRevenueTimePeriods] = useState({ day: 0, month: 0, year: 0 });
  const [revenuePercentage, setRevenuePercentage] = useState({ day: 0, month: 0, year: 0 });
  const [revenueWeekly, setRevenueWeekly] = useState({ lastweek: [], currentweek: [] });
  const [revenueYearly, setRevenueYearly] = useState({ Last: [], Current: [] });
  const [suburbRevenueData, setSuburbRevenueData] = useState({ WeekResult: [], MonthResult: [], YearResult: [] });
  const [revenueTimePeriod, setRevenueTimePeriod] = useState("week");

  // ---- Suburb-specific ----
  const [selectedSuburbPower, setSelectedSuburbPower] = useState("");
  const [selectedSuburbRevenue, setSelectedSuburbRevenue] = useState("");
  const [subPowerWeekly, setSubPowerWeekly] = useState({ lastweek: [], currentweek: [] });
  const [subPowerYearly, setSubPowerYearly] = useState({ Last: [], Current: [] });
  const [subPowerPeriods, setSubPowerPeriods] = useState({ day: 0, month: 0, year: 0 });
  const [subPowerPct, setSubPowerPct] = useState({ day: 0, month: 0, year: 0 });
  const [subRevenueWeekly, setSubRevenueWeekly] = useState({ lastweek: [], currentweek: [] });
  const [subRevenueYearly, setSubRevenueYearly] = useState({ Last: [], Current: [] });
  const [subRevenuePeriods, setSubRevenuePeriods] = useState({ day: 0, month: 0, year: 0 });
  const [subRevenuePct, setSubRevenuePct] = useState({ day: 0, month: 0, year: 0 });
  const [subLoading, setSubLoading] = useState(false);

  const transformData = (raw) => Object.entries(raw || {}).map(([label, value]) => ({ label, value }));

  // ---- Fetch all data on mount ----
  useEffect(() => {
    const withTimeout = (promise, ms = 15000) =>
      Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);

    const fetchAll = async () => {
      try {
        const [
          activeInactiveRes, totalRes,
          energyTimeRes, energyPctRes, energyWeeklyRes, energyYearlyRes,
          revenueTimeRes, revenuePctRes, revenueWeeklyRes, revenueYearlyRes,
          suburbEnergyRes, suburbRevenueRes,
        ] = await Promise.allSettled([
          withTimeout(meterAPI.getActiveInactive()),
          withTimeout(meterAPI.getTotal()),
          withTimeout(energyAPI.getTimePeriods()),
          withTimeout(energyAPI.getPowerIncreaseOrDecrease()),
          withTimeout(energyAPI.getWeekly()),
          withTimeout(energyAPI.getMonthlyYearly()),
          withTimeout(financeAPI.getTimePeriods()),
          withTimeout(financeAPI.getTokenAmountIncreaseOrDecrease()),
          withTimeout(financeAPI.getWeekly()),
          withTimeout(financeAPI.getMonthlyYearly()),
          withTimeout(energyAPI.getSuburbEnergy(ALL_SUBURBS), 25000),
          withTimeout(financeAPI.getSuburbChartRevenue(ALL_SUBURBS), 25000),
        ]);

        if (activeInactiveRes.status === "fulfilled") {
          setActiveMeters(activeInactiveRes.value?.activeMeters || 0);
          setInactiveMeters(activeInactiveRes.value?.inactiveMeters || 0);
        }
        if (totalRes.status === "fulfilled") setTotalMeters(totalRes.value?.totalMeters || 0);

        if (energyTimeRes.status === "fulfilled") {
          const d = energyTimeRes.value;
          setEnergyTimePeriods({ day: Number(d?.day || 0).toFixed(2), month: Number(d?.month || 0).toFixed(2), year: Number(d?.year || 0).toFixed(2) });
        }
        if (energyPctRes.status === "fulfilled") {
          const d = energyPctRes.value;
          setEnergyPercentage({ day: d?.day || 0, month: d?.month || 0, year: d?.year || 0 });
        }
        if (energyWeeklyRes.status === "fulfilled") {
          const d = energyWeeklyRes.value;
          setEnergyWeekly({ lastweek: d?.lastweek || [], currentweek: d?.currentweek || [] });
        }
        if (energyYearlyRes.status === "fulfilled") {
          const d = energyYearlyRes.value;
          setEnergyYearly({ Last: d?.Last || [], Current: d?.Current || [] });
        }
        if (revenueTimeRes.status === "fulfilled") {
          const d = revenueTimeRes.value;
          setRevenueTimePeriods({ day: d?.day || 0, month: d?.month || 0, year: d?.year || 0 });
        }
        if (revenuePctRes.status === "fulfilled") {
          const d = revenuePctRes.value;
          setRevenuePercentage({ day: d?.dayPercentage || 0, month: d?.monthPercentage || 0, year: d?.yearPercentage || 0 });
        }
        if (revenueWeeklyRes.status === "fulfilled") {
          const d = revenueWeeklyRes.value;
          setRevenueWeekly({ lastweek: d?.lastweek || [], currentweek: d?.currentweek || [] });
        }
        if (revenueYearlyRes.status === "fulfilled") {
          const d = revenueYearlyRes.value;
          setRevenueYearly({ Last: d?.Last || [], Current: d?.Current || [] });
        }
        if (suburbEnergyRes.status === "fulfilled") {
          const raw = suburbEnergyRes.value;
          setSuburbEnergyData({
            WeekResult: transformData(raw?.suburbsWeekly),
            MonthResult: transformData(raw?.suburbsMonthly),
            YearResult: transformData(raw?.suburbsYearly),
          });
        }
        if (suburbRevenueRes.status === "fulfilled") {
          const raw = suburbRevenueRes.value;
          setSuburbRevenueData({
            WeekResult: transformData(raw?.suburbsWeekly),
            MonthResult: transformData(raw?.suburbsMonthly),
            YearResult: transformData(raw?.suburbsYearly),
          });
        }
      } catch (e) {
        console.error("Analysis fetch error:", e);
      }
      setLoading(false);
    };
    fetchAll();
  }, []);

  // ---- Suburb-specific Power fetch ----
  useEffect(() => {
    if (!selectedSuburbPower) return;
    setSubLoading(true);
    const suburbs = [selectedSuburbPower];
    Promise.allSettled([
      energyAPI.getSuburbWeeklyPower(suburbs),
      energyAPI.getSuburbMonthlyPower(suburbs),
      energyAPI.getSuburbTimePeriods(suburbs),
      energyAPI.getSuburbPowerIncreaseOrDecrease(suburbs),
    ]).then(([weekRes, yearRes, periodRes, pctRes]) => {
      if (weekRes.status === "fulfilled") setSubPowerWeekly({ lastweek: weekRes.value?.lastWeekTotal || [], currentweek: weekRes.value?.currentWeekTotal || [] });
      if (yearRes.status === "fulfilled") setSubPowerYearly({ Last: yearRes.value?.lastYearPowerConsumption || [], Current: yearRes.value?.currentYearPowerConsumption || [] });
      if (periodRes.status === "fulfilled") setSubPowerPeriods({ day: periodRes.value?.currentDayTotal || 0, month: periodRes.value?.currentMonthTotal || 0, year: periodRes.value?.currentYearTotal || 0 });
      if (pctRes.status === "fulfilled") setSubPowerPct({ day: pctRes.value?.dayPercentage || 0, month: pctRes.value?.monthPercentage || 0, year: pctRes.value?.yearPercentage || 0 });
      setSubLoading(false);
    });
  }, [selectedSuburbPower]);

  // ---- Suburb-specific Revenue fetch ----
  useEffect(() => {
    if (!selectedSuburbRevenue) return;
    setSubLoading(true);
    const suburbs = [selectedSuburbRevenue];
    Promise.allSettled([
      financeAPI.getSuburbWeekly(suburbs),
      financeAPI.getSuburbYearly(suburbs),
      financeAPI.getSuburbTimePeriod(suburbs),
      financeAPI.getSuburbRevenueIncreaseOrDecrease(suburbs),
    ]).then(([weekRes, yearRes, periodRes, pctRes]) => {
      if (weekRes.status === "fulfilled") setSubRevenueWeekly({ lastweek: weekRes.value?.lastWeekRevenue || [], currentweek: weekRes.value?.currentWeekRevenue || [] });
      if (yearRes.status === "fulfilled") setSubRevenueYearly({ Last: yearRes.value?.lastYearRevenue || [], Current: yearRes.value?.currentYearRevenue || [] });
      if (periodRes.status === "fulfilled") setSubRevenuePeriods({ day: periodRes.value?.currentDayRevenue || 0, month: periodRes.value?.currentMonthRevenue || 0, year: periodRes.value?.currentYearRevenue || 0 });
      if (pctRes.status === "fulfilled") setSubRevenuePct({ day: pctRes.value?.dayPercentage || 0, month: pctRes.value?.monthPercentage || 0, year: pctRes.value?.yearPercentage || 0 });
      setSubLoading(false);
    });
  }, [selectedSuburbRevenue]);

  // ---- Derived data ----
  const energyAreaData = energyTimePeriod === "week" ? suburbEnergyData.WeekResult : energyTimePeriod === "month" ? suburbEnergyData.MonthResult : suburbEnergyData.YearResult;
  const revenueAreaData = revenueTimePeriod === "week" ? suburbRevenueData.WeekResult : revenueTimePeriod === "month" ? suburbRevenueData.MonthResult : suburbRevenueData.YearResult;

  const iconStyle = { color: "#fff", fontSize: 36 };

  if (loading) {
    return (
      <Box m="20px" display="flex" justifyContent="center" alignItems="center" height="60vh">
        <CircularProgress sx={{ color: colors.greenAccent[500] }} />
      </Box>
    );
  }

  return (
    <Box m="20px">
      <Header title="ANALYSIS" subtitle="Power consumption, revenue trends, and regional meter analytics" />

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{
        mb: 2,
        "& .MuiTab-root": { color: colors.grey[400], textTransform: "none", fontWeight: 600, "&.Mui-selected": { color: colors.greenAccent[500] } },
        "& .MuiTabs-indicator": { backgroundColor: colors.greenAccent[500] },
      }}>
        <Tab icon={<BoltOutlined sx={{ fontSize: 16 }} />} iconPosition="start" label="Power Analysis" />
        <Tab icon={<BoltOutlined sx={{ fontSize: 16 }} />} iconPosition="start" label="Advanced Power" />
        <Tab icon={<MapOutlined sx={{ fontSize: 16 }} />} iconPosition="start" label="Regional" />
        <Tab icon={<AttachMoneyOutlined sx={{ fontSize: 16 }} />} iconPosition="start" label="Financial" />
        <Tab icon={<AttachMoneyOutlined sx={{ fontSize: 16 }} />} iconPosition="start" label="Advanced Financial" />
      </Tabs>

      {/* ================================================================ */}
      {/* TAB 0: Power Analysis                                            */}
      {/* ================================================================ */}
      {tab === 0 && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <DisplayCard title="Daily Total Consumption" count={`${energyTimePeriods.day} kWh`} percentage={energyPercentage.day} icon={<LightMode sx={iconStyle} />} colors={colors} />
              </Grid>
              <Grid item xs={12}>
                <DisplayCard title="Monthly Total Consumption" count={`${energyTimePeriods.month} kWh`} percentage={energyPercentage.month} icon={<InsertInvitation sx={iconStyle} />} colors={colors} />
              </Grid>
              <Grid item xs={12}>
                <DisplayCard title="Yearly Total Consumption" count={`${energyTimePeriods.year} kWh`} percentage={energyPercentage.year} icon={<CalendarMonth sx={iconStyle} />} colors={colors} />
              </Grid>
            </Grid>
          </Grid>
          <Grid item xs={12} md={8}>
            <WeeklyChart lastWeek={energyWeekly.lastweek} currentWeek={energyWeekly.currentweek} unit="kWh" colors={colors} />
          </Grid>
          <Grid item xs={12}>
            <YearlyChart lastYear={energyYearly.Last} currentYear={energyYearly.Current} unit="kWh" colors={colors} />
          </Grid>
          <Grid item xs={12}>
            <AreaBarChart title="Area Power Consumption" data={energyAreaData} unit="kWh" timePeriod={energyTimePeriod} setTimePeriod={setEnergyTimePeriod} colors={colors} navigate={navigate} />
          </Grid>
        </Grid>
      )}

      {/* ================================================================ */}
      {/* TAB 1: Advanced Power (by Suburb)                                */}
      {/* ================================================================ */}
      {tab === 1 && (
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <FormControl sx={{ minWidth: 250, mb: 1 }}>
              <InputLabel sx={{ color: colors.grey[300] }}>Select Suburb</InputLabel>
              <Select value={selectedSuburbPower} label="Select Suburb"
                onChange={(e) => setSelectedSuburbPower(e.target.value)}
                sx={{ color: colors.grey[100], ".MuiOutlinedInput-notchedOutline": { borderColor: colors.grey[700] } }}>
                {ALL_SUBURBS.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          {subLoading && <Grid item xs={12}><LinearProgress sx={{ mb: 1 }} /></Grid>}
          {selectedSuburbPower && (
            <>
              <Grid item xs={12} md={4}>
                <Grid container spacing={2}>
                  <Grid item xs={12}><DisplayCard title="Daily Consumption" count={`${fmt(subPowerPeriods.day)} kWh`} percentage={subPowerPct.day} icon={<LightMode sx={iconStyle} />} colors={colors} /></Grid>
                  <Grid item xs={12}><DisplayCard title="Monthly Consumption" count={`${fmt(subPowerPeriods.month)} kWh`} percentage={subPowerPct.month} icon={<InsertInvitation sx={iconStyle} />} colors={colors} /></Grid>
                  <Grid item xs={12}><DisplayCard title="Yearly Consumption" count={`${fmt(subPowerPeriods.year)} kWh`} percentage={subPowerPct.year} icon={<CalendarMonth sx={iconStyle} />} colors={colors} /></Grid>
                </Grid>
              </Grid>
              <Grid item xs={12} md={8}>
                <WeeklyChart lastWeek={subPowerWeekly.lastweek} currentWeek={subPowerWeekly.currentweek} unit="kWh" colors={colors} />
              </Grid>
              <Grid item xs={12}>
                <YearlyChart lastYear={subPowerYearly.Last} currentYear={subPowerYearly.Current} unit="kWh" colors={colors} />
              </Grid>
            </>
          )}
        </Grid>
      )}

      {/* ================================================================ */}
      {/* TAB 2: Regional Analysis                                         */}
      {/* ================================================================ */}
      {tab === 2 && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Box sx={{ border: `1px solid ${colors.greenAccent[500]}`, bgcolor: colors.primary[400], p: 3, textAlign: "center" }}>
              <Typography variant="body2" color={colors.grey[300]}>Total Meters</Typography>
              <Typography variant="h2" color={colors.greenAccent[500]} fontWeight="bold">{fmtInt(totalMeters)}</Typography>
            </Box>
          </Grid>
          <Grid item xs={12} md={4}>
            <Box sx={{ border: `1px solid ${colors.greenAccent[500]}`, bgcolor: colors.primary[400], p: 3, textAlign: "center" }}>
              <Typography variant="body2" color={colors.grey[300]}>Active Meters</Typography>
              <Typography variant="h2" color="#4cceac" fontWeight="bold">{fmtInt(activeMeters)}</Typography>
              {totalMeters > 0 && (
                <LinearProgress variant="determinate" value={(activeMeters / totalMeters) * 100}
                  sx={{ mt: 1, height: 6, borderRadius: 3, bgcolor: "rgba(255,255,255,0.08)", "& .MuiLinearProgress-bar": { bgcolor: "#4cceac", borderRadius: 3 } }} />
              )}
            </Box>
          </Grid>
          <Grid item xs={12} md={4}>
            <Box sx={{ border: `1px solid ${colors.greenAccent[500]}`, bgcolor: colors.primary[400], p: 3, textAlign: "center" }}>
              <Typography variant="body2" color={colors.grey[300]}>Inactive Meters</Typography>
              <Typography variant="h2" color="#db4f4a" fontWeight="bold">{fmtInt(inactiveMeters)}</Typography>
              {totalMeters > 0 && (
                <LinearProgress variant="determinate" value={(inactiveMeters / totalMeters) * 100}
                  sx={{ mt: 1, height: 6, borderRadius: 3, bgcolor: "rgba(255,255,255,0.08)", "& .MuiLinearProgress-bar": { bgcolor: "#db4f4a", borderRadius: 3 } }} />
              )}
            </Box>
          </Grid>
        </Grid>
      )}

      {/* ================================================================ */}
      {/* TAB 3: Financial Analysis                                        */}
      {/* ================================================================ */}
      {tab === 3 && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Grid container spacing={2}>
              <Grid item xs={12}><DisplayCard title="Daily Revenue" count={`N$ ${fmt(revenueTimePeriods.day)}`} percentage={revenuePercentage.day} icon={<LightMode sx={iconStyle} />} colors={colors} /></Grid>
              <Grid item xs={12}><DisplayCard title="Monthly Revenue" count={`N$ ${fmt(revenueTimePeriods.month)}`} percentage={revenuePercentage.month} icon={<InsertInvitation sx={iconStyle} />} colors={colors} /></Grid>
              <Grid item xs={12}><DisplayCard title="Yearly Revenue" count={`N$ ${fmt(revenueTimePeriods.year)}`} percentage={revenuePercentage.year} icon={<CalendarMonth sx={iconStyle} />} colors={colors} /></Grid>
            </Grid>
          </Grid>
          <Grid item xs={12} md={8}>
            <WeeklyChart lastWeek={revenueWeekly.lastweek} currentWeek={revenueWeekly.currentweek} unit="N$" colors={colors} />
          </Grid>
          <Grid item xs={12}>
            <YearlyChart lastYear={revenueYearly.Last} currentYear={revenueYearly.Current} unit="N$" colors={colors} />
          </Grid>
          <Grid item xs={12}>
            <AreaBarChart title="Area Revenue Generated" data={revenueAreaData} unit="N$" timePeriod={revenueTimePeriod} setTimePeriod={setRevenueTimePeriod} colors={colors} navigate={navigate} />
          </Grid>
        </Grid>
      )}

      {/* ================================================================ */}
      {/* TAB 4: Advanced Financial (by Suburb)                            */}
      {/* ================================================================ */}
      {tab === 4 && (
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <FormControl sx={{ minWidth: 250, mb: 1 }}>
              <InputLabel sx={{ color: colors.grey[300] }}>Select Suburb</InputLabel>
              <Select value={selectedSuburbRevenue} label="Select Suburb"
                onChange={(e) => setSelectedSuburbRevenue(e.target.value)}
                sx={{ color: colors.grey[100], ".MuiOutlinedInput-notchedOutline": { borderColor: colors.grey[700] } }}>
                {ALL_SUBURBS.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          {subLoading && <Grid item xs={12}><LinearProgress sx={{ mb: 1 }} /></Grid>}
          {selectedSuburbRevenue && (
            <>
              <Grid item xs={12} md={4}>
                <Grid container spacing={2}>
                  <Grid item xs={12}><DisplayCard title="Daily Revenue" count={`N$ ${fmt(subRevenuePeriods.day)}`} percentage={subRevenuePct.day} icon={<LightMode sx={iconStyle} />} colors={colors} /></Grid>
                  <Grid item xs={12}><DisplayCard title="Monthly Revenue" count={`N$ ${fmt(subRevenuePeriods.month)}`} percentage={subRevenuePct.month} icon={<InsertInvitation sx={iconStyle} />} colors={colors} /></Grid>
                  <Grid item xs={12}><DisplayCard title="Yearly Revenue" count={`N$ ${fmt(subRevenuePeriods.year)}`} percentage={subRevenuePct.year} icon={<CalendarMonth sx={iconStyle} />} colors={colors} /></Grid>
                </Grid>
              </Grid>
              <Grid item xs={12} md={8}>
                <WeeklyChart lastWeek={subRevenueWeekly.lastweek} currentWeek={subRevenueWeekly.currentweek} unit="N$" colors={colors} />
              </Grid>
              <Grid item xs={12}>
                <YearlyChart lastYear={subRevenueYearly.Last} currentYear={subRevenueYearly.Current} unit="N$" colors={colors} />
              </Grid>
            </>
          )}
        </Grid>
      )}
    </Box>
  );
}
