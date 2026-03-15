import { useState, useEffect, useMemo } from "react";
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
  PeopleOutlined,
  PhoneOutlined,
  EmailOutlined,
  LocationOnOutlined,
  GpsFixedOutlined,
  SpeedOutlined,
} from "@mui/icons-material";
import { tokens } from "../theme";
import Header from "../components/Header";
import { vendingAPI } from "../services/api";
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

// ---- Detail Row helper ------------------------------------------------------

function DetailRow({ label, value, mono, icon, colors }) {
  return (
    <Box
      display="flex"
      justifyContent="space-between"
      alignItems="center"
      mb="6px"
    >
      <Box display="flex" alignItems="center" gap="4px">
        {icon && (
          <Box sx={{ color: colors.grey[300], display: "flex" }}>{icon}</Box>
        )}
        <Typography variant="caption" color={colors.grey[300]}>
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

// ---- Main Component ---------------------------------------------------------

export default function Customers() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);

  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("All Areas");
  const [selectedId, setSelectedId] = useState(null);
  const [customers, setCustomers] = useState(mockCustomers);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    vendingAPI.getCustomers().then(r => {
      if (r.success && r.data?.length > 0) setCustomers(r.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Filtered list
  const filtered = useMemo(() => {
    return customers.filter((c) => {
      if (search) {
        const q = search.toLowerCase();
        const match =
          (c.name || '').toLowerCase().includes(q) ||
          (c.accountNo || '').toLowerCase().includes(q) ||
          (c.meterNo || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      if (areaFilter !== "All Areas" && c.area !== areaFilter) return false;
      return true;
    });
  }, [search, areaFilter, customers]);

  const selected = customers.find((c) => c.id === selectedId) || null;

  // Area stats -- top 4 areas by meter count
  const areaCounts = {};
  customers.forEach((c) => {
    areaCounts[c.area] = (areaCounts[c.area] || 0) + 1;
  });
  const topAreas = Object.entries(areaCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  const areaColors = [
    colors.greenAccent[500],
    colors.blueAccent[500],
    colors.yellowAccent[500],
    colors.redAccent[500],
  ];

  const statusColor = {
    Active: {
      bg: colors.greenAccent[900],
      text: colors.greenAccent[500],
    },
    Arrears: {
      bg: colors.yellowAccent[900],
      text: colors.yellowAccent[500],
    },
    Suspended: {
      bg: colors.redAccent[900],
      text: colors.redAccent[500],
    },
  };

  const headerCellSx = {
    color: colors.grey[300],
    fontWeight: 600,
    fontSize: "0.75rem",
    textTransform: "uppercase",
    borderBottom: `1px solid ${colors.primary[300]}`,
  };

  const bodyCellSx = {
    color: colors.grey[100],
    borderBottom: `1px solid ${colors.primary[300]}`,
    fontSize: "0.85rem",
  };

  const textFieldSx = {
    "& .MuiOutlinedInput-root": {
      color: colors.grey[100],
      backgroundColor: "rgba(0,0,0,0.2)",
      "& fieldset": { borderColor: colors.primary[300] },
      "&:hover fieldset": { borderColor: colors.greenAccent[700] },
      "&.Mui-focused fieldset": { borderColor: colors.greenAccent[500] },
    },
    "& .MuiInputLabel-root": { color: colors.grey[300] },
    "& .MuiInputLabel-root.Mui-focused": { color: colors.greenAccent[500] },
  };

  return (
    <Box m="20px">
      <Header
        title="CUSTOMER REGISTRY"
        subtitle="Registered Meters Across All Areas"
      />

      <Box
        display="grid"
        gridTemplateColumns="repeat(12, 1fr)"
        gridAutoRows="140px"
        gap="5px"
      >
        {/* ---- Area stat boxes: span 3 each ---- */}
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
            <LocationOnOutlined
              sx={{ color: areaColors[i], fontSize: 28, mb: "6px" }}
            />
            <Typography variant="h4" fontWeight="700" color={colors.grey[100]}>
              {count}
            </Typography>
            <Typography variant="body2" color={areaColors[i]}>
              {area}
            </Typography>
          </Box>
        ))}

        {/* ---- Customer Table (span 8, span 5) ---- */}
        <Box
          gridColumn="span 8"
          gridRow="span 5"
          backgroundColor={colors.primary[400]}
          borderRadius="4px"
          overflow="auto"
        >
          {/* Search & filter bar */}
          <Box
            display="flex"
            gap="10px"
            p="15px"
            borderBottom={`1px solid ${colors.primary[300]}`}
            flexWrap="wrap"
          >
            <TextField
              size="small"
              placeholder="Search name, account, meter..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ ...textFieldSx, flex: 1, minWidth: 200 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlined sx={{ color: colors.grey[300] }} />
                  </InputAdornment>
                ),
              }}
            />
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel
                sx={{
                  color: colors.grey[300],
                  "&.Mui-focused": { color: colors.greenAccent[500] },
                }}
              >
                Area
              </InputLabel>
              <Select
                value={areaFilter}
                label="Area"
                onChange={(e) => setAreaFilter(e.target.value)}
                sx={{
                  color: colors.grey[100],
                  "& fieldset": { borderColor: colors.primary[300] },
                  "&:hover fieldset": {
                    borderColor: colors.greenAccent[700],
                  },
                  "&.Mui-focused fieldset": {
                    borderColor: colors.greenAccent[500],
                  },
                  "& .MuiSelect-icon": { color: colors.grey[300] },
                }}
                MenuProps={{
                  PaperProps: {
                    sx: {
                      backgroundColor: colors.primary[400],
                      color: colors.grey[100],
                    },
                  },
                }}
              >
                {areas.map((a) => (
                  <MenuItem key={a} value={a}>
                    {a}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={headerCellSx}>Account No</TableCell>
                <TableCell sx={headerCellSx}>Customer Name</TableCell>
                <TableCell sx={headerCellSx}>Meter No</TableCell>
                <TableCell sx={headerCellSx}>Area</TableCell>
                <TableCell sx={headerCellSx}>Tariff</TableCell>
                <TableCell sx={headerCellSx} align="right">
                  Arrears
                </TableCell>
                <TableCell sx={headerCellSx}>Status</TableCell>
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
                    "&.Mui-selected": {
                      backgroundColor: `${colors.blueAccent[900]}`,
                    },
                    "&.Mui-selected:hover": {
                      backgroundColor: `${colors.blueAccent[800]}`,
                    },
                    "&:hover": {
                      backgroundColor: `${colors.primary[300]}44`,
                    },
                  }}
                >
                  <TableCell
                    sx={{
                      ...bodyCellSx,
                      fontFamily: "monospace",
                      fontSize: "0.8rem",
                    }}
                  >
                    {c.accountNo}
                  </TableCell>
                  <TableCell
                    sx={{ ...bodyCellSx, fontWeight: 500 }}
                  >
                    {c.name}
                  </TableCell>
                  <TableCell
                    sx={{
                      ...bodyCellSx,
                      fontFamily: "monospace",
                      fontSize: "0.8rem",
                    }}
                  >
                    {c.meterNo}
                  </TableCell>
                  <TableCell sx={bodyCellSx}>{c.area}</TableCell>
                  <TableCell sx={bodyCellSx}>{c.tariffGroup}</TableCell>
                  <TableCell sx={bodyCellSx} align="right">
                    <Typography
                      variant="body2"
                      sx={{
                        color:
                          c.arrears > 0
                            ? colors.redAccent[500]
                            : colors.greenAccent[500],
                        fontWeight: 600,
                        fontSize: "0.8rem",
                      }}
                    >
                      {fmtCurrency(c.arrears)}
                    </Typography>
                  </TableCell>
                  <TableCell sx={bodyCellSx}>
                    <Chip
                      label={c.status}
                      size="small"
                      sx={{
                        backgroundColor:
                          statusColor[c.status]?.bg || colors.primary[300],
                        color: statusColor[c.status]?.text || colors.grey[100],
                        fontWeight: 600,
                        fontSize: "0.7rem",
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    align="center"
                    sx={{ py: 4, color: colors.grey[400] }}
                  >
                    No customers match the current filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>

        {/* ---- Customer Detail Panel (span 4, span 5) ---- */}
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
              <Box
                display="flex"
                justifyContent="space-between"
                alignItems="flex-start"
                mb="15px"
              >
                <Typography
                  variant="h5"
                  color={colors.grey[100]}
                  fontWeight="700"
                  sx={{ lineHeight: 1.3 }}
                >
                  {selected.name}
                </Typography>
                <Chip
                  label={selected.status}
                  size="small"
                  sx={{
                    backgroundColor: statusColor[selected.status]?.bg,
                    color: statusColor[selected.status]?.text,
                    fontWeight: 600,
                    fontSize: "0.7rem",
                  }}
                />
              </Box>

              {/* Account / Meter */}
              <DetailRow
                label="Account No"
                value={selected.accountNo}
                mono
                colors={colors}
              />
              <DetailRow
                label="Meter No"
                value={selected.meterNo}
                mono
                colors={colors}
              />

              <Divider
                sx={{
                  borderColor: colors.primary[300],
                  my: "12px",
                }}
              />

              {/* Contact */}
              <DetailRow
                label="Phone"
                value={selected.phone}
                icon={<PhoneOutlined sx={{ fontSize: 15 }} />}
                colors={colors}
              />
              <DetailRow
                label="Email"
                value={selected.email}
                icon={<EmailOutlined sx={{ fontSize: 15 }} />}
                colors={colors}
              />

              <Divider
                sx={{
                  borderColor: colors.primary[300],
                  my: "12px",
                }}
              />

              {/* Location */}
              <DetailRow
                label="Area"
                value={selected.area}
                icon={<LocationOnOutlined sx={{ fontSize: 15 }} />}
                colors={colors}
              />
              <DetailRow
                label="Address"
                value={selected.address}
                colors={colors}
              />
              <DetailRow
                label="GPS"
                value={`${selected.gpsLat}, ${selected.gpsLng}`}
                icon={<GpsFixedOutlined sx={{ fontSize: 15 }} />}
                mono
                colors={colors}
              />

              <Divider
                sx={{
                  borderColor: colors.primary[300],
                  my: "12px",
                }}
              />

              {/* Tariff */}
              <DetailRow
                label="Tariff Group"
                value={selected.tariffGroup}
                icon={<SpeedOutlined sx={{ fontSize: 15 }} />}
                colors={colors}
              />
              <DetailRow
                label="Meter Make"
                value={selected.meterMake}
                colors={colors}
              />

              <Divider
                sx={{
                  borderColor: colors.primary[300],
                  my: "12px",
                }}
              />

              {/* Arrears */}
              <Box textAlign="center" my="15px">
                <Typography variant="caption" color={colors.grey[300]}>
                  Outstanding Arrears
                </Typography>
                <Typography
                  variant="h4"
                  sx={{
                    fontWeight: 700,
                    color:
                      selected.arrears > 0
                        ? colors.redAccent[500]
                        : colors.greenAccent[500],
                    mt: "4px",
                  }}
                >
                  {fmtCurrency(selected.arrears)}
                </Typography>
              </Box>

              {/* Last purchase */}
              <DetailRow
                label="Last Purchase"
                value={formatDateTime(selected.lastPurchaseDate)}
                colors={colors}
              />
              <DetailRow
                label="Last Amount"
                value={fmtCurrency(selected.lastPurchaseAmount)}
                colors={colors}
              />

              <Divider
                sx={{
                  borderColor: colors.primary[300],
                  my: "12px",
                }}
              />

              {/* Action buttons */}
              <Box display="flex" flexWrap="wrap" gap="8px" mt="8px">
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<ConfirmationNumberOutlined />}
                  sx={{
                    backgroundColor: colors.greenAccent[600],
                    color: colors.primary[500],
                    "&:hover": {
                      backgroundColor: colors.greenAccent[700],
                    },
                  }}
                >
                  Vend Token
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<EditOutlined />}
                  sx={{
                    color: colors.grey[100],
                    borderColor: colors.primary[300],
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<ReceiptLongOutlined />}
                  sx={{
                    color: colors.grey[100],
                    borderColor: colors.primary[300],
                  }}
                >
                  Transactions
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<SmsOutlined />}
                  sx={{
                    color: colors.grey[100],
                    borderColor: colors.primary[300],
                  }}
                >
                  SMS
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={
                    selected.status === "Suspended" ? (
                      <CheckCircleOutlined />
                    ) : (
                      <BlockOutlined />
                    )
                  }
                  sx={{
                    color:
                      selected.status === "Suspended"
                        ? colors.greenAccent[500]
                        : colors.redAccent[500],
                    borderColor:
                      selected.status === "Suspended"
                        ? colors.greenAccent[700]
                        : colors.redAccent[700],
                  }}
                >
                  {selected.status === "Suspended" ? "Activate" : "Suspend"}
                </Button>
              </Box>
            </>
          ) : (
            <Box textAlign="center" py="80px">
              <PersonOutlined
                sx={{ fontSize: 48, color: colors.grey[400], mb: "8px" }}
              />
              <Typography variant="body2" color={colors.grey[400]}>
                Select a customer from the table to view details.
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
