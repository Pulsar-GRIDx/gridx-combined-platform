import { useState, useEffect, useCallback } from "react";
import { Box, Typography, useTheme, LinearProgress, Chip } from "@mui/material";
import { tokens } from "../theme";
import Header from "../components/Header";
import { loraMeshAPI } from "../services/api";
import HubIcon from "@mui/icons-material/Hub";
import DevicesIcon from "@mui/icons-material/Devices";
import RouterIcon from "@mui/icons-material/Router";
import DeviceHubIcon from "@mui/icons-material/DeviceHub";
import FavoriteIcon from "@mui/icons-material/Favorite";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

const LoraMeshOverview = () => {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const isDark = theme.palette.mode === "dark";
  const cardBg = isDark ? colors.primary[400] : "#fff";

  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await loraMeshAPI.getMeshOverview();
      setOverview(res.data);
      setError(null);
    } catch (err) {
      console.error("Mesh overview fetch error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 30000);
    return () => clearInterval(id);
  }, [fetchData]);

  const StatCard = ({ title, value, subtitle, icon, color }) => (
    <Box sx={{ bgcolor: cardBg, borderRadius: "12px", p: "20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <Box>
        <Typography sx={{ fontSize: "13px", color: colors.grey[300], mb: "4px" }}>{title}</Typography>
        <Typography sx={{ fontSize: "28px", fontWeight: 700, color: colors.grey[100], lineHeight: 1.2 }}>{value}</Typography>
        {subtitle && <Typography sx={{ fontSize: "12px", color: colors.grey[400], mt: "4px" }}>{subtitle}</Typography>}
      </Box>
      <Box sx={{ p: "10px", borderRadius: "10px", bgcolor: `${color}20`, display: "flex" }}>
        {icon}
      </Box>
    </Box>
  );

  const healthScore = overview?.mesh_health_score ?? 0;
  const healthColor = healthScore >= 80 ? colors.greenAccent[500] : healthScore >= 50 ? "#f2b705" : colors.redAccent[400];
  const successRate = overview?.delivery_success_rate_24h;

  return (
    <Box m="20px">
      <Header title="MESH OVERVIEW" subtitle="Live status of the LoRa mesh network — every meter can act as node, relay, or gateway" />

      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {error && (
        <Chip label={`Error: ${error}`} size="small" sx={{ bgcolor: `${colors.redAccent[400]}20`, color: colors.redAccent[400], mb: 2 }} />
      )}

      <Box display="grid" gridTemplateColumns="repeat(12, 1fr)" gap="15px" mb="20px">
        <Box gridColumn="span 3">
          <StatCard
            title="Total Meters"
            value={overview?.total_meters ?? "—"}
            subtitle="Reporting mesh status"
            icon={<DevicesIcon sx={{ fontSize: 26, color: "#3b82f6" }} />}
            color="#3b82f6"
          />
        </Box>
        <Box gridColumn="span 3">
          <StatCard
            title="Active Meters"
            value={overview?.active_meters ?? "—"}
            subtitle="Seen in the last 10 min"
            icon={<CheckCircleIcon sx={{ fontSize: 26, color: colors.greenAccent[500] }} />}
            color={colors.greenAccent[500]}
          />
        </Box>
        <Box gridColumn="span 3">
          <StatCard
            title="Mesh Health Score"
            value={`${healthScore}%`}
            subtitle="Active ÷ total meters"
            icon={<FavoriteIcon sx={{ fontSize: 26, color: healthColor }} />}
            color={healthColor}
          />
        </Box>
        <Box gridColumn="span 3">
          <StatCard
            title="Delivery Success (24h)"
            value={successRate === null || successRate === undefined ? "—" : `${successRate}%`}
            subtitle="Confirmed by server"
            icon={<HubIcon sx={{ fontSize: 26, color: "#06b6d4" }} />}
            color="#06b6d4"
          />
        </Box>

        <Box gridColumn="span 4">
          <StatCard
            title="Online Gateways"
            value={overview?.online_gateways ?? "—"}
            subtitle="Publishing telemetry to the server right now"
            icon={<HubIcon sx={{ fontSize: 26, color: "#a855f7" }} />}
            color="#a855f7"
          />
        </Box>
        <Box gridColumn="span 4">
          <StatCard
            title="Online Relays"
            value={overview?.online_relays ?? "—"}
            subtitle="Non-gateway meters actively forwarding"
            icon={<DeviceHubIcon sx={{ fontSize: 26, color: "#f97316" }} />}
            color="#f97316"
          />
        </Box>
        <Box gridColumn="span 4">
          <StatCard
            title="Online Nodes"
            value={overview?.online_nodes ?? "—"}
            subtitle="All active non-gateway meters"
            icon={<RouterIcon sx={{ fontSize: 26, color: colors.blueAccent[500] }} />}
            color={colors.blueAccent[500]}
          />
        </Box>
      </Box>

      <Box sx={{ bgcolor: cardBg, borderRadius: "12px", p: "20px" }}>
        <Typography sx={{ fontSize: "13px", color: colors.grey[300], mb: "10px" }}>
          Every meter is capable of all three roles simultaneously — LoRa is the preferred transport, GSM is the resilient fallback. "Online Nodes" is a superset of "Online Relays": a node only counts as a relay once it has actually forwarded at least one packet.
        </Typography>
      </Box>
    </Box>
  );
};

export default LoraMeshOverview;
