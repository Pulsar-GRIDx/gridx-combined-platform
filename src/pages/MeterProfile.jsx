import { useState, useMemo } from "react";
import { useParams, Link as RouterLink } from "react-router-dom";
import {
  Box,
  Typography,
  Chip,
  Button,
  Tabs,
  Tab,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  useTheme,
} from "@mui/material";
import {
  BoltOutlined,
  ElectricalServicesOutlined,
  PowerOutlined,
  GraphicEqOutlined,
  SpeedOutlined,
  ThermostatOutlined,
  SignalCellularAltOutlined,
  SimCardOutlined,
  AccountBalanceWalletOutlined,
  ConfirmationNumberOutlined,
  ShoppingCartOutlined,
  HistoryOutlined,
  TuneOutlined,
  BarChartOutlined,
  PowerSettingsNewOutlined,
  ContentCopyOutlined,
  SendOutlined,
  RestartAltOutlined,
  LockResetOutlined,
  WaterDropOutlined,
  ArrowBackOutlined,
} from "@mui/icons-material";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import Header from "../components/Header";
import { tokens } from "../theme";
import {
  meters,
  transactions,
  tariffGroups,
  tariffConfig,
  customers,
} from "../services/mockData";

/* ---- helpers ---- */
const fmt = (n) => Number(n).toLocaleString();
const fmtCurrency = (n) =>
  `N$ ${Number(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function formatDateTime(isoStr) {
  if (!isoStr) return "---";
  const d = new Date(isoStr);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function signalLabel(dbm) {
  if (dbm >= -50) return { label: "Excellent", color: "#4cceac" };
  if (dbm >= -70) return { label: "Good", color: "#00b4d8" };
  if (dbm >= -85) return { label: "Fair", color: "#f2b705" };
  return { label: "Weak", color: "#db4f4a" };
}

function generateHourlyData() {
  const base = [
    0.3, 0.2, 0.15, 0.12, 0.1, 0.15, 0.4, 0.8, 1.2, 1.5, 1.8, 2.0, 2.2,
    2.1, 1.9, 1.7, 1.5, 1.8, 2.5, 3.0, 2.8, 2.2, 1.5, 0.8,
  ];
  return base.map((v, i) => ({
    hour: `${String(i).padStart(2, "0")}:00`,
    kWh: +(v + Math.random() * 0.5).toFixed(2),
  }));
}

/* ---- small components ---- */
function InfoRow({ label, value, color, mono }) {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        py: 0.6,
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <Typography
        variant="body2"
        sx={{ color: "rgba(255,255,255,0.5)", fontSize: "0.8rem" }}
      >
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          color: color || "#fff",
          fontWeight: 600,
          fontSize: "0.8rem",
          ...(mono ? { fontFamily: "monospace" } : {}),
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

/* ================================================================ */
/* MeterProfile Page                                                */
/* ================================================================ */
export default function MeterProfile() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const { drn } = useParams();
  const [tab, setTab] = useState(0);
  const [vendAmount, setVendAmount] = useState("");
  const [generatedToken, setGeneratedToken] = useState("");

  /* ---------- find meter ---------- */
  const meter = meters.find((m) => m.drn === drn);
  if (!meter) {
    return (
      <Box m="20px">
        <Header title="METER NOT FOUND" subtitle={`DRN: ${drn}`} />
        <Typography color={colors.grey[100]}>
          No meter found with that DRN.
        </Typography>
        <Button
          component={RouterLink}
          to="/meters"
          startIcon={<ArrowBackOutlined />}
          sx={{ mt: 2, color: colors.greenAccent[500] }}
        >
          Back to Meters
        </Button>
      </Box>
    );
  }

  /* ---------- related data ---------- */
  const customer = customers.find((c) => c.meterNo === meter.meterNo);
  const meterTxns = transactions
    .filter((t) => t.meterNo === meter.meterNo)
    .sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));
  const tariff = tariffGroups.find(
    (t) => t.name === (meter.billing?.tariffGroup || "Residential")
  );
  const hourlyData = useMemo(() => generateHourlyData(), []);

  /* ---------- status chip color ---------- */
  const statusChipColor =
    meter.status === "Online"
      ? colors.greenAccent[500]
      : meter.status === "Tampered"
      ? "#db4f4a"
      : colors.grey[400];

  /* ---------- vend helpers ---------- */
  const handleVend = () => {
    const amt = parseFloat(vendAmount);
    if (!amt || amt < 5) return;
    const kWh = (amt / 1.68).toFixed(2);
    const token = Array.from({ length: 20 }, () =>
      Math.floor(Math.random() * 10)
    ).join("");
    setGeneratedToken(
      `Token: ${token} | Amount: ${fmtCurrency(amt)} | kWh: ${kWh}`
    );
  };

  const presets = [50, 100, 200, 500, 1000, 2000];

  return (
    <Box m="20px">
      {/* ---- Back link ---- */}
      <Button
        component={RouterLink}
        to="/meters"
        startIcon={<ArrowBackOutlined />}
        sx={{
          mb: 1,
          color: colors.greenAccent[500],
          textTransform: "none",
          fontSize: "0.82rem",
        }}
      >
        Back to Meters
      </Button>

      {/* ---- Header bar: Meter No, Customer, Status ---- */}
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        flexWrap="wrap"
        gap={2}
        mb={2}
      >
        <Box>
          <Typography
            variant="h3"
            color={colors.grey[100]}
            fontWeight="bold"
            fontFamily="monospace"
          >
            {meter.meterNo}
          </Typography>
          <Typography variant="h5" color={colors.greenAccent[500]}>
            {meter.customerName} &mdash; {meter.area}, {meter.suburb}
          </Typography>
        </Box>
        <Chip
          label={meter.status}
          sx={{
            bgcolor:
              meter.status === "Online"
                ? "rgba(76,206,172,0.15)"
                : meter.status === "Tampered"
                ? "rgba(219,79,74,0.15)"
                : "rgba(108,117,125,0.2)",
            color: statusChipColor,
            fontWeight: 700,
            fontSize: "0.85rem",
            height: 32,
          }}
        />
      </Box>

      {/* ---- Tabs ---- */}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          mb: 2,
          "& .MuiTab-root": {
            color: colors.grey[400],
            textTransform: "none",
            fontWeight: 600,
          },
          "& .Mui-selected": { color: colors.greenAccent[500] },
          "& .MuiTabs-indicator": {
            backgroundColor: colors.greenAccent[500],
          },
        }}
      >
        <Tab icon={<SpeedOutlined sx={{ fontSize: 18 }} />} iconPosition="start" label="Overview" />
        <Tab icon={<ShoppingCartOutlined sx={{ fontSize: 18 }} />} iconPosition="start" label="Vend Token" />
        <Tab icon={<PowerSettingsNewOutlined sx={{ fontSize: 18 }} />} iconPosition="start" label="Load Control" />
        <Tab icon={<AccountBalanceWalletOutlined sx={{ fontSize: 18 }} />} iconPosition="start" label="Billing & Tariff" />
        <Tab icon={<TuneOutlined sx={{ fontSize: 18 }} />} iconPosition="start" label="Configuration" />
        <Tab icon={<BarChartOutlined sx={{ fontSize: 18 }} />} iconPosition="start" label="Energy Charts" />
        <Tab icon={<HistoryOutlined sx={{ fontSize: 18 }} />} iconPosition="start" label="History" />
      </Tabs>

      {/* ================================================================ */}
      {/* TAB 0: Overview                                                  */}
      {/* ================================================================ */}
      {tab === 0 && (
        <Box
          display="grid"
          gridTemplateColumns="repeat(12, 1fr)"
          gridAutoRows="140px"
          gap="5px"
        >
          {/* ---- Power Measurements Card (span 6, span 2) ---- */}
          <Box
            gridColumn="span 6"
            gridRow="span 2"
            backgroundColor={colors.primary[400]}
            p="15px"
            borderRadius="4px"
            overflow="auto"
          >
            <Typography variant="h6" color={colors.grey[100]} fontWeight="bold" mb={1}>
              Power Measurements
            </Typography>
            <InfoRow label="Voltage" value={`${meter.power.voltage.toFixed(1)} V`} color="#f2b705" />
            <InfoRow label="Current" value={`${meter.power.current.toFixed(1)} A`} color="#00b4d8" />
            <InfoRow label="Active Power" value={`${meter.power.activePower.toFixed(2)} kW`} color={colors.greenAccent[500]} />
            <InfoRow label="Reactive Power" value={`${meter.power.reactivePower.toFixed(2)} kVAR`} />
            <InfoRow label="Apparent Power" value={`${meter.power.apparentPower.toFixed(2)} kVA`} />
            <InfoRow label="Frequency" value={`${meter.power.frequency.toFixed(2)} Hz`} color="#6870fa" />
            <InfoRow label="Power Factor" value={meter.power.powerFactor.toFixed(3)} color={colors.greenAccent[500]} />
            <InfoRow label="Temperature" value={`${meter.power.temperature}\u00B0C`} color="#db4f4a" />
          </Box>

          {/* ---- Energy Readings Card (span 6, span 2) ---- */}
          <Box
            gridColumn="span 6"
            gridRow="span 2"
            backgroundColor={colors.primary[400]}
            p="15px"
            borderRadius="4px"
            overflow="auto"
          >
            <Typography variant="h6" color={colors.grey[100]} fontWeight="bold" mb={1}>
              Energy Readings
            </Typography>
            <InfoRow label="Active Energy" value={`${fmt(meter.energy.activeEnergy)} kWh`} color={colors.greenAccent[500]} />
            <InfoRow label="Reactive Energy" value={`${fmt(meter.energy.reactiveEnergy)} kVARh`} />
            <InfoRow label="Units" value={meter.energy.units} />
            <InfoRow
              label="Tamper State"
              value={meter.energy.tamperState}
              color={meter.energy.tamperState === "Normal" ? colors.greenAccent[500] : "#db4f4a"}
            />
            <Box mt={2}>
              <Typography variant="body2" color="rgba(255,255,255,0.4)" fontSize="0.72rem">
                Last Update
              </Typography>
              <Typography variant="body2" color={colors.grey[100]} fontWeight={600}>
                {formatDateTime(meter.lastUpdate)}
              </Typography>
            </Box>
          </Box>

          {/* ---- Network Card (span 6, span 2) ---- */}
          <Box
            gridColumn="span 6"
            gridRow="span 2"
            backgroundColor={colors.primary[400]}
            p="15px"
            borderRadius="4px"
            overflow="auto"
          >
            <Typography variant="h6" color={colors.grey[100]} fontWeight="bold" mb={1}>
              Network
            </Typography>
            {(() => {
              const sig = signalLabel(meter.network.signalStrength);
              return (
                <InfoRow
                  label="Signal Strength"
                  value={`${meter.network.signalStrength} dBm (${sig.label})`}
                  color={sig.color}
                />
              );
            })()}
            <InfoRow label="Service Provider" value={meter.network.serviceProvider} />
            <InfoRow label="SIM Phone" value={meter.network.simPhone} mono />
            <InfoRow label="IMEI" value={meter.network.imei} mono />
          </Box>

          {/* ---- Quick Stats Card (span 6, span 2) ---- */}
          <Box
            gridColumn="span 6"
            gridRow="span 2"
            backgroundColor={colors.primary[400]}
            p="15px"
            borderRadius="4px"
            overflow="auto"
          >
            <Typography variant="h6" color={colors.grey[100]} fontWeight="bold" mb={1}>
              Quick Stats
            </Typography>
            <InfoRow label="Last Token" value={meter.billing.lastToken} mono color={colors.greenAccent[500]} />
            <InfoRow label="Balance" value={`${fmt(meter.billing.balance)} kWh`} color="#00b4d8" />
            <InfoRow label="Tariff Group" value={meter.billing.tariffGroup} />
            <InfoRow
              label="Arrears"
              value={customer ? fmtCurrency(customer.arrears) : "N$ 0.00"}
              color={customer && customer.arrears > 0 ? "#db4f4a" : colors.greenAccent[500]}
            />
            <InfoRow label="Account No" value={meter.accountNo} mono />
            <InfoRow label="DRN" value={meter.drn} mono />
          </Box>
        </Box>
      )}

      {/* ================================================================ */}
      {/* TAB 1: Vend Token                                                */}
      {/* ================================================================ */}
      {tab === 1 && (
        <Box
          display="grid"
          gridTemplateColumns="repeat(12, 1fr)"
          gridAutoRows="140px"
          gap="5px"
        >
          {/* ---- Customer Info (pre-filled) ---- */}
          <Box
            gridColumn="span 5"
            gridRow="span 3"
            backgroundColor={colors.primary[400]}
            p="20px"
            borderRadius="4px"
            overflow="auto"
          >
            <Typography variant="h6" color={colors.grey[100]} fontWeight="bold" mb={2}>
              Customer Information
            </Typography>
            <InfoRow label="Customer" value={meter.customerName} />
            <InfoRow label="Meter No" value={meter.meterNo} mono />
            <InfoRow label="Account" value={meter.accountNo} mono />
            <InfoRow label="Area" value={`${meter.area}, ${meter.suburb}`} />
            <InfoRow label="Tariff" value={meter.billing.tariffGroup} />
            <InfoRow label="Billing Type" value={meter.billing.type} />
            <InfoRow
              label="Current Balance"
              value={`${fmt(meter.billing.balance)} kWh`}
              color="#00b4d8"
            />
            {customer && customer.arrears > 0 && (
              <InfoRow
                label="Outstanding Arrears"
                value={fmtCurrency(customer.arrears)}
                color="#db4f4a"
              />
            )}
          </Box>

          {/* ---- Vending Form ---- */}
          <Box
            gridColumn="span 7"
            gridRow="span 3"
            backgroundColor={colors.primary[400]}
            p="20px"
            borderRadius="4px"
            overflow="auto"
          >
            <Typography variant="h6" color={colors.grey[100]} fontWeight="bold" mb={2}>
              Vend Electricity Token
            </Typography>

            {/* Amount presets */}
            <Box display="flex" gap={1} flexWrap="wrap" mb={2}>
              {presets.map((p) => (
                <Button
                  key={p}
                  variant={vendAmount === String(p) ? "contained" : "outlined"}
                  size="small"
                  onClick={() => setVendAmount(String(p))}
                  sx={{
                    fontSize: "0.78rem",
                    textTransform: "none",
                    color:
                      vendAmount === String(p) ? "#fff" : colors.greenAccent[500],
                    borderColor: colors.greenAccent[500],
                    backgroundColor:
                      vendAmount === String(p) ? colors.greenAccent[700] : "transparent",
                  }}
                >
                  N$ {p}
                </Button>
              ))}
            </Box>

            {/* Custom amount */}
            <TextField
              size="small"
              label="Amount (N$)"
              type="number"
              value={vendAmount}
              onChange={(e) => setVendAmount(e.target.value)}
              sx={{ mb: 2, width: "200px" }}
              inputProps={{ min: 5 }}
            />

            {/* Breakdown */}
            {vendAmount && parseFloat(vendAmount) >= 5 && (
              <Box mb={2}>
                <Typography variant="body2" color={colors.grey[100]} fontWeight={600} mb={1}>
                  Breakdown
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableBody>
                      {(() => {
                        const amt = parseFloat(vendAmount);
                        const vat = amt * (tariffConfig.vatRate / 100);
                        const fixed = tariffConfig.fixedCharge;
                        const rel = tariffConfig.relLevy;
                        const arrearsDeduct =
                          customer && customer.arrears > 0
                            ? Math.min(
                                customer.arrears,
                                amt * (tariffConfig.arrearsPercentage / 100)
                              )
                            : 0;
                        const net = amt - vat - fixed - rel - arrearsDeduct;
                        const kWh = tariff?.blocks?.[0]
                          ? (net / tariff.blocks[0].rate).toFixed(2)
                          : (net / 1.68).toFixed(2);
                        const rows = [
                          { label: "Purchase Amount", value: fmtCurrency(amt) },
                          { label: `VAT (${tariffConfig.vatRate}%)`, value: `- ${fmtCurrency(vat)}` },
                          { label: "Fixed Charge", value: `- ${fmtCurrency(fixed)}` },
                          { label: "REL Levy", value: `- ${fmtCurrency(rel)}` },
                        ];
                        if (arrearsDeduct > 0) {
                          rows.push({
                            label: "Arrears Deduction",
                            value: `- ${fmtCurrency(arrearsDeduct)}`,
                          });
                        }
                        rows.push({ label: "Net Amount", value: fmtCurrency(net) });
                        rows.push({ label: "Estimated kWh", value: `${kWh} kWh` });
                        return rows.map((r) => (
                          <TableRow key={r.label}>
                            <TableCell
                              sx={{
                                color: colors.grey[100],
                                borderBottom: "1px solid rgba(255,255,255,0.05)",
                                fontSize: "0.8rem",
                              }}
                            >
                              {r.label}
                            </TableCell>
                            <TableCell
                              align="right"
                              sx={{
                                color: colors.greenAccent[500],
                                fontWeight: 600,
                                borderBottom: "1px solid rgba(255,255,255,0.05)",
                                fontSize: "0.8rem",
                              }}
                            >
                              {r.value}
                            </TableCell>
                          </TableRow>
                        ));
                      })()}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            <Button
              variant="contained"
              startIcon={<SendOutlined />}
              onClick={handleVend}
              disabled={!vendAmount || parseFloat(vendAmount) < 5}
              sx={{
                backgroundColor: colors.greenAccent[700],
                "&:hover": { backgroundColor: colors.greenAccent[600] },
                textTransform: "none",
              }}
            >
              Generate Token
            </Button>

            {/* Generated token display */}
            {generatedToken && (
              <Box
                mt={2}
                p={2}
                backgroundColor="rgba(76,206,172,0.1)"
                borderRadius="4px"
                border={`1px solid ${colors.greenAccent[700]}`}
              >
                <Box display="flex" alignItems="center" gap={1}>
                  <ConfirmationNumberOutlined sx={{ color: colors.greenAccent[500] }} />
                  <Typography
                    variant="body1"
                    color={colors.greenAccent[500]}
                    fontWeight={700}
                    fontFamily="monospace"
                    fontSize="0.9rem"
                  >
                    {generatedToken}
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => navigator.clipboard.writeText(generatedToken)}
                    sx={{ color: colors.greenAccent[500] }}
                  >
                    <ContentCopyOutlined sx={{ fontSize: 16 }} />
                  </IconButton>
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      )}

      {/* ================================================================ */}
      {/* TAB 2: Load Control                                              */}
      {/* ================================================================ */}
      {tab === 2 && (
        <Box
          display="grid"
          gridTemplateColumns="repeat(12, 1fr)"
          gridAutoRows="140px"
          gap="5px"
        >
          {/* ---- Mains Relay ---- */}
          <Box
            gridColumn="span 6"
            gridRow="span 2"
            backgroundColor={colors.primary[400]}
            p="20px"
            borderRadius="4px"
          >
            <Box display="flex" alignItems="center" gap={1} mb={2}>
              <BoltOutlined sx={{ color: "#f2b705" }} />
              <Typography variant="h6" color={colors.grey[100]} fontWeight="bold">
                Mains Relay
              </Typography>
            </Box>
            <InfoRow label="Current State" value={meter.loadControl.mainsState} color={meter.loadControl.mainsState === "ON" ? colors.greenAccent[500] : "#db4f4a"} />
            <InfoRow label="Control Mode" value={meter.loadControl.mainsControl} />
            <Box display="flex" gap={1} mt={2}>
              <Button
                variant="contained"
                startIcon={<PowerSettingsNewOutlined />}
                sx={{
                  backgroundColor: colors.greenAccent[700],
                  "&:hover": { backgroundColor: colors.greenAccent[600] },
                  textTransform: "none",
                }}
              >
                Switch ON
              </Button>
              <Button
                variant="outlined"
                startIcon={<PowerSettingsNewOutlined />}
                sx={{
                  borderColor: "#db4f4a",
                  color: "#db4f4a",
                  textTransform: "none",
                }}
              >
                Switch OFF
              </Button>
            </Box>
          </Box>

          {/* ---- Geyser Relay ---- */}
          <Box
            gridColumn="span 6"
            gridRow="span 2"
            backgroundColor={colors.primary[400]}
            p="20px"
            borderRadius="4px"
          >
            <Box display="flex" alignItems="center" gap={1} mb={2}>
              <WaterDropOutlined sx={{ color: "#00b4d8" }} />
              <Typography variant="h6" color={colors.grey[100]} fontWeight="bold">
                Geyser Relay
              </Typography>
            </Box>
            <InfoRow label="Current State" value={meter.loadControl.geyserState} color={meter.loadControl.geyserState === "ON" ? colors.greenAccent[500] : "#db4f4a"} />
            <InfoRow label="Control Mode" value={meter.loadControl.geyserControl} />
            <Box display="flex" gap={1} mt={2}>
              <Button
                variant="contained"
                startIcon={<PowerSettingsNewOutlined />}
                sx={{
                  backgroundColor: colors.greenAccent[700],
                  "&:hover": { backgroundColor: colors.greenAccent[600] },
                  textTransform: "none",
                }}
              >
                Switch ON
              </Button>
              <Button
                variant="outlined"
                startIcon={<PowerSettingsNewOutlined />}
                sx={{
                  borderColor: "#db4f4a",
                  color: "#db4f4a",
                  textTransform: "none",
                }}
              >
                Switch OFF
              </Button>
            </Box>
          </Box>
        </Box>
      )}

      {/* ================================================================ */}
      {/* TAB 3: Billing & Tariff                                          */}
      {/* ================================================================ */}
      {tab === 3 && (
        <Box
          display="grid"
          gridTemplateColumns="repeat(12, 1fr)"
          gridAutoRows="140px"
          gap="5px"
        >
          {/* ---- Billing Info ---- */}
          <Box
            gridColumn="span 6"
            gridRow="span 2"
            backgroundColor={colors.primary[400]}
            p="20px"
            borderRadius="4px"
            overflow="auto"
          >
            <Typography variant="h6" color={colors.grey[100]} fontWeight="bold" mb={1}>
              Billing Information
            </Typography>
            <InfoRow label="Billing Type" value={meter.billing.type} />
            <InfoRow label="Credit Option" value={meter.billing.creditOption} />
            <InfoRow label="Current Balance" value={`${fmt(meter.billing.balance)} kWh`} color="#00b4d8" />
            <InfoRow label="Last Token" value={meter.billing.lastToken} mono color={colors.greenAccent[500]} />
            <InfoRow label="Tariff Group" value={meter.billing.tariffGroup} />
            {customer && (
              <>
                <InfoRow label="Customer Status" value={customer.status} color={customer.status === "Active" ? colors.greenAccent[500] : "#db4f4a"} />
                <InfoRow label="Arrears" value={fmtCurrency(customer.arrears)} color={customer.arrears > 0 ? "#db4f4a" : colors.greenAccent[500]} />
              </>
            )}
          </Box>

          {/* ---- Tariff Structure ---- */}
          <Box
            gridColumn="span 6"
            gridRow="span 2"
            backgroundColor={colors.primary[400]}
            p="20px"
            borderRadius="4px"
            overflow="auto"
          >
            <Typography variant="h6" color={colors.grey[100]} fontWeight="bold" mb={1}>
              Tariff Structure: {tariff?.name || "---"}
            </Typography>
            <Typography variant="body2" color="rgba(255,255,255,0.5)" mb={1.5} fontSize="0.78rem">
              {tariff?.description || ""}
            </Typography>
            {tariff?.blocks && (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ color: colors.greenAccent[500], fontWeight: 600, fontSize: "0.75rem", borderBottom: `1px solid rgba(255,255,255,0.1)` }}>Block</TableCell>
                      <TableCell sx={{ color: colors.greenAccent[500], fontWeight: 600, fontSize: "0.75rem", borderBottom: `1px solid rgba(255,255,255,0.1)` }}>Range</TableCell>
                      <TableCell align="right" sx={{ color: colors.greenAccent[500], fontWeight: 600, fontSize: "0.75rem", borderBottom: `1px solid rgba(255,255,255,0.1)` }}>Rate (N$/kWh)</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tariff.blocks.map((b) => (
                      <TableRow key={b.name}>
                        <TableCell sx={{ color: colors.grey[100], fontSize: "0.8rem", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>{b.name}</TableCell>
                        <TableCell sx={{ color: colors.grey[100], fontSize: "0.8rem", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>{b.range}</TableCell>
                        <TableCell align="right" sx={{ color: "#f2b705", fontWeight: 600, fontSize: "0.8rem", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>{b.rate.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>

          {/* ---- Tariff Config ---- */}
          <Box
            gridColumn="span 12"
            gridRow="span 1"
            backgroundColor={colors.primary[400]}
            p="15px"
            borderRadius="4px"
            overflow="auto"
          >
            <Typography variant="h6" color={colors.grey[100]} fontWeight="bold" mb={1}>
              System Charges
            </Typography>
            <Box display="flex" gap={4} flexWrap="wrap">
              <Box>
                <Typography variant="body2" color={colors.greenAccent[500]} fontSize="0.72rem">VAT Rate</Typography>
                <Typography variant="body1" color={colors.grey[100]} fontWeight={600}>{tariffConfig.vatRate}%</Typography>
              </Box>
              <Box>
                <Typography variant="body2" color={colors.greenAccent[500]} fontSize="0.72rem">Fixed Charge</Typography>
                <Typography variant="body1" color={colors.grey[100]} fontWeight={600}>{fmtCurrency(tariffConfig.fixedCharge)}</Typography>
              </Box>
              <Box>
                <Typography variant="body2" color={colors.greenAccent[500]} fontSize="0.72rem">REL Levy</Typography>
                <Typography variant="body1" color={colors.grey[100]} fontWeight={600}>{fmtCurrency(tariffConfig.relLevy)}</Typography>
              </Box>
              <Box>
                <Typography variant="body2" color={colors.greenAccent[500]} fontSize="0.72rem">Min Purchase</Typography>
                <Typography variant="body1" color={colors.grey[100]} fontWeight={600}>{fmtCurrency(tariffConfig.minPurchase)}</Typography>
              </Box>
              <Box>
                <Typography variant="body2" color={colors.greenAccent[500]} fontSize="0.72rem">Arrears Deduction</Typography>
                <Typography variant="body1" color={colors.grey[100]} fontWeight={600}>{tariffConfig.arrearsPercentage}%</Typography>
              </Box>
            </Box>
          </Box>
        </Box>
      )}

      {/* ================================================================ */}
      {/* TAB 4: Configuration                                             */}
      {/* ================================================================ */}
      {tab === 4 && (
        <Box
          display="grid"
          gridTemplateColumns="repeat(12, 1fr)"
          gridAutoRows="140px"
          gap="5px"
        >
          {/* ---- Meter Config ---- */}
          <Box
            gridColumn="span 6"
            gridRow="span 2"
            backgroundColor={colors.primary[400]}
            p="20px"
            borderRadius="4px"
            overflow="auto"
          >
            <Typography variant="h6" color={colors.grey[100]} fontWeight="bold" mb={1}>
              Meter Configuration
            </Typography>
            <InfoRow label="DRN" value={meter.drn} mono />
            <InfoRow label="Meter No" value={meter.meterNo} mono />
            <InfoRow label="Transformer" value={meter.transformer} mono />
            <InfoRow label="Area" value={meter.area} />
            <InfoRow label="Suburb" value={meter.suburb} />
            <InfoRow label="GPS" value={`${meter.lat.toFixed(4)}, ${meter.lng.toFixed(4)}`} mono />
          </Box>

          {/* ---- Actions ---- */}
          <Box
            gridColumn="span 6"
            gridRow="span 2"
            backgroundColor={colors.primary[400]}
            p="20px"
            borderRadius="4px"
          >
            <Typography variant="h6" color={colors.grey[100]} fontWeight="bold" mb={2}>
              Configuration Actions
            </Typography>
            <Box display="flex" flexDirection="column" gap={1.5}>
              <Button
                variant="outlined"
                startIcon={<RestartAltOutlined />}
                sx={{ textTransform: "none", justifyContent: "flex-start", color: colors.greenAccent[500], borderColor: colors.greenAccent[500] }}
              >
                Restart Meter
              </Button>
              <Button
                variant="outlined"
                startIcon={<LockResetOutlined />}
                sx={{ textTransform: "none", justifyContent: "flex-start", color: "#f2b705", borderColor: "#f2b705" }}
              >
                Reset STS Keys
              </Button>
              <Button
                variant="outlined"
                startIcon={<TuneOutlined />}
                sx={{ textTransform: "none", justifyContent: "flex-start", color: "#00b4d8", borderColor: "#00b4d8" }}
              >
                Update Configuration
              </Button>
              <Button
                variant="outlined"
                startIcon={<SignalCellularAltOutlined />}
                sx={{ textTransform: "none", justifyContent: "flex-start", color: "#6870fa", borderColor: "#6870fa" }}
              >
                Ping Meter
              </Button>
            </Box>
          </Box>
        </Box>
      )}

      {/* ================================================================ */}
      {/* TAB 5: Energy Charts                                             */}
      {/* ================================================================ */}
      {tab === 5 && (
        <Box
          display="grid"
          gridTemplateColumns="repeat(12, 1fr)"
          gridAutoRows="140px"
          gap="5px"
        >
          <Box
            gridColumn="span 12"
            gridRow="span 3"
            backgroundColor={colors.primary[400]}
            p="20px"
            borderRadius="4px"
          >
            <Typography variant="h6" color={colors.grey[100]} fontWeight="bold" mb={2}>
              24-Hour Energy Consumption
            </Typography>
            <ResponsiveContainer width="100%" height="80%">
              <AreaChart data={hourlyData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="hour"
                  tick={{ fill: colors.grey[100], fontSize: 11 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: colors.grey[100], fontSize: 11 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  tickLine={false}
                  unit=" kWh"
                />
                <RechartsTooltip
                  contentStyle={{
                    background: colors.primary[400],
                    border: `1px solid ${colors.greenAccent[700]}`,
                    borderRadius: 4,
                    color: colors.grey[100],
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="kWh"
                  stroke={colors.greenAccent[500]}
                  fill={colors.greenAccent[500]}
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Box>
        </Box>
      )}

      {/* ================================================================ */}
      {/* TAB 6: Transaction History                                       */}
      {/* ================================================================ */}
      {tab === 6 && (
        <Box
          display="grid"
          gridTemplateColumns="repeat(12, 1fr)"
          gridAutoRows="140px"
          gap="5px"
        >
          <Box
            gridColumn="span 12"
            gridRow="span 4"
            backgroundColor={colors.primary[400]}
            p="20px"
            borderRadius="4px"
            overflow="auto"
          >
            <Typography variant="h6" color={colors.grey[100]} fontWeight="bold" mb={2}>
              Transaction History
            </Typography>
            {meterTxns.length > 0 ? (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      {["Ref", "Date/Time", "Amount", "kWh", "Token", "Status", "Operator"].map(
                        (col) => (
                          <TableCell
                            key={col}
                            sx={{
                              color: colors.greenAccent[500],
                              fontWeight: 600,
                              fontSize: "0.75rem",
                              borderBottom: `1px solid rgba(255,255,255,0.1)`,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {col}
                          </TableCell>
                        )
                      )}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {meterTxns.map((t) => {
                      const sc =
                        t.status === "Completed"
                          ? { bg: "rgba(76,206,172,0.15)", text: colors.greenAccent[500] }
                          : t.status === "Failed"
                          ? { bg: "rgba(219,79,74,0.15)", text: "#db4f4a" }
                          : { bg: "rgba(242,183,5,0.15)", text: "#f2b705" };
                      return (
                        <TableRow key={t.id} sx={{ "&:hover": { bgcolor: "rgba(0,180,216,0.05)" } }}>
                          <TableCell sx={{ color: colors.grey[100], fontSize: "0.78rem", fontFamily: "monospace", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                            {t.refNo}
                          </TableCell>
                          <TableCell sx={{ color: colors.grey[100], fontSize: "0.78rem", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                            {formatDateTime(t.dateTime)}
                          </TableCell>
                          <TableCell sx={{ color: colors.grey[100], fontWeight: 600, fontSize: "0.78rem", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                            {fmtCurrency(t.amount)}
                          </TableCell>
                          <TableCell sx={{ color: colors.greenAccent[500], fontSize: "0.78rem", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                            {t.kWh.toFixed(2)}
                          </TableCell>
                          <TableCell sx={{ color: colors.grey[100], fontFamily: "monospace", fontSize: "0.72rem", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                            {t.token}
                          </TableCell>
                          <TableCell sx={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                            <Chip
                              label={t.status}
                              size="small"
                              sx={{
                                bgcolor: sc.bg,
                                color: sc.text,
                                fontWeight: 600,
                                fontSize: "0.68rem",
                                height: 22,
                              }}
                            />
                          </TableCell>
                          <TableCell sx={{ color: colors.grey[100], fontSize: "0.78rem", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                            {t.operator}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Typography color="rgba(255,255,255,0.35)" sx={{ textAlign: "center", py: 4 }}>
                No transactions found for this meter.
              </Typography>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
}
