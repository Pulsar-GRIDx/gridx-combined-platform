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
  LinearProgress,
  Stepper,
  Step,
  StepLabel,
  useTheme,
} from "@mui/material";
import {
  AddOutlined,
  AccountBalanceOutlined,
  LockOutlined,
  ReceiptLongOutlined,
  AccountBalanceWalletOutlined,
  FolderOpenOutlined,
  AttachMoneyOutlined,
  CheckCircleOutlined,
  WarningAmberOutlined,
  InfoOutlined,
  ArrowForwardOutlined,
  PointOfSaleOutlined,
  AssessmentOutlined,
  SyncOutlined,
  ExpandMoreOutlined,
  ExpandLessOutlined,
} from "@mui/icons-material";
import { tokens } from "../theme";
import Header from "../components/Header";
import { vendingAPI } from "../services/api";
import {
  salesBatches as mockSalesBatches,
  bankingBatches as mockBankingBatches,
  vendors as mockVendors,
} from "../services/mockData";

// ---- Helpers ----------------------------------------------------------------

function fmtDate(d) {
  if (!d) return "--";
  return new Date(d).toLocaleDateString("en-NA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtN$(v) {
  return "N$ " + Number(v || 0).toLocaleString("en-NA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function timeSince(d) {
  if (!d) return "";
  var ms = Date.now() - new Date(d).getTime();
  var hours = Math.floor(ms / 3600000);
  if (hours < 1) return "< 1 hour ago";
  if (hours < 24) return hours + "h ago";
  var days = Math.floor(hours / 24);
  return days + "d ago";
}

// ---- Status Colors ----
var STATUS_MAP = {
  Open: { color: "#4cceac", bg: "rgba(76,206,172,0.12)", icon: FolderOpenOutlined, label: "Open", step: 0 },
  Closed: { color: "#f2b705", bg: "rgba(242,183,5,0.12)", icon: LockOutlined, label: "Closed", step: 1 },
  Banking: { color: "#6870fa", bg: "rgba(104,112,250,0.12)", icon: AccountBalanceOutlined, label: "Banking", step: 2 },
  Reconciled: { color: "#4cceac", bg: "rgba(76,206,172,0.12)", icon: CheckCircleOutlined, label: "Reconciled", step: 3 },
  Pending: { color: "#f2b705", bg: "rgba(242,183,5,0.12)", icon: SyncOutlined, label: "Pending", step: 2 },
  Submitted: { color: "#6870fa", bg: "rgba(104,112,250,0.12)", icon: ArrowForwardOutlined, label: "Submitted", step: 2 },
};

// ---- Component --------------------------------------------------------------

export default function Batches() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);

  // Data
  const [salesBatches, setSalesBatches] = useState(mockSalesBatches);
  const [bankingBatches, setBankingBatches] = useState(mockBankingBatches);
  const [vendors, setVendors] = useState(mockVendors);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });

  // Open Batch Dialog
  const [openDlg, setOpenDlg] = useState(false);
  const [openVendor, setOpenVendor] = useState("");
  const [openFloat, setOpenFloat] = useState("");
  const [openNotes, setOpenNotes] = useState("");

  // Close Batch Dialog
  const [closeDlg, setCloseDlg] = useState(false);
  const [closeBatch, setCloseBatch] = useState(null);
  const [cashCount, setCashCount] = useState("");
  const [discrepancyReason, setDiscrepancyReason] = useState("");

  // Banking Dialog
  const [bankDlg, setBankDlg] = useState(false);
  const [bankSalesBatch, setBankSalesBatch] = useState("");
  const [bankRef, setBankRef] = useState("");
  const [bankNotes, setBankNotes] = useState("");

  // Reconcile Dialog
  const [reconDlg, setReconDlg] = useState(false);
  const [reconBatch, setReconBatch] = useState(null);
  const [reconDepositAmt, setReconDepositAmt] = useState("");
  const [reconBankRef, setReconBankRef] = useState("");
  const [reconNotes, setReconNotes] = useState("");

  // Expanded batch detail
  const [expandedBatch, setExpandedBatch] = useState(null);

  // Load from API
  useEffect(function() {
    vendingAPI.getSalesBatches().then(function(r) {
      if (r.success && r.data && r.data.length > 0) setSalesBatches(r.data);
    }).catch(function() {});
    vendingAPI.getBankingBatches().then(function(r) {
      if (r.success && r.data && r.data.length > 0) setBankingBatches(r.data);
    }).catch(function() {});
    vendingAPI.getVendors().then(function(r) {
      if (r.success && r.data && r.data.length > 0) setVendors(r.data);
    }).catch(function() {});
  }, []);

  // Derived stats
  var openBatches = salesBatches.filter(function(b) { return b.status === "Open"; });
  var closedBatches = salesBatches.filter(function(b) { return b.status === "Closed"; });
  var totalRevenue = salesBatches.reduce(function(s, b) { return s + Number(b.totalAmount || 0); }, 0);
  var totalTxns = salesBatches.reduce(function(s, b) { return s + Number(b.transactionCount || 0); }, 0);
  var unreconciledBanking = bankingBatches.filter(function(b) { return b.status !== "Reconciled"; });
  var reconciledBanking = bankingBatches.filter(function(b) { return b.status === "Reconciled"; });
  var totalDiscrepancies = salesBatches.reduce(function(s, b) {
    return s + Math.abs(Number(b.discrepancyAmount || 0));
  }, 0);

  // Batch lifecycle step for a sales batch
  function getBatchStep(batch) {
    if (batch.status === "Open") return 0;
    if (batch.status === "Closed") {
      var hasBanking = bankingBatches.some(function(bb) {
        return String(bb.salesBatchId) === String(batch.id);
      });
      if (hasBanking) {
        var bb = bankingBatches.find(function(bb) {
          return String(bb.salesBatchId) === String(batch.id);
        });
        if (bb && bb.status === "Reconciled") return 3;
        return 2;
      }
      return 1;
    }
    return 0;
  }

  // ---- Handlers ----

  var refreshData = function() {
    vendingAPI.getSalesBatches().then(function(r) {
      if (r.success) setSalesBatches(r.data);
    }).catch(function() {});
    vendingAPI.getBankingBatches().then(function(r) {
      if (r.success) setBankingBatches(r.data);
    }).catch(function() {});
  };

  var handleCreateBatch = async function() {
    if (!openVendor) return;
    try {
      var res = await vendingAPI.createSalesBatch({
        vendorId: openVendor,
        openingFloat: parseFloat(openFloat) || 0,
        notes: openNotes,
      });
      if (res.success) {
        setSnackbar({ open: true, message: "Batch opened: " + (res.batchNo || ""), severity: "success" });
        refreshData();
      } else {
        setSnackbar({ open: true, message: res.error || "Failed", severity: "error" });
      }
    } catch (err) {
      // Fallback to local
      var vendor = vendors.find(function(v) { return String(v.id) === String(openVendor); });
      var newBatch = {
        id: "SB-" + String(salesBatches.length + 1).padStart(3, "0"),
        batchNo: "BATCH-" + String(salesBatches.length + 1).padStart(3, "0"),
        vendorId: openVendor,
        vendorName: (vendor && vendor.name) || "Unknown",
        status: "Open",
        transactionCount: 0,
        totalAmount: 0,
        openingFloat: parseFloat(openFloat) || 0,
        closingCashCount: null,
        discrepancyAmount: null,
        discrepancyReason: null,
        closedBy: null,
        openedAt: new Date().toISOString(),
        closedAt: null,
        notes: openNotes,
      };
      setSalesBatches(function(prev) { return [newBatch].concat(prev); });
      setSnackbar({ open: true, message: "Batch opened (offline)", severity: "success" });
    }
    setOpenDlg(false);
    setOpenVendor("");
    setOpenFloat("");
    setOpenNotes("");
  };

  var handleOpenCloseDialog = function(batch) {
    setCloseBatch(batch);
    setCashCount("");
    setDiscrepancyReason("");
    setCloseDlg(true);
  };

  var handleCloseBatch = async function() {
    if (!closeBatch) return;
    var cashVal = parseFloat(cashCount);
    if (isNaN(cashVal)) {
      setSnackbar({ open: true, message: "Enter a valid cash count", severity: "error" });
      return;
    }
    var expected = Number(closeBatch.totalAmount || 0) + Number(closeBatch.openingFloat || 0);
    var disc = Math.round((cashVal - expected) * 100) / 100;
    var hasDisc = Math.abs(disc) > 0.01;

    if (hasDisc && !discrepancyReason.trim()) {
      setSnackbar({ open: true, message: "Discrepancy of N$ " + disc.toFixed(2) + " detected — reason required", severity: "warning" });
      return;
    }

    try {
      var res = await vendingAPI.closeSalesBatch(closeBatch.id, {
        cashCount: cashVal,
        discrepancyReason: hasDisc ? discrepancyReason : null,
      });
      if (res.success) {
        setSnackbar({
          open: true,
          message: "Batch closed" + (res.data && res.data.hasDiscrepancy ? " (discrepancy: N$ " + Number(res.data.discrepancy).toFixed(2) + ")" : ""),
          severity: res.data && res.data.hasDiscrepancy ? "warning" : "success",
        });
        refreshData();
      } else {
        setSnackbar({ open: true, message: res.error || "Close failed", severity: "error" });
      }
    } catch (err) {
      // Offline fallback
      setSalesBatches(function(prev) {
        return prev.map(function(b) {
          if (String(b.id) === String(closeBatch.id)) {
            return Object.assign({}, b, {
              status: "Closed",
              closedAt: new Date().toISOString(),
              closingCashCount: cashVal,
              discrepancyAmount: disc,
              discrepancyReason: hasDisc ? discrepancyReason : null,
              closedBy: "Current User",
            });
          }
          return b;
        });
      });
      setSnackbar({ open: true, message: "Batch closed (offline)", severity: "success" });
    }
    setCloseDlg(false);
  };

  var handleCreateBanking = async function() {
    if (!bankSalesBatch || !bankRef) return;
    try {
      var res = await vendingAPI.createBankingBatch({
        salesBatchId: bankSalesBatch,
        bankRef: bankRef,
        notes: bankNotes,
      });
      if (res.success) {
        setSnackbar({ open: true, message: "Banking batch created", severity: "success" });
        refreshData();
      }
    } catch (err) {
      var sb = closedBatches.find(function(b) { return String(b.id) === String(bankSalesBatch); });
      var newBank = {
        id: "BB-" + String(bankingBatches.length + 1).padStart(3, "0"),
        batchNo: "BANK-2026-" + String(bankingBatches.length + 1).padStart(3, "0"),
        salesBatchId: bankSalesBatch,
        salesBatchNo: sb ? sb.batchNo : "",
        vendorName: sb ? sb.vendorName : "",
        bankRef: bankRef,
        status: "Pending",
        totalAmount: sb ? sb.totalAmount : 0,
        depositAmount: null,
        reconciledBy: null,
        reconciledAt: null,
        createdAt: new Date().toISOString(),
        notes: bankNotes,
      };
      setBankingBatches(function(prev) { return [newBank].concat(prev); });
      setSnackbar({ open: true, message: "Banking batch created (offline)", severity: "success" });
    }
    setBankDlg(false);
    setBankSalesBatch("");
    setBankRef("");
    setBankNotes("");
  };

  var handleOpenReconcile = function(batch) {
    setReconBatch(batch);
    setReconDepositAmt(String(batch.totalAmount || ""));
    setReconBankRef(batch.bankRef || "");
    setReconNotes("");
    setReconDlg(true);
  };

  var handleReconcile = async function() {
    if (!reconBatch) return;
    try {
      var res = await vendingAPI.reconcileBankingBatch(reconBatch.id, {
        depositAmount: parseFloat(reconDepositAmt) || 0,
        bankRef: reconBankRef,
        notes: reconNotes,
      });
      if (res.success) {
        setSnackbar({ open: true, message: "Banking batch reconciled", severity: "success" });
        refreshData();
      }
    } catch (err) {
      setBankingBatches(function(prev) {
        return prev.map(function(b) {
          if (String(b.id) === String(reconBatch.id)) {
            return Object.assign({}, b, {
              status: "Reconciled",
              depositAmount: parseFloat(reconDepositAmt) || 0,
              reconciledBy: "Current User",
              reconciledAt: new Date().toISOString(),
              bankRef: reconBankRef || b.bankRef,
              notes: reconNotes || b.notes,
            });
          }
          return b;
        });
      });
      setSnackbar({ open: true, message: "Reconciled (offline)", severity: "success" });
    }
    setReconDlg(false);
  };

  // ---- Styling helpers ----

  var textFieldSx = {
    "& .MuiOutlinedInput-root": {
      color: colors.grey[100],
      backgroundColor: "rgba(0,0,0,0.2)",
      "& fieldset": { borderColor: colors.primary[300] },
      "&:hover fieldset": { borderColor: colors.greenAccent[700] },
      "&.Mui-focused fieldset": { borderColor: colors.greenAccent[500] },
    },
    "& .MuiInputLabel-root": { color: colors.grey[300] },
    "& .MuiInputLabel-root.Mui-focused": { color: colors.greenAccent[500] },
  };

  var selectSx = {
    color: colors.grey[100],
    backgroundColor: "rgba(0,0,0,0.2)",
    "& fieldset": { borderColor: colors.primary[300] },
    "&:hover fieldset": { borderColor: colors.greenAccent[700] },
    "&.Mui-focused fieldset": { borderColor: colors.greenAccent[500] },
    "& .MuiSelect-icon": { color: colors.grey[300] },
  };

  var headerCellSx = {
    color: colors.grey[300],
    fontWeight: 600,
    fontSize: "0.7rem",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    borderBottom: "1px solid " + colors.primary[300],
    whiteSpace: "nowrap",
    py: 1,
  };

  var bodyCellSx = {
    color: colors.grey[100],
    borderBottom: "1px solid " + colors.primary[300],
    fontSize: "0.82rem",
    py: "8px",
  };

  function statusChip(status) {
    var cfg = STATUS_MAP[status] || STATUS_MAP.Open;
    return (
      <Chip
        label={cfg.label}
        size="small"
        sx={{
          fontWeight: 600,
          fontSize: "0.72rem",
          color: cfg.color,
          backgroundColor: cfg.bg,
          border: "1px solid " + cfg.color,
          height: 24,
        }}
      />
    );
  }

  // ---- Close batch computed values ----
  var closeExpected = closeBatch ? Number(closeBatch.totalAmount || 0) + Number(closeBatch.openingFloat || 0) : 0;
  var closeDiscrepancy = closeBatch && cashCount !== "" ? Math.round((parseFloat(cashCount) - closeExpected) * 100) / 100 : 0;
  var closeHasDisc = closeBatch && cashCount !== "" && Math.abs(closeDiscrepancy) > 0.01;

  // Reconcile computed
  var reconDiscrepancy = reconBatch && reconDepositAmt !== ""
    ? Math.round((parseFloat(reconDepositAmt) - Number(reconBatch.totalAmount || 0)) * 100) / 100
    : 0;
  var reconHasDisc = reconBatch && reconDepositAmt !== "" && Math.abs(reconDiscrepancy) > 0.01;

  // ---- Pipeline stepper labels ----
  var pipelineSteps = ["Open", "Closed", "Banking", "Reconciled"];

  return (
    <Box m="20px">
      <Header
        title="BATCH MANAGEMENT"
        subtitle="Sales & Banking Batch Operations"
      />

      <Box
        display="grid"
        gridTemplateColumns="repeat(12, 1fr)"
        gridAutoRows="140px"
        gap="5px"
      >
        {/* ---- STAT: Open Batches ---- */}
        <Box
          gridColumn="span 3"
          backgroundColor={colors.primary[400]}
          borderRadius="4px"
          p="15px"
          display="flex"
          flexDirection="column"
          justifyContent="center"
          alignItems="center"
        >
          <FolderOpenOutlined sx={{ color: "#4cceac", fontSize: 28, mb: "6px" }} />
          <Typography variant="h3" fontWeight="700" color={colors.grey[100]}>
            {openBatches.length}
          </Typography>
          <Typography variant="body2" color="#4cceac" fontWeight={600}>
            Open Batches
          </Typography>
          {openBatches.length > 0 && (
            <Typography variant="caption" color={colors.grey[400]} mt="2px">
              {fmtN$(openBatches.reduce(function(s, b) { return s + Number(b.totalAmount || 0); }, 0))} in sales
            </Typography>
          )}
        </Box>

        {/* ---- STAT: Total Transactions ---- */}
        <Box
          gridColumn="span 3"
          backgroundColor={colors.primary[400]}
          borderRadius="4px"
          p="15px"
          display="flex"
          flexDirection="column"
          justifyContent="center"
          alignItems="center"
        >
          <ReceiptLongOutlined sx={{ color: "#6870fa", fontSize: 28, mb: "6px" }} />
          <Typography variant="h3" fontWeight="700" color={colors.grey[100]}>
            {totalTxns.toLocaleString()}
          </Typography>
          <Typography variant="body2" color="#6870fa" fontWeight={600}>
            Total Transactions
          </Typography>
          <Typography variant="caption" color={colors.grey[400]} mt="2px">
            Across {salesBatches.length} batches
          </Typography>
        </Box>

        {/* ---- STAT: Total Revenue ---- */}
        <Box
          gridColumn="span 3"
          backgroundColor={colors.primary[400]}
          borderRadius="4px"
          p="15px"
          display="flex"
          flexDirection="column"
          justifyContent="center"
          alignItems="center"
        >
          <AttachMoneyOutlined sx={{ color: "#4cceac", fontSize: 28, mb: "6px" }} />
          <Typography variant="h3" fontWeight="700" color={colors.grey[100]}>
            {fmtN$(totalRevenue)}
          </Typography>
          <Typography variant="body2" color="#4cceac" fontWeight={600}>
            Total Revenue
          </Typography>
          <Typography variant="caption" color={colors.grey[400]} mt="2px">
            {reconciledBanking.length}/{bankingBatches.length} reconciled
          </Typography>
        </Box>

        {/* ---- STAT: Discrepancies / Unreconciled ---- */}
        <Box
          gridColumn="span 3"
          backgroundColor={colors.primary[400]}
          borderRadius="4px"
          p="15px"
          display="flex"
          flexDirection="column"
          justifyContent="center"
          alignItems="center"
        >
          {unreconciledBanking.length > 0 ? (
            <>
              <WarningAmberOutlined sx={{ color: "#f2b705", fontSize: 28, mb: "6px" }} />
              <Typography variant="h3" fontWeight="700" color={colors.grey[100]}>
                {unreconciledBanking.length}
              </Typography>
              <Typography variant="body2" color="#f2b705" fontWeight={600}>
                Unreconciled
              </Typography>
              <Typography variant="caption" color={colors.grey[400]} mt="2px">
                {fmtN$(unreconciledBanking.reduce(function(s, b) { return s + Number(b.totalAmount || 0); }, 0))} pending
              </Typography>
            </>
          ) : (
            <>
              <CheckCircleOutlined sx={{ color: "#4cceac", fontSize: 28, mb: "6px" }} />
              <Typography variant="h3" fontWeight="700" color={colors.grey[100]}>
                0
              </Typography>
              <Typography variant="body2" color="#4cceac" fontWeight={600}>
                All Reconciled
              </Typography>
            </>
          )}
        </Box>

        {/* ──── BATCH LIFECYCLE PIPELINE (span 12) ──── */}
        <Box
          gridColumn="span 12"
          backgroundColor={colors.primary[400]}
          borderRadius="4px"
          p="15px 20px"
          display="flex"
          alignItems="center"
          gap="20px"
        >
          <Typography variant="h6" fontWeight="700" color={colors.grey[100]} sx={{ minWidth: 130 }}>
            Batch Lifecycle
          </Typography>
          <Box flex="1">
            <Stepper
              activeStep={-1}
              alternativeLabel
              sx={{
                "& .MuiStepLabel-label": { color: colors.grey[300], fontSize: "0.8rem", fontWeight: 600 },
                "& .MuiStepIcon-root": { color: colors.primary[300] },
                "& .MuiStepConnector-line": { borderColor: colors.grey[600] },
              }}
            >
              {pipelineSteps.map(function(label, idx) {
                var count = 0;
                if (idx === 0) count = openBatches.length;
                else if (idx === 1) {
                  count = closedBatches.filter(function(sb) {
                    return !bankingBatches.some(function(bb) { return String(bb.salesBatchId) === String(sb.id); });
                  }).length;
                } else if (idx === 2) count = unreconciledBanking.length;
                else count = reconciledBanking.length;

                var stepColor = STATUS_MAP[label] ? STATUS_MAP[label].color : colors.grey[400];
                return (
                  <Step key={label} completed={false}>
                    <StepLabel
                      StepIconComponent={function() {
                        return (
                          <Box
                            sx={{
                              width: 36,
                              height: 36,
                              borderRadius: "50%",
                              backgroundColor: stepColor + "22",
                              border: "2px solid " + stepColor,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Typography variant="body2" fontWeight="700" color={stepColor}>
                              {count}
                            </Typography>
                          </Box>
                        );
                      }}
                    >
                      {label}
                    </StepLabel>
                  </Step>
                );
              })}
            </Stepper>
          </Box>
        </Box>

        {/* ──── SALES BATCHES TABLE (span 12, span 4) ──── */}
        <Box
          gridColumn="span 12"
          gridRow="span 4"
          backgroundColor={colors.primary[400]}
          borderRadius="4px"
          overflow="auto"
        >
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="center"
            p="12px 15px"
            borderBottom={"1px solid " + colors.primary[300]}
          >
            <Box display="flex" alignItems="center" gap="10px">
              <PointOfSaleOutlined sx={{ color: colors.greenAccent[500], fontSize: 22 }} />
              <Typography variant="h5" fontWeight="600" color={colors.grey[100]}>
                Sales Batches
              </Typography>
              <Chip
                label={salesBatches.length + " total"}
                size="small"
                sx={{ color: colors.grey[300], backgroundColor: colors.primary[300], height: 22, fontSize: "0.7rem" }}
              />
            </Box>
            <Button
              variant="contained"
              size="small"
              startIcon={<AddOutlined />}
              onClick={function() {
                setOpenVendor("");
                setOpenFloat("");
                setOpenNotes("");
                setOpenDlg(true);
              }}
              sx={{
                fontWeight: 600,
                backgroundColor: colors.greenAccent[600],
                color: colors.primary[500],
                "&:hover": { backgroundColor: colors.greenAccent[700] },
              }}
            >
              Open New Batch
            </Button>
          </Box>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={headerCellSx} width={30}></TableCell>
                  <TableCell sx={headerCellSx}>Batch #</TableCell>
                  <TableCell sx={headerCellSx}>Vendor</TableCell>
                  <TableCell sx={headerCellSx}>Status</TableCell>
                  <TableCell sx={headerCellSx}>Pipeline</TableCell>
                  <TableCell sx={headerCellSx} align="right">Txns</TableCell>
                  <TableCell sx={headerCellSx} align="right">Total Sales</TableCell>
                  <TableCell sx={headerCellSx} align="right">Float</TableCell>
                  <TableCell sx={headerCellSx}>Opened</TableCell>
                  <TableCell sx={headerCellSx}>Closed</TableCell>
                  <TableCell sx={headerCellSx} align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {salesBatches.map(function(batch) {
                  var step = getBatchStep(batch);
                  var isExpanded = expandedBatch === batch.id;
                  var hasDisc = batch.discrepancyAmount && Math.abs(Number(batch.discrepancyAmount)) > 0.01;
                  return [
                    <TableRow
                      key={batch.id}
                      sx={{
                        "&:hover": { backgroundColor: colors.primary[300] + "44" },
                        cursor: "pointer",
                      }}
                      onClick={function() { setExpandedBatch(isExpanded ? null : batch.id); }}
                    >
                      <TableCell sx={bodyCellSx}>
                        <IconButton size="small" sx={{ color: colors.grey[400] }}>
                          {isExpanded ? <ExpandLessOutlined fontSize="small" /> : <ExpandMoreOutlined fontSize="small" />}
                        </IconButton>
                      </TableCell>
                      <TableCell sx={{ ...bodyCellSx, fontFamily: "monospace", fontWeight: 600 }}>
                        {batch.batchNo}
                      </TableCell>
                      <TableCell sx={bodyCellSx}>
                        <Typography variant="body2" fontWeight="600" color={colors.grey[100]}>
                          {batch.vendorName}
                        </Typography>
                      </TableCell>
                      <TableCell sx={bodyCellSx}>
                        <Box display="flex" alignItems="center" gap="6px">
                          {statusChip(batch.status)}
                          {hasDisc && (
                            <Tooltip title={"Discrepancy: N$ " + Number(batch.discrepancyAmount).toFixed(2)}>
                              <WarningAmberOutlined sx={{ color: "#f2b705", fontSize: 16 }} />
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell sx={bodyCellSx}>
                        <Box display="flex" alignItems="center" gap="3px">
                          {pipelineSteps.map(function(label, idx) {
                            var active = idx <= step;
                            return (
                              <Box
                                key={label}
                                sx={{
                                  width: idx < 3 ? 28 : 28,
                                  height: 6,
                                  borderRadius: "3px",
                                  backgroundColor: active
                                    ? (STATUS_MAP[label] ? STATUS_MAP[label].color : "#4cceac")
                                    : colors.primary[300],
                                  transition: "all 0.3s",
                                }}
                              />
                            );
                          })}
                        </Box>
                      </TableCell>
                      <TableCell sx={bodyCellSx} align="right">
                        {Number(batch.transactionCount || 0).toLocaleString()}
                      </TableCell>
                      <TableCell sx={{ ...bodyCellSx, fontWeight: 600 }} align="right">
                        {fmtN$(batch.totalAmount)}
                      </TableCell>
                      <TableCell sx={bodyCellSx} align="right">
                        {fmtN$(batch.openingFloat || 0)}
                      </TableCell>
                      <TableCell sx={{ ...bodyCellSx, whiteSpace: "nowrap" }}>
                        {fmtDate(batch.openedAt)}
                      </TableCell>
                      <TableCell sx={{ ...bodyCellSx, whiteSpace: "nowrap" }}>
                        {fmtDate(batch.closedAt)}
                      </TableCell>
                      <TableCell sx={bodyCellSx} align="center">
                        <Box display="flex" gap="4px" justifyContent="center" onClick={function(e) { e.stopPropagation(); }}>
                          {batch.status === "Open" && (
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<LockOutlined sx={{ fontSize: 14 }} />}
                              onClick={function() { handleOpenCloseDialog(batch); }}
                              sx={{
                                color: "#f2b705",
                                borderColor: "rgba(242,183,5,0.4)",
                                fontSize: "0.72rem",
                                textTransform: "none",
                                py: "2px",
                                "&:hover": { borderColor: "#f2b705", backgroundColor: "rgba(242,183,5,0.08)" },
                              }}
                            >
                              Close
                            </Button>
                          )}
                          {batch.status === "Closed" && !bankingBatches.some(function(bb) { return String(bb.salesBatchId) === String(batch.id); }) && (
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<AccountBalanceOutlined sx={{ fontSize: 14 }} />}
                              onClick={function() {
                                setBankSalesBatch(String(batch.id));
                                setBankRef("");
                                setBankNotes("");
                                setBankDlg(true);
                              }}
                              sx={{
                                color: "#6870fa",
                                borderColor: "rgba(104,112,250,0.4)",
                                fontSize: "0.72rem",
                                textTransform: "none",
                                py: "2px",
                                "&:hover": { borderColor: "#6870fa", backgroundColor: "rgba(104,112,250,0.08)" },
                              }}
                            >
                              Bank
                            </Button>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>,
                    // ---- Expanded detail row ----
                    isExpanded && (
                      <TableRow key={batch.id + "-detail"}>
                        <TableCell colSpan={11} sx={{ p: 0, borderBottom: "1px solid " + colors.primary[300] }}>
                          <Box
                            sx={{
                              backgroundColor: colors.primary[500] || "rgba(0,0,0,0.15)",
                              p: "16px 24px",
                              display: "grid",
                              gridTemplateColumns: "repeat(4, 1fr)",
                              gap: "16px",
                            }}
                          >
                            {/* Opening float */}
                            <Box>
                              <Typography variant="caption" color={colors.grey[400]} fontWeight={600} textTransform="uppercase">
                                Opening Float
                              </Typography>
                              <Typography variant="body1" color={colors.grey[100]} fontWeight={600}>
                                {fmtN$(batch.openingFloat || 0)}
                              </Typography>
                            </Box>
                            {/* Cash Count */}
                            <Box>
                              <Typography variant="caption" color={colors.grey[400]} fontWeight={600} textTransform="uppercase">
                                Cash Count (Close)
                              </Typography>
                              <Typography variant="body1" color={colors.grey[100]} fontWeight={600}>
                                {batch.closingCashCount != null ? fmtN$(batch.closingCashCount) : "--"}
                              </Typography>
                            </Box>
                            {/* Discrepancy */}
                            <Box>
                              <Typography variant="caption" color={colors.grey[400]} fontWeight={600} textTransform="uppercase">
                                Discrepancy
                              </Typography>
                              <Typography
                                variant="body1"
                                fontWeight={600}
                                color={
                                  hasDisc
                                    ? (Number(batch.discrepancyAmount) < 0 ? "#db4f4a" : "#f2b705")
                                    : "#4cceac"
                                }
                              >
                                {batch.discrepancyAmount != null
                                  ? (Number(batch.discrepancyAmount) === 0
                                      ? "None"
                                      : "N$ " + Number(batch.discrepancyAmount).toFixed(2))
                                  : "--"}
                              </Typography>
                              {batch.discrepancyReason && (
                                <Typography variant="caption" color={colors.grey[400]} display="block" mt="2px">
                                  Reason: {batch.discrepancyReason}
                                </Typography>
                              )}
                            </Box>
                            {/* Closed By */}
                            <Box>
                              <Typography variant="caption" color={colors.grey[400]} fontWeight={600} textTransform="uppercase">
                                Closed By
                              </Typography>
                              <Typography variant="body1" color={colors.grey[100]} fontWeight={600}>
                                {batch.closedBy || "--"}
                              </Typography>
                              {batch.notes && (
                                <Typography variant="caption" color={colors.grey[400]} display="block" mt="2px">
                                  {batch.notes}
                                </Typography>
                              )}
                            </Box>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ),
                  ];
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        {/* ──── BANKING BATCHES TABLE (span 12, span 3) ──── */}
        <Box
          gridColumn="span 12"
          gridRow="span 3"
          backgroundColor={colors.primary[400]}
          borderRadius="4px"
          overflow="auto"
        >
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="center"
            p="12px 15px"
            borderBottom={"1px solid " + colors.primary[300]}
          >
            <Box display="flex" alignItems="center" gap="10px">
              <AccountBalanceOutlined sx={{ color: "#6870fa", fontSize: 22 }} />
              <Typography variant="h5" fontWeight="600" color={colors.grey[100]}>
                Banking & Reconciliation
              </Typography>
              <Chip
                label={bankingBatches.length + " total"}
                size="small"
                sx={{ color: colors.grey[300], backgroundColor: colors.primary[300], height: 22, fontSize: "0.7rem" }}
              />
              {unreconciledBanking.length > 0 && (
                <Chip
                  icon={<WarningAmberOutlined sx={{ fontSize: 14, color: "#f2b705 !important" }} />}
                  label={unreconciledBanking.length + " unreconciled"}
                  size="small"
                  sx={{
                    color: "#f2b705",
                    backgroundColor: "rgba(242,183,5,0.12)",
                    border: "1px solid rgba(242,183,5,0.3)",
                    height: 22,
                    fontSize: "0.7rem",
                  }}
                />
              )}
            </Box>
            <Button
              variant="contained"
              size="small"
              startIcon={<AccountBalanceOutlined />}
              onClick={function() {
                setBankSalesBatch("");
                setBankRef("");
                setBankNotes("");
                setBankDlg(true);
              }}
              sx={{
                fontWeight: 600,
                backgroundColor: colors.greenAccent[600],
                color: colors.primary[500],
                "&:hover": { backgroundColor: colors.greenAccent[700] },
              }}
            >
              New Banking Batch
            </Button>
          </Box>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={headerCellSx}>Banking #</TableCell>
                  <TableCell sx={headerCellSx}>Sales Batch</TableCell>
                  <TableCell sx={headerCellSx}>Vendor</TableCell>
                  <TableCell sx={headerCellSx}>Bank Ref</TableCell>
                  <TableCell sx={headerCellSx}>Status</TableCell>
                  <TableCell sx={headerCellSx} align="right">Expected</TableCell>
                  <TableCell sx={headerCellSx} align="right">Deposited</TableCell>
                  <TableCell sx={headerCellSx}>Reconciled By</TableCell>
                  <TableCell sx={headerCellSx}>Created</TableCell>
                  <TableCell sx={headerCellSx} align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {bankingBatches.map(function(bb) {
                  var depositMatch = bb.depositAmount != null && Math.abs(Number(bb.depositAmount) - Number(bb.totalAmount)) < 0.01;
                  return (
                    <TableRow
                      key={bb.id}
                      sx={{ "&:hover": { backgroundColor: colors.primary[300] + "44" } }}
                    >
                      <TableCell sx={{ ...bodyCellSx, fontFamily: "monospace", fontWeight: 600 }}>
                        {bb.batchNo}
                      </TableCell>
                      <TableCell sx={{ ...bodyCellSx, fontFamily: "monospace" }}>
                        {bb.salesBatchNo || bb.salesBatchId}
                      </TableCell>
                      <TableCell sx={bodyCellSx}>
                        {bb.vendorName || "--"}
                      </TableCell>
                      <TableCell sx={{ ...bodyCellSx, fontFamily: "monospace" }}>
                        {bb.bankRef || "--"}
                      </TableCell>
                      <TableCell sx={bodyCellSx}>
                        {statusChip(bb.status)}
                      </TableCell>
                      <TableCell sx={{ ...bodyCellSx, fontWeight: 600 }} align="right">
                        {fmtN$(bb.totalAmount)}
                      </TableCell>
                      <TableCell sx={bodyCellSx} align="right">
                        {bb.depositAmount != null ? (
                          <Box display="flex" alignItems="center" justifyContent="flex-end" gap="4px">
                            <Typography variant="body2" fontWeight={600} color={depositMatch ? "#4cceac" : "#f2b705"}>
                              {fmtN$(bb.depositAmount)}
                            </Typography>
                            {depositMatch ? (
                              <CheckCircleOutlined sx={{ fontSize: 14, color: "#4cceac" }} />
                            ) : (
                              <WarningAmberOutlined sx={{ fontSize: 14, color: "#f2b705" }} />
                            )}
                          </Box>
                        ) : (
                          <Typography variant="body2" color={colors.grey[500]}>--</Typography>
                        )}
                      </TableCell>
                      <TableCell sx={bodyCellSx}>
                        {bb.reconciledBy ? (
                          <Box>
                            <Typography variant="body2" color={colors.grey[100]}>
                              {bb.reconciledBy}
                            </Typography>
                            <Typography variant="caption" color={colors.grey[400]}>
                              {fmtDate(bb.reconciledAt)}
                            </Typography>
                          </Box>
                        ) : "--"}
                      </TableCell>
                      <TableCell sx={{ ...bodyCellSx, whiteSpace: "nowrap" }}>
                        {fmtDate(bb.createdAt)}
                      </TableCell>
                      <TableCell sx={bodyCellSx} align="center">
                        {bb.status !== "Reconciled" && (
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<CheckCircleOutlined sx={{ fontSize: 14 }} />}
                            onClick={function() { handleOpenReconcile(bb); }}
                            sx={{
                              color: "#4cceac",
                              borderColor: "rgba(76,206,172,0.4)",
                              fontSize: "0.72rem",
                              textTransform: "none",
                              py: "2px",
                              "&:hover": { borderColor: "#4cceac", backgroundColor: "rgba(76,206,172,0.08)" },
                            }}
                          >
                            Reconcile
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </Box>

      {/* ══════════════════════════════════════════════════════════
          DIALOG: Open New Sales Batch
         ══════════════════════════════════════════════════════════ */}
      <Dialog
        open={openDlg}
        onClose={function() { setOpenDlg(false); }}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            backgroundColor: colors.primary[400],
            border: "1px solid " + colors.primary[300],
            color: colors.grey[100],
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 700, color: colors.grey[100], pb: 0 }}>
          <Box display="flex" alignItems="center" gap="10px">
            <FolderOpenOutlined sx={{ color: "#4cceac" }} />
            Open New Sales Batch
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color={colors.grey[400]} mb="16px" mt="4px">
            Start a new cash collection period. Record the opening cash float in the till drawer.
          </Typography>

          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel sx={{ color: colors.grey[300], "&.Mui-focused": { color: colors.greenAccent[500] } }}>
              Vendor / Point of Sale
            </InputLabel>
            <Select
              value={openVendor}
              label="Vendor / Point of Sale"
              onChange={function(e) { setOpenVendor(e.target.value); }}
              sx={selectSx}
              MenuProps={{ PaperProps: { sx: { backgroundColor: colors.primary[400], color: colors.grey[100] } } }}
            >
              {vendors.filter(function(v) { return v.status === "Active"; }).map(function(v) {
                return <MenuItem key={v.id} value={v.id}>{v.name}</MenuItem>;
              })}
            </Select>
          </FormControl>

          <TextField
            fullWidth
            label="Opening Cash Float (N$)"
            type="number"
            placeholder="e.g. 500.00"
            value={openFloat}
            onChange={function(e) { setOpenFloat(e.target.value); }}
            sx={{ ...textFieldSx, mb: 2 }}
            helperText="Cash already in the till drawer at the start of the shift"
            FormHelperTextProps={{ sx: { color: colors.grey[400] } }}
          />

          <TextField
            fullWidth
            label="Notes (optional)"
            multiline
            rows={2}
            value={openNotes}
            onChange={function(e) { setOpenNotes(e.target.value); }}
            sx={textFieldSx}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={function() { setOpenDlg(false); }} sx={{ color: colors.grey[300] }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={!openVendor}
            onClick={handleCreateBatch}
            sx={{
              fontWeight: 600,
              backgroundColor: colors.greenAccent[600],
              color: colors.primary[500],
              "&:hover": { backgroundColor: colors.greenAccent[700] },
              "&.Mui-disabled": { backgroundColor: colors.primary[300], color: colors.grey[400] },
            }}
          >
            Open Batch
          </Button>
        </DialogActions>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════
          DIALOG: Close Batch (Cash Count)
         ══════════════════════════════════════════════════════════ */}
      <Dialog
        open={closeDlg}
        onClose={function() { setCloseDlg(false); }}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            backgroundColor: colors.primary[400],
            border: "1px solid " + colors.primary[300],
            color: colors.grey[100],
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 700, color: colors.grey[100], pb: 0 }}>
          <Box display="flex" alignItems="center" gap="10px">
            <LockOutlined sx={{ color: "#f2b705" }} />
            Close Batch — Cash Count
          </Box>
        </DialogTitle>
        <DialogContent>
          {closeBatch && (
            <>
              <Typography variant="body2" color={colors.grey[400]} mb="16px" mt="4px">
                Count the physical cash in the till and enter the total below. The system will compare it with the expected amount.
              </Typography>

              {/* Summary info */}
              <Box
                sx={{
                  backgroundColor: "rgba(0,0,0,0.2)",
                  borderRadius: "4px",
                  p: "12px 16px",
                  mb: "16px",
                  border: "1px solid " + colors.primary[300],
                }}
              >
                <Box display="flex" justifyContent="space-between" mb="8px">
                  <Typography variant="body2" color={colors.grey[300]}>Batch</Typography>
                  <Typography variant="body2" fontWeight={600} color={colors.grey[100]} fontFamily="monospace">
                    {closeBatch.batchNo}
                  </Typography>
                </Box>
                <Box display="flex" justifyContent="space-between" mb="8px">
                  <Typography variant="body2" color={colors.grey[300]}>Vendor</Typography>
                  <Typography variant="body2" fontWeight={600} color={colors.grey[100]}>
                    {closeBatch.vendorName}
                  </Typography>
                </Box>
                <Divider sx={{ borderColor: colors.primary[300], my: "8px" }} />
                <Box display="flex" justifyContent="space-between" mb="4px">
                  <Typography variant="body2" color={colors.grey[300]}>Total Sales</Typography>
                  <Typography variant="body2" fontWeight={600} color={colors.grey[100]}>
                    {fmtN$(closeBatch.totalAmount)}
                  </Typography>
                </Box>
                <Box display="flex" justifyContent="space-between" mb="4px">
                  <Typography variant="body2" color={colors.grey[300]}>Opening Float</Typography>
                  <Typography variant="body2" fontWeight={600} color={colors.grey[100]}>
                    {fmtN$(closeBatch.openingFloat || 0)}
                  </Typography>
                </Box>
                <Divider sx={{ borderColor: colors.primary[300], my: "8px" }} />
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body1" fontWeight={700} color="#4cceac">Expected Cash</Typography>
                  <Typography variant="body1" fontWeight={700} color="#4cceac">
                    {fmtN$(closeExpected)}
                  </Typography>
                </Box>
              </Box>

              <TextField
                fullWidth
                label="Physical Cash Count (N$)"
                type="number"
                placeholder="Enter total cash counted"
                value={cashCount}
                onChange={function(e) { setCashCount(e.target.value); }}
                sx={{ ...textFieldSx, mb: 2 }}
                autoFocus
              />

              {/* Discrepancy indicator */}
              {cashCount !== "" && (
                <Box
                  sx={{
                    backgroundColor: closeHasDisc
                      ? (closeDiscrepancy < 0 ? "rgba(219,79,74,0.1)" : "rgba(242,183,5,0.1)")
                      : "rgba(76,206,172,0.1)",
                    border: "1px solid " + (closeHasDisc
                      ? (closeDiscrepancy < 0 ? "rgba(219,79,74,0.3)" : "rgba(242,183,5,0.3)")
                      : "rgba(76,206,172,0.3)"),
                    borderRadius: "4px",
                    p: "10px 14px",
                    mb: 2,
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                  }}
                >
                  {closeHasDisc ? (
                    <WarningAmberOutlined sx={{ color: closeDiscrepancy < 0 ? "#db4f4a" : "#f2b705" }} />
                  ) : (
                    <CheckCircleOutlined sx={{ color: "#4cceac" }} />
                  )}
                  <Box>
                    <Typography variant="body2" fontWeight={600} color={
                      closeHasDisc ? (closeDiscrepancy < 0 ? "#db4f4a" : "#f2b705") : "#4cceac"
                    }>
                      {closeHasDisc
                        ? (closeDiscrepancy < 0 ? "Shortage" : "Surplus") + ": N$ " + Math.abs(closeDiscrepancy).toFixed(2)
                        : "Cash matches expected amount"}
                    </Typography>
                    {closeHasDisc && (
                      <Typography variant="caption" color={colors.grey[400]}>
                        A reason is required to close with a discrepancy
                      </Typography>
                    )}
                  </Box>
                </Box>
              )}

              {/* Discrepancy reason */}
              {closeHasDisc && (
                <TextField
                  fullWidth
                  label="Discrepancy Reason (required)"
                  placeholder="e.g. Operator counting error, rounding on cash"
                  value={discrepancyReason}
                  onChange={function(e) { setDiscrepancyReason(e.target.value); }}
                  sx={textFieldSx}
                  error={closeHasDisc && !discrepancyReason.trim()}
                  helperText={closeHasDisc && !discrepancyReason.trim() ? "Required when there is a cash discrepancy" : ""}
                />
              )}
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={function() { setCloseDlg(false); }} sx={{ color: colors.grey[300] }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={cashCount === "" || (closeHasDisc && !discrepancyReason.trim())}
            onClick={handleCloseBatch}
            sx={{
              fontWeight: 600,
              backgroundColor: "#f2b705",
              color: "#000",
              "&:hover": { backgroundColor: "#d4a004" },
              "&.Mui-disabled": { backgroundColor: colors.primary[300], color: colors.grey[400] },
            }}
          >
            Close Batch
          </Button>
        </DialogActions>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════
          DIALOG: Create Banking Batch
         ══════════════════════════════════════════════════════════ */}
      <Dialog
        open={bankDlg}
        onClose={function() { setBankDlg(false); }}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            backgroundColor: colors.primary[400],
            border: "1px solid " + colors.primary[300],
            color: colors.grey[100],
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 700, color: colors.grey[100], pb: 0 }}>
          <Box display="flex" alignItems="center" gap="10px">
            <AccountBalanceOutlined sx={{ color: "#6870fa" }} />
            Create Banking Batch
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color={colors.grey[400]} mb="16px" mt="4px">
            Link a closed sales batch to a bank deposit. The deposit must be verified before reconciliation.
          </Typography>

          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel sx={{ color: colors.grey[300], "&.Mui-focused": { color: colors.greenAccent[500] } }}>
              Select Closed Sales Batch
            </InputLabel>
            <Select
              value={bankSalesBatch}
              label="Select Closed Sales Batch"
              onChange={function(e) { setBankSalesBatch(e.target.value); }}
              sx={selectSx}
              MenuProps={{ PaperProps: { sx: { backgroundColor: colors.primary[400], color: colors.grey[100] } } }}
            >
              {closedBatches.map(function(b) {
                return (
                  <MenuItem key={b.id} value={String(b.id)}>
                    {b.batchNo} — {b.vendorName} ({fmtN$(b.totalAmount)})
                  </MenuItem>
                );
              })}
            </Select>
          </FormControl>

          <TextField
            fullWidth
            label="Bank Deposit Reference"
            placeholder="e.g. FNB-WHK-20260312-001"
            value={bankRef}
            onChange={function(e) { setBankRef(e.target.value); }}
            sx={{ ...textFieldSx, mb: 2 }}
          />

          {bankSalesBatch && (
            <Box
              sx={{
                backgroundColor: "rgba(104,112,250,0.08)",
                border: "1px solid rgba(104,112,250,0.2)",
                borderRadius: "4px",
                p: "10px 14px",
                mb: 2,
              }}
            >
              <Typography variant="body2" color={colors.grey[300]}>
                Deposit Amount
              </Typography>
              <Typography variant="h5" fontWeight={700} color="#6870fa">
                {fmtN$((closedBatches.find(function(b) { return String(b.id) === String(bankSalesBatch); }) || {}).totalAmount)}
              </Typography>
            </Box>
          )}

          <TextField
            fullWidth
            label="Notes (optional)"
            multiline
            rows={2}
            value={bankNotes}
            onChange={function(e) { setBankNotes(e.target.value); }}
            sx={textFieldSx}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={function() { setBankDlg(false); }} sx={{ color: colors.grey[300] }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={!bankSalesBatch || !bankRef}
            onClick={handleCreateBanking}
            sx={{
              fontWeight: 600,
              backgroundColor: "#6870fa",
              color: "#fff",
              "&:hover": { backgroundColor: "#5a62d8" },
              "&.Mui-disabled": { backgroundColor: colors.primary[300], color: colors.grey[400] },
            }}
          >
            Create Banking Batch
          </Button>
        </DialogActions>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════
          DIALOG: Reconcile Banking Batch
         ══════════════════════════════════════════════════════════ */}
      <Dialog
        open={reconDlg}
        onClose={function() { setReconDlg(false); }}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            backgroundColor: colors.primary[400],
            border: "1px solid " + colors.primary[300],
            color: colors.grey[100],
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 700, color: colors.grey[100], pb: 0 }}>
          <Box display="flex" alignItems="center" gap="10px">
            <CheckCircleOutlined sx={{ color: "#4cceac" }} />
            Reconcile Banking Batch
          </Box>
        </DialogTitle>
        <DialogContent>
          {reconBatch && (
            <>
              <Typography variant="body2" color={colors.grey[400]} mb="16px" mt="4px">
                Confirm the bank deposit matches the expected amount. Enter the actual deposited amount from the bank statement.
              </Typography>

              <Box
                sx={{
                  backgroundColor: "rgba(0,0,0,0.2)",
                  borderRadius: "4px",
                  p: "12px 16px",
                  mb: "16px",
                  border: "1px solid " + colors.primary[300],
                }}
              >
                <Box display="flex" justifyContent="space-between" mb="4px">
                  <Typography variant="body2" color={colors.grey[300]}>Banking Batch</Typography>
                  <Typography variant="body2" fontWeight={600} color={colors.grey[100]} fontFamily="monospace">
                    {reconBatch.batchNo}
                  </Typography>
                </Box>
                <Box display="flex" justifyContent="space-between" mb="4px">
                  <Typography variant="body2" color={colors.grey[300]}>Expected Amount</Typography>
                  <Typography variant="body1" fontWeight={700} color="#4cceac">
                    {fmtN$(reconBatch.totalAmount)}
                  </Typography>
                </Box>
              </Box>

              <TextField
                fullWidth
                label="Actual Deposit Amount (N$)"
                type="number"
                value={reconDepositAmt}
                onChange={function(e) { setReconDepositAmt(e.target.value); }}
                sx={{ ...textFieldSx, mb: 2 }}
                autoFocus
              />

              {reconDepositAmt !== "" && (
                <Box
                  sx={{
                    backgroundColor: reconHasDisc ? "rgba(242,183,5,0.1)" : "rgba(76,206,172,0.1)",
                    border: "1px solid " + (reconHasDisc ? "rgba(242,183,5,0.3)" : "rgba(76,206,172,0.3)"),
                    borderRadius: "4px",
                    p: "10px 14px",
                    mb: 2,
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                  }}
                >
                  {reconHasDisc ? (
                    <WarningAmberOutlined sx={{ color: "#f2b705" }} />
                  ) : (
                    <CheckCircleOutlined sx={{ color: "#4cceac" }} />
                  )}
                  <Typography variant="body2" fontWeight={600} color={reconHasDisc ? "#f2b705" : "#4cceac"}>
                    {reconHasDisc
                      ? "Difference: N$ " + reconDiscrepancy.toFixed(2)
                      : "Deposit matches expected amount"}
                  </Typography>
                </Box>
              )}

              <TextField
                fullWidth
                label="Bank Reference"
                value={reconBankRef}
                onChange={function(e) { setReconBankRef(e.target.value); }}
                sx={{ ...textFieldSx, mb: 2 }}
              />

              <TextField
                fullWidth
                label="Reconciliation Notes (optional)"
                multiline
                rows={2}
                value={reconNotes}
                onChange={function(e) { setReconNotes(e.target.value); }}
                sx={textFieldSx}
              />
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={function() { setReconDlg(false); }} sx={{ color: colors.grey[300] }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={reconDepositAmt === ""}
            onClick={handleReconcile}
            sx={{
              fontWeight: 600,
              backgroundColor: "#4cceac",
              color: "#000",
              "&:hover": { backgroundColor: "#3db896" },
              "&.Mui-disabled": { backgroundColor: colors.primary[300], color: colors.grey[400] },
            }}
          >
            Confirm Reconciliation
          </Button>
        </DialogActions>
      </Dialog>

      {/* ---- Snackbar ---- */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={function() { setSnackbar({ open: false, message: "", severity: "success" }); }}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={function() { setSnackbar({ open: false, message: "", severity: "success" }); }}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
