import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  useTheme,
  Tab,
  Tabs,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  CircularProgress,
  IconButton,
} from "@mui/material";
import {
  AttachMoneyOutlined,
  ElectricMeterOutlined,
  PointOfSaleOutlined,
  AccountBalanceOutlined,
  SwapHorizOutlined,
  ReceiptOutlined,
  RefreshOutlined,
} from "@mui/icons-material";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { tokens } from "../theme";
import Header from "../components/Header";
import { postpaidAPI } from "../services/api";

const fmt = (n) => Number(n).toLocaleString();
const fmtCurrency = (n) =>
  `N$ ${Number(n).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getWeekRange(offset) {
  const now = new Date();
  const dayOfWeek = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek + 1 - offset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: monday, end: sunday };
}

function buildWeeklyOverlay(dailyData) {
  if (!dailyData || !dailyData.length) return WEEKDAYS.map((d) => ({ day: d }));
  const tw = getWeekRange(0);
  const lw = getWeekRange(1);
  return WEEKDAYS.map((dayName, i) => {
    const twDate = new Date(tw.start); twDate.setDate(tw.start.getDate() + i);
    const lwDate = new Date(lw.start); lwDate.setDate(lw.start.getDate() + i);
    const twStr = twDate.toISOString().split("T")[0];
    const lwStr = lwDate.toISOString().split("T")[0];
    const twRow = dailyData.find((r) => new Date(r.day).toISOString().split("T")[0] === twStr) || {};
    const lwRow = dailyData.find((r) => new Date(r.day).toISOString().split("T")[0] === lwStr) || {};
    return {
      day: dayName,
      twPrepaidRev: Number(twRow.prepaidRevenue || 0), lwPrepaidRev: Number(lwRow.prepaidRevenue || 0),
      twPostpaidRev: Number(twRow.postpaidRevenue || 0), lwPostpaidRev: Number(lwRow.postpaidRevenue || 0),
      twPrepaidKwh: Number(twRow.prepaidKwh || 0), lwPrepaidKwh: Number(lwRow.prepaidKwh || 0),
      twPostpaidKwh: Number(twRow.postpaidKwh || 0), lwPostpaidKwh: Number(lwRow.postpaidKwh || 0),
    };
  });
}

function buildMonthlyOverlay(monthlyData) {
  const now = new Date();
  const thisMonth = now.getMonth() + 1;
  const thisYear = now.getFullYear();
  const prevDate = new Date(thisYear, now.getMonth() - 1, 1);
  const prevMonth = prevDate.getMonth() + 1;
  const prevYear = prevDate.getFullYear();
  const daysInThisMonth = new Date(thisYear, now.getMonth() + 1, 0).getDate();
  const daysInPrevMonth = new Date(prevYear, prevDate.getMonth() + 1, 0).getDate();
  const maxDays = Math.max(daysInThisMonth, daysInPrevMonth);
  const rows = monthlyData || [];
  return Array.from({ length: maxDays }, (_, i) => {
    const dayNum = i + 1;
    const tmRow = rows.find((r) => Number(r.dayNum) === dayNum && Number(r.month) === thisMonth && Number(r.year) === thisYear) || {};
    const pmRow = rows.find((r) => Number(r.dayNum) === dayNum && Number(r.month) === prevMonth && Number(r.year) === prevYear) || {};
    return {
      day: String(dayNum),
      tmPrepaidRev: Number(tmRow.prepaidRevenue || 0), pmPrepaidRev: Number(pmRow.prepaidRevenue || 0),
      tmPostpaidRev: Number(tmRow.postpaidRevenue || 0), pmPostpaidRev: Number(pmRow.postpaidRevenue || 0),
      tmPrepaidKwh: Number(tmRow.prepaidKwh || 0), pmPrepaidKwh: Number(pmRow.prepaidKwh || 0),
      tmPostpaidKwh: Number(tmRow.postpaidKwh || 0), pmPostpaidKwh: Number(pmRow.postpaidKwh || 0),
    };
  });
}

function buildYearlyData(yearlyData) {
  const rows = yearlyData || [];
  return MONTHS.map((name, i) => {
    const r = rows.find((d) => Number(d.month) === i + 1) || {};
    return {
      month: name,
      prepaidRevenue: Number(r.prepaidRevenue || 0), postpaidRevenue: Number(r.postpaidRevenue || 0),
      prepaidKwh: Number(r.prepaidKwh || 0), postpaidKwh: Number(r.postpaidKwh || 0),
      totalRevenue: Number(r.totalRevenue || 0), totalKwh: Number(r.totalKwh || 0),
    };
  });
}

function ChartTooltip({ active, payload, label, colors, unit }) {
  if (!active || !payload?.length) return null;
  return (
    <Box
      sx={{
        backgroundColor: colors?.primary?.[400] || "#1F2A40",
        border: `1px solid ${colors?.grey?.[700] || "#3d3d3d"}`,
        borderRadius: 1,
        px: 1.5,
        py: 1,
      }}
    >
      <Typography variant="caption" sx={{ color: colors?.grey?.[100] || "#e0e0e0", fontWeight: 600 }}>
        {label}
      </Typography>
      {payload.map((p, i) => (
        <Typography key={i} variant="caption" sx={{ display: "block", color: p.color }}>
          {p.name}: {unit === "kWh" ? `${Number(p.value).toFixed(2)} kWh` : `N$ ${Number(p.value).toFixed(2)}`}
        </Typography>
      ))}
    </Box>
  );
}

function StatCard({ icon, label, value, subLabel, color, colors }) {
  return (
    <Box
      gridColumn="span 3"
      backgroundColor={colors.primary[400]}
      display="flex"
      alignItems="center"
      justifyContent="center"
      borderRadius="4px"
    >
      <Box textAlign="center">
        {icon}
        <Typography variant="body2" color={colors.greenAccent[500]} fontWeight="600">
          {label}
        </Typography>
        <Typography variant="h4" color={color || colors.grey[100]} fontWeight="bold">
          {value}
        </Typography>
        {subLabel && (
          <Typography variant="caption" color={colors.grey[400]} display="block" mt="2px">
            {subLabel}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

export default function Billing() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [prepaidMeters, setPrepaidMeters] = useState([]);
  const [postpaidMeters, setPostpaidMeters] = useState([]);
  const [postpaidBills, setPostpaidBills] = useState([]);
  const [allMeters, setAllMeters] = useState([]);
  const [chartPeriod, setChartPeriod] = useState("weekly");
  const [switchDialog, setSwitchDialog] = useState({ open: false, drn: "", mode: "", reason: "" });
  const [switchResult, setSwitchResult] = useState(null);
  const [billDialog, setBillDialog] = useState({ open: false, drn: "" });
  const [payDialog, setPayDialog] = useState({ open: false, billId: null, amount: "" });
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sum, prep, postp, bills, meters] = await Promise.all([
        postpaidAPI.getSummary().catch(() => null),
        postpaidAPI.getPrepaidMeters().catch(() => ({ meters: [] })),
        postpaidAPI.getPostpaidMeters().catch(() => ({ meters: [] })),
        postpaidAPI.getPostpaidBills().catch(() => ({ bills: [] })),
        postpaidAPI.getAllMeters().catch(() => ({ meters: [] })),
      ]);
      setSummary(sum);
      setPrepaidMeters(prep.meters || []);
      setPostpaidMeters(postp.meters || []);
      setPostpaidBills(bills.bills || []);
      setAllMeters(meters.meters || []);
    } catch (err) {
      console.error("Billing load error:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const getStatusColor = (status) => {
    switch (status) {
      case "Paid": case "Active": return colors.greenAccent[500];
      case "Pending": case "Generated": case "Sent": return colors.blueAccent[500];
      case "Overdue": case "Suspended": return colors.redAccent[500];
      case "Partial": return colors.yellowAccent[500];
      case "Arrears": return colors.yellowAccent[500];
      default: return colors.grey[300];
    }
  };

  const handleSwitchMode = async () => {
    setActionLoading(true);
    setSwitchResult(null);
    try {
      const res = await postpaidAPI.switchMode({
        DRN: switchDialog.drn,
        target_mode: switchDialog.mode,
        reason: switchDialog.reason,
      });
      setSwitchResult({ success: true, message: res.message, note: res.note });
      loadData();
    } catch (err) {
      setSwitchResult({ success: false, message: err.message });
    }
    setActionLoading(false);
  };

  const handleGenerateBill = async () => {
    setActionLoading(true);
    try {
      await postpaidAPI.generateBill({ DRN: billDialog.drn });
      setBillDialog({ open: false, drn: "" });
      loadData();
    } catch (err) {
      alert(err.message);
    }
    setActionLoading(false);
  };

  const handleRecordPayment = async () => {
    setActionLoading(true);
    try {
      await postpaidAPI.recordPayment({ bill_id: payDialog.billId, amount: Number(payDialog.amount) });
      setPayDialog({ open: false, billId: null, amount: "" });
      loadData();
    } catch (err) {
      alert(err.message);
    }
    setActionLoading(false);
  };

  if (loading) {
    return (
      <Box m="20px" display="flex" justifyContent="center" alignItems="center" height="60vh">
        <CircularProgress sx={{ color: colors.greenAccent[500] }} />
      </Box>
    );
  }

  const s = summary || {};

  return (
    <Box m="20px">
      <Box sx={{ position: "relative" }}>
        <Header title="BILLING" subtitle="Prepaid and Postpaid Billing Management" />
        <Box sx={{ position: "absolute", right: 0, top: "44px" }}>
          <IconButton onClick={loadData} sx={{ color: colors.grey[300] }}>
            <RefreshOutlined />
          </IconButton>
        </Box>
      </Box>

      <Box
        sx={{
          mb: 3,
          backgroundColor: colors.primary[400],
          borderRadius: "8px",
          p: "4px",
          display: "inline-flex",
          gap: "4px",
        }}
      >
        {[
          { label: "Summary", icon: <AttachMoneyOutlined sx={{ fontSize: 18 }} /> },
          { label: `Prepaid (${prepaidMeters.length})`, icon: <ElectricMeterOutlined sx={{ fontSize: 18 }} /> },
          { label: `Postpaid (${postpaidMeters.length})`, icon: <PointOfSaleOutlined sx={{ fontSize: 18 }} /> },
          { label: "Bills", icon: <ReceiptOutlined sx={{ fontSize: 18 }} /> },
          { label: "Switch Mode", icon: <SwapHorizOutlined sx={{ fontSize: 18 }} /> },
        ].map((t, i) => (
          <Button
            key={i}
            size="small"
            startIcon={t.icon}
            onClick={() => setTab(i)}
            sx={{
              px: 2,
              py: 1,
              borderRadius: "6px",
              fontWeight: 600,
              fontSize: "0.8rem",
              textTransform: "none",
              minWidth: "auto",
              color: tab === i ? "#000" : colors.grey[300],
              backgroundColor: tab === i ? colors.greenAccent[500] : "transparent",
              "&:hover": {
                backgroundColor: tab === i ? colors.greenAccent[600] : `${colors.grey[700]}44`,
              },
            }}
          >
            {t.label}
          </Button>
        ))}
      </Box>

      {/* ═══════════ TAB 0: SUMMARY ═══════════ */}
      {tab === 0 && (() => {
        const weeklyChart = buildWeeklyOverlay(s.dailyData);
        const monthlyChart = buildMonthlyOverlay(s.monthlyData);
        const yearlyChart = buildYearlyData(s.yearlyData);

        const xKey = chartPeriod === "yearly" ? "month" : "day";
        const revFmt = (v) => v >= 1000 ? `N$${(v / 1000).toFixed(1)}k` : `N$${Number(v).toFixed(0)}`;
        const kwhFmt = (v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Number(v).toFixed(0)}`;

        let chartData, chartDefs;
        if (chartPeriod === "weekly") {
          chartData = weeklyChart;
          chartDefs = {
            prepaidRev: [
              { key: "twPrepaidRev", name: "This Week", fill: colors.greenAccent[500] },
              { key: "lwPrepaidRev", name: "Last Week", fill: `${colors.greenAccent[500]}66` },
            ],
            postpaidRev: [
              { key: "twPostpaidRev", name: "This Week", fill: colors.blueAccent[500] },
              { key: "lwPostpaidRev", name: "Last Week", fill: `${colors.blueAccent[500]}66` },
            ],
            prepaidKwh: [
              { key: "twPrepaidKwh", name: "This Week", fill: colors.yellowAccent[500] },
              { key: "lwPrepaidKwh", name: "Last Week", fill: `${colors.yellowAccent[500]}66` },
            ],
            postpaidKwh: [
              { key: "twPostpaidKwh", name: "This Week", fill: colors.redAccent[400] },
              { key: "lwPostpaidKwh", name: "Last Week", fill: `${colors.redAccent[400]}66` },
            ],
          };
        } else if (chartPeriod === "monthly") {
          chartData = monthlyChart;
          chartDefs = {
            prepaidRev: [
              { key: "tmPrepaidRev", name: "This Month", fill: colors.greenAccent[500] },
              { key: "pmPrepaidRev", name: "Prev Month", fill: `${colors.greenAccent[500]}66` },
            ],
            postpaidRev: [
              { key: "tmPostpaidRev", name: "This Month", fill: colors.blueAccent[500] },
              { key: "pmPostpaidRev", name: "Prev Month", fill: `${colors.blueAccent[500]}66` },
            ],
            prepaidKwh: [
              { key: "tmPrepaidKwh", name: "This Month", fill: colors.yellowAccent[500] },
              { key: "pmPrepaidKwh", name: "Prev Month", fill: `${colors.yellowAccent[500]}66` },
            ],
            postpaidKwh: [
              { key: "tmPostpaidKwh", name: "This Month", fill: colors.redAccent[400] },
              { key: "pmPostpaidKwh", name: "Prev Month", fill: `${colors.redAccent[400]}66` },
            ],
          };
        } else {
          chartData = yearlyChart;
          chartDefs = {
            prepaidRev: [{ key: "prepaidRevenue", name: "Prepaid Revenue", fill: colors.greenAccent[500] }],
            postpaidRev: [{ key: "postpaidRevenue", name: "Postpaid Revenue", fill: colors.blueAccent[500] }],
            prepaidKwh: [{ key: "prepaidKwh", name: "Prepaid kWh", fill: colors.yellowAccent[500] }],
            postpaidKwh: [{ key: "postpaidKwh", name: "Postpaid kWh", fill: colors.redAccent[400] }],
          };
        }

        const renderChart = (title, bars, formatter) => (
          <Box backgroundColor={colors.primary[400]} borderRadius="8px" p="20px" height="300px">
            <Typography variant="subtitle1" color={colors.grey[100]} fontWeight="bold" mb="10px">
              {title}
            </Typography>
            <Box height="calc(100% - 35px)">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 15, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={colors.grey[800]} />
                  <XAxis dataKey={xKey} tick={{ fill: colors.grey[300], fontSize: 11 }} axisLine={{ stroke: colors.grey[700] }} tickLine={false} />
                  <YAxis tick={{ fill: colors.grey[300], fontSize: 11 }} axisLine={{ stroke: colors.grey[700] }} tickLine={false} tickFormatter={formatter} />
                  <Tooltip content={<ChartTooltip colors={colors} unit={formatter === kwhFmt ? "kWh" : undefined} />} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                  {bars.map((b) => (
                    <Bar key={b.key} dataKey={b.key} name={b.name} fill={b.fill} radius={[3, 3, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </Box>
        );

        return (
        <Box>
          <Box display="grid" gridTemplateColumns="repeat(12, 1fr)" gridAutoRows="140px" gap="5px" mb="20px">
            <StatCard
              icon={<AttachMoneyOutlined sx={{ color: colors.greenAccent[500], fontSize: 28, mb: 0.5 }} />}
              label="Total Revenue (Month)"
              value={fmtCurrency(s.totalRevenue || 0)}
              subLabel={`${(Number(s.prepaidConsumptionKwh || 0) + Number(s.postpaidConsumptionKwh || 0)).toFixed(0)} kWh consumed`}
              colors={colors}
            />
            <StatCard
              icon={<ElectricMeterOutlined sx={{ color: colors.blueAccent[500], fontSize: 28, mb: 0.5 }} />}
              label={`Prepaid (${s.prepaidMeterCount || 0} meters)`}
              value={fmtCurrency(s.prepaidRevenue || 0)}
              subLabel={`${Number(s.prepaidConsumptionKwh || 0).toFixed(1)} kWh | ${s.tokensPurchased || 0} tokens`}
              colors={colors}
            />
            <StatCard
              icon={<PointOfSaleOutlined sx={{ color: colors.yellowAccent[500], fontSize: 28, mb: 0.5 }} />}
              label={`Postpaid (${s.postpaidMeterCount || 0} meters)`}
              value={fmtCurrency(s.postpaidRevenue || 0)}
              subLabel={`${Number(s.postpaidConsumptionKwh || 0).toFixed(1)} kWh consumed`}
              colors={colors}
            />
            <StatCard
              icon={<AccountBalanceOutlined sx={{ color: colors.redAccent[500], fontSize: 28, mb: 0.5 }} />}
              label="Outstanding"
              value={fmtCurrency(s.outstanding || 0)}
              color={colors.redAccent[500]}
              colors={colors}
            />
          </Box>

          <Box
            display="flex"
            gap="4px"
            mb="20px"
            sx={{
              backgroundColor: colors.primary[400],
              borderRadius: "8px",
              p: "4px",
              display: "inline-flex",
            }}
          >
            {[
              { key: "weekly", label: "Weekly" },
              { key: "monthly", label: "Monthly" },
              { key: "yearly", label: "Yearly" },
            ].map((p) => (
              <Button
                key={p.key}
                size="small"
                onClick={() => setChartPeriod(p.key)}
                sx={{
                  px: 2.5,
                  py: 0.8,
                  borderRadius: "6px",
                  fontWeight: 600,
                  fontSize: "0.8rem",
                  textTransform: "none",
                  color: chartPeriod === p.key ? "#000" : colors.grey[300],
                  backgroundColor: chartPeriod === p.key ? colors.greenAccent[500] : "transparent",
                  "&:hover": {
                    backgroundColor: chartPeriod === p.key ? colors.greenAccent[600] : `${colors.grey[700]}44`,
                  },
                }}
              >
                {p.label}
              </Button>
            ))}
          </Box>

          <Box display="grid" gridTemplateColumns="1fr 1fr" gap="15px">
            {renderChart("Prepaid Revenue", chartDefs.prepaidRev, revFmt)}
            {renderChart("Postpaid Revenue", chartDefs.postpaidRev, revFmt)}
            {renderChart("Prepaid Consumption (kWh)", chartDefs.prepaidKwh, kwhFmt)}
            {renderChart("Postpaid Consumption (kWh)", chartDefs.postpaidKwh, kwhFmt)}
          </Box>

          {(() => {
            const meterRows = chartPeriod === "weekly" ? (s.meterWeekly || []) : chartPeriod === "monthly" ? (s.meterMonthly || []) : (s.meterYearly || []);
            const col1Label = chartPeriod === "weekly" ? "This Week" : chartPeriod === "monthly" ? "This Month" : "Year Total";
            const col2Label = chartPeriod === "weekly" ? "Last Week" : chartPeriod === "monthly" ? "Prev Month" : null;
            const getKwh1 = (m) => Number(chartPeriod === "weekly" ? m.twKwh : chartPeriod === "monthly" ? m.tmKwh : m.totalKwh) || 0;
            const getRev1 = (m) => Number(chartPeriod === "weekly" ? m.twRevenue : chartPeriod === "monthly" ? m.tmRevenue : m.totalRevenue) || 0;
            const getKwh2 = (m) => Number(chartPeriod === "weekly" ? m.lwKwh : m.pmKwh) || 0;
            const getRev2 = (m) => Number(chartPeriod === "weekly" ? m.lwRevenue : m.pmRevenue) || 0;
            const totKwh1 = meterRows.reduce((a, m) => a + getKwh1(m), 0);
            const totRev1 = meterRows.reduce((a, m) => a + getRev1(m), 0);
            const totKwh2 = col2Label ? meterRows.reduce((a, m) => a + getKwh2(m), 0) : 0;
            const totRev2 = col2Label ? meterRows.reduce((a, m) => a + getRev2(m), 0) : 0;
            return (
            <Box backgroundColor={colors.primary[400]} borderRadius="8px" mt="20px" overflow="auto">
              <Box p="20px" pb="0">
                <Typography variant="h6" color={colors.grey[100]} fontWeight="bold">
                  Meter Revenue Breakdown
                </Typography>
                <Typography variant="caption" color={colors.grey[400]}>
                  {chartPeriod === "weekly" ? "This week vs last week" : chartPeriod === "monthly" ? "This month vs previous month" : "Year-to-date totals"} per meter
                </Typography>
              </Box>
              <TableContainer sx={{ px: "20px", pb: "20px", mt: "10px" }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      {[
                        "DRN", "Customer", "Mode", "Tariff", "Type", "Rate (N$/kWh)",
                        `${col1Label} kWh`, `${col1Label} Revenue`,
                        ...(col2Label ? [`${col2Label} kWh`, `${col2Label} Revenue`] : []),
                      ].map((h) => (
                        <TableCell key={h} sx={{ color: colors.grey[100], fontWeight: 700, borderBottom: `1px solid ${colors.grey[700]}`, whiteSpace: "nowrap",
                          ...(h.includes("kWh") || h.includes("Revenue") || h.includes("Rate") ? { textAlign: "right" } : {}) }}>
                          {h}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {meterRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={col2Label ? 10 : 8} sx={{ textAlign: "center", color: colors.grey[500], py: 4 }}>
                          No revenue data for this period
                        </TableCell>
                      </TableRow>
                    ) : meterRows.map((m) => (
                      <TableRow key={m.DRN} hover>
                        <TableCell sx={{ fontFamily: "monospace", fontSize: "0.8rem", color: colors.grey[200], borderBottom: `1px solid ${colors.grey[800]}` }}>
                          {m.DRN}
                        </TableCell>
                        <TableCell sx={{ color: colors.grey[100], fontWeight: 600, borderBottom: `1px solid ${colors.grey[800]}` }}>
                          {m.customer || "-"}
                        </TableCell>
                        <TableCell sx={{ borderBottom: `1px solid ${colors.grey[800]}` }}>
                          <Chip label={m.billing_mode} size="small" sx={{
                            backgroundColor: m.billing_mode === "Postpaid" ? `${colors.blueAccent[500]}22` : `${colors.greenAccent[500]}22`,
                            color: m.billing_mode === "Postpaid" ? colors.blueAccent[500] : colors.greenAccent[500],
                            fontWeight: 600, fontSize: "0.72rem",
                          }} />
                        </TableCell>
                        <TableCell sx={{ borderBottom: `1px solid ${colors.grey[800]}` }}>
                          <Chip label={m.tariff_group || "Default"} size="small" sx={{
                            backgroundColor: `${colors.greenAccent[500]}22`, color: colors.greenAccent[500],
                            fontWeight: 600, fontSize: "0.72rem",
                          }} />
                        </TableCell>
                        <TableCell sx={{ color: colors.grey[300], fontSize: "0.8rem", borderBottom: `1px solid ${colors.grey[800]}` }}>
                          {m.tariff_type || "-"}
                        </TableCell>
                        <TableCell align="right" sx={{ color: colors.grey[200], fontFamily: "monospace", borderBottom: `1px solid ${colors.grey[800]}` }}>
                          {Number(m.rate_applied || 0).toFixed(2)}
                        </TableCell>
                        <TableCell align="right" sx={{ color: colors.grey[200], fontFamily: "monospace", borderBottom: `1px solid ${colors.grey[800]}` }}>
                          {getKwh1(m).toFixed(2)}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, color: colors.greenAccent[400], fontFamily: "monospace", borderBottom: `1px solid ${colors.grey[800]}` }}>
                          {fmtCurrency(getRev1(m))}
                        </TableCell>
                        {col2Label && (
                          <>
                            <TableCell align="right" sx={{ color: colors.grey[400], fontFamily: "monospace", borderBottom: `1px solid ${colors.grey[800]}` }}>
                              {getKwh2(m).toFixed(2)}
                            </TableCell>
                            <TableCell align="right" sx={{ color: colors.grey[400], fontFamily: "monospace", borderBottom: `1px solid ${colors.grey[800]}` }}>
                              {fmtCurrency(getRev2(m))}
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    ))}
                    {meterRows.length > 0 && (
                      <TableRow sx={{ backgroundColor: `${colors.primary[500]}88` }}>
                        <TableCell colSpan={6} sx={{ fontWeight: 700, color: colors.grey[100], borderBottom: "none" }}>
                          TOTAL
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: colors.grey[100], fontFamily: "monospace", borderBottom: "none" }}>
                          {totKwh1.toFixed(2)}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: colors.greenAccent[400], fontFamily: "monospace", borderBottom: "none" }}>
                          {fmtCurrency(totRev1)}
                        </TableCell>
                        {col2Label && (
                          <>
                            <TableCell align="right" sx={{ fontWeight: 700, color: colors.grey[300], fontFamily: "monospace", borderBottom: "none" }}>
                              {totKwh2.toFixed(2)}
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700, color: colors.grey[300], fontFamily: "monospace", borderBottom: "none" }}>
                              {fmtCurrency(totRev2)}
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
            );
          })()}
        </Box>
        );
      })()}

      {/* ═══════════ TAB 1: PREPAID METERS ═══════════ */}
      {tab === 1 && (
        <Box backgroundColor={colors.primary[400]} borderRadius="4px" overflow="auto">
          <Box p="20px" pb="0">
            <Typography variant="h5" color={colors.grey[100]} fontWeight="bold" mb="10px">
              Prepaid Meters ({prepaidMeters.length})
            </Typography>
          </Box>
          <TableContainer sx={{ px: "20px", pb: "20px" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {["DRN", "Customer", "City", "Tariff", "Credit (kWh)", "Last Purchase", "Amount", "Last kWh", "Net Metering", "Status"].map((h) => (
                    <TableCell key={h} sx={{ color: colors.grey[100], fontWeight: 700, borderBottom: `1px solid ${colors.grey[700]}` }}>
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {prepaidMeters.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} sx={{ textAlign: "center", color: colors.grey[500], py: 4 }}>
                      No prepaid meters found
                    </TableCell>
                  </TableRow>
                ) : prepaidMeters.map((m) => (
                  <TableRow key={m.DRN} hover>
                    <TableCell sx={{ fontFamily: "monospace", fontSize: "0.8rem", color: colors.grey[200], borderBottom: `1px solid ${colors.grey[800]}` }}>
                      {m.DRN}
                    </TableCell>
                    <TableCell sx={{ color: colors.grey[100], fontWeight: 600, borderBottom: `1px solid ${colors.grey[800]}` }}>
                      {m.customer || "-"}
                    </TableCell>
                    <TableCell sx={{ color: colors.grey[300], borderBottom: `1px solid ${colors.grey[800]}` }}>
                      {m.City || "-"}
                    </TableCell>
                    <TableCell sx={{ borderBottom: `1px solid ${colors.grey[800]}` }}>
                      <Chip
                        label={m.tariffGroup || "Unassigned"}
                        size="small"
                        sx={{
                          backgroundColor: m.tariffGroup && m.tariffGroup !== "Unassigned" ? `${colors.greenAccent[500]}22` : `${colors.redAccent[500]}22`,
                          color: m.tariffGroup && m.tariffGroup !== "Unassigned" ? colors.greenAccent[500] : colors.redAccent[500],
                          fontWeight: 600, fontSize: "0.72rem"
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, color: colors.greenAccent[400], fontFamily: "monospace", borderBottom: `1px solid ${colors.grey[800]}` }}>
                      {m.creditKwh != null ? `${Number(m.creditKwh).toFixed(1)} kWh` : "-"}
                    </TableCell>
                    <TableCell sx={{ color: colors.grey[300], borderBottom: `1px solid ${colors.grey[800]}` }}>
                      {m.lastPurchaseDate ? new Date(m.lastPurchaseDate).toLocaleDateString("en-ZA") : "-"}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, color: colors.grey[100], borderBottom: `1px solid ${colors.grey[800]}` }}>
                      {m.lastPurchaseAmount ? fmtCurrency(m.lastPurchaseAmount) : "-"}
                    </TableCell>
                    <TableCell sx={{ color: colors.grey[300], fontFamily: "monospace", borderBottom: `1px solid ${colors.grey[800]}` }}>
                      {m.lastPurchasedKwh != null ? `${Number(m.lastPurchasedKwh).toFixed(1)} kWh` : "-"}
                    </TableCell>
                    <TableCell sx={{ borderBottom: `1px solid ${colors.grey[800]}` }}>
                      {m.netMeteringMode != null && m.netMeteringMode > 0 ? (
                        <Chip
                          label={["", "Net Billing", "Feed-in", "TOU"][m.netMeteringMode] || "Active"}
                          size="small"
                          sx={{ backgroundColor: `${colors.blueAccent[500]}22`, color: colors.blueAccent[500], fontWeight: 600, fontSize: "0.72rem" }}
                        />
                      ) : (
                        <Typography variant="caption" color={colors.grey[500]}>-</Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ borderBottom: `1px solid ${colors.grey[800]}` }}>
                      <Chip label={m.customerStatus || "Active"} size="small" sx={{ backgroundColor: `${getStatusColor(m.customerStatus || "Active")}22`, color: getStatusColor(m.customerStatus || "Active"), fontWeight: 600, fontSize: "0.72rem" }} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* ═══════════ TAB 2: POSTPAID METERS ═══════════ */}
      {tab === 2 && (
        <Box backgroundColor={colors.primary[400]} borderRadius="4px" overflow="auto">
          <Box p="20px" pb="0" display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h5" color={colors.grey[100]} fontWeight="bold" mb="10px">
              Postpaid Meters ({postpaidMeters.length})
            </Typography>
          </Box>
          <TableContainer sx={{ px: "20px", pb: "20px" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {["DRN", "Customer", "City", "Tariff", "Net Metering", "Credit Days", "Latest Bill", "Bill Status", "Actions"].map((h) => (
                    <TableCell key={h} sx={{ color: colors.grey[100], fontWeight: 700, borderBottom: `1px solid ${colors.grey[700]}` }}>
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {postpaidMeters.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} sx={{ textAlign: "center", color: colors.grey[500], py: 4 }}>
                      No postpaid meters configured. Use the "Switch Mode" tab to convert meters.
                    </TableCell>
                  </TableRow>
                ) : postpaidMeters.map((m) => (
                  <TableRow key={m.DRN} hover>
                    <TableCell sx={{ fontFamily: "monospace", fontSize: "0.8rem", color: colors.grey[200], borderBottom: `1px solid ${colors.grey[800]}` }}>
                      {m.DRN}
                    </TableCell>
                    <TableCell sx={{ color: colors.grey[100], fontWeight: 600, borderBottom: `1px solid ${colors.grey[800]}` }}>
                      {m.customer || "-"}
                    </TableCell>
                    <TableCell sx={{ color: colors.grey[300], borderBottom: `1px solid ${colors.grey[800]}` }}>
                      {m.City || "-"}
                    </TableCell>
                    <TableCell sx={{ borderBottom: `1px solid ${colors.grey[800]}` }}>
                      <Chip
                        label={m.tariffGroup || "Unassigned"}
                        size="small"
                        sx={{
                          backgroundColor: m.tariffGroup && m.tariffGroup !== "Unassigned" ? `${colors.greenAccent[500]}22` : `${colors.redAccent[500]}22`,
                          color: m.tariffGroup && m.tariffGroup !== "Unassigned" ? colors.greenAccent[500] : colors.redAccent[500],
                          fontWeight: 600, fontSize: "0.72rem"
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ borderBottom: `1px solid ${colors.grey[800]}` }}>
                      {m.netMeteringMode != null && m.netMeteringMode > 0 ? (
                        <Chip
                          label={`${["", "Net Billing", "Feed-in", "TOU"][m.netMeteringMode]}${m.feedInRate ? ` N$${m.feedInRate}` : ""}`}
                          size="small"
                          sx={{ backgroundColor: `${colors.blueAccent[500]}22`, color: colors.blueAccent[500], fontWeight: 600, fontSize: "0.72rem" }}
                        />
                      ) : "-"}
                    </TableCell>
                    <TableCell sx={{ color: colors.grey[300], borderBottom: `1px solid ${colors.grey[800]}` }}>
                      {m.billing_credit_days || "-"}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, color: colors.grey[100], borderBottom: `1px solid ${colors.grey[800]}` }}>
                      {m.latestBill ? fmtCurrency(m.latestBill.total_amount) : "No bills"}
                    </TableCell>
                    <TableCell sx={{ borderBottom: `1px solid ${colors.grey[800]}` }}>
                      {m.latestBill ? (
                        <Chip
                          label={m.latestBill.status}
                          size="small"
                          sx={{ backgroundColor: `${getStatusColor(m.latestBill.status)}22`, color: getStatusColor(m.latestBill.status), fontWeight: 600, fontSize: "0.72rem" }}
                        />
                      ) : "-"}
                    </TableCell>
                    <TableCell sx={{ borderBottom: `1px solid ${colors.grey[800]}` }}>
                      <Button
                        size="small"
                        variant="outlined"
                        sx={{ color: colors.greenAccent[500], borderColor: colors.greenAccent[500], fontSize: "0.7rem", mr: 1 }}
                        onClick={() => setBillDialog({ open: true, drn: m.DRN })}
                      >
                        Generate Bill
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* ═══════════ TAB 3: POSTPAID BILLS ═══════════ */}
      {tab === 3 && (
        <Box backgroundColor={colors.primary[400]} borderRadius="4px" overflow="auto">
          <Box p="20px" pb="0">
            <Typography variant="h5" color={colors.grey[100]} fontWeight="bold" mb="10px">
              Postpaid Bills ({postpaidBills.length})
            </Typography>
          </Box>
          <TableContainer sx={{ px: "20px", pb: "20px" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {["ID", "DRN", "Customer", "Period", "kWh", "Energy Charge", "Fixed", "VAT", "Total", "Paid", "Due Date", "Status", "Actions"].map((h) => (
                    <TableCell key={h} sx={{ color: colors.grey[100], fontWeight: 700, borderBottom: `1px solid ${colors.grey[700]}`, ...(["Energy Charge", "Fixed", "VAT", "Total", "Paid"].includes(h) ? { textAlign: "right" } : {}) }}>
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {postpaidBills.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} sx={{ textAlign: "center", color: colors.grey[500], py: 4 }}>
                      No postpaid bills generated yet
                    </TableCell>
                  </TableRow>
                ) : postpaidBills.map((b) => (
                  <TableRow key={b.id} hover>
                    <TableCell sx={{ fontFamily: "monospace", fontSize: "0.8rem", color: colors.grey[200], borderBottom: `1px solid ${colors.grey[800]}` }}>
                      {b.id}
                    </TableCell>
                    <TableCell sx={{ fontFamily: "monospace", fontSize: "0.8rem", color: colors.grey[200], borderBottom: `1px solid ${colors.grey[800]}` }}>
                      {b.DRN}
                    </TableCell>
                    <TableCell sx={{ color: colors.grey[100], fontWeight: 600, borderBottom: `1px solid ${colors.grey[800]}` }}>
                      {b.customer || "-"}
                    </TableCell>
                    <TableCell sx={{ color: colors.grey[300], fontSize: "0.75rem", borderBottom: `1px solid ${colors.grey[800]}` }}>
                      {new Date(b.bill_period_start).toLocaleDateString("en-ZA")} - {new Date(b.bill_period_end).toLocaleDateString("en-ZA")}
                    </TableCell>
                    <TableCell sx={{ color: colors.grey[200], borderBottom: `1px solid ${colors.grey[800]}` }}>
                      {Number(b.total_kwh).toFixed(1)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: colors.grey[200], borderBottom: `1px solid ${colors.grey[800]}` }}>
                      {fmtCurrency(b.energy_charge)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: colors.grey[200], borderBottom: `1px solid ${colors.grey[800]}` }}>
                      {fmtCurrency(b.fixed_charge)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: colors.grey[200], borderBottom: `1px solid ${colors.grey[800]}` }}>
                      {fmtCurrency(b.vat_amount)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: colors.grey[100], borderBottom: `1px solid ${colors.grey[800]}` }}>
                      {fmtCurrency(b.total_amount)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: colors.grey[200], borderBottom: `1px solid ${colors.grey[800]}` }}>
                      {fmtCurrency(b.paid_amount)}
                    </TableCell>
                    <TableCell sx={{ color: colors.grey[300], borderBottom: `1px solid ${colors.grey[800]}` }}>
                      {new Date(b.due_date).toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" })}
                    </TableCell>
                    <TableCell sx={{ borderBottom: `1px solid ${colors.grey[800]}` }}>
                      <Chip label={b.status} size="small" sx={{ backgroundColor: `${getStatusColor(b.status)}22`, color: getStatusColor(b.status), fontWeight: 600, fontSize: "0.72rem" }} />
                    </TableCell>
                    <TableCell sx={{ borderBottom: `1px solid ${colors.grey[800]}` }}>
                      {b.status !== "Paid" && (
                        <Button
                          size="small"
                          variant="outlined"
                          sx={{ color: colors.greenAccent[500], borderColor: colors.greenAccent[500], fontSize: "0.7rem" }}
                          onClick={() => setPayDialog({ open: true, billId: b.id, amount: String(Number(b.total_amount) - Number(b.paid_amount)) })}
                        >
                          Pay
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* ═══════════ TAB 4: SWITCH MODE ═══════════ */}
      {tab === 4 && (
        <Box>
          <Box display="grid" gridTemplateColumns="1fr 1fr" gap="20px" mb="20px">
            <Box backgroundColor={colors.primary[400]} borderRadius="4px" p="20px">
              <Typography variant="h6" color={colors.greenAccent[500]} fontWeight="bold" mb="10px">
                Prepaid to Postpaid
              </Typography>
              <Typography variant="body2" color={colors.grey[300]} mb="10px">
                When switching from prepaid to postpaid, the meter will first consume all remaining prepaid
                credit units. Once units reach zero, the meter switches to postpaid mode where the relay stays
                ON and energy usage is tracked for monthly billing. No more token purchases are needed.
              </Typography>
              <Typography variant="body2" color={colors.yellowAccent[500]}>
                The meter must deplete all existing prepaid units before the switch completes.
              </Typography>
            </Box>
            <Box backgroundColor={colors.primary[400]} borderRadius="4px" p="20px">
              <Typography variant="h6" color={colors.blueAccent[500]} fontWeight="bold" mb="10px">
                Postpaid to Prepaid
              </Typography>
              <Typography variant="body2" color={colors.grey[300]} mb="10px">
                When switching from postpaid to prepaid, a final bill is automatically generated for usage
                up to the switch date. The meter relay turns OFF until prepaid tokens are loaded. Any outstanding
                postpaid bills remain in the system for collection.
              </Typography>
              <Typography variant="body2" color={colors.yellowAccent[500]}>
                The meter will be disconnected until the customer loads prepaid tokens.
              </Typography>
            </Box>
          </Box>

          <Box backgroundColor={colors.primary[400]} borderRadius="4px" overflow="auto">
            <Box p="20px" pb="0">
              <Typography variant="h5" color={colors.grey[100]} fontWeight="bold" mb="10px">
                All Meters - Billing Mode
              </Typography>
            </Box>
            <TableContainer sx={{ px: "20px", pb: "20px" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {["DRN", "Customer", "City", "Current Mode", "Tariff", "Email", "Phone", "Action"].map((h) => (
                      <TableCell key={h} sx={{ color: colors.grey[100], fontWeight: 700, borderBottom: `1px solid ${colors.grey[700]}` }}>
                        {h}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {allMeters.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} sx={{ textAlign: "center", color: colors.grey[500], py: 4 }}>
                        No meters found
                      </TableCell>
                    </TableRow>
                  ) : allMeters.map((m) => (
                    <TableRow key={m.DRN} hover>
                      <TableCell sx={{ fontFamily: "monospace", fontSize: "0.8rem", color: colors.grey[200], borderBottom: `1px solid ${colors.grey[800]}` }}>
                        {m.DRN}
                      </TableCell>
                      <TableCell sx={{ color: colors.grey[100], fontWeight: 600, borderBottom: `1px solid ${colors.grey[800]}` }}>
                        {m.customer || "-"}
                      </TableCell>
                      <TableCell sx={{ color: colors.grey[300], borderBottom: `1px solid ${colors.grey[800]}` }}>
                        {m.City || "-"}
                      </TableCell>
                      <TableCell sx={{ borderBottom: `1px solid ${colors.grey[800]}` }}>
                        <Chip
                          label={m.billing_mode}
                          size="small"
                          sx={{
                            backgroundColor: m.billing_mode === "Postpaid" ? `${colors.blueAccent[500]}22` : `${colors.greenAccent[500]}22`,
                            color: m.billing_mode === "Postpaid" ? colors.blueAccent[500] : colors.greenAccent[500],
                            fontWeight: 600,
                            fontSize: "0.72rem",
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ borderBottom: `1px solid ${colors.grey[800]}` }}>
                        <Chip
                          label={m.tariffGroup || "Unassigned"}
                          size="small"
                          sx={{
                            backgroundColor: m.tariffGroup && m.tariffGroup !== "Unassigned" ? `${colors.greenAccent[500]}22` : `${colors.redAccent[500]}22`,
                            color: m.tariffGroup && m.tariffGroup !== "Unassigned" ? colors.greenAccent[500] : colors.redAccent[500],
                            fontWeight: 600, fontSize: "0.72rem"
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ color: colors.grey[300], fontSize: "0.8rem", borderBottom: `1px solid ${colors.grey[800]}` }}>
                        {m.email || "-"}
                      </TableCell>
                      <TableCell sx={{ color: colors.grey[300], fontSize: "0.8rem", borderBottom: `1px solid ${colors.grey[800]}` }}>
                        {m.phone || "-"}
                      </TableCell>
                      <TableCell sx={{ borderBottom: `1px solid ${colors.grey[800]}` }}>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<SwapHorizOutlined />}
                          sx={{
                            color: m.billing_mode === "Prepaid" ? colors.blueAccent[500] : colors.greenAccent[500],
                            borderColor: m.billing_mode === "Prepaid" ? colors.blueAccent[500] : colors.greenAccent[500],
                            fontSize: "0.7rem",
                          }}
                          onClick={() => setSwitchDialog({
                            open: true,
                            drn: m.DRN,
                            mode: m.billing_mode === "Prepaid" ? "Postpaid" : "Prepaid",
                            reason: "",
                          })}
                        >
                          Switch to {m.billing_mode === "Prepaid" ? "Postpaid" : "Prepaid"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </Box>
      )}

      {/* ═══════════ SWITCH MODE DIALOG ═══════════ */}
      <Dialog open={switchDialog.open} onClose={() => { setSwitchDialog({ open: false, drn: "", mode: "", reason: "" }); setSwitchResult(null); }} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ backgroundColor: colors.primary[400], color: colors.grey[100] }}>
          Switch Meter to {switchDialog.mode}
        </DialogTitle>
        <DialogContent sx={{ backgroundColor: colors.primary[400] }}>
          <Typography variant="body2" color={colors.grey[300]} mb={2} mt={1}>
            {switchDialog.mode === "Postpaid"
              ? `Switching ${switchDialog.drn} to Postpaid. The meter will consume all remaining prepaid units, then switch to postpaid mode (relay stays ON, usage tracked for monthly billing).`
              : `Switching ${switchDialog.drn} to Prepaid. A final postpaid bill will be generated. The meter relay will turn OFF until prepaid tokens are loaded.`
            }
          </Typography>
          <TextField
            label="Reason (optional)"
            fullWidth
            value={switchDialog.reason}
            onChange={(e) => setSwitchDialog({ ...switchDialog, reason: e.target.value })}
            sx={{ mt: 1, "& .MuiInputBase-root": { color: colors.grey[100] }, "& .MuiInputLabel-root": { color: colors.grey[300] }, "& .MuiOutlinedInput-notchedOutline": { borderColor: colors.grey[700] } }}
          />
          {switchResult && (
            <Alert severity={switchResult.success ? "success" : "error"} sx={{ mt: 2 }}>
              {switchResult.message}
              {switchResult.note && <Typography variant="caption" display="block">{switchResult.note}</Typography>}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ backgroundColor: colors.primary[400] }}>
          <Button onClick={() => { setSwitchDialog({ open: false, drn: "", mode: "", reason: "" }); setSwitchResult(null); }} sx={{ color: colors.grey[300] }}>
            Cancel
          </Button>
          <Button onClick={handleSwitchMode} disabled={actionLoading} variant="contained" sx={{ backgroundColor: switchDialog.mode === "Postpaid" ? colors.blueAccent[500] : colors.greenAccent[500], color: "#000" }}>
            {actionLoading ? <CircularProgress size={20} /> : `Confirm Switch to ${switchDialog.mode}`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ═══════════ GENERATE BILL DIALOG ═══════════ */}
      <Dialog open={billDialog.open} onClose={() => setBillDialog({ open: false, drn: "" })} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ backgroundColor: colors.primary[400], color: colors.grey[100] }}>
          Generate Bill for {billDialog.drn}
        </DialogTitle>
        <DialogContent sx={{ backgroundColor: colors.primary[400] }}>
          <Typography variant="body2" color={colors.grey[300]} mt={1}>
            This will generate a bill for the current billing period based on the meter's energy consumption data.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ backgroundColor: colors.primary[400] }}>
          <Button onClick={() => setBillDialog({ open: false, drn: "" })} sx={{ color: colors.grey[300] }}>Cancel</Button>
          <Button onClick={handleGenerateBill} disabled={actionLoading} variant="contained" sx={{ backgroundColor: colors.greenAccent[500], color: "#000" }}>
            {actionLoading ? <CircularProgress size={20} /> : "Generate Bill"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ═══════════ RECORD PAYMENT DIALOG ═══════════ */}
      <Dialog open={payDialog.open} onClose={() => setPayDialog({ open: false, billId: null, amount: "" })} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ backgroundColor: colors.primary[400], color: colors.grey[100] }}>
          Record Payment
        </DialogTitle>
        <DialogContent sx={{ backgroundColor: colors.primary[400] }}>
          <TextField
            label="Payment Amount (N$)"
            fullWidth
            type="number"
            value={payDialog.amount}
            onChange={(e) => setPayDialog({ ...payDialog, amount: e.target.value })}
            sx={{ mt: 2, "& .MuiInputBase-root": { color: colors.grey[100] }, "& .MuiInputLabel-root": { color: colors.grey[300] }, "& .MuiOutlinedInput-notchedOutline": { borderColor: colors.grey[700] } }}
          />
        </DialogContent>
        <DialogActions sx={{ backgroundColor: colors.primary[400] }}>
          <Button onClick={() => setPayDialog({ open: false, billId: null, amount: "" })} sx={{ color: colors.grey[300] }}>Cancel</Button>
          <Button onClick={handleRecordPayment} disabled={actionLoading || !payDialog.amount} variant="contained" sx={{ backgroundColor: colors.greenAccent[500], color: "#000" }}>
            {actionLoading ? <CircularProgress size={20} /> : "Record Payment"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
