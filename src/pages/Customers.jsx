import { useState, useEffect, useMemo, useRef } from "react";
import {
  Box,
  Typography,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  InputAdornment,
  Button,
  Divider,
  CircularProgress,
  useTheme,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Snackbar,
  IconButton,
  Tabs,
  Tab,
} from "@mui/material";
import {
  SearchOutlined,
  PersonOutlined,
  ConfirmationNumberOutlined,
  EditOutlined,
  ReceiptLongOutlined,
  SmsOutlined,
  BlockOutlined,
  CheckCircleOutlined,
  PhoneOutlined,
  EmailOutlined,
  LocationOnOutlined,
  GpsFixedOutlined,
  SpeedOutlined,
  AddOutlined,
  UploadFileOutlined,
  CloseOutlined,
  DeleteOutlined,
  DevicesOtherOutlined,
  BusinessOutlined,
  DescriptionOutlined,
  ElectricMeterOutlined,
} from "@mui/icons-material";
import { tokens } from "../theme";
import Header from "../components/Header";
import { vendingAPI, nonGridxAPI } from "../services/api";
import { customers as mockCustomers } from "../services/mockData";

// ---- Helpers ----------------------------------------------------------------

const fmtCurrency = (n) =>
  `N$ ${Number(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function formatDateTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-NA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }) +
    " " +
    d.toLocaleTimeString("en-NA", { hour: "2-digit", minute: "2-digit" })
  );
}

const areas = [
  "All Areas",
  "Grunau",
  "Noordoewer",
  "Groot Aub",
  "Dordabis",
  "Seeis",
  "Stampriet",
  "Windhoek West",
  "Khomasdal",
  "Katutura",
];

const emptyNonGridxForm = {
  name: "", meterNo: "", phone: "", email: "", meterType: "", meterMake: "",
  utilityProvider: "", area: "", address: "", gpsLat: "", gpsLng: "",
  tariffGroup: "Residential", notes: "",
};

// ---- Detail Row helper ------------------------------------------------------

function DetailRow({ label, value, mono, icon, colors }) {
  return (
    <Box display="flex" justifyContent="space-between" alignItems="center" mb="6px">
      <Box display="flex" alignItems="center" gap="4px">
        {icon && <Box sx={{ color: colors.grey[300], display: "flex" }}>{icon}</Box>}
        <Typography variant="caption" color={colors.grey[300]}>{label}</Typography>
      </Box>
      <Typography
        variant="body2"
        sx={{
          color: colors.grey[100], fontWeight: 500, fontSize: "0.8rem",
          ...(mono ? { fontFamily: "monospace" } : {}),
          textAlign: "right", maxWidth: "60%", wordBreak: "break-word",
        }}
      >
        {value || "-"}
      </Typography>
    </Box>
  );
}

// ---- Main Component ---------------------------------------------------------

export default function Customers() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const fileInputRef = useRef(null);

  // Tab: 0 = GridX customers, 1 = Non-GridX customers
  const [tab, setTab] = useState(0);

  // GridX state
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("All Areas");
  const [selectedId, setSelectedId] = useState(null);
  const [customers, setCustomers] = useState(mockCustomers);
  const [loading, setLoading] = useState(true);

  // Non-GridX state
  const [ngSearch, setNgSearch] = useState("");
  const [ngCustomers, setNgCustomers] = useState([]);
  const [ngSelectedId, setNgSelectedId] = useState(null);
  const [ngLoading, setNgLoading] = useState(false);

  // Add dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ ...emptyNonGridxForm });
  const [addSaving, setAddSaving] = useState(false);

  // Import dialog
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // HSM status map: { meterNo: { registered, sgc, krn, ti } }
  const [hsmStatusMap, setHsmStatusMap] = useState({});

  // Snackbar
  const [snack, setSnack] = useState({ open: false, msg: "", severity: "success" });

  // Fetch GridX customers
  useEffect(() => {
    vendingAPI.getCustomers().then(r => {
      if (r.success && r.data?.length > 0) setCustomers(r.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Fetch HSM registration status for GridX customers
  useEffect(() => {
    if (customers.length === 0) return;
    const drns = customers.map((c) => c.meterNo).filter(Boolean);
    if (drns.length === 0) return;
    const token = sessionStorage.getItem("token");
    if (!token) return;
    fetch("/cb/vending/meters-hsm-status", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ drns }),
    })
      .then((r) => r.json())
      .then((r) => { if (r.success) setHsmStatusMap(r.data || {}); })
      .catch(() => {});
  }, [customers]);

  // Fetch Non-GridX customers
  const fetchNonGridx = () => {
    setNgLoading(true);
    nonGridxAPI.getCustomers().then(r => {
      if (r.success) setNgCustomers(r.data || []);
    }).catch(() => {}).finally(() => setNgLoading(false));
  };

  useEffect(() => { fetchNonGridx(); }, []);

  // Filtered lists
  const filtered = useMemo(() => {
    return customers.filter((c) => {
      if (search) {
        const q = search.toLowerCase();
        const match =
          (c.name || "").toLowerCase().includes(q) ||
          (c.accountNo || "").toLowerCase().includes(q) ||
          (c.meterNo || "").toLowerCase().includes(q);
        if (!match) return false;
      }
      if (areaFilter !== "All Areas" && c.area !== areaFilter) return false;
      return true;
    });
  }, [search, areaFilter, customers]);

  const ngFiltered = useMemo(() => {
    if (!ngSearch) return ngCustomers;
    const q = ngSearch.toLowerCase();
    return ngCustomers.filter(
      (c) =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.accountNo || "").toLowerCase().includes(q) ||
        (c.meterNo || "").toLowerCase().includes(q) ||
        (c.utilityProvider || "").toLowerCase().includes(q)
    );
  }, [ngSearch, ngCustomers]);

  const selected = tab === 0
    ? customers.find((c) => c.id === selectedId) || null
    : ngCustomers.find((c) => c.id === ngSelectedId) || null;

  // Area stats -- top 4 areas by meter count (from current tab's data)
  const currentList = tab === 0 ? customers : ngCustomers;
  const areaCounts = {};
  currentList.forEach((c) => { if (c.area) areaCounts[c.area] = (areaCounts[c.area] || 0) + 1; });
  const topAreas = Object.entries(areaCounts).sort((a, b) => b[1] - a[1]).slice(0, 4);

  const areaColors = [
    colors.greenAccent[500],
    colors.blueAccent[500],
    colors.yellowAccent[500],
    colors.redAccent[500],
  ];

  const statusColor = {
    Active: { bg: colors.greenAccent[900], text: colors.greenAccent[500] },
    Arrears: { bg: colors.yellowAccent[900], text: colors.yellowAccent[500] },
    Suspended: { bg: colors.redAccent[900], text: colors.redAccent[500] },
    Inactive: { bg: colors.primary[300], text: colors.grey[300] },
  };

  const headerCellSx = {
    color: colors.grey[300], fontWeight: 600, fontSize: "0.75rem",
    textTransform: "uppercase", borderBottom: `1px solid ${colors.primary[300]}`,
  };

  const bodyCellSx = {
    color: colors.grey[100], borderBottom: `1px solid ${colors.primary[300]}`, fontSize: "0.85rem",
  };

  const textFieldSx = {
    "& .MuiOutlinedInput-root": {
      color: colors.grey[100], backgroundColor: "rgba(0,0,0,0.2)",
      "& fieldset": { borderColor: colors.primary[300] },
      "&:hover fieldset": { borderColor: colors.greenAccent[700] },
      "&.Mui-focused fieldset": { borderColor: colors.greenAccent[500] },
    },
    "& .MuiInputLabel-root": { color: colors.grey[300] },
    "& .MuiInputLabel-root.Mui-focused": { color: colors.greenAccent[500] },
  };

  const dialogFieldSx = {
    "& .MuiOutlinedInput-root": {
      color: colors.grey[100], backgroundColor: colors.primary[400],
      "& fieldset": { borderColor: colors.primary[300] },
      "&:hover fieldset": { borderColor: colors.greenAccent[700] },
      "&.Mui-focused fieldset": { borderColor: colors.greenAccent[500] },
    },
    "& .MuiInputLabel-root": { color: colors.grey[300] },
    "& .MuiInputLabel-root.Mui-focused": { color: colors.greenAccent[500] },
  };

  // Handlers
  const handleAddSave = async () => {
    if (!addForm.name || !addForm.meterNo) {
      setSnack({ open: true, msg: "Name and Meter No are required", severity: "error" });
      return;
    }
    setAddSaving(true);
    try {
      const payload = { ...addForm };
      if (payload.gpsLat) payload.gpsLat = parseFloat(payload.gpsLat);
      if (payload.gpsLng) payload.gpsLng = parseFloat(payload.gpsLng);
      await nonGridxAPI.createCustomer(payload);
      setSnack({ open: true, msg: "Non-GridX customer added successfully", severity: "success" });
      setAddOpen(false);
      setAddForm({ ...emptyNonGridxForm });
      fetchNonGridx();
    } catch (e) {
      setSnack({ open: true, msg: e.message, severity: "error" });
    }
    setAddSaving(false);
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      const result = await nonGridxAPI.importCSV(fd);
      setImportResult(result);
      setSnack({
        open: true,
        msg: `Imported ${result.imported} customers${result.errors?.length ? ` (${result.errors.length} warnings)` : ""}`,
        severity: "success",
      });
      fetchNonGridx();
    } catch (e) {
      setSnack({ open: true, msg: e.message, severity: "error" });
    }
    setImporting(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this non-GridX customer?")) return;
    try {
      await nonGridxAPI.deleteCustomer(id);
      setSnack({ open: true, msg: "Customer deleted", severity: "success" });
      setNgSelectedId(null);
      fetchNonGridx();
    } catch (e) {
      setSnack({ open: true, msg: e.message, severity: "error" });
    }
  };

  return (
    <Box m="20px">
      <Box sx={{ position: "relative" }}>
        <Header
          title="CUSTOMER REGISTRY"
          subtitle={tab === 0 ? "GridX Meters Across All Areas" : "Non-GridX / Third-Party Meters"}
        />
        {tab === 1 && (
          <Box sx={{ position: "absolute", right: 0, top: "44px", display: "flex", gap: "8px" }}>
            <Button
              variant="contained"
              size="small"
              startIcon={<AddOutlined />}
              onClick={() => setAddOpen(true)}
              sx={{
                backgroundColor: colors.greenAccent[600],
                color: colors.primary[500],
                "&:hover": { backgroundColor: colors.greenAccent[700] },
              }}
            >
              Add Customer
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={<UploadFileOutlined />}
              onClick={() => { setImportFile(null); setImportResult(null); setImportOpen(true); }}
              sx={{ color: colors.blueAccent[400], borderColor: colors.blueAccent[400] }}
            >
              Import CSV
            </Button>
          </Box>
        )}
      </Box>

      {/* Tab selector */}
      <Tabs
        value={tab}
        onChange={(_, v) => { setTab(v); setSelectedId(null); setNgSelectedId(null); }}
        sx={{
          mb: "10px",
          "& .MuiTab-root": { color: colors.grey[300], textTransform: "none", fontWeight: 600 },
          "& .Mui-selected": { color: colors.greenAccent[500] },
          "& .MuiTabs-indicator": { backgroundColor: colors.greenAccent[500] },
        }}
      >
        <Tab icon={<ElectricMeterOutlined sx={{ fontSize: 18 }} />} iconPosition="start" label="GridX Customers" />
        <Tab icon={<DevicesOtherOutlined sx={{ fontSize: 18 }} />} iconPosition="start" label="Non-GridX Customers" />
      </Tabs>

      <Box display="grid" gridTemplateColumns="repeat(12, 1fr)" gridAutoRows="140px" gap="5px">
        {/* ---- Area stat boxes ---- */}
        {topAreas.map(([area, count], i) => (
          <Box
            key={area}
            gridColumn="span 3"
            backgroundColor={colors.primary[400]}
            borderRadius="4px"
            display="flex"
            alignItems="center"
            justifyContent="center"
            flexDirection="column"
            p="15px"
          >
            <LocationOnOutlined sx={{ color: areaColors[i], fontSize: 28, mb: "6px" }} />
            <Typography variant="h4" fontWeight="700" color={colors.grey[100]}>{count}</Typography>
            <Typography variant="body2" color={areaColors[i]}>{area}</Typography>
          </Box>
        ))}
        {topAreas.length === 0 && (
          <Box gridColumn="span 12" display="flex" alignItems="center" justifyContent="center">
            <Typography color={colors.grey[400]}>No area data available</Typography>
          </Box>
        )}

        {/* ---- Customer Table ---- */}
        <Box
          gridColumn="span 8"
          gridRow="span 5"
          backgroundColor={colors.primary[400]}
          borderRadius="4px"
          overflow="auto"
        >
          {/* Search bar */}
          <Box display="flex" gap="10px" p="15px" borderBottom={`1px solid ${colors.primary[300]}`} flexWrap="wrap">
            <TextField
              size="small"
              placeholder={tab === 0 ? "Search name, account, meter..." : "Search name, meter, provider..."}
              value={tab === 0 ? search : ngSearch}
              onChange={(e) => tab === 0 ? setSearch(e.target.value) : setNgSearch(e.target.value)}
              sx={{ ...textFieldSx, flex: 1, minWidth: 200 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlined sx={{ color: colors.grey[300] }} />
                  </InputAdornment>
                ),
              }}
            />
            {tab === 0 && (
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel sx={{ color: colors.grey[300], "&.Mui-focused": { color: colors.greenAccent[500] } }}>
                  Area
                </InputLabel>
                <Select
                  value={areaFilter}
                  label="Area"
                  onChange={(e) => setAreaFilter(e.target.value)}
                  sx={{
                    color: colors.grey[100],
                    "& fieldset": { borderColor: colors.primary[300] },
                    "&:hover fieldset": { borderColor: colors.greenAccent[700] },
                    "&.Mui-focused fieldset": { borderColor: colors.greenAccent[500] },
                    "& .MuiSelect-icon": { color: colors.grey[300] },
                  }}
                  MenuProps={{
                    PaperProps: { sx: { backgroundColor: colors.primary[400], color: colors.grey[100] } },
                  }}
                >
                  {areas.map((a) => (<MenuItem key={a} value={a}>{a}</MenuItem>))}
                </Select>
              </FormControl>
            )}
          </Box>

          {/* GridX Table */}
          {tab === 0 && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={headerCellSx}>Account No</TableCell>
                  <TableCell sx={headerCellSx}>Customer Name</TableCell>
                  <TableCell sx={headerCellSx}>Meter No</TableCell>
                  <TableCell sx={headerCellSx}>Area</TableCell>
                  <TableCell sx={headerCellSx}>Tariff</TableCell>
                  <TableCell sx={headerCellSx} align="right">Arrears</TableCell>
                  <TableCell sx={headerCellSx}>Status</TableCell>
                  <TableCell sx={headerCellSx}>HSM</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow
                    key={c.id}
                    hover
                    selected={selectedId === c.id}
                    onClick={() => setSelectedId(c.id)}
                    sx={{
                      cursor: "pointer",
                      "&.Mui-selected": { backgroundColor: `${colors.blueAccent[900]}` },
                      "&.Mui-selected:hover": { backgroundColor: `${colors.blueAccent[800]}` },
                      "&:hover": { backgroundColor: `${colors.primary[300]}44` },
                    }}
                  >
                    <TableCell sx={{ ...bodyCellSx, fontFamily: "monospace", fontSize: "0.8rem" }}>{c.accountNo}</TableCell>
                    <TableCell sx={{ ...bodyCellSx, fontWeight: 500 }}>{c.name}</TableCell>
                    <TableCell sx={{ ...bodyCellSx, fontFamily: "monospace", fontSize: "0.8rem" }}>{c.meterNo}</TableCell>
                    <TableCell sx={bodyCellSx}>{c.area}</TableCell>
                    <TableCell sx={bodyCellSx}>{c.tariffGroup}</TableCell>
                    <TableCell sx={bodyCellSx} align="right">
                      <Typography variant="body2" sx={{
                        color: c.arrears > 0 ? colors.redAccent[500] : colors.greenAccent[500],
                        fontWeight: 600, fontSize: "0.8rem",
                      }}>
                        {fmtCurrency(c.arrears)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={bodyCellSx}>
                      <Chip label={c.status} size="small" sx={{
                        backgroundColor: statusColor[c.status]?.bg || colors.primary[300],
                        color: statusColor[c.status]?.text || colors.grey[100],
                        fontWeight: 600, fontSize: "0.7rem",
                      }} />
                    </TableCell>
                    <TableCell sx={bodyCellSx}>
                      {hsmStatusMap[c.meterNo]?.registered ? (
                        <Chip label="Registered" size="small" sx={{
                          backgroundColor: colors.greenAccent[900],
                          color: colors.greenAccent[500],
                          fontWeight: 600, fontSize: "0.65rem",
                        }} />
                      ) : (
                        <Chip label="Unregistered" size="small" sx={{
                          backgroundColor: colors.primary[300],
                          color: colors.grey[400],
                          fontWeight: 600, fontSize: "0.65rem",
                        }} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4, color: colors.grey[400] }}>
                      No customers match the current filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}

          {/* Non-GridX Table */}
          {tab === 1 && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={headerCellSx}>Account No</TableCell>
                  <TableCell sx={headerCellSx}>Customer Name</TableCell>
                  <TableCell sx={headerCellSx}>Meter No</TableCell>
                  <TableCell sx={headerCellSx}>Provider</TableCell>
                  <TableCell sx={headerCellSx}>Area</TableCell>
                  <TableCell sx={headerCellSx}>Meter Type</TableCell>
                  <TableCell sx={headerCellSx}>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {ngLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                      <CircularProgress size={24} sx={{ color: colors.greenAccent[500] }} />
                    </TableCell>
                  </TableRow>
                ) : ngFiltered.map((c) => (
                  <TableRow
                    key={c.id}
                    hover
                    selected={ngSelectedId === c.id}
                    onClick={() => setNgSelectedId(c.id)}
                    sx={{
                      cursor: "pointer",
                      "&.Mui-selected": { backgroundColor: `${colors.blueAccent[900]}` },
                      "&.Mui-selected:hover": { backgroundColor: `${colors.blueAccent[800]}` },
                      "&:hover": { backgroundColor: `${colors.primary[300]}44` },
                    }}
                  >
                    <TableCell sx={{ ...bodyCellSx, fontFamily: "monospace", fontSize: "0.8rem" }}>{c.accountNo}</TableCell>
                    <TableCell sx={{ ...bodyCellSx, fontWeight: 500 }}>{c.name}</TableCell>
                    <TableCell sx={{ ...bodyCellSx, fontFamily: "monospace", fontSize: "0.8rem" }}>{c.meterNo}</TableCell>
                    <TableCell sx={bodyCellSx}>
                      <Chip label={c.utilityProvider || "N/A"} size="small" variant="outlined"
                        sx={{ color: colors.blueAccent[400], borderColor: colors.blueAccent[400], fontSize: "0.7rem" }} />
                    </TableCell>
                    <TableCell sx={bodyCellSx}>{c.area}</TableCell>
                    <TableCell sx={bodyCellSx}>{c.meterType || "-"}</TableCell>
                    <TableCell sx={bodyCellSx}>
                      <Chip label={c.status} size="small" sx={{
                        backgroundColor: statusColor[c.status]?.bg || colors.primary[300],
                        color: statusColor[c.status]?.text || colors.grey[100],
                        fontWeight: 600, fontSize: "0.7rem",
                      }} />
                    </TableCell>
                  </TableRow>
                ))}
                {!ngLoading && ngFiltered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4, color: colors.grey[400] }}>
                      {ngCustomers.length === 0
                        ? 'No non-GridX customers yet. Click "Add Customer" or "Import CSV" to get started.'
                        : "No customers match the current search."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </Box>

        {/* ---- Detail Panel ---- */}
        <Box
          gridColumn="span 4"
          gridRow="span 5"
          backgroundColor={colors.primary[400]}
          borderRadius="4px"
          p="20px"
          overflow="auto"
        >
          {selected ? (
            <>
              {/* Name + status */}
              <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb="15px">
                <Box>
                  <Typography variant="h5" color={colors.grey[100]} fontWeight="700" sx={{ lineHeight: 1.3 }}>
                    {selected.name}
                  </Typography>
                  {tab === 1 && (
                    <Chip
                      label="Non-GridX"
                      size="small"
                      sx={{
                        mt: "4px", backgroundColor: "#e6810033", color: "#e68100",
                        fontWeight: 600, fontSize: "0.65rem",
                      }}
                    />
                  )}
                </Box>
                <Chip
                  label={selected.status}
                  size="small"
                  sx={{
                    backgroundColor: statusColor[selected.status]?.bg,
                    color: statusColor[selected.status]?.text,
                    fontWeight: 600, fontSize: "0.7rem",
                  }}
                />
              </Box>

              <DetailRow label="Account No" value={selected.accountNo} mono colors={colors} />
              <DetailRow label="Meter No" value={selected.meterNo} mono colors={colors} />

              <Divider sx={{ borderColor: colors.primary[300], my: "12px" }} />

              <DetailRow label="Phone" value={selected.phone} icon={<PhoneOutlined sx={{ fontSize: 15 }} />} colors={colors} />
              <DetailRow label="Email" value={selected.email} icon={<EmailOutlined sx={{ fontSize: 15 }} />} colors={colors} />

              <Divider sx={{ borderColor: colors.primary[300], my: "12px" }} />

              <DetailRow label="Area" value={selected.area} icon={<LocationOnOutlined sx={{ fontSize: 15 }} />} colors={colors} />
              <DetailRow label="Address" value={selected.address} colors={colors} />
              <DetailRow label="GPS" value={selected.gpsLat && selected.gpsLng ? `${selected.gpsLat}, ${selected.gpsLng}` : "-"} icon={<GpsFixedOutlined sx={{ fontSize: 15 }} />} mono colors={colors} />

              <Divider sx={{ borderColor: colors.primary[300], my: "12px" }} />

              <DetailRow label="Tariff Group" value={selected.tariffGroup} icon={<SpeedOutlined sx={{ fontSize: 15 }} />} colors={colors} />
              <DetailRow label="Meter Make" value={selected.meterMake} colors={colors} />

              {/* Non-GridX specific fields */}
              {tab === 1 && (
                <>
                  <DetailRow label="Meter Type" value={selected.meterType} icon={<DevicesOtherOutlined sx={{ fontSize: 15 }} />} colors={colors} />
                  <DetailRow label="Utility Provider" value={selected.utilityProvider} icon={<BusinessOutlined sx={{ fontSize: 15 }} />} colors={colors} />
                  {selected.notes && (
                    <DetailRow label="Notes" value={selected.notes} icon={<DescriptionOutlined sx={{ fontSize: 15 }} />} colors={colors} />
                  )}
                </>
              )}

              {/* GridX specific: Arrears + Last Purchase */}
              {tab === 0 && (
                <>
                  <Divider sx={{ borderColor: colors.primary[300], my: "12px" }} />
                  <Box textAlign="center" my="15px">
                    <Typography variant="caption" color={colors.grey[300]}>Outstanding Arrears</Typography>
                    <Typography variant="h4" sx={{
                      fontWeight: 700,
                      color: selected.arrears > 0 ? colors.redAccent[500] : colors.greenAccent[500],
                      mt: "4px",
                    }}>
                      {fmtCurrency(selected.arrears)}
                    </Typography>
                  </Box>
                  <DetailRow label="Last Purchase" value={formatDateTime(selected.lastPurchaseDate)} colors={colors} />
                  <DetailRow label="Last Amount" value={fmtCurrency(selected.lastPurchaseAmount)} colors={colors} />
                </>
              )}

              <Divider sx={{ borderColor: colors.primary[300], my: "12px" }} />

              {/* Action buttons */}
              <Box display="flex" flexWrap="wrap" gap="8px" mt="8px">
                {tab === 0 ? (
                  <>
                    <Button variant="contained" size="small" startIcon={<ConfirmationNumberOutlined />}
                      sx={{ backgroundColor: colors.greenAccent[600], color: colors.primary[500], "&:hover": { backgroundColor: colors.greenAccent[700] } }}>
                      Vend Token
                    </Button>
                    <Button variant="outlined" size="small" startIcon={<EditOutlined />}
                      sx={{ color: colors.grey[100], borderColor: colors.primary[300] }}>Edit</Button>
                    <Button variant="outlined" size="small" startIcon={<ReceiptLongOutlined />}
                      sx={{ color: colors.grey[100], borderColor: colors.primary[300] }}>Transactions</Button>
                    <Button variant="outlined" size="small" startIcon={<SmsOutlined />}
                      sx={{ color: colors.grey[100], borderColor: colors.primary[300] }}>SMS</Button>
                    <Button variant="outlined" size="small"
                      startIcon={selected.status === "Suspended" ? <CheckCircleOutlined /> : <BlockOutlined />}
                      sx={{
                        color: selected.status === "Suspended" ? colors.greenAccent[500] : colors.redAccent[500],
                        borderColor: selected.status === "Suspended" ? colors.greenAccent[700] : colors.redAccent[700],
                      }}>
                      {selected.status === "Suspended" ? "Activate" : "Suspend"}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outlined" size="small" startIcon={<EditOutlined />}
                      sx={{ color: colors.grey[100], borderColor: colors.primary[300] }}>Edit</Button>
                    <Button variant="outlined" size="small" startIcon={<DeleteOutlined />}
                      onClick={() => handleDelete(selected.id)}
                      sx={{ color: colors.redAccent[500], borderColor: colors.redAccent[700] }}>Delete</Button>
                  </>
                )}
              </Box>
            </>
          ) : (
            <Box textAlign="center" py="80px">
              <PersonOutlined sx={{ fontSize: 48, color: colors.grey[400], mb: "8px" }} />
              <Typography variant="body2" color={colors.grey[400]}>
                Select a customer from the table to view details.
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* ---- Add Non-GridX Customer Dialog ---- */}
      <Dialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { backgroundColor: colors.primary[500], color: colors.grey[100] } }}
      >
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Typography variant="h6" fontWeight={700}>Add Non-GridX Customer</Typography>
          <IconButton onClick={() => setAddOpen(false)} sx={{ color: colors.grey[300] }}>
            <CloseOutlined />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Box display="grid" gridTemplateColumns="1fr 1fr" gap="12px" mt="8px">
            <TextField label="Customer Name *" size="small" sx={dialogFieldSx}
              value={addForm.name} onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))} />
            <TextField label="Meter Number *" size="small" sx={dialogFieldSx}
              value={addForm.meterNo} onChange={e => setAddForm(p => ({ ...p, meterNo: e.target.value }))} />
            <TextField label="Phone" size="small" sx={dialogFieldSx}
              value={addForm.phone} onChange={e => setAddForm(p => ({ ...p, phone: e.target.value }))} />
            <TextField label="Email" size="small" sx={dialogFieldSx}
              value={addForm.email} onChange={e => setAddForm(p => ({ ...p, email: e.target.value }))} />
            <TextField label="Meter Type" size="small" sx={dialogFieldSx} placeholder="e.g. Prepaid, Postpaid"
              value={addForm.meterType} onChange={e => setAddForm(p => ({ ...p, meterType: e.target.value }))} />
            <TextField label="Meter Make" size="small" sx={dialogFieldSx} placeholder="e.g. Conlog, Landis+Gyr"
              value={addForm.meterMake} onChange={e => setAddForm(p => ({ ...p, meterMake: e.target.value }))} />
            <TextField label="Utility Provider" size="small" sx={dialogFieldSx} placeholder="e.g. Cenored, Erongo RED"
              value={addForm.utilityProvider} onChange={e => setAddForm(p => ({ ...p, utilityProvider: e.target.value }))} />
            <TextField label="Area" size="small" sx={dialogFieldSx}
              value={addForm.area} onChange={e => setAddForm(p => ({ ...p, area: e.target.value }))} />
            <TextField label="Address" size="small" sx={dialogFieldSx} fullWidth
              value={addForm.address} onChange={e => setAddForm(p => ({ ...p, address: e.target.value }))}
              style={{ gridColumn: "1 / -1" }} />
            <TextField label="GPS Latitude" size="small" sx={dialogFieldSx} type="number"
              value={addForm.gpsLat} onChange={e => setAddForm(p => ({ ...p, gpsLat: e.target.value }))} />
            <TextField label="GPS Longitude" size="small" sx={dialogFieldSx} type="number"
              value={addForm.gpsLng} onChange={e => setAddForm(p => ({ ...p, gpsLng: e.target.value }))} />
            <FormControl size="small" sx={{ ...dialogFieldSx }}>
              <InputLabel sx={{ color: colors.grey[300] }}>Tariff Group</InputLabel>
              <Select value={addForm.tariffGroup} label="Tariff Group"
                onChange={e => setAddForm(p => ({ ...p, tariffGroup: e.target.value }))}
                sx={{ color: colors.grey[100] }}
                MenuProps={{ PaperProps: { sx: { backgroundColor: colors.primary[400], color: colors.grey[100] } } }}>
                <MenuItem value="Residential">Residential</MenuItem>
                <MenuItem value="Commercial">Commercial</MenuItem>
                <MenuItem value="Industrial">Industrial</MenuItem>
              </Select>
            </FormControl>
            <TextField label="Notes" size="small" sx={dialogFieldSx}
              value={addForm.notes} onChange={e => setAddForm(p => ({ ...p, notes: e.target.value }))} />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: "16px" }}>
          <Button onClick={() => setAddOpen(false)} sx={{ color: colors.grey[300] }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleAddSave}
            disabled={addSaving}
            sx={{
              backgroundColor: colors.greenAccent[600], color: colors.primary[500],
              "&:hover": { backgroundColor: colors.greenAccent[700] },
            }}
          >
            {addSaving ? <CircularProgress size={20} /> : "Save Customer"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ---- Import CSV Dialog ---- */}
      <Dialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { backgroundColor: colors.primary[500], color: colors.grey[100] } }}
      >
        <DialogTitle>
          <Typography variant="h6" fontWeight={700}>Import Non-GridX Customers</Typography>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color={colors.grey[300]} mb="12px">
            Upload a CSV file with customer data. Required columns: Name, MeterNo.
            Optional: Phone, Email, MeterType, MeterMake, UtilityProvider, Area, Address, Latitude, Longitude, TariffGroup, Notes.
          </Typography>
          <Box
            sx={{
              border: `2px dashed ${colors.primary[300]}`, borderRadius: "8px",
              p: "30px", textAlign: "center", cursor: "pointer",
              "&:hover": { borderColor: colors.greenAccent[500] },
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              style={{ display: "none" }}
              onChange={(e) => { setImportFile(e.target.files[0] || null); setImportResult(null); }}
            />
            <UploadFileOutlined sx={{ fontSize: 40, color: colors.grey[400], mb: "8px" }} />
            <Typography color={colors.grey[300]}>
              {importFile ? importFile.name : "Click to select CSV file"}
            </Typography>
          </Box>
          {importResult && (
            <Alert severity="info" sx={{ mt: "12px" }}>
              Imported {importResult.imported} customers.
              {importResult.errors?.length > 0 && (
                <Box mt="4px">
                  <Typography variant="caption">Warnings:</Typography>
                  {importResult.errors.slice(0, 5).map((e, i) => (
                    <Typography key={i} variant="caption" display="block" color="text.secondary">{e}</Typography>
                  ))}
                </Box>
              )}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ p: "16px" }}>
          <Button onClick={() => setImportOpen(false)} sx={{ color: colors.grey[300] }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleImport}
            disabled={!importFile || importing}
            sx={{
              backgroundColor: colors.greenAccent[600], color: colors.primary[500],
              "&:hover": { backgroundColor: colors.greenAccent[700] },
            }}
          >
            {importing ? <CircularProgress size={20} /> : "Import"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}>
        <Alert severity={snack.severity} onClose={() => setSnack(s => ({ ...s, open: false }))}>
          {snack.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
