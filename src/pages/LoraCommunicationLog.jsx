import { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, useTheme, LinearProgress, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination,
} from "@mui/material";
import { tokens } from "../theme";
import Header from "../components/Header";
import { loraMeshAPI } from "../services/api";

const TYPE_COLOR = {
  "LoRa": "#06b6d4",
  "GSM Fallback": "#f2b705",
};

const STATUS_COLOR = {
  "Confirmed": "#4caf50",
  "Delivered": "#3b82f6",
  "Pending": "#f2b705",
  "Failed": "#f44336",
};

const LoraCommunicationLog = () => {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const isDark = theme.palette.mode === "dark";
  const cardBg = isDark ? colors.primary[400] : "#fff";
  const cardBorder = isDark ? colors.primary[300] : "#E5E7EB";

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await loraMeshAPI.getCommunicationLog({ limit: rowsPerPage, offset: page * rowsPerPage });
      setRows(res.data || []);
      setTotal(res.total || 0);
    } catch (err) {
      console.error("Communication log fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <Box m="20px">
      <Header title="COMMUNICATION LOG" subtitle="Every mesh-relayed telemetry transmission, with delivery status through server confirmation" />

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      <Box sx={{ bgcolor: cardBg, borderRadius: "12px", overflow: "hidden", border: `1px solid ${cardBorder}` }}>
        <TableContainer sx={{ maxHeight: "65vh" }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                {["Message ID", "Source DRN", "Destination", "Timestamp", "Type", "Hop Count", "Status", "Retries"].map((h) => (
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
                    No mesh-relayed messages logged yet.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.message_id}>
                  <TableCell sx={{ color: colors.grey[200], fontSize: "11px", fontFamily: "monospace" }}>{r.message_id}</TableCell>
                  <TableCell sx={{ color: colors.grey[300], fontSize: "11px", fontFamily: "monospace" }}>{r.source_drn}</TableCell>
                  <TableCell sx={{ color: colors.grey[300], fontSize: "11px", fontFamily: "monospace" }}>{r.destination}</TableCell>
                  <TableCell sx={{ color: colors.grey[400], fontSize: "11px" }}>
                    {r.received_at ? new Date(r.received_at).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={r.communication_type}
                      size="small"
                      sx={{ bgcolor: `${TYPE_COLOR[r.communication_type] || colors.grey[500]}20`, color: TYPE_COLOR[r.communication_type] || colors.grey[300], fontWeight: 600, fontSize: "10px", height: 20 }}
                    />
                  </TableCell>
                  <TableCell sx={{ color: colors.grey[300], fontSize: "11px" }}>{r.hop_count}</TableCell>
                  <TableCell>
                    <Chip
                      label={r.status_label}
                      size="small"
                      sx={{ bgcolor: `${STATUS_COLOR[r.status_label] || colors.grey[500]}20`, color: STATUS_COLOR[r.status_label] || colors.grey[300], fontWeight: 600, fontSize: "10px", height: 20 }}
                    />
                  </TableCell>
                  <TableCell sx={{ color: colors.grey[400], fontSize: "11px" }}>{r.retry_count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {total > 0 && (
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            rowsPerPageOptions={[25, 50, 100]}
            sx={{ color: colors.grey[100] }}
          />
        )}
      </Box>
    </Box>
  );
};

export default LoraCommunicationLog;
