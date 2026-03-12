import { Box, Typography, useTheme, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from "@mui/material";
import { tokens } from "../theme";
import Header from "../components/Header";
import StatBox from "../components/StatBox";
import { dashboardData, notifications } from "../services/mockData";
import ElectricBoltOutlinedIcon from "@mui/icons-material/ElectricBoltOutlined";
import BatteryChargingFullIcon from "@mui/icons-material/BatteryChargingFull";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import BoltIcon from "@mui/icons-material/Bolt";
import ElectricMeterOutlinedIcon from "@mui/icons-material/ElectricMeterOutlined";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import PowerOutlinedIcon from "@mui/icons-material/PowerOutlined";
import NotificationsOutlinedIcon from "@mui/icons-material/NotificationsOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ---- Helpers ----
const fmt = (n) => Number(n).toLocaleString();
const fmtCurrency = (n) => `N$ ${Number(n).toLocaleString()}`;

function formatTime(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

// Status chip color map
const statusColor = {
  Completed: "#4cceac",
  Failed: "#db4f4a",
  Reversed: "#f2b705",
  Pending: "#6870fa",
};

// Notification icon by type
const notifIcon = (type) => {
  switch (type) {
    case "Critical":
      return <ErrorOutlineIcon sx={{ color: "#db4f4a", fontSize: 18 }} />;
    case "Warning":
      return <WarningAmberIcon sx={{ color: "#f2b705", fontSize: 18 }} />;
    case "Success":
      return <CheckCircleOutlineIcon sx={{ color: "#4cceac", fontSize: 18 }} />;
    default:
      return <InfoOutlinedIcon sx={{ color: "#6870fa", fontSize: 18 }} />;
  }
};

export default function Dashboard() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);

  return (
    <Box m="20px">
      <Header title="DASHBOARD" subtitle="Meters Network Summary" />

      <Box
        display="grid"
        gridTemplateColumns="repeat(12, 1fr)"
        gridAutoRows="140px"
        gap="5px"
      >
        {/* ================================================================= */}
        {/* ROW 1: 4 Stat Boxes                                              */}
        {/* ================================================================= */}
        <Box
          gridColumn="span 3"
          backgroundColor={colors.primary[400]}
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <StatBox
            title={fmt(dashboardData.kpis.totalMeters)}
            subtitle="Total Meters"
            progress="0.75"
            increase="+2.4%"
            link="/meters"
            icon={
              <ElectricMeterOutlinedIcon
                sx={{ color: colors.greenAccent[500], fontSize: "26px" }}
              />
            }
          />
        </Box>

        <Box
          gridColumn="span 3"
          backgroundColor={colors.primary[400]}
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <StatBox
            title={fmt(dashboardData.kpis.activeMeters)}
            subtitle="Active Meters"
            progress="0.89"
            increase="+1.2%"
            link="/meters"
            icon={
              <ElectricBoltOutlinedIcon
                sx={{ color: colors.greenAccent[500], fontSize: "26px" }}
              />
            }
          />
        </Box>

        <Box
          gridColumn="span 3"
          backgroundColor={colors.primary[400]}
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <StatBox
            title={fmt(dashboardData.kpis.inactiveMeters)}
            subtitle="Inactive Meters"
            progress="0.11"
            increase="-0.8%"
            link="/meters"
            icon={
              <BatteryChargingFullIcon
                sx={{ color: colors.greenAccent[500], fontSize: "26px" }}
              />
            }
          />
        </Box>

        <Box
          gridColumn="span 3"
          backgroundColor={colors.primary[400]}
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <StatBox
            title={`${dashboardData.kpis.systemLoad}%`}
            subtitle="Current System Load"
            progress={String(dashboardData.kpis.systemLoad / 100)}
            increase="+3.1%"
            link="/"
            icon={
              <BoltIcon
                sx={{ color: colors.greenAccent[500], fontSize: "26px" }}
              />
            }
          />
        </Box>

        {/* ================================================================= */}
        {/* ROW 2: Revenue & Energy Chart (span 9) + Notifications (span 3)  */}
        {/* ================================================================= */}
        <Box
          gridColumn="span 9"
          gridRow="span 3"
          backgroundColor={colors.primary[400]}
          p="15px"
        >
          <Typography
            variant="h5"
            fontWeight="600"
            color={colors.grey[100]}
            mb="10px"
          >
            Revenue & Energy Trend
          </Typography>
          <Box height="calc(100% - 40px)">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={dashboardData.salesTrend}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={colors.greenAccent[500]} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={colors.greenAccent[500]} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradKwh" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={colors.blueAccent[400]} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={colors.blueAccent[400]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.grey[700]} />
                <XAxis dataKey="day" stroke={colors.grey[300]} tick={{ fontSize: 12 }} />
                <YAxis
                  yAxisId="left"
                  stroke={colors.grey[300]}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `N$${(v / 1000).toFixed(0)}k`}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke={colors.grey[300]}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: colors.primary[400],
                    border: `1px solid ${colors.grey[700]}`,
                    borderRadius: 4,
                    color: colors.grey[100],
                  }}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="revenue"
                  stroke={colors.greenAccent[500]}
                  strokeWidth={2}
                  fill="url(#gradRevenue)"
                  name="Revenue (N$)"
                />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="kWh"
                  stroke={colors.blueAccent[400]}
                  strokeWidth={2}
                  fill="url(#gradKwh)"
                  name="Energy (kWh)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </Box>
        </Box>

        <Box
          gridColumn="span 3"
          gridRow="span 3"
          backgroundColor={colors.primary[400]}
          p="15px"
          overflow="auto"
        >
          <Box display="flex" alignItems="center" gap="8px" mb="15px">
            <NotificationsOutlinedIcon sx={{ color: colors.greenAccent[500] }} />
            <Typography variant="h5" fontWeight="600" color={colors.grey[100]}>
              Notifications
            </Typography>
          </Box>
          {notifications.slice(0, 8).map((notif, i) => (
            <Box
              key={notif.id}
              display="flex"
              gap="10px"
              py="10px"
              borderBottom={
                i < 7 ? `1px solid ${colors.grey[700]}` : "none"
              }
            >
              <Box mt="3px">{notifIcon(notif.type)}</Box>
              <Box flex={1}>
                <Typography
                  variant="h6"
                  fontWeight="600"
                  color={colors.grey[100]}
                >
                  {notif.title}
                </Typography>
                <Typography variant="body2" color={colors.grey[300]} sx={{ fontSize: "11px" }}>
                  {notif.message.length > 80
                    ? notif.message.substring(0, 80) + "..."
                    : notif.message}
                </Typography>
                <Typography
                  variant="caption"
                  color={colors.greenAccent[400]}
                  sx={{ fontSize: "10px" }}
                >
                  {formatTime(notif.timestamp)}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>

        {/* ================================================================= */}
        {/* ROW 3: Token Transactions Chart (span 9) + Timeline (span 3)     */}
        {/* ================================================================= */}
        <Box
          gridColumn="span 9"
          gridRow="span 5"
          backgroundColor={colors.primary[400]}
          p="15px"
        >
          <Typography
            variant="h5"
            fontWeight="600"
            color={colors.grey[100]}
            mb="10px"
          >
            Token Transaction Revenue
          </Typography>
          <Box height="calc(100% - 40px)">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={dashboardData.salesTrend}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="gradTokens" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={colors.greenAccent[500]} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={colors.greenAccent[500]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.grey[700]} />
                <XAxis dataKey="day" stroke={colors.grey[300]} tick={{ fontSize: 12 }} />
                <YAxis
                  stroke={colors.grey[300]}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `${v}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: colors.primary[400],
                    border: `1px solid ${colors.grey[700]}`,
                    borderRadius: 4,
                    color: colors.grey[100],
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="tokens"
                  stroke={colors.greenAccent[500]}
                  strokeWidth={2}
                  fill="url(#gradTokens)"
                  name="Tokens Generated"
                />
              </AreaChart>
            </ResponsiveContainer>
          </Box>
        </Box>

        <Box
          gridColumn="span 3"
          gridRow="span 5"
          backgroundColor={colors.primary[400]}
          p="15px"
          overflow="auto"
        >
          <Typography
            variant="h5"
            fontWeight="600"
            color={colors.grey[100]}
            mb="15px"
          >
            Token Timeline
          </Typography>
          {dashboardData.recentTransactions.slice(0, 10).map((txn, i) => (
            <Box
              key={txn.id}
              display="flex"
              justifyContent="space-between"
              alignItems="center"
              py="10px"
              borderBottom={
                i < 9 ? `1px solid ${colors.grey[700]}` : "none"
              }
            >
              <Box>
                <Typography
                  variant="h6"
                  fontWeight="600"
                  color={colors.grey[100]}
                >
                  {txn.customer}
                </Typography>
                <Typography variant="caption" color={colors.greenAccent[400]}>
                  {formatTime(txn.time)} — {txn.meterNo}
                </Typography>
              </Box>
              <Typography
                variant="h6"
                fontWeight="bold"
                color={
                  txn.status === "Completed"
                    ? colors.greenAccent[500]
                    : txn.status === "Failed"
                    ? colors.redAccent[500]
                    : colors.yellowAccent[500]
                }
              >
                {fmtCurrency(txn.amount)}
              </Typography>
            </Box>
          ))}
        </Box>

        {/* ================================================================= */}
        {/* ROW 4: Energy Overview Stat Boxes (3 x span 4)                   */}
        {/* ================================================================= */}
        <Box
          gridColumn="span 4"
          backgroundColor={colors.primary[400]}
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <StatBox
            title={fmtCurrency(dashboardData.kpis.todayRevenue)}
            subtitle="Total Units Purchased"
            progress="0.65"
            increase="+8.3%"
            link="/vending"
            icon={
              <ShoppingCartIcon
                sx={{ color: colors.greenAccent[500], fontSize: "26px" }}
              />
            }
          />
        </Box>

        <Box
          gridColumn="span 4"
          backgroundColor={colors.primary[400]}
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <StatBox
            title={`${fmt(dashboardData.kpis.avgConsumption)} kWh`}
            subtitle="Units Available Balance"
            progress="0.48"
            increase="+2.1%"
            link="/"
            icon={
              <AccountBalanceWalletOutlinedIcon
                sx={{ color: colors.greenAccent[500], fontSize: "26px" }}
              />
            }
          />
        </Box>

        <Box
          gridColumn="span 4"
          backgroundColor={colors.primary[400]}
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <StatBox
            title={fmt(dashboardData.kpis.todayTokens)}
            subtitle="Total Energy Consumed"
            progress="0.72"
            increase="+5.7%"
            link="/"
            icon={
              <PowerOutlinedIcon
                sx={{ color: colors.greenAccent[500], fontSize: "26px" }}
              />
            }
          />
        </Box>

        {/* ================================================================= */}
        {/* ROW 5: Recent Transactions Table (span 12, span 4)               */}
        {/* ================================================================= */}
        <Box
          gridColumn="span 12"
          gridRow="span 4"
          backgroundColor={colors.primary[400]}
          p="15px"
          overflow="auto"
        >
          <Typography
            variant="h5"
            fontWeight="600"
            color={colors.grey[100]}
            mb="15px"
          >
            Recent Transactions
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {["Time", "Customer", "Meter", "Amount (N$)", "kWh", "Token", "Status"].map(
                    (col) => (
                      <TableCell
                        key={col}
                        sx={{
                          color: colors.greenAccent[500],
                          fontWeight: 600,
                          fontSize: "12px",
                          borderBottom: `2px solid ${colors.grey[700]}`,
                          backgroundColor: colors.primary[400],
                        }}
                      >
                        {col}
                      </TableCell>
                    )
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {dashboardData.recentTransactions.map((txn) => (
                  <TableRow
                    key={txn.id}
                    sx={{
                      "&:hover": {
                        backgroundColor: `${colors.primary[500]} !important`,
                      },
                      "& td": {
                        borderBottom: `1px solid ${colors.grey[700]}`,
                        color: colors.grey[100],
                        fontSize: "12px",
                        py: 1.2,
                      },
                    }}
                  >
                    <TableCell>{formatTime(txn.time)}</TableCell>
                    <TableCell>{txn.customer}</TableCell>
                    <TableCell sx={{ fontFamily: "monospace", fontSize: "11px !important" }}>
                      {txn.meterNo}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>
                      {fmt(txn.amount.toFixed(2))}
                    </TableCell>
                    <TableCell>{fmt(txn.kWh.toFixed(2))}</TableCell>
                    <TableCell sx={{ fontFamily: "monospace", fontSize: "10px !important" }}>
                      {txn.token}
                    </TableCell>
                    <TableCell>
                      <Box
                        sx={{
                          display: "inline-block",
                          px: 1,
                          py: 0.3,
                          borderRadius: "4px",
                          backgroundColor:
                            txn.status === "Completed"
                              ? "rgba(76,206,172,0.15)"
                              : txn.status === "Failed"
                              ? "rgba(219,79,74,0.15)"
                              : txn.status === "Reversed"
                              ? "rgba(242,183,5,0.15)"
                              : "rgba(104,112,250,0.15)",
                          color: statusColor[txn.status] || colors.grey[100],
                          fontWeight: 600,
                          fontSize: "11px",
                        }}
                      >
                        {txn.status}
                      </Box>
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
