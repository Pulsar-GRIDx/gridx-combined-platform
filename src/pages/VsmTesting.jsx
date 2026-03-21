import { useState, useEffect, useRef, useCallback } from "react";
import {
  Box, Typography, useTheme, Tabs, Tab, Button, TextField, Select, MenuItem,
  FormControl, InputLabel, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Chip, IconButton, Tooltip, Alert, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, Divider, Switch, FormControlLabel,
} from "@mui/material";
import { tokens } from "../theme";
import UsbIcon from "@mui/icons-material/Usb";
import UsbOffIcon from "@mui/icons-material/UsbOff";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import VpnKeyIcon from "@mui/icons-material/VpnKey";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import RefreshIcon from "@mui/icons-material/Refresh";
import SendIcon from "@mui/icons-material/Send";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import TerminalIcon from "@mui/icons-material/Terminal";
import WifiIcon from "@mui/icons-material/Wifi";
import WifiOffIcon from "@mui/icons-material/WifiOff";
import { vsmAPI } from "../services/api";

/* ═══════════════════════════════════════════════════════════════════
   HELPER: format timestamp
   ═══════════════════════════════════════════════════════════════════ */
const fmtTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3 });
};

/* ═══════════════════════════════════════════════════════════════════
   WEB SERIAL HELPER HOOK
   ═══════════════════════════════════════════════════════════════════ */
function useSerial() {
  const [port, setPort] = useState(null);
  const [connected, setConnected] = useState(false);
  const [portInfo, setPortInfo] = useState(null);
  const readerRef = useRef(null);
  const writerRef = useRef(null);
  const bufferRef = useRef("");
  const onDataRef = useRef(null);

  const isSupported = typeof navigator !== "undefined" && "serial" in navigator;

  const connect = useCallback(async (baudRate = 9600, dataBits = 8, stopBits = 1, parity = "none") => {
    if (!isSupported) throw new Error("Web Serial API not supported. Use Chrome or Edge.");
    const p = await navigator.serial.requestPort();
    await p.open({ baudRate, dataBits, stopBits, parity });
    setPort(p);
    setConnected(true);
    const info = p.getInfo();
    setPortInfo({ vendorId: info.usbVendorId, productId: info.usbProductId });

    // Start reader loop
    const reader = p.readable.getReader();
    readerRef.current = reader;
    writerRef.current = p.writable.getWriter();

    (async () => {
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const text = decoder.decode(value);
          bufferRef.current += text;
          if (onDataRef.current) onDataRef.current(text, bufferRef.current);
        }
      } catch (e) {
        if (e.name !== "NetworkError") console.error("Serial read error:", e);
      }
    })();

    return p;
  }, [isSupported]);

  const disconnect = useCallback(async () => {
    try {
      if (readerRef.current) { await readerRef.current.cancel(); readerRef.current = null; }
      if (writerRef.current) { writerRef.current.releaseLock(); writerRef.current = null; }
      if (port) { await port.close(); }
    } catch (e) { /* ignore close errors */ }
    setPort(null);
    setConnected(false);
    setPortInfo(null);
    bufferRef.current = "";
  }, [port]);

  const send = useCallback(async (data) => {
    if (!writerRef.current) throw new Error("Not connected");
    const encoder = new TextEncoder();
    const bytes = typeof data === "string" ? encoder.encode(data) : data;
    await writerRef.current.write(bytes);
  }, []);

  const sendHex = useCallback(async (hexString) => {
    if (!writerRef.current) throw new Error("Not connected");
    const clean = hexString.replace(/\s/g, "");
    const bytes = new Uint8Array(clean.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
    await writerRef.current.write(bytes);
  }, []);

  const clearBuffer = useCallback(() => { bufferRef.current = ""; }, []);

  const setOnData = useCallback((fn) => { onDataRef.current = fn; }, []);

  return { isSupported, port, connected, portInfo, connect, disconnect, send, sendHex, clearBuffer, setOnData, buffer: bufferRef };
}

/* ═══════════════════════════════════════════════════════════════════
   WEBSOCKET HELPER HOOK (for TCP mode)
   ═══════════════════════════════════════════════════════════════════ */
function useWebSocket() {
  const [ws, setWs] = useState(null);
  const [connected, setConnected] = useState(false);
  const [connInfo, setConnInfo] = useState(null);
  const bufferRef = useRef("");
  const onDataRef = useRef(null);

  const connect = useCallback(async (host, port) => {
    return new Promise((resolve, reject) => {
      const url = `ws://${host}:${port}`;
      const socket = new WebSocket(url);
      socket.binaryType = "arraybuffer";

      const timeout = setTimeout(() => {
        socket.close();
        reject(new Error(`Connection timeout to ${url}`));
      }, 5000);

      socket.onopen = () => {
        clearTimeout(timeout);
        setWs(socket);
        setConnected(true);
        setConnInfo({ host, port, url });
        resolve(socket);
      };

      socket.onmessage = (event) => {
        let text;
        if (event.data instanceof ArrayBuffer) {
          text = new TextDecoder().decode(event.data);
        } else {
          text = event.data;
        }
        bufferRef.current += text;
        if (onDataRef.current) onDataRef.current(text, bufferRef.current);
      };

      socket.onerror = (err) => {
        clearTimeout(timeout);
        reject(new Error(`WebSocket error connecting to ${url}`));
      };

      socket.onclose = () => {
        setWs(null);
        setConnected(false);
        setConnInfo(null);
      };
    });
  }, []);

  const disconnect = useCallback(async () => {
    if (ws) { ws.close(); }
    setWs(null);
    setConnected(false);
    setConnInfo(null);
    bufferRef.current = "";
  }, [ws]);

  const send = useCallback(async (data) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error("Not connected");
    if (typeof data === "string") {
      ws.send(data);
    } else {
      ws.send(data);
    }
  }, [ws]);

  const sendHex = useCallback(async (hexString) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error("Not connected");
    const clean = hexString.replace(/\s/g, "");
    const bytes = new Uint8Array(clean.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
    ws.send(bytes.buffer);
  }, [ws]);

  const clearBuffer = useCallback(() => { bufferRef.current = ""; }, []);
  const setOnData = useCallback((fn) => { onDataRef.current = fn; }, []);

  return { connected, connInfo, connect, disconnect, send, sendHex, clearBuffer, setOnData, buffer: bufferRef };
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE COMPONENT
   ═══════════════════════════════════════════════════════════════════ */
export default function VsmTesting() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const isDark = theme.palette.mode === "dark";
  const [tab, setTab] = useState(0);

  // Connection mode: "serial" or "tcp"
  const [connMode, setConnMode] = useState("serial");

  // Serial
  const serial = useSerial();
  const [baudRate, setBaudRate] = useState(9600);
  const [dataBits, setDataBits] = useState(8);
  const [stopBits, setStopBits] = useState(1);
  const [parity, setParity] = useState("none");
  const [serialLog, setSerialLog] = useState([]);
  const [connectError, setConnectError] = useState("");

  // TCP/WebSocket
  const tcp = useWebSocket();
  const [tcpHost, setTcpHost] = useState("localhost");
  const [tcpPort, setTcpPort] = useState("9000");

  // Unified connection status
  const isConnected = connMode === "serial" ? serial.connected : tcp.connected;
  const activeConn = connMode === "serial" ? serial : tcp;

  // Token generation
  const [meterNo, setMeterNo] = useState("");
  const [amount, setAmount] = useState("");
  const [serverResult, setServerResult] = useState(null);
  const [vsmResult, setVsmResult] = useState(null);
  const [serverLoading, setServerLoading] = useState(false);
  const [vsmLoading, setVsmLoading] = useState(false);
  const [dataFlow, setDataFlow] = useState([]);

  // Raw serial I/O
  const [rawInput, setRawInput] = useState("");
  const [hexMode, setHexMode] = useState(false);

  // Keys
  const [keys, setKeys] = useState([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [keyDialog, setKeyDialog] = useState(false);
  const [editKey, setEditKey] = useState(null);

  // Comparison
  const [comparisonHistory, setComparisonHistory] = useState([]);

  // Card style
  const cardBg = isDark ? colors.primary[400] : "#ffffff";
  const cardBorder = isDark ? colors.primary[300] : colors.grey[800];

  /* ── Serial data handler ── */
  useEffect(() => {
    serial.setOnData((chunk, full) => {
      setSerialLog((prev) => [...prev, { time: new Date().toISOString(), dir: "RX", data: chunk }]);
    });
  }, [serial.setOnData]);

  /* ── TCP data handler ── */
  useEffect(() => {
    tcp.setOnData((chunk, full) => {
      setSerialLog((prev) => [...prev, { time: new Date().toISOString(), dir: "RX", data: chunk }]);
    });
  }, [tcp.setOnData]);

  /* ── Load keys on mount ── */
  useEffect(() => { loadKeys(); }, []);

  async function loadKeys() {
    setKeysLoading(true);
    try {
      const res = await vsmAPI.getKeys();
      setKeys(res.keys || []);
    } catch (e) { console.error(e); }
    setKeysLoading(false);
  }

  /* ── Connect/disconnect ── */
  async function handleConnect() {
    setConnectError("");
    try {
      if (connMode === "serial") {
        await serial.connect(baudRate, dataBits, stopBits, parity);
        setSerialLog((prev) => [...prev, { time: new Date().toISOString(), dir: "SYS", data: `Connected via COM port at ${baudRate} baud` }]);
      } else {
        await tcp.connect(tcpHost, tcpPort);
        setSerialLog((prev) => [...prev, { time: new Date().toISOString(), dir: "SYS", data: `Connected via WebSocket to ${tcpHost}:${tcpPort}` }]);
      }
    } catch (e) {
      setConnectError(e.message);
    }
  }
  async function handleDisconnect() {
    if (connMode === "serial") {
      await serial.disconnect();
    } else {
      await tcp.disconnect();
    }
    setSerialLog((prev) => [...prev, { time: new Date().toISOString(), dir: "SYS", data: "Disconnected" }]);
  }

  /* ── Send raw data ── */
  async function handleSendRaw() {
    if (!rawInput.trim()) return;
    try {
      if (hexMode) {
        await activeConn.sendHex(rawInput);
      } else {
        await activeConn.send(rawInput + "\r\n");
      }
      setSerialLog((prev) => [...prev, { time: new Date().toISOString(), dir: "TX", data: rawInput }]);
      setRawInput("");
    } catch (e) {
      setSerialLog((prev) => [...prev, { time: new Date().toISOString(), dir: "ERR", data: e.message }]);
    }
  }

  /* ── Generate token via SERVER ── */
  async function handleServerGenerate() {
    if (!meterNo || !amount) return;
    setServerLoading(true);
    setServerResult(null);
    try {
      const res = await vsmAPI.serverGenerate({ meterNo, amount: parseFloat(amount) });
      setServerResult(res);
      setDataFlow(res.dataFlow || []);
    } catch (e) {
      setServerResult({ error: e.message });
    }
    setServerLoading(false);
  }

  /* ── Generate token via VSM (serial or TCP) ── */
  async function handleVsmGenerate() {
    if (!isConnected) {
      setVsmResult({ error: "Not connected to VSM. Please connect via COM port or TCP first." });
      return;
    }
    if (!meterNo || !amount) return;
    setVsmLoading(true);
    setVsmResult(null);

    const transportLabel = connMode === "serial" ? "COM port" : "TCP/WebSocket";

    // Build STS vending request payload
    const payload = buildVsmRequest(meterNo, amount);
    const payloadHex = Array.from(payload).map((b) => b.toString(16).padStart(2, "0")).join(" ");

    setSerialLog((prev) => [...prev, { time: new Date().toISOString(), dir: "TX", data: `VSM Request: ${payloadHex}` }]);

    // Add to data flow
    setDataFlow((prev) => [
      ...prev,
      {
        step: prev.length + 1,
        label: `VSM ${transportLabel} Request`,
        direction: "outbound",
        timestamp: new Date().toISOString(),
        data: { hex: payloadHex, description: `Sent to VSM via ${transportLabel}` },
      },
    ]);

    try {
      await activeConn.sendHex(payloadHex);
      // Wait for response with timeout
      activeConn.clearBuffer();
      const response = await waitForResponse(3000);
      setSerialLog((prev) => [...prev, { time: new Date().toISOString(), dir: "RX", data: `VSM Response: ${response}` }]);
      setDataFlow((prev) => [
        ...prev,
        {
          step: prev.length + 1,
          label: `VSM ${transportLabel} Response`,
          direction: "inbound",
          timestamp: new Date().toISOString(),
          data: { raw: response, description: `Received from VSM via ${transportLabel}` },
        },
      ]);
      const parsed = parseVsmResponse(response);
      setVsmResult(parsed);
    } catch (e) {
      setVsmResult({ error: e.message });
    }
    setVsmLoading(false);
  }

  function buildVsmRequest(meter, amt) {
    // Build a basic STS token request frame
    // Format: [STX][LEN][CMD][METER_NO][AMOUNT][CRC][ETX]
    const stx = 0x02;
    const etx = 0x03;
    const cmd = 0x10; // vend command
    const meterBytes = new TextEncoder().encode(meter.padEnd(20, " "));
    const amtStr = parseFloat(amt).toFixed(2).padStart(12, "0");
    const amtBytes = new TextEncoder().encode(amtStr);
    const len = 1 + meterBytes.length + amtBytes.length;
    const frame = new Uint8Array(3 + len + 1);
    frame[0] = stx;
    frame[1] = len;
    frame[2] = cmd;
    frame.set(meterBytes, 3);
    frame.set(amtBytes, 3 + meterBytes.length);
    // Simple XOR checksum
    let crc = 0;
    for (let i = 1; i < frame.length - 1; i++) crc ^= frame[i];
    frame[frame.length - 1] = etx;
    return frame;
  }

  function waitForResponse(timeoutMs) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const conn = activeConn;
      const check = setInterval(() => {
        const buf = conn.buffer.current;
        if (buf.length > 0 && (buf.includes("\x03") || buf.includes("\n"))) {
          clearInterval(check);
          conn.clearBuffer();
          resolve(buf);
        }
        if (Date.now() - start > timeoutMs) {
          clearInterval(check);
          const partial = conn.buffer.current;
          conn.clearBuffer();
          resolve(partial || "(no response within timeout)");
        }
      }, 50);
    });
  }

  function parseVsmResponse(raw) {
    // Try to extract a 20-digit token from the response
    const tokenMatch = raw.match(/(\d{20})/);
    if (tokenMatch) {
      return { success: true, token: tokenMatch[1], raw: raw };
    }
    return { success: false, raw: raw, error: "Could not parse token from VSM response" };
  }

  /* ── Run comparison ── */
  async function handleCompare() {
    if (!serverResult && !vsmResult) return;
    const sToken = serverResult && !serverResult.error ? serverResult.token : null;
    const vToken = vsmResult && !vsmResult.error ? vsmResult.token : null;
    const matched = sToken && vToken && sToken === vToken;
    const entry = {
      time: new Date().toISOString(),
      meterNo,
      amount,
      serverToken: sToken,
      vsmToken: vToken,
      matched,
    };
    setComparisonHistory((prev) => [entry, ...prev]);

    // Log to backend
    try {
      await vsmAPI.logComparison({
        meterNo, amount: parseFloat(amount),
        serverToken: sToken, vsmToken: vToken, matched,
        serverResponse: serverResult, vsmResponse: vsmResult, dataFlow,
      });
    } catch (e) { /* ignore */ }
  }

  /* ── Key save ── */
  async function handleSaveKey() {
    if (!editKey) return;
    try {
      await vsmAPI.saveKey(editKey);
      setKeyDialog(false);
      setEditKey(null);
      loadKeys();
    } catch (e) { alert(e.message); }
  }

  async function handleDeleteKey(id) {
    if (!window.confirm("Delete this key?")) return;
    try { await vsmAPI.deleteKey(id); loadKeys(); } catch (e) { alert(e.message); }
  }

  /* ═══════════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════════ */
  const accent = "#00bfa5";
  const accentDim = accent + "30";

  return (
    <Box sx={{ p: 3, maxWidth: 1400, mx: "auto" }}>
      {/* Header */}
      <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: "-0.5px", mb: 0.5 }}>
        STS VSM TESTING
      </Typography>
      <Typography sx={{ color: accent, fontWeight: 500, fontSize: "14px", mb: 3 }}>
        Virtual Security Module — Token Generation & Validation
      </Typography>
      <Divider sx={{ mb: 2, borderColor: accent + "40" }} />

      {/* Connection status bar */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3, p: 2, borderRadius: "12px", bgcolor: cardBg, border: `1px solid ${cardBorder}` }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {isConnected ? (
            connMode === "serial" ? <UsbIcon sx={{ color: "#4caf50", fontSize: 28 }} /> : <WifiIcon sx={{ color: "#4caf50", fontSize: 28 }} />
          ) : (
            connMode === "serial" ? <UsbOffIcon sx={{ color: colors.grey[500], fontSize: 28 }} /> : <WifiOffIcon sx={{ color: colors.grey[500], fontSize: 28 }} />
          )}
          <Box>
            <Typography sx={{ fontSize: "13px", fontWeight: 600 }}>
              {connMode === "serial" ? "COM Port" : "TCP/WebSocket"}: {isConnected ? "Connected" : "Disconnected"}
            </Typography>
            {connMode === "serial" && serial.portInfo && (
              <Typography sx={{ fontSize: "11px", color: colors.grey[400] }}>
                Vendor: {serial.portInfo.vendorId || "N/A"} | Product: {serial.portInfo.productId || "N/A"}
              </Typography>
            )}
            {connMode === "tcp" && tcp.connInfo && (
              <Typography sx={{ fontSize: "11px", color: colors.grey[400] }}>
                {tcp.connInfo.url}
              </Typography>
            )}
          </Box>
        </Box>
        <Chip
          label={isConnected ? "Online" : "Offline"}
          size="small"
          sx={{
            bgcolor: isConnected ? "#4caf5020" : colors.grey[700] + "40",
            color: isConnected ? "#4caf50" : colors.grey[400],
            fontWeight: 600, fontSize: "11px",
          }}
        />
        <Chip
          label={connMode === "serial" ? "Serial" : "TCP"}
          size="small"
          sx={{
            bgcolor: connMode === "serial" ? "#2196f320" : "#ff980020",
            color: connMode === "serial" ? "#2196f3" : "#ff9800",
            fontWeight: 600, fontSize: "11px",
          }}
        />
        {connMode === "serial" && !serial.isSupported && (
          <Alert severity="warning" sx={{ ml: "auto", py: 0, fontSize: "12px" }}>
            Web Serial API requires Chrome or Edge browser
          </Alert>
        )}
      </Box>

      {/* Tabs */}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{
          mb: 3,
          "& .MuiTab-root": { textTransform: "none", fontWeight: 600, fontSize: "13px" },
          "& .Mui-selected": { color: accent },
          "& .MuiTabs-indicator": { bgcolor: accent },
        }}
      >
        <Tab icon={<UsbIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Connection" />
        <Tab icon={<PlayArrowIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Token Generation" />
        <Tab icon={<CompareArrowsIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Comparison View" />
        <Tab icon={<VpnKeyIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Key Management" />
      </Tabs>

      {/* ═══ TAB 0: CONNECTION ═══ */}
      {tab === 0 && (
        <Box>
          {/* Connection Mode Toggle */}
          <Box sx={{ display: "flex", gap: 1, mb: 3 }}>
            <Button
              variant={connMode === "serial" ? "contained" : "outlined"}
              startIcon={<UsbIcon />}
              onClick={() => { if (!isConnected) setConnMode("serial"); }}
              disabled={isConnected}
              sx={connMode === "serial" ? { bgcolor: "#2196f3", "&:hover": { bgcolor: "#1976d2" } } : { borderColor: colors.grey[500], color: colors.grey[400] }}
            >
              Serial (COM Port)
            </Button>
            <Button
              variant={connMode === "tcp" ? "contained" : "outlined"}
              startIcon={<WifiIcon />}
              onClick={() => { if (!isConnected) setConnMode("tcp"); }}
              disabled={isConnected}
              sx={connMode === "tcp" ? { bgcolor: "#ff9800", "&:hover": { bgcolor: "#f57c00" } } : { borderColor: colors.grey[500], color: colors.grey[400] }}
            >
              TCP (WebSocket)
            </Button>
          </Box>

          {/* Connection settings */}
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, mb: 3 }}>
            <Box sx={{ p: 3, borderRadius: "12px", bgcolor: cardBg, border: `1px solid ${cardBorder}` }}>
              <Typography sx={{ fontWeight: 700, fontSize: "15px", mb: 2 }}>
                {connMode === "serial" ? "Serial Port Settings" : "TCP/WebSocket Settings"}
              </Typography>

              {connMode === "serial" ? (
                <>
                  <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
                    <FormControl size="small" fullWidth>
                      <InputLabel>Baud Rate</InputLabel>
                      <Select value={baudRate} onChange={(e) => setBaudRate(e.target.value)} label="Baud Rate">
                        {[1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].map((r) => (
                          <MenuItem key={r} value={r}>{r}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl size="small" fullWidth>
                      <InputLabel>Data Bits</InputLabel>
                      <Select value={dataBits} onChange={(e) => setDataBits(e.target.value)} label="Data Bits">
                        {[7, 8].map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                      </Select>
                    </FormControl>
                    <FormControl size="small" fullWidth>
                      <InputLabel>Stop Bits</InputLabel>
                      <Select value={stopBits} onChange={(e) => setStopBits(e.target.value)} label="Stop Bits">
                        {[1, 2].map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                      </Select>
                    </FormControl>
                    <FormControl size="small" fullWidth>
                      <InputLabel>Parity</InputLabel>
                      <Select value={parity} onChange={(e) => setParity(e.target.value)} label="Parity">
                        {["none", "even", "odd"].map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Box>
                </>
              ) : (
                <Box sx={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 2 }}>
                  <TextField size="small" label="Host / IP Address" value={tcpHost} onChange={(e) => setTcpHost(e.target.value)}
                    placeholder="e.g. localhost or 192.168.1.100" disabled={isConnected} />
                  <TextField size="small" label="Port" value={tcpPort} onChange={(e) => setTcpPort(e.target.value)}
                    type="number" placeholder="e.g. 9000" disabled={isConnected} />
                </Box>
              )}

              <Box sx={{ mt: 2, display: "flex", gap: 2 }}>
                {!isConnected ? (
                  <Button variant="contained" startIcon={connMode === "serial" ? <UsbIcon /> : <WifiIcon />} onClick={handleConnect}
                    sx={{ bgcolor: accent, "&:hover": { bgcolor: "#009688" } }}>
                    {connMode === "serial" ? "Select COM Port & Connect" : "Connect via WebSocket"}
                  </Button>
                ) : (
                  <Button variant="outlined" color="error" startIcon={connMode === "serial" ? <UsbOffIcon /> : <WifiOffIcon />} onClick={handleDisconnect}>
                    Disconnect
                  </Button>
                )}
              </Box>
              {connectError && <Alert severity="error" sx={{ mt: 2, fontSize: "12px" }}>{connectError}</Alert>}

              {connMode === "tcp" && !isConnected && (
                <Alert severity="info" sx={{ mt: 2, fontSize: "12px" }}>
                  Start the VSM Simulator in TCP mode: <strong>node vsm-simulator.js --tcp 9000</strong>
                </Alert>
              )}
            </Box>

            {/* Raw I/O */}
            <Box sx={{ p: 3, borderRadius: "12px", bgcolor: cardBg, border: `1px solid ${cardBorder}` }}>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
                <Typography sx={{ fontWeight: 700, fontSize: "15px" }}>Raw I/O</Typography>
                <FormControlLabel
                  control={<Switch checked={hexMode} onChange={(e) => setHexMode(e.target.checked)} size="small" />}
                  label={<Typography sx={{ fontSize: "12px" }}>Hex Mode</Typography>}
                />
              </Box>
              <Box sx={{ display: "flex", gap: 1 }}>
                <TextField
                  size="small" fullWidth
                  placeholder={hexMode ? "Enter hex bytes (e.g. 02 10 FF 03)" : "Enter text command..."}
                  value={rawInput} onChange={(e) => setRawInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendRaw()}
                  disabled={!isConnected}
                  sx={{ "& .MuiInputBase-input": { fontFamily: "monospace", fontSize: "13px" } }}
                />
                <Button variant="contained" onClick={handleSendRaw} disabled={!isConnected}
                  sx={{ bgcolor: accent, "&:hover": { bgcolor: "#009688" }, minWidth: 80 }}>
                  <SendIcon sx={{ fontSize: 18 }} />
                </Button>
              </Box>
            </Box>
          </Box>

          {/* Serial console */}
          <Box sx={{ p: 3, borderRadius: "12px", bgcolor: cardBg, border: `1px solid ${cardBorder}` }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <TerminalIcon sx={{ color: accent, fontSize: 20 }} />
                <Typography sx={{ fontWeight: 700, fontSize: "15px" }}>Serial Console</Typography>
              </Box>
              <Button size="small" onClick={() => setSerialLog([])} sx={{ color: colors.grey[400], fontSize: "11px" }}>
                Clear
              </Button>
            </Box>
            <Box sx={{
              height: 300, overflowY: "auto", bgcolor: isDark ? "#0d1117" : "#f5f5f5",
              borderRadius: "8px", p: 2, fontFamily: "monospace", fontSize: "12px",
              border: `1px solid ${isDark ? "#30363d" : "#e0e0e0"}`,
            }}>
              {serialLog.length === 0 ? (
                <Typography sx={{ color: colors.grey[500], fontSize: "12px", fontStyle: "italic" }}>
                  No data yet. Connect via COM port or TCP to begin.
                </Typography>
              ) : (
                serialLog.map((entry, i) => (
                  <Box key={i} sx={{ display: "flex", gap: 1, mb: 0.5 }}>
                    <Typography sx={{ color: colors.grey[500], fontSize: "11px", minWidth: 80, fontFamily: "monospace" }}>
                      {fmtTime(entry.time)}
                    </Typography>
                    <Chip
                      label={entry.dir}
                      size="small"
                      sx={{
                        height: 18, fontSize: "10px", fontWeight: 700, minWidth: 32,
                        bgcolor: entry.dir === "TX" ? "#2196f320" : entry.dir === "RX" ? "#4caf5020" : entry.dir === "ERR" ? "#f4433620" : "#ff980020",
                        color: entry.dir === "TX" ? "#2196f3" : entry.dir === "RX" ? "#4caf50" : entry.dir === "ERR" ? "#f44336" : "#ff9800",
                      }}
                    />
                    <Typography sx={{ fontSize: "12px", fontFamily: "monospace", wordBreak: "break-all", color: isDark ? "#e6edf3" : "#1f2328" }}>
                      {entry.data}
                    </Typography>
                  </Box>
                ))
              )}
            </Box>
          </Box>
        </Box>
      )}

      {/* ═══ TAB 1: TOKEN GENERATION ═══ */}
      {tab === 1 && (
        <Box>
          {/* Input form */}
          <Box sx={{ p: 3, borderRadius: "12px", bgcolor: cardBg, border: `1px solid ${cardBorder}`, mb: 3 }}>
            <Typography sx={{ fontWeight: 700, fontSize: "15px", mb: 2 }}>Token Generation Parameters</Typography>
            <Box sx={{ display: "flex", gap: 2, alignItems: "flex-end", flexWrap: "wrap" }}>
              <TextField size="small" label="Meter Number (DRN)" value={meterNo} onChange={(e) => setMeterNo(e.target.value)}
                sx={{ minWidth: 220 }} placeholder="e.g. 0260066545641" />
              <TextField size="small" label="Amount (N$)" value={amount} onChange={(e) => setAmount(e.target.value)}
                type="number" sx={{ minWidth: 160 }} placeholder="e.g. 100.00" />
              <Button variant="contained" startIcon={serverLoading ? <CircularProgress size={16} /> : <PlayArrowIcon />}
                onClick={handleServerGenerate} disabled={serverLoading || !meterNo || !amount}
                sx={{ bgcolor: "#2196f3", "&:hover": { bgcolor: "#1976d2" }, height: 40 }}>
                Generate (Server)
              </Button>
              <Button variant="contained" startIcon={vsmLoading ? <CircularProgress size={16} /> : <UsbIcon />}
                onClick={handleVsmGenerate} disabled={vsmLoading || !meterNo || !amount}
                sx={{ bgcolor: accent, "&:hover": { bgcolor: "#009688" }, height: 40 }}>
                Generate (VSM)
              </Button>
              <Button variant="outlined" startIcon={<CompareArrowsIcon />}
                onClick={handleCompare} disabled={!serverResult && !vsmResult}
                sx={{ borderColor: "#ff9800", color: "#ff9800", height: 40 }}>
                Compare
              </Button>
            </Box>
          </Box>

          {/* Results side by side */}
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, mb: 3 }}>
            {/* Server result */}
            <Box sx={{ p: 3, borderRadius: "12px", bgcolor: cardBg, border: `1px solid ${cardBorder}` }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#2196f3" }} />
                <Typography sx={{ fontWeight: 700, fontSize: "14px" }}>Server Implementation</Typography>
              </Box>
              {serverLoading && <CircularProgress size={24} />}
              {serverResult && !serverResult.error && (
                <Box>
                  <Box sx={{ p: 2, borderRadius: "8px", bgcolor: isDark ? "#0d1117" : "#f5f5f5", mb: 2, textAlign: "center" }}>
                    <Typography sx={{ fontSize: "11px", color: colors.grey[400], mb: 0.5 }}>TOKEN</Typography>
                    <Typography sx={{ fontFamily: "monospace", fontSize: "22px", fontWeight: 700, letterSpacing: "2px", color: "#2196f3" }}>
                      {serverResult.token ? serverResult.token.match(/.{1,4}/g).join(" ") : "—"}
                    </Typography>
                  </Box>
                  <Table size="small">
                    <TableBody>
                      {[
                        ["Ref No", serverResult.refNo],
                        ["Customer", serverResult.customerName],
                        ["Amount", `N$ ${serverResult.amount}`],
                        ["kWh", serverResult.kWh],
                        ["VAT", `N$ ${serverResult.breakdown?.vatAmount}`],
                        ["Fixed Charge", `N$ ${serverResult.breakdown?.fixedCharge}`],
                        ["REL Levy", `N$ ${serverResult.breakdown?.relLevy}`],
                        ["Energy Amount", `N$ ${serverResult.breakdown?.energyAmount}`],
                      ].map(([k, v]) => (
                        <TableRow key={k}>
                          <TableCell sx={{ color: colors.grey[400], fontSize: "12px", borderBottom: `1px solid ${cardBorder}`, py: 0.5 }}>{k}</TableCell>
                          <TableCell sx={{ fontSize: "12px", fontWeight: 500, borderBottom: `1px solid ${cardBorder}`, py: 0.5 }}>{v}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              )}
              {serverResult && serverResult.error && (
                <Alert severity="error" sx={{ fontSize: "12px" }}>{serverResult.error}</Alert>
              )}
              {!serverResult && !serverLoading && (
                <Typography sx={{ color: colors.grey[500], fontSize: "13px", fontStyle: "italic" }}>
                  Click "Generate (Server)" to produce a token using the server implementation.
                </Typography>
              )}
            </Box>

            {/* VSM result */}
            <Box sx={{ p: 3, borderRadius: "12px", bgcolor: cardBg, border: `1px solid ${cardBorder}` }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: accent }} />
                <Typography sx={{ fontWeight: 700, fontSize: "14px" }}>VSM Output</Typography>
              </Box>
              {vsmLoading && <CircularProgress size={24} />}
              {vsmResult && !vsmResult.error && (
                <Box>
                  <Box sx={{ p: 2, borderRadius: "8px", bgcolor: isDark ? "#0d1117" : "#f5f5f5", mb: 2, textAlign: "center" }}>
                    <Typography sx={{ fontSize: "11px", color: colors.grey[400], mb: 0.5 }}>TOKEN</Typography>
                    <Typography sx={{ fontFamily: "monospace", fontSize: "22px", fontWeight: 700, letterSpacing: "2px", color: accent }}>
                      {vsmResult.token ? vsmResult.token.match(/.{1,4}/g).join(" ") : "—"}
                    </Typography>
                  </Box>
                  {vsmResult.raw && (
                    <Box sx={{ p: 1.5, borderRadius: "6px", bgcolor: isDark ? "#0d1117" : "#f5f5f5", mb: 1 }}>
                      <Typography sx={{ fontSize: "11px", color: colors.grey[400] }}>Raw Response</Typography>
                      <Typography sx={{ fontFamily: "monospace", fontSize: "12px", wordBreak: "break-all" }}>{vsmResult.raw}</Typography>
                    </Box>
                  )}
                </Box>
              )}
              {vsmResult && vsmResult.error && (
                <Alert severity="error" sx={{ fontSize: "12px" }}>{vsmResult.error}</Alert>
              )}
              {!vsmResult && !vsmLoading && (
                <Typography sx={{ color: colors.grey[500], fontSize: "13px", fontStyle: "italic" }}>
                  Click "Generate (VSM)" to send a request to the connected VSM via COM port.
                </Typography>
              )}
            </Box>
          </Box>

          {/* Data Flow Trace */}
          <Box sx={{ p: 3, borderRadius: "12px", bgcolor: cardBg, border: `1px solid ${cardBorder}` }}>
            <Typography sx={{ fontWeight: 700, fontSize: "15px", mb: 2 }}>Data Flow Trace</Typography>
            {dataFlow.length === 0 ? (
              <Typography sx={{ color: colors.grey[500], fontSize: "13px", fontStyle: "italic" }}>
                Generate a token to see the step-by-step data flow.
              </Typography>
            ) : (
              <Box sx={{ position: "relative" }}>
                {/* Vertical line */}
                <Box sx={{ position: "absolute", left: 20, top: 12, bottom: 12, width: 2, bgcolor: accent + "40" }} />
                {dataFlow.map((step, i) => (
                  <Box key={i} sx={{ display: "flex", gap: 2, mb: 2, position: "relative" }}>
                    {/* Step dot */}
                    <Box sx={{
                      width: 42, height: 42, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                      bgcolor: step.direction === "outbound" ? "#2196f320" : step.direction === "inbound" ? "#4caf5020" : step.direction === "response" ? "#ff980020" : accentDim,
                      border: `2px solid ${step.direction === "outbound" ? "#2196f3" : step.direction === "inbound" ? "#4caf50" : step.direction === "response" ? "#ff9800" : accent}`,
                      zIndex: 1, flexShrink: 0,
                    }}>
                      <Typography sx={{ fontSize: "13px", fontWeight: 700, color: step.direction === "outbound" ? "#2196f3" : step.direction === "inbound" ? "#4caf50" : step.direction === "response" ? "#ff9800" : accent }}>
                        {step.step}
                      </Typography>
                    </Box>
                    {/* Step content */}
                    <Box sx={{ flex: 1, p: 2, borderRadius: "8px", bgcolor: isDark ? "#0d1117" : "#fafafa", border: `1px solid ${isDark ? "#30363d" : "#e0e0e0"}` }}>
                      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                        <Typography sx={{ fontWeight: 600, fontSize: "13px" }}>{step.label}</Typography>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Chip label={step.direction} size="small" sx={{
                            height: 20, fontSize: "10px", fontWeight: 600,
                            bgcolor: step.direction === "outbound" ? "#2196f320" : step.direction === "inbound" ? "#4caf5020" : step.direction === "response" ? "#ff980020" : accentDim,
                            color: step.direction === "outbound" ? "#2196f3" : step.direction === "inbound" ? "#4caf50" : step.direction === "response" ? "#ff9800" : accent,
                          }} />
                          <Typography sx={{ fontSize: "10px", color: colors.grey[500], fontFamily: "monospace" }}>
                            {fmtTime(step.timestamp)}
                          </Typography>
                        </Box>
                      </Box>
                      <Box sx={{ fontFamily: "monospace", fontSize: "12px", lineHeight: 1.6, color: isDark ? "#8b949e" : "#57606a" }}>
                        {Object.entries(step.data || {}).map(([k, v]) => (
                          <Box key={k} sx={{ display: "flex", gap: 1 }}>
                            <Typography sx={{ color: accent, fontSize: "12px", fontFamily: "monospace", minWidth: 130 }}>{k}:</Typography>
                            <Typography sx={{ fontSize: "12px", fontFamily: "monospace", wordBreak: "break-all" }}>
                              {typeof v === "object" ? JSON.stringify(v) : String(v)}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Box>
      )}

      {/* ═══ TAB 2: COMPARISON VIEW ═══ */}
      {tab === 2 && (
        <Box>
          {/* Current comparison */}
          {(serverResult || vsmResult) && (
            <Box sx={{ p: 3, borderRadius: "12px", bgcolor: cardBg, border: `1px solid ${cardBorder}`, mb: 3 }}>
              <Typography sx={{ fontWeight: 700, fontSize: "15px", mb: 2 }}>Current Comparison</Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 2, alignItems: "start" }}>
                {/* Server */}
                <Box sx={{ p: 2, borderRadius: "8px", bgcolor: isDark ? "#0d1117" : "#f5f5f5", textAlign: "center" }}>
                  <Typography sx={{ fontSize: "11px", color: "#2196f3", fontWeight: 600, mb: 1 }}>SERVER</Typography>
                  <Typography sx={{ fontFamily: "monospace", fontSize: "18px", fontWeight: 700, letterSpacing: "2px" }}>
                    {serverResult && !serverResult.error ? (serverResult.token || "").match(/.{1,4}/g)?.join(" ") : "—"}
                  </Typography>
                </Box>
                {/* VS indicator */}
                <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pt: 2 }}>
                  {serverResult && vsmResult && !serverResult.error && !vsmResult.error ? (
                    serverResult.token === vsmResult.token ? (
                      <Box sx={{ textAlign: "center" }}>
                        <CheckCircleIcon sx={{ color: "#4caf50", fontSize: 36 }} />
                        <Typography sx={{ color: "#4caf50", fontWeight: 700, fontSize: "12px" }}>MATCH</Typography>
                      </Box>
                    ) : (
                      <Box sx={{ textAlign: "center" }}>
                        <CancelIcon sx={{ color: "#f44336", fontSize: 36 }} />
                        <Typography sx={{ color: "#f44336", fontWeight: 700, fontSize: "12px" }}>MISMATCH</Typography>
                      </Box>
                    )
                  ) : (
                    <CompareArrowsIcon sx={{ color: colors.grey[500], fontSize: 36 }} />
                  )}
                </Box>
                {/* VSM */}
                <Box sx={{ p: 2, borderRadius: "8px", bgcolor: isDark ? "#0d1117" : "#f5f5f5", textAlign: "center" }}>
                  <Typography sx={{ fontSize: "11px", color: accent, fontWeight: 600, mb: 1 }}>VSM</Typography>
                  <Typography sx={{ fontFamily: "monospace", fontSize: "18px", fontWeight: 700, letterSpacing: "2px" }}>
                    {vsmResult && !vsmResult.error ? (vsmResult.token || "").match(/.{1,4}/g)?.join(" ") : "—"}
                  </Typography>
                </Box>
              </Box>

              {/* Byte-by-byte comparison */}
              {serverResult && vsmResult && !serverResult.error && !vsmResult.error && serverResult.token && vsmResult.token && (
                <Box sx={{ mt: 2 }}>
                  <Typography sx={{ fontSize: "12px", color: colors.grey[400], mb: 1 }}>Digit-by-digit comparison:</Typography>
                  <Box sx={{ display: "flex", gap: "2px", justifyContent: "center" }}>
                    {Array.from({ length: 20 }).map((_, i) => {
                      const s = (serverResult.token || "")[i];
                      const v = (vsmResult.token || "")[i];
                      const match = s === v;
                      return (
                        <Box key={i} sx={{
                          width: 28, textAlign: "center", borderRadius: "4px", p: "4px 0",
                          bgcolor: match ? "#4caf5015" : "#f4433620",
                          border: `1px solid ${match ? "#4caf5040" : "#f4433660"}`,
                        }}>
                          <Typography sx={{ fontSize: "10px", color: "#2196f3", fontFamily: "monospace" }}>{s || "?"}</Typography>
                          <Divider sx={{ my: "2px", borderColor: colors.grey[600] }} />
                          <Typography sx={{ fontSize: "10px", color: accent, fontFamily: "monospace" }}>{v || "?"}</Typography>
                        </Box>
                      );
                    })}
                  </Box>
                </Box>
              )}
            </Box>
          )}

          {/* History */}
          <Box sx={{ p: 3, borderRadius: "12px", bgcolor: cardBg, border: `1px solid ${cardBorder}` }}>
            <Typography sx={{ fontWeight: 700, fontSize: "15px", mb: 2 }}>Comparison History</Typography>
            {comparisonHistory.length === 0 ? (
              <Typography sx={{ color: colors.grey[500], fontSize: "13px", fontStyle: "italic" }}>
                No comparisons yet. Generate tokens from both sources and click "Compare".
              </Typography>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      {["Time", "Meter", "Amount", "Server Token", "VSM Token", "Result"].map((h) => (
                        <TableCell key={h} sx={{ color: accent, fontWeight: 600, fontSize: "11px", borderBottom: `1px solid ${cardBorder}` }}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {comparisonHistory.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell sx={{ fontSize: "12px", borderBottom: `1px solid ${cardBorder}`, fontFamily: "monospace" }}>{fmtTime(row.time)}</TableCell>
                        <TableCell sx={{ fontSize: "12px", borderBottom: `1px solid ${cardBorder}` }}>{row.meterNo}</TableCell>
                        <TableCell sx={{ fontSize: "12px", borderBottom: `1px solid ${cardBorder}` }}>N$ {row.amount}</TableCell>
                        <TableCell sx={{ fontSize: "11px", borderBottom: `1px solid ${cardBorder}`, fontFamily: "monospace" }}>{row.serverToken || "—"}</TableCell>
                        <TableCell sx={{ fontSize: "11px", borderBottom: `1px solid ${cardBorder}`, fontFamily: "monospace" }}>{row.vsmToken || "—"}</TableCell>
                        <TableCell sx={{ borderBottom: `1px solid ${cardBorder}` }}>
                          {row.matched ? (
                            <Chip label="Match" size="small" sx={{ bgcolor: "#4caf5020", color: "#4caf50", fontWeight: 600, fontSize: "10px", height: 22 }} />
                          ) : (
                            <Chip label="Mismatch" size="small" sx={{ bgcolor: "#f4433620", color: "#f44336", fontWeight: 600, fontSize: "10px", height: 22 }} />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        </Box>
      )}

      {/* ═══ TAB 3: KEY MANAGEMENT ═══ */}
      {tab === 3 && (
        <Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
            <Typography sx={{ fontWeight: 700, fontSize: "15px" }}>Vending Keys Configuration</Typography>
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button size="small" startIcon={<RefreshIcon />} onClick={loadKeys} sx={{ color: colors.grey[400] }}>Refresh</Button>
              <Button variant="contained" startIcon={<AddIcon />} size="small"
                onClick={() => { setEditKey({ keyName: "", keyType: "DKGA02", sgc: "", krn: 1, ti: 0, keyValue: "", decoderKeyHex: "", supplyGroupCode: "", isActive: 1, notes: "" }); setKeyDialog(true); }}
                sx={{ bgcolor: accent, "&:hover": { bgcolor: "#009688" } }}>
                Add Key
              </Button>
            </Box>
          </Box>

          {keysLoading ? <CircularProgress /> : (
            <TableContainer component={Paper} sx={{ bgcolor: cardBg, border: `1px solid ${cardBorder}`, borderRadius: "12px" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {["Name", "Type", "SGC", "KRN", "TI", "Key Value", "Decoder Key", "Status", "Actions"].map((h) => (
                      <TableCell key={h} sx={{ color: accent, fontWeight: 600, fontSize: "11px", borderBottom: `1px solid ${cardBorder}` }}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {keys.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} sx={{ textAlign: "center", py: 4, color: colors.grey[500], fontSize: "13px", borderBottom: `1px solid ${cardBorder}` }}>
                        No vending keys configured. Click "Add Key" to get started.
                      </TableCell>
                    </TableRow>
                  ) : (
                    keys.map((key) => (
                      <TableRow key={key.id}>
                        <TableCell sx={{ fontSize: "12px", fontWeight: 500, borderBottom: `1px solid ${cardBorder}` }}>{key.keyName}</TableCell>
                        <TableCell sx={{ borderBottom: `1px solid ${cardBorder}` }}>
                          <Chip label={key.keyType} size="small" sx={{ fontSize: "10px", fontWeight: 600, height: 22, bgcolor: accentDim, color: accent }} />
                        </TableCell>
                        <TableCell sx={{ fontSize: "12px", fontFamily: "monospace", borderBottom: `1px solid ${cardBorder}` }}>{key.sgc || "—"}</TableCell>
                        <TableCell sx={{ fontSize: "12px", borderBottom: `1px solid ${cardBorder}` }}>{key.krn}</TableCell>
                        <TableCell sx={{ fontSize: "12px", borderBottom: `1px solid ${cardBorder}` }}>{key.ti}</TableCell>
                        <TableCell sx={{ fontSize: "11px", fontFamily: "monospace", borderBottom: `1px solid ${cardBorder}`, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {key.keyValue ? key.keyValue.substring(0, 16) + "..." : "—"}
                          <Tooltip title="Copy">
                            <IconButton size="small" onClick={() => navigator.clipboard.writeText(key.keyValue)}>
                              <ContentCopyIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                        <TableCell sx={{ fontSize: "11px", fontFamily: "monospace", borderBottom: `1px solid ${cardBorder}`, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {key.decoderKeyHex || "—"}
                        </TableCell>
                        <TableCell sx={{ borderBottom: `1px solid ${cardBorder}` }}>
                          <Chip label={key.isActive ? "Active" : "Inactive"} size="small" sx={{
                            height: 20, fontSize: "10px", fontWeight: 600,
                            bgcolor: key.isActive ? "#4caf5020" : colors.grey[700] + "40",
                            color: key.isActive ? "#4caf50" : colors.grey[400],
                          }} />
                        </TableCell>
                        <TableCell sx={{ borderBottom: `1px solid ${cardBorder}` }}>
                          <IconButton size="small" onClick={() => { setEditKey({ ...key }); setKeyDialog(true); }}>
                            <EditIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                          <IconButton size="small" onClick={() => handleDeleteKey(key.id)}>
                            <DeleteIcon sx={{ fontSize: 16, color: "#f44336" }} />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {/* Info box */}
          <Box sx={{ mt: 3, p: 2, borderRadius: "8px", bgcolor: isDark ? "#0d1117" : "#f5f5f5", border: `1px solid ${isDark ? "#30363d" : "#e0e0e0"}` }}>
            <Typography sx={{ fontSize: "12px", color: colors.grey[400], mb: 1, fontWeight: 600 }}>Key Types Reference:</Typography>
            <Box sx={{ fontSize: "12px", color: colors.grey[400], fontFamily: "monospace", lineHeight: 1.8 }}>
              <Typography sx={{ fontSize: "12px", fontFamily: "monospace" }}>DKGA01 — DES-based Decoder Key Generation Algorithm (legacy)</Typography>
              <Typography sx={{ fontSize: "12px", fontFamily: "monospace" }}>DKGA02 — Enhanced DES key generation (IEC 62055-41)</Typography>
              <Typography sx={{ fontSize: "12px", fontFamily: "monospace" }}>DKGA03 — AES-128 key generation</Typography>
              <Typography sx={{ fontSize: "12px", fontFamily: "monospace" }}>DKGA04 — AES-256 key generation</Typography>
              <Typography sx={{ fontSize: "12px", fontFamily: "monospace", mt: 1 }}>SGC = Supply Group Code | KRN = Key Revision Number | TI = Tariff Index</Typography>
            </Box>
          </Box>
        </Box>
      )}

      {/* ═══ KEY DIALOG ═══ */}
      <Dialog open={keyDialog} onClose={() => setKeyDialog(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { bgcolor: cardBg, backgroundImage: "none" } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>{editKey?.id ? "Edit Vending Key" : "Add Vending Key"}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, mt: 1 }}>
            <TextField size="small" label="Key Name" value={editKey?.keyName || ""} onChange={(e) => setEditKey({ ...editKey, keyName: e.target.value })} fullWidth />
            <FormControl size="small" fullWidth>
              <InputLabel>Key Type</InputLabel>
              <Select value={editKey?.keyType || "DKGA02"} onChange={(e) => setEditKey({ ...editKey, keyType: e.target.value })} label="Key Type">
                {["DKGA01", "DKGA02", "DKGA03", "DKGA04", "Custom"].map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField size="small" label="Supply Group Code (SGC)" value={editKey?.sgc || ""} onChange={(e) => setEditKey({ ...editKey, sgc: e.target.value })} />
            <TextField size="small" label="Key Revision Number (KRN)" type="number" value={editKey?.krn || 1} onChange={(e) => setEditKey({ ...editKey, krn: parseInt(e.target.value) || 1 })} />
            <TextField size="small" label="Tariff Index (TI)" type="number" value={editKey?.ti || 0} onChange={(e) => setEditKey({ ...editKey, ti: parseInt(e.target.value) || 0 })} />
            <TextField size="small" label="Supply Group Code (Full)" value={editKey?.supplyGroupCode || ""} onChange={(e) => setEditKey({ ...editKey, supplyGroupCode: e.target.value })} />
          </Box>
          <TextField size="small" label="Key Value (Hex)" value={editKey?.keyValue || ""} onChange={(e) => setEditKey({ ...editKey, keyValue: e.target.value })}
            fullWidth sx={{ mt: 2, "& .MuiInputBase-input": { fontFamily: "monospace" } }} placeholder="Enter key in hexadecimal" />
          <TextField size="small" label="Decoder Key (Hex)" value={editKey?.decoderKeyHex || ""} onChange={(e) => setEditKey({ ...editKey, decoderKeyHex: e.target.value })}
            fullWidth sx={{ mt: 2, "& .MuiInputBase-input": { fontFamily: "monospace" } }} placeholder="Derived decoder key (hex)" />
          <TextField size="small" label="Notes" value={editKey?.notes || ""} onChange={(e) => setEditKey({ ...editKey, notes: e.target.value })}
            fullWidth multiline rows={2} sx={{ mt: 2 }} />
          <FormControlLabel sx={{ mt: 1 }}
            control={<Switch checked={editKey?.isActive === 1} onChange={(e) => setEditKey({ ...editKey, isActive: e.target.checked ? 1 : 0 })} />}
            label="Active"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setKeyDialog(false)}>Cancel</Button>
          <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSaveKey}
            sx={{ bgcolor: accent, "&:hover": { bgcolor: "#009688" } }}>
            Save Key
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
