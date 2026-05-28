import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Box,
  Typography,
  CircularProgress,
  Tooltip,
  Chip,
} from "@mui/material";
import {
  BoltOutlined,
  SolarPowerOutlined,
  ElectricMeterOutlined,
  SpeedOutlined,
  TrendingUpOutlined,
  TrendingDownOutlined,
  PowerOutlined,
  CellTowerOutlined,
  WifiOutlined,
  WifiOffOutlined,
} from "@mui/icons-material";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip as RTooltip, Cell, PieChart, Pie, LineChart, Line, Legend,
  AreaChart, Area,
} from "recharts";
import { energyAnalyticsAPI } from "../services/api";

const COLORS = {
  importing: "#f59e0b",
  exporting: "#22c55e",
  primary: "#3b82f6",
  danger: "#ef4444",
  purple: "#8b5cf6",
  cyan: "#06b6d4",
  card: "rgba(10, 22, 40, 0.85)",
  cardBorder: "rgba(255,255,255,0.06)",
  text: "#e2e8f0",
  textMuted: "#94a3b8",
  glow: {
    green: "0 0 20px rgba(34,197,94,0.3)",
    orange: "0 0 20px rgba(245,158,11,0.3)",
    blue: "0 0 20px rgba(59,130,246,0.3)",
    purple: "0 0 20px rgba(139,92,246,0.3)",
  },
};

function formatPower(watts) {
  if (Math.abs(watts) >= 1000000) return (watts / 1000000).toFixed(2) + " MW";
  if (Math.abs(watts) >= 1000) return (watts / 1000).toFixed(2) + " kW";
  return watts.toFixed(1) + " W";
}

function formatEnergy(wh) {
  if (Math.abs(wh) >= 1000000) return (wh / 1000000).toFixed(2) + " MWh";
  if (Math.abs(wh) >= 1000) return (wh / 1000).toFixed(2) + " kWh";
  return wh.toFixed(1) + " Wh";
}

function StatCard({ icon, label, value, sublabel, color, glow }) {
  return (
    <Box sx={{
      bgcolor: COLORS.card,
      border: `1px solid ${COLORS.cardBorder}`,
      borderRadius: "12px",
      p: "14px 16px",
      minWidth: 0,
      flex: 1,
      boxShadow: glow || "none",
      transition: "box-shadow 0.3s",
      "&:hover": { boxShadow: glow ? glow.replace("0.3", "0.5") : COLORS.glow.blue },
    }}>
      <Box display="flex" alignItems="center" gap="8px" mb="6px">
        <Box sx={{
          width: 32, height: 32, borderRadius: "8px",
          display: "flex", alignItems: "center", justifyContent: "center",
          bgcolor: `${color}15`,
        }}>
          {icon}
        </Box>
        <Typography variant="caption" color={COLORS.textMuted} fontSize="10px" fontWeight={500} textTransform="uppercase" letterSpacing="0.5px">
          {label}
        </Typography>
      </Box>
      <Typography variant="h5" color={color || COLORS.text} fontWeight={700} fontSize="20px" lineHeight={1.2}>
        {value}
      </Typography>
      {sublabel && (
        <Typography variant="caption" color={COLORS.textMuted} fontSize="10px" mt="2px" display="block">
          {sublabel}
        </Typography>
      )}
    </Box>
  );
}

function RegionCard({ region, onHover }) {
  const isExporting = region.energy.direction === "net_exporting";
  const netPower = region.power.total_active_power;
  const absNet = Math.abs(netPower);

  return (
    <Box
      onMouseEnter={() => onHover?.(region.region)}
      onMouseLeave={() => onHover?.(null)}
      sx={{
        bgcolor: COLORS.card,
        border: `1px solid ${COLORS.cardBorder}`,
        borderRadius: "12px",
        p: "14px",
        borderLeft: `3px solid ${isExporting ? COLORS.exporting : COLORS.importing}`,
        transition: "all 0.2s",
        cursor: "default",
        "&:hover": {
          bgcolor: "rgba(15, 30, 55, 0.95)",
          boxShadow: isExporting ? COLORS.glow.green : COLORS.glow.orange,
          transform: "translateY(-1px)",
        },
      }}
    >
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb="8px">
        <Box>
          <Typography variant="subtitle2" color={COLORS.text} fontWeight={700} fontSize="13px">
            {region.region}
          </Typography>
          <Box display="flex" gap="6px" mt="3px">
            <Chip
              icon={<WifiOutlined sx={{ fontSize: 10, color: "#22c55e !important" }} />}
              label={region.online}
              size="small"
              sx={{ height: 18, fontSize: 9, bgcolor: "rgba(34,197,94,0.12)", color: "#22c55e", "& .MuiChip-icon": { ml: "4px" } }}
            />
            <Chip
              icon={<WifiOffOutlined sx={{ fontSize: 10, color: "#ef4444 !important" }} />}
              label={region.offline}
              size="small"
              sx={{ height: 18, fontSize: 9, bgcolor: "rgba(239,68,68,0.12)", color: "#ef4444", "& .MuiChip-icon": { ml: "4px" } }}
            />
          </Box>
        </Box>
        <Box textAlign="right">
          <Box display="flex" alignItems="center" gap="3px" justifyContent="flex-end">
            {isExporting
              ? <TrendingUpOutlined sx={{ fontSize: 14, color: COLORS.exporting }} />
              : <TrendingDownOutlined sx={{ fontSize: 14, color: COLORS.importing }} />
            }
            <Typography variant="caption" color={isExporting ? COLORS.exporting : COLORS.importing} fontSize="10px" fontWeight={600}>
              {isExporting ? "EXPORTING" : "IMPORTING"}
            </Typography>
          </Box>
          <Typography variant="h6" color={isExporting ? COLORS.exporting : COLORS.importing} fontWeight={700} fontSize="16px">
            {formatPower(absNet)}
          </Typography>
        </Box>
      </Box>

      <Box display="grid" gridTemplateColumns="1fr 1fr 1fr" gap="8px" mt="6px">
        <Box>
          <Typography variant="caption" color={COLORS.textMuted} fontSize="9px" display="block">Voltage</Typography>
          <Typography variant="body2" color={COLORS.text} fontSize="12px" fontWeight={600}>
            {region.power.avg_voltage.toFixed(1)} V
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color={COLORS.textMuted} fontSize="9px" display="block">Power Factor</Typography>
          <Typography variant="body2" color={COLORS.text} fontSize="12px" fontWeight={600}>
            {region.power.avg_power_factor.toFixed(2)}
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color={COLORS.textMuted} fontSize="9px" display="block">Meters</Typography>
          <Typography variant="body2" color={COLORS.text} fontSize="12px" fontWeight={600}>
            {region.meterCount}
          </Typography>
        </Box>
      </Box>

      <Box display="flex" gap="8px" mt="8px" pt="8px" borderTop="1px solid rgba(255,255,255,0.05)">
        <Box flex={1}>
          <Typography variant="caption" color={COLORS.textMuted} fontSize="9px" display="block">Import</Typography>
          <Typography variant="body2" color={COLORS.importing} fontSize="11px" fontWeight={600}>
            {formatEnergy(region.energy.total_import_wh)}
          </Typography>
        </Box>
        <Box flex={1}>
          <Typography variant="caption" color={COLORS.textMuted} fontSize="9px" display="block">Export</Typography>
          <Typography variant="body2" color={COLORS.exporting} fontSize="11px" fontWeight={600}>
            {formatEnergy(region.energy.total_export_wh)}
          </Typography>
        </Box>
        <Box flex={1}>
          <Typography variant="caption" color={COLORS.textMuted} fontSize="9px" display="block">Net</Typography>
          <Typography variant="body2" color={isExporting ? COLORS.exporting : COLORS.importing} fontSize="11px" fontWeight={600}>
            {formatEnergy(Math.abs(region.energy.net_energy_wh))}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

function CustomChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <Box sx={{
      bgcolor: "rgba(10,20,40,0.95)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: "8px",
      p: "8px 12px",
      backdropFilter: "blur(10px)",
    }}>
      <Typography variant="caption" color="#e2e8f0" fontSize="11px" fontWeight={600} display="block" mb="4px">
        {label}
      </Typography>
      {payload.map((entry, i) => (
        <Box key={i} display="flex" alignItems="center" gap="6px">
          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: entry.color }} />
          <Typography variant="caption" color="#94a3b8" fontSize="10px">
            {entry.name}: <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{typeof entry.value === "number" ? formatPower(entry.value) : entry.value}</span>
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

export default function EnergyAnalytics() {
  const [loading, setLoading] = useState(true);
  const [regions, setRegions] = useState([]);
  const [substationConfig, setSubstationConfig] = useState([]);
  const [powerFlow, setPowerFlow] = useState([]);
  const [hoveredRegion, setHoveredRegion] = useState(null);
  const sseRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [regRes, subRes, pfRes] = await Promise.allSettled([
        energyAnalyticsAPI.getRegionalSummary(),
        energyAnalyticsAPI.getSubstationConfig(),
        energyAnalyticsAPI.getPowerFlow(),
      ]);
      if (regRes.status === "fulfilled") setRegions(Array.isArray(regRes.value) ? regRes.value : []);
      if (subRes.status === "fulfilled") setSubstationConfig(Array.isArray(subRes.value) ? subRes.value : []);
      if (pfRes.status === "fulfilled") setPowerFlow(Array.isArray(pfRes.value) ? pfRes.value : []);
    } catch (err) {
      console.error("[EnergyAnalytics] fetch error:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // SSE for real-time updates
  useEffect(() => {
    const API_BASE = import.meta.env.VITE_API_BASE_URL || '/cb';
    const token = sessionStorage.getItem('token');
    if (!token) return;

    const es = new EventSource(`${API_BASE}/energy-analytics/sse?token=${token}`);
    sseRef.current = es;

    es.addEventListener('power-update', (e) => {
      try {
        const updates = JSON.parse(e.data);
        setPowerFlow(prev => {
          const map = {};
          prev.forEach(m => { map[m.drn] = m; });
          updates.forEach(u => {
            if (map[u.drn]) {
              map[u.drn] = { ...map[u.drn], ...u };
            }
          });
          return Object.values(map);
        });
      } catch {}
    });

    return () => {
      es.close();
      sseRef.current = null;
    };
  }, []);

  // Aggregate stats
  const stats = useMemo(() => {
    const totalMeters = regions.reduce((a, r) => a + r.meterCount, 0);
    const onlineMeters = regions.reduce((a, r) => a + r.online, 0);
    const offlineMeters = regions.reduce((a, r) => a + r.offline, 0);
    const totalLoad = regions.reduce((a, r) => a + Math.max(0, r.power.total_active_power), 0);
    const totalExport = regions.reduce((a, r) => a + Math.max(0, -r.power.total_active_power), 0);
    const totalImportEnergy = regions.reduce((a, r) => a + r.energy.total_import_wh, 0);
    const totalExportEnergy = regions.reduce((a, r) => a + r.energy.total_export_wh, 0);
    const netEnergy = totalImportEnergy - totalExportEnergy;

    const voltages = regions.filter(r => r.power.avg_voltage > 0).map(r => r.power.avg_voltage);
    const avgVoltage = voltages.length ? voltages.reduce((a, b) => a + b, 0) / voltages.length : 0;

    const pfs = regions.filter(r => r.power.avg_power_factor > 0).map(r => r.power.avg_power_factor);
    const avgPF = pfs.length ? pfs.reduce((a, b) => a + b, 0) / pfs.length : 0;

    const peakDemand = regions.reduce((a, r) => a + Math.abs(r.power.total_active_power), 0);

    return {
      totalMeters, onlineMeters, offlineMeters,
      totalLoad, totalExport,
      totalImportEnergy, totalExportEnergy, netEnergy,
      avgVoltage, avgPF, peakDemand,
      netDirection: netEnergy >= 0 ? "Net Importing" : "Net Exporting",
    };
  }, [regions]);

  // Chart data
  const regionBarData = useMemo(() =>
    regions.map(r => ({
      name: r.region.length > 12 ? r.region.substring(0, 12) + "..." : r.region,
      fullName: r.region,
      import: Math.max(0, r.power.total_active_power),
      export: Math.abs(Math.min(0, r.power.total_active_power)),
      meters: r.meterCount,
    })).sort((a, b) => (b.import + b.export) - (a.import + a.export)),
  [regions]);

  const energyPieData = useMemo(() => [
    { name: "Import", value: stats.totalImportEnergy, color: COLORS.importing },
    { name: "Export", value: stats.totalExportEnergy, color: COLORS.exporting },
  ], [stats]);

  const meterDistribution = useMemo(() =>
    regions.map(r => ({
      name: r.region.length > 10 ? r.region.substring(0, 10) + "..." : r.region,
      fullName: r.region,
      online: r.online,
      offline: r.offline,
    })),
  [regions]);

  // Power flow direction summary
  const flowSummary = useMemo(() => {
    const importing = powerFlow.filter(m => m.direction === "importing").length;
    const exporting = powerFlow.filter(m => m.direction === "exporting").length;
    return { importing, exporting, total: powerFlow.length };
  }, [powerFlow]);

  // Substation hierarchy
  const primarySubs = useMemo(() => substationConfig.filter(s => s.type === "primary"), [substationConfig]);
  const distSubs = useMemo(() => substationConfig.filter(s => s.type === "distribution"), [substationConfig]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" py="40px">
        <CircularProgress size={28} sx={{ color: COLORS.primary }} />
        <Typography variant="caption" color={COLORS.textMuted} ml="12px">Loading energy analytics...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ mt: "16px" }}>
      {/* Section Header */}
      <Box display="flex" alignItems="center" gap="10px" mb="16px">
        <Box sx={{
          width: 36, height: 36, borderRadius: "10px",
          bgcolor: "rgba(59,130,246,0.15)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <BoltOutlined sx={{ color: COLORS.primary, fontSize: 20 }} />
        </Box>
        <Box>
          <Typography variant="h6" color={COLORS.text} fontWeight={700} fontSize="15px" lineHeight={1.2}>
            Real-Time Energy Analytics
          </Typography>
          <Typography variant="caption" color={COLORS.textMuted} fontSize="10px">
            Regional power distribution and net metering flow
          </Typography>
        </Box>
        <Box ml="auto" display="flex" alignItems="center" gap="8px">
          <Box sx={{
            width: 8, height: 8, borderRadius: "50%",
            bgcolor: "#22c55e",
            animation: "pulse 2s infinite",
            "@keyframes pulse": {
              "0%, 100%": { opacity: 1, boxShadow: "0 0 0 0 rgba(34,197,94,0.4)" },
              "50%": { opacity: 0.8, boxShadow: "0 0 0 6px rgba(34,197,94,0)" },
            },
          }} />
          <Typography variant="caption" color={COLORS.textMuted} fontSize="10px">
            Live — auto-refreshing every 15s
          </Typography>
        </Box>
      </Box>

      {/* Top Stats Row */}
      <Box display="grid" gridTemplateColumns="repeat(6, 1fr)" gap="10px" mb="16px">
        <StatCard
          icon={<BoltOutlined sx={{ fontSize: 16, color: COLORS.importing }} />}
          label="Total Grid Load"
          value={formatPower(stats.totalLoad)}
          sublabel={`${stats.onlineMeters} meters contributing`}
          color={COLORS.importing}
          glow={COLORS.glow.orange}
        />
        <StatCard
          icon={<SolarPowerOutlined sx={{ fontSize: 16, color: COLORS.exporting }} />}
          label="Solar Export"
          value={formatPower(stats.totalExport)}
          sublabel={`${flowSummary.exporting} meters exporting`}
          color={COLORS.exporting}
          glow={COLORS.glow.green}
        />
        <StatCard
          icon={<SpeedOutlined sx={{ fontSize: 16, color: COLORS.primary }} />}
          label="Peak Demand"
          value={formatPower(stats.peakDemand)}
          sublabel="Combined all regions"
          color={COLORS.primary}
          glow={COLORS.glow.blue}
        />
        <StatCard
          icon={<PowerOutlined sx={{ fontSize: 16, color: COLORS.cyan }} />}
          label="Avg Voltage"
          value={stats.avgVoltage.toFixed(1) + " V"}
          sublabel={`PF: ${stats.avgPF.toFixed(3)}`}
          color={COLORS.cyan}
        />
        <StatCard
          icon={<ElectricMeterOutlined sx={{ fontSize: 16, color: COLORS.purple }} />}
          label="Meters Online"
          value={`${stats.onlineMeters} / ${stats.totalMeters}`}
          sublabel={`${stats.offlineMeters} offline`}
          color={COLORS.purple}
          glow={COLORS.glow.purple}
        />
        <StatCard
          icon={stats.netEnergy >= 0
            ? <TrendingDownOutlined sx={{ fontSize: 16, color: COLORS.importing }} />
            : <TrendingUpOutlined sx={{ fontSize: 16, color: COLORS.exporting }} />}
          label="Net Status"
          value={stats.netDirection}
          sublabel={formatEnergy(Math.abs(stats.netEnergy))}
          color={stats.netEnergy >= 0 ? COLORS.importing : COLORS.exporting}
        />
      </Box>

      {/* Charts Row */}
      <Box display="grid" gridTemplateColumns="2fr 1fr 1fr" gap="12px" mb="16px">
        {/* Regional Power Chart */}
        <Box sx={{
          bgcolor: COLORS.card,
          border: `1px solid ${COLORS.cardBorder}`,
          borderRadius: "12px",
          p: "14px",
        }}>
          <Typography variant="subtitle2" color={COLORS.text} fontWeight={700} fontSize="12px" mb="12px">
            Regional Power Distribution
          </Typography>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={regionBarData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="name" tick={{ fill: COLORS.textMuted, fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: COLORS.textMuted, fontSize: 9 }} axisLine={false} tickLine={false}
                tickFormatter={(v) => v >= 1000 ? (v / 1000).toFixed(0) + "k" : v} />
              <RTooltip content={<CustomChartTooltip />} />
              <Bar dataKey="import" name="Consuming (W)" fill={COLORS.importing} radius={[4, 4, 0, 0]} />
              <Bar dataKey="export" name="Exporting (W)" fill={COLORS.exporting} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>

        {/* Import/Export Pie */}
        <Box sx={{
          bgcolor: COLORS.card,
          border: `1px solid ${COLORS.cardBorder}`,
          borderRadius: "12px",
          p: "14px",
        }}>
          <Typography variant="subtitle2" color={COLORS.text} fontWeight={700} fontSize="12px" mb="8px">
            Energy Balance
          </Typography>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={energyPieData}
                cx="50%" cy="50%"
                innerRadius={45} outerRadius={70}
                paddingAngle={3}
                dataKey="value"
                stroke="none"
              >
                {energyPieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <RTooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                return (
                  <Box sx={{ bgcolor: "rgba(10,20,40,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", p: "6px 10px" }}>
                    <Typography variant="caption" color={payload[0].payload.color} fontSize="11px" fontWeight={600}>
                      {payload[0].name}: {formatEnergy(payload[0].value)}
                    </Typography>
                  </Box>
                );
              }} />
            </PieChart>
          </ResponsiveContainer>
          <Box display="flex" justifyContent="center" gap="12px">
            {energyPieData.map((d, i) => (
              <Box key={i} display="flex" alignItems="center" gap="4px">
                <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: d.color }} />
                <Typography variant="caption" color={COLORS.textMuted} fontSize="9px">{d.name}</Typography>
              </Box>
            ))}
          </Box>
        </Box>

        {/* Meter Online/Offline per Region */}
        <Box sx={{
          bgcolor: COLORS.card,
          border: `1px solid ${COLORS.cardBorder}`,
          borderRadius: "12px",
          p: "14px",
        }}>
          <Typography variant="subtitle2" color={COLORS.text} fontWeight={700} fontSize="12px" mb="8px">
            Meter Status by Region
          </Typography>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={meterDistribution} layout="vertical" barGap={1}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
              <XAxis type="number" tick={{ fill: COLORS.textMuted, fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis dataKey="name" type="category" tick={{ fill: COLORS.textMuted, fontSize: 9 }} axisLine={false} tickLine={false} width={80} />
              <RTooltip content={<CustomChartTooltip />} />
              <Bar dataKey="online" name="Online" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} barSize={14} />
              <Bar dataKey="offline" name="Offline" stackId="a" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
          <Box display="flex" justifyContent="center" gap="12px">
            <Box display="flex" alignItems="center" gap="4px">
              <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#22c55e" }} />
              <Typography variant="caption" color={COLORS.textMuted} fontSize="9px">Online</Typography>
            </Box>
            <Box display="flex" alignItems="center" gap="4px">
              <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#ef4444" }} />
              <Typography variant="caption" color={COLORS.textMuted} fontSize="9px">Offline</Typography>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Substation Grid Topology */}
      <Box sx={{
        bgcolor: COLORS.card,
        border: `1px solid ${COLORS.cardBorder}`,
        borderRadius: "12px",
        p: "14px",
        mb: "16px",
      }}>
        <Typography variant="subtitle2" color={COLORS.text} fontWeight={700} fontSize="12px" mb="12px" display="flex" alignItems="center" gap="6px">
          <CellTowerOutlined sx={{ fontSize: 16, color: COLORS.primary }} />
          Grid Topology — Substation Hierarchy
        </Typography>
        <Box display="flex" gap="20px" justifyContent="center" flexWrap="wrap">
          {primarySubs.map(ps => {
            const children = distSubs.filter(d => d.parent_substation_id === ps.id);
            return (
              <Box key={ps.id} textAlign="center">
                <Tooltip title={`${ps.name} — Primary Substation`} arrow>
                  <Box sx={{
                    bgcolor: "rgba(59,130,246,0.15)",
                    border: "2px solid rgba(59,130,246,0.4)",
                    borderRadius: "12px",
                    p: "10px 18px",
                    mb: "8px",
                    cursor: "default",
                    transition: "all 0.2s",
                    "&:hover": { bgcolor: "rgba(59,130,246,0.25)", boxShadow: COLORS.glow.blue },
                  }}>
                    <Typography variant="caption" color={COLORS.primary} fontWeight={700} fontSize="11px">
                      {ps.name}
                    </Typography>
                    <Typography variant="caption" color={COLORS.textMuted} fontSize="9px" display="block">
                      Primary Substation
                    </Typography>
                  </Box>
                </Tooltip>
                {children.length > 0 && (
                  <Box sx={{
                    borderLeft: `1px dashed rgba(59,130,246,0.3)`,
                    ml: "50%",
                    pl: 0,
                  }}>
                    <Box display="flex" flexWrap="wrap" gap="6px" justifyContent="center" ml="-50%" width="200%">
                      {children.map(ch => {
                        const regionData = regions.find(r =>
                          r.region.toLowerCase().includes(ch.district.toLowerCase()) ||
                          ch.district.toLowerCase().includes(r.region.toLowerCase())
                        );
                        const isExp = regionData?.energy?.direction === "net_exporting";
                        return (
                          <Tooltip
                            key={ch.id}
                            arrow
                            title={
                              <Box p="4px">
                                <Typography fontSize="11px" fontWeight={700}>{ch.name}</Typography>
                                <Typography fontSize="10px" color="#94a3b8">District: {ch.district}</Typography>
                                {regionData && (
                                  <>
                                    <Typography fontSize="10px" color="#94a3b8">
                                      Power: {formatPower(Math.abs(regionData.power.total_active_power))}
                                      {isExp ? " (exporting)" : " (consuming)"}
                                    </Typography>
                                    <Typography fontSize="10px" color="#94a3b8">
                                      Meters: {regionData.meterCount} ({regionData.online} online)
                                    </Typography>
                                  </>
                                )}
                              </Box>
                            }
                          >
                            <Box sx={{
                              bgcolor: regionData
                                ? isExp ? "rgba(34,197,94,0.1)" : "rgba(245,158,11,0.1)"
                                : "rgba(100,100,120,0.1)",
                              border: `1px solid ${regionData
                                ? isExp ? "rgba(34,197,94,0.3)" : "rgba(245,158,11,0.3)"
                                : "rgba(100,100,120,0.2)"}`,
                              borderRadius: "8px",
                              p: "6px 10px",
                              cursor: "default",
                              transition: "all 0.2s",
                              "&:hover": {
                                transform: "translateY(-1px)",
                                boxShadow: regionData
                                  ? isExp ? COLORS.glow.green : COLORS.glow.orange
                                  : "none",
                              },
                            }}>
                              <Typography variant="caption" color={COLORS.text} fontWeight={600} fontSize="10px">
                                {ch.district}
                              </Typography>
                              {regionData && (
                                <Typography variant="caption" display="block" fontSize="9px"
                                  color={isExp ? COLORS.exporting : COLORS.importing}>
                                  {formatPower(Math.abs(regionData.power.total_active_power))}
                                  {isExp ? " ↑" : " ↓"}
                                </Typography>
                              )}
                            </Box>
                          </Tooltip>
                        );
                      })}
                    </Box>
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* Regional Breakdown Cards */}
      <Typography variant="subtitle2" color={COLORS.text} fontWeight={700} fontSize="12px" mb="10px" display="flex" alignItems="center" gap="6px">
        <ElectricMeterOutlined sx={{ fontSize: 16, color: COLORS.purple }} />
        Regional Breakdown
      </Typography>
      <Box display="grid" gridTemplateColumns="repeat(auto-fill, minmax(280px, 1fr))" gap="10px" mb="16px">
        {regions.map(r => (
          <RegionCard key={r.region} region={r} onHover={setHoveredRegion} />
        ))}
      </Box>

      {/* Power Flow Summary */}
      <Box sx={{
        bgcolor: COLORS.card,
        border: `1px solid ${COLORS.cardBorder}`,
        borderRadius: "12px",
        p: "14px",
        mb: "8px",
      }}>
        <Typography variant="subtitle2" color={COLORS.text} fontWeight={700} fontSize="12px" mb="10px">
          Power Flow Direction Summary
        </Typography>
        <Box display="flex" gap="12px" alignItems="center">
          <Box flex={1}>
            <Box display="flex" justifyContent="space-between" mb="4px">
              <Typography variant="caption" color={COLORS.importing} fontSize="10px" fontWeight={600}>
                Consuming from Grid ({flowSummary.importing})
              </Typography>
              <Typography variant="caption" color={COLORS.textMuted} fontSize="10px">
                {flowSummary.total > 0 ? ((flowSummary.importing / flowSummary.total) * 100).toFixed(0) : 0}%
              </Typography>
            </Box>
            <Box sx={{
              width: "100%", height: 8, bgcolor: "rgba(255,255,255,0.05)", borderRadius: 4, overflow: "hidden",
            }}>
              <Box sx={{
                width: flowSummary.total > 0 ? `${(flowSummary.importing / flowSummary.total) * 100}%` : "0%",
                height: "100%",
                bgcolor: COLORS.importing,
                borderRadius: 4,
                transition: "width 0.8s ease",
                boxShadow: `0 0 10px ${COLORS.importing}40`,
              }} />
            </Box>
          </Box>
          <Box sx={{
            width: 50, height: 50, borderRadius: "50%",
            border: "2px solid rgba(255,255,255,0.1)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <Typography variant="caption" color={COLORS.text} fontWeight={700} fontSize="11px">
              {flowSummary.total}
            </Typography>
          </Box>
          <Box flex={1}>
            <Box display="flex" justifyContent="space-between" mb="4px">
              <Typography variant="caption" color={COLORS.exporting} fontSize="10px" fontWeight={600}>
                Exporting to Grid ({flowSummary.exporting})
              </Typography>
              <Typography variant="caption" color={COLORS.textMuted} fontSize="10px">
                {flowSummary.total > 0 ? ((flowSummary.exporting / flowSummary.total) * 100).toFixed(0) : 0}%
              </Typography>
            </Box>
            <Box sx={{
              width: "100%", height: 8, bgcolor: "rgba(255,255,255,0.05)", borderRadius: 4, overflow: "hidden",
            }}>
              <Box sx={{
                width: flowSummary.total > 0 ? `${(flowSummary.exporting / flowSummary.total) * 100}%` : "0%",
                height: "100%",
                bgcolor: COLORS.exporting,
                borderRadius: 4,
                transition: "width 0.8s ease",
                boxShadow: `0 0 10px ${COLORS.exporting}40`,
              }} />
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

// Export map overlay helpers for use in GroupControl
export function getSubstationMarkers(substationConfig, regions) {
  return substationConfig.map(sub => {
    const regionData = regions.find(r =>
      r.region?.toLowerCase().includes(sub.district?.toLowerCase()) ||
      sub.district?.toLowerCase().includes(r.region?.toLowerCase())
    );
    const isExporting = regionData?.energy?.direction === "net_exporting";
    const isPrimary = sub.type === "primary";

    return {
      ...sub,
      regionData,
      isExporting,
      isPrimary,
      markerColor: isPrimary ? "#3b82f6" : isExporting ? "#22c55e" : "#f59e0b",
    };
  });
}

export function getConnectionLines(substationConfig, powerFlow) {
  const lines = [];

  // Distribution -> Primary connections
  substationConfig.forEach(sub => {
    if (sub.type === "distribution" && sub.parent_lat && sub.parent_lng) {
      lines.push({
        id: `sub-${sub.id}-parent`,
        from: { lat: sub.lat, lng: sub.lng },
        to: { lat: sub.parent_lat, lng: sub.parent_lng },
        type: "substation",
        weight: 3,
        color: "#3b82f680",
      });
    }
  });

  // Meter -> nearest distribution substation
  const distSubs = substationConfig.filter(s => s.type === "distribution");
  powerFlow.forEach(meter => {
    if (!meter.lat || !meter.lng) return;
    let nearest = null;
    let minDist = Infinity;
    distSubs.forEach(sub => {
      const d = Math.sqrt(Math.pow(meter.lat - sub.lat, 2) + Math.pow(meter.lng - sub.lng, 2));
      if (d < minDist) { minDist = d; nearest = sub; }
    });
    if (nearest && minDist < 0.05) {
      const isExporting = meter.direction === "exporting";
      lines.push({
        id: `meter-${meter.drn}-sub-${nearest.id}`,
        from: isExporting ? { lat: meter.lat, lng: meter.lng } : { lat: nearest.lat, lng: nearest.lng },
        to: isExporting ? { lat: nearest.lat, lng: nearest.lng } : { lat: meter.lat, lng: meter.lng },
        type: "meter",
        weight: Math.max(1, Math.min(4, Math.abs(meter.active_power) / 500)),
        color: isExporting ? "#22c55e60" : "#f59e0b60",
        direction: meter.direction,
        power: meter.active_power,
      });
    }
  });

  return lines;
}
