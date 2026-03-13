import { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Chip,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
  useTheme,
  CircularProgress,
} from "@mui/material";
import {
  PersonOutlined,
  PersonAddOutlined,
  EditOutlined,
  CheckCircle,
  Cancel,
  FiberManualRecord,
  AdminPanelSettingsOutlined,
  LoginOutlined,
} from "@mui/icons-material";
import Header from "../components/Header";
import StatBox from "../components/StatBox";
import { tokens } from "../theme";
import { operators as mockOperators, auditLog as mockAuditLog } from "../services/mockData";
import { authAPI } from "../services/api";

/* ---- role chip color map ---- */
const roleColor = {
  ADMIN: { bg: "rgba(0,180,216,0.15)", text: "#00b4d8" },
  SUPERVISOR: { bg: "rgba(104,112,250,0.15)", text: "#6870fa" },
  OPERATOR: { bg: "rgba(76,206,172,0.15)", text: "#4cceac" },
  VIEWER: { bg: "rgba(158,158,158,0.15)", text: "#9e9e9e" },
};

/* ---- audit type border colors ---- */
const auditTypeColor = {
  VEND: "#00b4d8",
  LOGIN: "#4cceac",
  CREATE: "#6870fa",
  UPDATE: "#f2b705",
  DELETE: "#db4f4a",
  SYSTEM: "#9e9e9e",
};

/* ---- helpers ---- */
function formatDateTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-NA", { year: "numeric", month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString("en-NA", { hour: "2-digit", minute: "2-digit" })
  );
}

function formatTimestamp(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-NA", { year: "numeric", month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString("en-NA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  );
}

/* ==================================================================== */
/* Admin Page                                                           */
/* ==================================================================== */
export default function Admin() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);

  const [operators, setOperators] = useState(mockOperators);
  const [auditLog, setAuditLog] = useState(mockAuditLog);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAdmins = async () => {
      try {
        const res = await authAPI.getAllAdmins();
        if (res?.users && res.users.length > 0) {
          const mapped = res.users.map((a) => ({
            id: a.Admin_ID,
            name: `${a.FirstName || ""} ${a.LastName || ""}`.trim() || a.Username,
            username: a.Username || a.Email,
            role: (a.AccessLevel || "OPERATOR").toUpperCase(),
            lastLogin: a.lastLoginTime || null,
            status: a.IsActive === 1 ? "Online" : "Offline",
          }));
          setOperators(mapped);
        }
      } catch (err) {
        console.error("Failed to fetch admins:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchAdmins();
  }, []);

  /* ---- counts ---- */
  const totalOperators = operators.length;
  const onlineOperators = operators.filter((o) => o.status === "Online").length;
  const recentLogins = operators
    .filter((o) => {
      if (!o.lastLogin) return false;
      const d = new Date(o.lastLogin);
      const now = new Date();
      return now - d < 24 * 60 * 60 * 1000;
    }).length;

  return (
    <Box m="20px">
      <Header
        title="SYSTEM ADMINISTRATION"
        subtitle="Operator management, permissions, and audit trail"
      />

      <Box
        display="grid"
        gridTemplateColumns="repeat(12, 1fr)"
        gridAutoRows="140px"
        gap="5px"
      >
        {/* ---- Stat Boxes ---- */}
        <Box
          gridColumn="span 4"
          backgroundColor={colors.primary[400]}
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <StatBox
            title={String(onlineOperators)}
            subtitle="Operators Online"
            progress={onlineOperators / totalOperators}
            increase={`${((onlineOperators / totalOperators) * 100).toFixed(0)}%`}
            icon={<PersonOutlined sx={{ color: colors.greenAccent[600], fontSize: "26px" }} />}
            link="/admin"
          />
        </Box>

        <Box
          gridColumn="span 4"
          backgroundColor={colors.primary[400]}
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <StatBox
            title={String(totalOperators)}
            subtitle="Total Operators"
            progress={1}
            increase="100%"
            icon={<AdminPanelSettingsOutlined sx={{ color: colors.greenAccent[600], fontSize: "26px" }} />}
            link="/admin"
          />
        </Box>

        <Box
          gridColumn="span 4"
          backgroundColor={colors.primary[400]}
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <StatBox
            title={String(recentLogins)}
            subtitle="Recent Logins (24h)"
            progress={recentLogins / totalOperators}
            increase={`${((recentLogins / totalOperators) * 100).toFixed(0)}%`}
            icon={<LoginOutlined sx={{ color: colors.greenAccent[600], fontSize: "26px" }} />}
            link="/admin"
          />
        </Box>

        {/* ---- Operators Table (span 7, span 4) ---- */}
        <Box
          gridColumn="span 7"
          gridRow="span 4"
          backgroundColor={colors.primary[400]}
          borderRadius="4px"
          overflow="auto"
          p="15px"
        >
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6" color={colors.grey[100]} fontWeight={600}>
              Operators
            </Typography>
            <Button
              variant="contained"
              size="small"
              startIcon={<PersonAddOutlined />}
              sx={{
                backgroundColor: colors.greenAccent[700],
                "&:hover": { backgroundColor: colors.greenAccent[600] },
                textTransform: "none",
              }}
            >
              Add Operator
            </Button>
          </Box>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {["Name", "Username", "Role", "Last Login", "Status", "Actions"].map((col) => (
                    <TableCell
                      key={col}
                      sx={{
                        color: colors.greenAccent[500],
                        fontWeight: 600,
                        fontSize: "0.75rem",
                        borderBottom: `2px solid rgba(255,255,255,0.08)`,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {col}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {operators.map((op) => {
                  const rc = roleColor[op.role] || roleColor.VIEWER;
                  const dotColor =
                    op.status === "Online"
                      ? colors.greenAccent[500]
                      : op.status === "Suspended"
                      ? "#db4f4a"
                      : colors.grey[400];
                  return (
                    <TableRow
                      key={op.id}
                      sx={{
                        "&:hover": { bgcolor: "rgba(0,180,216,0.06)" },
                        "& td": {
                          borderBottom: "1px solid rgba(255,255,255,0.05)",
                          color: colors.grey[100],
                          fontSize: "0.8rem",
                          py: 1.2,
                        },
                      }}
                    >
                      <TableCell sx={{ fontWeight: 500 }}>{op.name}</TableCell>
                      <TableCell sx={{ fontFamily: "monospace", fontSize: "0.78rem" }}>
                        {op.username}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={op.role}
                          size="small"
                          sx={{
                            bgcolor: rc.bg,
                            color: rc.text,
                            fontWeight: 600,
                            fontSize: "0.7rem",
                            height: 24,
                          }}
                        />
                      </TableCell>
                      <TableCell>{formatDateTime(op.lastLogin)}</TableCell>
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={0.8}>
                          <FiberManualRecord sx={{ fontSize: 10, color: dotColor }} />
                          <Typography variant="body2" color={dotColor} fontWeight={500} fontSize="0.78rem">
                            {op.status}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<EditOutlined sx={{ fontSize: 16 }} />}
                          sx={{
                            fontSize: "0.7rem",
                            textTransform: "none",
                            color: colors.greenAccent[500],
                            borderColor: colors.greenAccent[500],
                          }}
                        >
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        {/* ---- Audit Log (span 5, span 4) ---- */}
        <Box
          gridColumn="span 5"
          gridRow="span 4"
          backgroundColor={colors.primary[400]}
          borderRadius="4px"
          overflow="auto"
          p="15px"
        >
          <Typography variant="h6" color={colors.grey[100]} fontWeight={600} mb={2}>
            Audit Log
          </Typography>

          {auditLog.map((entry, idx) => {
            const borderColor = auditTypeColor[entry.type] || "#9e9e9e";
            return (
              <Box key={entry.id}>
                <Box
                  sx={{
                    borderLeft: `3px solid ${borderColor}`,
                    pl: 2,
                    py: 1.2,
                    "&:hover": { bgcolor: "rgba(0,180,216,0.04)" },
                  }}
                >
                  <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={0.3}>
                    <Typography variant="body2" color={colors.grey[100]} fontWeight={600} fontSize="0.82rem">
                      {entry.event}
                    </Typography>
                    <Chip
                      label={entry.type}
                      size="small"
                      sx={{
                        bgcolor: `${borderColor}20`,
                        color: borderColor,
                        fontWeight: 600,
                        fontSize: "0.65rem",
                        height: 20,
                        ml: 1,
                        flexShrink: 0,
                      }}
                    />
                  </Box>
                  <Typography
                    variant="caption"
                    color={colors.grey[400]}
                    fontSize="0.75rem"
                    display="block"
                    mb={0.3}
                  >
                    {entry.detail}
                  </Typography>
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="caption" color="rgba(255,255,255,0.35)" fontSize="0.7rem">
                      {formatTimestamp(entry.timestamp)}
                    </Typography>
                    <Typography variant="caption" color={colors.grey[400]} fontSize="0.7rem">
                      by {entry.user}
                    </Typography>
                  </Box>
                </Box>
                {idx < auditLog.length - 1 && (
                  <Divider sx={{ borderColor: "rgba(255,255,255,0.05)" }} />
                )}
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}
