import { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Button,
  Chip,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Snackbar,
  Alert,
  IconButton,
  Tooltip,
  Divider,
  Tabs,
  Tab,
  useTheme,
} from "@mui/material";
import {
  ApiOutlined,
  AddOutlined,
  CheckCircleOutlined,
  BlockOutlined,
  KeyOutlined,
  ContentCopyOutlined,
  VisibilityOutlined,
  VisibilityOffOutlined,
  AccountBalanceOutlined,
  PhoneAndroidOutlined,
  StorefrontOutlined,
  AtmOutlined,
  LanguageOutlined,
  AccountTreeOutlined,
  SecurityOutlined,
  SpeedOutlined,
  WebhookOutlined,
  HistoryOutlined,
  HubOutlined,
  ArrowForwardOutlined,
  ArrowDownwardOutlined,
  WarningAmberOutlined,
} from "@mui/icons-material";
import { tokens } from "../theme";
import Header from "../components/Header";
import { integrationAPI } from "../services/api";

// ---- Helpers ----------------------------------------------------------------

function fmtDate(d) {
  if (!d) return "--";
  return new Date(d).toLocaleDateString("en-NA", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtN$(v) {
  return "N$ " + Number(v || 0).toLocaleString("en-NA", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

var PARTNER_TYPES = ["Bank", "MobileMoneyProvider", "RetailPOS", "ATMNetwork", "OnlinePortal", "Government", "Other"];

var TYPE_ICONS = {
  Bank: AccountBalanceOutlined,
  MobileMoneyProvider: PhoneAndroidOutlined,
  RetailPOS: StorefrontOutlined,
  ATMNetwork: AtmOutlined,
  OnlinePortal: LanguageOutlined,
  Government: AccountTreeOutlined,
  Other: HubOutlined,
};

var STATUS_COLORS = {
  Active: "#4cceac",
  Pending: "#f2b705",
  Suspended: "#db4f4a",
  Revoked: "#868dfb",
};

// Mock data for offline preview
var MOCK_PARTNERS = [
  {
    id: 1, partnerId: "PTR-FNB-A1B2C3D4", name: "First National Bank Namibia",
    type: "Bank", contactName: "Johan Müller", contactEmail: "johan@fnbnamibia.com.na",
    apiKey: "gx_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6", environment: "Production",
    status: "Active", permissions: "vend,balance,status", rateLimitPerMinute: 120,
    rateLimitPerDay: 50000, totalTransactions: 12453, totalRevenue: 6234000.00,
    lastActivityAt: "2026-03-15T09:42:00", webhookUrl: "https://api.fnb.com.na/gridx/webhook",
    created_at: "2026-01-15T08:00:00", productionApprovedAt: "2026-01-20T10:00:00",
    approvedBy: "Admin",
  },
  {
    id: 2, partnerId: "PTR-MTCM-E5F6G7H8", name: "MTC MoMo (Mobile Money)",
    type: "MobileMoneyProvider", contactName: "Selma Nangula", contactEmail: "selma@mtc.com.na",
    apiKey: "gx_q1w2e3r4t5y6u7i8o9p0a1s2d3f4g5h6", environment: "Production",
    status: "Active", permissions: "vend,balance,status", rateLimitPerMinute: 200,
    rateLimitPerDay: 100000, totalTransactions: 34521, totalRevenue: 8910000.00,
    lastActivityAt: "2026-03-15T10:15:00", webhookUrl: "https://momo.mtc.com.na/callback",
    created_at: "2026-01-10T08:00:00", productionApprovedAt: "2026-01-12T14:00:00",
    approvedBy: "Admin",
  },
  {
    id: 3, partnerId: "PTR-SHOP-I9J0K1L2", name: "Shoprite RetailPOS",
    type: "RetailPOS", contactName: "David Shipanga", contactEmail: "david@shoprite.com.na",
    apiKey: "gx_z1x2c3v4b5n6m7a8s9d0f1g2h3j4k5l6", environment: "Sandbox",
    status: "Active", permissions: "vend,balance", rateLimitPerMinute: 60,
    rateLimitPerDay: 10000, totalTransactions: 0, totalRevenue: 0,
    lastActivityAt: null, webhookUrl: "",
    created_at: "2026-03-10T08:00:00", sandboxApprovedAt: "2026-03-10T14:00:00",
    approvedBy: "Admin",
  },
  {
    id: 4, partnerId: "PTR-NEDB-M3N4O5P6", name: "Nedbank ATM Network",
    type: "ATMNetwork", contactName: "Werner Botha", contactEmail: "werner@nedbank.com.na",
    apiKey: "gx_p0o9i8u7y6t5r4e3w2q1m0n9b8v7c6x5", environment: "Sandbox",
    status: "Pending", permissions: "vend,balance,status", rateLimitPerMinute: 60,
    rateLimitPerDay: 10000, totalTransactions: 0, totalRevenue: 0,
    lastActivityAt: null, webhookUrl: "",
    created_at: "2026-03-13T08:00:00",
    approvedBy: null,
  },
];

var MOCK_API_STATS = {
  totalPartners: 4,
  activePartners: 3,
  todayRequests: 1247,
  todayErrors: 12,
  partnersByType: [
    { type: "Bank", count: 1 },
    { type: "MobileMoneyProvider", count: 1 },
    { type: "RetailPOS", count: 1 },
    { type: "ATMNetwork", count: 1 },
  ],
  recentActivity: [],
};


// ---- Component --------------------------------------------------------------

export default function Integrations() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);

  const [tabIndex, setTabIndex] = useState(0);
  const [partners, setPartners] = useState(MOCK_PARTNERS);
  const [apiStats, setApiStats] = useState(MOCK_API_STATS);
  const [apiLog, setApiLog] = useState([]);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });

  // Create partner dialog
  const [createDlg, setCreateDlg] = useState(false);
  const [newPartner, setNewPartner] = useState({
    name: "", type: "Other", contactName: "", contactEmail: "", contactPhone: "",
    permissions: "vend,balance,status", rateLimitPerMinute: 60, webhookUrl: "", notes: "",
  });

  // Credentials dialog
  const [credDlg, setCredDlg] = useState(false);
  const [credPartner, setCredPartner] = useState(null);
  const [showSecret, setShowSecret] = useState(false);

  // Load data
  useEffect(function() {
    integrationAPI.getPartners().then(function(r) {
      if (r.success && r.data && r.data.length > 0) setPartners(r.data);
    }).catch(function() {});
    integrationAPI.getApiStats().then(function(r) {
      if (r.success && r.data) setApiStats(r.data);
    }).catch(function() {});
    integrationAPI.getApiLog({ limit: 50 }).then(function(r) {
      if (r.success && r.data) setApiLog(r.data);
    }).catch(function() {});
  }, []);

  // Derived
  var activePartners = partners.filter(function(p) { return p.status === "Active"; });
  var productionPartners = partners.filter(function(p) { return p.environment === "Production" && p.status === "Active"; });
  var totalApiRevenue = partners.reduce(function(s, p) { return s + Number(p.totalRevenue || 0); }, 0);
  var totalApiTxns = partners.reduce(function(s, p) { return s + Number(p.totalTransactions || 0); }, 0);

  // Handlers
  var refreshData = function() {
    integrationAPI.getPartners().then(function(r) {
      if (r.success) setPartners(r.data);
    }).catch(function() {});
    integrationAPI.getApiStats().then(function(r) {
      if (r.success) setApiStats(r.data);
    }).catch(function() {});
  };

  var handleCreatePartner = async function() {
    if (!newPartner.name) return;
    try {
      var res = await integrationAPI.createPartner(newPartner);
      if (res.success) {
        setCredPartner(res.data);
        setCredDlg(true);
        setSnackbar({ open: true, message: "Partner registered: " + res.data.partnerId, severity: "success" });
        refreshData();
      }
    } catch (err) {
      setSnackbar({ open: true, message: "Error: " + (err.message || "Failed"), severity: "error" });
    }
    setCreateDlg(false);
  };

  var handleApprove = async function(id, env) {
    try {
      await integrationAPI.approvePartner(id, { environment: env });
      setSnackbar({ open: true, message: "Partner approved for " + env, severity: "success" });
      refreshData();
    } catch (err) {
      setSnackbar({ open: true, message: "Error: " + (err.message || "Failed"), severity: "error" });
    }
  };

  var handleSuspend = async function(id) {
    try {
      await integrationAPI.suspendPartner(id, { reason: "Admin suspension" });
      setSnackbar({ open: true, message: "Partner suspended", severity: "warning" });
      refreshData();
    } catch (err) {
      setSnackbar({ open: true, message: "Error", severity: "error" });
    }
  };

  var copyToClipboard = function(text) {
    navigator.clipboard.writeText(text).then(function() {
      setSnackbar({ open: true, message: "Copied to clipboard", severity: "info" });
    });
  };

  // Styles
  var textFieldSx = {
    "& .MuiOutlinedInput-root": {
      color: colors.grey[100], backgroundColor: "rgba(0,0,0,0.2)",
      "& fieldset": { borderColor: colors.primary[300] },
      "&:hover fieldset": { borderColor: colors.greenAccent[700] },
      "&.Mui-focused fieldset": { borderColor: colors.greenAccent[500] },
    },
    "& .MuiInputLabel-root": { color: colors.grey[300] },
    "& .MuiInputLabel-root.Mui-focused": { color: colors.greenAccent[500] },
  };

  var selectSx = {
    color: colors.grey[100], backgroundColor: "rgba(0,0,0,0.2)",
    "& fieldset": { borderColor: colors.primary[300] },
    "&:hover fieldset": { borderColor: colors.greenAccent[700] },
    "&.Mui-focused fieldset": { borderColor: colors.greenAccent[500] },
    "& .MuiSelect-icon": { color: colors.grey[300] },
  };

  var headerCellSx = {
    color: colors.grey[300], fontWeight: 600, fontSize: "0.7rem",
    textTransform: "uppercase", letterSpacing: 0.5,
    borderBottom: "1px solid " + colors.primary[300], whiteSpace: "nowrap", py: 1,
  };

  var bodyCellSx = {
    color: colors.grey[100], borderBottom: "1px solid " + colors.primary[300],
    fontSize: "0.82rem", py: "8px",
  };

  // ---- Architecture Diagram Component ----
  function ArchitectureDiagram() {
    var boxSx = function(color, w) {
      return {
        border: "2px solid " + color,
        borderRadius: "8px",
        p: "10px 14px",
        backgroundColor: color + "12",
        textAlign: "center",
        width: w || "auto",
        minWidth: 120,
      };
    };

    var arrowSx = { color: colors.grey[400], fontSize: 20 };

    return (
      <Box>
        {/* Top Row: External Systems */}
        <Typography variant="caption" color={colors.grey[400]} fontWeight={600} textTransform="uppercase" mb="8px" display="block">
          External Third-Party Systems
        </Typography>
        <Box display="flex" gap="12px" justifyContent="center" flexWrap="wrap" mb="20px">
          {[
            { icon: AccountBalanceOutlined, label: "Banks\n(ISO 8583)", color: "#6870fa" },
            { icon: PhoneAndroidOutlined, label: "Mobile Money\n(REST API)", color: "#4cceac" },
            { icon: StorefrontOutlined, label: "Retail POS\n(REST API)", color: "#f2b705" },
            { icon: AtmOutlined, label: "ATM Network\n(ISO 8583)", color: "#868dfb" },
            { icon: LanguageOutlined, label: "Online Portal\n(REST API)", color: "#db4f4a" },
          ].map(function(sys) {
            var Icon = sys.icon;
            return (
              <Box key={sys.label} sx={boxSx(sys.color, 130)}>
                <Icon sx={{ color: sys.color, fontSize: 24, mb: "4px" }} />
                <Typography variant="caption" color={colors.grey[200]} display="block" whiteSpace="pre-line" fontWeight={600} lineHeight={1.3}>
                  {sys.label}
                </Typography>
              </Box>
            );
          })}
        </Box>

        {/* Arrow Down */}
        <Box textAlign="center" mb="8px">
          <ArrowDownwardOutlined sx={{ ...arrowSx, fontSize: 28 }} />
          <Typography variant="caption" color={colors.grey[500]} display="block">HTTPS / TLS Encrypted</Typography>
        </Box>

        {/* Security Layer */}
        <Box sx={{
          border: "2px solid #db4f4a",
          borderRadius: "8px",
          p: "12px",
          backgroundColor: "rgba(219,79,74,0.06)",
          mb: "12px",
        }}>
          <Typography variant="body2" fontWeight={700} color="#db4f4a" textAlign="center" mb="8px">
            <SecurityOutlined sx={{ fontSize: 16, mr: "4px", verticalAlign: "middle" }} />
            Security & Control Layer
          </Typography>
          <Box display="flex" gap="16px" justifyContent="center" flexWrap="wrap">
            {["API Key Auth", "IP Whitelisting", "Rate Limiting", "Request Validation", "Audit Logging"].map(function(item) {
              return (
                <Chip key={item} label={item} size="small" sx={{
                  color: "#db4f4a", backgroundColor: "rgba(219,79,74,0.1)",
                  border: "1px solid rgba(219,79,74,0.3)", fontSize: "0.7rem",
                }} />
              );
            })}
          </Box>
        </Box>

        {/* Arrow Down */}
        <Box textAlign="center" mb="8px">
          <ArrowDownwardOutlined sx={arrowSx} />
        </Box>

        {/* API Gateway */}
        <Box sx={{
          border: "2px solid #6870fa",
          borderRadius: "8px",
          p: "14px",
          backgroundColor: "rgba(104,112,250,0.06)",
          mb: "12px",
        }}>
          <Typography variant="body2" fontWeight={700} color="#6870fa" textAlign="center" mb="10px">
            <HubOutlined sx={{ fontSize: 16, mr: "4px", verticalAlign: "middle" }} />
            GRIDx API Gateway / Switching Layer
          </Typography>
          <Box display="flex" gap="12px" justifyContent="center" flexWrap="wrap">
            <Box sx={boxSx("#6870fa", 150)}>
              <Typography variant="caption" fontWeight={700} color="#6870fa">REST API</Typography>
              <Typography variant="caption" color={colors.grey[400]} display="block">POST /vend</Typography>
              <Typography variant="caption" color={colors.grey[400]} display="block">GET /meter/:no</Typography>
              <Typography variant="caption" color={colors.grey[400]} display="block">GET /transaction/:ref</Typography>
            </Box>
            <Box sx={boxSx("#868dfb", 150)}>
              <Typography variant="caption" fontWeight={700} color="#868dfb">ISO 8583 Gateway</Typography>
              <Typography variant="caption" color={colors.grey[400]} display="block">MTI 0200 - Purchase</Typography>
              <Typography variant="caption" color={colors.grey[400]} display="block">MTI 0400 - Reversal</Typography>
              <Typography variant="caption" color={colors.grey[400]} display="block">MTI 0800 - Echo</Typography>
            </Box>
            <Box sx={boxSx("#4cceac", 150)}>
              <Typography variant="caption" fontWeight={700} color="#4cceac">Webhooks</Typography>
              <Typography variant="caption" color={colors.grey[400]} display="block">txn.completed</Typography>
              <Typography variant="caption" color={colors.grey[400]} display="block">txn.reversed</Typography>
              <Typography variant="caption" color={colors.grey[400]} display="block">meter.alert</Typography>
            </Box>
          </Box>
        </Box>

        {/* Arrow Down */}
        <Box textAlign="center" mb="8px">
          <ArrowDownwardOutlined sx={arrowSx} />
        </Box>

        {/* Core Engine */}
        <Box sx={{
          border: "2px solid #4cceac",
          borderRadius: "8px",
          p: "14px",
          backgroundColor: "rgba(76,206,172,0.06)",
          mb: "12px",
        }}>
          <Typography variant="body2" fontWeight={700} color="#4cceac" textAlign="center" mb="10px">
            GRIDx Core Vending Engine (IEC 62055-41)
          </Typography>
          <Box display="flex" gap="12px" justifyContent="center" flexWrap="wrap">
            {[
              { label: "Token Generation\n(STS/HSM)", color: "#4cceac" },
              { label: "Tariff Calculator\n(Block/Flat/TOU)", color: "#f2b705" },
              { label: "Transaction Processor\n(Atomic + Idempotent)", color: "#6870fa" },
              { label: "Arrears Manager\n(Auto-deduct)", color: "#db4f4a" },
            ].map(function(mod) {
              return (
                <Box key={mod.label} sx={boxSx(mod.color, 145)}>
                  <Typography variant="caption" fontWeight={600} color={mod.color} whiteSpace="pre-line" lineHeight={1.3}>
                    {mod.label}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        </Box>

        {/* Arrow Down */}
        <Box textAlign="center" mb="8px">
          <ArrowDownwardOutlined sx={arrowSx} />
        </Box>

        {/* Internal Systems */}
        <Typography variant="caption" color={colors.grey[400]} fontWeight={600} textTransform="uppercase" mb="8px" display="block">
          Internal Utility Systems
        </Typography>
        <Box display="flex" gap="12px" justifyContent="center" flexWrap="wrap">
          {[
            { label: "MySQL Database\n(Transactions, Line Items, Audit)", color: "#f2b705" },
            { label: "Smart Meter MQTT\n(Telemetry & Remote)", color: "#4cceac" },
            { label: "Financial Reports\n(Daily/Monthly)", color: "#6870fa" },
            { label: "Batch & Banking\n(Reconciliation)", color: "#868dfb" },
          ].map(function(sys) {
            return (
              <Box key={sys.label} sx={boxSx(sys.color, 155)}>
                <Typography variant="caption" fontWeight={600} color={sys.color} whiteSpace="pre-line" lineHeight={1.3}>
                  {sys.label}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Box>
    );
  }

  return (
    <Box m="20px">
      <Header
        title="API INTEGRATION GATEWAY"
        subtitle="Third-Party Vendor Integration & ISO 8583 Gateway — NamPower Compliant"
      />

      {/* Stat Cards */}
      <Box display="grid" gridTemplateColumns="repeat(12, 1fr)" gap="5px" gridAutoRows="140px">
        <Box gridColumn="span 3" backgroundColor={colors.primary[400]} borderRadius="4px"
          p="15px" display="flex" flexDirection="column" justifyContent="center" alignItems="center">
          <HubOutlined sx={{ color: "#6870fa", fontSize: 28, mb: "6px" }} />
          <Typography variant="h3" fontWeight="700" color={colors.grey[100]}>
            {partners.length}
          </Typography>
          <Typography variant="body2" color="#6870fa" fontWeight={600}>API Partners</Typography>
          <Typography variant="caption" color={colors.grey[400]} mt="2px">
            {productionPartners.length} in production
          </Typography>
        </Box>

        <Box gridColumn="span 3" backgroundColor={colors.primary[400]} borderRadius="4px"
          p="15px" display="flex" flexDirection="column" justifyContent="center" alignItems="center">
          <SpeedOutlined sx={{ color: "#4cceac", fontSize: 28, mb: "6px" }} />
          <Typography variant="h3" fontWeight="700" color={colors.grey[100]}>
            {totalApiTxns.toLocaleString()}
          </Typography>
          <Typography variant="body2" color="#4cceac" fontWeight={600}>API Transactions</Typography>
          <Typography variant="caption" color={colors.grey[400]} mt="2px">
            {apiStats.todayRequests || 0} today
          </Typography>
        </Box>

        <Box gridColumn="span 3" backgroundColor={colors.primary[400]} borderRadius="4px"
          p="15px" display="flex" flexDirection="column" justifyContent="center" alignItems="center">
          <ApiOutlined sx={{ color: "#f2b705", fontSize: 28, mb: "6px" }} />
          <Typography variant="h3" fontWeight="700" color={colors.grey[100]}>
            {fmtN$(totalApiRevenue)}
          </Typography>
          <Typography variant="body2" color="#f2b705" fontWeight={600}>API Revenue</Typography>
          <Typography variant="caption" color={colors.grey[400]} mt="2px">
            Through partner channels
          </Typography>
        </Box>

        <Box gridColumn="span 3" backgroundColor={colors.primary[400]} borderRadius="4px"
          p="15px" display="flex" flexDirection="column" justifyContent="center" alignItems="center">
          <SecurityOutlined sx={{ color: (apiStats.todayErrors || 0) > 0 ? "#db4f4a" : "#4cceac", fontSize: 28, mb: "6px" }} />
          <Typography variant="h3" fontWeight="700" color={colors.grey[100]}>
            {(apiStats.todayErrors || 0)}
          </Typography>
          <Typography variant="body2" color={(apiStats.todayErrors || 0) > 0 ? "#db4f4a" : "#4cceac"} fontWeight={600}>
            Errors Today
          </Typography>
          <Typography variant="caption" color={colors.grey[400]} mt="2px">
            {apiStats.todayRequests > 0 ? ((100 - (apiStats.todayErrors / apiStats.todayRequests * 100)).toFixed(1) + "% success") : "0 requests"}
          </Typography>
        </Box>
      </Box>

      {/* Tabs */}
      <Box mt="20px">
        <Tabs
          value={tabIndex}
          onChange={function(e, v) { setTabIndex(v); }}
          sx={{
            "& .MuiTab-root": { color: colors.grey[300], fontWeight: 600, textTransform: "none" },
            "& .Mui-selected": { color: "#6870fa !important" },
            "& .MuiTabs-indicator": { backgroundColor: "#6870fa" },
            borderBottom: "1px solid " + colors.primary[300],
            mb: "16px",
          }}
        >
          <Tab label="Architecture" icon={<AccountTreeOutlined sx={{ fontSize: 18 }} />} iconPosition="start" />
          <Tab label={"Partners (" + partners.length + ")"} icon={<HubOutlined sx={{ fontSize: 18 }} />} iconPosition="start" />
          <Tab label="API Log" icon={<HistoryOutlined sx={{ fontSize: 18 }} />} iconPosition="start" />
        </Tabs>

        {/* TAB 0: Architecture */}
        {tabIndex === 0 && (
          <Box backgroundColor={colors.primary[400]} borderRadius="4px" p="24px">
            <Typography variant="h5" fontWeight={700} color={colors.grey[100]} mb="6px">
              System Architecture — Third-Party Integration
            </Typography>
            <Typography variant="body2" color={colors.grey[400]} mb="20px">
              NamPower-compliant API gateway supporting REST API and ISO 8583 messaging for banks, mobile money, POS, and ATM networks.
              All external transactions flow through the centralized security layer before reaching the core vending engine.
            </Typography>
            <ArchitectureDiagram />
          </Box>
        )}

        {/* TAB 1: Partners */}
        {tabIndex === 1 && (
          <Box backgroundColor={colors.primary[400]} borderRadius="4px" overflow="auto">
            <Box display="flex" justifyContent="space-between" alignItems="center"
              p="12px 15px" borderBottom={"1px solid " + colors.primary[300]}>
              <Box display="flex" alignItems="center" gap="10px">
                <HubOutlined sx={{ color: "#6870fa", fontSize: 22 }} />
                <Typography variant="h5" fontWeight="600" color={colors.grey[100]}>
                  API Partners
                </Typography>
              </Box>
              <Button variant="contained" size="small" startIcon={<AddOutlined />}
                onClick={function() {
                  setNewPartner({
                    name: "", type: "Other", contactName: "", contactEmail: "", contactPhone: "",
                    permissions: "vend,balance,status", rateLimitPerMinute: 60, webhookUrl: "", notes: "",
                  });
                  setCreateDlg(true);
                }}
                sx={{
                  fontWeight: 600, backgroundColor: colors.greenAccent[600], color: colors.primary[500],
                  "&:hover": { backgroundColor: colors.greenAccent[700] },
                }}>
                Register Partner
              </Button>
            </Box>

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={headerCellSx}>Partner</TableCell>
                    <TableCell sx={headerCellSx}>Type</TableCell>
                    <TableCell sx={headerCellSx}>Environment</TableCell>
                    <TableCell sx={headerCellSx}>Status</TableCell>
                    <TableCell sx={headerCellSx} align="right">Transactions</TableCell>
                    <TableCell sx={headerCellSx} align="right">Revenue</TableCell>
                    <TableCell sx={headerCellSx}>Last Activity</TableCell>
                    <TableCell sx={headerCellSx} align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {partners.map(function(p) {
                    var TypeIcon = TYPE_ICONS[p.type] || HubOutlined;
                    var statusColor = STATUS_COLORS[p.status] || colors.grey[400];
                    return (
                      <TableRow key={p.id} sx={{ "&:hover": { backgroundColor: colors.primary[300] + "44" } }}>
                        <TableCell sx={bodyCellSx}>
                          <Box>
                            <Typography variant="body2" fontWeight={600} color={colors.grey[100]}>
                              {p.name}
                            </Typography>
                            <Typography variant="caption" fontFamily="monospace" color={colors.grey[400]}>
                              {p.partnerId}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell sx={bodyCellSx}>
                          <Box display="flex" alignItems="center" gap="6px">
                            <TypeIcon sx={{ fontSize: 16, color: colors.grey[300] }} />
                            <Typography variant="body2" color={colors.grey[200]}>
                              {p.type === "MobileMoneyProvider" ? "Mobile Money" : p.type}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell sx={bodyCellSx}>
                          <Chip label={p.environment} size="small" sx={{
                            fontWeight: 600, fontSize: "0.7rem", height: 22,
                            color: p.environment === "Production" ? "#4cceac" : "#f2b705",
                            backgroundColor: p.environment === "Production" ? "rgba(76,206,172,0.12)" : "rgba(242,183,5,0.12)",
                            border: "1px solid " + (p.environment === "Production" ? "rgba(76,206,172,0.3)" : "rgba(242,183,5,0.3)"),
                          }} />
                        </TableCell>
                        <TableCell sx={bodyCellSx}>
                          <Chip label={p.status} size="small" sx={{
                            fontWeight: 600, fontSize: "0.7rem", height: 22,
                            color: statusColor,
                            backgroundColor: statusColor + "18",
                            border: "1px solid " + statusColor + "44",
                          }} />
                        </TableCell>
                        <TableCell sx={{ ...bodyCellSx, fontWeight: 600 }} align="right">
                          {Number(p.totalTransactions || 0).toLocaleString()}
                        </TableCell>
                        <TableCell sx={{ ...bodyCellSx, fontWeight: 600 }} align="right">
                          {fmtN$(p.totalRevenue)}
                        </TableCell>
                        <TableCell sx={{ ...bodyCellSx, whiteSpace: "nowrap" }}>
                          {p.lastActivityAt ? fmtDate(p.lastActivityAt) : "--"}
                        </TableCell>
                        <TableCell sx={bodyCellSx} align="center">
                          <Box display="flex" gap="4px" justifyContent="center">
                            <Tooltip title="View API Key">
                              <IconButton size="small" onClick={function() { setCredPartner(p); setShowSecret(false); setCredDlg(true); }}
                                sx={{ color: "#6870fa" }}>
                                <KeyOutlined sx={{ fontSize: 16 }} />
                              </IconButton>
                            </Tooltip>
                            {p.status === "Pending" && (
                              <Tooltip title="Approve for Sandbox">
                                <IconButton size="small" onClick={function() { handleApprove(p.id, "Sandbox"); }}
                                  sx={{ color: "#4cceac" }}>
                                  <CheckCircleOutlined sx={{ fontSize: 16 }} />
                                </IconButton>
                              </Tooltip>
                            )}
                            {p.status === "Active" && p.environment === "Sandbox" && (
                              <Tooltip title="Promote to Production">
                                <IconButton size="small" onClick={function() { handleApprove(p.id, "Production"); }}
                                  sx={{ color: "#4cceac" }}>
                                  <ArrowForwardOutlined sx={{ fontSize: 16 }} />
                                </IconButton>
                              </Tooltip>
                            )}
                            {p.status === "Active" && (
                              <Tooltip title="Suspend">
                                <IconButton size="small" onClick={function() { handleSuspend(p.id); }}
                                  sx={{ color: "#db4f4a" }}>
                                  <BlockOutlined sx={{ fontSize: 16 }} />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* TAB 2: API Log */}
        {tabIndex === 2 && (
          <Box backgroundColor={colors.primary[400]} borderRadius="4px" overflow="auto">
            <Box p="12px 15px" borderBottom={"1px solid " + colors.primary[300]}>
              <Box display="flex" alignItems="center" gap="10px">
                <HistoryOutlined sx={{ color: "#f2b705", fontSize: 22 }} />
                <Typography variant="h5" fontWeight="600" color={colors.grey[100]}>
                  API Request Log
                </Typography>
                <Chip label={apiLog.length + " records"} size="small"
                  sx={{ color: colors.grey[300], backgroundColor: colors.primary[300], height: 22, fontSize: "0.7rem" }} />
              </Box>
            </Box>

            <TableContainer sx={{ maxHeight: 500 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={headerCellSx}>Time</TableCell>
                    <TableCell sx={headerCellSx}>Partner</TableCell>
                    <TableCell sx={headerCellSx}>Endpoint</TableCell>
                    <TableCell sx={headerCellSx}>Method</TableCell>
                    <TableCell sx={headerCellSx}>Status</TableCell>
                    <TableCell sx={headerCellSx} align="right">Latency</TableCell>
                    <TableCell sx={headerCellSx}>Environment</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {apiLog.length > 0 ? apiLog.map(function(log) {
                    var isError = log.responseStatus >= 400;
                    return (
                      <TableRow key={log.id} sx={{ "&:hover": { backgroundColor: colors.primary[300] + "44" } }}>
                        <TableCell sx={{ ...bodyCellSx, whiteSpace: "nowrap" }}>{fmtDate(log.created_at)}</TableCell>
                        <TableCell sx={bodyCellSx}>
                          <Typography variant="body2" fontWeight={600}>{log.partnerName || log.partnerId}</Typography>
                        </TableCell>
                        <TableCell sx={{ ...bodyCellSx, fontFamily: "monospace", fontSize: "0.75rem" }}>{log.endpoint}</TableCell>
                        <TableCell sx={bodyCellSx}>
                          <Chip label={log.method} size="small" sx={{
                            fontWeight: 700, fontSize: "0.65rem", height: 20,
                            color: log.method === "POST" ? "#f2b705" : "#4cceac",
                            backgroundColor: "transparent",
                            border: "1px solid " + (log.method === "POST" ? "#f2b705" : "#4cceac") + "44",
                          }} />
                        </TableCell>
                        <TableCell sx={bodyCellSx}>
                          <Chip label={log.responseStatus} size="small" sx={{
                            fontWeight: 700, fontSize: "0.65rem", height: 20,
                            color: isError ? "#db4f4a" : "#4cceac",
                            backgroundColor: isError ? "rgba(219,79,74,0.12)" : "rgba(76,206,172,0.12)",
                          }} />
                        </TableCell>
                        <TableCell sx={bodyCellSx} align="right">
                          {log.processingTimeMs ? log.processingTimeMs + "ms" : "--"}
                        </TableCell>
                        <TableCell sx={bodyCellSx}>
                          <Typography variant="caption" color={log.environment === "Production" ? "#4cceac" : "#f2b705"}>
                            {log.environment}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    );
                  }) : (
                    <TableRow>
                      <TableCell colSpan={7} sx={{ ...bodyCellSx, textAlign: "center", py: 4 }}>
                        <Typography variant="body2" color={colors.grey[400]}>
                          No API requests logged yet. Partner requests will appear here.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </Box>

      {/* ──── Create Partner Dialog ──── */}
      <Dialog open={createDlg} onClose={function() { setCreateDlg(false); }} maxWidth="sm" fullWidth
        PaperProps={{ sx: { backgroundColor: colors.primary[400], border: "1px solid " + colors.primary[300], color: colors.grey[100] } }}>
        <DialogTitle sx={{ fontWeight: 700, color: colors.grey[100], pb: 0 }}>
          <Box display="flex" alignItems="center" gap="10px">
            <AddOutlined sx={{ color: "#6870fa" }} />
            Register API Partner
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color={colors.grey[400]} mb="16px" mt="4px">
            Register a new third-party vendor for API access. They will start in Sandbox mode for testing.
          </Typography>

          <TextField fullWidth label="Partner Name" value={newPartner.name}
            onChange={function(e) { setNewPartner(Object.assign({}, newPartner, { name: e.target.value })); }}
            sx={{ ...textFieldSx, mb: 2 }} />

          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel sx={{ color: colors.grey[300], "&.Mui-focused": { color: colors.greenAccent[500] } }}>
              Partner Type
            </InputLabel>
            <Select value={newPartner.type} label="Partner Type"
              onChange={function(e) { setNewPartner(Object.assign({}, newPartner, { type: e.target.value })); }}
              sx={selectSx}
              MenuProps={{ PaperProps: { sx: { backgroundColor: colors.primary[400], color: colors.grey[100] } } }}>
              {PARTNER_TYPES.map(function(t) { return <MenuItem key={t} value={t}>{t === "MobileMoneyProvider" ? "Mobile Money Provider" : t}</MenuItem>; })}
            </Select>
          </FormControl>

          <Box display="flex" gap="12px" mb={2}>
            <TextField fullWidth label="Contact Name" value={newPartner.contactName}
              onChange={function(e) { setNewPartner(Object.assign({}, newPartner, { contactName: e.target.value })); }}
              sx={textFieldSx} />
            <TextField fullWidth label="Contact Email" value={newPartner.contactEmail}
              onChange={function(e) { setNewPartner(Object.assign({}, newPartner, { contactEmail: e.target.value })); }}
              sx={textFieldSx} />
          </Box>

          <TextField fullWidth label="Webhook URL (optional)" placeholder="https://partner.com/webhook"
            value={newPartner.webhookUrl}
            onChange={function(e) { setNewPartner(Object.assign({}, newPartner, { webhookUrl: e.target.value })); }}
            sx={{ ...textFieldSx, mb: 2 }} />

          <TextField fullWidth label="Rate Limit (req/min)" type="number" value={newPartner.rateLimitPerMinute}
            onChange={function(e) { setNewPartner(Object.assign({}, newPartner, { rateLimitPerMinute: parseInt(e.target.value) || 60 })); }}
            sx={{ ...textFieldSx, mb: 2 }} />

          <TextField fullWidth label="Notes" multiline rows={2} value={newPartner.notes}
            onChange={function(e) { setNewPartner(Object.assign({}, newPartner, { notes: e.target.value })); }}
            sx={textFieldSx} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={function() { setCreateDlg(false); }} sx={{ color: colors.grey[300] }}>Cancel</Button>
          <Button variant="contained" disabled={!newPartner.name} onClick={handleCreatePartner}
            sx={{
              fontWeight: 600, backgroundColor: "#6870fa", color: "#fff",
              "&:hover": { backgroundColor: "#5a62d8" },
              "&.Mui-disabled": { backgroundColor: colors.primary[300], color: colors.grey[400] },
            }}>
            Register Partner
          </Button>
        </DialogActions>
      </Dialog>

      {/* ──── View Credentials Dialog ──── */}
      <Dialog open={credDlg} onClose={function() { setCredDlg(false); }} maxWidth="sm" fullWidth
        PaperProps={{ sx: { backgroundColor: colors.primary[400], border: "1px solid " + colors.primary[300], color: colors.grey[100] } }}>
        <DialogTitle sx={{ fontWeight: 700, color: colors.grey[100], pb: 0 }}>
          <Box display="flex" alignItems="center" gap="10px">
            <KeyOutlined sx={{ color: "#f2b705" }} />
            API Credentials
          </Box>
        </DialogTitle>
        <DialogContent>
          {credPartner && (
            <>
              <Typography variant="body2" color={colors.grey[400]} mb="16px" mt="4px">
                Share these credentials securely with the partner. The API secret is only shown once on creation.
              </Typography>

              <Box sx={{ backgroundColor: "rgba(0,0,0,0.2)", borderRadius: "4px", p: "14px", border: "1px solid " + colors.primary[300] }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb="12px">
                  <Typography variant="body2" color={colors.grey[300]}>Partner ID</Typography>
                  <Box display="flex" alignItems="center" gap="6px">
                    <Typography variant="body2" fontFamily="monospace" fontWeight={600} color={colors.grey[100]}>
                      {credPartner.partnerId}
                    </Typography>
                    <IconButton size="small" onClick={function() { copyToClipboard(credPartner.partnerId); }} sx={{ color: colors.grey[400] }}>
                      <ContentCopyOutlined sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Box>
                </Box>

                <Box display="flex" justifyContent="space-between" alignItems="center" mb="12px">
                  <Typography variant="body2" color={colors.grey[300]}>API Key</Typography>
                  <Box display="flex" alignItems="center" gap="6px">
                    <Typography variant="body2" fontFamily="monospace" fontWeight={600} color="#4cceac"
                      sx={{ wordBreak: "break-all", maxWidth: 280, textAlign: "right" }}>
                      {credPartner.apiKey}
                    </Typography>
                    <IconButton size="small" onClick={function() { copyToClipboard(credPartner.apiKey); }} sx={{ color: colors.grey[400] }}>
                      <ContentCopyOutlined sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Box>
                </Box>

                {credPartner.apiSecret && (
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb="12px">
                    <Typography variant="body2" color={colors.grey[300]}>API Secret</Typography>
                    <Box display="flex" alignItems="center" gap="6px">
                      <Typography variant="body2" fontFamily="monospace" fontWeight={600} color="#f2b705"
                        sx={{ wordBreak: "break-all", maxWidth: 280, textAlign: "right" }}>
                        {showSecret ? credPartner.apiSecret : "••••••••••••••••••••••"}
                      </Typography>
                      <IconButton size="small" onClick={function() { setShowSecret(!showSecret); }} sx={{ color: colors.grey[400] }}>
                        {showSecret ? <VisibilityOffOutlined sx={{ fontSize: 14 }} /> : <VisibilityOutlined sx={{ fontSize: 14 }} />}
                      </IconButton>
                      {showSecret && (
                        <IconButton size="small" onClick={function() { copyToClipboard(credPartner.apiSecret); }} sx={{ color: colors.grey[400] }}>
                          <ContentCopyOutlined sx={{ fontSize: 14 }} />
                        </IconButton>
                      )}
                    </Box>
                  </Box>
                )}

                {credPartner.webhookSecret && (
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="body2" color={colors.grey[300]}>Webhook Secret</Typography>
                    <Typography variant="body2" fontFamily="monospace" color={colors.grey[400]}>
                      {credPartner.webhookSecret}
                    </Typography>
                  </Box>
                )}
              </Box>

              <Box sx={{
                backgroundColor: "rgba(242,183,5,0.08)", border: "1px solid rgba(242,183,5,0.2)",
                borderRadius: "4px", p: "10px 14px", mt: "16px",
                display: "flex", alignItems: "center", gap: "8px",
              }}>
                <WarningAmberOutlined sx={{ color: "#f2b705", fontSize: 18 }} />
                <Typography variant="caption" color="#f2b705">
                  Store the API secret securely. It cannot be retrieved after this dialog is closed.
                </Typography>
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={function() { setCredDlg(false); }} sx={{ color: colors.grey[300] }}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar open={snackbar.open} autoHideDuration={4000}
        onClose={function() { setSnackbar({ open: false, message: "", severity: "success" }); }}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}>
        <Alert severity={snackbar.severity}
          onClose={function() { setSnackbar({ open: false, message: "", severity: "success" }); }}
          variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
