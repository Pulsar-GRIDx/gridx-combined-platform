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
        setThriftStatus({ connected: true, status: "connected", message: "Connected via the local HSM agent" });
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
      const res = await fetch("/cb/vending/thrift-signin", { method: "POST", headers: thriftAuthHeaders(), /* Credentials live on the agent; nothing to send from the browser. */
        body: JSON.stringify({}) });
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
      <Header title="HARDWARE SECURITY MODULE" subtitle="PrismToken HSM via the local factory agent — status and token generation" />

      {/* PrismVend Connection Status */}

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

          {/* Tabs — pill/chip style */}
          <Box sx={{
            display: "flex", flexWrap: "wrap", gap: "8px", mb: 3, p: "12px",
            borderRadius: "14px", bgcolor: isDark ? colors.primary[500] : "#f5f5f5",
            border: `1px solid ${isDark ? colors.primary[300] : "#e0e0e0"}`,
          }}>
            {[
              { icon: <MemoryIcon sx={{ fontSize: 16 }} />, label: "HSM Connection" },
              { icon: <TerminalIcon sx={{ fontSize: 16 }} />, label: "Token Operations" },
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
                {/* Thrift Connection Config */}
                <Box sx={{ p: 3, borderRadius: "12px", bgcolor: cardBg, border: `1px solid ${cardBorder}` }}>
                  <Typography sx={{ fontWeight: 700, fontSize: "15px", mb: 1 }}>PrismToken HSM Connection</Typography>
                  <Typography sx={{ fontSize: "12px", color: colors.grey[400], mb: 2 }}>
                    Opened by the local agent inside the factory network over TLS/Thrift. The HSM
                    address and credentials live on the agent and are never sent to the browser.
                  </Typography>
                  <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, mb: 2 }}>
                    <TextField size="small" label="HSM (via agent)" fullWidth
                      value={agentStatus?.agent?.hsmHost || "agent offline"}
                      InputProps={{ readOnly: true }} />
                    <TextField size="small" label="Agent" fullWidth
                      value={agentStatus?.agent?.name || "-"}
                      InputProps={{ readOnly: true }} />
                  </Box>
                  <Box sx={{ display: "flex", gap: 1 }}>
                    <Button variant="contained" onClick={connectThrift} /* In agent mode the host and credentials live on the agent, not in this
                         form, so an online agent is sufficient to connect. */
                      disabled={thriftConnecting || !agentStatus?.online}
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
                      Not connected. Click Connect to open a session through the local agent.
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
          {tab === 1 && (
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
        </Box>

      {/* ═══ KEY DIALOG (shared) ═══ */}
    </Box>
  );
}
