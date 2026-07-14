import { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, useTheme, LinearProgress, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from "@mui/material";
import { tokens } from "../theme";
import Header from "../components/Header";
import { loraMeshAPI } from "../services/api";

const LORA_ACCENT = "#06b6d4";
const GSM_ACCENT = "#f2b705";

function fmtPercent(v) {
  return v === null || v === undefined ? "—" : `${v}%`;
}
function fmtSeconds(v) {
  if (v === null || v === undefined) return "—";
  if (v < 60) return `${v}s`;
  return `${Math.floor(v / 60)}m ${v % 60}s`;
}

const LoraReliabilityComparison = () => {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const isDark = theme.palette.mode === "dark";
  const cardBg = isDark ? colors.primary[400] : "#fff";
  const cardBorder = isDark ? colors.primary[300] : "#E5E7EB";

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await loraMeshAPI.getReliabilityComparison();
      setData(res.data);
    } catch (err) {
      console.error("Reliability comparison fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 30000);
    return () => clearInterval(id);
  }, [fetchData]);

  const lora = data?.lora || {};
  const gsm = data?.gsm || {};

  const METRICS = [
    { label: "Messages Sent", key: "messages_sent", format: (v) => v ?? "—" },
    { label: "Messages Delivered", key: "messages_delivered", format: (v) => v ?? "—" },
    { label: "Success Rate", key: "success_rate", format: fmtPercent },
    { label: "Average Latency", key: "average_latency_seconds", format: fmtSeconds },
    { label: "Failures", key: "failures", format: (v) => v ?? "—" },
    { label: "Retries", key: "retries", format: (v) => v ?? "—" },
  ];

  return (
    <Box m="20px">
      <Header title="RELIABILITY COMPARISON" subtitle="LoRa mesh vs. GSM fallback — quantifying how much the mesh is actually saving" />

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      <Box sx={{ bgcolor: cardBg, borderRadius: "12px", p: "16px 20px", mb: "16px", border: `1px solid ${cardBorder}` }}>
        <Typography sx={{ fontSize: "12.5px", color: colors.grey[300] }}>
          "LoRa" = messages that reached the server through a mesh gateway. "GSM" here specifically means messages the mesh path
          failed to confirm in time, forcing the originating meter's own GSM fallback — not all direct-GSM traffic in general.
        </Typography>
      </Box>

      <Box sx={{ bgcolor: cardBg, borderRadius: "12px", overflow: "hidden", border: `1px solid ${cardBorder}` }}>
        <TableContainer>
          <Table size="medium">
            <TableHead>
              <TableRow>
                <TableCell sx={{ color: colors.grey[300], fontWeight: 600, fontSize: "12px", borderBottom: `1px solid ${cardBorder}` }}>
                  Metric
                </TableCell>
                <TableCell sx={{ color: LORA_ACCENT, fontWeight: 700, fontSize: "12px", borderBottom: `1px solid ${cardBorder}` }}>
                  <Chip label="LoRa Mesh" size="small" sx={{ bgcolor: `${LORA_ACCENT}20`, color: LORA_ACCENT, fontWeight: 700, fontSize: "10px" }} />
                </TableCell>
                <TableCell sx={{ color: GSM_ACCENT, fontWeight: 700, fontSize: "12px", borderBottom: `1px solid ${cardBorder}` }}>
                  <Chip label="GSM Fallback" size="small" sx={{ bgcolor: `${GSM_ACCENT}20`, color: GSM_ACCENT, fontWeight: 700, fontSize: "10px" }} />
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {METRICS.map((m) => (
                <TableRow key={m.key}>
                  <TableCell sx={{ color: colors.grey[300], fontSize: "13px", borderBottom: `1px solid ${cardBorder}` }}>{m.label}</TableCell>
                  <TableCell sx={{ color: colors.grey[100], fontSize: "14px", fontWeight: 600, borderBottom: `1px solid ${cardBorder}` }}>
                    {m.format(lora[m.key])}
                  </TableCell>
                  <TableCell sx={{ color: colors.grey[100], fontSize: "14px", fontWeight: 600, borderBottom: `1px solid ${cardBorder}` }}>
                    {m.format(gsm[m.key])}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Box>
  );
};

export default LoraReliabilityComparison;
