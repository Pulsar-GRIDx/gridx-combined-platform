import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  useTheme,
  Button,
  TextField,
  Paper,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  LinearProgress,
  IconButton,
  Tooltip,
} from "@mui/material";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RefreshIcon from "@mui/icons-material/Refresh";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import Header from "../components/Header";
import { tokens } from "../theme";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/cb";

function getAuthHeaders() {
  const token = sessionStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch(url, options = {}) {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { ...getAuthHeaders(), ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

const FirmwareOTA = () => {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const isDark = theme.palette.mode === "dark";

  // Current firmware state
  const [currentFw, setCurrentFw] = useState(null);
  const [versions, setVersions] = useState([]);
  const [loadingInfo, setLoadingInfo] = useState(true);

  // Upload state
  const [file, setFile] = useState(null);
  const [version, setVersion] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [error, setError] = useState(null);

  // OTA push state
  const [pushDrn, setPushDrn] = useState("");
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState(null);

  const cardBg = isDark ? colors.primary[400] : "#fff";
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

  const fetchInfo = useCallback(async () => {
    setLoadingInfo(true);
    try {
      const [info, vers] = await Promise.all([
        apiFetch("/files/ota/info").catch(() => null),
        apiFetch("/files/ota/versions").catch(() => ({ versions: [] })),
      ]);
      setCurrentFw(info);
      setVersions(vers.versions || []);
    } catch {
      /* ignore */
    }
    setLoadingInfo(false);
  }, []);

  useEffect(() => {
    fetchInfo();
  }, [fetchInfo]);

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (f) {
      setFile(f);
      setUploadResult(null);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file || !version.trim()) {
      setError("Please select a .bin file and enter a version number");
      return;
    }
    setUploading(true);
    setError(null);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append("firmware", file);
      formData.append("version", version.trim());

      const res = await fetch(`${API_BASE}/files/ota/upload`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      setUploadResult(data);
      setFile(null);
      setVersion("");
      // Reset file input
      const input = document.getElementById("firmware-file-input");
      if (input) input.value = "";
      // Refresh info
      fetchInfo();
    } catch (err) {
      setError(err.message);
    }
    setUploading(false);
  };

  const handlePushOta = async () => {
    if (!pushDrn.trim()) return;
    setPushing(true);
    setPushResult(null);
    try {
      const data = await apiFetch("/files/ota/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drn: pushDrn.trim() }),
      });
      setPushResult(data);
    } catch (err) {
      setPushResult({ error: err.message });
    }
    setPushing(false);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <Box m="0 20px 20px 20px">
      <Header title="Firmware OTA" subtitle="Upload firmware and manage over-the-air updates" />

      {/* ── Current Firmware Info ── */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          mb: 3,
          bgcolor: cardBg,
          border: `1px solid ${borderColor}`,
          borderRadius: "12px",
        }}
      >
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Typography variant="h5" fontWeight={600} color={colors.grey[100]}>
            Current Firmware
          </Typography>
          <IconButton onClick={fetchInfo} size="small">
            <RefreshIcon sx={{ color: colors.grey[300] }} />
          </IconButton>
        </Box>

        {loadingInfo ? (
          <LinearProgress sx={{ borderRadius: 1 }} />
        ) : currentFw ? (
          <Box display="flex" gap={4} flexWrap="wrap">
            <InfoBlock label="Version" value={`v${currentFw.version}`} color={colors.greenAccent[400]} />
            <InfoBlock label="Size" value={`${(currentFw.size / 1024).toFixed(1)} KB`} color={colors.blueAccent[400]} />
            <Box>
              <Typography variant="caption" color={colors.grey[500]}>
                Hydro Hash
              </Typography>
              <Box display="flex" alignItems="center" gap={0.5}>
                <Typography
                  variant="body2"
                  fontFamily="monospace"
                  fontSize="0.75rem"
                  color={colors.grey[200]}
                  sx={{ wordBreak: "break-all" }}
                >
                  {currentFw.hash}
                </Typography>
                <Tooltip title="Copy hash">
                  <IconButton size="small" onClick={() => copyToClipboard(currentFw.hash)}>
                    <ContentCopyIcon sx={{ fontSize: 14, color: colors.grey[400] }} />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
          </Box>
        ) : (
          <Typography color={colors.grey[500]}>No firmware uploaded yet</Typography>
        )}
      </Paper>

      {/* ── Upload Section ── */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          mb: 3,
          bgcolor: cardBg,
          border: `1px solid ${borderColor}`,
          borderRadius: "12px",
        }}
      >
        <Typography variant="h5" fontWeight={600} color={colors.grey[100]} mb={2}>
          Upload New Firmware
        </Typography>
        <Typography variant="body2" color={colors.grey[400]} mb={2}>
          Upload a .bin file. The libhydrogen hash (Gimli-based, context "metering") will be
          computed automatically and fw_latest.json will be generated.
        </Typography>

        <Box display="flex" gap={2} flexWrap="wrap" alignItems="flex-end">
          <Box>
            <Typography variant="caption" color={colors.grey[500]} mb={0.5} display="block">
              Firmware Binary
            </Typography>
            <Button
              variant="outlined"
              component="label"
              startIcon={<CloudUploadIcon />}
              sx={{
                borderColor: colors.blueAccent[500],
                color: colors.blueAccent[400],
                textTransform: "none",
                "&:hover": { borderColor: colors.blueAccent[300] },
              }}
            >
              {file ? file.name : "Select .bin file"}
              <input
                id="firmware-file-input"
                type="file"
                accept=".bin"
                hidden
                onChange={handleFileChange}
              />
            </Button>
            {file && (
              <Typography variant="caption" color={colors.grey[500]} mt={0.5} display="block">
                {(file.size / 1024).toFixed(1)} KB
              </Typography>
            )}
          </Box>

          <TextField
            label="Version"
            placeholder="e.g. 0.51.0"
            size="small"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            sx={{
              width: 180,
              "& .MuiOutlinedInput-root": {
                "& fieldset": { borderColor: colors.grey[600] },
              },
              "& .MuiInputLabel-root": { color: colors.grey[500] },
              "& .MuiInputBase-input": { color: colors.grey[100] },
            }}
          />

          <Button
            variant="contained"
            onClick={handleUpload}
            disabled={uploading || !file || !version.trim()}
            startIcon={uploading ? <CircularProgress size={18} /> : <CloudUploadIcon />}
            sx={{
              bgcolor: colors.greenAccent[600],
              color: "#fff",
              textTransform: "none",
              fontWeight: 600,
              "&:hover": { bgcolor: colors.greenAccent[500] },
              "&:disabled": { bgcolor: colors.grey[700] },
            }}
          >
            {uploading ? "Uploading & Hashing..." : "Upload & Generate JSON"}
          </Button>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}

        {uploadResult && uploadResult.success && (
          <Alert
            severity="success"
            icon={<CheckCircleIcon />}
            sx={{ mt: 2 }}
          >
            <Typography fontWeight={600}>{uploadResult.message}</Typography>
            <Box mt={1} fontFamily="monospace" fontSize="0.8rem">
              <div>Version: {uploadResult.firmware.version}</div>
              <div>Size: {uploadResult.firmware.size} bytes</div>
              <div>Hash: {uploadResult.firmware.hash}</div>
              <div>URL: {uploadResult.firmware.url}</div>
            </Box>
          </Alert>
        )}
      </Paper>

      {/* ── Push OTA to Device ── */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          mb: 3,
          bgcolor: cardBg,
          border: `1px solid ${borderColor}`,
          borderRadius: "12px",
        }}
      >
        <Typography variant="h5" fontWeight={600} color={colors.grey[100]} mb={1}>
          Push OTA to Device
        </Typography>
        <Typography variant="body2" color={colors.grey[400]} mb={2}>
          Send the current firmware to a specific meter via OTA update.
        </Typography>

        <Box display="flex" gap={2} alignItems="flex-end">
          <TextField
            label="Device DRN"
            placeholder="e.g. DRN_001"
            size="small"
            value={pushDrn}
            onChange={(e) => setPushDrn(e.target.value)}
            sx={{
              width: 220,
              "& .MuiOutlinedInput-root": {
                "& fieldset": { borderColor: colors.grey[600] },
              },
              "& .MuiInputLabel-root": { color: colors.grey[500] },
              "& .MuiInputBase-input": { color: colors.grey[100] },
            }}
          />
          <Button
            variant="contained"
            onClick={handlePushOta}
            disabled={pushing || !pushDrn.trim() || !currentFw}
            startIcon={pushing ? <CircularProgress size={18} /> : <RocketLaunchIcon />}
            sx={{
              bgcolor: colors.blueAccent[600],
              color: "#fff",
              textTransform: "none",
              fontWeight: 600,
              "&:hover": { bgcolor: colors.blueAccent[500] },
              "&:disabled": { bgcolor: colors.grey[700] },
            }}
          >
            {pushing ? "Sending..." : "Start OTA Update"}
          </Button>
        </Box>

        {pushResult && (
          <Alert severity={pushResult.error ? "error" : "success"} sx={{ mt: 2 }}>
            {pushResult.error || pushResult.message}
          </Alert>
        )}
      </Paper>

      {/* ── Version History ── */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          bgcolor: cardBg,
          border: `1px solid ${borderColor}`,
          borderRadius: "12px",
        }}
      >
        <Typography variant="h5" fontWeight={600} color={colors.grey[100]} mb={2}>
          Firmware Version History
        </Typography>

        {versions.length === 0 ? (
          <Typography color={colors.grey[500]}>No firmware versions found</Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ color: colors.grey[400], borderColor }}>Version</TableCell>
                  <TableCell sx={{ color: colors.grey[400], borderColor }}>Filename</TableCell>
                  <TableCell sx={{ color: colors.grey[400], borderColor }}>Size</TableCell>
                  <TableCell sx={{ color: colors.grey[400], borderColor }}>Date</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {versions.map((v, i) => (
                  <TableRow key={v.filename}>
                    <TableCell sx={{ color: colors.grey[100], borderColor }}>
                      <Chip
                        label={`v${v.version}`}
                        size="small"
                        sx={{
                          bgcolor:
                            currentFw && v.version === currentFw.version.replace(/\./g, ".")
                              ? colors.greenAccent[800]
                              : colors.grey[700],
                          color: colors.grey[100],
                          fontWeight: 600,
                          fontSize: "0.75rem",
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ color: colors.grey[300], borderColor, fontFamily: "monospace", fontSize: "0.8rem" }}>
                      {v.filename}
                    </TableCell>
                    <TableCell sx={{ color: colors.grey[300], borderColor }}>
                      {(v.size / 1024).toFixed(1)} KB
                    </TableCell>
                    <TableCell sx={{ color: colors.grey[400], borderColor }}>
                      {new Date(v.date).toLocaleDateString()} {new Date(v.date).toLocaleTimeString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Box>
  );
};

/* ── Small info block component ── */
function InfoBlock({ label, value, color }) {
  return (
    <Box>
      <Typography variant="caption" color="rgba(255,255,255,0.5)">
        {label}
      </Typography>
      <Typography variant="h6" fontWeight={700} color={color}>
        {value}
      </Typography>
    </Box>
  );
}

export default FirmwareOTA;
