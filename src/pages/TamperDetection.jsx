import { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  useTheme,
  TextField,
  InputAdornment,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tooltip,
} from "@mui/material";
import {
  GppBadOutlined,
  SearchOutlined,
  WarningAmberOutlined,
  ErrorOutlined,
  CheckCircleOutlined,
  ShieldOutlined,
  TrendingDownOutlined,
  BugReportOutlined,
} from "@mui/icons-material";
import { tokens } from "../theme";
import Header from "../components/Header";
import { tamperAPI } from "../services/api";
import { useNavigate } from "react-router-dom";

/* ---- Helpers ---- */
function formatDate(val) {
  if (!val) return "—";
  var d = new Date(val);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })
    + " " + d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
}

function timeAgo(val) {
  if (!val) return "";
  var d = new Date(val);
  if (isNaN(d.getTime())) return "";
  var diff = Date.now() - d.getTime();
  var mins = Math.floor(diff / 60000);
  if (mins < 60) return mins + "m ago";
  var hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  var days = Math.floor(hrs / 24);
  return days + "d ago";
}

var SEVERITY_CONFIG = {
  Critical: { color: "#db4f4a", bg: "rgba(219,79,74,0.12)", icon: ErrorOutlined },
  High: { color: "#ff7043", bg: "rgba(255,112,67,0.12)", icon: WarningAmberOutlined },
  Warning: { color: "#f2b705", bg: "rgba(242,183,5,0.12)", icon: WarningAmberOutlined },
  Medium: { color: "#f2b705", bg: "rgba(242,183,5,0.12)", icon: WarningAmberOutlined },
  Low: { color: "#2E7D32", bg: "rgba(76,206,172,0.12)", icon: CheckCircleOutlined },
};

/* ---- Summary Card ---- */
function SummaryCard({ colors, label, value, icon, color, subtitle }) {
  var Icon = icon;
  return (
    <Box
      sx={{
        backgroundColor: colors.primary[400],
        borderRadius: "8px",
        p: "16px 20px",
        display: "flex",
        alignItems: "center",
        gap: "14px",
        flex: 1,
        minWidth: "180px",
      }}
    >
      <Box
        sx={{
          width: 44, height: 44, borderRadius: "10px",
          bgcolor: color + "18",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <Icon sx={{ color: color, fontSize: 22 }} />
      </Box>
      <Box>
        <Typography fontSize="22px" fontWeight="700" color={colors.grey[100]}>
          {value}
        </Typography>
        <Typography fontSize="12px" color={colors.grey[400]}>
          {label}
        </Typography>
        {subtitle && (
          <Typography fontSize="10px" color={colors.grey[500]}>
            {subtitle}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

/* ================================================================
   PHYSICAL TAMPER EVENTS TAB
   ================================================================ */
function PhysicalTamperTab({ colors, summary }) {
  var navigate = useNavigate();
  var [events, setEvents] = useState([]);
  var [loading, setLoading] = useState(true);
  var [search, setSearch] = useState("");
  var [days, setDays] = useState(90);

  useEffect(function() {
    setLoading(true);
    tamperAPI.getPhysicalEvents(days).then(function(res) {
      setEvents(res.events || []);
    }).catch(function() {
      setEvents([]);
    }).finally(function() {
      setLoading(false);
    });
  }, [days]);

  var filtered = events.filter(function(e) {
    if (!search) return true;
    var s = search.toLowerCase();
    return (e.DRN && e.DRN.toLowerCase().includes(s))
      || (e.customerName && e.customerName.toLowerCase().includes(s))
      || (e.city && e.city.toLowerCase().includes(s));
  });

  return (
    <>
      {/* Summary cards */}
      <Box display="flex" gap="12px" mb="16px" flexWrap="wrap">
        <SummaryCard colors={colors} label="Physical Events" value={summary.physicalEvents || 0} icon={GppBadOutlined} color="#db4f4a" subtitle={"Last " + days + " days"} />
        <SummaryCard colors={colors} label="Unique Meters" value={summary.physicalMeters || 0} icon={ShieldOutlined} color="#ff7043" subtitle="With tamper alerts" />
        <SummaryCard colors={colors} label="Active Alerts" value={summary.activeNotifications || 0} icon={WarningAmberOutlined} color="#f2b705" subtitle="Last 30 days" />
        <SummaryCard colors={colors} label="Total Fleet" value={summary.totalMeters || 0} icon={CheckCircleOutlined} color="#2E7D32" subtitle="All meters" />
      </Box>

      {/* Filters */}
      <Box display="flex" gap="12px" mb="16px" alignItems="center" flexWrap="wrap">
        <TextField
          size="small"
          placeholder="Search by DRN, customer, or city..."
          value={search}
          onChange={function(e) { setSearch(e.target.value); }}
          sx={{ minWidth: 280, flex: 1, maxWidth: 400 }}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchOutlined sx={{ color: colors.grey[500], fontSize: 18 }} /></InputAdornment>,
          }}
        />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Time Range</InputLabel>
          <Select value={days} label="Time Range" onChange={function(e) { setDays(e.target.value); }}>
            <MenuItem value={7}>Last 7 days</MenuItem>
            <MenuItem value={30}>Last 30 days</MenuItem>
            <MenuItem value={90}>Last 90 days</MenuItem>
            <MenuItem value={180}>Last 6 months</MenuItem>
            <MenuItem value={365}>Last year</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Table */}
      <Box sx={{ backgroundColor: colors.primary[400], borderRadius: "8px", overflow: "hidden" }}>
        {loading ? (
          <Box display="flex" justifyContent="center" py="60px">
            <CircularProgress sx={{ color: colors.redAccent ? colors.redAccent[500] : "#db4f4a" }} />
          </Box>
        ) : filtered.length === 0 ? (
          <Box display="flex" flexDirection="column" alignItems="center" py="60px" gap="8px">
            <ShieldOutlined sx={{ fontSize: 48, color: colors.greenAccent[500], opacity: 0.5 }} />
            <Typography color={colors.grey[400]}>No physical tamper events found</Typography>
          </Box>
        ) : (
          <TableContainer sx={{ maxHeight: "520px" }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {["Meter DRN", "Customer", "Location", "Tamper Time", "Credit (kWh)", "Severity", "Detected"].map(function(h) {
                    return (
                      <TableCell key={h} sx={{ backgroundColor: colors.primary[400], color: colors.grey[100], fontWeight: 700, borderBottom: "1px solid " + colors.grey[700], fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        {h}
                      </TableCell>
                    );
                  })}
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map(function(ev, idx) {
                  var sev = SEVERITY_CONFIG[ev.severity] || SEVERITY_CONFIG.Warning;
                  return (
                    <TableRow key={idx} sx={{ "&:hover": { bgcolor: "rgba(219,79,74,0.04)", cursor: "pointer" } }} onClick={function() { navigate("/meter/" + ev.DRN); }}>
                      <TableCell sx={{ borderBottom: "1px solid " + colors.grey[800] }}>
                        <Typography fontWeight="600" fontSize="13px" color={colors.grey[100]}>
                          {ev.DRN}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ borderBottom: "1px solid " + colors.grey[800], color: colors.grey[200], fontSize: "13px" }}>
                        {ev.customerName}
                      </TableCell>
                      <TableCell sx={{ borderBottom: "1px solid " + colors.grey[800], color: colors.grey[300], fontSize: "12px" }}>
                        {[ev.city, ev.region].filter(Boolean).join(", ") || "—"}
                      </TableCell>
                      <TableCell sx={{ borderBottom: "1px solid " + colors.grey[800] }}>
                        <Typography fontSize="12px" color={colors.grey[200]}>
                          {formatDate(ev.tamperTime)}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ borderBottom: "1px solid " + colors.grey[800] }}>
                        <Typography fontWeight="600" fontSize="13px" color={ev.creditAtTamper != null && ev.creditAtTamper < 10 ? "#db4f4a" : colors.grey[200]}>
                          {ev.creditAtTamper != null ? ev.creditAtTamper.toFixed(2) : "—"}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ borderBottom: "1px solid " + colors.grey[800] }}>
                        <Chip
                          label={ev.severity}
                          size="small"
                          sx={{ height: "22px", fontSize: "10px", fontWeight: 700, bgcolor: sev.bg, color: sev.color, border: "1px solid " + sev.color + "30" }}
                        />
                      </TableCell>
                      <TableCell sx={{ borderBottom: "1px solid " + colors.grey[800] }}>
                        <Tooltip title={formatDate(ev.detectedAt)}>
                          <Typography fontSize="12px" color={colors.grey[400]}>
                            {timeAgo(ev.detectedAt)}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        {!loading && filtered.length > 0 && (
          <Box px="16px" py="8px" display="flex" justifyContent="space-between" borderTop={"1px solid " + colors.grey[800]}>
            <Typography fontSize="11px" color={colors.grey[500]}>
              Showing {filtered.length} of {events.length} events
            </Typography>
            <Typography fontSize="11px" color={colors.grey[500]}>
              Physical tamper: cover open, meter interference, unauthorized access
            </Typography>
          </Box>
        )}
      </Box>
    </>
  );
}

/* ================================================================
   SOFTWARE / ANALYTICAL DETECTION TAB
   ================================================================ */
function AnalyticalTamperTab({ colors, summary }) {
  var navigate = useNavigate();
  var [confirmed, setConfirmed] = useState([]);
  var [suspected, setSuspected] = useState([]);
  var [loadingConfirmed, setLoadingConfirmed] = useState(true);
  var [loadingSuspected, setLoadingSuspected] = useState(true);
  var [searchConfirmed, setSearchConfirmed] = useState("");
  var [searchSuspected, setSearchSuspected] = useState("");
  var [days, setDays] = useState(90);

  useEffect(function() {
    setLoadingConfirmed(true);
    setLoadingSuspected(true);

    tamperAPI.getConfirmed(days).then(function(res) {
      setConfirmed(res.meters || []);
    }).catch(function() {
      setConfirmed([]);
    }).finally(function() {
      setLoadingConfirmed(false);
    });

    tamperAPI.getSuspected(days).then(function(res) {
      setSuspected(res.meters || []);
    }).catch(function() {
      setSuspected([]);
    }).finally(function() {
      setLoadingSuspected(false);
    });
  }, [days]);

  var filteredConfirmed = confirmed.filter(function(m) {
    if (!searchConfirmed) return true;
    var s = searchConfirmed.toLowerCase();
    return (m.DRN && m.DRN.toLowerCase().includes(s)) || (m.customerName && m.customerName.toLowerCase().includes(s));
  });

  var filteredSuspected = suspected.filter(function(m) {
    if (!searchSuspected) return true;
    var s = searchSuspected.toLowerCase();
    return (m.DRN && m.DRN.toLowerCase().includes(s)) || (m.customerName && m.customerName.toLowerCase().includes(s));
  });

  return (
    <>
      {/* Summary */}
      <Box display="flex" gap="12px" mb="16px" flexWrap="wrap">
        <SummaryCard colors={colors} label="Confirmed Tampered" value={confirmed.length} icon={ErrorOutlined} color="#db4f4a" subtitle="3+ tamper events" />
        <SummaryCard colors={colors} label="Suspected" value={suspected.length} icon={BugReportOutlined} color="#ff7043" subtitle="Anomaly detected" />
        <SummaryCard colors={colors} label="Total Flagged" value={confirmed.length + suspected.length} icon={GppBadOutlined} color="#f2b705" subtitle="Requires attention" />
      </Box>

      {/* Time range */}
      <Box display="flex" gap="12px" mb="16px" alignItems="center">
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Time Range</InputLabel>
          <Select value={days} label="Time Range" onChange={function(e) { setDays(e.target.value); }}>
            <MenuItem value={30}>Last 30 days</MenuItem>
            <MenuItem value={90}>Last 90 days</MenuItem>
            <MenuItem value={180}>Last 6 months</MenuItem>
            <MenuItem value={365}>Last year</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* ---- CONFIRMED TAMPERED TABLE ---- */}
      <Box sx={{ backgroundColor: colors.primary[400], borderRadius: "8px", overflow: "hidden", mb: "20px" }}>
        <Box px="20px" pt="16px" pb="8px" display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="8px">
          <Box display="flex" alignItems="center" gap="10px">
            <Box sx={{ width: 4, height: 24, borderRadius: "2px", bgcolor: "#db4f4a" }} />
            <Box>
              <Typography variant="h6" color={colors.grey[100]} fontWeight="bold">
                Confirmed Tampered
              </Typography>
              <Typography fontSize="11px" color={colors.grey[400]}>
                Meters with 3+ physical tamper events — high confidence
              </Typography>
            </Box>
          </Box>
          <TextField
            size="small"
            placeholder="Search..."
            value={searchConfirmed}
            onChange={function(e) { setSearchConfirmed(e.target.value); }}
            sx={{ width: 220 }}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchOutlined sx={{ color: colors.grey[500], fontSize: 16 }} /></InputAdornment>,
            }}
          />
        </Box>

        {loadingConfirmed ? (
          <Box display="flex" justifyContent="center" py="40px">
            <CircularProgress size={28} sx={{ color: "#db4f4a" }} />
          </Box>
        ) : filteredConfirmed.length === 0 ? (
          <Box display="flex" flexDirection="column" alignItems="center" py="40px" gap="6px">
            <ShieldOutlined sx={{ fontSize: 36, color: colors.greenAccent[500], opacity: 0.4 }} />
            <Typography fontSize="13px" color={colors.grey[400]}>No confirmed tampered meters</Typography>
          </Box>
        ) : (
          <TableContainer sx={{ maxHeight: "360px" }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {["Meter DRN", "Customer", "Location", "Events", "Risk", "First Detected", "Last Detected", "Avg Credit"].map(function(h) {
                    return (
                      <TableCell key={h} sx={{ backgroundColor: colors.primary[400], color: colors.grey[100], fontWeight: 700, borderBottom: "1px solid " + colors.grey[700], fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        {h}
                      </TableCell>
                    );
                  })}
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredConfirmed.map(function(m, idx) {
                  var sev = SEVERITY_CONFIG[m.riskLevel] || SEVERITY_CONFIG.Medium;
                  return (
                    <TableRow key={idx} sx={{ "&:hover": { bgcolor: "rgba(219,79,74,0.04)", cursor: "pointer" } }} onClick={function() { navigate("/meter/" + m.DRN); }}>
                      <TableCell sx={{ borderBottom: "1px solid " + colors.grey[800] }}>
                        <Typography fontWeight="600" fontSize="13px" color={colors.grey[100]}>{m.DRN}</Typography>
                      </TableCell>
                      <TableCell sx={{ borderBottom: "1px solid " + colors.grey[800], color: colors.grey[200], fontSize: "13px" }}>
                        {m.customerName}
                      </TableCell>
                      <TableCell sx={{ borderBottom: "1px solid " + colors.grey[800], color: colors.grey[300], fontSize: "12px" }}>
                        {[m.city, m.region].filter(Boolean).join(", ") || "—"}
                      </TableCell>
                      <TableCell sx={{ borderBottom: "1px solid " + colors.grey[800] }}>
                        <Typography fontWeight="700" fontSize="14px" color="#db4f4a">
                          {m.tamperCount}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ borderBottom: "1px solid " + colors.grey[800] }}>
                        <Chip label={m.riskLevel} size="small" sx={{ height: "20px", fontSize: "10px", fontWeight: 700, bgcolor: sev.bg, color: sev.color }} />
                      </TableCell>
                      <TableCell sx={{ borderBottom: "1px solid " + colors.grey[800], fontSize: "12px", color: colors.grey[300] }}>
                        {formatDate(m.firstDetected)}
                      </TableCell>
                      <TableCell sx={{ borderBottom: "1px solid " + colors.grey[800] }}>
                        <Tooltip title={formatDate(m.lastDetected)}>
                          <Typography fontSize="12px" color={colors.grey[300]}>{timeAgo(m.lastDetected)}</Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell sx={{ borderBottom: "1px solid " + colors.grey[800], fontSize: "13px", color: colors.grey[200] }}>
                        {m.avgCredit != null ? m.avgCredit.toFixed(2) + " kWh" : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        {!loadingConfirmed && filteredConfirmed.length > 0 && (
          <Box px="16px" py="8px" borderTop={"1px solid " + colors.grey[800]}>
            <Typography fontSize="11px" color={colors.grey[500]}>
              {filteredConfirmed.length} meter{filteredConfirmed.length !== 1 ? "s" : ""} confirmed tampered
            </Typography>
          </Box>
        )}
      </Box>

      {/* ---- SUSPECTED TAMPERED TABLE ---- */}
      <Box sx={{ backgroundColor: colors.primary[400], borderRadius: "8px", overflow: "hidden" }}>
        <Box px="20px" pt="16px" pb="8px" display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="8px">
          <Box display="flex" alignItems="center" gap="10px">
            <Box sx={{ width: 4, height: 24, borderRadius: "2px", bgcolor: "#ff7043" }} />
            <Box>
              <Typography variant="h6" color={colors.grey[100]} fontWeight="bold">
                Suspected Tampered
              </Typography>
              <Typography fontSize="11px" color={colors.grey[400]}>
                Intermittent tamper signals + anomalous consumption patterns
              </Typography>
            </Box>
          </Box>
          <TextField
            size="small"
            placeholder="Search..."
            value={searchSuspected}
            onChange={function(e) { setSearchSuspected(e.target.value); }}
            sx={{ width: 220 }}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchOutlined sx={{ color: colors.grey[500], fontSize: 16 }} /></InputAdornment>,
            }}
          />
        </Box>

        {loadingSuspected ? (
          <Box display="flex" justifyContent="center" py="40px">
            <CircularProgress size={28} sx={{ color: "#ff7043" }} />
          </Box>
        ) : filteredSuspected.length === 0 ? (
          <Box display="flex" flexDirection="column" alignItems="center" py="40px" gap="6px">
            <ShieldOutlined sx={{ fontSize: 36, color: colors.greenAccent[500], opacity: 0.4 }} />
            <Typography fontSize="13px" color={colors.grey[400]}>No suspected tampered meters</Typography>
          </Box>
        ) : (
          <TableContainer sx={{ maxHeight: "360px" }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {["Meter DRN", "Customer", "Location", "Reason", "Risk", "Last Detected", "Avg Credit"].map(function(h) {
                    return (
                      <TableCell key={h} sx={{ backgroundColor: colors.primary[400], color: colors.grey[100], fontWeight: 700, borderBottom: "1px solid " + colors.grey[700], fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        {h}
                      </TableCell>
                    );
                  })}
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredSuspected.map(function(m, idx) {
                  var sev = SEVERITY_CONFIG[m.riskLevel] || SEVERITY_CONFIG.Low;
                  return (
                    <TableRow key={idx} sx={{ "&:hover": { bgcolor: "rgba(255,112,67,0.04)", cursor: "pointer" } }} onClick={function() { navigate("/meter/" + m.DRN); }}>
                      <TableCell sx={{ borderBottom: "1px solid " + colors.grey[800] }}>
                        <Typography fontWeight="600" fontSize="13px" color={colors.grey[100]}>{m.DRN}</Typography>
                      </TableCell>
                      <TableCell sx={{ borderBottom: "1px solid " + colors.grey[800], color: colors.grey[200], fontSize: "13px" }}>
                        {m.customerName}
                      </TableCell>
                      <TableCell sx={{ borderBottom: "1px solid " + colors.grey[800], color: colors.grey[300], fontSize: "12px" }}>
                        {[m.city, m.region].filter(Boolean).join(", ") || "—"}
                      </TableCell>
                      <TableCell sx={{ borderBottom: "1px solid " + colors.grey[800] }}>
                        <Box display="flex" alignItems="center" gap="6px">
                          {m.tamperCount > 0
                            ? <TrendingDownOutlined sx={{ fontSize: 14, color: "#ff7043" }} />
                            : <BugReportOutlined sx={{ fontSize: 14, color: "#f2b705" }} />
                          }
                          <Typography fontSize="12px" color={colors.grey[200]}>
                            {m.reason}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ borderBottom: "1px solid " + colors.grey[800] }}>
                        <Chip label={m.riskLevel} size="small" sx={{ height: "20px", fontSize: "10px", fontWeight: 700, bgcolor: sev.bg, color: sev.color }} />
                      </TableCell>
                      <TableCell sx={{ borderBottom: "1px solid " + colors.grey[800] }}>
                        <Typography fontSize="12px" color={colors.grey[300]}>
                          {m.lastDetected ? timeAgo(m.lastDetected) : "—"}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ borderBottom: "1px solid " + colors.grey[800], fontSize: "13px", color: colors.grey[200] }}>
                        {m.avgCredit != null ? m.avgCredit.toFixed(2) + " kWh" : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        {!loadingSuspected && filteredSuspected.length > 0 && (
          <Box px="16px" py="8px" borderTop={"1px solid " + colors.grey[800]}>
            <Typography fontSize="11px" color={colors.grey[500]}>
              {filteredSuspected.length} meter{filteredSuspected.length !== 1 ? "s" : ""} under investigation
            </Typography>
          </Box>
        )}
      </Box>
    </>
  );
}

/* ================================================================
   MAIN PAGE
   ================================================================ */
export default function TamperDetection() {
  var theme = useTheme();
  var colors = tokens(theme.palette.mode);
  var [mainTab, setMainTab] = useState(0);
  var [summary, setSummary] = useState({});

  useEffect(function() {
    tamperAPI.getSummary().then(function(res) {
      setSummary(res || {});
    }).catch(function() {});
  }, []);

  return (
    <Box m="20px">
      <Header
        title="TAMPER DETECTION"
        subtitle={mainTab === 0 ? "Physical Tamper Events" : "Software-Based Analytical Detection"}
      />

      <Tabs
        value={mainTab}
        onChange={function(_, v) { setMainTab(v); }}
        sx={{
          mb: "20px",
          "& .MuiTab-root": {
            color: colors.grey[300],
            textTransform: "none",
            fontWeight: 600,
            fontSize: "14px",
            "&.Mui-selected": { color: "#db4f4a" },
          },
          "& .MuiTabs-indicator": {
            backgroundColor: "#db4f4a",
            height: "3px",
            borderRadius: "3px 3px 0 0",
          },
        }}
      >
        <Tab label="Physical Tamper" />
        <Tab label="Software Detection" />
      </Tabs>

      {mainTab === 0 && <PhysicalTamperTab colors={colors} summary={summary} />}
      {mainTab === 1 && <AnalyticalTamperTab colors={colors} summary={summary} />}
    </Box>
  );
}
