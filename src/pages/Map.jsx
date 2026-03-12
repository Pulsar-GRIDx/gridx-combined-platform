import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  InputAdornment,
  Button,
  IconButton,
  Divider,
  useTheme,
} from "@mui/material";
import {
  SearchOutlined,
  MapOutlined,
  OpenInNewOutlined,
  FiberManualRecord,
  LocationOnOutlined,
  SpeedOutlined,
  BoltOutlined,
  ElectricalServicesOutlined,
  GpsFixedOutlined,
  VisibilityOutlined,
} from "@mui/icons-material";
import Header from "../components/Header";
import { tokens } from "../theme";
import { meters, transactions } from "../services/mockData";

/* ---- helpers ---- */
const fmtCurrency = (n) =>
  `N$ ${Number(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function formatDateTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-NA", { year: "numeric", month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString("en-NA", { hour: "2-digit", minute: "2-digit" })
  );
}

/* ---- derived data ---- */
const allAreas = [...new Set(meters.map((m) => m.area))].sort();

const areaSummary = allAreas.map((area) => {
  const areaMeters = meters.filter((m) => m.area === area);
  const active = areaMeters.filter((m) => m.status === "Online").length;
  return { area, total: areaMeters.length, active, inactive: areaMeters.length - active };
});

/* ---- detail row helper ---- */
function DetailRow({ label, value, mono, icon, colors }) {
  return (
    <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.8}>
      <Box display="flex" alignItems="center" gap={0.5}>
        {icon && <Box sx={{ color: colors.grey[400], display: "flex" }}>{icon}</Box>}
        <Typography variant="caption" color={colors.grey[400]}>
          {label}
        </Typography>
      </Box>
      <Typography
        variant="body2"
        sx={{
          color: colors.grey[100],
          fontWeight: 500,
          fontSize: "0.8rem",
          ...(mono ? { fontFamily: "monospace" } : {}),
          textAlign: "right",
          maxWidth: "60%",
          wordBreak: "break-word",
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

/* ==================================================================== */
/* Map Page                                                             */
/* ==================================================================== */
export default function Map() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedDrn, setSelectedDrn] = useState(null);

  /* ---- filtered meters ---- */
  const filtered = useMemo(() => {
    return meters.filter((m) => {
      if (search) {
        const q = search.toLowerCase();
        if (!m.meterNo.toLowerCase().includes(q) && !m.customerName.toLowerCase().includes(q))
          return false;
      }
      if (areaFilter !== "All" && m.area !== areaFilter) return false;
      if (statusFilter !== "All" && m.status !== statusFilter) return false;
      return true;
    });
  }, [search, areaFilter, statusFilter]);

  const selectedMeter = meters.find((m) => m.drn === selectedDrn) || null;

  const meterTransactions = useMemo(() => {
    if (!selectedMeter) return [];
    return transactions
      .filter((t) => t.meterNo === selectedMeter.meterNo)
      .sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime))
      .slice(0, 5);
  }, [selectedMeter]);

  return (
    <Box m="20px">
      <Header
        title="MAP & LOCATIONS"
        subtitle="Geographic meter distribution and locations"
      />

      <Box
        display="grid"
        gridTemplateColumns="repeat(12, 1fr)"
        gridAutoRows="140px"
        gap="5px"
      >
        {/* ---- Area summary cards (span 4) ---- */}
        <Box
          gridColumn="span 4"
          gridRow="span 5"
          backgroundColor={colors.primary[400]}
          p="15px"
          borderRadius="4px"
          overflow="auto"
        >
          <Typography variant="h6" color={colors.grey[100]} fontWeight="bold" mb={2}>
            Meters by Area
          </Typography>
          {areaSummary.map((as) => (
            <Box
              key={as.area}
              mb={1.5}
              p={1.5}
              borderRadius="4px"
              backgroundColor="rgba(10,22,40,0.4)"
              border="1px solid rgba(255,255,255,0.05)"
            >
              <Typography variant="body2" color={colors.grey[400]} fontSize="0.72rem" mb={0.3}>
                {as.area}
              </Typography>
              <Typography variant="h5" color={colors.grey[100]} fontWeight={700} fontSize="1.2rem" mb={0.5}>
                {as.total}
              </Typography>
              <Box display="flex" alignItems="center" gap={1.5}>
                <Box display="flex" alignItems="center" gap={0.3}>
                  <FiberManualRecord sx={{ fontSize: 8, color: colors.greenAccent[500] }} />
                  <Typography variant="caption" color={colors.greenAccent[500]} fontSize="0.68rem">
                    {as.active} online
                  </Typography>
                </Box>
                <Box display="flex" alignItems="center" gap={0.3}>
                  <FiberManualRecord sx={{ fontSize: 8, color: colors.grey[400] }} />
                  <Typography variant="caption" color={colors.grey[400]} fontSize="0.68rem">
                    {as.inactive} offline
                  </Typography>
                </Box>
              </Box>
            </Box>
          ))}
        </Box>

        {/* ---- Meter locations table (span 8, span 5) ---- */}
        <Box
          gridColumn="span 8"
          gridRow="span 5"
          backgroundColor={colors.primary[400]}
          borderRadius="4px"
          overflow="hidden"
          display="flex"
          flexDirection="column"
        >
          {/* ---- Filters ---- */}
          <Box display="flex" gap={1} p="10px" flexWrap="wrap">
            <TextField
              size="small"
              placeholder="Search meter or customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ flex: 1, minWidth: 200 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlined sx={{ color: colors.grey[400] }} />
                  </InputAdornment>
                ),
              }}
            />
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel>Area</InputLabel>
              <Select value={areaFilter} label="Area" onChange={(e) => setAreaFilter(e.target.value)}>
                <MenuItem value="All">All Areas</MenuItem>
                {allAreas.map((a) => (
                  <MenuItem key={a} value={a}>
                    {a}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Status</InputLabel>
              <Select value={statusFilter} label="Status" onChange={(e) => setStatusFilter(e.target.value)}>
                <MenuItem value="All">All</MenuItem>
                <MenuItem value="Online">Online</MenuItem>
                <MenuItem value="Offline">Offline</MenuItem>
                <MenuItem value="Tampered">Tampered</MenuItem>
              </Select>
            </FormControl>
          </Box>

          {/* ---- Table ---- */}
          <TableContainer sx={{ flex: 1, overflow: "auto" }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {["DRN", "Customer", "Area", "Status", "GPS", "Profile"].map((col) => (
                    <TableCell
                      key={col}
                      sx={{
                        bgcolor: colors.primary[400],
                        color: colors.greenAccent[500],
                        fontWeight: 600,
                        fontSize: "0.72rem",
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
                {filtered.map((m) => {
                  const chipColor =
                    m.status === "Online"
                      ? { bg: "rgba(76,206,172,0.15)", text: colors.greenAccent[500] }
                      : m.status === "Tampered"
                      ? { bg: "rgba(219,79,74,0.15)", text: "#db4f4a" }
                      : { bg: "rgba(108,117,125,0.15)", text: colors.grey[400] };
                  return (
                    <TableRow
                      key={m.drn}
                      hover
                      selected={selectedDrn === m.drn}
                      onClick={() => setSelectedDrn(m.drn)}
                      sx={{
                        cursor: "pointer",
                        "&.Mui-selected": { backgroundColor: "rgba(104,112,250,0.12)" },
                        "&:hover": { bgcolor: "rgba(0,180,216,0.06)" },
                        "& td": {
                          borderBottom: "1px solid rgba(255,255,255,0.05)",
                          color: colors.grey[100],
                          fontSize: "0.78rem",
                          py: 0.8,
                        },
                      }}
                    >
                      <TableCell sx={{ fontFamily: "monospace", fontSize: "0.72rem !important" }}>
                        {m.drn}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 500 }}>{m.customerName}</TableCell>
                      <TableCell>{m.area}</TableCell>
                      <TableCell>
                        <Chip
                          label={m.status}
                          size="small"
                          sx={{
                            bgcolor: chipColor.bg,
                            color: chipColor.text,
                            fontWeight: 600,
                            fontSize: "0.68rem",
                            height: 22,
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ fontFamily: "monospace", fontSize: "0.72rem !important" }}>
                        {m.lat.toFixed(4)}, {m.lng.toFixed(4)}
                      </TableCell>
                      <TableCell>
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/meter/${m.drn}`);
                          }}
                          sx={{ color: colors.greenAccent[500] }}
                        >
                          <VisibilityOutlined sx={{ fontSize: 18 }} />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4, color: colors.grey[400] }}>
                      No meters match the current filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </Box>
    </Box>
  );
}
