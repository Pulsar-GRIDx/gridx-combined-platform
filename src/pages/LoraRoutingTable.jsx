import { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, useTheme, LinearProgress, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from "@mui/material";
import { tokens } from "../theme";
import Header from "../components/Header";
import { loraMeshAPI } from "../services/api";

const STATUS_COLOR = {
  active: "#4caf50",
  stale: "#f2b705",
  failed: "#f44336",
};

function formatAge(seconds) {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function formatPath(path) {
  try {
    const arr = typeof path === "string" ? JSON.parse(path) : path;
    if (!Array.isArray(arr) || arr.length === 0) return "—";
    return arr.join(" → ");
  } catch {
    return "—";
  }
}

const LoraRoutingTable = () => {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const isDark = theme.palette.mode === "dark";
  const cardBg = isDark ? colors.primary[400] : "#fff";
  const cardBorder = isDark ? colors.primary[300] : "#E5E7EB";

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await loraMeshAPI.getRoutingTable();
      setRows(res.data || []);
    } catch (err) {
      console.error("Routing table fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 20000);
    return () => clearInterval(id);
  }, [fetchData]);

  return (
    <Box m="20px">
      <Header title="ROUTING TABLE" subtitle="Each meter's own passively-observed route cache — diagnostic, not an authoritative forwarding table (flood routing doesn't need one)" />

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      <Box sx={{ bgcolor: cardBg, borderRadius: "12px", overflow: "hidden", border: `1px solid ${cardBorder}` }}>
        <TableContainer sx={{ maxHeight: "70vh" }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                {["Source DRN", "Destination DRN", "Next Hop", "Hop Count", "Route Path", "Status", "Route Age", "Last Activity"].map((h) => (
                  <TableCell key={h} sx={{ color: "#06b6d4", fontWeight: 600, fontSize: "11px", bgcolor: cardBg, borderBottom: `1px solid ${cardBorder}` }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={8} sx={{ color: colors.grey[400], fontSize: "12px", textAlign: "center", py: 4 }}>
                    No route observations yet.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r, i) => (
                <TableRow key={`${r.source_drn}-${r.destination_drn}-${i}`}>
                  <TableCell sx={{ color: colors.grey[200], fontSize: "11px", fontFamily: "monospace" }}>{r.source_drn}</TableCell>
                  <TableCell sx={{ color: colors.grey[200], fontSize: "11px", fontFamily: "monospace" }}>{r.destination_drn}</TableCell>
                  <TableCell sx={{ color: colors.grey[300], fontSize: "11px", fontFamily: "monospace" }}>{r.next_hop_drn || "—"}</TableCell>
                  <TableCell sx={{ color: colors.grey[300], fontSize: "11px" }}>{r.hop_count}</TableCell>
                  <TableCell sx={{ color: colors.grey[400], fontSize: "11px", fontFamily: "monospace", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {formatPath(r.path)}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={r.route_status}
                      size="small"
                      sx={{ bgcolor: `${STATUS_COLOR[r.route_status] || colors.grey[500]}20`, color: STATUS_COLOR[r.route_status] || colors.grey[300], fontWeight: 600, fontSize: "10px", height: 20, textTransform: "capitalize" }}
                    />
                  </TableCell>
                  <TableCell sx={{ color: colors.grey[300], fontSize: "11px" }}>{formatAge(r.route_age_seconds)}</TableCell>
                  <TableCell sx={{ color: colors.grey[400], fontSize: "11px" }}>{r.observed_at ? new Date(r.observed_at).toLocaleTimeString() : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Box>
  );
};

export default LoraRoutingTable;
