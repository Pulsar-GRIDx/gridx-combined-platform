import { useState } from "react";
import {
  Box,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Snackbar,
  Alert,
  useTheme,
} from "@mui/material";
import {
  TodayOutlined,
  MapOutlined,
  StorefrontOutlined,
  ElectricMeterOutlined,
  TokenOutlined,
  SecurityOutlined,
  DownloadOutlined,
  ArrowBackOutlined,
} from "@mui/icons-material";
import { tokens } from "../theme";
import Header from "../components/Header";
import { vendingAPI } from "../services/api";

// ---- Report types ----
const reportTypes = [
  {
    id: "daily",
    label: "Daily Sales",
    description: "Revenue breakdown by day with vendor splits and payment method summaries.",
    icon: <TodayOutlined sx={{ fontSize: 36 }} />,
    fetch: () => vendingAPI.getDailySalesReport({ from: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0] }),
    columns: ["date", "transactions", "revenue", "totalKwh", "uniqueMeters"],
    headers: ["Date", "Transactions", "Revenue (N$)", "Total kWh", "Unique Meters"],
  },
  {
    id: "area",
    label: "Revenue by Area",
    description: "Geographic distribution of revenue across all service areas and suburbs.",
    icon: <MapOutlined sx={{ fontSize: 36 }} />,
    fetch: () => vendingAPI.getRevenueByAreaReport(),
    columns: ["area", "transactions", "revenue", "totalKwh"],
    headers: ["Area", "Transactions", "Revenue (N$)", "Total kWh"],
  },
  {
    id: "vendor",
    label: "Vendor Performance",
    description: "Commission tracking, transaction volumes, and KPIs per vendor point.",
    icon: <StorefrontOutlined sx={{ fontSize: 36 }} />,
    fetch: () => vendingAPI.getVendorPerformanceReport(),
    columns: ["name", "transactions", "revenue", "totalKwh", "commissionRate", "commission"],
    headers: ["Vendor", "Transactions", "Revenue (N$)", "Total kWh", "Comm %", "Commission (N$)"],
  },
  {
    id: "meter",
    label: "Meter Status",
    description: "Online/offline/tampered meter counts, connectivity health, and alerts.",
    icon: <ElectricMeterOutlined sx={{ fontSize: 36 }} />,
    fetch: () => vendingAPI.getMeterStatusReport(),
    columns: ["status", "count"],
    headers: ["Status", "Count"],
  },
  {
    id: "token",
    label: "Token Analysis",
    description: "STS token generation rates, consumption patterns, and reversal statistics.",
    icon: <TokenOutlined sx={{ fontSize: 36 }} />,
    fetch: () => vendingAPI.getTokenAnalysisReport(),
    columns: ["type", "status", "count", "totalAmount", "totalKwh"],
    headers: ["Type", "Status", "Count", "Total Amount (N$)", "Total kWh"],
  },
  {
    id: "audit",
    label: "System Audit",
    description: "User activity logs, configuration changes, and security event trail.",
    icon: <SecurityOutlined sx={{ fontSize: 36 }} />,
    fetch: () => vendingAPI.getSystemAuditReport({ limit: 200 }),
    columns: ["timestamp", "type", "event", "user", "detail"],
    headers: ["Timestamp", "Type", "Event", "User", "Details"],
  },
];

const fmtN = (v) => typeof v === 'number' ? Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : (v || '-');

export default function Reports() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const [activeReport, setActiveReport] = useState(null);
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "info" });

  const handleGenerate = async (rt) => {
    setLoading(true);
    setActiveReport(rt);
    try {
      const res = await rt.fetch();
      setReportData(res.success ? (res.data || []) : []);
    } catch (err) {
      setSnackbar({ open: true, message: err.message || "Failed to generate report", severity: "error" });
      setReportData([]);
    }
    setLoading(false);
  };

  const handleExportCSV = () => {
    if (!activeReport || reportData.length === 0) return;
    const headers = activeReport.headers.join(',');
    const rows = reportData.map(row => activeReport.columns.map(c => `"${row[c] ?? ''}"`).join(','));
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeReport.id}-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (activeReport) {
    return (
      <Box m="20px">
        <Box display="flex" alignItems="center" gap="12px" mb="20px">
          <Button
            startIcon={<ArrowBackOutlined />}
            onClick={() => { setActiveReport(null); setReportData([]); }}
            sx={{ color: colors.grey[100] }}
          >
            Back
          </Button>
          <Typography variant="h4" fontWeight="bold" color={colors.grey[100]}>
            {activeReport.label} Report
          </Typography>
          {reportData.length > 0 && (
            <Button
              startIcon={<DownloadOutlined />}
              onClick={handleExportCSV}
              variant="outlined"
              size="small"
              sx={{ ml: "auto", borderColor: colors.greenAccent[500], color: colors.greenAccent[500] }}
            >
              Export CSV
            </Button>
          )}
        </Box>

        {loading ? (
          <Box display="flex" justifyContent="center" mt="40px"><CircularProgress sx={{ color: colors.greenAccent[500] }} /></Box>
        ) : reportData.length === 0 ? (
          <Typography color={colors.grey[300]} textAlign="center" mt="40px">No data available for this report period.</Typography>
        ) : (
          <TableContainer sx={{ maxHeight: "calc(100vh - 200px)" }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  {activeReport.headers.map((h, i) => (
                    <TableCell key={i} sx={{ backgroundColor: colors.primary[400], color: colors.grey[100], fontWeight: 600 }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {reportData.map((row, ri) => (
                  <TableRow key={ri} sx={{ "&:hover": { backgroundColor: `${colors.primary[400]}80` } }}>
                    {activeReport.columns.map((col, ci) => (
                      <TableCell key={ci} sx={{ color: colors.grey[100], borderBottom: `1px solid ${colors.primary[300]}` }}>
                        {['revenue', 'totalAmount', 'commission', 'totalKwh'].includes(col) ? fmtN(row[col]) : (row[col] ?? '-')}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
          <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>{snackbar.message}</Alert>
        </Snackbar>
      </Box>
    );
  }

  return (
    <Box m="20px">
      <Header title="REPORTS" subtitle="System Reports and Analytics" />

      <Box
        display="grid"
        gridTemplateColumns="repeat(12, 1fr)"
        gridAutoRows="140px"
        gap="5px"
      >
        {reportTypes.map((rt) => (
          <Box
            key={rt.id}
            gridColumn="span 4"
            gridRow="span 2"
            backgroundColor={colors.primary[400]}
            borderRadius="4px"
            p="20px"
            display="flex"
            flexDirection="column"
            justifyContent="space-between"
          >
            <Box>
              <Box
                display="flex"
                alignItems="center"
                gap="12px"
                mb="12px"
              >
                <Box sx={{ color: colors.greenAccent[500] }}>{rt.icon}</Box>
                <Typography
                  variant="h5"
                  color={colors.grey[100]}
                  fontWeight="bold"
                >
                  {rt.label}
                </Typography>
              </Box>
              <Typography variant="body2" color={colors.grey[300]}>
                {rt.description}
              </Typography>
            </Box>

            <Button
              variant="contained"
              fullWidth
              onClick={() => handleGenerate(rt)}
              sx={{
                mt: "15px",
                backgroundColor: colors.greenAccent[500],
                color: "#000",
                fontWeight: 600,
                textTransform: "none",
                "&:hover": { backgroundColor: colors.greenAccent[600] },
              }}
            >
              Generate
            </Button>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
