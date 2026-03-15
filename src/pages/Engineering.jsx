import { useState } from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  IconButton,
  Tooltip,
  useTheme,
} from "@mui/material";
import {
  BuildOutlined,
  CardGiftcardOutlined,
  VpnKeyOutlined,
  RestoreOutlined,
  ContentCopyOutlined,
  SearchOutlined,
} from "@mui/icons-material";
import { tokens } from "../theme";
import Header from "../components/Header";
import { transactions } from "../services/mockData";

// ---- Helpers ----------------------------------------------------------------

function generateToken() {
  let t = "";
  for (let i = 0; i < 20; i++) t += Math.floor(Math.random() * 10);
  return t;
}

function formatToken(t) {
  return t.replace(/(.{4})/g, "$1 ").trim();
}

// ---- Token Display ----------------------------------------------------------

function TokenDisplay({ token, onCopy, copied, colors }) {
  if (!token) return null;
  return (
    <Box
      sx={{
        mt: 2,
        p: 2,
        borderRadius: 1,
        backgroundColor: "rgba(76,206,172,0.06)",
        border: `1px solid ${colors.greenAccent[700]}`,
        textAlign: "center",
      }}
    >
      <Typography
        variant="caption"
        sx={{ color: colors.grey[300], display: "block", mb: 0.5 }}
      >
        Generated Token
      </Typography>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 1,
        }}
      >
        <Typography
          variant="h6"
          sx={{
            fontFamily: '"Courier New", monospace',
            fontWeight: 700,
            color: colors.greenAccent[500],
            letterSpacing: 2,
          }}
        >
          {formatToken(token)}
        </Typography>
        <Tooltip title={copied ? "Copied!" : "Copy token"}>
          <IconButton
            size="small"
            onClick={onCopy}
            sx={{ color: copied ? colors.greenAccent[500] : colors.grey[300] }}
          >
            <ContentCopyOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}

// ---- Main Component ---------------------------------------------------------

export default function Engineering() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);

  // Card 1: Engineering Token
  const [engMeter, setEngMeter] = useState("");
  const [engTokenType, setEngTokenType] = useState("");
  const [engParams, setEngParams] = useState("");
  const [engToken, setEngToken] = useState(null);
  const [engCopied, setEngCopied] = useState(false);

  // Card 2: Free Units Token
  const [freeMeter, setFreeMeter] = useState("");
  const [freeKwh, setFreeKwh] = useState("");
  const [freeReason, setFreeReason] = useState("");
  const [freeToken, setFreeToken] = useState(null);
  const [freeCopied, setFreeCopied] = useState(false);

  // Card 3: Key Change Token
  const [keyMeter, setKeyMeter] = useState("");
  const [keyNewRevision, setKeyNewRevision] = useState("");
  const [keyToken, setKeyToken] = useState(null);
  const [keyCopied, setKeyCopied] = useState(false);

  // Card 4: Replacement Token
  const [replRef, setReplRef] = useState("");
  const [replOriginal, setReplOriginal] = useState(null);
  const [replToken, setReplToken] = useState(null);
  const [replCopied, setReplCopied] = useState(false);

  const handleCopy = (token, setCopied) => {
    navigator.clipboard.writeText(formatToken(token));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReplSearch = () => {
    const found = transactions.find(
      (t) => t.refNo.toLowerCase() === replRef.trim().toLowerCase()
    );
    setReplOriginal(found || null);
  };

  const engineeringTokenTypes = [
    "Set Power Limit",
    "Clear Tamper",
    "Test Display",
    "Clear Credit",
    "Set Tariff Rate",
  ];

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

  return (
    <Box m="20px">
      <Header
        title="ENGINEERING TOKENS"
        subtitle="Generate Specialized STS Tokens"
      />

      <Box
        display="grid"
        gridTemplateColumns="repeat(12, 1fr)"
        gridAutoRows="140px"
        gap="5px"
      >
        {/* ---- Card 1: Engineering Token (span 6, span 3) ---- */}
        <Box
          gridColumn="span 6"
          gridRow="span 3"
          backgroundColor={colors.primary[400]}
          borderRadius="4px"
          p="20px"
          display="flex"
          flexDirection="column"
        >
          <Box display="flex" alignItems="center" gap="12px" mb="15px">
            <Box
              width="40px"
              height="40px"
              borderRadius="4px"
              display="flex"
              alignItems="center"
              justifyContent="center"
              backgroundColor={colors.greenAccent[900]}
            >
              <BuildOutlined sx={{ color: colors.greenAccent[500] }} />
            </Box>
            <Box>
              <Typography
                variant="h5"
                fontWeight="600"
                color={colors.grey[100]}
              >
                Engineering Token
              </Typography>
              <Typography variant="body2" color={colors.grey[300]}>
                Generate tokens for meter configuration and diagnostics
              </Typography>
            </Box>
          </Box>

          <TextField
            fullWidth
            label="Meter Number"
            value={engMeter}
            onChange={(e) => setEngMeter(e.target.value)}
            sx={{ ...textFieldSx, mb: "15px" }}
          />

          <FormControl fullWidth sx={{ mb: "15px" }}>
            <InputLabel
              sx={{
                color: colors.grey[300],
                "&.Mui-focused": { color: colors.greenAccent[500] },
              }}
            >
              Token Type
            </InputLabel>
            <Select
              value={engTokenType}
              label="Token Type"
              onChange={(e) => setEngTokenType(e.target.value)}
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
              {engineeringTokenTypes.map((t) => (
                <MenuItem key={t} value={t}>
                  {t}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            fullWidth
            label="Optional Parameters (JSON)"
            value={engParams}
            onChange={(e) => setEngParams(e.target.value)}
            multiline
            rows={2}
            sx={{ ...textFieldSx, mb: "15px" }}
          />

          <Box mt="auto">
            <Button
              variant="contained"
              fullWidth
              disabled={!engMeter || !engTokenType}
              onClick={() => setEngToken(generateToken())}
              sx={{
                py: "10px",
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
              Generate Engineering Token
            </Button>

            <TokenDisplay
              token={engToken}
              onCopy={() => handleCopy(engToken, setEngCopied)}
              copied={engCopied}
              colors={colors}
            />
          </Box>
        </Box>

        {/* ---- Card 2: Free Units Token (span 6, span 3) ---- */}
        <Box
          gridColumn="span 6"
          gridRow="span 3"
          backgroundColor={colors.primary[400]}
          borderRadius="4px"
          p="20px"
          display="flex"
          flexDirection="column"
        >
          <Box display="flex" alignItems="center" gap="12px" mb="15px">
            <Box
              width="40px"
              height="40px"
              borderRadius="4px"
              display="flex"
              alignItems="center"
              justifyContent="center"
              backgroundColor="rgba(76,175,80,0.15)"
            >
              <CardGiftcardOutlined sx={{ color: "#4caf50" }} />
            </Box>
            <Box>
              <Typography
                variant="h5"
                fontWeight="600"
                color={colors.grey[100]}
              >
                Free Units Token
              </Typography>
              <Typography variant="body2" color={colors.grey[300]}>
                Issue complimentary electricity units to a meter
              </Typography>
            </Box>
          </Box>

          <TextField
            fullWidth
            label="Meter Number"
            value={freeMeter}
            onChange={(e) => setFreeMeter(e.target.value)}
            sx={{ ...textFieldSx, mb: "15px" }}
          />

          <TextField
            fullWidth
            label="kWh Amount"
            type="number"
            value={freeKwh}
            onChange={(e) => setFreeKwh(e.target.value)}
            sx={{ ...textFieldSx, mb: "15px" }}
          />

          <TextField
            fullWidth
            label="Reason"
            value={freeReason}
            onChange={(e) => setFreeReason(e.target.value)}
            sx={{ ...textFieldSx, mb: "15px" }}
          />

          <Box mb="15px">
            <Typography variant="caption" color={colors.grey[300]}>
              Authorized By
            </Typography>
            <Typography
              variant="body2"
              color={colors.grey[100]}
              fontWeight="500"
            >
              Admin User (System Administrator)
            </Typography>
          </Box>

          <Box mt="auto">
            <Button
              variant="contained"
              fullWidth
              disabled={!freeMeter || !freeKwh || !freeReason}
              onClick={() => setFreeToken(generateToken())}
              sx={{
                py: "10px",
                fontWeight: 600,
                backgroundColor: "#4caf50",
                color: "#fff",
                "&:hover": { backgroundColor: "#388e3c" },
                "&.Mui-disabled": {
                  backgroundColor: colors.primary[300],
                  color: colors.grey[400],
                },
              }}
            >
              Generate Free Units Token
            </Button>

            <TokenDisplay
              token={freeToken}
              onCopy={() => handleCopy(freeToken, setFreeCopied)}
              copied={freeCopied}
              colors={colors}
            />
          </Box>
        </Box>

        {/* ---- Card 3: Key Change Token (span 6, span 3) ---- */}
        <Box
          gridColumn="span 6"
          gridRow="span 3"
          backgroundColor={colors.primary[400]}
          borderRadius="4px"
          p="20px"
          display="flex"
          flexDirection="column"
        >
          <Box display="flex" alignItems="center" gap="12px" mb="15px">
            <Box
              width="40px"
              height="40px"
              borderRadius="4px"
              display="flex"
              alignItems="center"
              justifyContent="center"
              backgroundColor={colors.yellowAccent[900]}
            >
              <VpnKeyOutlined sx={{ color: colors.yellowAccent[500] }} />
            </Box>
            <Box>
              <Typography
                variant="h5"
                fontWeight="600"
                color={colors.grey[100]}
              >
                Key Change Token
              </Typography>
              <Typography variant="body2" color={colors.grey[300]}>
                Change the Supply Group Code encryption key on a meter
              </Typography>
            </Box>
          </Box>

          <TextField
            fullWidth
            label="Meter Number"
            value={keyMeter}
            onChange={(e) => setKeyMeter(e.target.value)}
            sx={{ ...textFieldSx, mb: "15px" }}
          />

          <Box mb="15px">
            <Typography variant="caption" color={colors.grey[300]}>
              Current Key Revision
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: colors.yellowAccent[500],
                fontWeight: 600,
                fontFamily: "monospace",
              }}
            >
              KRN: 1
            </Typography>
          </Box>

          <FormControl fullWidth sx={{ mb: "15px" }}>
            <InputLabel
              sx={{
                color: colors.grey[300],
                "&.Mui-focused": { color: colors.yellowAccent[500] },
              }}
            >
              New Key Revision
            </InputLabel>
            <Select
              value={keyNewRevision}
              label="New Key Revision"
              onChange={(e) => setKeyNewRevision(e.target.value)}
              sx={{
                ...selectSx,
                "&.Mui-focused fieldset": {
                  borderColor: colors.yellowAccent[500],
                },
              }}
              MenuProps={{
                PaperProps: {
                  sx: {
                    backgroundColor: colors.primary[400],
                    color: colors.grey[100],
                  },
                },
              }}
            >
              <MenuItem value={2}>KRN: 2</MenuItem>
              <MenuItem value={3}>KRN: 3</MenuItem>
              <MenuItem value={4}>KRN: 4</MenuItem>
            </Select>
          </FormControl>

          <Alert
            severity="warning"
            sx={{
              mb: "15px",
              backgroundColor: colors.yellowAccent[900],
              color: colors.yellowAccent[500],
              border: `1px solid ${colors.yellowAccent[800]}`,
              "& .MuiAlert-icon": { color: colors.yellowAccent[500] },
            }}
          >
            Key change tokens are irreversible. Ensure the correct meter number
            and key revision before generating.
          </Alert>

          <Box mt="auto">
            <Button
              variant="contained"
              fullWidth
              disabled={!keyMeter || !keyNewRevision}
              onClick={() => setKeyToken(generateToken())}
              sx={{
                py: "10px",
                fontWeight: 600,
                backgroundColor: colors.yellowAccent[500],
                color: colors.primary[500],
                "&:hover": { backgroundColor: colors.yellowAccent[600] },
                "&.Mui-disabled": {
                  backgroundColor: colors.primary[300],
                  color: colors.grey[400],
                },
              }}
            >
              Generate Key Change Token
            </Button>

            <TokenDisplay
              token={keyToken}
              onCopy={() => handleCopy(keyToken, setKeyCopied)}
              copied={keyCopied}
              colors={colors}
            />
          </Box>
        </Box>

        {/* ---- Card 4: Replacement Token (span 6, span 3) ---- */}
        <Box
          gridColumn="span 6"
          gridRow="span 3"
          backgroundColor={colors.primary[400]}
          borderRadius="4px"
          p="20px"
          display="flex"
          flexDirection="column"
        >
          <Box display="flex" alignItems="center" gap="12px" mb="15px">
            <Box
              width="40px"
              height="40px"
              borderRadius="4px"
              display="flex"
              alignItems="center"
              justifyContent="center"
              backgroundColor={colors.blueAccent[900]}
            >
              <RestoreOutlined sx={{ color: colors.blueAccent[500] }} />
            </Box>
            <Box>
              <Typography
                variant="h5"
                fontWeight="600"
                color={colors.grey[100]}
              >
                Replacement Token
              </Typography>
              <Typography variant="body2" color={colors.grey[300]}>
                Re-issue a token for a previous transaction
              </Typography>
            </Box>
          </Box>

          <Box display="flex" gap="8px" mb="15px">
            <TextField
              fullWidth
              label="Original Transaction Reference"
              placeholder="e.g. TXN-100001"
              value={replRef}
              onChange={(e) => {
                setReplRef(e.target.value);
                setReplOriginal(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && handleReplSearch()}
              sx={textFieldSx}
            />
            <Button
              variant="outlined"
              onClick={handleReplSearch}
              sx={{
                minWidth: 48,
                color: colors.blueAccent[500],
                borderColor: colors.blueAccent[700],
                "&:hover": {
                  borderColor: colors.blueAccent[500],
                  backgroundColor: colors.blueAccent[900],
                },
              }}
            >
              <SearchOutlined />
            </Button>
          </Box>

          {replOriginal && (
            <Box
              mb="15px"
              p="15px"
              borderRadius="4px"
              backgroundColor={colors.blueAccent[900]}
              border={`1px solid ${colors.blueAccent[800]}`}
            >
              <Typography
                variant="caption"
                sx={{
                  color: colors.grey[300],
                  display: "block",
                  mb: "8px",
                }}
              >
                Original Transaction Found
              </Typography>
              {[
                ["Ref", replOriginal.refNo],
                ["Customer", replOriginal.customerName],
                ["Meter", replOriginal.meterNo],
                ["Amount", `N$ ${Number(replOriginal.amount).toFixed(2)}`],
                ["kWh", Number(replOriginal.kWh).toFixed(2)],
                ["Date", new Date(replOriginal.dateTime).toLocaleString()],
                ["Status", replOriginal.status],
              ].map(([label, val]) => (
                <Box
                  key={label}
                  display="flex"
                  justifyContent="space-between"
                  mb="4px"
                >
                  <Typography variant="caption" color={colors.grey[300]}>
                    {label}
                  </Typography>
                  <Typography
                    variant="caption"
                    color={colors.grey[100]}
                    fontWeight="500"
                  >
                    {val}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}

          {replRef && !replOriginal && replRef.length >= 5 && (
            <Alert
              severity="info"
              sx={{
                mb: "15px",
                backgroundColor: colors.blueAccent[900],
                color: colors.blueAccent[200],
                border: `1px solid ${colors.blueAccent[800]}`,
                "& .MuiAlert-icon": { color: colors.blueAccent[500] },
              }}
            >
              Enter a transaction reference and click search to look up the
              original transaction.
            </Alert>
          )}

          <Box mt="auto">
            <Button
              variant="contained"
              fullWidth
              disabled={!replOriginal}
              onClick={() => setReplToken(generateToken())}
              sx={{
                py: "10px",
                fontWeight: 600,
                backgroundColor: colors.blueAccent[500],
                color: "#fff",
                "&:hover": { backgroundColor: colors.blueAccent[600] },
                "&.Mui-disabled": {
                  backgroundColor: colors.primary[300],
                  color: colors.grey[400],
                },
              }}
            >
              Generate Replacement Token
            </Button>

            <TokenDisplay
              token={replToken}
              onCopy={() => handleCopy(replToken, setReplCopied)}
              copied={replCopied}
              colors={colors}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
