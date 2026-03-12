import { useState } from "react";
import {
  Box,
  Typography,
  Tabs,
  Tab,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  useTheme,
} from "@mui/material";
import {
  BoltOutlined,
  AttachMoneyOutlined,
  MapOutlined,
} from "@mui/icons-material";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import Header from "../components/Header";
import { tokens } from "../theme";
import { analysisData } from "../services/mockData";

/* ---- helpers ---- */
const fmt = (n) => Number(n).toLocaleString();
const fmtCurrency = (n) => `N$ ${Number(n).toLocaleString()}`;

/* ---- suburb colors for charts ---- */
const suburbColors = [
  "#00b4d8", "#4cceac", "#6870fa", "#f2b705", "#db4f4a",
  "#e76f51", "#2a9d8f", "#a855f7", "#f472b6",
];

/* ---- power trend data (7 days) ---- */
const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const powerTrendData = dayLabels.map((day, di) => {
  const row = { day };
  const variance = [0.92, 1.05, 0.97, 1.08, 1.12, 0.85, 0.78];
  analysisData.powerBySuburb.forEach((s) => {
    row[s.suburb] = Math.round(s.daily * variance[di]);
  });
  return row;
});

/* ---- revenue grouped bar data ---- */
const revenueBarData = analysisData.revenueBySuburb.map((s) => ({
  suburb: s.suburb,
  Daily: s.daily,
  Weekly: s.weekly,
  Monthly: s.monthly,
}));

/* ---- custom tooltip ---- */
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <Box
      sx={{
        background: "#0d1b2a",
        border: "1px solid rgba(0,180,216,0.3)",
        borderRadius: 1,
        px: 1.5,
        py: 1,
        maxWidth: 220,
      }}
    >
      <Typography variant="caption" sx={{ color: "#fff", fontWeight: 600, display: "block", mb: 0.5 }}>
        {label}
      </Typography>
      {payload.map((p, i) => (
        <Typography key={i} variant="caption" sx={{ display: "block", color: p.color || "#00b4d8", fontSize: "0.72rem" }}>
          {p.name}: {typeof p.value === "number" && p.value > 1000 ? p.value.toLocaleString() : p.value}
          {p.unit || ""}
        </Typography>
      ))}
    </Box>
  );
}

/* ---- availability color ---- */
function availabilityColor(pct) {
  if (pct >= 90) return "#4cceac";
  if (pct >= 70) return "#f2b705";
  return "#db4f4a";
}

/* ==================================================================== */
/* Analysis Page                                                        */
/* ==================================================================== */
export default function Analysis() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const [tab, setTab] = useState(0);

  return (
    <Box m="20px">
      <Header
        title="ANALYSIS"
        subtitle="Power consumption, revenue trends, and regional meter availability"
      />

      {/* ---- Tabs ---- */}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{
          mb: 2,
          "& .MuiTab-root": {
            color: colors.grey[400],
            textTransform: "none",
            fontWeight: 600,
            "&.Mui-selected": { color: colors.greenAccent[500] },
          },
          "& .MuiTabs-indicator": { backgroundColor: colors.greenAccent[500] },
        }}
      >
        <Tab icon={<BoltOutlined sx={{ fontSize: 18 }} />} iconPosition="start" label="Power Analysis" />
        <Tab icon={<AttachMoneyOutlined sx={{ fontSize: 18 }} />} iconPosition="start" label="Revenue Analysis" />
        <Tab icon={<MapOutlined sx={{ fontSize: 18 }} />} iconPosition="start" label="Regional Overview" />
      </Tabs>

      {/* ============================================ */}
      {/* TAB 0: Power Analysis                        */}
      {/* ============================================ */}
      {tab === 0 && (
        <Box
          display="grid"
          gridTemplateColumns="repeat(12, 1fr)"
          gridAutoRows="140px"
          gap="5px"
        >
          {/* ---- Stacked Area Chart ---- */}
          <Box
            gridColumn="span 12"
            gridRow="span 3"
            backgroundColor={colors.primary[400]}
            p="20px"
            borderRadius="4px"
          >
            <Typography variant="h6" color={colors.grey[100]} fontWeight={700} fontSize="1.05rem" mb={2}>
              Power Consumption Trend (7 Days)
            </Typography>
            <ResponsiveContainer width="100%" height="78%">
              <AreaChart data={powerTrendData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="day"
                  tick={{ fill: colors.grey[100], fontSize: 12 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: colors.grey[100], fontSize: 12 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  tickLine={false}
                  tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
                />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: "0.72rem", color: colors.grey[100] }} />
                {analysisData.powerBySuburb.map((s, i) => (
                  <Area
                    key={s.suburb}
                    type="monotone"
                    dataKey={s.suburb}
                    stackId="1"
                    stroke={suburbColors[i]}
                    fill={suburbColors[i]}
                    fillOpacity={0.35}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </Box>

          {/* ---- Suburb consumption stats ---- */}
          {analysisData.powerBySuburb.map((s, i) => (
            <Box
              key={s.suburb}
              gridColumn="span 4"
              gridRow="span 1"
              backgroundColor={colors.primary[400]}
              p="15px"
              borderRadius="4px"
            >
              <Box display="flex" alignItems="center" gap={1} mb={1}>
                <Box sx={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: suburbColors[i] }} />
                <Typography variant="body2" color={colors.grey[100]} fontWeight={700}>
                  {s.suburb}
                </Typography>
              </Box>
              <Box display="flex" gap={2}>
                <Box>
                  <Typography variant="caption" color={colors.greenAccent[500]} fontSize="0.68rem">
                    Daily
                  </Typography>
                  <Typography variant="body2" color={colors.grey[100]} fontWeight={600} fontSize="0.9rem">
                    {fmt(s.daily)} kWh
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color={colors.greenAccent[500]} fontSize="0.68rem">
                    Weekly
                  </Typography>
                  <Typography variant="body2" color={colors.grey[100]} fontWeight={600} fontSize="0.9rem">
                    {fmt(s.weekly)} kWh
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color={colors.greenAccent[500]} fontSize="0.68rem">
                    Monthly
                  </Typography>
                  <Typography variant="body2" color={colors.grey[100]} fontWeight={600} fontSize="0.9rem">
                    {fmt(s.monthly)} kWh
                  </Typography>
                </Box>
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {/* ============================================ */}
      {/* TAB 1: Revenue Analysis                      */}
      {/* ============================================ */}
      {tab === 1 && (
        <Box
          display="grid"
          gridTemplateColumns="repeat(12, 1fr)"
          gridAutoRows="140px"
          gap="5px"
        >
          {/* ---- Grouped Bar Chart ---- */}
          <Box
            gridColumn="span 12"
            gridRow="span 3"
            backgroundColor={colors.primary[400]}
            p="20px"
            borderRadius="4px"
          >
            <Typography variant="h6" color={colors.grey[100]} fontWeight={700} fontSize="1.05rem" mb={2}>
              Revenue by Suburb
            </Typography>
            <ResponsiveContainer width="100%" height="78%">
              <BarChart data={revenueBarData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="suburb"
                  tick={{ fill: colors.grey[100], fontSize: 11 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  tickLine={false}
                  angle={-20}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  tick={{ fill: colors.grey[100], fontSize: 12 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  tickLine={false}
                  tickFormatter={(v) => `N$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: "0.75rem", color: colors.grey[100] }} />
                <Bar dataKey="Daily" fill="#00b4d8" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Weekly" fill="#4cceac" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Monthly" fill="#6870fa" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Box>

          {/* ---- Revenue breakdown table ---- */}
          <Box
            gridColumn="span 12"
            gridRow="span 3"
            backgroundColor={colors.primary[400]}
            p="20px"
            borderRadius="4px"
            overflow="auto"
          >
            <Typography variant="h6" color={colors.grey[100]} fontWeight={700} fontSize="1.05rem" mb={2}>
              Revenue Breakdown by Suburb
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {["Suburb", "Daily Revenue", "Weekly Revenue", "Monthly Revenue", "% of Total"].map(
                      (col) => (
                        <TableCell
                          key={col}
                          align={col === "Suburb" ? "left" : "right"}
                          sx={{
                            color: colors.greenAccent[500],
                            fontWeight: 600,
                            fontSize: "0.75rem",
                            textTransform: "uppercase",
                            borderBottom: `1px solid rgba(255,255,255,0.08)`,
                            py: 1.2,
                          }}
                        >
                          {col}
                        </TableCell>
                      )
                    )}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(() => {
                    const totalMonthly = analysisData.revenueBySuburb.reduce(
                      (s, r) => s + r.monthly,
                      0
                    );
                    return analysisData.revenueBySuburb.map((r, i) => (
                      <TableRow
                        key={r.suburb}
                        sx={{ "&:hover": { background: "rgba(0,180,216,0.05)" } }}
                      >
                        <TableCell
                          sx={{
                            color: colors.grey[100],
                            borderBottom: "1px solid rgba(255,255,255,0.05)",
                            fontSize: "0.85rem",
                            py: 1.3,
                          }}
                        >
                          <Box display="flex" alignItems="center" gap={1}>
                            <Box
                              sx={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                backgroundColor: suburbColors[i],
                              }}
                            />
                            <Typography variant="body2" color={colors.grey[100]} fontWeight={600}>
                              {r.suburb}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell
                          align="right"
                          sx={{
                            color: colors.grey[100],
                            borderBottom: "1px solid rgba(255,255,255,0.05)",
                            fontSize: "0.85rem",
                          }}
                        >
                          {fmtCurrency(r.daily)}
                        </TableCell>
                        <TableCell
                          align="right"
                          sx={{
                            color: colors.grey[100],
                            borderBottom: "1px solid rgba(255,255,255,0.05)",
                            fontSize: "0.85rem",
                          }}
                        >
                          {fmtCurrency(r.weekly)}
                        </TableCell>
                        <TableCell
                          align="right"
                          sx={{
                            color: colors.grey[100],
                            borderBottom: "1px solid rgba(255,255,255,0.05)",
                            fontSize: "0.85rem",
                          }}
                        >
                          {fmtCurrency(r.monthly)}
                        </TableCell>
                        <TableCell
                          align="right"
                          sx={{
                            borderBottom: "1px solid rgba(255,255,255,0.05)",
                          }}
                        >
                          <Typography variant="body2" color={suburbColors[i]} fontWeight={600}>
                            {((r.monthly / totalMonthly) * 100).toFixed(1)}%
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ));
                  })()}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </Box>
      )}

      {/* ============================================ */}
      {/* TAB 2: Regional Overview                     */}
      {/* ============================================ */}
      {tab === 2 && (
        <Box
          display="grid"
          gridTemplateColumns="repeat(12, 1fr)"
          gridAutoRows="140px"
          gap="5px"
        >
          {analysisData.meterAvailability.map((region) => {
            const color = availabilityColor(region.percentage);
            const unavailable = region.total - region.available;
            return (
              <Box
                key={region.region}
                gridColumn="span 4"
                gridRow="span 2"
                backgroundColor={colors.primary[400]}
                p="20px"
                borderRadius="4px"
              >
                {/* Region name and percentage */}
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5}>
                  <Typography variant="body1" color={colors.grey[100]} fontWeight={700} fontSize="1rem">
                    {region.region}
                  </Typography>
                  <Typography variant="h6" color={color} fontWeight={700} fontSize="1.2rem">
                    {region.percentage}%
                  </Typography>
                </Box>

                {/* Progress bar */}
                <LinearProgress
                  variant="determinate"
                  value={region.percentage}
                  sx={{
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: "rgba(255,255,255,0.08)",
                    mb: 2,
                    "& .MuiLinearProgress-bar": {
                      borderRadius: 4,
                      backgroundColor: color,
                    },
                  }}
                />

                {/* Meter counts */}
                <Box display="flex" gap={2}>
                  <Box>
                    <Typography variant="caption" color={colors.greenAccent[500]} fontSize="0.68rem" display="block">
                      Total
                    </Typography>
                    <Typography variant="body2" color={colors.grey[100]} fontWeight={600}>
                      {fmt(region.total)}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color={colors.greenAccent[500]} fontSize="0.68rem" display="block">
                      Available
                    </Typography>
                    <Typography variant="body2" color={colors.greenAccent[500]} fontWeight={600}>
                      {fmt(region.available)}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color={colors.greenAccent[500]} fontSize="0.68rem" display="block">
                      Unavailable
                    </Typography>
                    <Typography variant="body2" color="#db4f4a" fontWeight={600}>
                      {fmt(unavailable)}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
