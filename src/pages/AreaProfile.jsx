import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Box,
  Typography,
  Chip,
  IconButton,
  CircularProgress,
  useTheme,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@mui/material";
import {
  ArrowBackOutlined,
  ElectricMeterOutlined,
  BoltOutlined,
  AttachMoneyOutlined,
  GroupWorkOutlined,
  FiberManualRecord,
  ScheduleOutlined,
} from "@mui/icons-material";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { tokens } from "../theme";
import { groupControlAPI, netMeteringAPI } from "../services/api";

const TARIFF_RETAIL = 2.45;
const TARIFF_COST = 1.60;

/** Safe number — returns 0 for NaN / null / undefined */
function safeNum(v, fallback = 0) {
  const n = parseFloat(v);
  return isNaN(n) || !isFinite(n) ? fallback : n;
}

export default function AreaProfile() {
  const { areaName } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const isDark = theme.palette.mode === "dark";

  const [loading, setLoading] = useState(true);
  const [allMeters, setAllMeters] = useState([]);
  const [groups, setGroups] = useState([]);
  const [dailyEnergyData, setDailyEnergyData] = useState([]);

  const decodedName = decodeURIComponent(areaName);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [metersRes, groupsRes, dashRes] = await Promise.allSettled([
        groupControlAPI.getMetersState(),
        groupControlAPI.getGroups(),
        netMeteringAPI.getDashboard("daily"),
      ]);
      if (metersRes.status === "fulfilled") {
        const d = metersRes.value?.data || metersRes.value || [];
        setAllMeters(Array.isArray(d) ? d : []);
      }
      if (groupsRes.status === "fulfilled") {
        const d = groupsRes.value?.data || groupsRes.value || [];
        setGroups(Array.isArray(d) ? d : []);
      }
      if (dashRes.status === "fulfilled") {
        const raw = dashRes.value?.data || dashRes.value || {};
        const daily = raw.daily || raw.data?.daily || [];
        setDailyEnergyData(Array.isArray(daily) ? daily : []);
      }
    } catch (err) {
      console.error("Fetch error:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const isOnline = (m) => m.Status === "1" || m.Status === 1 || m.Status === "Active";

  const areaMeters = useMemo(() =>
    allMeters.filter((m) => {
      const loc = (m.LocationName || m.Suburb || m.City || "").toLowerCase();
      return loc === decodedName.toLowerCase();
    }),
  [allMeters, decodedName]);

  const areaMeterDrns = useMemo(() => new Set(areaMeters.map((m) => m.DRN)), [areaMeters]);

  const areaGroups = useMemo(() =>
    groups.filter((g) => {
      const memberDrns = (g.members || g.meters || []).map((m) => m.DRN || m.meter_drn || m);
      return memberDrns.some((drn) => areaMeterDrns.has(drn));
    }),
  [groups, areaMeterDrns]);

  const onlineCount = useMemo(() => areaMeters.filter(isOnline).length, [areaMeters]);
  const offlineCount = areaMeters.length - onlineCount;

  const totalPower = useMemo(() =>
    areaMeters.reduce((s, m) => s + safeNum(m.active_power || m.ActivePower), 0),
  [areaMeters]);

  const totalUnits = useMemo(() =>
    areaMeters.reduce((s, m) => s + safeNum(m.CumulativeUnits || m.credit), 0),
  [areaMeters]);

  const estimatedRevenue = safeNum(totalUnits * TARIFF_RETAIL).toFixed(2);

  // --- Build weekly chart data from last 7 days of API daily data ---
  const weeklyData = useMemo(() => {
    if (!dailyEnergyData.length) return [];
    const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    // Sort by date descending, take last 7
    const sorted = [...dailyEnergyData]
      .sort((a, b) => new Date(b.date || b.label) - new Date(a.date || a.label))
      .slice(0, 7)
      .reverse();
    return sorted.map((d) => {
      const dt = new Date(d.date || d.label);
      return {
        day: DAYS[dt.getDay()] || d.label || "?",
        import: safeNum(d.import || d.total_import),
        export: safeNum(d.export || d.total_export),
      };
    });
  }, [dailyEnergyData]);

  // --- Build monthly chart data for current month from API daily data ---
  const monthlyData = useMemo(() => {
    if (!dailyEnergyData.length) return [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    return dailyEnergyData
      .filter((d) => {
        const dt = new Date(d.date || d.label);
        return dt.getFullYear() === currentYear && dt.getMonth() === currentMonth;
      })
      .sort((a, b) => new Date(a.date || a.label) - new Date(b.date || b.label))
      .map((d) => {
        const dt = new Date(d.date || d.label);
        return {
          day: String(dt.getDate()),
          import: safeNum(d.import || d.total_import),
          export: safeNum(d.export || d.total_export),
        };
      });
  }, [dailyEnergyData]);

  // --- Revenue chart data — per day in current month ---
  const revenueData = useMemo(() => {
    if (!monthlyData.length) return [];
    return monthlyData.map((d) => ({
      day: d.day,
      revenue: safeNum((safeNum(d.import) * TARIFF_RETAIL).toFixed(2)),
      cost: safeNum((safeNum(d.export) * TARIFF_COST).toFixed(2)),
    }));
  }, [monthlyData]);

  const isGroupActive = (g) => {
    const schedule = g.schedule || null;
    if (!schedule?.enabled || !schedule.periods) return false;
    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = now.getHours().toString().padStart(2, "0") + ":" + now.getMinutes().toString().padStart(2, "0");
    return schedule.periods.some(
      (p) => p.days?.includes(currentDay) && currentTime >= (p.startTime || "") && currentTime <= (p.endTime || "23:59")
    );
  };

  const cardBg = isDark ? colors.primary[400] : "#FFFFFF";
  const cardBorder = `1px solid ${isDark ? "#1E293B" : "#E5E7EB"}`;
  const headingColor = isDark ? colors.grey[100] : "#111827";
  const labelColor = isDark ? colors.grey[300] : "#6B7280";

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="80vh">
        <CircularProgress sx={{ color: "#2563EB" }} />
      </Box>
    );
  }

  return (
    <Box sx={{ bgcolor: isDark ? colors.primary[500] : "#F9FAFB", minHeight: "calc(100vh - 70px)" }}>

      {/* HEADER */}
      <Box sx={{ px: 3, pt: 2.5, pb: 2, display: "flex", alignItems: "center", gap: 2 }}>
        <IconButton
          onClick={() => navigate("/load-control")}
          sx={{ color: labelColor, border: cardBorder, borderRadius: "8px", width: 36, height: 36 }}
        >
          <ArrowBackOutlined sx={{ fontSize: 18 }} />
        </IconButton>
        <Typography variant="h4" fontWeight={700} color={headingColor}>
          {decodedName}
        </Typography>
        <Chip
          label={`${areaMeters.length} meter${areaMeters.length !== 1 ? "s" : ""}`}
          size="small"
          sx={{
            height: 24, fontSize: 11, fontWeight: 600,
            bgcolor: isDark ? "rgba(37,99,235,0.15)" : "#DBEAFE",
            color: "#2563EB",
          }}
        />
      </Box>

      {/* KPI CARDS */}
      <Box sx={{ px: 3, pb: 2, display: "flex", gap: 2, flexWrap: "wrap" }}>
        {[
          {
            label: "Total Meters",
            value: areaMeters.length,
            sub: `${onlineCount} online / ${offlineCount} offline`,
            icon: <ElectricMeterOutlined sx={{ fontSize: 20 }} />,
            iconBg: isDark ? "rgba(37,99,235,0.1)" : "#EFF6FF",
            iconColor: "#2563EB",
          },
          {
            label: "Total Power",
            value: `${safeNum(totalPower).toLocaleString()} W`,
            sub: "Active power consumption",
            icon: <BoltOutlined sx={{ fontSize: 20 }} />,
            iconBg: isDark ? "rgba(245,158,11,0.1)" : "#FFFBEB",
            iconColor: "#F59E0B",
          },
          {
            label: "Est. Revenue",
            value: `N$ ${safeNum(Number(estimatedRevenue)).toLocaleString()}`,
            sub: `@ ${TARIFF_RETAIL} N$/kWh`,
            icon: <AttachMoneyOutlined sx={{ fontSize: 20 }} />,
            iconBg: isDark ? "rgba(16,185,129,0.1)" : "#ECFDF5",
            iconColor: "#10B981",
          },
          {
            label: "Group Configs",
            value: areaGroups.length,
            sub: areaGroups.length > 0 ? areaGroups.map((g) => g.name).join(", ") : "No groups configured",
            icon: <GroupWorkOutlined sx={{ fontSize: 20 }} />,
            iconBg: isDark ? "rgba(139,92,246,0.1)" : "#F5F3FF",
            iconColor: "#8B5CF6",
          },
        ].map((kpi) => (
          <Box
            key={kpi.label}
            sx={{
              flex: "1 1 200px",
              bgcolor: cardBg,
              border: cardBorder,
              borderRadius: "12px",
              p: "16px 20px",
              display: "flex",
              alignItems: "center",
              gap: 2,
            }}
          >
            <Box sx={{ width: 40, height: 40, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: kpi.iconBg, color: kpi.iconColor }}>
              {kpi.icon}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h5" fontWeight={700} color={headingColor} noWrap>{kpi.value}</Typography>
              <Typography variant="caption" color={labelColor} fontSize={11}>{kpi.label}</Typography>
              <Typography variant="caption" display="block" color={labelColor} fontSize={10} noWrap>{kpi.sub}</Typography>
            </Box>
          </Box>
        ))}
      </Box>

      {/* CHARTS ROW */}
      <Box sx={{ px: 3, pb: 2, display: "flex", gap: 2, flexWrap: "wrap" }}>
        {/* Weekly */}
        <Box sx={{ flex: "1 1 380px", bgcolor: cardBg, border: cardBorder, borderRadius: "12px", p: "18px 22px" }}>
          <Typography variant="subtitle1" fontWeight={600} color={headingColor} mb={1.5}>
            Weekly Energy (Last 7 Days)
          </Typography>
          {weeklyData.length === 0 ? (
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: 280 }}>
              <Typography color={labelColor} fontSize={13}>No energy data available</Typography>
            </Box>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={weeklyData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#1E293B" : "#E5E7EB"} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: labelColor }} />
                <YAxis tick={{ fontSize: 11, fill: labelColor }} unit=" kWh" />
                <Tooltip contentStyle={{ backgroundColor: isDark ? "#1E293B" : "#fff", border: cardBorder, borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="import" name="Import" fill="#3B82F6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="export" name="Export" fill="#F59E0B" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Box>

        {/* Monthly */}
        <Box sx={{ flex: "1 1 380px", bgcolor: cardBg, border: cardBorder, borderRadius: "12px", p: "18px 22px" }}>
          <Typography variant="subtitle1" fontWeight={600} color={headingColor} mb={1.5}>
            Monthly Energy (Current Month)
          </Typography>
          {monthlyData.length === 0 ? (
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: 280 }}>
              <Typography color={labelColor} fontSize={13}>No energy data available</Typography>
            </Box>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#1E293B" : "#E5E7EB"} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: labelColor }} interval={2} />
                <YAxis tick={{ fontSize: 11, fill: labelColor }} unit=" kWh" />
                <Tooltip contentStyle={{ backgroundColor: isDark ? "#1E293B" : "#fff", border: cardBorder, borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="import" name="Import" fill="#3B82F6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="export" name="Export" fill="#F59E0B" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Box>
      </Box>

      {/* REVENUE CHART */}
      <Box sx={{ px: 3, pb: 2 }}>
        <Box sx={{ bgcolor: cardBg, border: cardBorder, borderRadius: "12px", p: "18px 22px" }}>
          <Typography variant="subtitle1" fontWeight={600} color={headingColor} mb={1.5}>
            Revenue / Cost (Current Month)
          </Typography>
          {revenueData.length === 0 ? (
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: 280 }}>
              <Typography color={labelColor} fontSize={13}>No revenue data available</Typography>
            </Box>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={revenueData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#1E293B" : "#E5E7EB"} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: labelColor }} interval={2} />
                <YAxis tick={{ fontSize: 11, fill: labelColor }} unit=" N$" />
                <Tooltip
                  contentStyle={{ backgroundColor: isDark ? "#1E293B" : "#fff", border: cardBorder, borderRadius: 8, fontSize: 12 }}
                  formatter={(value, name) => [`N$ ${safeNum(value).toFixed(2)}`, name]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="revenue" name="Revenue (Import)" fill="#10B981" radius={[3, 3, 0, 0]} />
                <Bar dataKey="cost" name="Cost (Export)" fill="#EF4444" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Box>
      </Box>

      {/* METERS TABLE */}
      <Box sx={{ px: 3, pb: 2 }}>
        <Typography variant="h6" fontWeight={600} color={headingColor} mb={1.5}>
          Meters ({areaMeters.length})
        </Typography>
        <Box sx={{ bgcolor: cardBg, border: cardBorder, borderRadius: "12px", overflow: "hidden" }}>
          {areaMeters.length === 0 ? (
            <Box sx={{ p: 4, textAlign: "center" }}>
              <Typography color={labelColor}>No meters found in this area</Typography>
            </Box>
          ) : (
            <Box sx={{ maxHeight: 400, overflowY: "auto" }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    {["DRN", "Customer", "Status", "Mains", "Geyser", "Power (W)", "Units (kWh)", "Tariff"].map((col) => (
                      <TableCell key={col} sx={{ bgcolor: isDark ? colors.primary[400] : "#F9FAFB", color: labelColor, fontWeight: 600, fontSize: 12, borderColor: isDark ? "#1E293B" : "#E5E7EB", py: 1.5 }}>
                        {col}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {areaMeters.map((m) => {
                    const online = isOnline(m);
                    const mainsOn = m.mains_state === "1" || m.mains_state === 1;
                    const geyserOn = m.geyser_state === "1" || m.geyser_state === 1;
                    return (
                      <TableRow
                        key={m.DRN}
                        hover
                        onClick={() => navigate(`/meter/${m.DRN}`)}
                        sx={{ cursor: "pointer", "&:hover": { bgcolor: isDark ? "rgba(37,99,235,0.05)" : "#F9FAFB" } }}
                      >
                        <TableCell sx={{ color: headingColor, fontWeight: 600, fontSize: 12, fontFamily: "monospace", borderColor: isDark ? "#1E293B" : "#E5E7EB" }}>{m.DRN}</TableCell>
                        <TableCell sx={{ color: isDark ? colors.grey[200] : "#374151", fontSize: 12, borderColor: isDark ? "#1E293B" : "#E5E7EB" }}>{m.customerName || "---"}</TableCell>
                        <TableCell sx={{ borderColor: isDark ? "#1E293B" : "#E5E7EB" }}>
                          <Chip icon={<FiberManualRecord sx={{ fontSize: 8 }} />} label={online ? "Online" : "Offline"} size="small" sx={{ height: 22, fontSize: 10, bgcolor: online ? (isDark ? "rgba(16,185,129,0.15)" : "#ECFDF5") : (isDark ? "rgba(239,68,68,0.15)" : "#FEF2F2"), color: online ? "#10B981" : "#EF4444", "& .MuiChip-icon": { color: online ? "#10B981" : "#EF4444" } }} />
                        </TableCell>
                        <TableCell sx={{ borderColor: isDark ? "#1E293B" : "#E5E7EB" }}>
                          <Chip label={mainsOn ? "ON" : "OFF"} size="small" sx={{ height: 20, fontSize: 10, bgcolor: mainsOn ? (isDark ? "rgba(16,185,129,0.12)" : "#ECFDF5") : (isDark ? "rgba(239,68,68,0.12)" : "#FEF2F2"), color: mainsOn ? "#10B981" : "#EF4444" }} />
                        </TableCell>
                        <TableCell sx={{ borderColor: isDark ? "#1E293B" : "#E5E7EB" }}>
                          <Chip label={geyserOn ? "ON" : "OFF"} size="small" sx={{ height: 20, fontSize: 10, bgcolor: geyserOn ? (isDark ? "rgba(245,158,11,0.12)" : "#FFFBEB") : (isDark ? "rgba(100,116,139,0.12)" : "#F3F4F6"), color: geyserOn ? "#F59E0B" : (isDark ? colors.grey[500] : "#9CA3AF") }} />
                        </TableCell>
                        <TableCell sx={{ color: isDark ? colors.grey[200] : "#374151", fontSize: 12, borderColor: isDark ? "#1E293B" : "#E5E7EB" }}>{safeNum(m.active_power || m.ActivePower, null) ?? "—"}</TableCell>
                        <TableCell sx={{ color: isDark ? colors.grey[200] : "#374151", fontSize: 12, borderColor: isDark ? "#1E293B" : "#E5E7EB" }}>{safeNum(m.CumulativeUnits || m.credit, null) ?? "—"}</TableCell>
                        <TableCell sx={{ color: isDark ? colors.grey[200] : "#374151", fontSize: 12, borderColor: isDark ? "#1E293B" : "#E5E7EB" }}>{m.tariff_type || m.TariffType || "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          )}
        </Box>
      </Box>

      {/* GROUP CONFIGURATIONS */}
      <Box sx={{ px: 3, pb: 4 }}>
        <Typography variant="h6" fontWeight={600} color={headingColor} mb={1.5}>
          Group Configurations ({areaGroups.length})
        </Typography>
        {areaGroups.length === 0 ? (
          <Box sx={{ bgcolor: cardBg, border: cardBorder, borderRadius: "12px", p: 4, textAlign: "center" }}>
            <GroupWorkOutlined sx={{ fontSize: 32, color: isDark ? colors.grey[500] : "#D1D5DB", mb: 0.5 }} />
            <Typography color={labelColor} fontSize={13}>No load control groups configured for this area</Typography>
          </Box>
        ) : (
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 2 }}>
            {areaGroups.map((g) => {
              const meterCount = g.meters?.length || g.member_count || g.meter_count || (g.members || []).length || 0;
              const active = isGroupActive(g);
              const schedule = g.schedule || null;
              return (
                <Box
                  key={g.id}
                  onClick={() => navigate(`/load-control/group/${g.id}`)}
                  sx={{
                    bgcolor: cardBg,
                    border: cardBorder,
                    borderRadius: "12px",
                    p: "18px 22px",
                    cursor: "pointer",
                    transition: "all 0.15s",
                    "&:hover": { borderColor: "#2563EB", bgcolor: isDark ? "rgba(37,99,235,0.06)" : "rgba(37,99,235,0.03)" },
                  }}
                >
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                    <Typography variant="subtitle1" fontWeight={600} color={headingColor}>{g.name}</Typography>
                    <Chip
                      label={active ? "ACTIVE" : "IDLE"}
                      size="small"
                      sx={{
                        height: 22, fontSize: 10, fontWeight: 700,
                        bgcolor: active ? (isDark ? "rgba(16,185,129,0.15)" : "#ECFDF5") : (isDark ? "rgba(100,116,139,0.15)" : "#F3F4F6"),
                        color: active ? "#10B981" : "#94A3AF",
                        ...(active ? { border: "1px solid #10B981" } : {}),
                      }}
                    />
                  </Box>
                  <Box display="flex" gap={1} alignItems="center" flexWrap="wrap">
                    <Typography fontSize={12} color={labelColor}>{meterCount} meter{meterCount !== 1 ? "s" : ""}</Typography>
                    <Chip label={g.control_type || "load"} size="small" sx={{ height: 18, fontSize: 9, textTransform: "capitalize", bgcolor: isDark ? "rgba(37,99,235,0.12)" : "#DBEAFE", color: "#2563EB", "& .MuiChip-label": { px: "5px" } }} />
                  </Box>
                  {schedule?.enabled && schedule.periods?.[0] && (
                    <Box display="flex" alignItems="center" gap={0.5} mt={1}>
                      <ScheduleOutlined sx={{ fontSize: 14, color: labelColor }} />
                      <Typography fontSize={11} color={labelColor}>
                        {schedule.periods[0].startTime || "—"} - {schedule.periods[0].endTime || "—"}
                      </Typography>
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
        )}
      </Box>
    </Box>
  );
}
