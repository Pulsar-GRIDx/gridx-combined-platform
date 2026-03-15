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
} from "@mui/icons-material";
import { tokens } from "../theme";
import Header from "../components/Header";
import { vendingAPI } from "../services/api";
import { salesBatches as mockSalesBatches, bankingBatches as mockBankingBatches, vendors as mockVendors } from "../services/mockData";

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
  return `N$ ${Number(v).toLocaleString("en-NA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ---- Component --------------------------------------------------------------

export default function Batches() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);

  // Sales batch dialog
  const [salesDialogOpen, setSalesDialogOpen] = useState(false);
  const [newBatchVendor, setNewBatchVendor] = useState("");
  const [newBatchNotes, setNewBatchNotes] = useState("");

  // Banking batch dialog
  const [bankDialogOpen, setBankDialogOpen] = useState(false);
  const [bankSalesBatch, setBankSalesBatch] = useState("");
  const [bankRef, setBankRef] = useState("");
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });

  // Local copies
  const [localSalesBatches, setLocalSalesBatches] = useState(mockSalesBatches);
  const [localBankingBatches, setLocalBankingBatches] = useState(mockBankingBatches);
  const [vendors, setVendors] = useState(mockVendors);

  // Load from API
  useEffect(() => {
    vendingAPI.getSalesBatches().then(r => {
      if (r.success && r.data?.length > 0) setLocalSalesBatches(r.data);
    }).catch(() => {});
    vendingAPI.getBankingBatches().then(r => {
      if (r.success && r.data?.length > 0) setLocalBankingBatches(r.data);
    }).catch(() => {});
    vendingAPI.getVendors().then(r => {
      if (r.success && r.data?.length > 0) setVendors(r.data);
    }).catch(() => {});
  }, []);

  // Derived stats
  const openBatches = localSalesBatches.filter(
    (b) => b.status === "Open"
  ).length;
  const totalSalesRevenue = localSalesBatches.reduce(
    (s, b) => s + Number(b.totalAmount || 0),
    0
  );
  const closedSalesBatches = localSalesBatches.filter(
    (b) => b.status === "Closed"
  );
  const selectedClosedBatch = closedSalesBatches.find(
    (b) => String(b.id) === String(bankSalesBatch)
  );

  // Handlers
  const handleOpenNewBatch = () => {
    setNewBatchVendor("");
    setNewBatchNotes("");
    setSalesDialogOpen(true);
  };

  const handleCreateSalesBatch = async () => {
    if (!newBatchVendor) return;
    try {
      const res = await vendingAPI.createSalesBatch({ vendorId: newBatchVendor, notes: newBatchNotes });
      if (res.success) {
        setSnackbar({ open: true, message: "Sales batch created", severity: "success" });
        // Refresh
        const r = await vendingAPI.getSalesBatches();
        if (r.success) setLocalSalesBatches(r.data);
      }
    } catch {
      // Fallback local
      const vendor = vendors.find((v) => String(v.id) === String(newBatchVendor));
      const newBatch = {
        id: `SB-${String(localSalesBatches.length + 1).padStart(3, "0")}`,
        batchNo: `BATCH-${String(localSalesBatches.length + 1).padStart(3, "0")}`,
        vendorId: newBatchVendor,
        vendorName: vendor?.name || 'Unknown',
        status: "Open",
        transactionCount: 0,
        totalAmount: 0,
        openedAt: new Date().toISOString(),
        closedAt: null,
        notes: newBatchNotes,
      };
      setLocalSalesBatches((prev) => [...prev, newBatch]);
    }
    setSalesDialogOpen(false);
  };

  const handleCloseBatch = async (batchId) => {
    try {
      await vendingAPI.closeSalesBatch(batchId);
      const r = await vendingAPI.getSalesBatches();
      if (r.success) setLocalSalesBatches(r.data);
    } catch {
      setLocalSalesBatches((prev) =>
        prev.map((b) =>
          String(b.id) === String(batchId)
            ? { ...b, status: "Closed", closedAt: new Date().toISOString() }
            : b
        )
      );
    }
  };

  const handleOpenBankDialog = () => {
    setBankSalesBatch("");
    setBankRef("");
    setBankDialogOpen(true);
  };

  const handleCreateBankingBatch = async () => {
    if (!bankSalesBatch || !bankRef) return;
    try {
      const res = await vendingAPI.createBankingBatch({ salesBatchId: bankSalesBatch, bankRef });
      if (res.success) {
        setSnackbar({ open: true, message: "Banking batch created", severity: "success" });
        const r = await vendingAPI.getBankingBatches();
        if (r.success) setLocalBankingBatches(r.data);
      }
    } catch {
      const newBank = {
        id: `BB-${String(localBankingBatches.length + 1).padStart(3, "0")}`,
        batchNo: `BANK-2026-${String(localBankingBatches.length + 1).padStart(3, "0")}`,
        salesBatchId: bankSalesBatch,
        bankRef,
        status: "Pending",
        totalAmount: selectedClosedBatch?.totalAmount || 0,
        createdAt: new Date().toISOString(),
      };
      setLocalBankingBatches((prev) => [...prev, newBank]);
    }
    setBankDialogOpen(false);
  };

  const textFieldSx = {
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

  const selectSx = {
    color: colors.grey[100],
    backgroundColor: "rgba(0,0,0,0.2)",
    "& fieldset": { borderColor: colors.primary[300] },
    "&:hover fieldset": { borderColor: colors.greenAccent[700] },
    "&.Mui-focused fieldset": { borderColor: colors.greenAccent[500] },
    "& .MuiSelect-icon": { color: colors.grey[300] },
  };

  const headerCellSx = {
    color: colors.grey[300],
    fontWeight: 600,
    fontSize: "0.75rem",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    borderBottom: `1px solid ${colors.primary[300]}`,
    whiteSpace: "nowrap",
  };

  const bodyCellSx = {
    color: colors.grey[100],
    borderBottom: `1px solid ${colors.primary[300]}`,
    fontSize: "0.85rem",
  };

  function salesStatusChip(status) {
    const isOpen = status === "Open";
    return (
      <Chip
        label={status}
        size="small"
        sx={{
          fontWeight: 600,
          color: colors.grey[100],
          backgroundColor: isOpen
            ? colors.greenAccent[900]
            : "rgba(158,158,158,0.15)",
          border: `1px solid ${
            isOpen ? colors.greenAccent[500] : colors.grey[400]
          }`,
        }}
      />
    );
  }

  function bankingStatusChip(status) {
    const map = {
      Pending: {
        bg: colors.yellowAccent[900],
        border: colors.yellowAccent[500],
      },
      Submitted: {
        bg: colors.blueAccent[900],
        border: colors.blueAccent[500],
      },
      Reconciled: {
        bg: colors.greenAccent[900],
        border: colors.greenAccent[500],
      },
    };
    const c = map[status] || map.Pending;
    return (
      <Chip
        label={status}
        size="small"
        sx={{
          fontWeight: 600,
          color: colors.grey[100],
          backgroundColor: c.bg,
          border: `1px solid ${c.border}`,
        }}
      />
    );
  }

  return (
    <Box m="20px">
      <Header
        title="BATCH MANAGEMENT"
        subtitle="Sales and Banking Batch Operations"
      />

      <Box
        display="grid"
        gridTemplateColumns="repeat(12, 1fr)"
        gridAutoRows="140px"
        gap="5px"
      >
        {/* ---- Stat: Sales Batches (span 3) ---- */}
        <Box
          gridColumn="span 3"
          backgroundColor={colors.primary[400]}
          borderRadius="4px"
          display="flex"
          alignItems="center"
          justifyContent="center"
          flexDirection="column"
          p="15px"
        >
          <ReceiptLongOutlined
            sx={{ color: colors.greenAccent[500], fontSize: 32, mb: "8px" }}
          />
          <Typography variant="h4" fontWeight="700" color={colors.grey[100]}>
            {localSalesBatches.length}
          </Typography>
          <Typography variant="body2" color={colors.greenAccent[500]}>
            Sales Batches
          </Typography>
        </Box>

        {/* ---- Stat: Banking Batches (span 3) ---- */}
        <Box
          gridColumn="span 3"
          backgroundColor={colors.primary[400]}
          borderRadius="4px"
          display="flex"
          alignItems="center"
          justifyContent="center"
          flexDirection="column"
          p="15px"
        >
          <AccountBalanceOutlined
            sx={{ color: colors.blueAccent[500], fontSize: 32, mb: "8px" }}
          />
          <Typography variant="h4" fontWeight="700" color={colors.grey[100]}>
            {localBankingBatches.length}
          </Typography>
          <Typography variant="body2" color={colors.blueAccent[400]}>
            Banking Batches
          </Typography>
        </Box>

        {/* ---- Stat: Open Batches (span 3) ---- */}
        <Box
          gridColumn="span 3"
          backgroundColor={colors.primary[400]}
          borderRadius="4px"
          display="flex"
          alignItems="center"
          justifyContent="center"
          flexDirection="column"
          p="15px"
        >
          <FolderOpenOutlined
            sx={{ color: colors.yellowAccent[500], fontSize: 32, mb: "8px" }}
          />
          <Typography variant="h4" fontWeight="700" color={colors.grey[100]}>
            {openBatches}
          </Typography>
          <Typography variant="body2" color={colors.yellowAccent[500]}>
            Open Batches
          </Typography>
        </Box>

        {/* ---- Stat: Total Revenue (span 3) ---- */}
        <Box
          gridColumn="span 3"
          backgroundColor={colors.primary[400]}
          borderRadius="4px"
          display="flex"
          alignItems="center"
          justifyContent="center"
          flexDirection="column"
          p="15px"
        >
          <AttachMoneyOutlined
            sx={{ color: colors.greenAccent[500], fontSize: 32, mb: "8px" }}
          />
          <Typography variant="h4" fontWeight="700" color={colors.grey[100]}>
            {fmtN$(totalSalesRevenue)}
          </Typography>
          <Typography variant="body2" color={colors.greenAccent[500]}>
            Total Revenue
          </Typography>
        </Box>

        {/* ---- Sales Batches Table (span 7, span 4) ---- */}
        <Box
          gridColumn="span 7"
          gridRow="span 4"
          backgroundColor={colors.primary[400]}
          borderRadius="4px"
          overflow="auto"
        >
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="center"
            p="15px"
            borderBottom={`1px solid ${colors.primary[300]}`}
          >
            <Typography
              variant="h5"
              fontWeight="600"
              color={colors.grey[100]}
            >
              Sales Batches
            </Typography>
            <Button
              variant="contained"
              size="small"
              startIcon={<AddOutlined />}
              onClick={handleOpenNewBatch}
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

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={headerCellSx}>Batch ID</TableCell>
                <TableCell sx={headerCellSx}>Vendor</TableCell>
                <TableCell sx={headerCellSx}>Status</TableCell>
                <TableCell sx={headerCellSx} align="right">
                  Transactions
                </TableCell>
                <TableCell sx={headerCellSx} align="right">
                  Total Amount
                </TableCell>
                <TableCell sx={headerCellSx}>Opened</TableCell>
                <TableCell sx={headerCellSx}>Closed</TableCell>
                <TableCell sx={headerCellSx} align="center">
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {localSalesBatches.map((batch) => (
                <TableRow
                  key={batch.id}
                  sx={{
                    "&:hover": {
                      backgroundColor: `${colors.primary[300]}44`,
                    },
                  }}
                >
                  <TableCell
                    sx={{
                      ...bodyCellSx,
                      fontFamily: "monospace",
                      fontWeight: 600,
                    }}
                  >
                    {batch.batchNo}
                  </TableCell>
                  <TableCell sx={bodyCellSx}>{batch.vendorName}</TableCell>
                  <TableCell sx={bodyCellSx}>
                    {salesStatusChip(batch.status)}
                  </TableCell>
                  <TableCell sx={bodyCellSx} align="right">
                    {batch.transactionCount.toLocaleString()}
                  </TableCell>
                  <TableCell sx={bodyCellSx} align="right">
                    {fmtN$(batch.totalAmount)}
                  </TableCell>
                  <TableCell sx={{ ...bodyCellSx, whiteSpace: "nowrap" }}>
                    {fmtDate(batch.openedAt)}
                  </TableCell>
                  <TableCell sx={{ ...bodyCellSx, whiteSpace: "nowrap" }}>
                    {fmtDate(batch.closedAt)}
                  </TableCell>
                  <TableCell sx={bodyCellSx} align="center">
                    {batch.status === "Open" && (
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<LockOutlined sx={{ fontSize: 16 }} />}
                        onClick={() => handleCloseBatch(batch.id)}
                        sx={{
                          color: colors.yellowAccent[500],
                          borderColor: colors.yellowAccent[700],
                          fontSize: "0.75rem",
                          textTransform: "none",
                          "&:hover": {
                            borderColor: colors.yellowAccent[500],
                            backgroundColor: colors.yellowAccent[900],
                          },
                        }}
                      >
                        Close Batch
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>

        {/* ---- Banking Batches Table (span 5, span 4) ---- */}
        <Box
          gridColumn="span 5"
          gridRow="span 4"
          backgroundColor={colors.primary[400]}
          borderRadius="4px"
          overflow="auto"
        >
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="center"
            p="15px"
            borderBottom={`1px solid ${colors.primary[300]}`}
          >
            <Typography
              variant="h5"
              fontWeight="600"
              color={colors.grey[100]}
            >
              Banking Batches
            </Typography>
            <Button
              variant="contained"
              size="small"
              startIcon={<AccountBalanceOutlined />}
              onClick={handleOpenBankDialog}
              sx={{
                fontWeight: 600,
                backgroundColor: colors.greenAccent[600],
                color: colors.primary[500],
                "&:hover": { backgroundColor: colors.greenAccent[700] },
              }}
            >
              Create
            </Button>
          </Box>

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={headerCellSx}>Batch ID</TableCell>
                <TableCell sx={headerCellSx}>Sales Ref</TableCell>
                <TableCell sx={headerCellSx}>Bank Ref</TableCell>
                <TableCell sx={headerCellSx}>Status</TableCell>
                <TableCell sx={headerCellSx} align="right">
                  Amount
                </TableCell>
                <TableCell sx={headerCellSx}>Created</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {localBankingBatches.map((batch) => (
                <TableRow
                  key={batch.id}
                  sx={{
                    "&:hover": {
                      backgroundColor: `${colors.primary[300]}44`,
                    },
                  }}
                >
                  <TableCell
                    sx={{
                      ...bodyCellSx,
                      fontFamily: "monospace",
                      fontWeight: 600,
                    }}
                  >
                    {batch.batchNo}
                  </TableCell>
                  <TableCell sx={{ ...bodyCellSx, fontFamily: "monospace" }}>
                    {batch.salesBatchId}
                  </TableCell>
                  <TableCell sx={{ ...bodyCellSx, fontFamily: "monospace" }}>
                    {batch.bankRef}
                  </TableCell>
                  <TableCell sx={bodyCellSx}>
                    {bankingStatusChip(batch.status)}
                  </TableCell>
                  <TableCell sx={bodyCellSx} align="right">
                    {fmtN$(batch.totalAmount)}
                  </TableCell>
                  <TableCell sx={{ ...bodyCellSx, whiteSpace: "nowrap" }}>
                    {fmtDate(batch.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Box>

      {/* ---- Open New Sales Batch Dialog ---- */}
      <Dialog
        open={salesDialogOpen}
        onClose={() => setSalesDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            backgroundColor: colors.primary[400],
            border: `1px solid ${colors.primary[300]}`,
            color: colors.grey[100],
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 600, color: colors.grey[100] }}>
          Open New Sales Batch
        </DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 1, mb: 2 }}>
            <InputLabel
              sx={{
                color: colors.grey[300],
                "&.Mui-focused": { color: colors.greenAccent[500] },
              }}
            >
              Vendor
            </InputLabel>
            <Select
              value={newBatchVendor}
              label="Vendor"
              onChange={(e) => setNewBatchVendor(e.target.value)}
              sx={selectSx}
              MenuProps={{
                PaperProps: {
                  sx: {
                    backgroundColor: colors.primary[400],
                    color: colors.grey[100],
                  },
                },
              }}
            >
              {vendors
                .filter((v) => v.status === "Active")
                .map((v) => (
                  <MenuItem key={v.id} value={v.id}>
                    {v.name}
                  </MenuItem>
                ))}
            </Select>
          </FormControl>

          <TextField
            fullWidth
            label="Notes"
            multiline
            rows={3}
            value={newBatchNotes}
            onChange={(e) => setNewBatchNotes(e.target.value)}
            sx={textFieldSx}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setSalesDialogOpen(false)}
            sx={{ color: colors.grey[300] }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={!newBatchVendor}
            onClick={handleCreateSalesBatch}
            sx={{
              fontWeight: 600,
              backgroundColor: colors.greenAccent[600],
              color: colors.primary[500],
              "&:hover": { backgroundColor: colors.greenAccent[700] },
              "&.Mui-disabled": {
                backgroundColor: colors.primary[300],
                color: colors.grey[400],
              },
            }}
          >
            Open Batch
          </Button>
        </DialogActions>
      </Dialog>

      {/* ---- Create Banking Batch Dialog ---- */}
      <Dialog
        open={bankDialogOpen}
        onClose={() => setBankDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            backgroundColor: colors.primary[400],
            border: `1px solid ${colors.primary[300]}`,
            color: colors.grey[100],
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 600, color: colors.grey[100] }}>
          Create Banking Batch
        </DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 1, mb: 2 }}>
            <InputLabel
              sx={{
                color: colors.grey[300],
                "&.Mui-focused": { color: colors.greenAccent[500] },
              }}
            >
              Select Closed Sales Batch
            </InputLabel>
            <Select
              value={bankSalesBatch}
              label="Select Closed Sales Batch"
              onChange={(e) => setBankSalesBatch(e.target.value)}
              sx={selectSx}
              MenuProps={{
                PaperProps: {
                  sx: {
                    backgroundColor: colors.primary[400],
                    color: colors.grey[100],
                  },
                },
              }}
            >
              {closedSalesBatches.map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  {b.batchNo} -- {b.vendorName} ({fmtN$(b.totalAmount)})
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            fullWidth
            label="Bank Reference"
            placeholder="e.g. FNB-WHK-20260312-001"
            value={bankRef}
            onChange={(e) => setBankRef(e.target.value)}
            sx={{ ...textFieldSx, mb: 2 }}
          />

          <TextField
            fullWidth
            label="Total Amount"
            value={
              selectedClosedBatch ? fmtN$(selectedClosedBatch.totalAmount) : ""
            }
            InputProps={{ readOnly: true }}
            sx={{
              ...textFieldSx,
              "& .MuiOutlinedInput-root": {
                ...textFieldSx["& .MuiOutlinedInput-root"],
                backgroundColor: "rgba(0,0,0,0.35)",
              },
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setBankDialogOpen(false)}
            sx={{ color: colors.grey[300] }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={!bankSalesBatch || !bankRef}
            onClick={handleCreateBankingBatch}
            sx={{
              fontWeight: 600,
              backgroundColor: colors.greenAccent[600],
              color: colors.primary[500],
              "&:hover": { backgroundColor: colors.greenAccent[700] },
              "&.Mui-disabled": {
                backgroundColor: colors.primary[300],
                color: colors.grey[400],
              },
            }}
          >
            Submit
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
