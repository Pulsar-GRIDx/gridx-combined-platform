import { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  InputAdornment,
  Button,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  CircularProgress,
  Snackbar,
  Alert,
  useTheme,
  Tabs,
  Tab,
  LinearProgress,
  Stepper,
  Step,
  StepLabel,
  StepConnector,
} from "@mui/material";
import {
  DownloadOutlined,
  SearchOutlined,
  PrintOutlined,
  UndoOutlined,
  ReceiptLongOutlined,
  AttachMoneyOutlined,
  BoltOutlined,
  ReplayOutlined,
  SwapHorizOutlined,
  CheckCircleOutlined,
  ErrorOutlined,
  HourglassEmptyOutlined,
  SendOutlined,
  SyncOutlined,
  RefreshOutlined,
} from "@mui/icons-material";
import { styled } from "@mui/material/styles";
import { tokens } from "../theme";
import Header from "../components/Header";
import { vendingAPI, mqttAPI } from "../services/api";
import { transactions as mockTransactions } from "../services/mockData";

// ---- Helpers ----
const fmtCurrency = (n) =>
  `N$ ${Number(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmt = (n) => Number(n).toLocaleString();

function formatDateTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-NA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }) +
    " " +
    d.toLocaleTimeString("en-NA", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  );
}

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ---- Transfer status step mapping ----
const TRANSFER_STEPS = [
  { key: "pending", label: "Command Sent", icon: <SendOutlined /> },
  { key: "token_generated", label: "Source ACK", icon: <CheckCircleOutlined /> },
  { key: "forwarded", label: "Forwarded to Target", icon: <SwapHorizOutlined /> },
  { key: "completing", label: "Target ACK", icon: <CheckCircleOutlined /> },
  { key: "completed", label: "Source Deducted", icon: <CheckCircleOutlined /> },
];

function getStepIndex(status) {
  switch (status) {
    case "pending": return 0;
    case "token_generated": return 1;
    case "forwarded": return 2;
    case "completing": return 3;
    case "completed": return 4;
    case "failed": return -1;
    default: return 0;
  }
}

// Custom step connector with colored progress line
const ColoredConnector = styled(StepConnector)(({ theme }) => ({
  "& .MuiStepConnector-line": {
    borderTopWidth: 3,
    borderRadius: 1,
  },
}));

export default function Transactions() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);

  // Tab state
  const [activeTab, setActiveTab] = useState(0);

  // ========== VENDING TAB STATE ==========
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [transactions, setTransactions] = useState(mockTransactions);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });

  // Reversal dialog
  const [reverseDialogOpen, setReverseDialogOpen] = useState(false);
  const [reverseTarget, setReverseTarget] = useState(null);
  const [reverseReason, setReverseReason] = useState("");

  // ========== CREDIT TRANSFERS TAB STATE ==========
  const [transfers, setTransfers] = useState([]);
  const [transferSummary, setTransferSummary] = useState({});
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferSearch, setTransferSearch] = useState("");
  const [transferStatusFilter, setTransferStatusFilter] = useState("All");
  const [transferDateFrom, setTransferDateFrom] = useState("");
  const [transferDateTo, setTransferDateTo] = useState("");
  const [expandedTransfer, setExpandedTransfer] = useState(null);
  const autoRefreshRef = useRef(null);

  // ========== VENDING DATA LOADING ==========
  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (typeFilter !== "All") params.type = typeFilter;
      if (statusFilter !== "All") params.status = statusFilter;
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;
      const res = await vendingAPI.getTransactions(params);
      if (res.success && res.data?.length > 0) {
        setTransactions(res.data);
      }
    } catch {
      // Keep mock data as fallback
    }
    setLoading(false);
  };

  useEffect(() => { fetchTransactions(); }, []);

  // ========== CREDIT TRANSFERS DATA LOADING ==========
  const fetchTransfers = useCallback(async () => {
    setTransferLoading(true);
    try {
      const params = {};
      if (transferStatusFilter !== "All") params.status = transferStatusFilter;
      if (transferSearch) params.source_drn = transferSearch;
      if (transferDateFrom) params.from = transferDateFrom;
      if (transferDateTo) params.to = transferDateTo;
      const res = await mqttAPI.listTransfers(params);
      setTransfers(res.transfers || []);
      setTransferSummary(res.summary || {});
    } catch (err) {
      console.error("Failed to load transfers:", err);
      setTransfers([]);
    }
    setTransferLoading(false);
  }, [transferStatusFilter, transferSearch, transferDateFrom, transferDateTo]);

  useEffect(() => {
    if (activeTab === 1) {
      fetchTransfers();
      // Auto-refresh every 10s for live progress tracking
      autoRefreshRef.current = setInterval(fetchTransfers, 10000);
      return () => clearInterval(autoRefreshRef.current);
    } else {
      clearInterval(autoRefreshRef.current);
    }
  }, [activeTab, fetchTransfers]);

  // ---- Filtered vending transactions ----
  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (search) {
        const q = search.toLowerCase();
        const match =
          (t.refNo || "").toLowerCase().includes(q) ||
          (t.customerName || "").toLowerCase().includes(q) ||
          (t.meterNo || "").toLowerCase().includes(q);
        if (!match) return false;
      }
      if (dateFrom) {
        const from = new Date(dateFrom);
        const txDate = new Date(t.dateTime);
        if (txDate < from) return false;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        const txDate = new Date(t.dateTime);
        if (txDate > to) return false;
      }
      if (typeFilter !== "All" && t.type !== typeFilter) return false;
      if (statusFilter !== "All" && t.status !== statusFilter) return false;
      return true;
    });
  }, [search, dateFrom, dateTo, typeFilter, statusFilter, transactions]);

  // ---- Summary stats ----
  const totalCount = filtered.length;
  const grossSales = filtered
    .filter((t) => t.type === "Vend" && t.status === "Completed")
    .reduce((s, t) => s + Number(t.amount), 0);
  const todayTokens = filtered.filter(
    (t) => t.status === "Completed" && t.kWh > 0
  ).length;
  const reversedCount = filtered.filter((t) => t.status === "Reversed").length;

  // ---- Reversal handlers ----
  const handleReverseClick = (txn) => {
    setReverseTarget(txn);
    setReverseReason("");
    setReverseDialogOpen(true);
  };

  const handleReverseConfirm = async () => {
    if (!reverseTarget || !reverseReason) return;
    try {
      const res = await vendingAPI.reverseTransaction(reverseTarget.id, reverseReason);
      if (res.success) {
        setSnackbar({ open: true, message: "Transaction reversed successfully", severity: "success" });
        fetchTransactions();
      }
    } catch (err) {
      setSnackbar({ open: true, message: err.message || "Reversal failed", severity: "error" });
    }
    setReverseDialogOpen(false);
    setReverseTarget(null);
    setReverseReason("");
  };

  const handleReverseCancel = () => {
    setReverseDialogOpen(false);
    setReverseTarget(null);
    setReverseReason("");
  };

  // ---- Status chip color ----
  const getStatusColor = (status) => {
    switch (status) {
      case "Completed": case "completed": return colors.greenAccent[500];
      case "Reversed": case "failed": return colors.redAccent[500];
      case "Failed": return colors.grey[500];
      case "pending": return colors.blueAccent[400];
      case "token_generated": return colors.yellowAccent[500];
      case "forwarded": return "#42a5f5";
      case "completing": return "#66bb6a";
      default: return colors.grey[300];
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case "Vend": return colors.blueAccent[500];
      case "Reversal": return colors.yellowAccent[500];
      case "Free Token": return colors.greenAccent[400];
      case "Engineering": return colors.grey[400];
      default: return colors.grey[300];
    }
  };

  // ---- Transfer status label ----
  const getTransferStatusLabel = (status) => {
    switch (status) {
      case "pending": return "Pending";
      case "token_generated": return "Source Confirmed";
      case "forwarded": return "Forwarded";
      case "completing": return "Deducting Source";
      case "completed": return "Completed";
      case "failed": return "Failed";
      default: return status;
    }
  };

  const getTransferStatusIcon = (status) => {
    switch (status) {
      case "pending": return <HourglassEmptyOutlined fontSize="small" />;
      case "token_generated": return <SyncOutlined fontSize="small" />;
      case "forwarded": return <SwapHorizOutlined fontSize="small" />;
      case "completing": return <SyncOutlined fontSize="small" />;
      case "completed": return <CheckCircleOutlined fontSize="small" />;
      case "failed": return <ErrorOutlined fontSize="small" />;
      default: return null;
    }
  };

  // ---- Progress percentage for transfer ----
  const getProgressPercent = (status) => {
    switch (status) {
      case "pending": return 10;
      case "token_generated": return 30;
      case "forwarded": return 55;
      case "completing": return 80;
      case "completed": return 100;
      case "failed": return 100;
      default: return 0;
    }
  };

  const getProgressColor = (status) => {
    if (status === "completed") return colors.greenAccent[500];
    if (status === "failed") return colors.redAccent[500];
    return colors.blueAccent[400];
  };

  // ========== RENDER ==========
  return (
    <Box m="20px">
      <Header title="TRANSACTIONS" subtitle="Vending & Credit Transfer History" />

      {/* Tab navigation */}
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{
          mb: 2,
          "& .MuiTabs-indicator": { backgroundColor: colors.greenAccent[500] },
        }}
      >
        <Tab
          icon={<ReceiptLongOutlined />}
          iconPosition="start"
          label="Vending History"
          sx={{
            color: activeTab === 0 ? colors.greenAccent[500] : colors.grey[400],
            fontWeight: activeTab === 0 ? 700 : 400,
            textTransform: "none",
            fontSize: "0.9rem",
          }}
        />
        <Tab
          icon={<SwapHorizOutlined />}
          iconPosition="start"
          label="Credit Transfers"
          sx={{
            color: activeTab === 1 ? colors.greenAccent[500] : colors.grey[400],
            fontWeight: activeTab === 1 ? 700 : 400,
            textTransform: "none",
            fontSize: "0.9rem",
          }}
        />
      </Tabs>

      {/* ============ TAB 0: VENDING HISTORY ============ */}
      {activeTab === 0 && (
        <Box
          display="grid"
          gridTemplateColumns="repeat(12, 1fr)"
          gridAutoRows="140px"
          gap="5px"
        >
          {/* Stats cards */}
          <Box gridColumn="span 3" backgroundColor={colors.primary[400]} display="flex" alignItems="center" justifyContent="center" borderRadius="4px">
            <Box textAlign="center">
              <ReceiptLongOutlined sx={{ color: colors.blueAccent[500], fontSize: 28, mb: 0.5 }} />
              <Typography variant="body2" color={colors.greenAccent[500]} fontWeight="600">Total Transactions</Typography>
              <Typography variant="h4" color={colors.grey[100]} fontWeight="bold">{fmt(totalCount)}</Typography>
            </Box>
          </Box>
          <Box gridColumn="span 3" backgroundColor={colors.primary[400]} display="flex" alignItems="center" justifyContent="center" borderRadius="4px">
            <Box textAlign="center">
              <AttachMoneyOutlined sx={{ color: colors.greenAccent[500], fontSize: 28, mb: 0.5 }} />
              <Typography variant="body2" color={colors.greenAccent[500]} fontWeight="600">Total Revenue</Typography>
              <Typography variant="h4" color={colors.grey[100]} fontWeight="bold">{fmtCurrency(grossSales)}</Typography>
            </Box>
          </Box>
          <Box gridColumn="span 3" backgroundColor={colors.primary[400]} display="flex" alignItems="center" justifyContent="center" borderRadius="4px">
            <Box textAlign="center">
              <BoltOutlined sx={{ color: colors.yellowAccent[500], fontSize: 28, mb: 0.5 }} />
              <Typography variant="body2" color={colors.greenAccent[500]} fontWeight="600">Today's Tokens</Typography>
              <Typography variant="h4" color={colors.grey[100]} fontWeight="bold">{fmt(todayTokens)}</Typography>
            </Box>
          </Box>
          <Box gridColumn="span 3" backgroundColor={colors.primary[400]} display="flex" alignItems="center" justifyContent="center" borderRadius="4px">
            <Box textAlign="center">
              <ReplayOutlined sx={{ color: colors.redAccent[500], fontSize: 28, mb: 0.5 }} />
              <Typography variant="body2" color={colors.greenAccent[500]} fontWeight="600">Reversals</Typography>
              <Typography variant="h4" color={colors.grey[100]} fontWeight="bold">{reversedCount}</Typography>
            </Box>
          </Box>

          {/* Filters */}
          <Box gridColumn="span 12" gridRow="span 1" backgroundColor={colors.primary[400]} borderRadius="4px" display="flex" alignItems="center" gap="10px" px="15px">
            <TextField size="small" label="Date From" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ minWidth: 150 }} />
            <TextField size="small" label="Date To" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ minWidth: 150 }} />
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Type</InputLabel>
              <Select value={typeFilter} label="Type" onChange={(e) => setTypeFilter(e.target.value)}>
                <MenuItem value="All">All</MenuItem>
                <MenuItem value="Vend">Vend</MenuItem>
                <MenuItem value="Reversal">Reversal</MenuItem>
                <MenuItem value="Free Token">Free Token</MenuItem>
                <MenuItem value="Engineering">Engineering</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Status</InputLabel>
              <Select value={statusFilter} label="Status" onChange={(e) => setStatusFilter(e.target.value)}>
                <MenuItem value="All">All</MenuItem>
                <MenuItem value="Completed">Completed</MenuItem>
                <MenuItem value="Reversed">Reversed</MenuItem>
                <MenuItem value="Failed">Failed</MenuItem>
              </Select>
            </FormControl>
            <TextField
              size="small"
              placeholder="Search ref, customer, meter..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ flex: 1, minWidth: 200 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlined sx={{ color: colors.grey[400] }} />
                  </InputAdornment>
                ),
              }}
            />
            <Button variant="contained" size="small" startIcon={<DownloadOutlined />}
              sx={{ backgroundColor: colors.greenAccent[500], color: "#000", fontWeight: 600, "&:hover": { backgroundColor: colors.greenAccent[600] } }}
            >
              Export
            </Button>
          </Box>

          {/* Transaction table */}
          <Box gridColumn="span 12" gridRow="span 5" backgroundColor={colors.primary[400]} borderRadius="4px" overflow="auto">
            <TableContainer sx={{ maxHeight: "100%" }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    {["Ref", "Date/Time", "Customer", "Meter No", "Amount", "kWh", "Token", "Type", "Status", "Actions"].map((h) => (
                      <TableCell key={h} sx={{
                        backgroundColor: colors.primary[400], color: colors.grey[100], fontWeight: 700,
                        borderBottom: `1px solid ${colors.grey[700]}`,
                        ...(h === "Amount" || h === "kWh" ? { textAlign: "right" } : {}),
                        ...(h === "Actions" ? { textAlign: "center" } : {}),
                      }}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.map((t) => (
                    <TableRow key={t.id} hover>
                      <TableCell sx={{ fontFamily: "monospace", fontSize: "0.78rem", color: colors.grey[100], borderBottom: `1px solid ${colors.grey[800]}` }}>{t.refNo}</TableCell>
                      <TableCell sx={{ fontSize: "0.78rem", whiteSpace: "nowrap", color: colors.grey[200], borderBottom: `1px solid ${colors.grey[800]}` }}>{formatDateTime(t.dateTime)}</TableCell>
                      <TableCell sx={{ color: colors.grey[100], fontWeight: 600, borderBottom: `1px solid ${colors.grey[800]}` }}>{t.customerName}</TableCell>
                      <TableCell sx={{ fontFamily: "monospace", fontSize: "0.78rem", color: colors.grey[200], borderBottom: `1px solid ${colors.grey[800]}` }}>{t.meterNo}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600, color: colors.grey[100], borderBottom: `1px solid ${colors.grey[800]}` }}>{fmtCurrency(t.amount)}</TableCell>
                      <TableCell align="right" sx={{ color: colors.grey[200], borderBottom: `1px solid ${colors.grey[800]}` }}>{Number(t.kWh).toFixed(2)}</TableCell>
                      <TableCell sx={{ fontFamily: "monospace", fontSize: "0.72rem", color: colors.grey[300], borderBottom: `1px solid ${colors.grey[800]}` }}>{t.token.substring(0, 8)}...</TableCell>
                      <TableCell sx={{ borderBottom: `1px solid ${colors.grey[800]}` }}>
                        <Chip label={t.type} size="small" sx={{ backgroundColor: `${getTypeColor(t.type)}22`, color: getTypeColor(t.type), fontWeight: 600, fontSize: "0.7rem" }} />
                      </TableCell>
                      <TableCell sx={{ borderBottom: `1px solid ${colors.grey[800]}` }}>
                        <Chip label={t.status} size="small" sx={{ backgroundColor: `${getStatusColor(t.status)}22`, color: getStatusColor(t.status), fontWeight: 600, fontSize: "0.7rem" }} />
                      </TableCell>
                      <TableCell align="center" sx={{ borderBottom: `1px solid ${colors.grey[800]}` }}>
                        <Box display="flex" justifyContent="center" gap="4px">
                          <Tooltip title="Reprint">
                            <IconButton size="small" sx={{ color: colors.grey[400] }}><PrintOutlined fontSize="small" /></IconButton>
                          </Tooltip>
                          {t.type === "Vend" && t.status === "Completed" && (
                            <Tooltip title="Reverse">
                              <IconButton size="small" sx={{ color: colors.redAccent[500] }} onClick={() => handleReverseClick(t)}><UndoOutlined fontSize="small" /></IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} align="center" sx={{ py: 4, color: colors.grey[500] }}>
                        No transactions match the current filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </Box>
      )}

      {/* ============ TAB 1: CREDIT TRANSFERS ============ */}
      {activeTab === 1 && (
        <Box>
          {/* Summary cards */}
          <Box display="grid" gridTemplateColumns="repeat(5, 1fr)" gap="12px" mb={2}>
            {[
              { label: "Total Transfers", count: Object.values(transferSummary).reduce((a, b) => a + b, 0), color: colors.blueAccent[500], icon: <SwapHorizOutlined /> },
              { label: "Pending", count: transferSummary.pending || 0, color: colors.blueAccent[400], icon: <HourglassEmptyOutlined /> },
              { label: "In Progress", count: (transferSummary.token_generated || 0) + (transferSummary.forwarded || 0) + (transferSummary.completing || 0), color: "#42a5f5", icon: <SyncOutlined /> },
              { label: "Completed", count: transferSummary.completed || 0, color: colors.greenAccent[500], icon: <CheckCircleOutlined /> },
              { label: "Failed", count: transferSummary.failed || 0, color: colors.redAccent[500], icon: <ErrorOutlined /> },
            ].map((card) => (
              <Box
                key={card.label}
                backgroundColor={colors.primary[400]}
                borderRadius="8px"
                p="16px"
                display="flex"
                alignItems="center"
                gap="12px"
                sx={{ borderLeft: `4px solid ${card.color}` }}
              >
                <Box sx={{ color: card.color, display: "flex", alignItems: "center" }}>
                  {card.icon}
                </Box>
                <Box>
                  <Typography variant="body2" color={colors.grey[400]} fontSize="0.75rem">{card.label}</Typography>
                  <Typography variant="h5" color={colors.grey[100]} fontWeight="bold">{card.count}</Typography>
                </Box>
              </Box>
            ))}
          </Box>

          {/* Filters */}
          <Box
            backgroundColor={colors.primary[400]}
            borderRadius="8px"
            p="12px 16px"
            mb={2}
            display="flex"
            alignItems="center"
            gap="10px"
          >
            <TextField size="small" label="Date From" type="date" value={transferDateFrom} onChange={(e) => setTransferDateFrom(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ minWidth: 150 }} />
            <TextField size="small" label="Date To" type="date" value={transferDateTo} onChange={(e) => setTransferDateTo(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ minWidth: 150 }} />
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Status</InputLabel>
              <Select value={transferStatusFilter} label="Status" onChange={(e) => setTransferStatusFilter(e.target.value)}>
                <MenuItem value="All">All</MenuItem>
                <MenuItem value="pending">Pending</MenuItem>
                <MenuItem value="token_generated">Source Confirmed</MenuItem>
                <MenuItem value="forwarded">Forwarded</MenuItem>
                <MenuItem value="completing">Deducting Source</MenuItem>
                <MenuItem value="completed">Completed</MenuItem>
                <MenuItem value="failed">Failed</MenuItem>
              </Select>
            </FormControl>
            <TextField
              size="small"
              placeholder="Search by DRN..."
              value={transferSearch}
              onChange={(e) => setTransferSearch(e.target.value)}
              sx={{ flex: 1, minWidth: 200 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlined sx={{ color: colors.grey[400] }} />
                  </InputAdornment>
                ),
              }}
            />
            <Tooltip title="Refresh">
              <IconButton onClick={fetchTransfers} sx={{ color: colors.greenAccent[500] }}>
                <RefreshOutlined />
              </IconButton>
            </Tooltip>
            {transferLoading && <CircularProgress size={20} sx={{ color: colors.greenAccent[500] }} />}
          </Box>

          {/* Transfer list */}
          <Box display="flex" flexDirection="column" gap="8px">
            {transfers.length === 0 && !transferLoading && (
              <Box backgroundColor={colors.primary[400]} borderRadius="8px" p={4} textAlign="center">
                <SwapHorizOutlined sx={{ fontSize: 48, color: colors.grey[600], mb: 1 }} />
                <Typography color={colors.grey[500]}>No credit transfers found.</Typography>
                <Typography variant="body2" color={colors.grey[600]} mt={0.5}>
                  Credit transfers will appear here when meters transfer units to each other.
                </Typography>
              </Box>
            )}

            {transfers.map((t) => {
              const stepIndex = getStepIndex(t.status);
              const isFailed = t.status === "failed";
              const isExpanded = expandedTransfer === t.id;
              const progressColor = getProgressColor(t.status);

              return (
                <Box
                  key={t.id}
                  backgroundColor={colors.primary[400]}
                  borderRadius="8px"
                  overflow="hidden"
                  sx={{
                    border: `1px solid ${colors.grey[800]}`,
                    cursor: "pointer",
                    transition: "border-color 0.2s",
                    "&:hover": { borderColor: colors.grey[600] },
                  }}
                  onClick={() => setExpandedTransfer(isExpanded ? null : t.id)}
                >
                  {/* Progress bar at top */}
                  <LinearProgress
                    variant="determinate"
                    value={getProgressPercent(t.status)}
                    sx={{
                      height: 3,
                      backgroundColor: colors.grey[800],
                      "& .MuiLinearProgress-bar": {
                        backgroundColor: progressColor,
                        transition: "transform 0.6s ease",
                      },
                    }}
                  />

                  {/* Main row */}
                  <Box p="14px 18px" display="flex" alignItems="center" gap="16px">
                    {/* Transfer ID */}
                    <Box minWidth={60}>
                      <Typography variant="caption" color={colors.grey[500]}>ID</Typography>
                      <Typography variant="body2" color={colors.grey[100]} fontWeight="bold" fontFamily="monospace">#{t.id}</Typography>
                    </Box>

                    {/* Source → Target */}
                    <Box flex={1} display="flex" alignItems="center" gap="8px">
                      <Box>
                        <Typography variant="caption" color={colors.grey[500]}>Source</Typography>
                        <Typography variant="body2" color={colors.grey[100]} fontWeight="600" fontFamily="monospace">{t.source_drn}</Typography>
                      </Box>
                      <SwapHorizOutlined sx={{ color: progressColor, mx: 1 }} />
                      <Box>
                        <Typography variant="caption" color={colors.grey[500]}>Target</Typography>
                        <Typography variant="body2" color={colors.grey[100]} fontWeight="600" fontFamily="monospace">{t.target_drn}</Typography>
                      </Box>
                    </Box>

                    {/* Watt hours */}
                    <Box minWidth={90} textAlign="right">
                      <Typography variant="caption" color={colors.grey[500]}>Amount</Typography>
                      <Typography variant="body1" color={colors.greenAccent[500]} fontWeight="bold">
                        {(Number(t.watt_hours) / 1000).toFixed(1)} kWh
                      </Typography>
                    </Box>

                    {/* Status chip */}
                    <Chip
                      icon={getTransferStatusIcon(t.status)}
                      label={getTransferStatusLabel(t.status)}
                      size="small"
                      sx={{
                        minWidth: 130,
                        backgroundColor: `${getStatusColor(t.status)}18`,
                        color: getStatusColor(t.status),
                        fontWeight: 600,
                        fontSize: "0.75rem",
                        "& .MuiChip-icon": { color: getStatusColor(t.status) },
                      }}
                    />

                    {/* Time */}
                    <Box minWidth={80} textAlign="right">
                      <Typography variant="caption" color={colors.grey[500]}>{timeAgo(t.created_at)}</Typography>
                      <Typography variant="caption" display="block" color={colors.grey[600]} fontSize="0.65rem">
                        {formatDateTime(t.created_at)}
                      </Typography>
                    </Box>
                  </Box>

                  {/* Expanded detail panel */}
                  {isExpanded && (
                    <Box
                      px="18px"
                      pb="18px"
                      pt="4px"
                      sx={{ borderTop: `1px solid ${colors.grey[800]}` }}
                    >
                      {/* Stepper: two-phase progress visualization */}
                      <Box my={2}>
                        <Typography variant="subtitle2" color={colors.grey[300]} mb={1.5} fontWeight={600}>
                          Two-Phase Transfer Progress
                        </Typography>
                        <Stepper
                          activeStep={isFailed ? -1 : stepIndex}
                          alternativeLabel
                          connector={<ColoredConnector />}
                          sx={{ mb: 2 }}
                        >
                          {TRANSFER_STEPS.map((step, idx) => {
                            const isActive = !isFailed && idx <= stepIndex;
                            const isCurrent = !isFailed && idx === stepIndex;
                            return (
                              <Step key={step.key} completed={isActive && !isCurrent}>
                                <StepLabel
                                  StepIconComponent={() => (
                                    <Box
                                      sx={{
                                        width: 36,
                                        height: 36,
                                        borderRadius: "50%",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        backgroundColor: isActive
                                          ? `${progressColor}22`
                                          : `${colors.grey[700]}44`,
                                        border: `2px solid ${
                                          isCurrent
                                            ? progressColor
                                            : isActive
                                            ? progressColor
                                            : colors.grey[700]
                                        }`,
                                        color: isActive ? progressColor : colors.grey[600],
                                        transition: "all 0.3s ease",
                                        ...(isCurrent && !isFailed
                                          ? {
                                              boxShadow: `0 0 0 4px ${progressColor}22`,
                                              animation: stepIndex < 4 ? "pulse 2s infinite" : "none",
                                              "@keyframes pulse": {
                                                "0%": { boxShadow: `0 0 0 0 ${progressColor}44` },
                                                "70%": { boxShadow: `0 0 0 8px ${progressColor}00` },
                                                "100%": { boxShadow: `0 0 0 0 ${progressColor}00` },
                                              },
                                            }
                                          : {}),
                                      }}
                                    >
                                      {isActive && idx < stepIndex ? (
                                        <CheckCircleOutlined sx={{ fontSize: 18 }} />
                                      ) : isCurrent && stepIndex < 4 ? (
                                        <SyncOutlined sx={{ fontSize: 18, animation: "spin 2s linear infinite", "@keyframes spin": { "100%": { transform: "rotate(360deg)" } } }} />
                                      ) : (
                                        step.icon
                                      )}
                                    </Box>
                                  )}
                                  sx={{
                                    "& .MuiStepLabel-label": {
                                      color: isActive ? colors.grey[100] : colors.grey[600],
                                      fontWeight: isCurrent ? 700 : 400,
                                      fontSize: "0.78rem",
                                      mt: 0.5,
                                    },
                                  }}
                                >
                                  {step.label}
                                </StepLabel>
                              </Step>
                            );
                          })}
                        </Stepper>

                        {/* Failed banner */}
                        {isFailed && (
                          <Box
                            sx={{
                              backgroundColor: `${colors.redAccent[500]}15`,
                              border: `1px solid ${colors.redAccent[500]}44`,
                              borderRadius: "6px",
                              p: "10px 14px",
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                            }}
                          >
                            <ErrorOutlined sx={{ color: colors.redAccent[500] }} />
                            <Box>
                              <Typography variant="body2" color={colors.redAccent[400]} fontWeight={600}>Transfer Failed</Typography>
                              <Typography variant="caption" color={colors.grey[400]}>
                                {t.error_detail || "The transfer could not be completed. The meter may not have responded."}
                              </Typography>
                            </Box>
                          </Box>
                        )}
                      </Box>

                      {/* Detail grid */}
                      <Box
                        display="grid"
                        gridTemplateColumns="repeat(4, 1fr)"
                        gap="12px"
                        mt={1}
                      >
                        <Box>
                          <Typography variant="caption" color={colors.grey[500]}>Token</Typography>
                          <Typography variant="body2" color={colors.grey[100]} fontFamily="monospace" fontSize="0.78rem" sx={{ wordBreak: "break-all" }}>
                            {t.token || "Awaiting generation..."}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color={colors.grey[500]}>Source ACK</Typography>
                          <Typography variant="body2" color={t.source_ack_at ? colors.greenAccent[400] : colors.grey[600]}>
                            {t.source_ack_at ? formatDateTime(t.source_ack_at) : "Waiting..."}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color={colors.grey[500]}>Target ACK</Typography>
                          <Typography variant="body2" color={t.target_ack_at ? colors.greenAccent[400] : colors.grey[600]}>
                            {t.target_ack_at ? formatDateTime(t.target_ack_at) : "Waiting..."}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color={colors.grey[500]}>Created</Typography>
                          <Typography variant="body2" color={colors.grey[200]}>{formatDateTime(t.created_at)}</Typography>
                        </Box>
                      </Box>

                      {/* Phase timeline */}
                      <Box mt={2} px={1}>
                        <Typography variant="caption" color={colors.grey[500]} fontWeight={600} mb={1} display="block">
                          Transaction Timeline
                        </Typography>
                        {[
                          { time: t.created_at, label: "Transfer initiated", desc: `Command sent to source meter ${t.source_drn}`, done: true },
                          { time: t.source_ack_at, label: "Source meter confirmed", desc: t.token ? `Token generated: ${t.token.substring(0, 16)}...` : "Waiting for source meter response...", done: !!t.source_ack_at },
                          { time: t.source_ack_at, label: "Token forwarded to target", desc: `Forwarded to meter ${t.target_drn} via MQTT`, done: stepIndex >= 2 },
                          { time: t.target_ack_at, label: "Target meter confirmed", desc: "Credit accepted and applied", done: t.status === "completed" },
                        ].map((event, i) => (
                          <Box key={i} display="flex" gap="12px" mb={1}>
                            <Box display="flex" flexDirection="column" alignItems="center" minWidth={20}>
                              <Box
                                sx={{
                                  width: 10,
                                  height: 10,
                                  borderRadius: "50%",
                                  backgroundColor: event.done ? progressColor : colors.grey[700],
                                  border: `2px solid ${event.done ? progressColor : colors.grey[600]}`,
                                  flexShrink: 0,
                                }}
                              />
                              {i < 3 && (
                                <Box
                                  sx={{
                                    width: 2,
                                    flex: 1,
                                    minHeight: 20,
                                    backgroundColor: event.done && i < stepIndex ? progressColor : colors.grey[800],
                                  }}
                                />
                              )}
                            </Box>
                            <Box pb={1}>
                              <Typography variant="body2" color={event.done ? colors.grey[100] : colors.grey[600]} fontWeight={event.done ? 600 : 400} fontSize="0.8rem">
                                {event.label}
                              </Typography>
                              <Typography variant="caption" color={colors.grey[500]}>{event.desc}</Typography>
                              {event.time && event.done && (
                                <Typography variant="caption" color={colors.grey[600]} display="block" fontSize="0.65rem">
                                  {formatDateTime(event.time)}
                                </Typography>
                              )}
                            </Box>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      {/* ---- Reversal Confirmation Dialog ---- */}
      <Dialog
        open={reverseDialogOpen}
        onClose={handleReverseCancel}
        PaperProps={{ sx: { backgroundColor: colors.primary[400], borderRadius: 2 } }}
      >
        <DialogTitle sx={{ color: colors.grey[100], fontWeight: 700 }}>Confirm Reversal</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: colors.grey[300], mb: 2 }}>
            You are about to reverse transaction{" "}
            <strong style={{ color: colors.grey[100] }}>{reverseTarget?.refNo}</strong>{" "}
            for customer{" "}
            <strong style={{ color: colors.grey[100] }}>{reverseTarget?.customerName}</strong>{" "}
            ({reverseTarget ? fmtCurrency(reverseTarget.amount) : ""}).
          </DialogContentText>
          <DialogContentText sx={{ color: colors.grey[300], mb: 2 }}>
            This action cannot be undone. Please provide a reason for the reversal.
          </DialogContentText>
          <TextField autoFocus fullWidth label="Reason for reversal" value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} multiline rows={2} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleReverseCancel} variant="outlined" size="small">Cancel</Button>
          <Button onClick={handleReverseConfirm} variant="contained" color="error" size="small" disabled={!reverseReason.trim()} startIcon={<UndoOutlined />}>
            Reverse Transaction
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
