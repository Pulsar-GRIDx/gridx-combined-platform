import { useState, useEffect, useMemo } from "react";
import {
  Box, Typography, useTheme, LinearProgress, Chip,
} from "@mui/material";
import { tokens } from "../theme";
import Header from "../components/Header";
import SpeedIcon from "@mui/icons-material/Speed";
import SecurityIcon from "@mui/icons-material/Security";
import BoltIcon from "@mui/icons-material/Bolt";
import CellTowerIcon from "@mui/icons-material/CellTower";
import GppBadIcon from "@mui/icons-material/GppBad";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import CrisisAlertIcon from "@mui/icons-material/CrisisAlert";
import ElectricMeterIcon from "@mui/icons-material/ElectricMeter";
import SensorsIcon from "@mui/icons-material/Sensors";
import StraightenIcon from "@mui/icons-material/Straighten";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import MonetizationOnIcon from "@mui/icons-material/MonetizationOn";
import KeyboardDoubleArrowDownIcon from "@mui/icons-material/KeyboardDoubleArrowDown";
import SearchIcon from "@mui/icons-material/Search";
import VisibilityIcon from "@mui/icons-material/Visibility";
import ShieldIcon from "@mui/icons-material/Shield";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Cell,
} from "recharts";
import { meterHealthAPI } from "../services/api";

/* ── Helper Components ── */

function SectionCard({ children, title, icon, subtitle, sx = {} }) {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  return (
    <Box sx={{ backgroundColor: colors.primary[400], borderRadius: "12px", p: "20px", ...sx }}>
      {title && (
        <Box display="flex" alignItems="center" gap={1} mb="12px">
          {icon}
          <Box>
            <Typography variant="h5" fontWeight="700" color={colors.grey[100]}>{title}</Typography>
            {subtitle && <Typography variant="caption" color={colors.grey[400]}>{subtitle}</Typography>}
          </Box>
        </Box>
      )}
      {children}
    </Box>
  );
}

function ScoreGauge({ score, label, color, size = 80 }) {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.5 }}>
      <Box sx={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colors.primary[500]} strokeWidth="5" />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="5"
            strokeDasharray={circ} strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`} strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1s ease" }} />
        </svg>
        <Typography fontWeight="700" color={color}
          sx={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", fontSize: size * 0.22 }}>
          {score}
        </Typography>
      </Box>
      <Typography variant="caption" fontWeight="600" color={colors.grey[300]} textAlign="center" fontSize="0.7rem">
        {label}
      </Typography>
    </Box>
  );
}

function FlowStep({ label, color, icon }) {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  return (
    <Box sx={{
      px: 2, py: 1.2, borderRadius: "10px", border: `1px solid ${color}40`,
      backgroundColor: `${color}10`, display: "flex", alignItems: "center", gap: 1,
    }}>
      {icon}
      <Typography variant="body2" fontWeight="600" color={colors.grey[100]} fontSize="0.8rem">
        {label}
      </Typography>
    </Box>
  );
}

function StatusChip({ label, color }) {
  return (
    <Chip label={label} size="small" sx={{
      backgroundColor: `${color}20`, color, fontWeight: 600, fontSize: "0.7rem",
      border: `1px solid ${color}40`, height: 24,
    }} />
  );
}

/* ── Static Data ── */

const HEALTH_SCALE = [
  { range: "90 – 100", label: "Healthy", color: "#4ade80", pct: 100, icon: <CheckCircleIcon sx={{ fontSize: 16 }} /> },
  { range: "70 – 89", label: "Warning", color: "#f59e0b", pct: 79, icon: <WarningAmberIcon sx={{ fontSize: 16 }} /> },
  { range: "40 – 69", label: "Fault", color: "#ef4444", pct: 54, icon: <ErrorOutlineIcon sx={{ fontSize: 16 }} /> },
  { range: "< 40", label: "Critical", color: "#dc2626", pct: 25, icon: <CrisisAlertIcon sx={{ fontSize: 16 }} /> },
];

const BASELINE_PARAMS = [
  { parameter: "Voltage", expected: "220V – 240V" },
  { parameter: "Frequency", expected: "49.5 – 50.5 Hz" },
  { parameter: "Power Factor", expected: "> 0.85" },
  { parameter: "Communication Uptime", expected: "> 95%" },
  { parameter: "ADC Drift", expected: "< 0.2%" },
];

const INPUT_CATEGORIES = [
  {
    title: "Electrical", color: "#f59e0b",
    icon: <BoltIcon sx={{ color: "#f59e0b", fontSize: 22 }} />,
    items: ["RMS Voltage", "RMS Current", "Active Power", "Reactive Power", "Frequency", "Power Factor"],
  },
  {
    title: "Meter Integrity", color: "#ef4444",
    icon: <SecurityIcon sx={{ color: "#ef4444", fontSize: 22 }} />,
    items: ["Cover Sensor", "Magnetic Sensor", "Tilt Sensor", "Relay State"],
  },
  {
    title: "Communication", color: "#06b6d4",
    icon: <CellTowerIcon sx={{ color: "#06b6d4", fontSize: 22 }} />,
    items: ["RSSI", "MQTT Connectivity", "Packet Loss", "Retry Count"],
  },
  {
    title: "Metrology", color: "#a78bfa",
    icon: <StraightenIcon sx={{ color: "#a78bfa", fontSize: 22 }} />,
    items: ["ADC Health", "mSure Calibration Drift", "Gain Stability", "Offset Stability"],
  },
];

const FAULT_INDICATORS = [
  { category: "Voltage", color: "#f59e0b", indicators: ["Persistent undervoltage", "Persistent overvoltage"] },
  { category: "Current", color: "#06b6d4", indicators: ["Unexpected current drops", "Current imbalance"] },
  { category: "Power", color: "#ef4444", indicators: ["Negative active power", "Unusual reactive power"] },
  { category: "Temperature", color: "#a78bfa", indicators: ["Internal temperature rise", "Sudden temperature changes"] },
];

const TAMPER_INDICATORS = [
  { title: "Consumption Pattern Change", color: "#f59e0b", normal: "Daily usage varies gradually", suspicious: "Sudden 80% drop in usage while occupancy unchanged" },
  { title: "Reverse Energy Flow", color: "#ef4444", normal: null, suspicious: "Active Power < 0 (P < 0)" },
  { title: "Meter Cover Events", color: "#a78bfa", normal: null, suspicious: "Repeated cover opening events detected" },
  { title: "Magnetic Interference", color: "#06b6d4", normal: null, suspicious: "Current measurement drift + harmonic signature change" },
];

const EXAMPLE_METERS = [
  { id: "#10023", electrical: 95, communication: 97, tamperRisk: 4, status: "NORMAL", statusColor: "#4ade80" },
  { id: "#20456", electrical: 81, communication: 88, tamperRisk: 82, status: "INVESTIGATE", statusColor: "#ef4444" },
];

const RADAR_DATA = [
  { metric: "Voltage", normal: 95, faulty: 45 },
  { metric: "Current", normal: 92, faulty: 30 },
  { metric: "Power Factor", normal: 97, faulty: 52 },
  { metric: "Communication", normal: 94, faulty: 40 },
  { metric: "Calibration", normal: 98, faulty: 15 },
  { metric: "Temperature", normal: 90, faulty: 65 },
];

const BUSINESS_OUTCOMES = [
  { title: "Faulty Meters", icon: <ErrorOutlineIcon />, color: "#ef4444", desc: "Detect failing hardware before outages" },
  { title: "Tampered Meters", icon: <GppBadIcon />, color: "#a855f7", desc: "Identify revenue theft and meter bypass" },
  { title: "Comm Failures", icon: <CellTowerIcon />, color: "#06b6d4", desc: "Spot connectivity degradation early" },
  { title: "Meter Drift", icon: <TrendingDownIcon />, color: "#f59e0b", desc: "Catch calibration drift before billing errors" },
  { title: "Revenue Loss", icon: <MonetizationOnIcon />, color: "#4ade80", desc: "Protect utility revenue streams" },
  { title: "Network Issues", icon: <SensorsIcon />, color: "#6366f1", desc: "Identify emerging grid infrastructure problems" },
];

function getActionForScore(healthScore) {
  if (healthScore < 40) return { label: "Immediate Dispatch", color: "#ef4444", icon: <CrisisAlertIcon sx={{ fontSize: 16, color: "#ef4444" }} /> };
  if (healthScore < 70) return { label: "Investigation", color: "#f59e0b", icon: <SearchIcon sx={{ fontSize: 16, color: "#f59e0b" }} /> };
  if (healthScore < 90) return { label: "Monitor", color: "#06b6d4", icon: <VisibilityIcon sx={{ fontSize: 16, color: "#06b6d4" }} /> };
  return { label: "Normal", color: "#4ade80", icon: <CheckCircleIcon sx={{ fontSize: 16, color: "#4ade80" }} /> };
}

/* ── Main Component ── */

export default function SystemAnalysis() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const isDark = theme.palette.mode === "dark";
  const [liveHealth, setLiveHealth] = useState([]);

  useEffect(() => {
    meterHealthAPI.getAllSummary().then(val => {
      if (val?.data) setLiveHealth(val.data);
    }).catch(() => {});
  }, []);

  const fleetStats = useMemo(() => {
    if (!liveHealth.length) return null;
    const healthy = liveHealth.filter(m => m.healthScore >= 90).length;
    const warning = liveHealth.filter(m => m.healthScore >= 70 && m.healthScore < 90).length;
    const fault = liveHealth.filter(m => m.healthScore >= 40 && m.healthScore < 70).length;
    const critical = liveHealth.filter(m => m.healthScore < 40).length;
    return {
      total: liveHealth.length,
      distribution: [
        { category: "Healthy", count: healthy, color: "#4ade80" },
        { category: "Warning", count: warning, color: "#f59e0b" },
        { category: "Fault", count: fault, color: "#ef4444" },
        { category: "Critical", count: critical, color: "#dc2626" },
      ],
    };
  }, [liveHealth]);

  const priorityMeters = useMemo(() => {
    if (!liveHealth.length) return [];
    return [...liveHealth].sort((a, b) => a.healthScore - b.healthScore).slice(0, 10);
  }, [liveHealth]);

  return (
    <Box m="20px" pb={4}>
      <Header title="SYSTEM ANALYSIS" subtitle="GRIDx Intelligent Meter Health Assessment & Fleet Analytics" />

      {/* ═══ SECTION 1: ASSESSMENT OVERVIEW ═══ */}
      <SectionCard
        title="Meter Health Assessment"
        subtitle="Every meter receives continuously updated assessment scores"
        icon={<SpeedIcon sx={{ color: "#6366f1", fontSize: 24 }} />}
        sx={{ mb: "12px" }}
      >
        <Typography variant="body2" color={colors.grey[300]} mb={2}>
          The GRIDx platform continuously evaluates every meter against expected operating behaviour.
          Each meter receives a Health Score, Tamper Risk Score, Communication Score, and Measurement
          Confidence Score &mdash; updated in real time as new data arrives.
        </Typography>

        <Box display="flex" gap="16px" flexWrap="wrap">
          <Box flex="0 0 auto" display="flex" gap={2} flexWrap="wrap" justifyContent="center"
            sx={{ p: 2, borderRadius: "10px", backgroundColor: colors.primary[500], minWidth: "340px" }}>
            <ScoreGauge score={92} label="Health Score" color="#4ade80" />
            <ScoreGauge score={8} label="Tamper Risk" color="#ef4444" />
            <ScoreGauge score={97} label="Communication" color="#06b6d4" />
            <ScoreGauge score={95} label="Measurement Confidence" color="#a78bfa" />
          </Box>

          <Box flex={1} minWidth="280px" display="flex" flexDirection="column" alignItems="center" gap={0.5}>
            <Typography variant="caption" color={colors.grey[400]} mb={0.5} fontWeight={600}>
              Assessment Pipeline
            </Typography>
            <FlowStep label="Raw Meter Data" color="#06b6d4"
              icon={<SensorsIcon sx={{ color: "#06b6d4", fontSize: 18 }} />} />
            <KeyboardDoubleArrowDownIcon sx={{ color: colors.grey[600], fontSize: 20 }} />
            <FlowStep label="Health Assessment Engine" color="#6366f1"
              icon={<SpeedIcon sx={{ color: "#6366f1", fontSize: 18 }} />} />
            <KeyboardDoubleArrowDownIcon sx={{ color: colors.grey[600], fontSize: 20 }} />
            <FlowStep label="Meter Risk Profile" color="#f59e0b"
              icon={<ShieldIcon sx={{ color: "#f59e0b", fontSize: 18 }} />} />
            <KeyboardDoubleArrowDownIcon sx={{ color: colors.grey[600], fontSize: 20 }} />
            <Box display="flex" gap={1} flexWrap="wrap" justifyContent="center">
              <StatusChip label="Normal" color="#4ade80" />
              <StatusChip label="Warning" color="#f59e0b" />
              <StatusChip label="Fault" color="#ef4444" />
              <StatusChip label="Critical" color="#dc2626" />
            </Box>
          </Box>
        </Box>
      </SectionCard>

      {/* ═══ SECTION 2: ASSESSMENT INPUTS ═══ */}
      <Box display="grid" gridTemplateColumns="repeat(auto-fit, minmax(220px, 1fr))" gap="12px" mb="12px">
        {INPUT_CATEGORIES.map(cat => (
          <Box key={cat.title} sx={{
            p: 2, borderRadius: "12px", backgroundColor: colors.primary[400],
            border: `1px solid ${cat.color}25`,
          }}>
            <Box display="flex" alignItems="center" gap={1} mb={1}>
              {cat.icon}
              <Typography variant="body2" fontWeight="700" color={cat.color}>{cat.title}</Typography>
            </Box>
            {cat.items.map(item => (
              <Typography key={item} variant="caption" color={colors.grey[300]} display="block"
                sx={{ py: 0.2, pl: 1, borderLeft: `2px solid ${cat.color}30` }}>
                {item}
              </Typography>
            ))}
          </Box>
        ))}
      </Box>

      {/* ═══ SECTION 3: NORMAL BASELINE + FAULT CLASSIFICATION ═══ */}
      <Box display="flex" gap="12px" flexWrap="wrap" mb="12px">
        <SectionCard
          title="Normal Operating Profile"
          subtitle="Expected baseline parameters for a healthy meter"
          icon={<CheckCircleIcon sx={{ color: "#4ade80", fontSize: 24 }} />}
          sx={{ flex: 1, minWidth: "320px" }}
        >
          <Box sx={{ borderRadius: "8px", overflow: "hidden" }}>
            {BASELINE_PARAMS.map((p, i) => (
              <Box key={p.parameter} display="flex" justifyContent="space-between" alignItems="center"
                sx={{ px: 1.5, py: 1, backgroundColor: i % 2 === 0 ? colors.primary[500] : "transparent" }}>
                <Typography variant="body2" color={colors.grey[200]} fontWeight={500}>{p.parameter}</Typography>
                <Typography variant="body2" color="#4ade80" fontWeight={600}>{p.expected}</Typography>
              </Box>
            ))}
          </Box>

          <Typography variant="caption" color={colors.grey[400]} mt={2} display="block" fontWeight={600}>
            Health Profile: Normal vs Faulty Meter
          </Typography>
          <Box height="220px" mt={0.5}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={RADAR_DATA}>
                <PolarGrid stroke={isDark ? "#334155" : "#D1D5DB"} />
                <PolarAngleAxis dataKey="metric" tick={{ fill: colors.grey[300], fontSize: 10 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: colors.grey[500], fontSize: 9 }} />
                <Radar name="Normal" dataKey="normal" stroke="#4ade80" fill="#4ade80" fillOpacity={0.15} strokeWidth={2} />
                <Radar name="Faulty" dataKey="faulty" stroke="#ef4444" fill="#ef4444" fillOpacity={0.15} strokeWidth={2} />
                <Legend wrapperStyle={{ fontSize: 11, color: colors.grey[300] }} />
              </RadarChart>
            </ResponsiveContainer>
          </Box>
        </SectionCard>

        <SectionCard
          title="Fault Classification Framework"
          subtitle="Simultaneous multi-category evaluation"
          icon={<WarningAmberIcon sx={{ color: "#f59e0b", fontSize: 24 }} />}
          sx={{ flex: 1, minWidth: "320px" }}
        >
          <Box display="flex" flexDirection="column" alignItems="center" gap={0.5} mb={2}>
            <FlowStep label="Meter" color="#6366f1"
              icon={<ElectricMeterIcon sx={{ color: "#6366f1", fontSize: 18 }} />} />
            <KeyboardDoubleArrowDownIcon sx={{ color: colors.grey[600], fontSize: 18 }} />
            <Box display="flex" gap={1} flexWrap="wrap" justifyContent="center">
              <FlowStep label="Electrical" color="#f59e0b"
                icon={<BoltIcon sx={{ color: "#f59e0b", fontSize: 16 }} />} />
              <FlowStep label="Communication" color="#06b6d4"
                icon={<CellTowerIcon sx={{ color: "#06b6d4", fontSize: 16 }} />} />
              <FlowStep label="Tamper" color="#ef4444"
                icon={<SecurityIcon sx={{ color: "#ef4444", fontSize: 16 }} />} />
            </Box>
            <KeyboardDoubleArrowDownIcon sx={{ color: colors.grey[600], fontSize: 18 }} />
            <FlowStep label="Overall Meter Score" color="#4ade80"
              icon={<SpeedIcon sx={{ color: "#4ade80", fontSize: 18 }} />} />
          </Box>

          <Typography variant="caption" color={colors.grey[400]} fontWeight={600} mb={1} display="block">
            Health Score Classification
          </Typography>
          {HEALTH_SCALE.map(s => (
            <Box key={s.label} display="flex" alignItems="center" gap={1.5} mb={0.8}>
              <Box sx={{
                width: 28, height: 28, borderRadius: "6px", backgroundColor: `${s.color}20`,
                display: "flex", alignItems: "center", justifyContent: "center", color: s.color,
              }}>
                {s.icon}
              </Box>
              <Box flex={1}>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2" fontWeight="600" color={s.color}>{s.label}</Typography>
                  <Typography variant="caption" color={colors.grey[400]}>{s.range}</Typography>
                </Box>
                <LinearProgress variant="determinate" value={s.pct}
                  sx={{
                    height: 4, borderRadius: 2, backgroundColor: colors.primary[500],
                    "& .MuiLinearProgress-bar": { borderRadius: 2, backgroundColor: s.color },
                  }} />
              </Box>
            </Box>
          ))}

          <Typography variant="caption" color={colors.grey[400]} fontWeight={600} mt={2} mb={0.5} display="block">
            Electrical Fault Indicators
          </Typography>
          <Box display="grid" gridTemplateColumns="1fr 1fr" gap="6px">
            {FAULT_INDICATORS.map(fi => (
              <Box key={fi.category} sx={{
                p: 1, borderRadius: "8px", backgroundColor: colors.primary[500],
                borderLeft: `3px solid ${fi.color}`,
              }}>
                <Typography variant="caption" fontWeight="700" color={fi.color} mb={0.3} display="block">
                  {fi.category}
                </Typography>
                {fi.indicators.map(ind => (
                  <Typography key={ind} variant="caption" color={colors.grey[400]} display="block" fontSize="0.65rem">
                    &bull; {ind}
                  </Typography>
                ))}
              </Box>
            ))}
          </Box>
        </SectionCard>
      </Box>

      {/* ═══ SECTION 4: TAMPER RISK ASSESSMENT ═══ */}
      <SectionCard
        title="Tamper Risk Assessment"
        subtitle="Continuous evaluation of whether meter behaviour matches legitimate customer installation"
        icon={<GppBadIcon sx={{ color: "#ef4444", fontSize: 24 }} />}
        sx={{ mb: "12px" }}
      >
        <Box display="flex" gap="12px" flexWrap="wrap">
          <Box flex={1} minWidth="300px">
            {TAMPER_INDICATORS.map(ti => (
              <Box key={ti.title} sx={{
                mb: 1, p: 1.5, borderRadius: "10px", backgroundColor: colors.primary[500],
                borderLeft: `3px solid ${ti.color}`,
              }}>
                <Typography variant="body2" fontWeight="600" color={ti.color} mb={0.5}>{ti.title}</Typography>
                {ti.normal && (
                  <Box display="flex" gap={0.5} alignItems="center" mb={0.3}>
                    <CheckCircleIcon sx={{ fontSize: 12, color: "#4ade80" }} />
                    <Typography variant="caption" color={colors.grey[400]}>Expected: {ti.normal}</Typography>
                  </Box>
                )}
                <Box display="flex" gap={0.5} alignItems="center">
                  <WarningAmberIcon sx={{ fontSize: 12, color: "#ef4444" }} />
                  <Typography variant="caption" color="#ef4444">Suspicious: {ti.suspicious}</Typography>
                </Box>
              </Box>
            ))}
          </Box>

          <Box flex={1} minWidth="300px">
            <Typography variant="caption" color={colors.grey[400]} fontWeight={600} mb={1} display="block">
              Meter Risk Matrix
            </Typography>
            <Box sx={{
              display: "grid", gridTemplateColumns: "80px 1fr 1fr", gridTemplateRows: "30px 1fr 1fr",
              gap: "4px", mb: 2, maxWidth: 360,
            }}>
              <Box />
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Typography variant="caption" fontWeight="600" color={colors.grey[300]}>Low Tamper Risk</Typography>
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Typography variant="caption" fontWeight="600" color={colors.grey[300]}>High Tamper Risk</Typography>
              </Box>
              <Box sx={{
                display: "flex", alignItems: "center", justifyContent: "center",
                writingMode: "vertical-lr", transform: "rotate(180deg)",
              }}>
                <Typography variant="caption" fontWeight="600" color={colors.grey[300]}>Healthy</Typography>
              </Box>
              <Box sx={{
                backgroundColor: "#4ade8015", border: "1px solid #4ade8040", borderRadius: "8px",
                display: "flex", alignItems: "center", justifyContent: "center", p: 2, minHeight: 60,
              }}>
                <Typography variant="body2" fontWeight="700" color="#4ade80">Normal</Typography>
              </Box>
              <Box sx={{
                backgroundColor: "#f59e0b15", border: "1px solid #f59e0b40", borderRadius: "8px",
                display: "flex", alignItems: "center", justifyContent: "center", p: 2, minHeight: 60,
              }}>
                <Typography variant="body2" fontWeight="700" color="#f59e0b">Monitor</Typography>
              </Box>
              <Box sx={{
                display: "flex", alignItems: "center", justifyContent: "center",
                writingMode: "vertical-lr", transform: "rotate(180deg)",
              }}>
                <Typography variant="caption" fontWeight="600" color={colors.grey[300]}>Poor Health</Typography>
              </Box>
              <Box sx={{
                backgroundColor: "#06b6d415", border: "1px solid #06b6d440", borderRadius: "8px",
                display: "flex", alignItems: "center", justifyContent: "center", p: 2, minHeight: 60,
              }}>
                <Typography variant="body2" fontWeight="700" color="#06b6d4">Service</Typography>
              </Box>
              <Box sx={{
                backgroundColor: "#ef444415", border: "1px solid #ef444440", borderRadius: "8px",
                display: "flex", alignItems: "center", justifyContent: "center", p: 2, minHeight: 60,
              }}>
                <Typography variant="body2" fontWeight="700" color="#ef4444">Investigate</Typography>
              </Box>
            </Box>

            <Typography variant="caption" color={colors.grey[400]} fontWeight={600} mb={1} display="block">
              Example Meter Assessments
            </Typography>
            <Box display="flex" gap={1} flexWrap="wrap">
              {EXAMPLE_METERS.map(m => (
                <Box key={m.id} sx={{
                  flex: 1, minWidth: "140px", p: 1.5, borderRadius: "10px",
                  backgroundColor: colors.primary[500], border: `1px solid ${m.statusColor}30`,
                }}>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                    <Typography variant="body2" fontWeight="700" color={colors.grey[100]}>
                      Meter {m.id}
                    </Typography>
                    <Chip label={m.status} size="small" sx={{
                      backgroundColor: `${m.statusColor}20`, color: m.statusColor,
                      fontWeight: 700, fontSize: "0.65rem", height: 22,
                    }} />
                  </Box>
                  {[
                    { label: "Electrical Health", value: m.electrical },
                    { label: "Communication", value: m.communication },
                    { label: "Tamper Risk", value: m.tamperRisk },
                  ].map(s => (
                    <Box key={s.label} display="flex" justifyContent="space-between" alignItems="center" mb={0.3}>
                      <Typography variant="caption" color={colors.grey[400]}>{s.label}</Typography>
                      <Typography variant="caption" fontWeight="700"
                        color={s.label === "Tamper Risk"
                          ? (s.value > 50 ? "#ef4444" : "#4ade80")
                          : (s.value >= 90 ? "#4ade80" : s.value >= 70 ? "#f59e0b" : "#ef4444")
                        }>{s.value}</Typography>
                    </Box>
                  ))}
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      </SectionCard>

      {/* ═══ SECTION 5: FLEET ANALYTICS (LIVE DATA) ═══ */}
      <SectionCard
        title="Fleet-Level Analytics"
        subtitle={fleetStats ? `${fleetStats.total} meters monitored in real-time` : "Loading fleet data..."}
        icon={<ElectricMeterIcon sx={{ color: "#06b6d4", fontSize: 24 }} />}
        sx={{ mb: "12px" }}
      >
        {fleetStats ? (
          <Box display="flex" gap="12px" flexWrap="wrap">
            <Box flex={1} minWidth="350px">
              <Box height="280px">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={fleetStats.distribution} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#334155" : "#D1D5DB"} />
                    <XAxis dataKey="category" stroke={colors.grey[400]} tick={{ fontSize: 11 }} />
                    <YAxis stroke={colors.grey[400]} tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: colors.primary[500],
                        border: `1px solid ${colors.grey[600]}`, borderRadius: 8,
                      }}
                      labelStyle={{ color: colors.grey[200] }}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                      {fleetStats.distribution.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </Box>

            <Box flex="0 0 auto" minWidth="200px" display="flex" flexDirection="column" gap={1}>
              {fleetStats.distribution.map(d => (
                <Box key={d.category} sx={{
                  p: 1.5, borderRadius: "10px", backgroundColor: colors.primary[500],
                  borderLeft: `4px solid ${d.color}`,
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <Typography variant="body2" color={colors.grey[300]}>{d.category}</Typography>
                  <Typography variant="h5" fontWeight="700" color={d.color}>
                    {d.count.toLocaleString()}
                  </Typography>
                </Box>
              ))}
              <Box sx={{
                p: 1.5, borderRadius: "10px", backgroundColor: colors.primary[500],
                borderLeft: "4px solid #6366f1",
              }}>
                <Typography variant="caption" color={colors.grey[400]}>Total Fleet</Typography>
                <Typography variant="h4" fontWeight="700" color="#6366f1">
                  {fleetStats.total.toLocaleString()}
                </Typography>
              </Box>
            </Box>
          </Box>
        ) : (
          <Box display="flex" justifyContent="center" py={4}>
            <Typography variant="body2" color={colors.grey[400]}>Loading fleet data...</Typography>
          </Box>
        )}
      </SectionCard>

      {/* ═══ SECTION 6: INVESTIGATION PRIORITY (LIVE DATA) ═══ */}
      {priorityMeters.length > 0 && (
        <SectionCard
          title="Field Investigation Priority"
          subtitle="Meters ranked by health score — not every alarm requires a technician"
          icon={<SearchIcon sx={{ color: "#f59e0b", fontSize: 24 }} />}
          sx={{ mb: "12px" }}
        >
          <Box sx={{ borderRadius: "8px", overflow: "hidden" }}>
            <Box display="grid" gridTemplateColumns="1.2fr 1.5fr 0.8fr 0.8fr 1.2fr" gap={0.5}
              sx={{ px: 1.5, py: 1, backgroundColor: colors.primary[500] }}>
              {["Meter", "Health Score", "Voltage", "Power", "Action"].map(h => (
                <Typography key={h} variant="caption" fontWeight="700" color={colors.grey[300]}>{h}</Typography>
              ))}
            </Box>
            {priorityMeters.map((m, i) => {
              const action = getActionForScore(m.healthScore);
              return (
                <Box key={m.drn} display="grid" gridTemplateColumns="1.2fr 1.5fr 0.8fr 0.8fr 1.2fr"
                  gap={0.5} alignItems="center"
                  sx={{
                    px: 1.5, py: 0.8,
                    backgroundColor: i % 2 === 0 ? "transparent" : `${colors.primary[500]}60`,
                  }}>
                  <Typography variant="caption" color={colors.grey[200]} fontWeight={500}>
                    {m.drn}
                  </Typography>
                  <Box display="flex" alignItems="center" gap={0.5}>
                    <Box sx={{
                      width: 26, height: 26, borderRadius: "50%",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      backgroundColor: `${action.color}20`,
                    }}>
                      <Typography variant="caption" fontWeight="700" color={action.color} fontSize="0.6rem">
                        {m.healthScore}
                      </Typography>
                    </Box>
                    <LinearProgress variant="determinate" value={m.healthScore}
                      sx={{
                        flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.primary[500],
                        "& .MuiLinearProgress-bar": { borderRadius: 2, backgroundColor: action.color },
                      }} />
                  </Box>
                  <Typography variant="caption" color={colors.grey[400]}>
                    {m.avgVoltage > 0 ? `${m.avgVoltage.toFixed(0)}V` : "—"}
                  </Typography>
                  <Typography variant="caption" color={colors.grey[400]}>
                    {m.avgPower > 0 ? `${m.avgPower.toFixed(0)}W` : "—"}
                  </Typography>
                  <Box display="flex" alignItems="center" gap={0.5}>
                    {action.icon}
                    <Typography variant="caption" fontWeight="600" color={action.color}>
                      {action.label}
                    </Typography>
                  </Box>
                </Box>
              );
            })}
          </Box>
        </SectionCard>
      )}

      {/* ═══ SECTION 7: FAULT DETECTION WORKFLOW ═══ */}
      <SectionCard
        title="Fault Detection Workflow"
        subtitle="How GRIDx classifies critical faults from multiple indicators"
        icon={<NotificationsActiveIcon sx={{ color: "#ef4444", fontSize: 24 }} />}
        sx={{ mb: "12px" }}
      >
        <Box display="flex" justifyContent="center">
          <Box display="flex" flexDirection="column" alignItems="center" gap={0.3} py={1}>
            {[
              { label: "Voltage Drop Detected", color: "#f59e0b" },
              { label: "Current Distortion", color: "#06b6d4" },
              { label: "High Temperature", color: "#ef4444" },
              { label: "Communication Failure", color: "#a78bfa" },
            ].map((step, i) => (
              <Box key={step.label}>
                <Box sx={{
                  px: 3, py: 1, borderRadius: "8px", border: `1px solid ${step.color}40`,
                  backgroundColor: `${step.color}10`, textAlign: "center", minWidth: 240,
                }}>
                  <Typography variant="body2" fontWeight="600" color={step.color}>{step.label}</Typography>
                </Box>
                {i < 3 && (
                  <Box display="flex" justifyContent="center">
                    <Typography variant="body2" color={colors.grey[600]} fontWeight="700">+</Typography>
                  </Box>
                )}
              </Box>
            ))}
            <KeyboardDoubleArrowDownIcon sx={{ color: colors.grey[500], fontSize: 24, my: 0.5 }} />
            <Box sx={{
              px: 3, py: 1.5, borderRadius: "10px", backgroundColor: "#ef444420",
              border: "2px solid #ef4444", textAlign: "center", minWidth: 240,
            }}>
              <Typography variant="h6" fontWeight="700" color="#ef4444">Meter Risk Score = 96%</Typography>
            </Box>
            <KeyboardDoubleArrowDownIcon sx={{ color: colors.grey[500], fontSize: 24, my: 0.5 }} />
            <Box sx={{
              px: 3, py: 1, borderRadius: "10px", backgroundColor: "#dc262620",
              border: "2px solid #dc2626", textAlign: "center", minWidth: 240,
            }}>
              <Typography variant="body1" fontWeight="700" color="#dc2626">CRITICAL FAULT</Typography>
            </Box>
            <KeyboardDoubleArrowDownIcon sx={{ color: colors.grey[500], fontSize: 24, my: 0.5 }} />
            <Box sx={{
              px: 3, py: 1, borderRadius: "10px", backgroundColor: "#f59e0b20",
              border: "1px solid #f59e0b", textAlign: "center", minWidth: 240,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 1,
            }}>
              <NotificationsActiveIcon sx={{ color: "#f59e0b", fontSize: 20 }} />
              <Typography variant="body2" fontWeight="700" color="#f59e0b">Automatic Alert Generated</Typography>
            </Box>
          </Box>
        </Box>
      </SectionCard>

      {/* ═══ SECTION 8: BUSINESS OUTCOME ═══ */}
      <SectionCard
        title="Business Outcome"
        subtitle="Identifying operational and financial risks before they escalate"
        icon={<ShieldIcon sx={{ color: "#4ade80", fontSize: 24 }} />}
      >
        <Typography variant="body2" color={colors.grey[300]} mb={2}>
          The purpose of the analytics engine is to identify faulty meters, tampered meters,
          communication failures, meter drift, revenue loss risks, and emerging network problems
          &mdash; before they become operational or financial issues.
        </Typography>
        <Box display="grid" gridTemplateColumns="repeat(auto-fit, minmax(160px, 1fr))" gap="10px">
          {BUSINESS_OUTCOMES.map(o => (
            <Box key={o.title} sx={{
              p: 2, borderRadius: "10px", backgroundColor: colors.primary[500],
              borderTop: `3px solid ${o.color}`, display: "flex", flexDirection: "column",
              alignItems: "center", gap: 0.5, textAlign: "center",
            }}>
              <Box sx={{ color: o.color, "& .MuiSvgIcon-root": { fontSize: 28 } }}>{o.icon}</Box>
              <Typography variant="body2" fontWeight="700" color={colors.grey[100]}>{o.title}</Typography>
              <Typography variant="caption" color={colors.grey[400]} fontSize="0.65rem">{o.desc}</Typography>
            </Box>
          ))}
        </Box>
      </SectionCard>
    </Box>
  );
}
