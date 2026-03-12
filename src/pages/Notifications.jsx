import { useState, useMemo } from "react";
import {
  Box,
  Typography,
  Chip,
  Button,
  Divider,
  useTheme,
} from "@mui/material";
import {
  ErrorOutlined,
  WarningAmberOutlined,
  CheckCircleOutlined,
  InfoOutlined,
  FiberManualRecord,
  MarkEmailReadOutlined,
} from "@mui/icons-material";
import Header from "../components/Header";
import { tokens } from "../theme";
import { notifications } from "../services/mockData";

/* ---- notification type config ---- */
const typeConfig = {
  Critical: { color: "#db4f4a", icon: ErrorOutlined, bg: "rgba(219,79,74,0.15)" },
  Warning: { color: "#f2b705", icon: WarningAmberOutlined, bg: "rgba(242,183,5,0.15)" },
  Success: { color: "#4cceac", icon: CheckCircleOutlined, bg: "rgba(76,206,172,0.15)" },
  Info: { color: "#6870fa", icon: InfoOutlined, bg: "rgba(104,112,250,0.15)" },
};

/* ---- helpers ---- */
function formatRelativeTime(iso) {
  const now = new Date("2026-03-12T09:00:00");
  const d = new Date(iso);
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  return d.toLocaleDateString("en-NA", { year: "numeric", month: "short", day: "numeric" });
}

/* ==================================================================== */
/* Notifications Page                                                   */
/* ==================================================================== */
export default function Notifications() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);

  const [activeFilter, setActiveFilter] = useState("All");
  const [readState, setReadState] = useState(() => {
    const map = {};
    notifications.forEach((n) => {
      map[n.id] = n.read;
    });
    return map;
  });

  /* ---- counts by type ---- */
  const counts = useMemo(() => {
    const c = { Critical: 0, Warning: 0, Success: 0, Info: 0 };
    notifications.forEach((n) => {
      if (c[n.type] !== undefined) c[n.type]++;
    });
    return c;
  }, []);

  /* ---- filtered + sorted ---- */
  const filteredNotifications = useMemo(() => {
    const list =
      activeFilter === "All"
        ? [...notifications]
        : notifications.filter((n) => n.type === activeFilter);
    return list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [activeFilter]);

  const handleMarkRead = (id) => {
    setReadState((prev) => ({ ...prev, [id]: true }));
  };

  const filterTabs = ["All", "Critical", "Warning", "Success", "Info"];

  return (
    <Box m="20px">
      <Header
        title="NOTIFICATIONS"
        subtitle="System alerts and meter events"
      />

      <Box
        display="grid"
        gridTemplateColumns="repeat(12, 1fr)"
        gridAutoRows="140px"
        gap="5px"
      >
        {/* ---- Count Cards (span 3 each) ---- */}
        {Object.entries(counts).map(([type, count]) => {
          const cfg = typeConfig[type];
          const IconComp = cfg.icon;
          return (
            <Box
              key={type}
              gridColumn="span 3"
              gridRow="span 1"
              backgroundColor={colors.primary[400]}
              borderRadius="4px"
              p="20px"
              display="flex"
              alignItems="center"
              gap={2}
              sx={{ cursor: "pointer" }}
              onClick={() => setActiveFilter(type)}
            >
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  bgcolor: cfg.bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <IconComp sx={{ color: cfg.color, fontSize: 26 }} />
              </Box>
              <Box>
                <Typography variant="h4" color={cfg.color} fontWeight={700}>
                  {count}
                </Typography>
                <Typography variant="body2" color={colors.grey[100]} fontWeight={600}>
                  {type}
                </Typography>
              </Box>
            </Box>
          );
        })}

        {/* ---- Filter tabs row ---- */}
        <Box
          gridColumn="span 12"
          gridRow="span 1"
          backgroundColor={colors.primary[400]}
          borderRadius="4px"
          display="flex"
          alignItems="center"
          px="15px"
          gap={1}
          flexWrap="wrap"
        >
          {filterTabs.map((tab) => (
            <Chip
              key={tab}
              label={tab}
              onClick={() => setActiveFilter(tab)}
              sx={{
                bgcolor:
                  activeFilter === tab
                    ? colors.greenAccent[700]
                    : "rgba(255,255,255,0.06)",
                color:
                  activeFilter === tab ? "#fff" : colors.grey[100],
                fontWeight: 600,
                fontSize: "0.8rem",
                height: 32,
                cursor: "pointer",
                "&:hover": {
                  bgcolor:
                    activeFilter === tab
                      ? colors.greenAccent[600]
                      : "rgba(255,255,255,0.1)",
                },
              }}
            />
          ))}
          <Typography variant="body2" color={colors.grey[400]} ml="auto" fontSize="0.78rem">
            {filteredNotifications.length} notification{filteredNotifications.length !== 1 ? "s" : ""}
          </Typography>
        </Box>

        {/* ---- Notification Timeline (span 12, span 5) ---- */}
        <Box
          gridColumn="span 12"
          gridRow="span 5"
          backgroundColor={colors.primary[400]}
          borderRadius="4px"
          overflow="auto"
          p="10px"
        >
          {filteredNotifications.map((ntf, idx) => {
            const cfg = typeConfig[ntf.type] || typeConfig.Info;
            const IconComp = cfg.icon;
            const isRead = readState[ntf.id];

            return (
              <Box key={ntf.id}>
                <Box
                  display="flex"
                  alignItems="flex-start"
                  gap={2}
                  px={2}
                  py={1.5}
                  sx={{
                    bgcolor: isRead ? "transparent" : "rgba(0,180,216,0.04)",
                    "&:hover": {
                      bgcolor: isRead ? "rgba(0,180,216,0.03)" : "rgba(0,180,216,0.07)",
                    },
                  }}
                >
                  {/* ---- Icon ---- */}
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      bgcolor: cfg.bg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      mt: 0.3,
                    }}
                  >
                    <IconComp sx={{ color: cfg.color, fontSize: 22 }} />
                  </Box>

                  {/* ---- Content ---- */}
                  <Box flex={1} minWidth={0}>
                    <Box display="flex" alignItems="center" gap={1} mb={0.3}>
                      <Typography variant="body2" color={colors.grey[100]} fontWeight={600} fontSize="0.85rem">
                        {ntf.title}
                      </Typography>
                      {!isRead && <FiberManualRecord sx={{ fontSize: 8, color: colors.greenAccent[500] }} />}
                    </Box>
                    <Typography
                      variant="body2"
                      color={colors.grey[400]}
                      fontSize="0.78rem"
                      lineHeight={1.5}
                      mb={0.5}
                    >
                      {ntf.message}
                    </Typography>
                    <Box display="flex" alignItems="center" gap={1.5}>
                      <Typography variant="caption" color="rgba(255,255,255,0.35)" fontSize="0.7rem">
                        {formatRelativeTime(ntf.timestamp)}
                      </Typography>
                      {ntf.meterNo && (
                        <Chip
                          label={ntf.meterNo}
                          size="small"
                          sx={{
                            bgcolor: "rgba(255,255,255,0.06)",
                            color: colors.grey[400],
                            fontFamily: "monospace",
                            fontSize: "0.68rem",
                            height: 20,
                          }}
                        />
                      )}
                    </Box>
                  </Box>

                  {/* ---- Read / Mark as Read ---- */}
                  <Box display="flex" alignItems="center" flexShrink={0}>
                    {!isRead ? (
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<MarkEmailReadOutlined sx={{ fontSize: 16 }} />}
                        onClick={() => handleMarkRead(ntf.id)}
                        sx={{
                          fontSize: "0.7rem",
                          textTransform: "none",
                          whiteSpace: "nowrap",
                          color: colors.greenAccent[500],
                          borderColor: colors.greenAccent[500],
                        }}
                      >
                        Mark as Read
                      </Button>
                    ) : (
                      <Typography variant="caption" color="rgba(255,255,255,0.25)" fontSize="0.68rem">
                        Read
                      </Typography>
                    )}
                  </Box>
                </Box>
                {idx < filteredNotifications.length - 1 && (
                  <Divider sx={{ borderColor: "rgba(255,255,255,0.05)" }} />
                )}
              </Box>
            );
          })}
          {filteredNotifications.length === 0 && (
            <Box textAlign="center" py={6}>
              <Typography variant="body2" color={colors.grey[400]}>
                No notifications match the selected filter.
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
