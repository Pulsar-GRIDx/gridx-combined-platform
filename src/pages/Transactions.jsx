import { useState, useMemo } from "react";
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
  useTheme,
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
} from "@mui/icons-material";
import { tokens } from "../theme";
import Header from "../components/Header";
import { transactions } from "../services/mockData";

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

export default function Transactions() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);

  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  // Reversal dialog state
  const [reverseDialogOpen, setReverseDialogOpen] = useState(false);
  const [reverseTarget, setReverseTarget] = useState(null);
  const [reverseReason, setReverseReason] = useState("");

  // ---- Filtered transactions ----
  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (search) {
        const q = search.toLowerCase();
        const match =
          t.refNo.toLowerCase().includes(q) ||
          t.customerName.toLowerCase().includes(q) ||
          t.meterNo.toLowerCase().includes(q);
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
  }, [search, dateFrom, dateTo, typeFilter, statusFilter]);

  // ---- Summary stats (from filtered) ----
  const totalCount = filtered.length;
  const grossSales = filtered
    .filter((t) => t.type === "Vend" && t.status === "Completed")
    .reduce((s, t) => s + t.amount, 0);
  const todayTokens = filtered.filter(
    (t) => t.status === "Completed" && t.kWh > 0
  ).length;
  const reversedCount = filtered.filter(
    (t) => t.status === "Reversed"
  ).length;

  // ---- Reversal handlers ----
  const handleReverseClick = (txn) => {
    setReverseTarget(txn);
    setReverseReason("");
    setReverseDialogOpen(true);
  };

  const handleReverseConfirm = () => {
    setReverseDialogOpen(false);
    setReverseTarget(null);
    setReverseReason("");
  };

  const handleReverseCancel = () => {
    setReverseDialogOpen(false);
    setReverseTarget(null);
    setReverseReason("");
  };

  // ---- Status chip color using tokens ----
  const getStatusColor = (status) => {
    switch (status) {
      case "Completed":
        return colors.greenAccent[500];
      case "Reversed":
        return colors.redAccent[500];
      case "Failed":
        return colors.grey[500];
      default:
        return colors.grey[300];
    }
  };

  // ---- Type chip color ----
  const getTypeColor = (type) => {
    switch (type) {
      case "Vend":
        return colors.blueAccent[500];
      case "Reversal":
        return colors.yellowAccent[500];
      case "Free Token":
        return colors.greenAccent[400];
      case "Engineering":
        return colors.grey[400];
      default:
        return colors.grey[300];
    }
  };

  return (
    <Box m="20px">
      <Header title="TRANSACTIONS" subtitle="Vending Transaction History" />

      <Box
        display="grid"
        gridTemplateColumns="repeat(12, 1fr)"
        gridAutoRows="140px"
        gap="5px"
      >
        {/* ---- ROW 1: Stats cards (span 3 each) ---- */}
        <Box
          gridColumn="span 3"
          backgroundColor={colors.primary[400]}
          display="flex"
          alignItems="center"
          justifyContent="center"
          borderRadius="4px"
        >
          <Box textAlign="center">
            <ReceiptLongOutlined
              sx={{ color: colors.blueAccent[500], fontSize: 28, mb: 0.5 }}
            />
            <Typography
              variant="body2"
              color={colors.greenAccent[500]}
              fontWeight="600"
            >
              Total Transactions
            </Typography>
            <Typography
              variant="h4"
              color={colors.grey[100]}
              fontWeight="bold"
            >
              {fmt(totalCount)}
            </Typography>
          </Box>
        </Box>

        <Box
          gridColumn="span 3"
          backgroundColor={colors.primary[400]}
          display="flex"
          alignItems="center"
          justifyContent="center"
          borderRadius="4px"
        >
          <Box textAlign="center">
            <AttachMoneyOutlined
              sx={{ color: colors.greenAccent[500], fontSize: 28, mb: 0.5 }}
            />
            <Typography
              variant="body2"
              color={colors.greenAccent[500]}
              fontWeight="600"
            >
              Total Revenue
            </Typography>
            <Typography
              variant="h4"
              color={colors.grey[100]}
              fontWeight="bold"
            >
              {fmtCurrency(grossSales)}
            </Typography>
          </Box>
        </Box>

        <Box
          gridColumn="span 3"
          backgroundColor={colors.primary[400]}
          display="flex"
          alignItems="center"
          justifyContent="center"
          borderRadius="4px"
        >
          <Box textAlign="center">
            <BoltOutlined
              sx={{ color: colors.yellowAccent[500], fontSize: 28, mb: 0.5 }}
            />
            <Typography
              variant="body2"
              color={colors.greenAccent[500]}
              fontWeight="600"
            >
              Today's Tokens
            </Typography>
            <Typography
              variant="h4"
              color={colors.grey[100]}
              fontWeight="bold"
            >
              {fmt(todayTokens)}
            </Typography>
          </Box>
        </Box>

        <Box
          gridColumn="span 3"
          backgroundColor={colors.primary[400]}
          display="flex"
          alignItems="center"
          justifyContent="center"
          borderRadius="4px"
        >
          <Box textAlign="center">
            <ReplayOutlined
              sx={{ color: colors.redAccent[500], fontSize: 28, mb: 0.5 }}
            />
            <Typography
              variant="body2"
              color={colors.greenAccent[500]}
              fontWeight="600"
            >
              Reversals
            </Typography>
            <Typography
              variant="h4"
              color={colors.grey[100]}
              fontWeight="bold"
            >
              {reversedCount}
            </Typography>
          </Box>
        </Box>

        {/* ---- ROW 2: Filters bar (span 12, span 1) ---- */}
        <Box
          gridColumn="span 12"
          gridRow="span 1"
          backgroundColor={colors.primary[400]}
          borderRadius="4px"
          display="flex"
          alignItems="center"
          gap="10px"
          px="15px"
        >
          <TextField
            size="small"
            label="Date From"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 150 }}
          />
          <TextField
            size="small"
            label="Date To"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 150 }}
          />
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Type</InputLabel>
            <Select
              value={typeFilter}
              label="Type"
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <MenuItem value="All">All</MenuItem>
              <MenuItem value="Vend">Vend</MenuItem>
              <MenuItem value="Reversal">Reversal</MenuItem>
              <MenuItem value="Free Token">Free Token</MenuItem>
              <MenuItem value="Engineering">Engineering</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={statusFilter}
              label="Status"
              onChange={(e) => setStatusFilter(e.target.value)}
            >
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
          <Button
            variant="contained"
            size="small"
            startIcon={<DownloadOutlined />}
            sx={{
              backgroundColor: colors.greenAccent[500],
              color: "#000",
              fontWeight: 600,
              "&:hover": { backgroundColor: colors.greenAccent[600] },
            }}
          >
            Export
          </Button>
        </Box>

        {/* ---- ROW 3: Transaction table (span 12, span 5) ---- */}
        <Box
          gridColumn="span 12"
          gridRow="span 5"
          backgroundColor={colors.primary[400]}
          borderRadius="4px"
          overflow="auto"
        >
          <TableContainer sx={{ maxHeight: "100%" }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {[
                    "Ref",
                    "Date/Time",
                    "Customer",
                    "Meter No",
                    "Amount",
                    "kWh",
                    "Token",
                    "Type",
                    "Status",
                    "Actions",
                  ].map((h) => (
                    <TableCell
                      key={h}
                      sx={{
                        backgroundColor: colors.primary[400],
                        color: colors.grey[100],
                        fontWeight: 700,
                        borderBottom: `1px solid ${colors.grey[700]}`,
                        ...(h === "Amount" || h === "kWh"
                          ? { textAlign: "right" }
                          : {}),
                        ...(h === "Actions" ? { textAlign: "center" } : {}),
                      }}
                    >
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((t) => (
                  <TableRow key={t.id} hover>
                    <TableCell
                      sx={{
                        fontFamily: "monospace",
                        fontSize: "0.78rem",
                        color: colors.grey[100],
                        borderBottom: `1px solid ${colors.grey[800]}`,
                      }}
                    >
                      {t.refNo}
                    </TableCell>
                    <TableCell
                      sx={{
                        fontSize: "0.78rem",
                        whiteSpace: "nowrap",
                        color: colors.grey[200],
                        borderBottom: `1px solid ${colors.grey[800]}`,
                      }}
                    >
                      {formatDateTime(t.dateTime)}
                    </TableCell>
                    <TableCell
                      sx={{
                        color: colors.grey[100],
                        fontWeight: 600,
                        borderBottom: `1px solid ${colors.grey[800]}`,
                      }}
                    >
                      {t.customerName}
                    </TableCell>
                    <TableCell
                      sx={{
                        fontFamily: "monospace",
                        fontSize: "0.78rem",
                        color: colors.grey[200],
                        borderBottom: `1px solid ${colors.grey[800]}`,
                      }}
                    >
                      {t.meterNo}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        fontWeight: 600,
                        color: colors.grey[100],
                        borderBottom: `1px solid ${colors.grey[800]}`,
                      }}
                    >
                      {fmtCurrency(t.amount)}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        color: colors.grey[200],
                        borderBottom: `1px solid ${colors.grey[800]}`,
                      }}
                    >
                      {t.kWh.toFixed(2)}
                    </TableCell>
                    <TableCell
                      sx={{
                        fontFamily: "monospace",
                        fontSize: "0.72rem",
                        color: colors.grey[300],
                        borderBottom: `1px solid ${colors.grey[800]}`,
                      }}
                    >
                      {t.token.substring(0, 8)}...
                    </TableCell>
                    <TableCell
                      sx={{
                        borderBottom: `1px solid ${colors.grey[800]}`,
                      }}
                    >
                      <Chip
                        label={t.type}
                        size="small"
                        sx={{
                          backgroundColor: `${getTypeColor(t.type)}22`,
                          color: getTypeColor(t.type),
                          fontWeight: 600,
                          fontSize: "0.7rem",
                        }}
                      />
                    </TableCell>
                    <TableCell
                      sx={{
                        borderBottom: `1px solid ${colors.grey[800]}`,
                      }}
                    >
                      <Chip
                        label={t.status}
                        size="small"
                        sx={{
                          backgroundColor: `${getStatusColor(t.status)}22`,
                          color: getStatusColor(t.status),
                          fontWeight: 600,
                          fontSize: "0.7rem",
                        }}
                      />
                    </TableCell>
                    <TableCell
                      align="center"
                      sx={{
                        borderBottom: `1px solid ${colors.grey[800]}`,
                      }}
                    >
                      <Box
                        display="flex"
                        justifyContent="center"
                        gap="4px"
                      >
                        <Tooltip title="Reprint">
                          <IconButton
                            size="small"
                            sx={{ color: colors.grey[400] }}
                          >
                            <PrintOutlined fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {t.type === "Vend" && t.status === "Completed" && (
                          <Tooltip title="Reverse">
                            <IconButton
                              size="small"
                              sx={{ color: colors.redAccent[500] }}
                              onClick={() => handleReverseClick(t)}
                            >
                              <UndoOutlined fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      align="center"
                      sx={{ py: 4, color: colors.grey[500] }}
                    >
                      No transactions match the current filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </Box>

      {/* ---- Reversal Confirmation Dialog ---- */}
      <Dialog
        open={reverseDialogOpen}
        onClose={handleReverseCancel}
        PaperProps={{
          sx: {
            backgroundColor: colors.primary[400],
            borderRadius: 2,
          },
        }}
      >
        <DialogTitle
          sx={{ color: colors.grey[100], fontWeight: 700 }}
        >
          Confirm Reversal
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: colors.grey[300], mb: 2 }}>
            You are about to reverse transaction{" "}
            <strong style={{ color: colors.grey[100] }}>
              {reverseTarget?.refNo}
            </strong>{" "}
            for customer{" "}
            <strong style={{ color: colors.grey[100] }}>
              {reverseTarget?.customerName}
            </strong>{" "}
            ({reverseTarget ? fmtCurrency(reverseTarget.amount) : ""}).
          </DialogContentText>
          <DialogContentText sx={{ color: colors.grey[300], mb: 2 }}>
            This action cannot be undone. Please provide a reason for the
            reversal.
          </DialogContentText>
          <TextField
            autoFocus
            fullWidth
            label="Reason for reversal"
            value={reverseReason}
            onChange={(e) => setReverseReason(e.target.value)}
            multiline
            rows={2}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleReverseCancel} variant="outlined" size="small">
            Cancel
          </Button>
          <Button
            onClick={handleReverseConfirm}
            variant="contained"
            color="error"
            size="small"
            disabled={!reverseReason.trim()}
            startIcon={<UndoOutlined />}
          >
            Reverse Transaction
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
