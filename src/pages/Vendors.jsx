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
} from "@mui/material";
import {
  StorefrontOutlined,
  PointOfSaleOutlined,
  AccountBalanceWalletOutlined,
  PercentOutlined,
  PersonOutlined,
  PhoneOutlined,
  AccessTimeOutlined,
} from "@mui/icons-material";
import { tokens } from "../theme";
import Header from "../components/Header";
import { vendors } from "../services/mockData";

// ---- Helpers ----------------------------------------------------------------

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
    d.toLocaleTimeString("en-NA", { hour: "2-digit", minute: "2-digit" })
  );
}

// ---- Main Component ---------------------------------------------------------

export default function Vendors() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);

  // Derived stats
  const totalVendors = vendors.length;
  const activeVendors = vendors.filter((v) => v.status === "Active").length;
  const totalSales = vendors.reduce((s, v) => s + v.totalSales, 0);
  const avgCommission =
    vendors.length > 0
      ? (
          vendors.reduce((s, v) => s + v.commissionRate, 0) / vendors.length
        ).toFixed(1)
      : "0";

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
      <Header
        title="VENDOR MANAGEMENT"
        subtitle="Vending Point Operators"
      />

      <Box
        display="grid"
        gridTemplateColumns="repeat(12, 1fr)"
        gridAutoRows="140px"
        gap="5px"
      >
        {/* ---- Stat: Total Vendors (span 3) ---- */}
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
          <StorefrontOutlined
            sx={{ color: colors.blueAccent[500], fontSize: 32, mb: "8px" }}
          />
          <Typography variant="h4" fontWeight="700" color={colors.grey[100]}>
            {totalVendors}
          </Typography>
          <Typography variant="body2" color={colors.blueAccent[400]}>
            Total Vendors
          </Typography>
        </Box>

        {/* ---- Stat: Active Vendors (span 3) ---- */}
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
          <PointOfSaleOutlined
            sx={{ color: colors.greenAccent[500], fontSize: 32, mb: "8px" }}
          />
          <Typography variant="h4" fontWeight="700" color={colors.grey[100]}>
            {activeVendors}
          </Typography>
          <Typography variant="body2" color={colors.greenAccent[500]}>
            Active
          </Typography>
        </Box>

        {/* ---- Stat: Total Sales (span 3) ---- */}
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
          <AccountBalanceWalletOutlined
            sx={{ color: colors.greenAccent[500], fontSize: 32, mb: "8px" }}
          />
          <Typography variant="h4" fontWeight="700" color={colors.grey[100]}>
            {fmtCurrency(totalSales)}
          </Typography>
          <Typography variant="body2" color={colors.greenAccent[500]}>
            Total Sales
          </Typography>
        </Box>

        {/* ---- Stat: Avg Commission (span 3) ---- */}
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
          <PercentOutlined
            sx={{ color: colors.yellowAccent[500], fontSize: 32, mb: "8px" }}
          />
          <Typography variant="h4" fontWeight="700" color={colors.grey[100]}>
            {avgCommission}%
          </Typography>
          <Typography variant="body2" color={colors.yellowAccent[500]}>
            Avg Commission
          </Typography>
        </Box>

        {/* ---- Vendor Table (span 12, span 4) ---- */}
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
            p="15px"
            borderBottom={`1px solid ${colors.primary[300]}`}
          >
            <Typography
              variant="h5"
              fontWeight="600"
              color={colors.grey[100]}
            >
              Vendor Directory
            </Typography>
            <Typography variant="body2" color={colors.greenAccent[500]}>
              {totalVendors} vendors registered
            </Typography>
          </Box>

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={headerCellSx}>Vendor Name</TableCell>
                <TableCell sx={headerCellSx}>Location</TableCell>
                <TableCell sx={headerCellSx}>Status</TableCell>
                <TableCell sx={headerCellSx} align="right">
                  Total Sales
                </TableCell>
                <TableCell sx={headerCellSx} align="right">
                  Transactions
                </TableCell>
                <TableCell sx={headerCellSx} align="right">
                  Balance
                </TableCell>
                <TableCell sx={headerCellSx} align="center">
                  Commission
                </TableCell>
                <TableCell sx={headerCellSx}>Operator</TableCell>
                <TableCell sx={headerCellSx}>Phone</TableCell>
                <TableCell sx={headerCellSx}>Last Activity</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {vendors.map((v) => (
                <TableRow
                  key={v.id}
                  sx={{
                    "&:hover": {
                      backgroundColor: `${colors.primary[300]}44`,
                    },
                  }}
                >
                  <TableCell sx={{ ...bodyCellSx, fontWeight: 600 }}>
                    <Box display="flex" alignItems="center" gap="8px">
                      <StorefrontOutlined
                        sx={{
                          color: colors.blueAccent[500],
                          fontSize: 18,
                        }}
                      />
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
                            ? colors.greenAccent[900]
                            : "rgba(108,117,125,0.15)",
                        color:
                          v.status === "Active"
                            ? colors.greenAccent[500]
                            : colors.grey[400],
                        fontWeight: 600,
                        fontSize: "0.7rem",
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
                      <PersonOutlined
                        sx={{ fontSize: 15, color: colors.grey[300] }}
                      />
                      {v.operatorName}
                    </Box>
                  </TableCell>
                  <TableCell sx={bodyCellSx}>
                    <Box display="flex" alignItems="center" gap="4px">
                      <PhoneOutlined
                        sx={{ fontSize: 15, color: colors.grey[300] }}
                      />
                      {v.operatorPhone}
                    </Box>
                  </TableCell>
                  <TableCell sx={{ ...bodyCellSx, whiteSpace: "nowrap" }}>
                    <Box display="flex" alignItems="center" gap="4px">
                      <AccessTimeOutlined
                        sx={{ fontSize: 15, color: colors.grey[300] }}
                      />
                      {formatDateTime(v.lastActivity)}
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Commission Summary Row */}
          <Divider sx={{ borderColor: colors.primary[300] }} />
          <Box p="15px">
            <Typography
              variant="h6"
              fontWeight="600"
              color={colors.grey[100]}
              mb="10px"
            >
              Commission Summary
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={headerCellSx}>Vendor</TableCell>
                  <TableCell sx={headerCellSx} align="center">
                    Rate
                  </TableCell>
                  <TableCell sx={headerCellSx} align="right">
                    Gross Sales
                  </TableCell>
                  <TableCell sx={headerCellSx} align="right">
                    Commission
                  </TableCell>
                  <TableCell sx={headerCellSx} align="right">
                    Net to NamPower
                  </TableCell>
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
                        sx={{
                          ...bodyCellSx,
                          color: colors.yellowAccent[500],
                        }}
                        align="right"
                      >
                        {fmtCurrency(commAmt)}
                      </TableCell>
                      <TableCell
                        sx={{
                          ...bodyCellSx,
                          color: colors.greenAccent[500],
                        }}
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
                  <TableCell
                    sx={{
                      ...bodyCellSx,
                      fontWeight: 700,
                    }}
                  >
                    Totals
                  </TableCell>
                  <TableCell sx={bodyCellSx} />
                  <TableCell
                    sx={{ ...bodyCellSx, fontWeight: 700 }}
                    align="right"
                  >
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
                        (s, v) =>
                          s + v.totalSales * (v.commissionRate / 100),
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
                          s +
                          (v.totalSales -
                            v.totalSales * (v.commissionRate / 100)),
                        0
                      )
                    )}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
