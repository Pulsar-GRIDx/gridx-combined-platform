import { useState, useMemo } from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  Chip,
  InputAdornment,
  Table,
  TableBody,
  TableRow,
  TableCell,
  Divider,
  useTheme,
} from "@mui/material";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import BoltIcon from "@mui/icons-material/Bolt";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import SmsOutlinedIcon from "@mui/icons-material/SmsOutlined";
import PersonOutlinedIcon from "@mui/icons-material/PersonOutlined";
import { tokens } from "../theme";
import Header from "../components/Header";
import { customers, tariffGroups, tariffConfig } from "../services/mockData";

// ---- Helpers ----
const fmtN$ = (v) => `N$ ${Number(v).toFixed(2)}`;
const presetAmounts = [10, 25, 50, 100, 200, 500];
const sampleCustomers = customers.slice(0, 4);

function generateToken() {
  let t = "";
  for (let i = 0; i < 20; i++) t += Math.floor(Math.random() * 10);
  return t;
}

function formatToken(t) {
  return t.replace(/(.{4})/g, "$1 ").trim();
}

function calculateBreakdown(amount, arrears, tariffBlocks) {
  const vatAmount = amount - amount / (1 + tariffConfig.vatRate / 100);
  const afterVat = amount - vatAmount;
  const afterFixed = afterVat - tariffConfig.fixedCharge;
  const afterLevy = afterFixed - tariffConfig.relLevy;

  let arrearsDeduction = 0;
  if (arrears > 0) {
    arrearsDeduction = Math.min(
      amount * (tariffConfig.arrearsPercentage / 100),
      arrears
    );
  }

  const netEnergy = Math.max(afterLevy - arrearsDeduction, 0);

  let remaining = netEnergy;
  let totalKwh = 0;

  for (const block of tariffBlocks) {
    if (remaining <= 0) break;
    const blockCapacity =
      block.max === Infinity ? Infinity : block.max - (block.min > 0 ? block.min - 1 : 0);
    const kwhInBlock = Math.min(remaining / block.rate, blockCapacity);
    const costInBlock = kwhInBlock * block.rate;
    totalKwh += kwhInBlock;
    remaining -= costInBlock;
  }

  return {
    amountTendered: amount,
    vatAmount,
    fixedCharge: tariffConfig.fixedCharge,
    relLevy: tariffConfig.relLevy,
    arrearsDeduction,
    netEnergy,
    totalKwh,
  };
}

export default function Vending() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedAmount, setSelectedAmount] = useState(null);
  const [customAmount, setCustomAmount] = useState("");
  const [generatedToken, setGeneratedToken] = useState(null);
  const [copied, setCopied] = useState(false);

  const amount = selectedAmount || (customAmount ? parseFloat(customAmount) : 0);

  const tariffBlocks = useMemo(() => {
    if (!selectedCustomer) return [];
    const group = tariffGroups.find((g) => g.name === selectedCustomer.tariffGroup);
    return group ? group.blocks : tariffGroups[0].blocks;
  }, [selectedCustomer]);

  const breakdown = useMemo(() => {
    if (!selectedCustomer || !amount || amount <= 0) return null;
    return calculateBreakdown(amount, selectedCustomer.arrears, tariffBlocks);
  }, [amount, selectedCustomer, tariffBlocks]);

  const handleSearch = () => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return;
    const found = customers.find(
      (c) =>
        c.meterNo.toLowerCase().includes(q) ||
        c.accountNo.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q)
    );
    if (found) {
      setSelectedCustomer(found);
      setSelectedAmount(null);
      setCustomAmount("");
      setGeneratedToken(null);
    }
  };

  const handleSelectCustomer = (c) => {
    setSelectedCustomer(c);
    setSearchQuery(c.meterNo);
    setSelectedAmount(null);
    setCustomAmount("");
    setGeneratedToken(null);
  };

  const handlePresetClick = (val) => {
    setSelectedAmount(val);
    setCustomAmount("");
    setGeneratedToken(null);
  };

  const handleCustomAmountChange = (e) => {
    setCustomAmount(e.target.value);
    setSelectedAmount(null);
    setGeneratedToken(null);
  };

  const handleGenerate = () => {
    setGeneratedToken(generateToken());
  };

  const handleCopy = () => {
    if (generatedToken) {
      navigator.clipboard.writeText(formatToken(generatedToken));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Box m="20px">
      <Header title="TOKEN VENDING" subtitle="STS Prepaid Electricity Token Generation" />

      <Box
        display="grid"
        gridTemplateColumns="repeat(12, 1fr)"
        gridAutoRows="140px"
        gap="5px"
      >
        {/* ================================================================= */}
        {/* Customer Lookup (span 7, span 3)                                 */}
        {/* ================================================================= */}
        <Box
          gridColumn="span 7"
          gridRow="span 3"
          backgroundColor={colors.primary[400]}
          p="20px"
          overflow="auto"
        >
          <Typography
            variant="h5"
            fontWeight="600"
            color={colors.grey[100]}
            mb="15px"
          >
            Customer Lookup
          </Typography>

          <TextField
            fullWidth
            placeholder="Search by meter number, account ID, or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlinedIcon sx={{ color: colors.grey[300] }} />
                </InputAdornment>
              ),
            }}
            sx={{ mb: 2 }}
          />

          <Typography
            variant="caption"
            color={colors.greenAccent[400]}
            sx={{ display: "block", mb: 1 }}
          >
            Quick load:
          </Typography>
          <Box display="flex" flexWrap="wrap" gap="8px" mb="10px">
            {sampleCustomers.map((c) => (
              <Chip
                key={c.id}
                icon={<PersonOutlinedIcon sx={{ fontSize: 16 }} />}
                label={`${c.name} (${c.meterNo})`}
                onClick={() => handleSelectCustomer(c)}
                variant={selectedCustomer?.id === c.id ? "filled" : "outlined"}
                sx={{
                  color: colors.grey[100],
                  borderColor: colors.greenAccent[700],
                  "&:hover": {
                    backgroundColor: `${colors.greenAccent[700]}40`,
                  },
                  ...(selectedCustomer?.id === c.id && {
                    backgroundColor: colors.greenAccent[700],
                    borderColor: colors.greenAccent[500],
                  }),
                }}
              />
            ))}
          </Box>
        </Box>

        {/* ================================================================= */}
        {/* Customer Info (span 5, span 3)                                   */}
        {/* ================================================================= */}
        <Box
          gridColumn="span 5"
          gridRow="span 3"
          backgroundColor={colors.primary[400]}
          p="20px"
          overflow="auto"
        >
          <Typography
            variant="h5"
            fontWeight="600"
            color={colors.grey[100]}
            mb="15px"
          >
            Customer Information
          </Typography>

          {selectedCustomer ? (
            <Box>
              <Typography variant="h4" fontWeight="700" color={colors.grey[100]} mb="15px">
                {selectedCustomer.name}
              </Typography>
              {[
                { label: "Account No", value: selectedCustomer.accountNo, mono: true },
                { label: "Meter No", value: selectedCustomer.meterNo, mono: true },
                { label: "Area", value: selectedCustomer.area },
                { label: "Tariff Group", value: selectedCustomer.tariffGroup },
                {
                  label: "Arrears",
                  value: fmtN$(selectedCustomer.arrears),
                  color:
                    selectedCustomer.arrears > 0
                      ? colors.redAccent[500]
                      : colors.greenAccent[500],
                },
                { label: "Status", value: selectedCustomer.status },
              ].map((item) => (
                <Box key={item.label} mb="8px">
                  <Typography variant="caption" color={colors.greenAccent[500]}>
                    {item.label}
                  </Typography>
                  <Typography
                    variant="body2"
                    color={item.color || colors.grey[100]}
                    fontWeight="500"
                    fontFamily={item.mono ? "monospace" : "inherit"}
                  >
                    {item.value}
                  </Typography>
                </Box>
              ))}
            </Box>
          ) : (
            <Box
              display="flex"
              alignItems="center"
              justifyContent="center"
              height="calc(100% - 40px)"
            >
              <Typography variant="body2" color={colors.grey[400]} textAlign="center">
                Search for a customer or select from quick-load to begin.
              </Typography>
            </Box>
          )}
        </Box>

        {/* ================================================================= */}
        {/* Vending Form (span 7, span 3)                                    */}
        {/* ================================================================= */}
        <Box
          gridColumn="span 7"
          gridRow="span 3"
          backgroundColor={colors.primary[400]}
          p="20px"
          overflow="auto"
        >
          <Typography
            variant="h5"
            fontWeight="600"
            color={colors.grey[100]}
            mb="15px"
          >
            Purchase Token
          </Typography>

          {selectedCustomer ? (
            <>
              {/* Preset amounts */}
              <Box display="flex" flexWrap="wrap" gap="8px" mb="15px">
                {presetAmounts.map((v) => (
                  <Button
                    key={v}
                    variant={selectedAmount === v ? "contained" : "outlined"}
                    onClick={() => handlePresetClick(v)}
                    sx={{
                      minWidth: 80,
                      color:
                        selectedAmount === v
                          ? colors.primary[500]
                          : colors.greenAccent[500],
                      borderColor: colors.greenAccent[700],
                      backgroundColor:
                        selectedAmount === v
                          ? colors.greenAccent[500]
                          : "transparent",
                      "&:hover": {
                        backgroundColor:
                          selectedAmount === v
                            ? colors.greenAccent[400]
                            : `${colors.greenAccent[700]}30`,
                        borderColor: colors.greenAccent[500],
                      },
                    }}
                  >
                    N${v}
                  </Button>
                ))}
              </Box>

              {/* Custom amount */}
              <TextField
                label="Custom Amount (N$)"
                type="number"
                value={customAmount}
                onChange={handleCustomAmountChange}
                sx={{ mb: 2, width: 240 }}
              />

              {/* Generate button */}
              <Box>
                <Button
                  variant="contained"
                  fullWidth
                  size="large"
                  startIcon={<BoltIcon />}
                  disabled={!breakdown || breakdown.netEnergy <= 0}
                  onClick={handleGenerate}
                  sx={{
                    py: 1.5,
                    fontSize: "1rem",
                    fontWeight: 700,
                    backgroundColor: colors.greenAccent[500],
                    color: colors.primary[500],
                    "&:hover": {
                      backgroundColor: colors.greenAccent[400],
                    },
                    "&.Mui-disabled": {
                      backgroundColor: colors.grey[700],
                      color: colors.grey[500],
                    },
                  }}
                >
                  Generate Token
                </Button>
              </Box>
            </>
          ) : (
            <Box
              display="flex"
              alignItems="center"
              justifyContent="center"
              height="calc(100% - 50px)"
            >
              <Typography variant="body2" color={colors.grey[400]} textAlign="center">
                Select a customer first to begin token vending.
              </Typography>
            </Box>
          )}
        </Box>

        {/* ================================================================= */}
        {/* Transaction Breakdown (span 5, span 3)                           */}
        {/* ================================================================= */}
        <Box
          gridColumn="span 5"
          gridRow="span 3"
          backgroundColor={colors.primary[400]}
          p="20px"
          overflow="auto"
        >
          <Typography
            variant="h5"
            fontWeight="600"
            color={colors.grey[100]}
            mb="15px"
          >
            Transaction Breakdown
          </Typography>

          {breakdown ? (
            <>
              <Table size="small">
                <TableBody>
                  {[
                    { label: "Amount Tendered", value: fmtN$(breakdown.amountTendered), color: colors.grey[100] },
                    { label: `VAT (${tariffConfig.vatRate}%)`, value: `-${fmtN$(breakdown.vatAmount)}`, color: colors.redAccent[500] },
                    { label: "Fixed Charge", value: `-${fmtN$(breakdown.fixedCharge)}`, color: colors.redAccent[500] },
                    { label: "REL Levy", value: `-${fmtN$(breakdown.relLevy)}`, color: colors.redAccent[500] },
                    ...(breakdown.arrearsDeduction > 0
                      ? [{ label: `Arrears (${tariffConfig.arrearsPercentage}%)`, value: `-${fmtN$(breakdown.arrearsDeduction)}`, color: colors.yellowAccent[500] }]
                      : []),
                    { label: "Net Energy Amount", value: fmtN$(breakdown.netEnergy), color: colors.greenAccent[500] },
                  ].map((row) => (
                    <TableRow key={row.label}>
                      <TableCell
                        sx={{
                          color: colors.grey[300],
                          borderBottom: `1px solid ${colors.grey[700]}`,
                          pl: 0,
                          fontSize: "12px",
                        }}
                      >
                        {row.label}
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          color: row.color,
                          fontWeight: 600,
                          borderBottom: `1px solid ${colors.grey[700]}`,
                          pr: 0,
                          fontSize: "12px",
                        }}
                      >
                        {row.value}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <Divider sx={{ borderColor: colors.greenAccent[700], my: 1.5 }} />

              <Box textAlign="center" py="8px">
                <Typography variant="caption" color={colors.greenAccent[500]}>
                  kWh Calculated
                </Typography>
                <Typography
                  variant="h3"
                  fontWeight="700"
                  fontFamily="monospace"
                  color={colors.greenAccent[400]}
                >
                  {breakdown.totalKwh.toFixed(2)} kWh
                </Typography>
              </Box>
            </>
          ) : (
            <Box
              display="flex"
              alignItems="center"
              justifyContent="center"
              height="calc(100% - 50px)"
            >
              <Typography variant="body2" color={colors.grey[400]} textAlign="center">
                Enter an amount to see the breakdown.
              </Typography>
            </Box>
          )}
        </Box>

        {/* ================================================================= */}
        {/* Token Display (span 12, span 2) — only shown after generation    */}
        {/* ================================================================= */}
        {generatedToken && (
          <Box
            gridColumn="span 12"
            gridRow="span 2"
            backgroundColor={colors.primary[400]}
            p="20px"
            display="flex"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
          >
            <Typography variant="caption" color={colors.greenAccent[500]} mb="5px">
              20-Digit STS Token — {selectedCustomer?.name}
            </Typography>
            <Typography
              variant="h2"
              fontWeight="700"
              fontFamily='"Courier New", monospace'
              color={colors.greenAccent[400]}
              letterSpacing="4px"
              mb="15px"
            >
              {formatToken(generatedToken)}
            </Typography>
            <Box display="flex" gap="10px">
              <Button
                variant="outlined"
                startIcon={<ContentCopyOutlinedIcon />}
                onClick={handleCopy}
                sx={{
                  color: copied ? colors.greenAccent[500] : colors.grey[100],
                  borderColor: copied ? colors.greenAccent[500] : colors.grey[700],
                  "&:hover": {
                    borderColor: colors.greenAccent[500],
                    backgroundColor: `${colors.greenAccent[700]}20`,
                  },
                }}
              >
                {copied ? "Copied!" : "Copy"}
              </Button>
              <Button
                variant="outlined"
                startIcon={<PrintOutlinedIcon />}
                sx={{
                  color: colors.grey[100],
                  borderColor: colors.grey[700],
                  "&:hover": {
                    borderColor: colors.greenAccent[500],
                    backgroundColor: `${colors.greenAccent[700]}20`,
                  },
                }}
              >
                Print Receipt
              </Button>
              <Button
                variant="outlined"
                startIcon={<SmsOutlinedIcon />}
                sx={{
                  color: colors.grey[100],
                  borderColor: colors.grey[700],
                  "&:hover": {
                    borderColor: colors.greenAccent[500],
                    backgroundColor: `${colors.greenAccent[700]}20`,
                  },
                }}
              >
                Send SMS
              </Button>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
