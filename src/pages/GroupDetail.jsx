import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Box,
  Typography,
  Chip,
  TextField,
  InputAdornment,
  IconButton,
  CircularProgress,
  useTheme,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Slider,
  Snackbar,
  Alert,
  Switch,
  FormControlLabel,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@mui/material";
import {
  ArrowBackOutlined,
  SearchOutlined,
  DeleteOutlined,
  AddOutlined,
  RemoveCircleOutlineOutlined,
  BoltOutlined,
  WaterDropOutlined,
  SpeedOutlined,
  BuildOutlined,
  HistoryOutlined,
  FiberManualRecord,
  EditOutlined,
  CheckOutlined,
  CloseOutlined,
  ScheduleOutlined,
  AutorenewOutlined,
} from "@mui/icons-material";
import {
  GoogleMap,
  useJsApiLoader,
  Marker,
} from "@react-google-maps/api";
import { tokens } from "../theme";
import { groupControlAPI } from "../services/api";

const GOOGLE_MAPS_KEY = "AIzaSyCdPt-Y9HoyNJF5I-sbyuS4n6U1KhKaIzk";
const LIBRARIES = ["geometry"];
const DEFAULT_CENTER = { lat: -22.5609, lng: 17.0658 };

const DARK_MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#0a1628" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0a1628" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#5a6884" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#141d2e" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1a2b" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

const LIGHT_MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#f5f5f5" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#c9e8fc" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

function makeDotIcon(color, size = 14) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="${color}" stroke="white" stroke-width="1.5"/>
  </svg>`;
  return {
    url: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    scaledSize: { width: size, height: size, equals: () => false },
    anchor: { x: size / 2, y: size / 2, equals: () => false },
  };
}

/* ================================================================== */
export default function GroupDetail() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const isDark = theme.palette.mode === "dark";

  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState(null);
  const [groupMembers, setGroupMembers] = useState([]);
  const [allMeters, setAllMeters] = useState([]);
  const [history, setHistory] = useState([]);
  const [search, setSearch] = useState("");
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });

  // Editing name
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState("");

  // Control states
  const [powerLimit, setPowerLimit] = useState(5000);

  // Confirm dialog
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: "", action: null, description: "" });

  // Delete confirm
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Schedule control state
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleAction, setScheduleAction] = useState("mains_off");
  const [schedulePeriods, setSchedulePeriods] = useState([
    { startTime: "08:00", endTime: "17:00", days: [1, 2, 3, 4, 5] },
  ]);
  const [scheduleStartDate, setScheduleStartDate] = useState("");
  const [scheduleEndDate, setScheduleEndDate] = useState("");

  // Calibration routine state
  const [calRoutineEnabled, setCalRoutineEnabled] = useState(false);
  const [calPeriod, setCalPeriod] = useState("weekly");
  const [calPreferredTime, setCalPreferredTime] = useState("02:00");

  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: GOOGLE_MAPS_KEY, libraries: LIBRARIES });

  /* Fetch group data */
  const fetchGroup = useCallback(async () => {
    setLoading(true);
    try {
      const [groupRes, metersRes, histRes] = await Promise.allSettled([
        groupControlAPI.getGroup(groupId),
        groupControlAPI.getMetersState(),
        groupControlAPI.getHistory(),
      ]);

      if (groupRes.status === "fulfilled") {
        const d = groupRes.value?.data || groupRes.value || {};
        setGroup(d);
        setGroupMembers(d.members || []);
        setEditName(d.name || "");
        // Load schedule from group data if configured
        if (d.schedule?.enabled) {
          setScheduleEnabled(true);
          setScheduleAction(d.schedule.action || "mains_off");
          if (d.schedule.periods?.length) setSchedulePeriods(d.schedule.periods);
          if (d.schedule.startDate) setScheduleStartDate(d.schedule.startDate);
          if (d.schedule.endDate) setScheduleEndDate(d.schedule.endDate);
        }
        if (d.calibration?.enabled) {
          setCalRoutineEnabled(true);
          if (d.calibration.period) setCalPeriod(d.calibration.period);
          if (d.calibration.preferredTime) setCalPreferredTime(d.calibration.preferredTime);
        }
      }
      if (metersRes.status === "fulfilled") {
        const d = metersRes.value?.data || metersRes.value || [];
        setAllMeters(Array.isArray(d) ? d : []);
      }
      if (histRes.status === "fulfilled") {
        const d = histRes.value?.data || histRes.value || [];
        setHistory(Array.isArray(d) ? d.filter(h => h.group_id == groupId).slice(0, 20) : []);
      }
    } catch (err) {
      console.error("Fetch error:", err);
    }
    setLoading(false);
  }, [groupId]);

  useEffect(() => { fetchGroup(); }, [fetchGroup]);

  /* Member DRNs set */
  const memberDrns = useMemo(() => new Set(groupMembers.map(m => m.DRN)), [groupMembers]);

  /* Available meters (not in group) */
  const availableMeters = useMemo(() => {
    let result = allMeters.filter(m => !memberDrns.has(m.DRN));
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(m =>
        (m.DRN || "").toLowerCase().includes(q) ||
        (m.LocationName || "").toLowerCase().includes(q) ||
        (m.customerName || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [allMeters, memberDrns, search]);

  /* Map center from group members */
  const mapCenter = useMemo(() => {
    const membersWithCoords = groupMembers.filter(m => {
      const lat = parseFloat(m.Lat);
      const lng = parseFloat(m.Longitude);
      return !isNaN(lat) && !isNaN(lng);
    });
    if (membersWithCoords.length === 0) return DEFAULT_CENTER;
    const sumLat = membersWithCoords.reduce((s, m) => s + parseFloat(m.Lat), 0);
    const sumLng = membersWithCoords.reduce((s, m) => s + parseFloat(m.Longitude), 0);
    return { lat: sumLat / membersWithCoords.length, lng: sumLng / membersWithCoords.length };
  }, [groupMembers]);

  /* Actions */
  const handleSaveName = async () => {
    if (!editName.trim()) return;
    try {
      await groupControlAPI.updateGroup(groupId, { name: editName });
      setGroup(prev => ({ ...prev, name: editName }));
      setEditingName(false);
      setSnackbar({ open: true, message: "Group name updated", severity: "success" });
    } catch (err) {
      setSnackbar({ open: true, message: err.message, severity: "error" });
    }
  };

  const handleDeleteGroup = async () => {
    try {
      await groupControlAPI.deleteGroup(groupId);
      navigate("/load-control");
    } catch (err) {
      setSnackbar({ open: true, message: err.message, severity: "error" });
    }
  };

  const handleRemoveMeter = async (drn) => {
    try {
      await groupControlAPI.removeMeters(groupId, [drn]);
      await fetchGroup();
      setSnackbar({ open: true, message: `Removed ${drn} from group`, severity: "success" });
    } catch (err) {
      setSnackbar({ open: true, message: err.message, severity: "error" });
    }
  };

  const handleAddMeter = async (drn) => {
    try {
      await groupControlAPI.addMeters(groupId, [drn]);
      await fetchGroup();
      setSnackbar({ open: true, message: `Added ${drn} to group`, severity: "success" });
    } catch (err) {
      setSnackbar({ open: true, message: err.message, severity: "error" });
    }
  };

  const handleExecute = async (actionType, description) => {
    setConfirmDialog({
      open: true,
      title: `Confirm: ${description}`,
      description: `This will send "${actionType}" to ${groupMembers.length} meter(s) in this group.`,
      action: async () => {
        try {
          const res = await groupControlAPI.execute({
            group_id: groupId,
            action_type: actionType,
            reason: description,
            meter_drns: groupMembers.map(m => m.DRN),
          });
          setSnackbar({
            open: true,
            message: `${res?.message || "Command sent"} (${res?.succeeded || 0}/${res?.total || 0})`,
            severity: "success",
          });
          setTimeout(() => fetchGroup(), 2000);
        } catch (err) {
          setSnackbar({ open: true, message: err.message, severity: "error" });
        }
        setConfirmDialog(prev => ({ ...prev, open: false }));
      },
    });
  };

  /* Helpers */
  const isOnline = (m) => m.Status === "1" || m.Status === 1 || m.Status === "Active";
  const cardBg = isDark ? colors.primary[400] : "#FFFFFF";
  const cardBorder = `1px solid ${isDark ? "#1E293B" : "#E5E7EB"}`;
  const headingColor = isDark ? colors.grey[100] : "#111827";
  const labelColor = isDark ? colors.grey[300] : "#6B7280";

  if (loading || !isLoaded) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="80vh">
        <CircularProgress sx={{ color: "#2563EB" }} />
      </Box>
    );
  }

  if (!group) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <Typography color={labelColor}>Group not found</Typography>
        <Button onClick={() => navigate("/load-control")} sx={{ mt: 2, color: "#2563EB", textTransform: "none" }}>
          Back to Group Control
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ bgcolor: isDark ? colors.primary[500] : "#F9FAFB", minHeight: "calc(100vh - 70px)" }}>

      {/* ===== HEADER ===== */}
      <Box
        sx={{
          px: 3,
          pt: 2.5,
          pb: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Box display="flex" alignItems="center" gap={2}>
          <IconButton
            onClick={() => navigate("/load-control")}
            sx={{
              color: labelColor,
              border: cardBorder,
              borderRadius: "8px",
              width: 36,
              height: 36,
            }}
          >
            <ArrowBackOutlined sx={{ fontSize: 18 }} />
          </IconButton>
          {editingName ? (
            <Box display="flex" alignItems="center" gap={1}>
              <TextField
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                size="small"
                autoFocus
                sx={{
                  "& .MuiOutlinedInput-root": {
                    height: 36,
                    fontSize: 16,
                    fontWeight: 600,
                  },
                }}
              />
              <IconButton size="small" onClick={handleSaveName} sx={{ color: "#10B981" }}>
                <CheckOutlined sx={{ fontSize: 18 }} />
              </IconButton>
              <IconButton size="small" onClick={() => { setEditingName(false); setEditName(group.name); }} sx={{ color: "#EF4444" }}>
                <CloseOutlined sx={{ fontSize: 18 }} />
              </IconButton>
            </Box>
          ) : (
            <Box display="flex" alignItems="center" gap={1}>
              <Typography variant="h4" fontWeight={700} color={headingColor}>
                {group.name}
              </Typography>
              <IconButton size="small" onClick={() => setEditingName(true)} sx={{ color: labelColor }}>
                <EditOutlined sx={{ fontSize: 16 }} />
              </IconButton>
            </Box>
          )}
        </Box>
        <Button
          variant="outlined"
          color="error"
          startIcon={<DeleteOutlined />}
          onClick={() => setShowDeleteConfirm(true)}
          sx={{ textTransform: "none", fontSize: 13, borderRadius: "8px" }}
        >
          Delete Group
        </Button>
      </Box>

      {/* ===== GROUP INFO ===== */}
      <Box sx={{ px: 3, pb: 2, display: "flex", gap: 2, flexWrap: "wrap" }}>
        {[
          { label: "Meters", value: groupMembers.length },
          { label: "Control Type", value: (group.control_type || "mixed").charAt(0).toUpperCase() + (group.control_type || "mixed").slice(1) },
          { label: "Created", value: group.created_at ? new Date(group.created_at).toLocaleDateString() : "---" },
          { label: "Last Action", value: history.length > 0 ? new Date(history[0].created_at).toLocaleString() : "None" },
          ...(group.power_limit ? [{ label: "Power Limit", value: `${group.power_limit}W` }] : []),
        ].map(item => (
          <Box
            key={item.label}
            sx={{
              flex: "1 1 160px",
              bgcolor: cardBg,
              border: cardBorder,
              borderRadius: "10px",
              p: "14px 18px",
            }}
          >
            <Typography variant="caption" color={labelColor} fontSize={11}>{item.label}</Typography>
            <Typography variant="subtitle1" fontWeight={600} color={headingColor} mt={0.25}>
              {item.value}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* ===== CONFIGURED SCHEDULES ===== */}
      <Box sx={{ px: 3, pb: 2 }}>
        <Typography variant="h6" fontWeight={600} color={headingColor} mb={1.5}>
          Configured Schedules
        </Typography>
        <Box sx={{ bgcolor: cardBg, border: cardBorder, borderRadius: "12px", p: "18px 22px" }}>
          <Box display="flex" alignItems="center" gap={1.5} mb={scheduleEnabled ? 1.5 : 0}>
            <Box sx={{ width: 36, height: 36, borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: scheduleEnabled ? (isDark ? "rgba(37,99,235,0.1)" : "#EFF6FF") : (isDark ? "rgba(100,116,139,0.1)" : "#F3F4F6") }}>
              <ScheduleOutlined sx={{ fontSize: 20, color: scheduleEnabled ? "#2563EB" : (isDark ? "#64748B" : "#9CA3AF") }} />
            </Box>
            <Box flex={1}>
              <Typography variant="subtitle2" fontWeight={600} color={headingColor}>
                Load Schedule: {scheduleEnabled ? "Configured" : "Not configured"}
              </Typography>
              {!scheduleEnabled && (
                <Typography variant="caption" color={labelColor} fontSize={11}>
                  No schedule has been set. Configure one in the control panel below.
                </Typography>
              )}
            </Box>
            <Chip
              label={scheduleEnabled ? "ACTIVE" : "NONE"}
              size="small"
              sx={{
                height: 22,
                fontSize: 10,
                fontWeight: 700,
                bgcolor: scheduleEnabled ? (isDark ? "rgba(16,185,129,0.15)" : "#ECFDF5") : (isDark ? "rgba(100,116,139,0.12)" : "#F3F4F6"),
                color: scheduleEnabled ? "#10B981" : (isDark ? "#64748B" : "#9CA3AF"),
              }}
            />
          </Box>
          {scheduleEnabled && (
            <Box>
              {/* Action that will be performed */}
              <Box sx={{ mb: 1.5, p: 1.5, borderRadius: "8px", bgcolor: isDark ? "rgba(37,99,235,0.06)" : "#F0F9FF", border: `1px solid ${isDark ? "rgba(37,99,235,0.15)" : "#BFDBFE"}` }}>
                <Typography variant="caption" color={labelColor} fontSize={10} fontWeight={600} textTransform="uppercase" letterSpacing="0.5px">
                  Scheduled Action
                </Typography>
                <Typography variant="body2" fontWeight={600} color={headingColor} mt={0.3}>
                  {scheduleAction === "mains_off" && "Turn OFF Mains Power"}
                  {scheduleAction === "mains_on" && "Turn ON Mains Power"}
                  {scheduleAction === "geyser_off" && "Turn OFF Geyser / Water Heater"}
                  {scheduleAction === "geyser_on" && "Turn ON Geyser / Water Heater"}
                  {!["mains_off","mains_on","geyser_off","geyser_on"].includes(scheduleAction) && (scheduleAction || "Not specified")}
                </Typography>
                {scheduleStartDate && (
                  <Typography variant="caption" color={labelColor} fontSize={10} mt={0.5} display="block">
                    From: {scheduleStartDate}{scheduleEndDate ? ` to ${scheduleEndDate}` : " (no end date)"}
                  </Typography>
                )}
              </Box>
              {schedulePeriods.map((period, idx) => (
                <Box
                  key={idx}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    flexWrap: "wrap",
                    py: 1,
                    borderTop: idx > 0 ? `1px solid ${isDark ? "#1E293B" : "#E5E7EB"}` : "none",
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <Typography variant="caption" color={labelColor} fontSize={11} sx={{ minWidth: 55 }}>
                      Period {idx + 1}:
                    </Typography>
                    <Chip
                      label={`${period.startTime} - ${period.endTime}`}
                      size="small"
                      sx={{
                        height: 24,
                        fontSize: 11,
                        fontWeight: 600,
                        bgcolor: isDark ? "rgba(37,99,235,0.12)" : "#DBEAFE",
                        color: "#2563EB",
                      }}
                    />
                  </Box>
                  <Box display="flex" gap={0.5} flexWrap="wrap">
                    {[
                      { label: "Mon", value: 1 },
                      { label: "Tue", value: 2 },
                      { label: "Wed", value: 3 },
                      { label: "Thu", value: 4 },
                      { label: "Fri", value: 5 },
                      { label: "Sat", value: 6 },
                      { label: "Sun", value: 0 },
                    ].map(day => {
                      const active = period.days.includes(day.value);
                      return (
                        <Chip
                          key={day.value}
                          label={day.label}
                          size="small"
                          sx={{
                            height: 22,
                            fontSize: 10,
                            fontWeight: active ? 600 : 400,
                            bgcolor: active ? (isDark ? "rgba(37,99,235,0.2)" : "#DBEAFE") : "transparent",
                            color: active ? "#2563EB" : (isDark ? "#475569" : "#D1D5DB"),
                            border: active ? "1px solid #2563EB" : `1px solid ${isDark ? "#334155" : "#E5E7EB"}`,
                          }}
                        />
                      );
                    })}
                  </Box>
                </Box>
              ))}
              {(scheduleStartDate || scheduleEndDate) && (
                <Box sx={{ display: "flex", gap: 2, mt: 1, pt: 1, borderTop: `1px solid ${isDark ? "#1E293B" : "#E5E7EB"}` }}>
                  {scheduleStartDate && (
                    <Box>
                      <Typography variant="caption" color={labelColor} fontSize={10}>Start Date</Typography>
                      <Typography variant="body2" fontWeight={600} color={headingColor} fontSize={12}>
                        {new Date(scheduleStartDate + "T00:00").toLocaleDateString()}
                      </Typography>
                    </Box>
                  )}
                  {scheduleEndDate && (
                    <Box>
                      <Typography variant="caption" color={labelColor} fontSize={10}>End Date</Typography>
                      <Typography variant="body2" fontWeight={600} color={headingColor} fontSize={12}>
                        {new Date(scheduleEndDate + "T00:00").toLocaleDateString()}
                      </Typography>
                    </Box>
                  )}
                </Box>
              )}
            </Box>
          )}
        </Box>
      </Box>


      {/* ===== GROUP METERS TABLE ===== */}
      <Box sx={{ px: 3, pb: 2 }}>
        <Typography variant="h6" fontWeight={600} color={headingColor} mb={1.5}>
          Group Meters ({groupMembers.length})
        </Typography>
        <Box sx={{ bgcolor: cardBg, border: cardBorder, borderRadius: "12px", overflow: "hidden" }}>
          {groupMembers.length === 0 ? (
            <Box sx={{ p: 4, textAlign: "center" }}>
              <Typography color={labelColor}>No meters in this group yet</Typography>
            </Box>
          ) : (
            <Box sx={{ maxHeight: 360, overflowY: "auto" }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    {["DRN", "Customer", "Area", "Status", "Mains", "Geyser", "Units (kWh)", "Tariff", ""].map(col => (
                      <TableCell
                        key={col}
                        sx={{
                          bgcolor: isDark ? colors.primary[400] : "#F9FAFB",
                          color: labelColor,
                          fontWeight: 600,
                          fontSize: 12,
                          borderColor: isDark ? "#1E293B" : "#E5E7EB",
                          py: 1.5,
                        }}
                      >
                        {col}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {groupMembers.map(m => {
                    const online = isOnline(m);
                    const mainsOn = m.mains_state === "1" || m.mains_state === 1;
                    const geyserOn = m.geyser_state === "1" || m.geyser_state === 1;
                    return (
                      <TableRow
                        key={m.DRN}
                        hover
                        onClick={() => navigate(`/meter/${m.DRN}`)}
                        sx={{
                          cursor: "pointer",
                          "&:hover": { bgcolor: isDark ? "rgba(37,99,235,0.05)" : "#F9FAFB" },
                        }}
                      >
                        <TableCell sx={{ color: headingColor, fontWeight: 600, fontSize: 12, fontFamily: "monospace", borderColor: isDark ? "#1E293B" : "#E5E7EB" }}>
                          {m.DRN}
                        </TableCell>
                        <TableCell sx={{ color: isDark ? colors.grey[200] : "#374151", fontSize: 12, borderColor: isDark ? "#1E293B" : "#E5E7EB" }}>
                          {m.customerName || "---"}
                        </TableCell>
                        <TableCell sx={{ color: labelColor, fontSize: 12, borderColor: isDark ? "#1E293B" : "#E5E7EB" }}>
                          {m.LocationName || "---"}
                        </TableCell>
                        <TableCell sx={{ borderColor: isDark ? "#1E293B" : "#E5E7EB" }}>
                          <Chip
                            icon={<FiberManualRecord sx={{ fontSize: 8 }} />}
                            label={online ? "Online" : "Offline"}
                            size="small"
                            sx={{
                              height: 22, fontSize: 10,
                              bgcolor: online ? (isDark ? "rgba(16,185,129,0.15)" : "#ECFDF5") : (isDark ? "rgba(239,68,68,0.15)" : "#FEF2F2"),
                              color: online ? "#10B981" : "#EF4444",
                              "& .MuiChip-icon": { color: online ? "#10B981" : "#EF4444" },
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ borderColor: isDark ? "#1E293B" : "#E5E7EB" }}>
                          <Chip
                            label={mainsOn ? "ON" : "OFF"}
                            size="small"
                            sx={{
                              height: 20, fontSize: 10,
                              bgcolor: mainsOn ? (isDark ? "rgba(16,185,129,0.12)" : "#ECFDF5") : (isDark ? "rgba(239,68,68,0.12)" : "#FEF2F2"),
                              color: mainsOn ? "#10B981" : "#EF4444",
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ borderColor: isDark ? "#1E293B" : "#E5E7EB" }}>
                          <Chip
                            label={geyserOn ? "ON" : "OFF"}
                            size="small"
                            sx={{
                              height: 20, fontSize: 10,
                              bgcolor: geyserOn ? (isDark ? "rgba(245,158,11,0.12)" : "#FFFBEB") : (isDark ? "rgba(100,116,139,0.12)" : "#F3F4F6"),
                              color: geyserOn ? "#F59E0B" : (isDark ? colors.grey[500] : "#9CA3AF"),
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ color: isDark ? colors.grey[200] : "#374151", fontSize: 12, borderColor: isDark ? "#1E293B" : "#E5E7EB" }}>
                          {m.CumulativeUnits || m.credit || "—"}
                        </TableCell>
                        <TableCell sx={{ color: isDark ? colors.grey[200] : "#374151", fontSize: 12, borderColor: isDark ? "#1E293B" : "#E5E7EB" }}>
                          {m.tariff_type || m.TariffType || "—"}
                        </TableCell>
                        <TableCell sx={{ borderColor: isDark ? "#1E293B" : "#E5E7EB" }} onClick={(e) => e.stopPropagation()}>
                          <IconButton
                            size="small"
                            onClick={(e) => { e.stopPropagation(); handleRemoveMeter(m.DRN); }}
                            sx={{ color: "#EF4444", p: "4px" }}
                          >
                            <RemoveCircleOutlineOutlined sx={{ fontSize: 16 }} />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          )}
        </Box>
      </Box>

      {/* ===== AVAILABLE METERS ===== */}
      <Box sx={{ px: 3, pb: 2 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5}>
          <Typography variant="h6" fontWeight={600} color={headingColor}>
            Available Meters
          </Typography>
          <TextField
            size="small"
            placeholder="Search DRN, name, area..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{
              width: 260,
              "& .MuiOutlinedInput-root": {
                bgcolor: isDark ? colors.primary[400] : "#FFFFFF",
                borderRadius: "8px",
                height: 36,
                fontSize: 13,
                border: cardBorder,
                "& fieldset": { border: "none" },
              },
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlined sx={{ fontSize: 18, color: labelColor }} />
                </InputAdornment>
              ),
            }}
          />
        </Box>
        <Box sx={{ bgcolor: cardBg, border: cardBorder, borderRadius: "12px", overflow: "hidden" }}>
          <Box sx={{ maxHeight: 320, overflowY: "auto" }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {["DRN", "Customer", "Area", "Status", "Units (kWh)", "Tariff", ""].map(col => (
                    <TableCell
                      key={col}
                      sx={{
                        bgcolor: isDark ? colors.primary[400] : "#F9FAFB",
                        color: labelColor,
                        fontWeight: 600,
                        fontSize: 12,
                        borderColor: isDark ? "#1E293B" : "#E5E7EB",
                        py: 1.5,
                      }}
                    >
                      {col}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {availableMeters.slice(0, 100).map(m => {
                  const online = isOnline(m);
                  return (
                    <TableRow
                      key={m.DRN}
                      hover
                      onClick={() => navigate(`/meter/${m.DRN}`)}
                      sx={{
                        cursor: "pointer",
                        "&:hover": { bgcolor: isDark ? "rgba(37,99,235,0.05)" : "#F9FAFB" },
                      }}
                    >
                      <TableCell sx={{ color: headingColor, fontWeight: 600, fontSize: 12, fontFamily: "monospace", borderColor: isDark ? "#1E293B" : "#E5E7EB" }}>
                        {m.DRN}
                      </TableCell>
                      <TableCell sx={{ color: isDark ? colors.grey[200] : "#374151", fontSize: 12, borderColor: isDark ? "#1E293B" : "#E5E7EB" }}>
                        {m.customerName || "---"}
                      </TableCell>
                      <TableCell sx={{ color: labelColor, fontSize: 12, borderColor: isDark ? "#1E293B" : "#E5E7EB" }}>
                        {m.LocationName || "---"}
                      </TableCell>
                      <TableCell sx={{ borderColor: isDark ? "#1E293B" : "#E5E7EB" }}>
                        <Chip
                          label={online ? "Online" : "Offline"}
                          size="small"
                          sx={{
                            height: 20, fontSize: 10,
                            bgcolor: online ? (isDark ? "rgba(16,185,129,0.15)" : "#ECFDF5") : (isDark ? "rgba(239,68,68,0.15)" : "#FEF2F2"),
                            color: online ? "#10B981" : "#EF4444",
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ color: isDark ? colors.grey[200] : "#374151", fontSize: 12, borderColor: isDark ? "#1E293B" : "#E5E7EB" }}>
                        {m.CumulativeUnits || m.credit || "—"}
                      </TableCell>
                      <TableCell sx={{ color: isDark ? colors.grey[200] : "#374151", fontSize: 12, borderColor: isDark ? "#1E293B" : "#E5E7EB" }}>
                        {m.tariff_type || m.TariffType || "—"}
                      </TableCell>
                      <TableCell sx={{ borderColor: isDark ? "#1E293B" : "#E5E7EB" }} onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="small"
                          startIcon={<AddOutlined sx={{ fontSize: 14 }} />}
                          onClick={(e) => { e.stopPropagation(); handleAddMeter(m.DRN); }}
                          sx={{
                            textTransform: "none",
                            fontSize: 11,
                            borderRadius: "6px",
                            color: "#2563EB",
                            minWidth: "auto",
                            px: 1,
                            "&:hover": { bgcolor: isDark ? "rgba(37,99,235,0.1)" : "#EFF6FF" },
                          }}
                        >
                          Add
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
          {availableMeters.length > 100 && (
            <Box sx={{ p: 1.5, textAlign: "center", borderTop: cardBorder }}>
              <Typography variant="caption" color={labelColor}>
                Showing 100 of {availableMeters.length} available meters. Use search to narrow results.
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* ===== CONTROL PANEL ===== */}
      <Box sx={{ px: 3, pb: 2 }}>
        <Typography variant="h6" fontWeight={600} color={headingColor} mb={1.5}>
          Control Panel
        </Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 2 }}>

          {/* Mains Control */}
          <Box sx={{ bgcolor: cardBg, border: cardBorder, borderRadius: "12px", p: "20px" }}>
            <Box display="flex" alignItems="center" gap={1.5} mb={1}>
              <Box sx={{ width: 36, height: 36, borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: isDark ? "rgba(239,68,68,0.1)" : "#FEF2F2" }}>
                <BoltOutlined sx={{ fontSize: 20, color: "#EF4444" }} />
              </Box>
              <Box flex={1}>
                <Typography variant="subtitle2" fontWeight={600} color={headingColor}>Mains Control</Typography>
                <Typography variant="caption" color={labelColor} fontSize={11}>Toggle mains relay for all group meters</Typography>
              </Box>
            </Box>
            <Box display="flex" gap={1.5} mt={2}>
              <Button variant="contained" size="small"
                onClick={() => handleExecute("mains_on", "Turn ON Mains")}
                disabled={groupMembers.length === 0}
                sx={{ flex: 1, textTransform: "none", fontWeight: 600, fontSize: 12, borderRadius: "8px", bgcolor: "#10B981", "&:hover": { bgcolor: "#059669" }, py: 1 }}>
                Turn ON
              </Button>
              <Button variant="contained" size="small"
                onClick={() => handleExecute("mains_off", "Turn OFF Mains")}
                disabled={groupMembers.length === 0}
                sx={{ flex: 1, textTransform: "none", fontWeight: 600, fontSize: 12, borderRadius: "8px", bgcolor: "#EF4444", "&:hover": { bgcolor: "#DC2626" }, py: 1 }}>
                Turn OFF
              </Button>
            </Box>
          </Box>

          {/* Geyser Control */}
          <Box sx={{ bgcolor: cardBg, border: cardBorder, borderRadius: "12px", p: "20px" }}>
            <Box display="flex" alignItems="center" gap={1.5} mb={1}>
              <Box sx={{ width: 36, height: 36, borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: isDark ? "rgba(245,158,11,0.1)" : "#FFFBEB" }}>
                <WaterDropOutlined sx={{ fontSize: 20, color: "#F59E0B" }} />
              </Box>
              <Box flex={1}>
                <Typography variant="subtitle2" fontWeight={600} color={headingColor}>Geyser Control</Typography>
                <Typography variant="caption" color={labelColor} fontSize={11}>Toggle geyser/water heater relay</Typography>
              </Box>
            </Box>
            <Box display="flex" gap={1.5} mt={2}>
              <Button variant="contained" size="small"
                onClick={() => handleExecute("geyser_on", "Turn ON Geysers")}
                disabled={groupMembers.length === 0}
                sx={{ flex: 1, textTransform: "none", fontWeight: 600, fontSize: 12, borderRadius: "8px", bgcolor: "#F59E0B", "&:hover": { bgcolor: "#D97706" }, py: 1 }}>
                Turn ON
              </Button>
              <Button variant="contained" size="small"
                onClick={() => handleExecute("geyser_off", "Turn OFF Geysers")}
                disabled={groupMembers.length === 0}
                sx={{ flex: 1, textTransform: "none", fontWeight: 600, fontSize: 12, borderRadius: "8px", bgcolor: "#EF4444", "&:hover": { bgcolor: "#DC2626" }, py: 1 }}>
                Turn OFF
              </Button>
            </Box>
          </Box>

          {/* Power Limit */}
          <Box sx={{ bgcolor: cardBg, border: cardBorder, borderRadius: "12px", p: "20px" }}>
            <Box display="flex" alignItems="center" gap={1.5} mb={1}>
              <Box sx={{ width: 36, height: 36, borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: isDark ? "rgba(37,99,235,0.1)" : "#EFF6FF" }}>
                <SpeedOutlined sx={{ fontSize: 20, color: "#2563EB" }} />
              </Box>
              <Box>
                <Typography variant="subtitle2" fontWeight={600} color={headingColor}>Power Limit</Typography>
                <Typography variant="caption" color={labelColor} fontSize={11}>Set maximum power limit (watts)</Typography>
              </Box>
            </Box>
            <Box px={1} mt={1}>
              <Slider
                value={powerLimit}
                onChange={(e, v) => setPowerLimit(v)}
                min={0}
                max={10000}
                step={100}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => `${v}W`}
                sx={{
                  color: "#2563EB",
                  "& .MuiSlider-thumb": { width: 16, height: 16 },
                  "& .MuiSlider-track": { height: 4 },
                  "& .MuiSlider-rail": { height: 4, bgcolor: isDark ? "#374151" : "#E5E7EB" },
                }}
              />
              <Box display="flex" justifyContent="space-between" mt={0.5}>
                <Typography variant="caption" color={labelColor}>0W</Typography>
                <Typography variant="caption" color={headingColor} fontWeight={600}>{powerLimit}W</Typography>
                <Typography variant="caption" color={labelColor}>10,000W</Typography>
              </Box>
            </Box>
            <Button
              fullWidth
              variant="contained"
              onClick={() => handleExecute(`power_limit_${powerLimit}`, `Set power limit to ${powerLimit}W`)}
              disabled={groupMembers.length === 0}
              sx={{
                mt: 1.5,
                textTransform: "none",
                fontSize: 12,
                borderRadius: "8px",
                bgcolor: "#2563EB",
                "&:hover": { bgcolor: "#1D4ED8" },
              }}
            >
              Set Limit
            </Button>
          </Box>

          {/* Calibration */}
          <Box sx={{ bgcolor: cardBg, border: cardBorder, borderRadius: "12px", p: "20px" }}>
            <Box display="flex" alignItems="center" gap={1.5} mb={1}>
              <Box sx={{ width: 36, height: 36, borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: isDark ? "rgba(139,92,246,0.1)" : "#F5F3FF" }}>
                <BuildOutlined sx={{ fontSize: 20, color: "#8B5CF6" }} />
              </Box>
              <Box>
                <Typography variant="subtitle2" fontWeight={600} color={headingColor}>Calibration</Typography>
                <Typography variant="caption" color={labelColor} fontSize={11}>Voltage and current calibration controls</Typography>
              </Box>
            </Box>
            <Box display="flex" flexDirection="column" gap={1} mt={2}>
              <Button
                fullWidth
                variant="outlined"
                onClick={() => handleExecute("calibrate_auto", "Auto-calibrate meters")}
                disabled={groupMembers.length === 0}
                sx={{
                  textTransform: "none",
                  fontSize: 12,
                  borderRadius: "8px",
                  borderColor: isDark ? "#374151" : "#D1D5DB",
                  color: headingColor,
                  "&:hover": { bgcolor: isDark ? "rgba(139,92,246,0.08)" : "#F5F3FF", borderColor: "#8B5CF6" },
                }}
              >
                Auto-Calibrate
              </Button>
              <Button
                fullWidth
                variant="outlined"
                onClick={() => handleExecute("calibrate_verify", "Verify calibration")}
                disabled={groupMembers.length === 0}
                sx={{
                  textTransform: "none",
                  fontSize: 12,
                  borderRadius: "8px",
                  borderColor: isDark ? "#374151" : "#D1D5DB",
                  color: headingColor,
                  "&:hover": { bgcolor: isDark ? "rgba(139,92,246,0.08)" : "#F5F3FF", borderColor: "#8B5CF6" },
                }}
              >
                Verify Calibration
              </Button>
              <Button
                fullWidth
                variant="outlined"
                onClick={() => handleExecute("calibrate_exercise", "Exercise load switch")}
                disabled={groupMembers.length === 0}
                sx={{
                  textTransform: "none",
                  fontSize: 12,
                  borderRadius: "8px",
                  borderColor: isDark ? "#374151" : "#D1D5DB",
                  color: headingColor,
                  "&:hover": { bgcolor: isDark ? "rgba(139,92,246,0.08)" : "#F5F3FF", borderColor: "#8B5CF6" },
                }}
              >
                Exercise Load Switch
              </Button>
            </Box>
          </Box>

          {/* Schedule Control */}
          <Box sx={{ bgcolor: cardBg, border: cardBorder, borderRadius: "12px", p: "20px" }}>
            <Box display="flex" alignItems="center" gap={1.5} mb={1}>
              <Box sx={{ width: 36, height: 36, borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: isDark ? "rgba(37,99,235,0.1)" : "#EFF6FF" }}>
                <ScheduleOutlined sx={{ fontSize: 20, color: "#2563EB" }} />
              </Box>
              <Box flex={1}>
                <Typography variant="subtitle2" fontWeight={600} color={headingColor}>Load Shedding Schedule</Typography>
                <Typography variant="caption" color={labelColor} fontSize={11}>Configure timed load control</Typography>
              </Box>
            </Box>
            <FormControlLabel
              control={
                <Switch
                  checked={scheduleEnabled}
                  onChange={(e) => setScheduleEnabled(e.target.checked)}
                  size="small"
                  sx={{ "& .MuiSwitch-switchBase.Mui-checked": { color: "#2563EB" }, "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": { bgcolor: "#2563EB" } }}
                />
              }
              label={<Typography variant="caption" color={labelColor}>{scheduleEnabled ? "Enabled" : "Disabled"}</Typography>}
              sx={{ mb: 1 }}
            />
            {scheduleEnabled && (
              <Box>
                {/* Action selector */}
                <FormControl size="small" fullWidth sx={{ mb: 1.5 }}>
                  <InputLabel>Action to perform</InputLabel>
                  <Select value={scheduleAction} onChange={(e) => setScheduleAction(e.target.value)} label="Action to perform">
                    <MenuItem value="mains_off">Turn OFF Mains Power</MenuItem>
                    <MenuItem value="mains_on">Turn ON Mains Power</MenuItem>
                    <MenuItem value="geyser_off">Turn OFF Geyser / Water Heater</MenuItem>
                    <MenuItem value="geyser_on">Turn ON Geyser / Water Heater</MenuItem>
                  </Select>
                </FormControl>
                {schedulePeriods.map((period, idx) => (
                  <Box key={idx} sx={{ border: cardBorder, borderRadius: "8px", p: 1.5, mb: 1 }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                      <Typography variant="caption" fontWeight={600} color={headingColor}>Period {idx + 1}</Typography>
                      {schedulePeriods.length > 1 && (
                        <Button
                          size="small"
                          onClick={() => setSchedulePeriods(prev => prev.filter((_, i) => i !== idx))}
                          sx={{ color: "#EF4444", fontSize: 10, minWidth: "auto", textTransform: "none", p: "2px 6px" }}
                        >
                          Remove
                        </Button>
                      )}
                    </Box>
                    <Box display="flex" gap={1} mb={1}>
                      <TextField
                        label="Start"
                        type="time"
                        value={period.startTime}
                        onChange={(e) => {
                          const updated = [...schedulePeriods];
                          updated[idx] = { ...updated[idx], startTime: e.target.value };
                          setSchedulePeriods(updated);
                        }}
                        size="small"
                        fullWidth
                        InputLabelProps={{ shrink: true }}
                        sx={{ "& .MuiOutlinedInput-root": { fontSize: 12 } }}
                      />
                      <TextField
                        label="End"
                        type="time"
                        value={period.endTime}
                        onChange={(e) => {
                          const updated = [...schedulePeriods];
                          updated[idx] = { ...updated[idx], endTime: e.target.value };
                          setSchedulePeriods(updated);
                        }}
                        size="small"
                        fullWidth
                        InputLabelProps={{ shrink: true }}
                        sx={{ "& .MuiOutlinedInput-root": { fontSize: 12 } }}
                      />
                    </Box>
                    <Box display="flex" gap={0.5} flexWrap="wrap">
                      {[
                        { label: "Mon", value: 1 },
                        { label: "Tue", value: 2 },
                        { label: "Wed", value: 3 },
                        { label: "Thu", value: 4 },
                        { label: "Fri", value: 5 },
                        { label: "Sat", value: 6 },
                        { label: "Sun", value: 0 },
                      ].map(day => {
                        const active = period.days.includes(day.value);
                        return (
                          <Chip
                            key={day.value}
                            label={day.label}
                            size="small"
                            onClick={() => {
                              const updated = [...schedulePeriods];
                              updated[idx] = {
                                ...updated[idx],
                                days: active ? updated[idx].days.filter(d => d !== day.value) : [...updated[idx].days, day.value],
                              };
                              setSchedulePeriods(updated);
                            }}
                            sx={{
                              height: 24,
                              fontSize: 10,
                              fontWeight: 500,
                              cursor: "pointer",
                              bgcolor: active ? (isDark ? "rgba(37,99,235,0.2)" : "#DBEAFE") : (isDark ? "rgba(100,116,139,0.12)" : "#F3F4F6"),
                              color: active ? "#2563EB" : labelColor,
                              border: active ? "1px solid #2563EB" : "1px solid transparent",
                              "&:hover": { bgcolor: active ? (isDark ? "rgba(37,99,235,0.3)" : "#BFDBFE") : (isDark ? "rgba(100,116,139,0.2)" : "#E5E7EB") },
                            }}
                          />
                        );
                      })}
                    </Box>
                  </Box>
                ))}
                <Button
                  size="small"
                  startIcon={<AddOutlined sx={{ fontSize: 14 }} />}
                  onClick={() => setSchedulePeriods(prev => [...prev, { startTime: "08:00", endTime: "17:00", days: [1, 2, 3, 4, 5] }])}
                  sx={{ textTransform: "none", fontSize: 11, color: "#2563EB", mb: 1 }}
                >
                  Add Period
                </Button>
                <Box display="flex" gap={1} mb={1.5}>
                  <TextField
                    label="Start Date"
                    type="date"
                    value={scheduleStartDate}
                    onChange={(e) => setScheduleStartDate(e.target.value)}
                    size="small"
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    sx={{ "& .MuiOutlinedInput-root": { fontSize: 12 } }}
                  />
                  <TextField
                    label="End Date"
                    type="date"
                    value={scheduleEndDate}
                    onChange={(e) => setScheduleEndDate(e.target.value)}
                    size="small"
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    sx={{ "& .MuiOutlinedInput-root": { fontSize: 12 } }}
                  />
                </Box>
                <Button
                  fullWidth
                  variant="contained"
                  onClick={async () => {
                    try {
                      await groupControlAPI.updateGroup(groupId, {
                        schedule: {
                          enabled: scheduleEnabled,
                          action: scheduleAction,
                          periods: schedulePeriods,
                          startDate: scheduleStartDate,
                          endDate: scheduleEndDate || null,
                        }
                      });
                      setSnackbar({ open: true, message: "Schedule saved successfully", severity: "success" });
                    } catch (err) {
                      setSnackbar({ open: true, message: "Save failed: " + err.message, severity: "error" });
                    }
                  }}
                  sx={{
                    textTransform: "none",
                    fontSize: 12,
                    borderRadius: "8px",
                    bgcolor: "#2563EB",
                    "&:hover": { bgcolor: "#1D4ED8" },
                  }}
                >
                  Save Schedule
                </Button>
              </Box>
            )}
          </Box>

          {/* Calibration Routine */}
          <Box sx={{ bgcolor: cardBg, border: cardBorder, borderRadius: "12px", p: "20px" }}>
            <Box display="flex" alignItems="center" gap={1.5} mb={1}>
              <Box sx={{ width: 36, height: 36, borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: isDark ? "rgba(16,185,129,0.1)" : "#ECFDF5" }}>
                <AutorenewOutlined sx={{ fontSize: 20, color: "#10B981" }} />
              </Box>
              <Box flex={1}>
                <Typography variant="subtitle2" fontWeight={600} color={headingColor}>Auto-Calibration Schedule</Typography>
                <Typography variant="caption" color={labelColor} fontSize={11}>Recurring calibration routine</Typography>
              </Box>
            </Box>
            <FormControlLabel
              control={
                <Switch
                  checked={calRoutineEnabled}
                  onChange={(e) => setCalRoutineEnabled(e.target.checked)}
                  size="small"
                  sx={{ "& .MuiSwitch-switchBase.Mui-checked": { color: "#10B981" }, "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": { bgcolor: "#10B981" } }}
                />
              }
              label={<Typography variant="caption" color={labelColor}>{calRoutineEnabled ? "Enabled" : "Disabled"}</Typography>}
              sx={{ mb: 1 }}
            />
            {calRoutineEnabled && (
              <Box>
                <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
                  <InputLabel>Recalibration Period</InputLabel>
                  <Select
                    value={calPeriod}
                    onChange={(e) => setCalPeriod(e.target.value)}
                    label="Recalibration Period"
                    sx={{ fontSize: 12 }}
                  >
                    <MenuItem value="daily">Daily</MenuItem>
                    <MenuItem value="weekly">Weekly</MenuItem>
                    <MenuItem value="bi-weekly">Bi-Weekly</MenuItem>
                    <MenuItem value="monthly">Monthly</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  label="Preferred Time"
                  type="time"
                  value={calPreferredTime}
                  onChange={(e) => setCalPreferredTime(e.target.value)}
                  size="small"
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  sx={{ mb: 1.5, "& .MuiOutlinedInput-root": { fontSize: 12 } }}
                />
                <Box sx={{ bgcolor: isDark ? "rgba(16,185,129,0.06)" : "#F0FDF4", borderRadius: "8px", p: 1.5, mb: 1.5 }}>
                  <Typography variant="caption" color={labelColor} display="block">Next Calibration</Typography>
                  <Typography variant="subtitle2" fontWeight={600} color={headingColor} mt={0.25}>
                    {(() => {
                      const now = new Date();
                      const periodDays = { daily: 1, weekly: 7, "bi-weekly": 14, monthly: 30 };
                      const next = new Date(now.getTime() + (periodDays[calPeriod] || 7) * 86400000);
                      return next.toLocaleDateString() + " at " + calPreferredTime;
                    })()}
                  </Typography>
                </Box>
                <Button
                  fullWidth
                  variant="contained"
                  onClick={() => {
                    setSnackbar({ open: true, message: "Calibration routine saved", severity: "success" });
                  }}
                  sx={{
                    textTransform: "none",
                    fontSize: 12,
                    borderRadius: "8px",
                    bgcolor: "#10B981",
                    "&:hover": { bgcolor: "#059669" },
                  }}
                >
                  Save Routine
                </Button>
              </Box>
            )}
          </Box>
        </Box>
      </Box>

      {/* ===== COMMAND HISTORY ===== */}
      <Box sx={{ px: 3, pb: 4 }}>
        <Box display="flex" alignItems="center" gap={1} mb={1.5}>
          <HistoryOutlined sx={{ fontSize: 20, color: labelColor }} />
          <Typography variant="h6" fontWeight={600} color={headingColor}>
            Command History
          </Typography>
        </Box>
        <Box sx={{ bgcolor: cardBg, border: cardBorder, borderRadius: "12px", overflow: "hidden" }}>
          {history.length === 0 ? (
            <Box sx={{ p: 4, textAlign: "center" }}>
              <Typography color={labelColor}>No commands sent to this group yet</Typography>
            </Box>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  {["Time", "Action", "Meters", "Status", "Executed By", "Reason"].map(col => (
                    <TableCell
                      key={col}
                      sx={{
                        bgcolor: isDark ? colors.primary[400] : "#F9FAFB",
                        color: labelColor,
                        fontWeight: 600,
                        fontSize: 12,
                        borderColor: isDark ? "#1E293B" : "#E5E7EB",
                      }}
                    >
                      {col}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {history.map(h => (
                  <TableRow key={h.id}>
                    <TableCell sx={{ color: isDark ? colors.grey[200] : "#374151", fontSize: 12, borderColor: isDark ? "#1E293B" : "#E5E7EB" }}>
                      {new Date(h.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell sx={{ borderColor: isDark ? "#1E293B" : "#E5E7EB" }}>
                      <Chip
                        label={h.action_type?.replace("_", " ")}
                        size="small"
                        sx={{
                          height: 20, fontSize: 10, textTransform: "capitalize",
                          bgcolor: h.action_type?.endsWith("_off")
                            ? isDark ? "rgba(239,68,68,0.15)" : "#FEF2F2"
                            : isDark ? "rgba(16,185,129,0.15)" : "#ECFDF5",
                          color: h.action_type?.endsWith("_off") ? "#EF4444" : "#10B981",
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ color: isDark ? colors.grey[200] : "#374151", fontSize: 12, borderColor: isDark ? "#1E293B" : "#E5E7EB" }}>
                      {h.meter_count}
                    </TableCell>
                    <TableCell sx={{ borderColor: isDark ? "#1E293B" : "#E5E7EB" }}>
                      <Chip
                        label={h.status}
                        size="small"
                        sx={{
                          height: 20, fontSize: 10,
                          bgcolor: h.status === "completed"
                            ? isDark ? "rgba(16,185,129,0.15)" : "#ECFDF5"
                            : h.status === "failed"
                            ? isDark ? "rgba(239,68,68,0.15)" : "#FEF2F2"
                            : isDark ? "rgba(245,158,11,0.15)" : "#FFFBEB",
                          color: h.status === "completed" ? "#10B981" : h.status === "failed" ? "#EF4444" : "#F59E0B",
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ color: isDark ? colors.grey[200] : "#374151", fontSize: 12, borderColor: isDark ? "#1E293B" : "#E5E7EB" }}>
                      {h.executed_by || "---"}
                    </TableCell>
                    <TableCell sx={{ color: labelColor, fontSize: 11, borderColor: isDark ? "#1E293B" : "#E5E7EB" }}>
                      {h.reason || "---"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Box>
      </Box>

      {/* ===== CONFIRM DIALOG ===== */}
      <Dialog
        open={confirmDialog.open}
        onClose={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
        PaperProps={{
          sx: {
            bgcolor: isDark ? colors.primary[400] : "#FFFFFF",
            borderRadius: "16px",
            minWidth: 400,
            border: cardBorder,
          },
        }}
      >
        <DialogTitle sx={{ color: headingColor, fontWeight: 600 }}>
          {confirmDialog.title}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color={labelColor}>
            {confirmDialog.description}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
            sx={{ color: labelColor, borderRadius: "8px", textTransform: "none" }}
          >
            Cancel
          </Button>
          <Button
            onClick={confirmDialog.action}
            variant="contained"
            sx={{
              bgcolor: "#2563EB",
              borderRadius: "8px",
              textTransform: "none",
              "&:hover": { bgcolor: "#1D4ED8" },
            }}
          >
            Execute
          </Button>
        </DialogActions>
      </Dialog>

      {/* ===== DELETE CONFIRM ===== */}
      <Dialog
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        PaperProps={{
          sx: {
            bgcolor: isDark ? colors.primary[400] : "#FFFFFF",
            borderRadius: "16px",
            minWidth: 380,
            border: cardBorder,
          },
        }}
      >
        <DialogTitle sx={{ color: headingColor, fontWeight: 600 }}>
          Delete Group
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color={labelColor}>
            Are you sure you want to delete "{group.name}"? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setShowDeleteConfirm(false)}
            sx={{ color: labelColor, borderRadius: "8px", textTransform: "none" }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeleteGroup}
            variant="contained"
            sx={{
              bgcolor: "#EF4444",
              borderRadius: "8px",
              textTransform: "none",
              "&:hover": { bgcolor: "#DC2626" },
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* ===== SNACKBAR ===== */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          variant="filled"
          sx={{ borderRadius: "10px" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
