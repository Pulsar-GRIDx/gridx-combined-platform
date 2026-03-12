import { useState } from "react";
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
} from "@mui/material";
import {
  AttachMoneyOutlined,
  ElectricMeterOutlined,
  PointOfSaleOutlined,
  AccountBalanceOutlined,
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
import { customers } from "../services/mockData";

// ---- Helpers ----
const fmt = (n) => Number(n).toLocaleString();
const fmtCurrency = (n) =>
  `N$ ${Number(n).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

// ---- Prepaid daily revenue chart data ----
const prepaidDailyData = [
  { day: "Mon", revenue: 125000 },
  { day: "Tue", revenue: 134500 },
  { day: "Wed", revenue: 118700 },
  { day: "Thu", revenue: 142300 },
  { day: "Fri", revenue: 156800 },
  { day: "Sat", revenue: 98400 },
  { day: "Sun", revenue: 71820 },
];

// ---- Postpaid daily revenue chart data ----
const postpaidDailyData = [
  { day: "Mon", revenue: 85000 },
  { day: "Tue", revenue: 92400 },
  { day: "Wed", revenue: 78300 },
  { day: "Thu", revenue: 105200 },
  { day: "Fri", revenue: 112600 },
  { day: "Sat", revenue: 45800 },
  { day: "Sun", revenue: 32100 },
];

// ---- Postpaid billing rows ----
const postpaidRows = [
  { accountNo: "ACC-2026-200001", customer: "Windhoek Municipality HQ", meterNo: "04040520001", billAmount: 125400, dueDate: "2026-03-25", paid: 125400, status: "Paid" },
  { accountNo: "ACC-2026-200002", customer: "Namibia Breweries Ltd", meterNo: "04040520002", billAmount: 284500, dueDate: "2026-03-25", paid: 284500, status: "Paid" },
  { accountNo: "ACC-2026-200003", customer: "TransNamib Holdings", meterNo: "04040520003", billAmount: 198700, dueDate: "2026-03-25", paid: 0, status: "Pending" },
  { accountNo: "ACC-2026-200004", customer: "Namibia Post & Telecom", meterNo: "04040520004", billAmount: 67300, dueDate: "2026-02-28", paid: 0, status: "Overdue" },
  { accountNo: "ACC-2026-200005", customer: "FNB Namibia Campus", meterNo: "04040520005", billAmount: 145200, dueDate: "2026-03-25", paid: 145200, status: "Paid" },
  { accountNo: "ACC-2026-200006", customer: "Pupkewitz Megabuild", meterNo: "04040520006", billAmount: 312800, dueDate: "2026-02-28", paid: 150000, status: "Overdue" },
  { accountNo: "ACC-2026-200007", customer: "Checkers Windhoek", meterNo: "04040520007", billAmount: 89400, dueDate: "2026-03-25", paid: 89400, status: "Paid" },
  { accountNo: "ACC-2026-200008", customer: "Hilton Garden Inn WHK", meterNo: "04040520008", billAmount: 234100, dueDate: "2026-03-25", paid: 0, status: "Pending" },
];

// ---- Prepaid billing rows (from customers mock) ----
const prepaidRows = customers.slice(0, 8).map((c) => ({
  accountNo: c.accountNo,
  customer: c.name,
  meterNo: c.meterNo,
  lastPurchase: c.lastPurchaseAmount,
  lastDate: c.lastPurchaseDate,
  status: c.status,
}));

// ---- Summary stats ----
const totalRevenue = 847520;
const prepaidRevenue = 547320;
const postpaidRevenue = 300200;
const outstanding = 612800;

// ---- Custom tooltip ----
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
        <Typography
          key={i}
          variant="caption"
          sx={{ display: "block", color: p.color }}
        >
          Revenue: N$ {Number(p.value).toLocaleString()}
        </Typography>
      ))}
    </Box>
  );
}

export default function Billing() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);

  const getStatusColor = (status) => {
    switch (status) {
      case "Paid":
      case "Active":
        return colors.greenAccent[500];
      case "Pending":
        return colors.blueAccent[500];
      case "Overdue":
      case "Suspended":
        return colors.redAccent[500];
      case "Arrears":
        return colors.yellowAccent[500];
      default:
        return colors.grey[300];
    }
  };

  return (
    <Box m="20px">
      <Header
        title="BILLING SUMMARY"
        subtitle="Prepaid and Postpaid Billing Overview"
      />

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
              {fmtCurrency(totalRevenue)}
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
            <ElectricMeterOutlined
              sx={{ color: colors.blueAccent[500], fontSize: 28, mb: 0.5 }}
            />
            <Typography
              variant="body2"
              color={colors.greenAccent[500]}
              fontWeight="600"
            >
              Prepaid Revenue
            </Typography>
            <Typography
              variant="h4"
              color={colors.grey[100]}
              fontWeight="bold"
            >
              {fmtCurrency(prepaidRevenue)}
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
            <PointOfSaleOutlined
              sx={{ color: colors.yellowAccent[500], fontSize: 28, mb: 0.5 }}
            />
            <Typography
              variant="body2"
              color={colors.greenAccent[500]}
              fontWeight="600"
            >
              Postpaid Revenue
            </Typography>
            <Typography
              variant="h4"
              color={colors.grey[100]}
              fontWeight="bold"
            >
              {fmtCurrency(postpaidRevenue)}
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
            <AccountBalanceOutlined
              sx={{ color: colors.redAccent[500], fontSize: 28, mb: 0.5 }}
            />
            <Typography
              variant="body2"
              color={colors.greenAccent[500]}
              fontWeight="600"
            >
              Outstanding
            </Typography>
            <Typography
              variant="h4"
              color={colors.grey[100]}
              fontWeight="bold"
            >
              {fmtCurrency(outstanding)}
            </Typography>
          </Box>
        </Box>

        {/* ---- ROW 2: Prepaid billing chart (span 6, span 3) ---- */}
        <Box
          gridColumn="span 6"
          gridRow="span 3"
          backgroundColor={colors.primary[400]}
          borderRadius="4px"
          p="20px"
        >
          <Typography
            variant="h5"
            color={colors.grey[100]}
            fontWeight="bold"
            mb="15px"
          >
            Prepaid Daily Revenue
          </Typography>
          <Box height="calc(100% - 40px)">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={prepaidDailyData}
                margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={colors.grey[800]}
                />
                <XAxis
                  dataKey="day"
                  tick={{ fill: colors.grey[300], fontSize: 12 }}
                  axisLine={{ stroke: colors.grey[700] }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: colors.grey[300], fontSize: 12 }}
                  axisLine={{ stroke: colors.grey[700] }}
                  tickLine={false}
                  tickFormatter={(v) => `N$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<ChartTooltip colors={colors} />} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke={colors.greenAccent[500]}
                  fill={`${colors.greenAccent[500]}33`}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Box>
        </Box>

        {/* ---- ROW 2: Postpaid billing chart (span 6, span 3) ---- */}
        <Box
          gridColumn="span 6"
          gridRow="span 3"
          backgroundColor={colors.primary[400]}
          borderRadius="4px"
          p="20px"
        >
          <Typography
            variant="h5"
            color={colors.grey[100]}
            fontWeight="bold"
            mb="15px"
          >
            Postpaid Daily Revenue
          </Typography>
          <Box height="calc(100% - 40px)">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={postpaidDailyData}
                margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={colors.grey[800]}
                />
                <XAxis
                  dataKey="day"
                  tick={{ fill: colors.grey[300], fontSize: 12 }}
                  axisLine={{ stroke: colors.grey[700] }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: colors.grey[300], fontSize: 12 }}
                  axisLine={{ stroke: colors.grey[700] }}
                  tickLine={false}
                  tickFormatter={(v) => `N$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<ChartTooltip colors={colors} />} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke={colors.blueAccent[500]}
                  fill={`${colors.blueAccent[500]}33`}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Box>
        </Box>

        {/* ---- ROW 3: Recent billing table (span 12, span 3) ---- */}
        <Box
          gridColumn="span 12"
          gridRow="span 3"
          backgroundColor={colors.primary[400]}
          borderRadius="4px"
          overflow="auto"
        >
          <Box p="20px" pb="0">
            <Typography
              variant="h5"
              color={colors.grey[100]}
              fontWeight="bold"
              mb="10px"
            >
              Recent Billing Records
            </Typography>
          </Box>
          <TableContainer sx={{ px: "20px", pb: "20px" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {[
                    "Account No",
                    "Customer",
                    "Meter No",
                    "Bill Amount",
                    "Due Date",
                    "Paid",
                    "Status",
                  ].map((h) => (
                    <TableCell
                      key={h}
                      sx={{
                        color: colors.grey[100],
                        fontWeight: 700,
                        borderBottom: `1px solid ${colors.grey[700]}`,
                        ...(h === "Bill Amount" || h === "Paid"
                          ? { textAlign: "right" }
                          : {}),
                      }}
                    >
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {postpaidRows.map((row) => (
                  <TableRow key={row.accountNo} hover>
                    <TableCell
                      sx={{
                        fontFamily: "monospace",
                        fontSize: "0.8rem",
                        color: colors.grey[200],
                        borderBottom: `1px solid ${colors.grey[800]}`,
                      }}
                    >
                      {row.accountNo}
                    </TableCell>
                    <TableCell
                      sx={{
                        color: colors.grey[100],
                        fontWeight: 600,
                        borderBottom: `1px solid ${colors.grey[800]}`,
                      }}
                    >
                      {row.customer}
                    </TableCell>
                    <TableCell
                      sx={{
                        fontFamily: "monospace",
                        fontSize: "0.8rem",
                        color: colors.grey[200],
                        borderBottom: `1px solid ${colors.grey[800]}`,
                      }}
                    >
                      {row.meterNo}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        fontWeight: 600,
                        color: colors.grey[100],
                        borderBottom: `1px solid ${colors.grey[800]}`,
                      }}
                    >
                      {fmtCurrency(row.billAmount)}
                    </TableCell>
                    <TableCell
                      sx={{
                        color: colors.grey[300],
                        borderBottom: `1px solid ${colors.grey[800]}`,
                      }}
                    >
                      {new Date(row.dueDate).toLocaleDateString("en-ZA", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        color: colors.grey[200],
                        borderBottom: `1px solid ${colors.grey[800]}`,
                      }}
                    >
                      {fmtCurrency(row.paid)}
                    </TableCell>
                    <TableCell
                      sx={{
                        borderBottom: `1px solid ${colors.grey[800]}`,
                      }}
                    >
                      <Chip
                        label={row.status}
                        size="small"
                        sx={{
                          backgroundColor: `${getStatusColor(row.status)}22`,
                          color: getStatusColor(row.status),
                          fontWeight: 600,
                          fontSize: "0.72rem",
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </Box>
    </Box>
  );
}
