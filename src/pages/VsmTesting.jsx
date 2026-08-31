import { useState, useEffect, useRef, useCallback } from "react";
import {
  Box, Typography, useTheme, Tabs, Tab, Button, TextField, Select, MenuItem,
  FormControl, InputLabel, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Chip, IconButton, Tooltip, Alert, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, Divider, Switch, FormControlLabel,
  Checkbox, Collapse, LinearProgress,
} from "@mui/material";
import { tokens } from "../theme";
import Header from "../components/Header";
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
import SecurityIcon from "@mui/icons-material/Security";
import CloudIcon from "@mui/icons-material/Cloud";
import MemoryIcon from "@mui/icons-material/Memory";
import HistoryIcon from "@mui/icons-material/History";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import DownloadIcon from "@mui/icons-material/Download";
import PreviewIcon from "@mui/icons-material/Preview";
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank";
import SelectAllIcon from "@mui/icons-material/SelectAll";
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
   STS600-8 PROTOCOL HELPERS
   ═══════════════════════════════════════════════════════════════════ */

/** Build STS600-8-1 Legacy API vend command */
function buildStsLegacyCommand(pan, amountCents, vendingKeyRegister = "01") {
  // SM?TC<PAN><space><VKR><AMOUNT_HEX><params><CRC>
  const panPadded = pan.padEnd(18, "0");
  const amtHex = Math.round(amountCents).toString(16).toUpperCase().padStart(8, "0");
  const cmd = `SM?TC${panPadded} ${vendingKeyRegister}${amtHex}1FF005778400000`;
  // CRC16-CCITT
  const crc = crc16ccitt(cmd);
  return cmd + crc;
}

/** Build STS600-8-6 STS6 API vend command */
function buildSts6Command(pan, amountCents, vendingKeyRegister = 1) {
  const panPadded = pan.padEnd(18, "0");
  const amtHex = Math.round(amountCents).toString(16).toUpperCase();
  const cmd = `SM?VCN1*P${panPadded}*N${vendingKeyRegister}*N7*N2*N0*H0000*H${amtHex}`;
  const crc = crc16ccitt(cmd);
  return cmd + "*" + crc;
}

/** Build simple binary frame (backward compatible) */
function buildBinaryFrame(meter, amount) {
  const stx = 0x02;
  const etx = 0x03;
  const cmd = 0x10;
  const meterBytes = new TextEncoder().encode(meter.padEnd(20, " "));
  const amtStr = parseFloat(amount).toFixed(2).padStart(12, "0");
  const amtBytes = new TextEncoder().encode(amtStr);
  const len = 1 + meterBytes.length + amtBytes.length;
  const frame = new Uint8Array(3 + len + 1);
  frame[0] = stx;
  frame[1] = len;
  frame[2] = cmd;
  frame.set(meterBytes, 3);
  frame.set(amtBytes, 3 + meterBytes.length);
  frame[frame.length - 1] = etx;
  return frame;
}

/** CRC16-CCITT calculation */
function crc16ccitt(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Parse STS response - extract 20-digit token */
function parseVsmResponse(raw) {
  const tokenMatch = raw.match(/(\d{20})/);
  if (tokenMatch) {
    return { success: true, token: tokenMatch[1], raw: raw };
  }
  // Try TOKEN: format
  const tokenLine = raw.match(/TOKEN:\s*(\d{20})/);
  if (tokenLine) {
    return { success: true, token: tokenLine[1], raw: raw };
  }
  return { success: false, raw: raw, error: "Could not parse token from response" };
}

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
    } catch (e) { /* ignore */ }
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

      socket.onerror = () => {
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
    ws.send(data);
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

  // Connection mode for Real HSM: "serial" or "tcp"
  const [connMode, setConnMode] = useState("serial");

  // Serial
  const serial = useSerial();
  const [baudRate, setBaudRate] = useState(9600);
  const [dataBits, setDataBits] = useState(8);
  const [stopBits, setStopBits] = useState(1);
  const [parity, setParity] = useState("none");
  const [commLog, setCommLog] = useState([]);
  const [connectError, setConnectError] = useState("");

  // TCP/WebSocket
  const tcp = useWebSocket();
  const [tcpHost, setTcpHost] = useState("localhost");
  const [tcpPort, setTcpPort] = useState("9000");

  // Unified connection
  const isConnected = connMode === "serial" ? serial.connected : tcp.connected;
  const activeConn = connMode === "serial" ? serial : tcp;

  // Protocol format
  const [protocolFormat, setProtocolFormat] = useState("sts6");
  // sts6 = STS600-8-6, legacy = STS600-8-1, binary = simple binary frame

  // Token generation
  const [meterNo, setMeterNo] = useState("");
  const [amount, setAmount] = useState("");
  const [vendingKeyReg, setVendingKeyReg] = useState("01");
  const [serverResult, setServerResult] = useState(null);
  const [hsmResult, setHsmResult] = useState(null);
  const [serverLoading, setServerLoading] = useState(false);
  const [hsmLoading, setHsmLoading] = useState(false);
  const [dataFlow, setDataFlow] = useState([]);

  // Raw I/O
  const [rawInput, setRawInput] = useState("");
  const [hexMode, setHexMode] = useState(false);

  // Keys
  const [keys, setKeys] = useState([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [keyDialog, setKeyDialog] = useState(false);
  const [editKey, setEditKey] = useState(null);

  // Comparison
  const [comparisonHistory, setComparisonHistory] = useState([]);

  // HSM Backend Config
  const [hsmBackendConfig, setHsmBackendConfig] = useState(null);

  // ---- Local HSM agent -----------------------------------------------------
  // The cloud backend has no route into the factory LAN (a direct attempt returns
  // ENETUNREACH), so HSM work is dispatched to an agent running there. This shows
  // whether that agent is currently dialled in.
  const [agentStatus, setAgentStatus] = useState(null);

  const fetchAgentStatus = useCallback(async () => {
    try {
      const token = sessionStorage.getItem("token");
      const res = await fetch("/cb/hsm-agent/status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setAgentStatus(data.data);
    } catch {
      setAgentStatus((prev) => prev || { online: false });
    }
  }, []);

  useEffect(() => {
    fetchAgentStatus();
    const iv = setInterval(fetchAgentStatus, 15000);
    return () => clearInterval(iv);
  }, [fetchAgentStatus]);
  const [hsmConfigLoading, setHsmConfigLoading] = useState(false);
  const [hsmConfigSaving, setHsmConfigSaving] = useState(false);
  const [hsmConfigForm, setHsmConfigForm] = useState({ host: "", port: "8080", uiPort: "80", tlsPort: "9443", useTLS: false, timeout: 15000 });

  // Bulk Operations
  const [bulkMeters, setBulkMeters] = useState("");
  const [bulkResult, setBulkResult] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkType, setBulkType] = useState("meter-import");

  // Meter Registration
  const [regPan, setRegPan] = useState("");
  const [regSgc, setRegSgc] = useState("999907");
  const [regKrn, setRegKrn] = useState("2");
  const [regTi, setRegTi] = useState("1");
  const [regOrg, setRegOrg] = useState("Pulsar Namibia");
  const [regName, setRegName] = useState("");
  const [regResult, setRegResult] = useState(null);
  const [regLoading, setRegLoading] = useState(false);

  // GRIDx Auto-Registration
  const [gridxMeters, setGridxMeters] = useState([]);
  const [gridxLoading, setGridxLoading] = useState(false);
  const [gridxStats, setGridxStats] = useState({ total: 0, registered: 0, unregistered: 0 });
  const [selectedDrns, setSelectedDrns] = useState(new Set());
  const [gridxRegResult, setGridxRegResult] = useState(null);
  const [gridxRegLoading, setGridxRegLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [gridxPreview, setGridxPreview] = useState(null);
  const [gridxPreviewLoading, setGridxPreviewLoading] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [gridxCsvLoading, setGridxCsvLoading] = useState(false);

  // Token Verification
  const [verifyPan, setVerifyPan] = useState("");
  const [verifyTokenVal, setVerifyTokenVal] = useState("");
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifyLoading, setVerifyLoading] = useState(false);

  // ── NEW: Bulk Operations form-driven state ──
  const [bulkRows, setBulkRows] = useState([]);
  const [bulkDbLoading, setBulkDbLoading] = useState(false);

  // ── NEW: Token Generation enhanced state ──
  const [tokenType, setTokenType] = useState("credit-electricity");
  const [suppValue, setSuppValue] = useState("");
  const [messageId, setMessageId] = useState(() => `GRIDx-${Date.now()}`);
  const [dbMetersList, setDbMetersList] = useState([]);
  const [dbMetersOpen, setDbMetersOpen] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);

  // ── PrismVend Connection Status ──
  const [prismStatus, setPrismStatus] = useState(null);
  const [prismChecking, setPrismChecking] = useState(false);

  // ── NEW: Manual Registration enhanced state ──
  const [regEa, setRegEa] = useState("7");
  const [regTct, setRegTct] = useState("2");
  const [regResource, setRegResource] = useState("0");
  const [regPreviewData, setRegPreviewData] = useState(null);

  // ── Direct Thrift HSM state ──
  const [thriftStatus, setThriftStatus] = useState(null);
  const [thriftConnecting, setThriftConnecting] = useState(false);
  const [thriftConfig, setThriftConfig] = useState({ host: "", port: "9443", username: "", password: "", realm: "local" });
  const [thriftHsmInfo, setThriftHsmInfo] = useState(null);
  const [thriftPingResult, setThriftPingResult] = useState(null);
  const [thriftTokenResult, setThriftTokenResult] = useState(null);
  const [thriftOpLoading, setThriftOpLoading] = useState(false);
  const [thriftCreditForm, setThriftCreditForm] = useState({ drn: "", sgc: "999907", krn: "2", ti: "1", subclass: "0", transferAmount: "" });
  const [thriftEngForm, setThriftEngForm] = useState({ drn: "", sgc: "999907", krn: "2", ti: "1", subclass: "1", transferAmount: "0" });
  const [thriftKcForm, setThriftKcForm] = useState({ drn: "", sgc: "999907", krn: "2", ti: "1", toSgc: "", toKrn: "", toTi: "" });
  const [thriftVerifyForm, setThriftVerifyForm] = useState({ drn: "", sgc: "999907", krn: "2", ti: "1", tokenDec: "" });

  // Card style
  const cardBg = isDark ? colors.primary[400] : "#ffffff";
  const cardBorder = isDark ? colors.primary[300] : colors.grey[800];

  /* ── Data handlers ── */
  useEffect(() => {
    serial.setOnData((chunk) => {
      setCommLog((prev) => [...prev, { time: new Date().toISOString(), dir: "RX", data: chunk }]);
    });
  }, [serial.setOnData]);

  useEffect(() => {
    tcp.setOnData((chunk) => {
      setCommLog((prev) => [...prev, { time: new Date().toISOString(), dir: "RX", data: chunk }]);
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

  /* ── PrismVend connection check on mount + 60s interval ── */
  async function checkPrismConnection() {
    setPrismChecking(true);
    try {
      const token = sessionStorage.getItem("token");
      const res = await fetch("/cb/vending/prismvend-check", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success && data.data) {
        setPrismStatus(data.data);
      }
    } catch (e) {
      console.error("PrismVend check failed:", e);
      setPrismStatus({ connected: false, status: "error", message: "Failed to check connection: " + e.message, checkedAt: new Date().toISOString() });
    }
    setPrismChecking(false);
  }

  useEffect(() => {
    checkPrismConnection();
    const interval = setInterval(checkPrismConnection, 60000);
    return () => clearInterval(interval);
  }, []);

  /* ── Direct Thrift HSM handlers ── */
  const thriftAuthHeaders = () => ({ Authorization: `Bearer ${sessionStorage.getItem("token")}`, "Content-Type": "application/json" });

  async function connectThrift() {
    setThriftConnecting(true);
    try {
      const res = await fetch("/cb/vending/thrift-connect", { method: "POST", headers: thriftAuthHeaders(), body: JSON.stringify(thriftConfig) });
      const data = await res.json();
      if (data.success) {
        setThriftStatus({ connected: true, status: "connected", message: "Connected to " + thriftConfig.host + ":" + thriftConfig.port });
      } else {
        setThriftStatus({ connected: false, status: "error", message: data.error || "Connection failed" });
      }
    } catch (e) {
      setThriftStatus({ connected: false, status: "error", message: e.message });
    }
    setThriftConnecting(false);
  }

  async function disconnectThrift() {
    try {
      await fetch("/cb/vending/thrift-disconnect", { method: "POST", headers: thriftAuthHeaders() });
      setThriftStatus({ connected: false, status: "disconnected", message: "Disconnected" });
      setThriftHsmInfo(null);
      setThriftPingResult(null);
    } catch (e) {
      console.error("Thrift disconnect error:", e);
    }
  }

  async function pingThrift() {
    setThriftOpLoading(true);
    try {
      const res = await fetch("/cb/vending/thrift-ping", { method: "POST", headers: thriftAuthHeaders() });
      const data = await res.json();
      setThriftPingResult(data.success ? data.data : { error: data.error });
    } catch (e) {
      setThriftPingResult({ error: e.message });
    }
    setThriftOpLoading(false);
  }

  async function signInThrift() {
    setThriftOpLoading(true);
    try {
      const res = await fetch("/cb/vending/thrift-signin", { method: "POST", headers: thriftAuthHeaders(), body: JSON.stringify({ username: thriftConfig.username, password: thriftConfig.password, realm: thriftConfig.realm }) });
      const data = await res.json();
      if (data.success) {
        setThriftStatus((prev) => ({ ...prev, authenticated: true, message: (prev?.message || "") + " | Signed in" }));
      } else {
        setThriftStatus((prev) => ({ ...prev, authenticated: false, authError: data.error }));
      }
    } catch (e) {
      setThriftStatus((prev) => ({ ...prev, authenticated: false, authError: e.message }));
    }
    setThriftOpLoading(false);
  }

  async function getThriftHsmInfo() {
    setThriftOpLoading(true);
    try {
      const res = await fetch("/cb/vending/thrift-hsm-info", { headers: thriftAuthHeaders() });
      const data = await res.json();
      setThriftHsmInfo(data.success ? data.data : { error: data.error });
    } catch (e) {
      setThriftHsmInfo({ error: e.message });
    }
    setThriftOpLoading(false);
  }

  async function thriftIssueCreditToken() {
    setThriftOpLoading(true);
    setThriftTokenResult(null);
    try {
      const res = await fetch("/cb/vending/thrift-issue-credit", { method: "POST", headers: thriftAuthHeaders(), body: JSON.stringify(thriftCreditForm) });
      const data = await res.json();
      setThriftTokenResult({ type: "credit", success: data.success, data: data.success ? data.data : null, error: data.error });
    } catch (e) {
      setThriftTokenResult({ type: "credit", success: false, error: e.message });
    }
    setThriftOpLoading(false);
  }

  async function thriftIssueEngineering() {
    setThriftOpLoading(true);
    setThriftTokenResult(null);
    try {
      const res = await fetch("/cb/vending/thrift-issue-engineering", { method: "POST", headers: thriftAuthHeaders(), body: JSON.stringify(thriftEngForm) });
      const data = await res.json();
      setThriftTokenResult({ type: "engineering", success: data.success, data: data.success ? data.data : null, error: data.error });
    } catch (e) {
      setThriftTokenResult({ type: "engineering", success: false, error: e.message });
    }
    setThriftOpLoading(false);
  }

  async function thriftIssueKeyChange() {
    setThriftOpLoading(true);
    setThriftTokenResult(null);
    try {
      const res = await fetch("/cb/vending/thrift-issue-keychange", { method: "POST", headers: thriftAuthHeaders(), body: JSON.stringify(thriftKcForm) });
      const data = await res.json();
      setThriftTokenResult({ type: "keychange", success: data.success, data: data.success ? data.data : null, error: data.error });
    } catch (e) {
      setThriftTokenResult({ type: "keychange", success: false, error: e.message });
    }
    setThriftOpLoading(false);
  }

  async function thriftVerifyToken() {
    setThriftOpLoading(true);
    setThriftTokenResult(null);
    try {
      const res = await fetch("/cb/vending/thrift-verify", { method: "POST", headers: thriftAuthHeaders(), body: JSON.stringify(thriftVerifyForm) });
      const data = await res.json();
      setThriftTokenResult({ type: "verify", success: data.success, data: data.success ? data.data : null, error: data.error });
    } catch (e) {
      setThriftTokenResult({ type: "verify", success: false, error: e.message });
    }
    setThriftOpLoading(false);
  }

  /* ── Load HSM backend config on mount ── */
  useEffect(() => { loadHsmConfig(); }, []);

  async function loadHsmConfig() {
    setHsmConfigLoading(true);
    try {
      const token = sessionStorage.getItem("token");
      const res = await fetch("/cb/vending/hsm-status", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success && data.data) {
        setHsmBackendConfig(data.data);
        setHsmConfigForm({
          host: data.data.host || "",
          port: data.data.port || "8080",
          uiPort: data.data.uiPort || "80",
          tlsPort: data.data.tlsPort || "9443",
          useTLS: data.data.useTLS || false,
          timeout: data.data.timeout || 15000,
        });
      }
    } catch (e) { console.error("Failed to load HSM config:", e); }
    setHsmConfigLoading(false);
  }

  async function saveHsmConfig() {
    setHsmConfigSaving(true);
    try {
      const token = sessionStorage.getItem("token");
      const res = await fetch("/cb/vending/hsm-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(hsmConfigForm),
      });
      const data = await res.json();
      if (data.success) {
        setHsmBackendConfig(data.data);
        setCommLog((prev) => [...prev, { time: new Date().toISOString(), dir: "SYS", data: `PrismVend config updated: ${hsmConfigForm.useTLS ? "https" : "http"}://${hsmConfigForm.host}:${hsmConfigForm.port}` }]);
        // Refresh PrismVend connection status after config change
        setTimeout(checkPrismConnection, 500);
      }
    } catch (e) { console.error("Failed to save HSM config:", e); }
    setHsmConfigSaving(false);
  }

  async function handleBulkGenerate() {
    if (!bulkMeters.trim()) return;
    setBulkLoading(true);
    setBulkResult(null);
    try {
      const token = sessionStorage.getItem("token");
      let meters;
      try { meters = JSON.parse(bulkMeters); } catch (e) {
        const lines = bulkMeters.trim().split("\n").filter(l => l.trim());
        meters = lines.map(l => {
          const parts = l.split(",").map(p => p.trim());
          return { meterPAN: parts[0], organisation: parts[1] || "Pulsar Namibia", name: parts[2] || "", sgc: parts[3] || "999907", krn: parseInt(parts[4]) || 2, ti: parseInt(parts[5]) || 1 };
        });
      }
      const res = await fetch(`/cb/vending/bulk/${bulkType}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(bulkType === "key-change" ? { meters, toSgc: "999907", toKrn: 2, toTi: 1 } : { meters }),
      });
      const data = await res.json();
      setBulkResult(data);
    } catch (e) { setBulkResult({ error: e.message }); }
    setBulkLoading(false);
  }

  async function handleMeterRegister() {
    if (!regPan) return;
    setRegLoading(true);
    setRegResult(null);
    try {
      const token = sessionStorage.getItem("token");
      const res = await fetch("/cb/vending/meter-registration", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ meterPAN: regPan, sgc: regSgc, krn: parseInt(regKrn), ti: parseInt(regTi), organisation: regOrg, name: regName }),
      });
      setRegResult(await res.json());
    } catch (e) { setRegResult({ error: e.message }); }
    setRegLoading(false);
  }

  async function handleVerifyToken() {
    if (!verifyPan || !verifyTokenVal) return;
    setVerifyLoading(true);
    setVerifyResult(null);
    try {
      const token = sessionStorage.getItem("token");
      const res = await fetch("/cb/vending/verify-token", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ meterPan: verifyPan, token: verifyTokenVal }),
      });
      setVerifyResult(await res.json());
    } catch (e) { setVerifyResult({ error: e.message }); }
    setVerifyLoading(false);
  }

  // ── GRIDx Auto-Registration handlers ──
  async function loadGridxMeters() {
    setGridxLoading(true);
    setGridxRegResult(null);
    try {
      const token = sessionStorage.getItem("token");
      const res = await fetch("/cb/vending/gridx-meters", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success) {
        setGridxMeters(data.data || []);
        setGridxStats(data.stats || { total: 0, registered: 0, unregistered: 0 });
        setSelectedDrns(new Set());
      } else {
        setGridxMeters([]);
        setGridxStats({ total: 0, registered: 0, unregistered: 0 });
      }
    } catch (e) {
      console.error("Failed to load GRIDx meters:", e);
      setGridxMeters([]);
    }
    setGridxLoading(false);
  }

  async function registerSelectedMeters() {
    if (selectedDrns.size === 0) return;
    setGridxRegLoading(true);
    setGridxRegResult(null);
    try {
      const token = sessionStorage.getItem("token");
      const res = await fetch("/cb/vending/gridx-register", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ drns: Array.from(selectedDrns) }),
      });
      const data = await res.json();
      setGridxRegResult(data);
      // Refresh the meter list after registration
      if (data.success) {
        loadGridxMeters();
      }
    } catch (e) {
      setGridxRegResult({ success: false, error: e.message });
    }
    setGridxRegLoading(false);
  }

  async function previewRegistration() {
    if (selectedDrns.size === 0) return;
    setGridxPreviewLoading(true);
    setGridxPreview(null);
    try {
      const token = sessionStorage.getItem("token");
      const res = await fetch("/cb/vending/gridx-register-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ drns: Array.from(selectedDrns) }),
      });
      const data = await res.json();
      setGridxPreview(data);
      setShowPreview(true);
    } catch (e) {
      setGridxPreview({ success: false, error: e.message });
      setShowPreview(true);
    }
    setGridxPreviewLoading(false);
  }

  async function generateGridxCSV() {
    setGridxCsvLoading(true);
    try {
      const token = sessionStorage.getItem("token");
      const body = selectedDrns.size > 0 ? { drns: Array.from(selectedDrns) } : { all: true };
      const res = await fetch("/cb/vending/gridx-register-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success && data.data?.csv) {
        const blob = new Blob([data.data.csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = data.data.filename || "gridx-meters.csv";
        a.click();
        URL.revokeObjectURL(url);
      } else {
        alert(data.error || "Failed to generate CSV");
      }
    } catch (e) {
      alert("Failed to generate CSV: " + e.message);
    }
    setGridxCsvLoading(false);
  }

  function toggleSelectAll(unregisteredOnly) {
    if (unregisteredOnly) {
      const unregDrns = gridxMeters.filter(m => m.registrationStatus === "Unregistered").map(m => m.DRN);
      if (selectedDrns.size === unregDrns.length && unregDrns.every(d => selectedDrns.has(d))) {
        setSelectedDrns(new Set());
      } else {
        setSelectedDrns(new Set(unregDrns));
      }
    } else {
      if (selectedDrns.size === gridxMeters.length) {
        setSelectedDrns(new Set());
      } else {
        setSelectedDrns(new Set(gridxMeters.map(m => m.DRN)));
      }
    }
  }

  function toggleMeter(drn) {
    setSelectedDrns(prev => {
      const next = new Set(prev);
      if (next.has(drn)) next.delete(drn);
      else next.add(drn);
      return next;
    });
  }

  /* ── Connect/disconnect ── */
  async function handleConnect() {
    setConnectError("");
    try {
      if (connMode === "serial") {
        await serial.connect(baudRate, dataBits, stopBits, parity);
        setCommLog((prev) => [...prev, { time: new Date().toISOString(), dir: "SYS", data: `Connected via COM port at ${baudRate} baud` }]);
      } else {
        await tcp.connect(tcpHost, tcpPort);
        setCommLog((prev) => [...prev, { time: new Date().toISOString(), dir: "SYS", data: `Connected via TCP/WebSocket to ${tcpHost}:${tcpPort}` }]);
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
    setCommLog((prev) => [...prev, { time: new Date().toISOString(), dir: "SYS", data: "Disconnected" }]);
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
      setCommLog((prev) => [...prev, { time: new Date().toISOString(), dir: "TX", data: rawInput }]);
      setRawInput("");
    } catch (e) {
      setCommLog((prev) => [...prev, { time: new Date().toISOString(), dir: "ERR", data: e.message }]);
    }
  }

  /* ── Generate token via SERVER (Virtual HSM) ── */
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

  /* ── Generate token via Real HSM ── */
  async function handleHsmGenerate() {
    if (!isConnected) {
      setHsmResult({ error: "Not connected to HSM. Connect via COM port or TCP first." });
      return;
    }
    if (!meterNo || !amount) return;
    setHsmLoading(true);
    setHsmResult(null);

    const transportLabel = connMode === "serial" ? "COM port" : "TCP/WebSocket";
    const amountCents = Math.round(parseFloat(amount) * 100);

    // Build command based on selected protocol format
    let commandDisplay = "";
    try {
      if (protocolFormat === "sts6") {
        const cmd = buildSts6Command(meterNo, amountCents, parseInt(vendingKeyReg));
        commandDisplay = cmd;
        setCommLog((prev) => [...prev, { time: new Date().toISOString(), dir: "TX", data: `STS6 API: ${cmd}` }]);
        await activeConn.send(cmd + "\r\n");
      } else if (protocolFormat === "legacy") {
        const cmd = buildStsLegacyCommand(meterNo, amountCents, vendingKeyReg);
        commandDisplay = cmd;
        setCommLog((prev) => [...prev, { time: new Date().toISOString(), dir: "TX", data: `Legacy API: ${cmd}` }]);
        await activeConn.send(cmd + " \r\n");
      } else {
        // binary frame
        const payload = buildBinaryFrame(meterNo, amount);
        const payloadHex = Array.from(payload).map((b) => b.toString(16).padStart(2, "0")).join(" ");
        commandDisplay = payloadHex;
        setCommLog((prev) => [...prev, { time: new Date().toISOString(), dir: "TX", data: `Binary: ${payloadHex}` }]);
        await activeConn.sendHex(payloadHex);
      }

      setDataFlow((prev) => [
        ...prev,
        {
          step: prev.length + 1,
          label: `HSM ${transportLabel} Request`,
          direction: "outbound",
          timestamp: new Date().toISOString(),
          data: { protocol: protocolFormat.toUpperCase(), command: commandDisplay, description: `Sent to HSM via ${transportLabel}` },
        },
      ]);

      activeConn.clearBuffer();
      const response = await waitForResponse(5000);
      setCommLog((prev) => [...prev, { time: new Date().toISOString(), dir: "RX", data: `HSM Response: ${response}` }]);
      setDataFlow((prev) => [
        ...prev,
        {
          step: prev.length + 1,
          label: `HSM ${transportLabel} Response`,
          direction: "inbound",
          timestamp: new Date().toISOString(),
          data: { raw: response, description: `Received from HSM via ${transportLabel}` },
        },
      ]);
      const parsed = parseVsmResponse(response);
      setHsmResult(parsed);
    } catch (e) {
      setHsmResult({ error: e.message });
    }
    setHsmLoading(false);
  }

  function waitForResponse(timeoutMs) {
    return new Promise((resolve) => {
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

  /* ── Run comparison ── */
  async function handleCompare() {
    if (!serverResult && !hsmResult) return;
    const sToken = serverResult && !serverResult.error ? serverResult.token : null;
    const vToken = hsmResult && !hsmResult.error ? hsmResult.token : null;
    const matched = sToken && vToken && sToken === vToken;
    const entry = { time: new Date().toISOString(), meterNo, amount, serverToken: sToken, hsmToken: vToken, matched };
    setComparisonHistory((prev) => [entry, ...prev]);

    try {
      await vsmAPI.logComparison({
        meterNo, amount: parseFloat(amount),
        serverToken: sToken, vsmToken: vToken, matched,
        serverResponse: serverResult, vsmResponse: hsmResult, dataFlow,
      });
    } catch (e) { /* ignore */ }
  }

  /* ── Key save/delete ── */
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

  /* ── NEW: Bulk Operations form-driven helpers ── */
  function getBulkRowDefaults() {
    if (bulkType === "meter-import") return { meterPAN: "", organisation: "Pulsar Namibia", name: "", sgc: "999907", krn: "2", ti: "1", selected: true };
    if (bulkType === "key-change") return { meterPAN: "", fromSgc: "999907", fromKrn: "2", fromTi: "1", toSgc: "999907", toKrn: "2", toTi: "1", selected: true };
    /* engineering-tokens */
    return { meterPAN: "", sgc: "999907", krn: "2", ti: "1", tokenType: "clear-credit", selected: true };
  }

  function addBulkRow() {
    setBulkRows((prev) => [...prev, getBulkRowDefaults()]);
  }

  function removeBulkRow(index) {
    setBulkRows((prev) => prev.filter((_, i) => i !== index));
  }

  function updateBulkRow(index, field, value) {
    setBulkRows((prev) => prev.map((row, i) => i === index ? { ...row, [field]: value } : row));
  }

  async function loadBulkFromDb() {
    setBulkDbLoading(true);
    try {
      const token = sessionStorage.getItem("token");
      const res = await fetch("/cb/vending/gridx-meters", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success && data.data) {
        const rows = data.data.map((m) => {
          const name = ((m.Name || "") + " " + (m.Surname || "")).trim();
          if (bulkType === "meter-import") return { meterPAN: m.DRN, organisation: "Pulsar Namibia", name: name || "", sgc: m.sgc || "999907", krn: String(m.krn ?? "2"), ti: String(m.ti ?? "1"), selected: true };
          if (bulkType === "key-change") return { meterPAN: m.DRN, fromSgc: m.sgc || "999907", fromKrn: String(m.krn ?? "2"), fromTi: String(m.ti ?? "1"), toSgc: "999907", toKrn: "2", toTi: "1", selected: true };
          return { meterPAN: m.DRN, sgc: m.sgc || "999907", krn: String(m.krn ?? "2"), ti: String(m.ti ?? "1"), tokenType: "clear-credit", selected: true };
        });
        setBulkRows(rows);
      }
    } catch (e) { console.error("Failed to load meters for bulk:", e); }
    setBulkDbLoading(false);
  }

  function handleBulkGenerateFromRows() {
    const activeRows = bulkRows.filter((r) => r.selected && r.meterPAN.trim());
    if (activeRows.length === 0) return;
    let meters;
    if (bulkType === "meter-import") {
      meters = activeRows.map((r) => ({ meterPAN: r.meterPAN.trim(), organisation: r.organisation, name: r.name, sgc: r.sgc, krn: parseInt(r.krn) || 2, ti: parseInt(r.ti) || 1 }));
    } else if (bulkType === "key-change") {
      meters = activeRows.map((r) => ({ meterPAN: r.meterPAN.trim(), sgc: r.fromSgc, krn: parseInt(r.fromKrn) || 2, ti: parseInt(r.fromTi) || 1 }));
    } else {
      meters = activeRows.map((r) => ({ meterPAN: r.meterPAN.trim(), sgc: r.sgc, krn: parseInt(r.krn) || 2, ti: parseInt(r.ti) || 1, engineeringTokenType: r.tokenType }));
    }
    // Re-use existing handleBulkGenerate by setting bulkMeters to JSON
    setBulkMeters(JSON.stringify(meters));
    // Call the existing function after state update
    setTimeout(async () => {
      setBulkLoading(true);
      setBulkResult(null);
      try {
        const token = sessionStorage.getItem("token");
        const body = bulkType === "key-change"
          ? { meters, toSgc: activeRows[0]?.toSgc || "999907", toKrn: parseInt(activeRows[0]?.toKrn) || 2, toTi: parseInt(activeRows[0]?.toTi) || 1 }
          : { meters };
        const res = await fetch(`/cb/vending/bulk/${bulkType}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        setBulkResult(data);
      } catch (e) { setBulkResult({ error: e.message }); }
      setBulkLoading(false);
    }, 0);
  }

  /* ── NEW: Token Generation enhanced helpers ── */
  async function loadDbMeters() {
    try {
      const token = sessionStorage.getItem("token");
      const res = await fetch("/cb/vending/gridx-meters", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success && data.data) {
        setDbMetersList(data.data.map((m) => ({ drn: m.DRN, name: ((m.Name || "") + " " + (m.Surname || "")).trim(), city: m.City || "" })));
      }
    } catch (e) { console.error("Failed to load meters list:", e); }
  }

  function getTokenTypeConfig(type) {
    const configs = {
      "credit-electricity": { label: "Credit Token (Electricity)", class: 0, subclass: 0, isEngineering: false, amountLabel: "Amount (N$)", amountPlaceholder: "e.g. 100.00" },
      "credit-water": { label: "Credit Token (Water)", class: 0, subclass: 1, isEngineering: false, amountLabel: "Amount (N$)", amountPlaceholder: "e.g. 50.00" },
      "eng-max-power": { label: "Engineering: Set Max Power Limit", class: 2, subclass: 0, isEngineering: true, amountLabel: "Supplementary Value", amountPlaceholder: "Max power in watts (e.g. 60000)" },
      "eng-clear-credit": { label: "Engineering: Clear Credit", class: 2, subclass: 1, isEngineering: true, amountLabel: "Supplementary Value", amountPlaceholder: "65535 to clear all" },
      "eng-clear-tamper": { label: "Engineering: Clear Tamper", class: 2, subclass: 5, isEngineering: true, amountLabel: "Supplementary Value", amountPlaceholder: "65535 to clear all" },
      "eng-max-phase": { label: "Engineering: Set Max Phase Unbalance", class: 2, subclass: 6, isEngineering: true, amountLabel: "Supplementary Value", amountPlaceholder: "Phase limit value" },
    };
    return configs[type] || configs["credit-electricity"];
  }

  async function handleTokenGenerate() {
    const config = getTokenTypeConfig(tokenType);
    if (!meterNo) return;
    if (!config.isEngineering) {
      // Credit token — use existing handleHsmGenerate flow but via backend API
      if (!amount) return;
      setHsmLoading(true);
      setHsmResult(null);
      try {
        const token = sessionStorage.getItem("token");
        const res = await fetch("/cb/vending/vend", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ meterPan: meterNo, amount: parseFloat(amount), messageId }),
        });
        const data = await res.json();
        setHsmResult(data.success ? { success: true, token: data.data?.token, raw: JSON.stringify(data.data), data: data.data } : { error: data.error || "Token generation failed" });
        setMessageId(`GRIDx-${Date.now()}`);
      } catch (e) { setHsmResult({ error: e.message }); }
      setHsmLoading(false);
    } else {
      // Engineering token
      setHsmLoading(true);
      setHsmResult(null);
      try {
        const token = sessionStorage.getItem("token");
        const res = await fetch("/cb/vending/vend-engineering", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ meterPan: meterNo, tokenClass: config.class, tokenSubclass: config.subclass, supplementaryValue: parseInt(suppValue) || 0, messageId }),
        });
        const data = await res.json();
        setHsmResult(data.success ? { success: true, token: data.data?.token, raw: JSON.stringify(data.data), data: data.data } : { error: data.error || "Engineering token generation failed" });
        setMessageId(`GRIDx-${Date.now()}`);
      } catch (e) { setHsmResult({ error: e.message }); }
      setHsmLoading(false);
    }
  }

  /* ── NEW: Manual Registration enhanced helpers ── */
  function buildRegPreview() {
    setRegPreviewData({
      meterPAN: regPan, sgc: regSgc, krn: parseInt(regKrn), ti: parseInt(regTi),
      ea: parseInt(regEa), tct: parseInt(regTct), resourceType: parseInt(regResource),
      organisation: regOrg, name: regName,
    });
  }

  function generateSingleMeterCsv() {
    if (!regPan) return;
    const header = "METER_PAN,ORGANISATION,CUSTOMER_NAME,SGC,KRN,TI,EA,TCT,RESOURCE_TYPE";
    const row = `${regPan},${regOrg},${regName},${regSgc},${regKrn},${regTi},${regEa},${regTct},${regResource}`;
    const csv = header + "\n" + row;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `registration-${regPan}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ═══════════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════════ */
  const accent = "#00bfa5";
  const accentDim = accent + "30";
  const realAccent = "#00bfa5";

  return (
    <Box sx={{ p: 3, maxWidth: 1400, mx: "auto" }}>
      <Header title="HARDWARE SECURITY MODULE" subtitle="STS Vending Security Module — Token Generation & HSM Configuration" />

      {/* PrismVend Connection Status */}
      <Alert
        severity={
          prismStatus?.status === "connected" ? "success" :
          prismStatus?.status === "hsm_offline" ? "warning" :
          prismStatus?.status === "not_configured" ? "info" :
          prismStatus ? "error" : "info"
        }
        sx={{ mb: 3, fontSize: "12px", bgcolor: isDark ? (
          prismStatus?.status === "connected" ? "#4caf5010" :
          prismStatus?.status === "hsm_offline" ? "#ff980010" :
          prismStatus?.status === "not_configured" ? "#2196f310" :
          prismStatus ? "#f4433610" : undefined
        ) : undefined }}
        action={
          <Button size="small" onClick={checkPrismConnection} disabled={prismChecking}
            startIcon={prismChecking ? <CircularProgress size={12} /> : <RefreshIcon sx={{ fontSize: 14 }} />}
            sx={{ fontSize: "11px", textTransform: "none", color: "inherit" }}>
            Test Connection
          </Button>
        }
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          {prismStatus?.status === "connected" && (
            <>
              <Chip label="Connected" size="small" sx={{ bgcolor: "#4caf50", color: "#fff", fontSize: "10px", height: 20, fontWeight: 700 }} />
              <span>PrismVend online at {hsmBackendConfig?.host}:{hsmBackendConfig?.port}. HSM responding.</span>
              {prismStatus.txCreditsRemaining !== null && (
                <Chip label={`${prismStatus.txCreditsRemaining} TX credits`} size="small" sx={{ bgcolor: "#2196f320", color: "#2196f3", fontSize: "10px", height: 20 }} />
              )}
            </>
          )}
          {prismStatus?.status === "hsm_offline" && (
            <>
              <Chip label="HSM Offline" size="small" sx={{ bgcolor: "#ff9800", color: "#fff", fontSize: "10px", height: 20, fontWeight: 700 }} />
              <span>PrismVend API is reachable but the TSM250 HSM is not responding. Check the HSM hardware connection.</span>
            </>
          )}
          {prismStatus?.status === "api_unreachable" && (
            <>
              <Chip label="Disconnected" size="small" sx={{ bgcolor: "#f44336", color: "#fff", fontSize: "10px", height: 20, fontWeight: 700 }} />
              <span>Cannot reach PrismVend at {hsmBackendConfig?.host}:{hsmBackendConfig?.port}. Check network connectivity and that TsmWeb-STS is running.</span>
            </>
          )}
          {prismStatus?.status === "not_configured" && (
            <>
              <Chip label="Not Configured" size="small" sx={{ bgcolor: isDark ? "#9e9e9e" : "#757575", color: "#fff", fontSize: "10px", height: 20, fontWeight: 700 }} />
              <span>PrismVend host is not configured. Go to the &quot;PrismVend Config&quot; tab to set the HSM IP address and port.</span>
            </>
          )}
          {!prismStatus && (
            <>
              <Chip label="Checking..." size="small" sx={{ bgcolor: isDark ? "#9e9e9e" : "#757575", color: "#fff", fontSize: "10px", height: 20 }} />
              <span>Checking PrismVend connection status...</span>
            </>
          )}
          {prismStatus?.status === "error" && (
            <>
              <Chip label="Error" size="small" sx={{ bgcolor: "#f44336", color: "#fff", fontSize: "10px", height: 20, fontWeight: 700 }} />
              <span>{prismStatus.message}</span>
            </>
          )}
          {prismStatus?.checkedAt && (
            <Typography component="span" sx={{ fontSize: "10px", color: colors.grey[500], ml: 1 }}>
              Checked: {new Date(prismStatus.checkedAt).toLocaleTimeString()}
            </Typography>
          )}
        </Box>
      </Alert>

        <Box>
          {/* Local HSM agent. All HSM operations run on this agent inside the
              factory network; the cloud backend never connects to the HSM. */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2, p: 2, borderRadius: "12px", bgcolor: cardBg, border: `1px solid ${cardBorder}` }}>
            <Chip
              label={agentStatus?.online ? "Agent Online" : (agentStatus?.channelConfigured === false ? "Not Configured" : "Agent Offline")}
              size="small"
              sx={{ bgcolor: agentStatus?.online ? "#4caf50" : (agentStatus?.channelConfigured === false ? "#9e9e9e" : "#f44336"), color: "#fff", fontSize: "10px", height: 20, fontWeight: 700 }}
            />
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontSize: "13px", fontWeight: 600 }}>Local HSM Agent</Typography>
              <Typography sx={{ fontSize: "11px", color: colors.grey[400] }}>
                {agentStatus?.online
                  ? `${agentStatus?.agent?.name || "agent"} -> HSM ${agentStatus?.agent?.hsmHost || ""} | last seen ${agentStatus?.lastSeenAt ? new Date(agentStatus.lastSeenAt).toLocaleTimeString() : "-"}`
                  : agentStatus?.channelConfigured === false
                    ? "Agent channel not configured on the server (HSM_AGENT_TOKEN unset)."
                    : "No agent connected. HSM operations are unavailable until the agent is started on the factory PC."}
              </Typography>
            </Box>
            <Button size="small" variant="outlined" startIcon={<RefreshIcon />} onClick={fetchAgentStatus}>
              Refresh
            </Button>
          </Box>

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
                  {connMode === "serial" ? "COM Port" : "TCP/IP"}: {isConnected ? "Connected" : "Disconnected"}
                </Typography>
                {connMode === "serial" && serial.portInfo && (
                  <Typography sx={{ fontSize: "11px", color: colors.grey[400] }}>
                    Vendor: {serial.portInfo.vendorId || "N/A"} | Product: {serial.portInfo.productId || "N/A"}
                  </Typography>
                )}
                {connMode === "tcp" && tcp.connInfo && (
                  <Typography sx={{ fontSize: "11px", color: colors.grey[400] }}>{tcp.connInfo.url}</Typography>
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
              label={connMode === "serial" ? "Serial" : "TCP/IP"}
              size="small"
              sx={{
                bgcolor: connMode === "serial" ? "#2196f320" : "#ff980020",
                color: connMode === "serial" ? "#2196f3" : "#ff9800",
                fontWeight: 600, fontSize: "11px",
              }}
            />
            <Chip
              label={`Protocol: ${protocolFormat === "sts6" ? "STS600-8-6" : protocolFormat === "legacy" ? "STS600-8-1" : "Binary"}`}
              size="small"
              sx={{ bgcolor: realAccent + "20", color: realAccent, fontWeight: 600, fontSize: "11px" }}
            />
          </Box>

          {/* Tabs — pill/chip style */}
          <Box sx={{
            display: "flex", flexWrap: "wrap", gap: "8px", mb: 3, p: "12px",
            borderRadius: "14px", bgcolor: isDark ? colors.primary[500] : "#f5f5f5",
            border: `1px solid ${isDark ? colors.primary[300] : "#e0e0e0"}`,
          }}>
            {[
              { icon: <SecurityIcon sx={{ fontSize: 16 }} />, label: "PrismVend Config" },
              { icon: <PlayArrowIcon sx={{ fontSize: 16 }} />, label: "Token Generation" },
              { icon: <MemoryIcon sx={{ fontSize: 16 }} />, label: "Bulk Operations" },
              { icon: <VpnKeyIcon sx={{ fontSize: 16 }} />, label: "Meter Registration" },
              { icon: <MemoryIcon sx={{ fontSize: 16 }} />, label: "Direct HSM" },
              { icon: <TerminalIcon sx={{ fontSize: 16 }} />, label: "HSM Operations" },
            ].map((t, i) => (
              <Box
                key={i}
                onClick={() => setTab(i)}
                sx={{
                  display: "flex", alignItems: "center", gap: "6px",
                  px: "14px", py: "8px", borderRadius: "10px",
                  cursor: "pointer", transition: "all 0.2s ease",
                  fontSize: "12.5px", fontWeight: tab === i ? 700 : 500,
                  color: tab === i ? "#fff" : colors.grey[400],
                  bgcolor: tab === i ? realAccent : "transparent",
                  border: tab === i ? `1px solid ${realAccent}` : `1px solid transparent`,
                  boxShadow: tab === i ? `0 2px 8px ${realAccent}40` : "none",
                  "&:hover": {
                    bgcolor: tab === i ? realAccent : (isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)"),
                    color: tab === i ? "#fff" : colors.grey[200],
                    border: tab !== i ? `1px solid ${colors.grey[600]}` : undefined,
                  },
                  "& .MuiSvgIcon-root": { color: tab === i ? "#fff" : colors.grey[500], transition: "color 0.2s" },
                  "&:hover .MuiSvgIcon-root": { color: tab === i ? "#fff" : colors.grey[300] },
                }}
              >
                {t.icon}
                <Typography sx={{ fontSize: "12.5px", fontWeight: "inherit", whiteSpace: "nowrap" }}>{t.label}</Typography>
              </Box>
            ))}
          </Box>

          {/* ═══ TAB 0: PRISMVEND CONFIG ═══ */}
          {tab === 0 && (
            <Box>
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, mb: 3 }}>
                <Box sx={{ p: 3, borderRadius: "12px", bgcolor: cardBg, border: `1px solid ${cardBorder}` }}>
                  <Typography sx={{ fontWeight: 700, fontSize: "15px", mb: 1 }}>PrismVend Connection</Typography>
                  <Typography sx={{ fontSize: "12px", color: colors.grey[400], mb: 2 }}>
                    Connect to the Prism TsmWeb-STS service running on the PC with the TSM250 module.
                  </Typography>
                  <Box sx={{ display: "grid", gridTemplateColumns: "1fr", gap: 2 }}>
                    <TextField size="small" label="PrismVend Host / IP Address" value={hsmConfigForm.host}
                      onChange={(e) => setHsmConfigForm({ ...hsmConfigForm, host: e.target.value })}
                      placeholder="e.g. 192.168.1.100" />
                    <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1 }}>
                      <TextField size="small" label="API Port" value={hsmConfigForm.port}
                        onChange={(e) => setHsmConfigForm({ ...hsmConfigForm, port: e.target.value })}
                        type="number" placeholder="8080" />
                      <TextField size="small" label="UI Port" value={hsmConfigForm.uiPort}
                        onChange={(e) => setHsmConfigForm({ ...hsmConfigForm, uiPort: e.target.value })}
                        type="number" placeholder="80" />
                      <TextField size="small" label="TLS Port" value={hsmConfigForm.tlsPort}
                        onChange={(e) => setHsmConfigForm({ ...hsmConfigForm, tlsPort: e.target.value })}
                        type="number" placeholder="9443" />
                    </Box>
                    <FormControlLabel
                      control={<Switch checked={hsmConfigForm.useTLS} onChange={(e) => setHsmConfigForm({ ...hsmConfigForm, useTLS: e.target.checked })} size="small" />}
                      label={<Typography sx={{ fontSize: "12px" }}>Use HTTPS (TLS)</Typography>}
                    />
                    <TextField size="small" label="Timeout (ms)" value={hsmConfigForm.timeout}
                      onChange={(e) => setHsmConfigForm({ ...hsmConfigForm, timeout: parseInt(e.target.value) || 15000 })}
                      type="number" />
                  </Box>
                  <Box sx={{ mt: 2, display: "flex", gap: 2 }}>
                    <Button variant="contained" startIcon={hsmConfigSaving ? <CircularProgress size={16} /> : <SaveIcon />}
                      onClick={saveHsmConfig} disabled={hsmConfigSaving || !hsmConfigForm.host || !hsmConfigForm.port}
                      sx={{ bgcolor: realAccent, "&:hover": { bgcolor: "#009688" } }}>
                      Save Configuration
                    </Button>
                    <Button variant="outlined" startIcon={<RefreshIcon />} onClick={loadHsmConfig}
                      sx={{ borderColor: colors.grey[500], color: colors.grey[400] }}>
                      Refresh
                    </Button>
                  </Box>
                </Box>

                <Box sx={{ p: 3, borderRadius: "12px", bgcolor: cardBg, border: `1px solid ${cardBorder}` }}>
                  <Typography sx={{ fontWeight: 700, fontSize: "15px", mb: 2 }}>PrismVend Status</Typography>
                  {hsmConfigLoading ? <CircularProgress size={24} /> : hsmBackendConfig ? (
                    <Box>
                      {[
                        ["Connection", hsmBackendConfig.configured ? "Configured" : "Not Configured"],
                        ["Mode", "PrismVend (TsmWeb-STS)"],
                        ["Host", hsmBackendConfig.host || "Not set"],
                        ["API Port", hsmBackendConfig.port || "8080"],
                        ["TLS", hsmBackendConfig.useTLS ? "Enabled" : "Disabled"],
                        ["API", "No auth required (network-secured)"],
                        ["Supply Group (SGC)", hsmBackendConfig.defaultSGC],
                        ["Key Revision (KRN)", hsmBackendConfig.defaultKRN],
                        ["Tariff Index (TI)", hsmBackendConfig.defaultTI],
                        ["Encryption (EA)", hsmBackendConfig.defaultEA || 7],
                        ["Token Carrier (TCT)", hsmBackendConfig.defaultTCT || 2],
                      ].map(([label, value], i) => (
                        <Box key={label} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", py: 0.8, px: 1, borderRadius: "6px", bgcolor: i % 2 === 0 ? (isDark ? "#0d1117" : "#fafafa") : "transparent" }}>
                          <Typography sx={{ fontSize: "12px", color: colors.grey[400] }}>{label}</Typography>
                          <Typography sx={{ fontSize: "12px", fontWeight: 600,
                            fontFamily: ["Supply Group (SGC)", "Token Carrier (TCT)", "Encryption (EA)"].includes(label) ? "monospace" : "inherit",
                            color: label === "Connection" ? (hsmBackendConfig.configured ? "#4caf50" : "#ff9800") :
                                   label === "Session" ? (hsmBackendConfig.sessionActive ? "#4caf50" : colors.grey[400]) : undefined }}>
                            {String(value)}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  ) : (
                    <Typography sx={{ color: colors.grey[500], fontSize: "13px" }}>Loading...</Typography>
                  )}

                  {hsmBackendConfig?.endpoints && (
                    <Box sx={{ mt: 2, pt: 2, borderTop: `1px solid ${cardBorder}` }}>
                      <Typography sx={{ fontSize: "11px", fontWeight: 600, color: colors.grey[400], mb: 1 }}>API Endpoints</Typography>
                      {Object.entries(hsmBackendConfig.endpoints).map(([key, val]) => (
                        <Typography key={key} sx={{ fontSize: "11px", fontFamily: "monospace", color: colors.grey[500], mb: 0.3 }}>
                          {key}: {val}
                        </Typography>
                      ))}
                    </Box>
                  )}
                </Box>
              </Box>

              {/* Token Verification */}
              <Box sx={{ p: 3, borderRadius: "12px", bgcolor: cardBg, border: `1px solid ${cardBorder}` }}>
                <Typography sx={{ fontWeight: 700, fontSize: "15px", mb: 2 }}>Token Verification</Typography>
                <Box sx={{ display: "flex", gap: 2, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <TextField size="small" label="Meter PAN" value={verifyPan} onChange={(e) => setVerifyPan(e.target.value)}
                    placeholder="11 or 13 digit PAN" sx={{ minWidth: 200 }} />
                  <TextField size="small" label="20-Digit Token" value={verifyTokenVal} onChange={(e) => setVerifyTokenVal(e.target.value)}
                    placeholder="e.g. 25090336776125269" sx={{ minWidth: 260 }} inputProps={{ style: { fontFamily: "monospace" } }} />
                  <Button variant="contained" onClick={handleVerifyToken} disabled={verifyLoading || !verifyPan || !verifyTokenVal}
                    startIcon={verifyLoading ? <CircularProgress size={16} /> : <CheckCircleIcon />}
                    sx={{ bgcolor: realAccent, "&:hover": { bgcolor: "#009688" }, height: 40 }}>
                    Verify
                  </Button>
                </Box>
                {verifyResult && (
                  <Alert severity={verifyResult.success ? "success" : "error"} sx={{ mt: 2, fontSize: "12px" }}>
                    {verifyResult.success ? "Token verified successfully" : (verifyResult.error || "Verification failed")}
                    {verifyResult.data && <pre style={{ fontSize: "11px", marginTop: 4 }}>{JSON.stringify(verifyResult.data, null, 2)}</pre>}
                  </Alert>
                )}
              </Box>
            </Box>
          )}

          {/* ═══ TAB 1: TOKEN GENERATION (Form-Driven) ═══ */}
          {tab === 1 && (
            <Box>
              <Box sx={{ p: 3, borderRadius: "12px", bgcolor: cardBg, border: `1px solid ${cardBorder}`, mb: 3 }}>
                <Typography sx={{ fontWeight: 700, fontSize: "15px", mb: 2 }}>Token Generation</Typography>

                {/* Token Type Selector */}
                <FormControl size="small" sx={{ minWidth: 340, mb: 2.5 }}>
                  <InputLabel>Token Type</InputLabel>
                  <Select value={tokenType} onChange={(e) => { setTokenType(e.target.value); setHsmResult(null); setSuppValue(""); }}
                    label="Token Type">
                    <MenuItem value="credit-electricity">Credit Token (Electricity) — Class 0, Subclass 0</MenuItem>
                    <MenuItem value="credit-water">Credit Token (Water) — Class 0, Subclass 1</MenuItem>
                    <Divider />
                    <MenuItem value="eng-max-power">Engineering: Set Max Power Limit — Class 2, Sub 0</MenuItem>
                    <MenuItem value="eng-clear-credit">Engineering: Clear Credit — Class 2, Sub 1</MenuItem>
                    <MenuItem value="eng-clear-tamper">Engineering: Clear Tamper — Class 2, Sub 5</MenuItem>
                    <MenuItem value="eng-max-phase">Engineering: Set Max Phase Unbalance — Class 2, Sub 6</MenuItem>
                  </Select>
                </FormControl>

                {/* Token type indicator chip */}
                <Box sx={{ mb: 2.5 }}>
                  <Chip size="small"
                    label={getTokenTypeConfig(tokenType).isEngineering ? "Engineering Token" : "Credit Token"}
                    sx={{
                      bgcolor: getTokenTypeConfig(tokenType).isEngineering ? "#ff980020" : "#4caf5020",
                      color: getTokenTypeConfig(tokenType).isEngineering ? "#ff9800" : "#4caf50",
                      fontWeight: 700, fontSize: "11px",
                    }} />
                </Box>

                {/* Meter Number with Pick from Database */}
                <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start", mb: 2.5, flexWrap: "wrap" }}>
                  <Box sx={{ position: "relative", minWidth: 280, flex: 1, maxWidth: 380 }}>
                    <TextField size="small" label="Meter Number (PAN/DRN)" value={meterNo} onChange={(e) => setMeterNo(e.target.value)}
                      fullWidth placeholder="e.g. 0260066545641"
                      inputProps={{ style: { fontFamily: "monospace" } }} />
                    <Button size="small" variant="text"
                      onClick={async () => {
                        if (dbMetersList.length === 0) await loadDbMeters();
                        setDbMetersOpen(!dbMetersOpen);
                      }}
                      sx={{ fontSize: "11px", color: "#2196f3", textTransform: "none", mt: 0.5 }}>
                      Pick from Database
                    </Button>
                    {dbMetersOpen && dbMetersList.length > 0 && (
                      <Box sx={{
                        position: "absolute", zIndex: 10, top: 70, left: 0, right: 0,
                        maxHeight: 220, overflowY: "auto",
                        bgcolor: cardBg, border: `1px solid ${cardBorder}`, borderRadius: "8px",
                        boxShadow: isDark ? "0 8px 24px rgba(0,0,0,0.6)" : "0 8px 24px rgba(0,0,0,0.15)",
                      }}>
                        {dbMetersList.map((m, i) => (
                          <Box key={m.drn} sx={{
                            px: 1.5, py: 1, cursor: "pointer",
                            "&:hover": { bgcolor: isDark ? "#161b22" : "#f5f5f5" },
                            borderBottom: i < dbMetersList.length - 1 ? `1px solid ${cardBorder}` : "none",
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                          }}
                            onClick={() => { setMeterNo(m.drn); setDbMetersOpen(false); }}>
                            <Typography sx={{ fontFamily: "monospace", fontSize: "12px", fontWeight: 600 }}>{m.drn}</Typography>
                            <Typography sx={{ fontSize: "11px", color: colors.grey[400] }}>{m.name || m.city || ""}</Typography>
                          </Box>
                        ))}
                      </Box>
                    )}
                  </Box>

                  {/* Amount or Supplementary Value field */}
                  {!getTokenTypeConfig(tokenType).isEngineering ? (
                    <TextField size="small" label={getTokenTypeConfig(tokenType).amountLabel} value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      type="number" sx={{ minWidth: 180 }}
                      placeholder={getTokenTypeConfig(tokenType).amountPlaceholder} />
                  ) : (
                    <TextField size="small" label={getTokenTypeConfig(tokenType).amountLabel} value={suppValue}
                      onChange={(e) => setSuppValue(e.target.value)}
                      type="number" sx={{ minWidth: 240 }}
                      placeholder={getTokenTypeConfig(tokenType).amountPlaceholder} />
                  )}

                  {/* Message ID */}
                  <TextField size="small" label="Message ID (replay prevention)" value={messageId}
                    onChange={(e) => setMessageId(e.target.value)}
                    sx={{ minWidth: 220 }}
                    inputProps={{ style: { fontFamily: "monospace", fontSize: "12px" } }}
                    helperText="Auto-generated, editable" />
                </Box>

                {/* Generate Button */}
                <Tooltip title={prismStatus?.connected !== true ? "PrismVend is not connected. Configure the connection on the PrismVend Config tab." : ""}>
                  <span>
                    <Button variant="contained"
                      startIcon={hsmLoading ? <CircularProgress size={16} /> : <SecurityIcon />}
                      onClick={handleTokenGenerate}
                      disabled={hsmLoading || !meterNo || (!getTokenTypeConfig(tokenType).isEngineering ? !amount : false) || prismStatus?.connected !== true}
                      sx={{ bgcolor: realAccent, "&:hover": { bgcolor: "#009688" }, height: 42, px: 3 }}>
                      {hsmLoading ? "Generating..." : (getTokenTypeConfig(tokenType).isEngineering ? "Generate Engineering Token" : "Generate Credit Token")}
                    </Button>
                  </span>
                </Tooltip>
                {prismStatus?.connected !== true && <Typography sx={{ fontSize: "10px", color: "#f44336", ml: 1 }}>PrismVend offline</Typography>}
              </Box>

              {/* Result Display */}
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr", gap: 3, mb: 3 }}>
                <Box sx={{ p: 3, borderRadius: "12px", bgcolor: cardBg, border: `1px solid ${cardBorder}` }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: realAccent }} />
                    <Typography sx={{ fontWeight: 700, fontSize: "14px" }}>Token Output</Typography>
                  </Box>
                  {hsmLoading && <CircularProgress size={24} />}
                  {hsmResult && !hsmResult.error && (
                    <Box>
                      <Box sx={{ p: 3, borderRadius: "10px", bgcolor: isDark ? "#0d1117" : "#f5f5f5", mb: 2, textAlign: "center", border: `1px solid ${isDark ? "#1a3a35" : "#b2dfdb"}` }}>
                        <Typography sx={{ fontSize: "11px", color: colors.grey[400], mb: 0.5, textTransform: "uppercase", letterSpacing: 1 }}>
                          {getTokenTypeConfig(tokenType).isEngineering ? "Engineering Token" : "STS Prepaid Token"}
                        </Typography>
                        <Typography sx={{ fontFamily: "monospace", fontSize: "28px", fontWeight: 700, letterSpacing: "3px", color: realAccent, my: 1 }}>
                          {hsmResult.token ? hsmResult.token.match(/.{1,4}/g).join(" ") : "---"}
                        </Typography>
                        <Tooltip title={tokenCopied ? "Copied!" : "Copy token"}>
                          <Button size="small" startIcon={tokenCopied ? <CheckCircleIcon /> : <ContentCopyIcon />}
                            onClick={() => {
                              navigator.clipboard.writeText(hsmResult.token || "");
                              setTokenCopied(true);
                              setTimeout(() => setTokenCopied(false), 2000);
                            }}
                            sx={{ color: tokenCopied ? "#4caf50" : colors.grey[400], textTransform: "none", fontSize: "12px", mt: 0.5 }}>
                            {tokenCopied ? "Copied" : "Copy Token"}
                          </Button>
                        </Tooltip>
                      </Box>

                      {hsmResult.data && (
                        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, mb: 2 }}>
                          {hsmResult.data.kwhUnits != null && (
                            <Box sx={{ p: 1.5, borderRadius: "6px", bgcolor: isDark ? "#0d111740" : "#fafafa", textAlign: "center" }}>
                              <Typography sx={{ fontSize: "10px", color: colors.grey[400] }}>kWh Units</Typography>
                              <Typography sx={{ fontSize: "14px", fontWeight: 700, fontFamily: "monospace" }}>{hsmResult.data.kwhUnits}</Typography>
                            </Box>
                          )}
                          {hsmResult.data.tariff && (
                            <Box sx={{ p: 1.5, borderRadius: "6px", bgcolor: isDark ? "#0d111740" : "#fafafa", textAlign: "center" }}>
                              <Typography sx={{ fontSize: "10px", color: colors.grey[400] }}>Tariff Applied</Typography>
                              <Typography sx={{ fontSize: "14px", fontWeight: 700 }}>{hsmResult.data.tariff}</Typography>
                            </Box>
                          )}
                          {hsmResult.data.valueActual != null && (
                            <Box sx={{ p: 1.5, borderRadius: "6px", bgcolor: isDark ? "#0d111740" : "#fafafa", textAlign: "center" }}>
                              <Typography sx={{ fontSize: "10px", color: colors.grey[400] }}>Value Actual</Typography>
                              <Typography sx={{ fontSize: "14px", fontWeight: 700, fontFamily: "monospace" }}>N$ {hsmResult.data.valueActual}</Typography>
                            </Box>
                          )}
                          {hsmResult.data.description && (
                            <Box sx={{ p: 1.5, borderRadius: "6px", bgcolor: isDark ? "#0d111740" : "#fafafa", gridColumn: "1 / -1" }}>
                              <Typography sx={{ fontSize: "10px", color: colors.grey[400] }}>Description</Typography>
                              <Typography sx={{ fontSize: "12px" }}>{hsmResult.data.description}</Typography>
                            </Box>
                          )}
                        </Box>
                      )}

                      {hsmResult.raw && (
                        <Box sx={{ p: 1.5, borderRadius: "6px", bgcolor: isDark ? "#0d1117" : "#f5f5f5" }}>
                          <Typography sx={{ fontSize: "11px", color: colors.grey[400], mb: 0.5 }}>Raw Response</Typography>
                          <Typography sx={{ fontFamily: "monospace", fontSize: "11px", wordBreak: "break-all", color: isDark ? "#8b949e" : "#57606a" }}>
                            {hsmResult.raw}
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  )}
                  {hsmResult && hsmResult.error && <Alert severity="error" sx={{ fontSize: "12px" }}>{hsmResult.error}</Alert>}
                  {!hsmResult && !hsmLoading && (
                    <Typography sx={{ color: colors.grey[500], fontSize: "13px", fontStyle: "italic" }}>
                      Select a token type, enter meter details, and click Generate to produce a token.
                    </Typography>
                  )}
                </Box>
              </Box>

              {/* Data Flow */}
              <Box sx={{ p: 3, borderRadius: "12px", bgcolor: cardBg, border: `1px solid ${cardBorder}` }}>
                <Typography sx={{ fontWeight: 700, fontSize: "15px", mb: 2 }}>Data Flow Trace</Typography>
                {dataFlow.length === 0 ? (
                  <Typography sx={{ color: colors.grey[500], fontSize: "13px", fontStyle: "italic" }}>Generate a token to see the step-by-step data flow.</Typography>
                ) : (
                  <Box sx={{ position: "relative" }}>
                    <Box sx={{ position: "absolute", left: 20, top: 12, bottom: 12, width: 2, bgcolor: realAccent + "40" }} />
                    {dataFlow.map((step, i) => (
                      <Box key={i} sx={{ display: "flex", gap: 2, mb: 2, position: "relative" }}>
                        <Box sx={{
                          width: 42, height: 42, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                          bgcolor: step.direction === "outbound" ? "#2196f320" : step.direction === "inbound" ? "#4caf5020" : accentDim,
                          border: `2px solid ${step.direction === "outbound" ? "#2196f3" : step.direction === "inbound" ? "#4caf50" : accent}`,
                          zIndex: 1, flexShrink: 0,
                        }}>
                          <Typography sx={{ fontSize: "13px", fontWeight: 700, color: step.direction === "outbound" ? "#2196f3" : step.direction === "inbound" ? "#4caf50" : accent }}>
                            {step.step}
                          </Typography>
                        </Box>
                        <Box sx={{ flex: 1, p: 2, borderRadius: "8px", bgcolor: isDark ? "#0d1117" : "#fafafa", border: `1px solid ${isDark ? "#30363d" : "#e0e0e0"}` }}>
                          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                            <Typography sx={{ fontWeight: 600, fontSize: "13px" }}>{step.label}</Typography>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                              <Chip label={step.direction} size="small" sx={{
                                height: 20, fontSize: "10px", fontWeight: 600,
                                bgcolor: step.direction === "outbound" ? "#2196f320" : "#4caf5020",
                                color: step.direction === "outbound" ? "#2196f3" : "#4caf50",
                              }} />
                              <Typography sx={{ fontSize: "10px", color: colors.grey[500], fontFamily: "monospace" }}>{fmtTime(step.timestamp)}</Typography>
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

          {/* ═══ TAB 2: BULK OPERATIONS (Form-Driven) ═══ */}
          {tab === 2 && (
            <Box>
              <Box sx={{ p: 3, borderRadius: "12px", bgcolor: cardBg, border: `1px solid ${cardBorder}`, mb: 3 }}>
                <Typography sx={{ fontWeight: 700, fontSize: "15px", mb: 1 }}>Bulk CSV Generation for PrismVend</Typography>
                <Typography sx={{ fontSize: "12px", color: colors.grey[400], mb: 2 }}>
                  Add meters using the table below. Load from the database or add rows manually. The system generates the CSV automatically.
                </Typography>

                {/* Operation Type + Action Buttons Row */}
                <Box sx={{ display: "flex", gap: 2, alignItems: "flex-end", flexWrap: "wrap", mb: 3 }}>
                  <FormControl size="small" sx={{ minWidth: 280 }}>
                    <InputLabel>Operation Type</InputLabel>
                    <Select value={bulkType} onChange={(e) => { setBulkType(e.target.value); setBulkRows([]); setBulkResult(null); }} label="Operation Type">
                      <MenuItem value="meter-import">Bulk Meter Import</MenuItem>
                      <MenuItem value="key-change">Bulk Key Change</MenuItem>
                      <MenuItem value="engineering-tokens">Bulk Engineering Tokens</MenuItem>
                    </Select>
                  </FormControl>
                  <Button variant="outlined" startIcon={bulkDbLoading ? <CircularProgress size={16} /> : <CloudIcon />}
                    onClick={loadBulkFromDb} disabled={bulkDbLoading}
                    sx={{ borderColor: "#2196f3", color: "#2196f3", textTransform: "none", height: 40 }}>
                    {bulkDbLoading ? "Loading..." : "Load from Database"}
                  </Button>
                  <Button variant="outlined" startIcon={<AddIcon />} onClick={addBulkRow}
                    sx={{ borderColor: realAccent, color: realAccent, textTransform: "none", height: 40 }}>
                    Add Row
                  </Button>
                  {bulkRows.length > 0 && (
                    <Chip label={`${bulkRows.filter((r) => r.selected).length} of ${bulkRows.length} meters selected`} size="small"
                      sx={{ bgcolor: realAccent + "20", color: realAccent, fontWeight: 600, fontSize: "12px", height: 32 }} />
                  )}
                </Box>

                {/* Editable Meters Table */}
                {bulkRows.length > 0 && (
                  <TableContainer component={Paper} sx={{ bgcolor: "transparent", boxShadow: "none", maxHeight: 420, mb: 2, border: `1px solid ${cardBorder}`, borderRadius: "8px" }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell padding="checkbox" sx={{ bgcolor: isDark ? "#161b22" : "#fafafa", width: 44 }}>
                            <Checkbox size="small"
                              checked={bulkRows.length > 0 && bulkRows.every((r) => r.selected)}
                              indeterminate={bulkRows.some((r) => r.selected) && !bulkRows.every((r) => r.selected)}
                              onChange={() => {
                                const allSel = bulkRows.every((r) => r.selected);
                                setBulkRows((prev) => prev.map((r) => ({ ...r, selected: !allSel })));
                              }}
                              sx={{ color: colors.grey[500], "&.Mui-checked": { color: realAccent }, "&.MuiCheckbox-indeterminate": { color: realAccent } }} />
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: "11px", color: colors.grey[400], bgcolor: isDark ? "#161b22" : "#fafafa", minWidth: 150 }}>Meter PAN</TableCell>
                          {bulkType === "meter-import" && (
                            <>
                              <TableCell sx={{ fontWeight: 700, fontSize: "11px", color: colors.grey[400], bgcolor: isDark ? "#161b22" : "#fafafa", minWidth: 140 }}>Organisation</TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: "11px", color: colors.grey[400], bgcolor: isDark ? "#161b22" : "#fafafa", minWidth: 140 }}>Customer Name</TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: "11px", color: colors.grey[400], bgcolor: isDark ? "#161b22" : "#fafafa", width: 90 }}>SGC</TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: "11px", color: colors.grey[400], bgcolor: isDark ? "#161b22" : "#fafafa", width: 60 }}>KRN</TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: "11px", color: colors.grey[400], bgcolor: isDark ? "#161b22" : "#fafafa", width: 60 }}>TI</TableCell>
                            </>
                          )}
                          {bulkType === "key-change" && (
                            <>
                              <TableCell sx={{ fontWeight: 700, fontSize: "11px", color: colors.grey[400], bgcolor: isDark ? "#161b22" : "#fafafa", width: 90 }}>From SGC</TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: "11px", color: colors.grey[400], bgcolor: isDark ? "#161b22" : "#fafafa", width: 60 }}>From KRN</TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: "11px", color: colors.grey[400], bgcolor: isDark ? "#161b22" : "#fafafa", width: 60 }}>From TI</TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: "11px", color: colors.grey[400], bgcolor: isDark ? "#161b22" : "#fafafa", width: 90 }}>To SGC</TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: "11px", color: colors.grey[400], bgcolor: isDark ? "#161b22" : "#fafafa", width: 60 }}>To KRN</TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: "11px", color: colors.grey[400], bgcolor: isDark ? "#161b22" : "#fafafa", width: 60 }}>To TI</TableCell>
                            </>
                          )}
                          {bulkType === "engineering-tokens" && (
                            <>
                              <TableCell sx={{ fontWeight: 700, fontSize: "11px", color: colors.grey[400], bgcolor: isDark ? "#161b22" : "#fafafa", width: 90 }}>SGC</TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: "11px", color: colors.grey[400], bgcolor: isDark ? "#161b22" : "#fafafa", width: 60 }}>KRN</TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: "11px", color: colors.grey[400], bgcolor: isDark ? "#161b22" : "#fafafa", width: 60 }}>TI</TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: "11px", color: colors.grey[400], bgcolor: isDark ? "#161b22" : "#fafafa", minWidth: 180 }}>Token Type</TableCell>
                            </>
                          )}
                          <TableCell sx={{ fontWeight: 700, fontSize: "11px", color: colors.grey[400], bgcolor: isDark ? "#161b22" : "#fafafa", width: 50 }} />
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {bulkRows.map((row, idx) => (
                          <TableRow key={idx} sx={{ bgcolor: idx % 2 === 0 ? "transparent" : (isDark ? "#0d111720" : "#fafafa20"), opacity: row.selected ? 1 : 0.5 }}>
                            <TableCell padding="checkbox">
                              <Checkbox size="small" checked={row.selected}
                                onChange={() => updateBulkRow(idx, "selected", !row.selected)}
                                sx={{ color: colors.grey[500], "&.Mui-checked": { color: realAccent } }} />
                            </TableCell>
                            <TableCell>
                              <TextField size="small" variant="standard" value={row.meterPAN}
                                onChange={(e) => updateBulkRow(idx, "meterPAN", e.target.value)}
                                placeholder="0260060135803"
                                inputProps={{ style: { fontFamily: "monospace", fontSize: "12px" } }}
                                sx={{ "& .MuiInput-underline:before": { borderColor: cardBorder } }} />
                            </TableCell>
                            {bulkType === "meter-import" && (
                              <>
                                <TableCell>
                                  <TextField size="small" variant="standard" value={row.organisation}
                                    onChange={(e) => updateBulkRow(idx, "organisation", e.target.value)}
                                    inputProps={{ style: { fontSize: "12px" } }}
                                    sx={{ "& .MuiInput-underline:before": { borderColor: cardBorder } }} />
                                </TableCell>
                                <TableCell>
                                  <TextField size="small" variant="standard" value={row.name}
                                    onChange={(e) => updateBulkRow(idx, "name", e.target.value)}
                                    placeholder="Customer name"
                                    inputProps={{ style: { fontSize: "12px" } }}
                                    sx={{ "& .MuiInput-underline:before": { borderColor: cardBorder } }} />
                                </TableCell>
                                <TableCell>
                                  <TextField size="small" variant="standard" value={row.sgc}
                                    onChange={(e) => updateBulkRow(idx, "sgc", e.target.value)}
                                    inputProps={{ style: { fontFamily: "monospace", fontSize: "12px", width: 60 } }}
                                    sx={{ "& .MuiInput-underline:before": { borderColor: cardBorder } }} />
                                </TableCell>
                                <TableCell>
                                  <TextField size="small" variant="standard" value={row.krn} type="number"
                                    onChange={(e) => updateBulkRow(idx, "krn", e.target.value)}
                                    inputProps={{ style: { fontFamily: "monospace", fontSize: "12px", width: 40 } }}
                                    sx={{ "& .MuiInput-underline:before": { borderColor: cardBorder } }} />
                                </TableCell>
                                <TableCell>
                                  <TextField size="small" variant="standard" value={row.ti} type="number"
                                    onChange={(e) => updateBulkRow(idx, "ti", e.target.value)}
                                    inputProps={{ style: { fontFamily: "monospace", fontSize: "12px", width: 40 } }}
                                    sx={{ "& .MuiInput-underline:before": { borderColor: cardBorder } }} />
                                </TableCell>
                              </>
                            )}
                            {bulkType === "key-change" && (
                              <>
                                <TableCell>
                                  <TextField size="small" variant="standard" value={row.fromSgc}
                                    onChange={(e) => updateBulkRow(idx, "fromSgc", e.target.value)}
                                    inputProps={{ style: { fontFamily: "monospace", fontSize: "12px", width: 60 } }}
                                    sx={{ "& .MuiInput-underline:before": { borderColor: cardBorder } }} />
                                </TableCell>
                                <TableCell>
                                  <TextField size="small" variant="standard" value={row.fromKrn} type="number"
                                    onChange={(e) => updateBulkRow(idx, "fromKrn", e.target.value)}
                                    inputProps={{ style: { fontFamily: "monospace", fontSize: "12px", width: 40 } }}
                                    sx={{ "& .MuiInput-underline:before": { borderColor: cardBorder } }} />
                                </TableCell>
                                <TableCell>
                                  <TextField size="small" variant="standard" value={row.fromTi} type="number"
                                    onChange={(e) => updateBulkRow(idx, "fromTi", e.target.value)}
                                    inputProps={{ style: { fontFamily: "monospace", fontSize: "12px", width: 40 } }}
                                    sx={{ "& .MuiInput-underline:before": { borderColor: cardBorder } }} />
                                </TableCell>
                                <TableCell>
                                  <TextField size="small" variant="standard" value={row.toSgc}
                                    onChange={(e) => updateBulkRow(idx, "toSgc", e.target.value)}
                                    inputProps={{ style: { fontFamily: "monospace", fontSize: "12px", width: 60 } }}
                                    sx={{ "& .MuiInput-underline:before": { borderColor: cardBorder } }} />
                                </TableCell>
                                <TableCell>
                                  <TextField size="small" variant="standard" value={row.toKrn} type="number"
                                    onChange={(e) => updateBulkRow(idx, "toKrn", e.target.value)}
                                    inputProps={{ style: { fontFamily: "monospace", fontSize: "12px", width: 40 } }}
                                    sx={{ "& .MuiInput-underline:before": { borderColor: cardBorder } }} />
                                </TableCell>
                                <TableCell>
                                  <TextField size="small" variant="standard" value={row.toTi} type="number"
                                    onChange={(e) => updateBulkRow(idx, "toTi", e.target.value)}
                                    inputProps={{ style: { fontFamily: "monospace", fontSize: "12px", width: 40 } }}
                                    sx={{ "& .MuiInput-underline:before": { borderColor: cardBorder } }} />
                                </TableCell>
                              </>
                            )}
                            {bulkType === "engineering-tokens" && (
                              <>
                                <TableCell>
                                  <TextField size="small" variant="standard" value={row.sgc}
                                    onChange={(e) => updateBulkRow(idx, "sgc", e.target.value)}
                                    inputProps={{ style: { fontFamily: "monospace", fontSize: "12px", width: 60 } }}
                                    sx={{ "& .MuiInput-underline:before": { borderColor: cardBorder } }} />
                                </TableCell>
                                <TableCell>
                                  <TextField size="small" variant="standard" value={row.krn} type="number"
                                    onChange={(e) => updateBulkRow(idx, "krn", e.target.value)}
                                    inputProps={{ style: { fontFamily: "monospace", fontSize: "12px", width: 40 } }}
                                    sx={{ "& .MuiInput-underline:before": { borderColor: cardBorder } }} />
                                </TableCell>
                                <TableCell>
                                  <TextField size="small" variant="standard" value={row.ti} type="number"
                                    onChange={(e) => updateBulkRow(idx, "ti", e.target.value)}
                                    inputProps={{ style: { fontFamily: "monospace", fontSize: "12px", width: 40 } }}
                                    sx={{ "& .MuiInput-underline:before": { borderColor: cardBorder } }} />
                                </TableCell>
                                <TableCell>
                                  <FormControl size="small" variant="standard" sx={{ minWidth: 160 }}>
                                    <Select value={row.tokenType} onChange={(e) => updateBulkRow(idx, "tokenType", e.target.value)}
                                      sx={{ fontSize: "12px" }}>
                                      <MenuItem value="max-power-limit">Max Power Limit</MenuItem>
                                      <MenuItem value="clear-credit">Clear Credit</MenuItem>
                                      <MenuItem value="clear-tamper">Clear Tamper</MenuItem>
                                      <MenuItem value="max-phase-limit">Max Phase Limit</MenuItem>
                                    </Select>
                                  </FormControl>
                                </TableCell>
                              </>
                            )}
                            <TableCell>
                              <Tooltip title="Remove row">
                                <IconButton size="small" onClick={() => removeBulkRow(idx)} sx={{ color: "#f44336" }}>
                                  <DeleteIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}

                {/* Empty State */}
                {bulkRows.length === 0 && (
                  <Box sx={{ p: 4, textAlign: "center", color: colors.grey[500], border: `1px dashed ${cardBorder}`, borderRadius: "8px", mb: 2 }}>
                    <MemoryIcon sx={{ fontSize: 40, mb: 1, opacity: 0.3 }} />
                    <Typography sx={{ fontSize: "13px", mb: 0.5 }}>No meters added yet</Typography>
                    <Typography sx={{ fontSize: "11px", color: colors.grey[500] }}>
                      Click "Load from Database" to import GRIDx meters, or "Add Row" to enter meters manually.
                    </Typography>
                  </Box>
                )}

                {/* Action Buttons */}
                <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
                  {bulkType === "meter-import" && (<>
                    <Tooltip title={prismStatus?.connected !== true ? "PrismVend is not connected. Configure the connection on the PrismVend Config tab." : ""}>
                      <span>
                        <Button variant="contained" onClick={async () => {
                          const activeRows = bulkRows.filter(r => r.selected && r.meterPAN.trim());
                          if (activeRows.length === 0) return;
                          setBulkLoading(true);
                          setBulkResult(null);
                          try {
                            const token = sessionStorage.getItem("token");
                            const res = await fetch("/cb/vending/gridx-register", {
                              method: "POST",
                              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                              body: JSON.stringify({ drns: activeRows.map(r => r.meterPAN.trim()) }),
                            });
                            const data = await res.json();
                            setBulkResult({ success: data.success, apiResult: data, message: `Registered ${data.summary?.success || 0} of ${data.summary?.total || 0} meters via PrismVend API` });
                          } catch (e) { setBulkResult({ success: false, error: e.message }); }
                          setBulkLoading(false);
                        }}
                          disabled={bulkLoading || bulkRows.filter(r => r.selected && r.meterPAN.trim()).length === 0 || prismStatus?.connected !== true}
                          startIcon={bulkLoading ? <CircularProgress size={16} /> : <SendIcon />}
                          sx={{ bgcolor: "#2196f3", "&:hover": { bgcolor: "#1976d2" } }}>
                          {bulkLoading ? "Registering..." : `Register via PrismVend API (${bulkRows.filter(r => r.selected && r.meterPAN.trim()).length})`}
                        </Button>
                      </span>
                    </Tooltip>
                  </>)}
                  {bulkType === "engineering-tokens" && (<>
                    <Tooltip title={prismStatus?.connected !== true ? "PrismVend is not connected. Configure the connection on the PrismVend Config tab." : ""}>
                      <span>
                        <Button variant="contained" onClick={async () => {
                          const activeRows = bulkRows.filter(r => r.selected && r.meterPAN.trim());
                          if (activeRows.length === 0) return;
                          setBulkLoading(true);
                          setBulkResult(null);
                          const results = [];
                          for (const row of activeRows) {
                            try {
                              const token = sessionStorage.getItem("token");
                              const subMap = { "max-power-limit": 0, "clear-credit": 1, "clear-tamper": 5, "max-phase-limit": 6 };
                              const res = await fetch("/cb/vending/vend-engineering", {
                                method: "POST",
                                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                body: JSON.stringify({ meterId: row.meterPAN, subclass: subMap[row.tokenType] || 1, supp: 0 }),
                              });
                              const data = await res.json();
                              results.push({ drn: row.meterPAN, success: data.success, token: data.data?.tokenDec, description: data.data?.description });
                            } catch (e) { results.push({ drn: row.meterPAN, success: false, error: e.message }); }
                          }
                          setBulkResult({ success: true, apiResult: { data: results }, message: `Generated engineering tokens for ${results.filter(r => r.success).length} of ${results.length} meters` });
                          setBulkLoading(false);
                        }}
                          disabled={bulkLoading || bulkRows.filter(r => r.selected && r.meterPAN.trim()).length === 0 || prismStatus?.connected !== true}
                          startIcon={bulkLoading ? <CircularProgress size={16} /> : <SecurityIcon />}
                          sx={{ bgcolor: "#ff9800", "&:hover": { bgcolor: "#f57c00" } }}>
                          {bulkLoading ? "Generating..." : `Execute via PrismVend API (${bulkRows.filter(r => r.selected && r.meterPAN.trim()).length})`}
                        </Button>
                      </span>
                    </Tooltip>
                  </>)}
                  {bulkType === "key-change" && (<>
                    <Tooltip title={prismStatus?.connected !== true ? "PrismVend is not connected. Configure the connection on the PrismVend Config tab." : ""}>
                      <span>
                        <Button variant="contained" onClick={async () => {
                          const activeRows = bulkRows.filter(r => r.selected && r.meterPAN.trim());
                          if (activeRows.length === 0) return;
                          setBulkLoading(true);
                          setBulkResult(null);
                          const results = [];
                          for (const row of activeRows) {
                            try {
                              const token = sessionStorage.getItem("token");
                              const res = await fetch("/cb/vending/key-change", {
                                method: "POST",
                                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                body: JSON.stringify({ meterId: row.meterPAN, fromSgc: row.fromSgc, fromKrn: parseInt(row.fromKrn), fromTi: parseInt(row.fromTi), toSgc: row.toSgc, toKrn: parseInt(row.toKrn), toTi: parseInt(row.toTi) }),
                              });
                              const data = await res.json();
                              results.push({ drn: row.meterPAN, success: data.success, tokens: data.data?.tokens, description: data.data?.description });
                            } catch (e) { results.push({ drn: row.meterPAN, success: false, error: e.message }); }
                          }
                          setBulkResult({ success: true, apiResult: { data: results }, message: `Key change completed for ${results.filter(r => r.success).length} of ${results.length} meters` });
                          setBulkLoading(false);
                        }}
                          disabled={bulkLoading || bulkRows.filter(r => r.selected && r.meterPAN.trim()).length === 0 || prismStatus?.connected !== true}
                          startIcon={bulkLoading ? <CircularProgress size={16} /> : <VpnKeyIcon />}
                          sx={{ bgcolor: "#9c27b0", "&:hover": { bgcolor: "#7b1fa2" } }}>
                          {bulkLoading ? "Processing..." : `Execute Key Change via API (${bulkRows.filter(r => r.selected && r.meterPAN.trim()).length})`}
                        </Button>
                      </span>
                    </Tooltip>
                  </>)}
                  <Divider orientation="vertical" flexItem sx={{ borderColor: colors.grey[700] }} />
                  <Button variant="outlined" onClick={handleBulkGenerateFromRows}
                    disabled={bulkLoading || bulkRows.filter((r) => r.selected && r.meterPAN.trim()).length === 0}
                    startIcon={<DownloadIcon />}
                    sx={{ borderColor: colors.grey[500], color: colors.grey[300], textTransform: "none" }}>
                    Download CSV (offline use)
                  </Button>
                  {bulkRows.length > 0 && (
                    <Button variant="outlined" onClick={() => { setBulkRows([]); setBulkResult(null); }}
                      startIcon={<DeleteIcon />}
                      sx={{ borderColor: "#f44336", color: "#f44336", textTransform: "none" }}>
                      Clear All
                    </Button>
                  )}
                </Box>
              </Box>

              {/* Result Display */}
              {bulkResult && (
                <Box sx={{ p: 3, borderRadius: "12px", bgcolor: cardBg, border: `1px solid ${cardBorder}` }}>
                  {bulkResult.success ? (
                    <>
                      {/* API Execution Result */}
                      {bulkResult.apiResult ? (
                        <Box>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                            <CheckCircleIcon sx={{ color: "#4caf50", fontSize: 22 }} />
                            <Typography sx={{ fontWeight: 700, fontSize: "15px", color: "#4caf50" }}>{bulkResult.message || "Operation Completed"}</Typography>
                          </Box>
                          {bulkResult.apiResult.summary && (
                            <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
                              <Chip label={`Total: ${bulkResult.apiResult.summary.total}`} size="small" sx={{ bgcolor: "#2196f320", color: "#2196f3", fontWeight: 600 }} />
                              <Chip label={`Success: ${bulkResult.apiResult.summary.success}`} size="small" sx={{ bgcolor: "#4caf5020", color: "#4caf50", fontWeight: 600 }} />
                              {bulkResult.apiResult.summary.failed > 0 && <Chip label={`Failed: ${bulkResult.apiResult.summary.failed}`} size="small" sx={{ bgcolor: "#f4433620", color: "#f44336", fontWeight: 600 }} />}
                            </Box>
                          )}
                          <Box sx={{ maxHeight: 300, overflowY: "auto" }}>
                            {(bulkResult.apiResult.data || []).map((item, i) => (
                              <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.8, px: 1, borderRadius: "6px", bgcolor: i % 2 === 0 ? (isDark ? "#0d1117" : "#fafafa") : "transparent" }}>
                                {item.success ? <CheckCircleIcon sx={{ fontSize: 16, color: "#4caf50" }} /> : <CancelIcon sx={{ fontSize: 16, color: "#f44336" }} />}
                                <Typography sx={{ fontSize: "12px", fontWeight: 600, fontFamily: "monospace", minWidth: 130 }}>{item.drn}</Typography>
                                <Typography sx={{ fontSize: "12px", color: colors.grey[300], flex: 1 }}>{item.customer || item.description || ""}</Typography>
                                {item.token && <Chip label={item.token} size="small" sx={{ fontFamily: "monospace", fontSize: "10px", bgcolor: realAccent + "20", color: realAccent }} />}
                                {item.registeredLocally && <Chip label="Local DB" size="small" sx={{ fontSize: "10px", bgcolor: "#4caf5020", color: "#4caf50", height: 20 }} />}
                                {item.registeredWithPrismVend && <Chip label="PrismVend" size="small" sx={{ fontSize: "10px", bgcolor: "#2196f320", color: "#2196f3", height: 20 }} />}
                                {item.registeredWithPrismVend === false && <Chip label="PrismVend pending" size="small" sx={{ fontSize: "10px", bgcolor: "#ff980020", color: "#ff9800", height: 20 }} />}
                                {item.error && <Typography sx={{ fontSize: "11px", color: "#f44336" }}>{item.error}</Typography>}
                              </Box>
                            ))}
                          </Box>
                        </Box>
                      ) : (
                        /* CSV Result */
                        <Box>
                          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                              <CheckCircleIcon sx={{ color: "#4caf50", fontSize: 22 }} />
                              <Typography sx={{ fontWeight: 700, fontSize: "15px", color: "#4caf50" }}>CSV Generated Successfully</Typography>
                            </Box>
                            <Chip label={`${bulkResult.data?.meterCount || 0} meters`} size="small" sx={{ bgcolor: "#4caf5020", color: "#4caf50", fontWeight: 600 }} />
                          </Box>
                          <Box sx={{ p: 2, borderRadius: "8px", bgcolor: isDark ? "#0d1117" : "#f5f5f5", border: `1px solid ${isDark ? "#30363d" : "#e0e0e0"}`, overflowX: "auto", maxHeight: 250, overflowY: "auto" }}>
                            <pre style={{ fontSize: "11px", fontFamily: "monospace", margin: 0, whiteSpace: "pre-wrap", color: isDark ? "#e6edf3" : "#1f2328" }}>
                              {bulkResult.data?.csv}
                            </pre>
                          </Box>
                          <Box sx={{ mt: 1.5, display: "flex", gap: 2 }}>
                            <Button size="small" variant="contained" startIcon={<DownloadIcon />}
                              sx={{ bgcolor: realAccent, "&:hover": { bgcolor: "#009688" }, textTransform: "none" }}
                              onClick={() => {
                                const blob = new Blob([bulkResult.data?.csv || ""], { type: "text/csv" });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement("a"); a.href = url; a.download = bulkResult.data?.filename || "bulk.csv"; a.click();
                                URL.revokeObjectURL(url);
                              }}>
                              Download CSV
                            </Button>
                          </Box>
                        </Box>
                      )}
                    </>
                  ) : (
                    <Alert severity="error" sx={{ fontSize: "12px" }}>{bulkResult.error || "Failed to generate CSV"}</Alert>
                  )}
                </Box>
              )}
            </Box>
          )}

          {/* ═══ TAB 3: METER REGISTRATION ═══ */}
          {tab === 3 && (
            <Box>
              {/* ── Section A: GRIDx Auto-Registration ── */}
              <Box sx={{ p: 3, borderRadius: "12px", bgcolor: cardBg, border: `1px solid ${cardBorder}`, mb: 3 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                  <Box>
                    <Typography sx={{ fontWeight: 700, fontSize: "16px" }}>GRIDx Auto-Registration</Typography>
                    <Typography sx={{ fontSize: "12px", color: colors.grey[400] }}>
                      Register GRIDx meters from MeterProfileReal with PrismVend using auto-populated STS parameters.
                    </Typography>
                  </Box>
                  <Button variant="contained" onClick={loadGridxMeters} disabled={gridxLoading}
                    startIcon={gridxLoading ? <CircularProgress size={16} /> : <RefreshIcon />}
                    sx={{ bgcolor: realAccent, "&:hover": { bgcolor: "#009688" }, minWidth: 180 }}>
                    {gridxLoading ? "Loading..." : "Load GRIDx Meters"}
                  </Button>
                </Box>

                {/* GRIDx Default Parameters Info Box */}
                <Box sx={{ p: 1.5, borderRadius: "8px", bgcolor: isDark ? "#0d1117" : "#f0faf8", border: `1px solid ${isDark ? "#1a3a35" : "#b2dfdb"}`, mb: 2, mt: 2 }}>
                  <Typography sx={{ fontSize: "11px", color: colors.grey[400], mb: 0.3, fontWeight: 600 }}>GRIDx Default Parameters:</Typography>
                  <Typography sx={{ fontSize: "11px", fontFamily: "monospace", color: realAccent }}>
                    MFR=0260 | SGC=999907 | KRN=2 | TI=1 | EA=7 | TCT=2 | Resource=Electricity | BDT=02 (2014) | KEN=255
                  </Typography>
                </Box>

                {/* Stats Bar */}
                {gridxMeters.length > 0 && (
                  <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap", alignItems: "center" }}>
                    <Chip label={`Total: ${gridxStats.total}`} size="small"
                      sx={{ bgcolor: isDark ? "#1e3a5f" : "#e3f2fd", color: isDark ? "#90caf9" : "#1565c0", fontWeight: 600, fontSize: "12px" }} />
                    <Chip label={`Registered: ${gridxStats.registered}`} size="small"
                      sx={{ bgcolor: "#4caf5020", color: "#4caf50", fontWeight: 600, fontSize: "12px" }} />
                    <Chip label={`Unregistered: ${gridxStats.unregistered}`} size="small"
                      sx={{ bgcolor: "#ff980020", color: "#ff9800", fontWeight: 600, fontSize: "12px" }} />
                    {selectedDrns.size > 0 && (
                      <Chip label={`Selected: ${selectedDrns.size}`} size="small"
                        sx={{ bgcolor: realAccent + "20", color: realAccent, fontWeight: 600, fontSize: "12px" }} />
                    )}
                    <Box sx={{ flex: 1 }} />
                    <Button size="small" variant="outlined" onClick={() => toggleSelectAll(true)}
                      startIcon={<SelectAllIcon />}
                      sx={{ borderColor: "#ff9800", color: "#ff9800", fontSize: "11px", textTransform: "none" }}>
                      Select All Unregistered
                    </Button>
                    <Button size="small" variant="outlined" onClick={() => toggleSelectAll(false)}
                      sx={{ borderColor: colors.grey[500], color: colors.grey[400], fontSize: "11px", textTransform: "none" }}>
                      {selectedDrns.size === gridxMeters.length ? "Deselect All" : "Select All"}
                    </Button>
                  </Box>
                )}

                {/* Meters Table */}
                {gridxLoading && <LinearProgress sx={{ mb: 2, "& .MuiLinearProgress-bar": { bgcolor: realAccent } }} />}
                {gridxMeters.length > 0 && (
                  <TableContainer component={Paper} sx={{ bgcolor: "transparent", boxShadow: "none", maxHeight: 400, mb: 2 }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell padding="checkbox" sx={{ bgcolor: isDark ? "#161b22" : "#fafafa" }}>
                            <Checkbox size="small" checked={selectedDrns.size === gridxMeters.length && gridxMeters.length > 0}
                              indeterminate={selectedDrns.size > 0 && selectedDrns.size < gridxMeters.length}
                              onChange={() => toggleSelectAll(false)}
                              sx={{ color: colors.grey[500], "&.Mui-checked": { color: realAccent }, "&.MuiCheckbox-indeterminate": { color: realAccent } }} />
                          </TableCell>
                          {["DRN", "Customer Name", "Location", "Status", "SGC", "KRN", "TI"].map(h => (
                            <TableCell key={h} sx={{ fontWeight: 700, fontSize: "11px", color: colors.grey[400], bgcolor: isDark ? "#161b22" : "#fafafa" }}>{h}</TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {gridxMeters.map((m, i) => (
                          <TableRow key={m.DRN} hover selected={selectedDrns.has(m.DRN)} onClick={() => toggleMeter(m.DRN)}
                            sx={{ cursor: "pointer", bgcolor: i % 2 === 0 ? "transparent" : (isDark ? "#0d111720" : "#fafafa20") }}>
                            <TableCell padding="checkbox">
                              <Checkbox size="small" checked={selectedDrns.has(m.DRN)}
                                sx={{ color: colors.grey[500], "&.Mui-checked": { color: realAccent } }} />
                            </TableCell>
                            <TableCell sx={{ fontFamily: "monospace", fontSize: "12px", fontWeight: 600 }}>{m.DRN}</TableCell>
                            <TableCell sx={{ fontSize: "12px" }}>{((m.Name || "") + " " + (m.Surname || "")).trim() || "-"}</TableCell>
                            <TableCell sx={{ fontSize: "12px" }}>{[m.City, m.Region].filter(Boolean).join(", ") || "-"}</TableCell>
                            <TableCell>
                              <Chip size="small" label={m.registrationStatus}
                                sx={{
                                  fontSize: "10px", fontWeight: 700, height: 22,
                                  bgcolor: m.registrationStatus === "Registered" ? "#4caf5020" : "#ff980020",
                                  color: m.registrationStatus === "Registered" ? "#4caf50" : "#ff9800",
                                }} />
                            </TableCell>
                            <TableCell sx={{ fontFamily: "monospace", fontSize: "11px" }}>{m.sgc || "999907"}</TableCell>
                            <TableCell sx={{ fontFamily: "monospace", fontSize: "11px" }}>{m.krn ?? "2"}</TableCell>
                            <TableCell sx={{ fontFamily: "monospace", fontSize: "11px" }}>{m.ti ?? "1"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}

                {gridxMeters.length === 0 && !gridxLoading && (
                  <Box sx={{ p: 4, textAlign: "center", color: colors.grey[500] }}>
                    <MemoryIcon sx={{ fontSize: 48, mb: 1, opacity: 0.3 }} />
                    <Typography sx={{ fontSize: "13px" }}>Click "Load GRIDx Meters" to fetch meters from the database.</Typography>
                  </Box>
                )}

                {/* Action Buttons */}
                {gridxMeters.length > 0 && (
                  <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                    <Button variant="contained" onClick={previewRegistration}
                      disabled={gridxPreviewLoading || selectedDrns.size === 0}
                      startIcon={gridxPreviewLoading ? <CircularProgress size={16} /> : <PreviewIcon />}
                      sx={{ bgcolor: "#2196f3", "&:hover": { bgcolor: "#1976d2" } }}>
                      Preview Registration ({selectedDrns.size})
                    </Button>
                    <Tooltip title={prismStatus?.connected !== true ? "PrismVend is not connected. Configure the connection on the PrismVend Config tab." : ""}>
                      <span>
                        <Button variant="contained" onClick={registerSelectedMeters}
                          disabled={gridxRegLoading || selectedDrns.size === 0 || prismStatus?.connected !== true}
                          startIcon={gridxRegLoading ? <CircularProgress size={16} /> : <SendIcon />}
                          sx={{ bgcolor: realAccent, "&:hover": { bgcolor: "#009688" } }}>
                          {gridxRegLoading ? "Registering..." : `Register Selected (${selectedDrns.size})`}
                        </Button>
                      </span>
                    </Tooltip>
                    <Button variant="outlined" onClick={generateGridxCSV}
                      disabled={gridxCsvLoading}
                      startIcon={gridxCsvLoading ? <CircularProgress size={16} /> : <DownloadIcon />}
                      sx={{ borderColor: colors.grey[500], color: colors.grey[400] }}>
                      {gridxCsvLoading ? "Generating..." : "Generate CSV"}
                    </Button>
                  </Box>
                )}

                {/* Registration progress bar */}
                {gridxRegLoading && (
                  <Box sx={{ mt: 2 }}>
                    <LinearProgress sx={{ "& .MuiLinearProgress-bar": { bgcolor: realAccent } }} />
                    <Typography sx={{ fontSize: "11px", color: colors.grey[400], mt: 0.5 }}>
                      Registering {selectedDrns.size} meter(s) with PrismVend sequentially...
                    </Typography>
                  </Box>
                )}
              </Box>

              {/* Preview Dialog */}
              {showPreview && gridxPreview && (
                <Box sx={{ p: 3, borderRadius: "12px", bgcolor: cardBg, border: `1px solid ${isDark ? "#1e3a5f" : "#bbdefb"}`, mb: 3 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: "14px", color: "#2196f3" }}>
                      Registration Preview ({gridxPreview.count || 0} meters)
                    </Typography>
                    <Button size="small" onClick={() => setShowPreview(false)} sx={{ color: colors.grey[400] }}>Close</Button>
                  </Box>
                  {gridxPreview.success && gridxPreview.data ? (
                    <TableContainer component={Paper} sx={{ bgcolor: "transparent", boxShadow: "none", maxHeight: 300 }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            {["DRN", "Customer", "City", "Current Status", "SGC", "KRN", "TI", "EA", "TCT", "Organisation"].map(h => (
                              <TableCell key={h} sx={{ fontWeight: 700, fontSize: "10px", color: colors.grey[400], bgcolor: isDark ? "#161b22" : "#fafafa" }}>{h}</TableCell>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {gridxPreview.data.map((p) => (
                            <TableRow key={p.drn}>
                              <TableCell sx={{ fontFamily: "monospace", fontSize: "11px" }}>{p.drn}</TableCell>
                              <TableCell sx={{ fontSize: "11px" }}>{p.customer || "-"}</TableCell>
                              <TableCell sx={{ fontSize: "11px" }}>{p.city || "-"}</TableCell>
                              <TableCell>
                                <Chip size="small" label={p.currentStatus}
                                  sx={{ fontSize: "9px", fontWeight: 700, height: 20,
                                    bgcolor: p.currentStatus === "Registered" ? "#4caf5020" : "#ff980020",
                                    color: p.currentStatus === "Registered" ? "#4caf50" : "#ff9800" }} />
                              </TableCell>
                              <TableCell sx={{ fontFamily: "monospace", fontSize: "10px" }}>{p.registrationParams.sgc}</TableCell>
                              <TableCell sx={{ fontFamily: "monospace", fontSize: "10px" }}>{p.registrationParams.krn}</TableCell>
                              <TableCell sx={{ fontFamily: "monospace", fontSize: "10px" }}>{p.registrationParams.ti}</TableCell>
                              <TableCell sx={{ fontFamily: "monospace", fontSize: "10px" }}>{p.registrationParams.ea}</TableCell>
                              <TableCell sx={{ fontFamily: "monospace", fontSize: "10px" }}>{p.registrationParams.tct}</TableCell>
                              <TableCell sx={{ fontSize: "10px" }}>{p.registrationParams.organisation}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  ) : (
                    <Alert severity="error" sx={{ fontSize: "12px" }}>{gridxPreview.error || "Failed to generate preview"}</Alert>
                  )}
                </Box>
              )}

              {/* Registration Results */}
              {gridxRegResult && (
                <Box sx={{ p: 3, borderRadius: "12px", bgcolor: cardBg, border: `1px solid ${cardBorder}`, mb: 3 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: "14px" }}>Registration Results</Typography>
                    {gridxRegResult.summary && (
                      <Box sx={{ display: "flex", gap: 1 }}>
                        <Chip size="small" label={`Success: ${gridxRegResult.summary.success}`}
                          sx={{ bgcolor: "#4caf5020", color: "#4caf50", fontWeight: 600, fontSize: "11px" }} />
                        <Chip size="small" label={`Failed: ${gridxRegResult.summary.failed}`}
                          sx={{ bgcolor: gridxRegResult.summary.failed > 0 ? "#f4433620" : "#4caf5020",
                            color: gridxRegResult.summary.failed > 0 ? "#f44336" : "#4caf50", fontWeight: 600, fontSize: "11px" }} />
                      </Box>
                    )}
                  </Box>
                  {gridxRegResult.success && gridxRegResult.data ? (
                    <Box sx={{ maxHeight: 250, overflowY: "auto" }}>
                      {gridxRegResult.data.map((r, i) => (
                        <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 2, py: 0.8, px: 1, borderRadius: "6px",
                          bgcolor: i % 2 === 0 ? (isDark ? "#0d1117" : "#fafafa") : "transparent" }}>
                          {r.success ? (
                            <CheckCircleIcon sx={{ fontSize: 16, color: "#4caf50" }} />
                          ) : (
                            <CancelIcon sx={{ fontSize: 16, color: "#f44336" }} />
                          )}
                          <Typography sx={{ fontFamily: "monospace", fontSize: "12px", fontWeight: 600, minWidth: 130 }}>{r.drn}</Typography>
                          <Typography sx={{ fontSize: "12px", flex: 1 }}>{r.customer || ""}</Typography>
                          <Typography sx={{ fontSize: "11px", color: r.success ? "#4caf50" : "#f44336" }}>
                            {r.success ? (r.warning || "Registered") : (r.error || "Failed")}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  ) : (
                    <Alert severity="error" sx={{ fontSize: "12px" }}>{gridxRegResult.error || "Registration failed"}</Alert>
                  )}
                </Box>
              )}

              {/* ── Section B: Manual Registration (Non-GRIDx) ── */}
              <Box sx={{ p: 3, borderRadius: "12px", bgcolor: cardBg, border: `1px solid ${cardBorder}` }}>
                <Typography sx={{ fontWeight: 700, fontSize: "16px", mb: 0.5 }}>Manual Registration (Non-GRIDx)</Typography>
                <Typography sx={{ fontSize: "12px", color: colors.grey[400], mb: 3 }}>
                  Register non-GRIDx meters with PrismVend by entering the STS parameters below. All fields are configurable.
                </Typography>

                {/* Form fields in card layout */}
                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 2, mb: 2.5 }}>
                  <TextField size="small" label="Meter PAN (11 or 13 digits)" value={regPan}
                    onChange={(e) => setRegPan(e.target.value)} placeholder="e.g. 0260060135803"
                    inputProps={{ style: { fontFamily: "monospace" } }}
                    sx={{ gridColumn: "1 / 2" }} />
                  <TextField size="small" label="Organisation" value={regOrg}
                    onChange={(e) => setRegOrg(e.target.value)} />
                  <TextField size="small" label="Customer Name" value={regName}
                    onChange={(e) => setRegName(e.target.value)} />
                </Box>

                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr", gap: 2, mb: 2.5 }}>
                  <TextField size="small" label="Supply Group Code (SGC)" value={regSgc}
                    onChange={(e) => setRegSgc(e.target.value)} placeholder="999907"
                    inputProps={{ style: { fontFamily: "monospace" } }} />
                  <TextField size="small" label="Key Revision (KRN)" value={regKrn}
                    onChange={(e) => setRegKrn(e.target.value)} type="number" />
                  <TextField size="small" label="Tariff Index (TI)" value={regTi}
                    onChange={(e) => setRegTi(e.target.value)} type="number" />
                  <FormControl size="small">
                    <InputLabel>Encryption (EA)</InputLabel>
                    <Select value={regEa} onChange={(e) => setRegEa(e.target.value)} label="Encryption (EA)">
                      <MenuItem value="7">EA 7 (Standard DES)</MenuItem>
                      <MenuItem value="11">EA 11 (AES-128)</MenuItem>
                    </Select>
                  </FormControl>
                  <FormControl size="small">
                    <InputLabel>Token Carrier (TCT)</InputLabel>
                    <Select value={regTct} onChange={(e) => setRegTct(e.target.value)} label="Token Carrier (TCT)">
                      <MenuItem value="2">TCT 2 (Numeric)</MenuItem>
                    </Select>
                  </FormControl>
                  <FormControl size="small">
                    <InputLabel>Resource Type</InputLabel>
                    <Select value={regResource} onChange={(e) => setRegResource(e.target.value)} label="Resource Type">
                      <MenuItem value="0">Electricity (0)</MenuItem>
                      <MenuItem value="1">Water (1)</MenuItem>
                    </Select>
                  </FormControl>
                </Box>

                {/* Action Buttons */}
                <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 2, alignItems: "center" }}>
                  <Tooltip title={prismStatus?.connected !== true ? "PrismVend is not connected. Configure the connection on the PrismVend Config tab." : ""}>
                    <span>
                      <Button variant="contained" onClick={handleMeterRegister} disabled={regLoading || !regPan || prismStatus?.connected !== true}
                        startIcon={regLoading ? <CircularProgress size={16} /> : <AddIcon />}
                        sx={{ bgcolor: realAccent, "&:hover": { bgcolor: "#009688" } }}>
                        Register Meter
                      </Button>
                    </span>
                  </Tooltip>
                  <Button variant="outlined" onClick={buildRegPreview} disabled={!regPan}
                    startIcon={<PreviewIcon />}
                    sx={{ borderColor: "#2196f3", color: "#2196f3", textTransform: "none" }}>
                    Preview Registration Record
                  </Button>
                  <Button variant="outlined" onClick={generateSingleMeterCsv} disabled={!regPan}
                    startIcon={<DownloadIcon />}
                    sx={{ borderColor: colors.grey[500], color: colors.grey[400], textTransform: "none" }}>
                    Generate Registration CSV
                  </Button>
                </Box>

                {/* Preview panel */}
                {regPreviewData && (
                  <Box sx={{ p: 2, borderRadius: "8px", bgcolor: isDark ? "#0d1117" : "#f0f7ff", border: `1px solid ${isDark ? "#1e3a5f" : "#bbdefb"}`, mb: 2 }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                      <Typography sx={{ fontSize: "12px", fontWeight: 700, color: "#2196f3" }}>Registration Record Preview</Typography>
                      <Button size="small" onClick={() => setRegPreviewData(null)} sx={{ color: colors.grey[400], fontSize: "11px", minWidth: 0 }}>Close</Button>
                    </Box>
                    <Box sx={{ fontFamily: "monospace", fontSize: "12px", lineHeight: 1.8 }}>
                      {Object.entries(regPreviewData).map(([k, v]) => (
                        <Box key={k} sx={{ display: "flex", gap: 1 }}>
                          <Typography sx={{ color: realAccent, fontSize: "12px", fontFamily: "monospace", minWidth: 140, fontWeight: 600 }}>{k}:</Typography>
                          <Typography sx={{ fontSize: "12px", fontFamily: "monospace" }}>{String(v)}</Typography>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                )}

                {/* Registration result */}
                {regResult && (
                  <Alert severity={regResult.success ? "success" : "error"} sx={{ fontSize: "12px" }}>
                    {regResult.success ? `Meter ${regPan} registered successfully with PrismVend` : (regResult.error || "Registration failed")}
                    {regResult.data && <pre style={{ fontSize: "11px", marginTop: 4 }}>{JSON.stringify(regResult.data, null, 2)}</pre>}
                  </Alert>
                )}
              </Box>
            </Box>
          )}

          {/* ═══ TAB 4: DIRECT HSM ═══ */}
          {tab === 4 && (
            <Box>
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, mb: 3 }}>
                {/* Thrift Connection Config */}
                <Box sx={{ p: 3, borderRadius: "12px", bgcolor: cardBg, border: `1px solid ${cardBorder}` }}>
                  <Typography sx={{ fontWeight: 700, fontSize: "15px", mb: 1 }}>PrismToken Thrift Connection</Typography>
                  <Typography sx={{ fontSize: "12px", color: colors.grey[400], mb: 2 }}>
                    Direct TLS connection to PrismToken Thrift API (port 9443). Bypasses PrismVend Web API.
                  </Typography>
                  <Box sx={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 2, mb: 2 }}>
                    <TextField size="small" label="Host IP" value={thriftConfig.host}
                      onChange={(e) => setThriftConfig({ ...thriftConfig, host: e.target.value })}
                      placeholder="e.g. 192.168.1.100" fullWidth />
                    <TextField size="small" label="Port" value={thriftConfig.port}
                      onChange={(e) => setThriftConfig({ ...thriftConfig, port: e.target.value })}
                      placeholder="9443" fullWidth />
                  </Box>
                  <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 2, mb: 2 }}>
                    <TextField size="small" label="Username" value={thriftConfig.username}
                      onChange={(e) => setThriftConfig({ ...thriftConfig, username: e.target.value })} fullWidth />
                    <TextField size="small" label="Password" type="password" value={thriftConfig.password}
                      onChange={(e) => setThriftConfig({ ...thriftConfig, password: e.target.value })} fullWidth />
                    <TextField size="small" label="Realm" value={thriftConfig.realm}
                      onChange={(e) => setThriftConfig({ ...thriftConfig, realm: e.target.value })} fullWidth />
                  </Box>
                  <Box sx={{ display: "flex", gap: 1 }}>
                    <Button variant="contained" onClick={connectThrift} disabled={thriftConnecting || !thriftConfig.host}
                      startIcon={thriftConnecting ? <CircularProgress size={16} color="inherit" /> : <WifiIcon />}
                      sx={{ bgcolor: realAccent, "&:hover": { bgcolor: "#009688" } }}>
                      {thriftConnecting ? "Connecting..." : "Connect"}
                    </Button>
                    <Button variant="outlined" onClick={disconnectThrift}
                      disabled={!thriftStatus?.connected}
                      startIcon={<WifiOffIcon />}
                      sx={{ borderColor: "#f44336", color: "#f44336" }}>
                      Disconnect
                    </Button>
                    <Button variant="outlined" onClick={signInThrift}
                      disabled={!thriftStatus?.connected || thriftOpLoading}
                      startIcon={<VpnKeyIcon />}
                      sx={{ borderColor: "#ff9800", color: "#ff9800" }}>
                      Sign In
                    </Button>
                  </Box>
                </Box>

                {/* Connection Status + Ping */}
                <Box sx={{ p: 3, borderRadius: "12px", bgcolor: cardBg, border: `1px solid ${cardBorder}` }}>
                  <Typography sx={{ fontWeight: 700, fontSize: "15px", mb: 2 }}>Connection Status</Typography>
                  {thriftStatus ? (
                    <Box>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
                        {thriftStatus.connected ? (
                          <CheckCircleIcon sx={{ color: "#4caf50", fontSize: 20 }} />
                        ) : (
                          <CancelIcon sx={{ color: "#f44336", fontSize: 20 }} />
                        )}
                        <Chip label={thriftStatus.connected ? "Connected" : "Disconnected"} size="small" sx={{
                          bgcolor: thriftStatus.connected ? "#4caf5020" : "#f4433620",
                          color: thriftStatus.connected ? "#4caf50" : "#f44336",
                          fontWeight: 600, fontSize: "11px", height: 22,
                        }} />
                        {thriftStatus.authenticated && (
                          <Chip label="Authenticated" size="small" sx={{ bgcolor: "#2196f320", color: "#2196f3", fontWeight: 600, fontSize: "11px", height: 22 }} />
                        )}
                        <Chip label="via Direct Thrift" size="small" sx={{ bgcolor: "#9c27b020", color: "#9c27b0", fontWeight: 600, fontSize: "10px", height: 20 }} />
                      </Box>
                      <Typography sx={{ fontSize: "12px", color: colors.grey[400], mb: 2, lineHeight: 1.6 }}>
                        {thriftStatus.message || "No status message"}
                      </Typography>
                      {thriftStatus.authError && (
                        <Alert severity="error" sx={{ mb: 1, fontSize: "12px", py: 0 }}>{thriftStatus.authError}</Alert>
                      )}
                    </Box>
                  ) : (
                    <Typography sx={{ fontSize: "13px", color: colors.grey[500], fontStyle: "italic" }}>
                      Not connected. Configure host and credentials, then click Connect.
                    </Typography>
                  )}
                  <Divider sx={{ my: 2, borderColor: cardBorder }} />
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                    <Button size="small" variant="outlined" onClick={pingThrift}
                      disabled={!thriftStatus?.connected || thriftOpLoading}
                      sx={{ borderColor: realAccent, color: realAccent, fontSize: "12px" }}>
                      Ping Test
                    </Button>
                    <Button size="small" variant="outlined" onClick={getThriftHsmInfo}
                      disabled={!thriftStatus?.connected || thriftOpLoading}
                      sx={{ borderColor: "#ff9800", color: "#ff9800", fontSize: "12px" }}>
                      Get HSM Info
                    </Button>
                    {thriftOpLoading && <CircularProgress size={16} />}
                  </Box>
                  {thriftPingResult && (
                    <Box sx={{ mt: 1.5, p: 1.5, borderRadius: "8px", bgcolor: isDark ? "#0d1117" : "#f5f5f5", border: `1px solid ${isDark ? "#30363d" : "#e0e0e0"}` }}>
                      <Typography sx={{ fontSize: "12px", fontFamily: "monospace", color: thriftPingResult.error ? "#f44336" : "#4caf50" }}>
                        {thriftPingResult.error ? `PING FAILED: ${thriftPingResult.error}` : `PONG: "${thriftPingResult.echo}" in ${thriftPingResult.responseTimeMs}ms`}
                      </Typography>
                    </Box>
                  )}
                </Box>
              </Box>

              {/* HSM Info Display */}
              {thriftHsmInfo && (
                <Box sx={{ p: 3, borderRadius: "12px", bgcolor: cardBg, border: `1px solid ${cardBorder}` }}>
                  <Typography sx={{ fontWeight: 700, fontSize: "15px", mb: 2 }}>HSM Status Information</Typography>
                  {thriftHsmInfo.error ? (
                    <Alert severity="error" sx={{ fontSize: "12px" }}>{thriftHsmInfo.error}</Alert>
                  ) : (
                    <Box>
                      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 2, mb: 2 }}>
                        {[
                          { label: "Module ID", value: thriftHsmInfo.moduleId || "N/A" },
                          { label: "Firmware", value: thriftHsmInfo.firmwareId || "N/A" },
                          { label: "TX Counter", value: thriftHsmInfo.txCounter || "N/A" },
                          { label: "API Type", value: thriftHsmInfo.apiType || "N/A" },
                        ].map((item) => (
                          <Box key={item.label} sx={{ p: 1.5, borderRadius: "8px", bgcolor: isDark ? "#0d1117" : "#f5f5f5", border: `1px solid ${isDark ? "#30363d" : "#e0e0e0"}`, textAlign: "center" }}>
                            <Typography sx={{ fontSize: "10px", color: colors.grey[500], textTransform: "uppercase", letterSpacing: "0.5px" }}>{item.label}</Typography>
                            <Typography sx={{ fontSize: "14px", fontWeight: 700, fontFamily: "monospace", mt: 0.5 }}>{item.value}</Typography>
                          </Box>
                        ))}
                      </Box>
                      {thriftHsmInfo.info && Object.keys(thriftHsmInfo.info).length > 0 && (
                        <Box sx={{ mb: 2 }}>
                          <Typography sx={{ fontSize: "12px", fontWeight: 600, color: colors.grey[400], mb: 1 }}>All Info Fields:</Typography>
                          <Box sx={{ p: 1.5, borderRadius: "8px", bgcolor: isDark ? "#0d1117" : "#f5f5f5", border: `1px solid ${isDark ? "#30363d" : "#e0e0e0"}`, fontFamily: "monospace", fontSize: "11px", maxHeight: 200, overflow: "auto" }}>
                            {Object.entries(thriftHsmInfo.info).map(([k, v]) => (
                              <Typography key={k} sx={{ fontSize: "11px", fontFamily: "monospace" }}><strong>{k}:</strong> {v}</Typography>
                            ))}
                          </Box>
                        </Box>
                      )}
                      {thriftHsmInfo.alerts && thriftHsmInfo.alerts.length > 0 && (
                        <Box>
                          <Typography sx={{ fontSize: "12px", fontWeight: 600, color: "#ff9800", mb: 1 }}>Alerts ({thriftHsmInfo.alerts.length}):</Typography>
                          {thriftHsmInfo.alerts.map((alert, i) => (
                            <Alert key={i} severity="warning" sx={{ mb: 0.5, fontSize: "12px", py: 0 }}>
                              [{alert.eCode}] {alert.eMsgEn}
                            </Alert>
                          ))}
                        </Box>
                      )}
                    </Box>
                  )}
                </Box>
              )}
            </Box>
          )}

          {/* ═══ TAB 5: HSM OPERATIONS ═══ */}
          {tab === 5 && (
            <Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3 }}>
                <MemoryIcon sx={{ color: "#9c27b0", fontSize: 22 }} />
                <Typography sx={{ fontWeight: 700, fontSize: "15px" }}>Direct HSM Token Operations</Typography>
                <Chip label="via Direct Thrift" size="small" sx={{ bgcolor: "#9c27b020", color: "#9c27b0", fontWeight: 600, fontSize: "10px", height: 20 }} />
                {!thriftStatus?.connected && (
                  <Alert severity="warning" sx={{ fontSize: "11px", py: 0, ml: 2, flex: 1 }}>
                    Not connected to PrismToken. Go to the "Direct HSM" tab to connect first.
                  </Alert>
                )}
              </Box>

              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, mb: 3 }}>
                {/* Issue Credit Token */}
                <Box sx={{ p: 3, borderRadius: "12px", bgcolor: cardBg, border: `1px solid ${cardBorder}` }}>
                  <Typography sx={{ fontWeight: 700, fontSize: "14px", mb: 2 }}>Issue Credit Token</Typography>
                  <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, mb: 2 }}>
                    <TextField size="small" label="DRN (Meter)" value={thriftCreditForm.drn}
                      onChange={(e) => setThriftCreditForm({ ...thriftCreditForm, drn: e.target.value })}
                      placeholder="11-digit DRN" fullWidth sx={{ gridColumn: "1 / -1" }} />
                    <TextField size="small" label="Transfer Amount (STS units)" value={thriftCreditForm.transferAmount}
                      onChange={(e) => setThriftCreditForm({ ...thriftCreditForm, transferAmount: e.target.value })}
                      placeholder="e.g. 100.0" type="number" fullWidth sx={{ gridColumn: "1 / -1" }} />
                    <TextField size="small" label="SGC" value={thriftCreditForm.sgc}
                      onChange={(e) => setThriftCreditForm({ ...thriftCreditForm, sgc: e.target.value })} />
                    <TextField size="small" label="KRN" value={thriftCreditForm.krn}
                      onChange={(e) => setThriftCreditForm({ ...thriftCreditForm, krn: e.target.value })} />
                    <TextField size="small" label="TI" value={thriftCreditForm.ti}
                      onChange={(e) => setThriftCreditForm({ ...thriftCreditForm, ti: e.target.value })} />
                    <FormControl size="small">
                      <InputLabel>Subclass</InputLabel>
                      <Select value={thriftCreditForm.subclass} onChange={(e) => setThriftCreditForm({ ...thriftCreditForm, subclass: e.target.value })} label="Subclass">
                        <MenuItem value="0">0 - Electricity</MenuItem>
                        <MenuItem value="1">1 - Water</MenuItem>
                        <MenuItem value="2">2 - Gas</MenuItem>
                      </Select>
                    </FormControl>
                  </Box>
                  <Button variant="contained" fullWidth onClick={thriftIssueCreditToken}
                    disabled={!thriftStatus?.connected || thriftOpLoading || !thriftCreditForm.drn || !thriftCreditForm.transferAmount}
                    startIcon={thriftOpLoading ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
                    sx={{ bgcolor: realAccent, "&:hover": { bgcolor: "#009688" } }}>
                    Issue Credit Token
                  </Button>
                </Box>

                {/* Issue Engineering Token */}
                <Box sx={{ p: 3, borderRadius: "12px", bgcolor: cardBg, border: `1px solid ${cardBorder}` }}>
                  <Typography sx={{ fontWeight: 700, fontSize: "14px", mb: 2 }}>Issue Engineering Token</Typography>
                  <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, mb: 2 }}>
                    <TextField size="small" label="DRN (Meter)" value={thriftEngForm.drn}
                      onChange={(e) => setThriftEngForm({ ...thriftEngForm, drn: e.target.value })}
                      placeholder="11-digit DRN" fullWidth sx={{ gridColumn: "1 / -1" }} />
                    <FormControl size="small" fullWidth sx={{ gridColumn: "1 / -1" }}>
                      <InputLabel>Engineering Subclass</InputLabel>
                      <Select value={thriftEngForm.subclass} onChange={(e) => setThriftEngForm({ ...thriftEngForm, subclass: e.target.value })} label="Engineering Subclass">
                        <MenuItem value="0">0 - Set Max Power Limit</MenuItem>
                        <MenuItem value="1">1 - Clear Credit</MenuItem>
                        <MenuItem value="5">5 - Clear Tamper</MenuItem>
                        <MenuItem value="6">6 - Set Max Phase Power Unbalance</MenuItem>
                        <MenuItem value="7">7 - Set Water Meter Factor</MenuItem>
                      </Select>
                    </FormControl>
                    <TextField size="small" label="Transfer Amount" value={thriftEngForm.transferAmount}
                      onChange={(e) => setThriftEngForm({ ...thriftEngForm, transferAmount: e.target.value })}
                      placeholder="Supplementary value" type="number" fullWidth sx={{ gridColumn: "1 / -1" }} />
                    <TextField size="small" label="SGC" value={thriftEngForm.sgc}
                      onChange={(e) => setThriftEngForm({ ...thriftEngForm, sgc: e.target.value })} />
                    <TextField size="small" label="KRN" value={thriftEngForm.krn}
                      onChange={(e) => setThriftEngForm({ ...thriftEngForm, krn: e.target.value })} />
                    <TextField size="small" label="TI" value={thriftEngForm.ti}
                      onChange={(e) => setThriftEngForm({ ...thriftEngForm, ti: e.target.value })} />
                  </Box>
                  <Button variant="contained" fullWidth onClick={thriftIssueEngineering}
                    disabled={!thriftStatus?.connected || thriftOpLoading || !thriftEngForm.drn}
                    startIcon={thriftOpLoading ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
                    sx={{ bgcolor: "#ff9800", "&:hover": { bgcolor: "#f57c00" } }}>
                    Issue Engineering Token
                  </Button>
                </Box>

                {/* Issue Key Change Tokens */}
                <Box sx={{ p: 3, borderRadius: "12px", bgcolor: cardBg, border: `1px solid ${cardBorder}` }}>
                  <Typography sx={{ fontWeight: 700, fontSize: "14px", mb: 2 }}>Issue Key Change Tokens</Typography>
                  <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, mb: 2 }}>
                    <TextField size="small" label="DRN (Meter)" value={thriftKcForm.drn}
                      onChange={(e) => setThriftKcForm({ ...thriftKcForm, drn: e.target.value })}
                      placeholder="11-digit DRN" fullWidth sx={{ gridColumn: "1 / -1" }} />
                    <Typography sx={{ fontSize: "11px", color: colors.grey[400], gridColumn: "1 / -1", fontWeight: 600 }}>Current Config:</Typography>
                    <TextField size="small" label="Current SGC" value={thriftKcForm.sgc}
                      onChange={(e) => setThriftKcForm({ ...thriftKcForm, sgc: e.target.value })} />
                    <TextField size="small" label="Current KRN" value={thriftKcForm.krn}
                      onChange={(e) => setThriftKcForm({ ...thriftKcForm, krn: e.target.value })} />
                    <TextField size="small" label="Current TI" value={thriftKcForm.ti}
                      onChange={(e) => setThriftKcForm({ ...thriftKcForm, ti: e.target.value })} />
                    <Box />
                    <Typography sx={{ fontSize: "11px", color: "#ff9800", gridColumn: "1 / -1", fontWeight: 600 }}>New Config:</Typography>
                    <TextField size="small" label="New SGC" value={thriftKcForm.toSgc}
                      onChange={(e) => setThriftKcForm({ ...thriftKcForm, toSgc: e.target.value })}
                      placeholder="6-digit SGC" />
                    <TextField size="small" label="New KRN" value={thriftKcForm.toKrn}
                      onChange={(e) => setThriftKcForm({ ...thriftKcForm, toKrn: e.target.value })} />
                    <TextField size="small" label="New TI" value={thriftKcForm.toTi}
                      onChange={(e) => setThriftKcForm({ ...thriftKcForm, toTi: e.target.value })} />
                  </Box>
                  <Button variant="contained" fullWidth onClick={thriftIssueKeyChange}
                    disabled={!thriftStatus?.connected || thriftOpLoading || !thriftKcForm.drn || !thriftKcForm.toSgc}
                    startIcon={thriftOpLoading ? <CircularProgress size={16} color="inherit" /> : <VpnKeyIcon />}
                    sx={{ bgcolor: "#2196f3", "&:hover": { bgcolor: "#1976d2" } }}>
                    Issue Key Change Tokens
                  </Button>
                </Box>

                {/* Verify Token */}
                <Box sx={{ p: 3, borderRadius: "12px", bgcolor: cardBg, border: `1px solid ${cardBorder}` }}>
                  <Typography sx={{ fontWeight: 700, fontSize: "14px", mb: 2 }}>Verify Token</Typography>
                  <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, mb: 2 }}>
                    <TextField size="small" label="DRN (Meter)" value={thriftVerifyForm.drn}
                      onChange={(e) => setThriftVerifyForm({ ...thriftVerifyForm, drn: e.target.value })}
                      placeholder="11-digit DRN" fullWidth sx={{ gridColumn: "1 / -1" }} />
                    <TextField size="small" label="20-Digit Token" value={thriftVerifyForm.tokenDec}
                      onChange={(e) => setThriftVerifyForm({ ...thriftVerifyForm, tokenDec: e.target.value })}
                      placeholder="Enter 20-digit STS token" fullWidth sx={{ gridColumn: "1 / -1", "& .MuiInputBase-input": { fontFamily: "monospace", letterSpacing: "1px" } }} />
                    <TextField size="small" label="SGC" value={thriftVerifyForm.sgc}
                      onChange={(e) => setThriftVerifyForm({ ...thriftVerifyForm, sgc: e.target.value })} />
                    <TextField size="small" label="KRN" value={thriftVerifyForm.krn}
                      onChange={(e) => setThriftVerifyForm({ ...thriftVerifyForm, krn: e.target.value })} />
                    <TextField size="small" label="TI" value={thriftVerifyForm.ti}
                      onChange={(e) => setThriftVerifyForm({ ...thriftVerifyForm, ti: e.target.value })} />
                  </Box>
                  <Button variant="contained" fullWidth onClick={thriftVerifyToken}
                    disabled={!thriftStatus?.connected || thriftOpLoading || !thriftVerifyForm.drn || !thriftVerifyForm.tokenDec}
                    startIcon={thriftOpLoading ? <CircularProgress size={16} color="inherit" /> : <SecurityIcon />}
                    sx={{ bgcolor: "#4caf50", "&:hover": { bgcolor: "#388e3c" } }}>
                    Verify Token
                  </Button>
                </Box>
              </Box>

              {/* Token Result Display */}
              {thriftTokenResult && (
                <Box sx={{ p: 3, borderRadius: "12px", bgcolor: cardBg, border: `1px solid ${cardBorder}` }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: "15px" }}>
                      {thriftTokenResult.type === "credit" ? "Credit Token Result" :
                       thriftTokenResult.type === "engineering" ? "Engineering Token Result" :
                       thriftTokenResult.type === "keychange" ? "Key Change Result" :
                       thriftTokenResult.type === "verify" ? "Verification Result" : "Result"}
                    </Typography>
                    {thriftTokenResult.success ? (
                      <Chip label="Success" size="small" sx={{ bgcolor: "#4caf5020", color: "#4caf50", fontWeight: 600, fontSize: "11px", height: 22 }} />
                    ) : (
                      <Chip label="Failed" size="small" sx={{ bgcolor: "#f4433620", color: "#f44336", fontWeight: 600, fontSize: "11px", height: 22 }} />
                    )}
                    <Chip label="via Direct Thrift" size="small" sx={{ bgcolor: "#9c27b020", color: "#9c27b0", fontWeight: 600, fontSize: "10px", height: 20 }} />
                  </Box>
                  {thriftTokenResult.error && (
                    <Alert severity="error" sx={{ mb: 2, fontSize: "12px" }}>{thriftTokenResult.error}</Alert>
                  )}
                  {thriftTokenResult.data && (
                    <Box>
                      {/* Show tokens if present */}
                      {thriftTokenResult.data.tokens && thriftTokenResult.data.tokens.length > 0 && (
                        <Box sx={{ mb: 2 }}>
                          {thriftTokenResult.data.tokens.map((tk, i) => (
                            <Box key={i} sx={{ p: 2, mb: 1, borderRadius: "8px", bgcolor: isDark ? "#0d1117" : "#f5f5f5", border: `1px solid ${isDark ? "#30363d" : "#e0e0e0"}` }}>
                              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                                <Typography sx={{ fontSize: "11px", color: colors.grey[500] }}>Token {i + 1}:</Typography>
                                <Typography sx={{ fontSize: "16px", fontWeight: 700, fontFamily: "monospace", letterSpacing: "2px", color: realAccent }}>
                                  {tk.tokenDec ? tk.tokenDec.replace(/(.{4})/g, "$1 ").trim() : "N/A"}
                                </Typography>
                                {tk.tokenDec && (
                                  <Tooltip title="Copy token">
                                    <IconButton size="small" onClick={() => navigator.clipboard.writeText(tk.tokenDec)}>
                                      <ContentCopyIcon sx={{ fontSize: 14 }} />
                                    </IconButton>
                                  </Tooltip>
                                )}
                              </Box>
                              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1 }}>
                                {[
                                  { k: "DRN", v: tk.drn },
                                  { k: "SGC", v: tk.sgc },
                                  { k: "KRN", v: tk.krn },
                                  { k: "TI", v: tk.ti },
                                  { k: "Class", v: tk.tokenClass },
                                  { k: "Subclass", v: tk.subclass },
                                  { k: "Amount", v: tk.transferAmount },
                                  { k: "Unit", v: tk.stsUnitName || tk.scaledUnitName },
                                  { k: "Description", v: tk.description },
                                  { k: "Hex", v: tk.tokenHex },
                                  { k: "TID", v: tk.tid },
                                  { k: "VK KCV", v: tk.vkKcv },
                                ].filter((x) => x.v !== undefined && x.v !== null && x.v !== "").map((item) => (
                                  <Typography key={item.k} sx={{ fontSize: "11px", fontFamily: "monospace" }}>
                                    <span style={{ color: colors.grey[500] }}>{item.k}:</span> {String(item.v)}
                                  </Typography>
                                ))}
                              </Box>
                            </Box>
                          ))}
                        </Box>
                      )}
                      {/* Verify result */}
                      {thriftTokenResult.type === "verify" && thriftTokenResult.data.token && (
                        <Box sx={{ p: 2, borderRadius: "8px", bgcolor: isDark ? "#0d1117" : "#f5f5f5", border: `1px solid ${isDark ? "#30363d" : "#e0e0e0"}`, mb: 2 }}>
                          <Typography sx={{ fontSize: "13px", fontWeight: 600, color: thriftTokenResult.data.verified ? "#4caf50" : "#f44336", mb: 1 }}>
                            {thriftTokenResult.data.verified ? "Token is VALID" : "Token verification result"}
                          </Typography>
                          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1 }}>
                            {Object.entries(thriftTokenResult.data.token).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => (
                              <Typography key={k} sx={{ fontSize: "11px", fontFamily: "monospace" }}>
                                <span style={{ color: colors.grey[500] }}>{k}:</span> {String(v)}
                              </Typography>
                            ))}
                          </Box>
                        </Box>
                      )}
                      {/* Meta info */}
                      <Box sx={{ display: "flex", gap: 2, fontSize: "11px", color: colors.grey[500] }}>
                        {thriftTokenResult.data.durationMs !== undefined && <span>Duration: {thriftTokenResult.data.durationMs}ms</span>}
                        {thriftTokenResult.data.messageId && <span>MsgID: {thriftTokenResult.data.messageId}</span>}
                        {thriftTokenResult.data.numTokens !== undefined && <span>Tokens: {thriftTokenResult.data.numTokens}</span>}
                      </Box>
                    </Box>
                  )}
                </Box>
              )}
            </Box>
          )}

          {/* ═══ TAB 7 (unused — was command log) ═══ */}
          {tab === 99 && (
            <Box sx={{ p: 3, borderRadius: "12px", bgcolor: cardBg, border: `1px solid ${cardBorder}` }}>
              <Typography sx={{ fontWeight: 700, fontSize: "15px", mb: 2 }}>Comparison History</Typography>
              {comparisonHistory.length === 0 ? (
                <Typography sx={{ color: colors.grey[500], fontSize: "13px", fontStyle: "italic" }}>
                  No comparisons yet. Generate tokens from both Real and Virtual HSM, then click "Compare".
                </Typography>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        {["Time", "Meter", "Amount", "Real HSM Token", "Virtual HSM Token", "Result"].map((h) => (
                          <TableCell key={h} sx={{ color: realAccent, fontWeight: 600, fontSize: "11px", borderBottom: `1px solid ${cardBorder}` }}>{h}</TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {comparisonHistory.map((row, i) => (
                        <TableRow key={i}>
                          <TableCell sx={{ fontSize: "12px", borderBottom: `1px solid ${cardBorder}`, fontFamily: "monospace" }}>{fmtTime(row.time)}</TableCell>
                          <TableCell sx={{ fontSize: "12px", borderBottom: `1px solid ${cardBorder}` }}>{row.meterNo}</TableCell>
                          <TableCell sx={{ fontSize: "12px", borderBottom: `1px solid ${cardBorder}` }}>N$ {row.amount}</TableCell>
                          <TableCell sx={{ fontSize: "11px", borderBottom: `1px solid ${cardBorder}`, fontFamily: "monospace" }}>{row.hsmToken || "—"}</TableCell>
                          <TableCell sx={{ fontSize: "11px", borderBottom: `1px solid ${cardBorder}`, fontFamily: "monospace" }}>{row.serverToken || "—"}</TableCell>
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
          )}
        </Box>

      {/* ═══ KEY DIALOG (shared) ═══ */}
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
            sx={{ bgcolor: realAccent, "&:hover": { bgcolor: "#009688" } }}>
            Save Key
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
