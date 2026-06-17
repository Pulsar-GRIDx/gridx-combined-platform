import { useState, useCallback } from "react";
import {
  Box, Typography, TextField, Button, CircularProgress, Chip, Divider,
  useTheme, Paper, Grid,
} from "@mui/material";
import {
  SearchOutlined, WaterDropOutlined, PowerOutlined, CheckCircleOutlined,
  CancelOutlined, HelpOutlineOutlined, RefreshOutlined,
} from "@mui/icons-material";
import { tokens } from "../theme";
import Header from "../components/Header";
import { meterAPI, loadControlAPI } from "../services/api";

function ConfidenceChip({ delta }) {
  if (delta === null) return <Chip label="—" size="small" />;
  if (delta >= 2.0) return <Chip label="HIGH CONFIDENCE" size="small" icon={<CheckCircleOutlined />} sx={{ bgcolor: "#e8f5e9", color: "#2e7d32", fontWeight: 700 }} />;
  if (delta >= 0.5) return <Chip label="DETECTED" size="small" icon={<CheckCircleOutlined />} sx={{ bgcolor: "#e8f5e9", color: "#388e3c", fontWeight: 700 }} />;
  if (delta >= 0.2) return <Chip label="UNCERTAIN" size="small" icon={<HelpOutlineOutlined />} sx={{ bgcolor: "#fff8e1", color: "#f57f17", fontWeight: 700 }} />;
  return <Chip label="NOT DETECTED" size="small" icon={<CancelOutlined />} sx={{ bgcolor: "#ffebee", color: "#c62828", fontWeight: 700 }} />;
}

function MetricBox({ label, value, unit, color, colors }) {
  return (
    <Box sx={{ bgcolor: colors.primary[400], borderRadius: "8px", p: "14px 18px", textAlign: "center", flex: 1 }}>
      <Typography fontSize="11px" color={colors.grey[400]} mb="4px">{label}</Typography>
      <Typography fontSize="24px" fontWeight="700" color={color || colors.grey[100]} fontFamily="monospace">
        {value !== null && value !== undefined ? value : "—"}
      </Typography>
      {unit && <Typography fontSize="10px" color={colors.grey[500]}>{unit}</Typography>}
    </Box>
  );
}

function RelayBadge({ label, state }) {
  var isOn = state === 1 || state === true || state === "1";
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: isOn ? "#4caf50" : "#f44336" }} />
      <Typography fontSize="12px" color={isOn ? "#4caf50" : "#f44336"} fontWeight="600">
        {label}: {isOn ? "ON" : "OFF"}
      </Typography>
    </Box>
  );
}

export default function GeyserDetection() {
  var theme = useTheme();
  var colors = tokens(theme.palette.mode);

  var [drn, setDrn] = useState("");
  var [loading, setLoading] = useState(false);
  var [testing, setTesting] = useState(false);
  var [error, setError] = useState(null);

  var [powerData, setPowerData] = useState(null);
  var [mainsState, setMainsState] = useState(null);
  var [geyserState, setGeyserState] = useState(null);

  var [baselineCurrent, setBaselineCurrent] = useState(null);
  var [geyserOnCurrent, setGeyserOnCurrent] = useState(null);
  var [delta, setDelta] = useState(null);
  var [testLog, setTestLog] = useState([]);
  var [testDone, setTestDone] = useState(false);

  function log(msg) {
    setTestLog(function(prev) { return [...prev, "[" + new Date().toLocaleTimeString() + "] " + msg]; });
  }

  var fetchStatus = useCallback(async function() {
    if (!drn.trim()) return;
    setLoading(true);
    setError(null);
    try {
      var [pwr, mains, geyser] = await Promise.all([
        meterAPI.getPower(drn.trim()).catch(function() { return null; }),
        loadControlAPI.getMainsState(drn.trim()).catch(function() { return null; }),
        loadControlAPI.getHeaterState(drn.trim()).catch(function() { return null; }),
      ]);
      setPowerData(pwr);
      setMainsState(mains);
      setGeyserState(geyser);
    } catch (e) {
      setError("Failed to fetch meter data: " + e.message);
    } finally {
      setLoading(false);
    }
  }, [drn]);

  async function runDetectionTest() {
    if (!drn.trim()) return;
    setTesting(true);
    setTestDone(false);
    setBaselineCurrent(null);
    setGeyserOnCurrent(null);
    setDelta(null);
    setTestLog([]);

    try {
      log("Step 1: Ensuring mains ON...");
      await loadControlAPI.setMains(drn.trim(), 1, "GeyserDetection", "detection-test");
      await delay(3000);

      log("Step 2: Setting geyser OFF for baseline...");
      await loadControlAPI.setHeater(drn.trim(), 0, "GeyserDetection", "detection-test");
      await delay(4000);

      log("Step 3: Reading baseline current...");
      var base = await meterAPI.getPower(drn.trim());
      var baseCurrent = base ? (base.current || base.Current || base.I || 0) : 0;
      setBaselineCurrent(baseCurrent);
      log("Baseline current: " + baseCurrent.toFixed(3) + " A");

      log("Step 4: Turning geyser ON...");
      await loadControlAPI.setHeater(drn.trim(), 1, "GeyserDetection", "detection-test");
      await delay(6000);

      log("Step 5: Reading current with geyser ON...");
      var on = await meterAPI.getPower(drn.trim());
      var onCurrent = on ? (on.current || on.Current || on.I || 0) : 0;
      setGeyserOnCurrent(onCurrent);
      log("Geyser-ON current: " + onCurrent.toFixed(3) + " A");

      var d = onCurrent - baseCurrent;
      setDelta(d);
      log("Delta: " + d.toFixed(3) + " A — " + (d >= 0.5 ? "Geyser DETECTED" : d >= 0.2 ? "Uncertain" : "Not detected"));

      log("Step 6: Restoring geyser OFF...");
      await loadControlAPI.setHeater(drn.trim(), 0, "GeyserDetection", "detection-test");

      await fetchStatus();
      setTestDone(true);
    } catch (e) {
      log("ERROR: " + e.message);
    } finally {
      setTesting(false);
    }
  }

  function delay(ms) {
    return new Promise(function(r) { setTimeout(r, ms); });
  }

  var current = powerData
    ? (powerData.current ?? powerData.Current ?? powerData.I ?? null)
    : null;
  var voltage = powerData
    ? (powerData.voltage ?? powerData.Voltage ?? powerData.V ?? null)
    : null;
  var power = powerData
    ? (powerData.activePower ?? powerData.active_power ?? powerData.P ?? powerData.power ?? null)
    : null;

  return (
    <Box m="20px">
      <Header title="GEYSER DETECTION" subtitle="Detect geyser load via current delta when relay toggles" />

      {/* DRN Search */}
      <Box display="flex" gap="12px" mb="24px" alignItems="center">
        <TextField
          label="Meter DRN"
          value={drn}
          onChange={function(e) { setDrn(e.target.value); }}
          onKeyDown={function(e) { if (e.key === "Enter") fetchStatus(); }}
          size="small"
          sx={{ width: 280 }}
          placeholder="e.g. 0260152877924"
        />
        <Button
          variant="contained"
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <SearchOutlined />}
          onClick={fetchStatus}
          disabled={loading || !drn.trim()}
        >
          Fetch Status
        </Button>
      </Box>

      {error && (
        <Typography color="error" mb="16px">{error}</Typography>
      )}

      {/* Live status panel */}
      {powerData && (
        <Paper sx={{ bgcolor: colors.primary[400], p: "20px", mb: "20px", borderRadius: "10px" }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb="16px">
            <Typography fontWeight="700" color={colors.grey[100]} fontSize="14px">
              LIVE STATUS — {drn.trim()}
            </Typography>
            <Button size="small" startIcon={<RefreshOutlined />} onClick={fetchStatus} disabled={loading}>
              Refresh
            </Button>
          </Box>

          <Box display="flex" gap="10px" mb="16px" flexWrap="wrap">
            <RelayBadge label="Mains" state={mainsState ? (mainsState.state ?? mainsState.State) : null} />
            <RelayBadge label="Geyser" state={geyserState ? (geyserState.state ?? geyserState.State) : null} />
          </Box>

          <Box display="flex" gap="10px" flexWrap="wrap">
            <MetricBox label="Current" value={current !== null ? current.toFixed(3) : null} unit="A" color={colors.greenAccent[400]} colors={colors} />
            <MetricBox label="Voltage" value={voltage !== null ? voltage.toFixed(1) : null} unit="V" color={colors.blueAccent[300]} colors={colors} />
            <MetricBox label="Active Power" value={power !== null ? Math.round(power) : null} unit="W" colors={colors} />
          </Box>
        </Paper>
      )}

      {/* Detection Test */}
      <Paper sx={{ bgcolor: colors.primary[400], p: "20px", mb: "20px", borderRadius: "10px" }}>
        <Box display="flex" alignItems="center" gap="10px" mb="16px">
          <WaterDropOutlined sx={{ color: colors.blueAccent[400] }} />
          <Typography fontWeight="700" color={colors.grey[100]} fontSize="14px">
            GEYSER DETECTION TEST
          </Typography>
        </Box>

        <Typography fontSize="12px" color={colors.grey[400]} mb="16px">
          This test toggles the geyser relay and measures the current delta. A current increase ≥ 0.5 A confirms a geyser load is present.
          The mains relay will be enabled automatically as a prerequisite.
        </Typography>

        <Button
          variant="contained"
          startIcon={testing ? <CircularProgress size={16} color="inherit" /> : <PowerOutlined />}
          onClick={runDetectionTest}
          disabled={testing || !drn.trim()}
          sx={{ mb: "20px", bgcolor: colors.blueAccent[600] }}
        >
          {testing ? "Running Detection Test..." : "Run Detection Test"}
        </Button>

        {(baselineCurrent !== null || geyserOnCurrent !== null || delta !== null) && (
          <>
            <Divider sx={{ mb: "16px" }} />
            <Grid container spacing={2} mb="16px">
              <Grid item xs={12} sm={4}>
                <Box sx={{ bgcolor: colors.primary[300], borderRadius: "8px", p: "14px", textAlign: "center" }}>
                  <Typography fontSize="10px" color={colors.grey[400]} mb="4px">BASELINE (Geyser OFF)</Typography>
                  <Typography fontSize="22px" fontWeight="700" fontFamily="monospace" color={colors.grey[100]}>
                    {baselineCurrent !== null ? baselineCurrent.toFixed(3) : "—"} A
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Box sx={{ bgcolor: colors.primary[300], borderRadius: "8px", p: "14px", textAlign: "center" }}>
                  <Typography fontSize="10px" color={colors.grey[400]} mb="4px">GEYSER ON CURRENT</Typography>
                  <Typography fontSize="22px" fontWeight="700" fontFamily="monospace" color={colors.greenAccent[400]}>
                    {geyserOnCurrent !== null ? geyserOnCurrent.toFixed(3) : "—"} A
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Box sx={{ bgcolor: colors.primary[300], borderRadius: "8px", p: "14px", textAlign: "center" }}>
                  <Typography fontSize="10px" color={colors.grey[400]} mb="4px">CURRENT DELTA</Typography>
                  <Typography fontSize="22px" fontWeight="700" fontFamily="monospace"
                    color={delta !== null && delta >= 0.5 ? "#4caf50" : delta !== null && delta >= 0.2 ? "#ff9800" : "#f44336"}>
                    {delta !== null ? "+" + delta.toFixed(3) : "—"} A
                  </Typography>
                  <Box mt="6px">
                    <ConfidenceChip delta={delta} />
                  </Box>
                </Box>
              </Grid>
            </Grid>
          </>
        )}

        {testLog.length > 0 && (
          <Box sx={{ bgcolor: "#0d1117", borderRadius: "6px", p: "12px", fontFamily: "monospace", fontSize: "11px", color: "#58a6ff", maxHeight: "180px", overflowY: "auto" }}>
            {testLog.map(function(line, i) {
              return <Box key={i}>{line}</Box>;
            })}
          </Box>
        )}
      </Paper>
    </Box>
  );
}
