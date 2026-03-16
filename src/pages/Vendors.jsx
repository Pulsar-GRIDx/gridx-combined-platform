import { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Divider,
  useTheme,
  Avatar,
  LinearProgress,
  IconButton,
  Tooltip,
  keyframes,
  CircularProgress,
} from "@mui/material";
import {
  StorefrontOutlined,
  PointOfSaleOutlined,
  AccountBalanceWalletOutlined,
  PercentOutlined,
  PersonOutlined,
  PhoneOutlined,
  AccessTimeOutlined,
  TrendingUpOutlined,
  LocationOnOutlined,
  ExpandMoreOutlined,
  ExpandLessOutlined,
  ElectricBoltOutlined,
  ReceiptLongOutlined,
} from "@mui/icons-material";
import { tokens } from "../theme";
import Header from "../components/Header";
import { vendingAPI } from "../services/api";
import { vendors as mockVendors } from "../services/mockData";

// ---- Animations ----
const pulseGlow = keyframes`
  0%, 100% { box-shadow: 0 0 0 0 rgba(76, 206, 172, 0.4); }
  50% { box-shadow: 0 0 20px 4px rgba(76, 206, 172, 0.15); }
`;

const slideUp = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
`;

const shimmer = keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;

// ---- Helpers ----
const fmtCurrency = (n) =>
  `N$ ${Number(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtShort = (n) => {
  if (n >= 1000000) return `N$ ${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `N$ ${(n / 1000).toFixed(0)}K`;
  return `N$ ${n}`;
};

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
    d.toLocaleTimeString("en-NA", { hour: "2-digit", minute: "2-digit" })
  );
}

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function getInitials(name) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
}

const vendorColors = [
  "#6870fa", "#4cceac", "#f2b705", "#db4f4a", "#a4a9fc", "#70d8bd",
];

// ---- Main Component ----
export default function Vendors() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const [expandedVendor, setExpandedVendor] = useState(null);
  const [vendors, setVendors] = useState(mockVendors);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    vendingAPI.getVendors().then(r => {
      if (r.success && r.data?.length > 0) setVendors(r.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Derived stats
  const totalVendors = vendors.length;
  const activeVendors = vendors.filter((v) => v.status === "Active").length;
  const totalSales = vendors.reduce((s, v) => s + Number(v.totalSales || 0), 0);
  const avgCommission =
    vendors.length > 0
      ? (
          vendors.reduce((s, v) => s + Number(v.commissionRate || 0), 0) / vendors.length
        ).toFixed(1)
      : "0";
  const totalTransactions = vendors.reduce((s, v) => s + Number(v.transactionCount || 0), 0);
  const maxSales = Math.max(...vendors.map((v) => Number(v.totalSales || 0)), 1);

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

  return (
    <Box m="20px">
      <Header title="VENDOR MANAGEMENT" subtitle="Vending Point Operators" />

      {/* ======== Stat Cards Row ======== */}
      <Box
        display="grid"
        gridTemplateColumns="repeat(12, 1fr)"
        gap="16px"
        mb="24px"
      >
        {/* Total Vendors */}
        <Box
          gridColumn="span 3"
          sx={{
            background: `linear-gradient(135deg, ${colors.primary[400]} 0%, ${colors.primary[500]} 100%)`,
            borderRadius: "12px",
            p: "20px",
            position: "relative",
            overflow: "hidden",
            border: `1px solid ${colors.primary[300]}40`,
            animation: `${slideUp} 0.4s ease-out`,
            "&::after": {
              content: '""',
              position: "absolute",
              top: -20,
              right: -20,
              width: 80,
              height: 80,
              borderRadius: "50%",
              background: `${colors.blueAccent[500]}15`,
            },
          }}
        >
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Box>
              <Typography variant="body2" color={colors.grey[300]} mb="4px">
                Total Vendors
              </Typography>
              <Typography variant="h3" fontWeight="700" color={colors.grey[100]}>
                {totalVendors}
              </Typography>
              <Typography variant="caption" color={colors.blueAccent[400]}>
                {activeVendors} active · {totalVendors - activeVendors} inactive
              </Typography>
            </Box>
            <Avatar
              sx={{
                bgcolor: `${colors.blueAccent[500]}20`,
                width: 48,
                height: 48,
              }}
            >
              <StorefrontOutlined sx={{ color: colors.blueAccent[400], fontSize: 24 }} />
            </Avatar>
          </Box>
        </Box>

        {/* Active Vendors */}
        <Box
          gridColumn="span 3"
          sx={{
            background: `linear-gradient(135deg, ${colors.primary[400]} 0%, ${colors.primary[500]} 100%)`,
            borderRadius: "12px",
            p: "20px",
            position: "relative",
            overflow: "hidden",
            border: `1px solid ${colors.primary[300]}40`,
            animation: `${slideUp} 0.5s ease-out`,
            "&::after": {
              content: '""',
              position: "absolute",
              top: -20,
              right: -20,
              width: 80,
              height: 80,
              borderRadius: "50%",
              background: `${colors.greenAccent[500]}15`,
            },
          }}
        >
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Box>
              <Typography variant="body2" color={colors.grey[300]} mb="4px">
                Active Now
              </Typography>
              <Typography variant="h3" fontWeight="700" color={colors.greenAccent[400]}>
                {activeVendors}
              </Typography>
              <Box display="flex" alignItems="center" gap="4px" mt="2px">
                <Box
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    bgcolor: colors.greenAccent[500],
                    animation: `${pulseGlow} 2s ease-in-out infinite`,
                  }}
                />
                <Typography variant="caption" color={colors.greenAccent[500]}>
                  All systems operational
                </Typography>
              </Box>
            </Box>
            <Avatar
              sx={{
                bgcolor: `${colors.greenAccent[500]}20`,
                width: 48,
                height: 48,
              }}
            >
              <PointOfSaleOutlined sx={{ color: colors.greenAccent[400], fontSize: 24 }} />
            </Avatar>
          </Box>
        </Box>

        {/* Total Sales */}
        <Box
          gridColumn="span 3"
          sx={{
            background: `linear-gradient(135deg, ${colors.primary[400]} 0%, ${colors.primary[500]} 100%)`,
            borderRadius: "12px",
            p: "20px",
            position: "relative",
            overflow: "hidden",
            border: `1px solid ${colors.primary[300]}40`,
            animation: `${slideUp} 0.6s ease-out`,
            "&::after": {
              content: '""',
              position: "absolute",
              top: -20,
              right: -20,
              width: 80,
              height: 80,
              borderRadius: "50%",
              background: `${colors.greenAccent[500]}15`,
            },
          }}
        >
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Box>
              <Typography variant="body2" color={colors.grey[300]} mb="4px">
                Total Sales
              </Typography>
              <Typography variant="h3" fontWeight="700" color={colors.grey[100]}>
                {fmtShort(totalSales)}
              </Typography>
              <Box display="flex" alignItems="center" gap="4px" mt="2px">
                <TrendingUpOutlined sx={{ fontSize: 14, color: colors.greenAccent[500] }} />
                <Typography variant="caption" color={colors.greenAccent[500]}>
                  {fmt(totalTransactions)} transactions
                </Typography>
              </Box>
            </Box>
            <Avatar
              sx={{
                bgcolor: `${colors.greenAccent[500]}20`,
                width: 48,
                height: 48,
              }}
            >
              <AccountBalanceWalletOutlined sx={{ color: colors.greenAccent[400], fontSize: 24 }} />
            </Avatar>
          </Box>
        </Box>

        {/* Avg Commission */}
        <Box
          gridColumn="span 3"
          sx={{
            background: `linear-gradient(135deg, ${colors.primary[400]} 0%, ${colors.primary[500]} 100%)`,
            borderRadius: "12px",
            p: "20px",
            position: "relative",
            overflow: "hidden",
            border: `1px solid ${colors.primary[300]}40`,
            animation: `${slideUp} 0.7s ease-out`,
            "&::after": {
              content: '""',
              position: "absolute",
              top: -20,
              right: -20,
              width: 80,
              height: 80,
              borderRadius: "50%",
              background: `${colors.yellowAccent[500]}15`,
            },
          }}
        >
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Box>
              <Typography variant="body2" color={colors.grey[300]} mb="4px">
                Avg Commission
              </Typography>
              <Typography variant="h3" fontWeight="700" color={colors.yellowAccent[400]}>
                {avgCommission}%
              </Typography>
              <Typography variant="caption" color={colors.grey[400]}>
                across all vendors
              </Typography>
            </Box>
            <Avatar
              sx={{
                bgcolor: `${colors.yellowAccent[500]}20`,
                width: 48,
                height: 48,
              }}
            >
              <PercentOutlined sx={{ color: colors.yellowAccent[400], fontSize: 24 }} />
            </Avatar>
          </Box>
        </Box>
      </Box>

      {/* ======== Vendor Cards Grid ======== */}
      <Typography variant="h5" fontWeight="600" color={colors.grey[100]} mb="16px">
        Vendor Directory
      </Typography>

      <Box
        display="grid"
        gridTemplateColumns="repeat(auto-fill, minmax(380px, 1fr))"
        gap="16px"
        mb="24px"
      >
        {vendors.map((v, idx) => {
          const color = vendorColors[idx % vendorColors.length];
          const salesPct = (v.totalSales / maxSales) * 100;
          const commAmt = v.totalSales * (v.commissionRate / 100);
          const isExpanded = expandedVendor === v.id;

          return (
            <Box
              key={v.id}
              sx={{
                background: colors.primary[400],
                borderRadius: "12px",
                border: `1px solid ${colors.primary[300]}40`,
                overflow: "hidden",
                transition: "all 0.3s ease",
                animation: `${slideUp} ${0.3 + idx * 0.08}s ease-out`,
                "&:hover": {
                  border: `1px solid ${color}40`,
                  transform: "translateY(-2px)",
                  boxShadow: `0 8px 32px ${color}10`,
                },
              }}
            >
              {/* Card Header */}
              <Box
                sx={{
                  background: `linear-gradient(135deg, ${color}15 0%, transparent 100%)`,
                  borderBottom: `1px solid ${colors.primary[300]}40`,
                  p: "16px 20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Box display="flex" alignItems="center" gap="12px">
                  <Avatar
                    sx={{
                      bgcolor: `${color}25`,
                      width: 42,
                      height: 42,
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      color: color,
                      border: `2px solid ${color}40`,
                    }}
                  >
                    {getInitials(v.name)}
                  </Avatar>
                  <Box>
                    <Typography
                      variant="body1"
                      fontWeight="600"
                      color={colors.grey[100]}
                      sx={{ lineHeight: 1.2 }}
                    >
                      {v.name}
                    </Typography>
                    <Box display="flex" alignItems="center" gap="4px" mt="2px">
                      <LocationOnOutlined sx={{ fontSize: 12, color: colors.grey[400] }} />
                      <Typography variant="caption" color={colors.grey[400]}>
                        {v.location}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
                <Box display="flex" alignItems="center" gap="8px">
                  <Chip
                    label={v.status}
                    size="small"
                    sx={{
                      backgroundColor:
                        v.status === "Active"
                          ? `${colors.greenAccent[500]}20`
                          : "rgba(108,117,125,0.15)",
                      color:
                        v.status === "Active"
                          ? colors.greenAccent[400]
                          : colors.grey[400],
                      fontWeight: 600,
                      fontSize: "0.7rem",
                      border: `1px solid ${
                        v.status === "Active"
                          ? `${colors.greenAccent[500]}30`
                          : "rgba(108,117,125,0.2)"
                      }`,
                      "& .MuiChip-label": { px: "8px" },
                    }}
                    icon={
                      v.status === "Active" ? (
                        <Box
                          sx={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            bgcolor: colors.greenAccent[500],
                            ml: "6px",
                          }}
                        />
                      ) : undefined
                    }
                  />
                </Box>
              </Box>

              {/* Card Body - Key Metrics */}
              <Box p="16px 20px">
                {/* Sales bar */}
                <Box mb="14px">
                  <Box display="flex" justifyContent="space-between" mb="6px">
                    <Typography variant="caption" color={colors.grey[300]} fontWeight="500">
                      TOTAL SALES
                    </Typography>
                    <Typography variant="body2" fontWeight="700" color={colors.grey[100]}>
                      {fmtCurrency(v.totalSales)}
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={salesPct}
                    sx={{
                      height: 6,
                      borderRadius: 3,
                      bgcolor: `${color}15`,
                      "& .MuiLinearProgress-bar": {
                        borderRadius: 3,
                        background: `linear-gradient(90deg, ${color}90, ${color})`,
                      },
                    }}
                  />
                </Box>

                {/* Metric chips row */}
                <Box display="flex" gap="8px" flexWrap="wrap">
                  <Box
                    sx={{
                      flex: 1,
                      minWidth: 90,
                      bgcolor: `${colors.primary[500]}`,
                      borderRadius: "8px",
                      p: "10px 12px",
                      textAlign: "center",
                      border: `1px solid ${colors.primary[300]}40`,
                    }}
                  >
                    <ElectricBoltOutlined
                      sx={{ fontSize: 16, color: colors.blueAccent[400], mb: "2px" }}
                    />
                    <Typography
                      variant="body2"
                      fontWeight="700"
                      color={colors.grey[100]}
                      display="block"
                    >
                      {fmt(v.transactionCount)}
                    </Typography>
                    <Typography variant="caption" color={colors.grey[400]} fontSize="0.65rem">
                      Transactions
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      flex: 1,
                      minWidth: 90,
                      bgcolor: `${colors.primary[500]}`,
                      borderRadius: "8px",
                      p: "10px 12px",
                      textAlign: "center",
                      border: `1px solid ${colors.primary[300]}40`,
                    }}
                  >
                    <AccountBalanceWalletOutlined
                      sx={{ fontSize: 16, color: colors.greenAccent[400], mb: "2px" }}
                    />
                    <Typography
                      variant="body2"
                      fontWeight="700"
                      color={colors.greenAccent[400]}
                      display="block"
                    >
                      {fmtShort(v.balance)}
                    </Typography>
                    <Typography variant="caption" color={colors.grey[400]} fontSize="0.65rem">
                      Balance
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      flex: 1,
                      minWidth: 90,
                      bgcolor: `${colors.primary[500]}`,
                      borderRadius: "8px",
                      p: "10px 12px",
                      textAlign: "center",
                      border: `1px solid ${colors.primary[300]}40`,
                    }}
                  >
                    <PercentOutlined
                      sx={{ fontSize: 16, color: colors.yellowAccent[400], mb: "2px" }}
                    />
                    <Typography
                      variant="body2"
                      fontWeight="700"
                      color={colors.yellowAccent[400]}
                      display="block"
                    >
                      {v.commissionRate}%
                    </Typography>
                    <Typography variant="caption" color={colors.grey[400]} fontSize="0.65rem">
                      Commission
                    </Typography>
                  </Box>
                </Box>
              </Box>

              {/* Card Footer */}
              <Box
                sx={{
                  borderTop: `1px solid ${colors.primary[300]}30`,
                  px: "20px",
                  py: "10px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  bgcolor: `${colors.primary[500]}60`,
                }}
              >
                <Box display="flex" alignItems="center" gap="8px">
                  <Avatar
                    sx={{
                      width: 24,
                      height: 24,
                      bgcolor: `${colors.grey[400]}20`,
                      fontSize: "0.6rem",
                    }}
                  >
                    <PersonOutlined sx={{ fontSize: 14, color: colors.grey[300] }} />
                  </Avatar>
                  <Box>
                    <Typography variant="caption" color={colors.grey[300]} lineHeight={1.2} display="block">
                      {v.operatorName}
                    </Typography>
                    <Typography variant="caption" color={colors.grey[400]} fontSize="0.65rem">
                      {v.operatorPhone}
                    </Typography>
                  </Box>
                </Box>
                <Tooltip title={formatDateTime(v.lastActivity)}>
                  <Box display="flex" alignItems="center" gap="4px">
                    <AccessTimeOutlined sx={{ fontSize: 12, color: colors.grey[400] }} />
                    <Typography variant="caption" color={colors.grey[400]}>
                      {timeAgo(v.lastActivity)}
                    </Typography>
                  </Box>
                </Tooltip>
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* ======== Vendor Directory Table ======== */}
      <Box
        sx={{
          backgroundColor: colors.primary[400],
          borderRadius: "12px",
          overflow: "hidden",
          border: `1px solid ${colors.primary[300]}40`,
          mb: "24px",
        }}
      >
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          p="16px 20px"
          borderBottom={`1px solid ${colors.primary[300]}40`}
        >
          <Box display="flex" alignItems="center" gap="8px">
            <ReceiptLongOutlined sx={{ color: colors.blueAccent[400], fontSize: 20 }} />
            <Typography variant="h6" fontWeight="600" color={colors.grey[100]}>
              Detailed Vendor Directory
            </Typography>
          </Box>
          <Chip
            label={`${totalVendors} vendors`}
            size="small"
            sx={{
              bgcolor: `${colors.blueAccent[500]}15`,
              color: colors.blueAccent[400],
              fontWeight: 600,
              fontSize: "0.7rem",
            }}
          />
        </Box>

        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={headerCellSx}>Vendor Name</TableCell>
              <TableCell sx={headerCellSx}>Location</TableCell>
              <TableCell sx={headerCellSx}>Status</TableCell>
              <TableCell sx={headerCellSx} align="right">Total Sales</TableCell>
              <TableCell sx={headerCellSx} align="right">Transactions</TableCell>
              <TableCell sx={headerCellSx} align="right">Balance</TableCell>
              <TableCell sx={headerCellSx} align="center">Commission</TableCell>
              <TableCell sx={headerCellSx}>Operator</TableCell>
              <TableCell sx={headerCellSx}>Phone</TableCell>
              <TableCell sx={headerCellSx}>Last Activity</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {vendors.map((v, idx) => (
              <TableRow
                key={v.id}
                sx={{
                  transition: "background-color 0.2s",
                  "&:hover": {
                    backgroundColor: `${colors.primary[300]}44`,
                  },
                }}
              >
                <TableCell sx={{ ...bodyCellSx, fontWeight: 600 }}>
                  <Box display="flex" alignItems="center" gap="8px">
                    <Avatar
                      sx={{
                        width: 28,
                        height: 28,
                        bgcolor: `${vendorColors[idx % vendorColors.length]}25`,
                        fontSize: "0.65rem",
                        fontWeight: 700,
                        color: vendorColors[idx % vendorColors.length],
                      }}
                    >
                      {getInitials(v.name)}
                    </Avatar>
                    {v.name}
                  </Box>
                </TableCell>
                <TableCell sx={bodyCellSx}>{v.location}</TableCell>
                <TableCell sx={bodyCellSx}>
                  <Chip
                    label={v.status}
                    size="small"
                    sx={{
                      backgroundColor:
                        v.status === "Active"
                          ? `${colors.greenAccent[500]}20`
                          : "rgba(108,117,125,0.15)",
                      color:
                        v.status === "Active"
                          ? colors.greenAccent[400]
                          : colors.grey[400],
                      fontWeight: 600,
                      fontSize: "0.7rem",
                      border: `1px solid ${
                        v.status === "Active"
                          ? `${colors.greenAccent[500]}30`
                          : "rgba(108,117,125,0.2)"
                      }`,
                    }}
                  />
                </TableCell>
                <TableCell
                  sx={{ ...bodyCellSx, color: colors.greenAccent[500] }}
                  align="right"
                >
                  {fmtCurrency(v.totalSales)}
                </TableCell>
                <TableCell sx={bodyCellSx} align="right">
                  {fmt(v.transactionCount)}
                </TableCell>
                <TableCell sx={bodyCellSx} align="right">
                  {fmtCurrency(v.balance)}
                </TableCell>
                <TableCell
                  sx={{ ...bodyCellSx, color: colors.yellowAccent[500] }}
                  align="center"
                >
                  {v.commissionRate}%
                </TableCell>
                <TableCell sx={bodyCellSx}>
                  <Box display="flex" alignItems="center" gap="4px">
                    <PersonOutlined sx={{ fontSize: 15, color: colors.grey[300] }} />
                    {v.operatorName}
                  </Box>
                </TableCell>
                <TableCell sx={bodyCellSx}>
                  <Box display="flex" alignItems="center" gap="4px">
                    <PhoneOutlined sx={{ fontSize: 15, color: colors.grey[300] }} />
                    {v.operatorPhone}
                  </Box>
                </TableCell>
                <TableCell sx={{ ...bodyCellSx, whiteSpace: "nowrap" }}>
                  <Box display="flex" alignItems="center" gap="4px">
                    <AccessTimeOutlined sx={{ fontSize: 15, color: colors.grey[300] }} />
                    {formatDateTime(v.lastActivity)}
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>

      {/* ======== Commission Summary ======== */}
      <Box
        sx={{
          backgroundColor: colors.primary[400],
          borderRadius: "12px",
          overflow: "hidden",
          border: `1px solid ${colors.primary[300]}40`,
        }}
      >
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          p="16px 20px"
          borderBottom={`1px solid ${colors.primary[300]}40`}
        >
          <Box display="flex" alignItems="center" gap="8px">
            <PercentOutlined sx={{ color: colors.yellowAccent[400], fontSize: 20 }} />
            <Typography variant="h6" fontWeight="600" color={colors.grey[100]}>
              Commission Summary
            </Typography>
          </Box>
        </Box>

        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={headerCellSx}>Vendor</TableCell>
              <TableCell sx={headerCellSx} align="center">Rate</TableCell>
              <TableCell sx={headerCellSx} align="right">Gross Sales</TableCell>
              <TableCell sx={headerCellSx} align="right">Commission</TableCell>
              <TableCell sx={headerCellSx} align="right">Net to Utility</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {vendors.map((v) => {
              const commAmt = v.totalSales * (v.commissionRate / 100);
              const net = v.totalSales - commAmt;
              return (
                <TableRow
                  key={v.id}
                  sx={{
                    "&:hover": {
                      backgroundColor: `${colors.primary[300]}44`,
                    },
                  }}
                >
                  <TableCell sx={{ ...bodyCellSx, fontWeight: 500 }}>
                    {v.name}
                  </TableCell>
                  <TableCell sx={bodyCellSx} align="center">
                    {v.commissionRate}%
                  </TableCell>
                  <TableCell sx={bodyCellSx} align="right">
                    {fmtCurrency(v.totalSales)}
                  </TableCell>
                  <TableCell
                    sx={{ ...bodyCellSx, color: colors.yellowAccent[500] }}
                    align="right"
                  >
                    {fmtCurrency(commAmt)}
                  </TableCell>
                  <TableCell
                    sx={{ ...bodyCellSx, color: colors.greenAccent[500] }}
                    align="right"
                  >
                    {fmtCurrency(net)}
                  </TableCell>
                </TableRow>
              );
            })}
            {/* Totals row */}
            <TableRow
              sx={{
                "& td": {
                  borderTop: `2px solid ${colors.grey[400]}`,
                },
              }}
            >
              <TableCell sx={{ ...bodyCellSx, fontWeight: 700 }}>Totals</TableCell>
              <TableCell sx={bodyCellSx} />
              <TableCell sx={{ ...bodyCellSx, fontWeight: 700 }} align="right">
                {fmtCurrency(totalSales)}
              </TableCell>
              <TableCell
                sx={{
                  ...bodyCellSx,
                  color: colors.yellowAccent[500],
                  fontWeight: 700,
                }}
                align="right"
              >
                {fmtCurrency(
                  vendors.reduce(
                    (s, v) => s + v.totalSales * (v.commissionRate / 100),
                    0
                  )
                )}
              </TableCell>
              <TableCell
                sx={{
                  ...bodyCellSx,
                  color: colors.greenAccent[500],
                  fontWeight: 700,
                }}
                align="right"
              >
                {fmtCurrency(
                  vendors.reduce(
                    (s, v) =>
                      s + (v.totalSales - v.totalSales * (v.commissionRate / 100)),
                    0
                  )
                )}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Box>
    </Box>
  );
}
