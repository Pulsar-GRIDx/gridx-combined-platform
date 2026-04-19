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
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
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

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatChartData(rows) {
  if (!rows || rows.length === 0) {
    return dayNames.map((d) => ({ day: d, revenue: 0 }));
  }
  return rows.map((r) => ({
    day: dayNames[new Date(r.day).getDay()] || r.day,
    revenue: Number(r.revenue),
  }));
}

function ChartTooltip({ active, payload, label, colors }) {
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
          Revenue: N$ {Number(p.value).toLocaleString()}
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
      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Header title="BILLING" subtitle="Prepaid and Postpaid Billing Management" />
        <IconButton onClick={loadData} sx={{ color: colors.grey[300] }}>
          <RefreshOutlined />
        </IconButton>
      </Box>

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{
          mb: 2,
          "& .MuiTab-root": { color: colors.grey[300], fontWeight: 600 },
          "& .Mui-selected": { color: colors.greenAccent[500] },
          "& .MuiTabs-indicator": { backgroundColor: colors.greenAccent[500] },
        }}
      >
        <Tab label="Summary" />
        <Tab label={`Prepaid Meters (${prepaidMeters.length})`} />
        <Tab label={`Postpaid Meters (${postpaidMeters.length})`} />
        <Tab label="Postpaid Bills" />
        <Tab label="Switch Mode" />
      </Tabs>

      {/* ═══════════ TAB 0: SUMMARY ═══════════ */}
      {tab === 0 && (
        <Box display="grid" gridTemplateColumns="repeat(12, 1fr)" gridAutoRows="140px" gap="5px">
          <StatCard
            icon={<AttachMoneyOutlined sx={{ color: colors.greenAccent[500], fontSize: 28, mb: 0.5 }} />}
            label="Total Revenue (Month)"
            value={fmtCurrency(s.totalRevenue || 0)}
            colors={colors}
          />
          <StatCard
            icon={<ElectricMeterOutlined sx={{ color: colors.blueAccent[500], fontSize: 28, mb: 0.5 }} />}
            label={`Prepaid Revenue (${s.prepaidMeterCount || 0} meters)`}
            value={fmtCurrency(s.prepaidRevenue || 0)}
            subLabel={`${fmt(s.prepaidTokenCount || 0)} tokens | ${Number(s.prepaidCumulativeKwh || 0).toFixed(1)} kWh total`}
            colors={colors}
          />
          <StatCard
            icon={<PointOfSaleOutlined sx={{ color: colors.yellowAccent[500], fontSize: 28, mb: 0.5 }} />}
            label={`Postpaid Revenue (${s.postpaidMeterCount || 0} meters)`}
            value={fmtCurrency(s.postpaidRevenue || 0)}
            subLabel={`${Number(s.postpaidConsumptionKwh || 0).toFixed(1)} kWh consumed | N$ ${fmt(s.postpaidBilledAmount || 0)} billed`}
            colors={colors}
          />
          <StatCard
            icon={<AccountBalanceOutlined sx={{ color: colors.redAccent[500], fontSize: 28, mb: 0.5 }} />}
            label="Outstanding"
            value={fmtCurrency(s.outstanding || 0)}
            color={colors.redAccent[500]}
            colors={colors}
          />

          {/* Charts */}
          <Box gridColumn="span 6" gridRow="span 3" backgroundColor={colors.primary[400]} borderRadius="4px" p="20px">
            <Typography variant="h5" color={colors.grey[100]} fontWeight="bold" mb="15px">
              Prepaid Daily Revenue
            </Typography>
            <Box height="calc(100% - 40px)">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={formatChartData(s.prepaidDaily)} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={colors.grey[800]} />
                  <XAxis dataKey="day" tick={{ fill: colors.grey[300], fontSize: 12 }} axisLine={{ stroke: colors.grey[700] }} tickLine={false} />
                  <YAxis tick={{ fill: colors.grey[300], fontSize: 12 }} axisLine={{ stroke: colors.grey[700] }} tickLine={false} tickFormatter={(v) => `N$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<ChartTooltip colors={colors} />} />
                  <Area type="monotone" dataKey="revenue" stroke={colors.greenAccent[500]} fill={`${colors.greenAccent[500]}33`} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
          </Box>

          <Box gridColumn="span 6" gridRow="span 3" backgroundColor={colors.primary[400]} borderRadius="4px" p="20px">
            <Typography variant="h5" color={colors.grey[100]} fontWeight="bold" mb="15px">
              Postpaid Daily Revenue
            </Typography>
            <Box height="calc(100% - 40px)">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={formatChartData(s.postpaidDaily)} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={colors.grey[800]} />
                  <XAxis dataKey="day" tick={{ fill: colors.grey[300], fontSize: 12 }} axisLine={{ stroke: colors.grey[700] }} tickLine={false} />
                  <YAxis tick={{ fill: colors.grey[300], fontSize: 12 }} axisLine={{ stroke: colors.grey[700] }} tickLine={false} tickFormatter={(v) => `N$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<ChartTooltip colors={colors} />} />
                  <Area type="monotone" dataKey="revenue" stroke={colors.blueAccent[500]} fill={`${colors.blueAccent[500]}33`} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
          </Box>
        </Box>
      )}

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
                  {["DRN", "Customer", "City", "Tier", "Account No", "Last Purchase", "Amount", "Status"].map((h) => (
                    <TableCell key={h} sx={{ color: colors.grey[100], fontWeight: 700, borderBottom: `1px solid ${colors.grey[700]}` }}>
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {prepaidMeters.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} sx={{ textAlign: "center", color: colors.grey[500], py: 4 }}>
                      No prepaid meters configured
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
                    <TableCell sx={{ color: colors.grey[300], borderBottom: `1px solid ${colors.grey[800]}` }}>
                      {m.meter_tier || "-"}
                    </TableCell>
                    <TableCell sx={{ fontFamily: "monospace", fontSize: "0.8rem", color: colors.grey[200], borderBottom: `1px solid ${colors.grey[800]}` }}>
                      {m.accountNo || "-"}
                    </TableCell>
                    <TableCell sx={{ color: colors.grey[300], borderBottom: `1px solid ${colors.grey[800]}` }}>
                      {m.lastPurchaseDate ? new Date(m.lastPurchaseDate).toLocaleDateString("en-ZA") : "-"}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, color: colors.grey[100], borderBottom: `1px solid ${colors.grey[800]}` }}>
                      {m.lastPurchaseAmount ? fmtCurrency(m.lastPurchaseAmount) : "-"}
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
                  {["DRN", "Customer", "City", "Tier", "Billing Period", "Credit Days", "Latest Bill", "Bill Status", "Actions"].map((h) => (
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
                    <TableCell sx={{ color: colors.grey[300], borderBottom: `1px solid ${colors.grey[800]}` }}>
                      {m.meter_tier || "-"}
                    </TableCell>
                    <TableCell sx={{ color: colors.grey[300], borderBottom: `1px solid ${colors.grey[800]}` }}>
                      {m.billing_period || "-"}
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
                    {["DRN", "Customer", "City", "Current Mode", "Tier", "Email", "Phone", "Action"].map((h) => (
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
                      <TableCell sx={{ color: colors.grey[300], borderBottom: `1px solid ${colors.grey[800]}` }}>
                        {m.meter_tier || "-"}
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
