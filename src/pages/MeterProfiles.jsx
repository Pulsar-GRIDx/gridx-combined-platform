import { useState, useEffect, useMemo } from "react";
import {
  Box,
  Typography,
  useTheme,
  Chip,
  IconButton,
  Tooltip,
  LinearProgress,
  Alert,
} from "@mui/material";
import { DataGrid, GridToolbar } from "@mui/x-data-grid";
import { tokens } from "../theme";
import {
  ElectricMeterOutlined,
  SignalCellularAlt,
  SignalCellularOff,
  ShieldOutlined,
  GppBadOutlined,
  BoltOutlined,
  Visibility,
  LocationOn,
  PersonOutlined,
  AccessTime,
  SecurityOutlined,
} from "@mui/icons-material";
import { Link, useNavigate } from "react-router-dom";
import Header from "../components/Header";
import StatBox from "../components/StatBox";
import ProgressCircle from "../components/ProgressCircle";
import { meterConfigAPI } from "../services/api";

export default function MeterProfiles() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const navigate = useNavigate();

  const [meters, setMeters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchMeters = async () => {
      try {
        const res = await meterConfigAPI.getMeterProfiles();
        if (res?.data) {
          setMeters(res.data);
        }
      } catch (err) {
        setError("Failed to load meter profiles: " + err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchMeters();
  }, []);

  const stats = useMemo(() => {
    const total = meters.length;
    const online = meters.filter((m) => m.status === "Online").length;
    const offline = total - online;
    const tampered = meters.filter((m) => m.security === "Tampered").length;
    const secure = total - tampered;
    const totalKwh = meters.reduce((sum, m) => sum + parseFloat(m.kWh || 0), 0);
    return { total, online, offline, tampered, secure, totalKwh };
  }, [meters]);

  const fmt = (n) => Number(n || 0).toLocaleString();

  const columns = [
    {
      field: "drn",
      headerName: "DRN",
      flex: 0.14,
      minWidth: 140,
      renderCell: ({ value }) => (
        <Box
          component={Link}
          to={`/meter/${value}`}
          sx={{
            textDecoration: "none",
            color: colors.greenAccent[400],
            fontWeight: 700,
            fontFamily: "'Source Sans 3', monospace",
            fontSize: "13px",
            letterSpacing: "0.5px",
            display: "flex",
            alignItems: "center",
            gap: 1,
            py: "4px",
            px: "6px",
            borderRadius: "4px",
            transition: "all 0.2s",
            "&:hover": {
              backgroundColor: colors.greenAccent[900],
              color: colors.greenAccent[300],
            },
          }}
        >
          <ElectricMeterOutlined sx={{ fontSize: 16, opacity: 0.7 }} />
          {value}
        </Box>
      ),
    },
    {
      field: "customerName",
      headerName: "Customer",
      flex: 0.14,
      minWidth: 130,
      renderCell: ({ value }) => (
        <Box display="flex" alignItems="center" gap={1}>
          <PersonOutlined sx={{ color: colors.blueAccent[400], fontSize: 16 }} />
          <Typography variant="body2" fontWeight={500} color={colors.grey[100]}>
            {value}
          </Typography>
        </Box>
      ),
    },
    {
      field: "location",
      headerName: "Location",
      flex: 0.18,
      minWidth: 160,
      renderCell: ({ value }) => (
        <Box display="flex" alignItems="center" gap={1}>
          <LocationOn sx={{ color: colors.blueAccent[400], fontSize: 16 }} />
          <Typography variant="body2" color={colors.grey[200]} noWrap>
            {value}
          </Typography>
        </Box>
      ),
    },
    {
      field: "status",
      headerName: "Status",
      flex: 0.09,
      minWidth: 100,
      renderCell: ({ value }) => {
        const isOnline = value === "Online";
        return (
          <Chip
            icon={isOnline ? <SignalCellularAlt /> : <SignalCellularOff />}
            label={value}
            size="small"
            sx={{
              backgroundColor: isOnline
                ? `${colors.greenAccent[500]}22`
                : `${colors.redAccent[500]}22`,
              color: isOnline ? colors.greenAccent[400] : colors.redAccent[400],
              border: `1px solid ${isOnline ? colors.greenAccent[500] : colors.redAccent[500]}44`,
              fontWeight: 600,
              fontSize: "12px",
              "& .MuiChip-icon": {
                color: "inherit",
                fontSize: 14,
              },
            }}
          />
        );
      },
    },
    {
      field: "security",
      headerName: "Security",
      flex: 0.1,
      minWidth: 110,
      renderCell: ({ value }) => {
        const isSecure = value === "Secure";
        return (
          <Chip
            icon={isSecure ? <ShieldOutlined /> : <GppBadOutlined />}
            label={value}
            size="small"
            sx={{
              backgroundColor: isSecure
                ? `${colors.greenAccent[500]}18`
                : `${colors.redAccent[500]}30`,
              color: isSecure ? colors.greenAccent[400] : colors.redAccent[300],
              border: `1px solid ${isSecure ? colors.greenAccent[600] : colors.redAccent[400]}55`,
              fontWeight: 600,
              fontSize: "12px",
              "& .MuiChip-icon": {
                color: "inherit",
                fontSize: 14,
              },
            }}
          />
        );
      },
    },
    {
      field: "kWh",
      headerName: "Units (kWh)",
      flex: 0.1,
      minWidth: 110,
      renderCell: ({ value }) => {
        const kwh = parseFloat(value || 0);
        return (
          <Box display="flex" alignItems="center" gap={1}>
            <BoltOutlined
              sx={{
                fontSize: 16,
                color: kwh > 0 ? colors.greenAccent[400] : colors.grey[600],
              }}
            />
            <Typography
              variant="body2"
              fontWeight={600}
              sx={{
                fontFamily: "'Source Sans 3', monospace",
                color: kwh > 0 ? colors.grey[100] : colors.grey[500],
              }}
            >
              {fmt(kwh)}
            </Typography>
          </Box>
        );
      },
    },
    {
      field: "lastEnergyUpdate",
      headerName: "Last Update",
      flex: 0.13,
      minWidth: 130,
      renderCell: ({ value }) => {
        if (!value) {
          return (
            <Typography variant="body2" color={colors.grey[600]}>
              Never
            </Typography>
          );
        }
        const date = new Date(value);
        const now = new Date();
        const diffHrs = (now - date) / (1000 * 60 * 60);
        const isRecent = diffHrs < 24;
        return (
          <Box display="flex" alignItems="center" gap={0.5}>
            <AccessTime
              sx={{
                fontSize: 14,
                color: isRecent ? colors.greenAccent[400] : colors.grey[500],
              }}
            />
            <Box>
              <Typography variant="body2" fontWeight={500} color={colors.grey[200]} lineHeight={1.2}>
                {date.toLocaleDateString()}
              </Typography>
              <Typography variant="caption" color={colors.grey[500]} lineHeight={1}>
                {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Typography>
            </Box>
          </Box>
        );
      },
    },
    {
      field: "actions",
      headerName: "Actions",
      flex: 0.08,
      minWidth: 80,
      sortable: false,
      renderCell: ({ row }) => (
        <Tooltip title="View Meter Profile">
          <IconButton
            size="small"
            onClick={() => navigate(`/meter/${row.drn}`)}
            sx={{
              color: colors.blueAccent[400],
              border: `1px solid ${colors.blueAccent[500]}44`,
              borderRadius: "6px",
              p: "6px",
              transition: "all 0.2s",
              "&:hover": {
                backgroundColor: colors.blueAccent[500],
                color: "#fff",
                borderColor: colors.blueAccent[500],
              },
            }}
          >
            <Visibility fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
    },
  ];

  return (
    <Box m="20px">
      <Header title="Meter Profiles" subtitle="Registered meters overview and status monitoring" />

      {/* KPI Cards */}
      {!loading && !error && (
        <Box
          display="grid"
          gridTemplateColumns="repeat(12, 1fr)"
          gridAutoRows="140px"
          gap="5px"
          mb="5px"
        >
          <Box
            gridColumn="span 3"
            backgroundColor={colors.primary[400]}
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <StatBox
              title={fmt(stats.total)}
              subtitle="Total Meters"
              progress={String(stats.total > 0 ? 1 : 0)}
              increase={`${stats.online} active`}
              icon={
                <ElectricMeterOutlined
                  sx={{ color: colors.greenAccent[500], fontSize: "26px" }}
                />
              }
            />
          </Box>
          <Box
            gridColumn="span 3"
            backgroundColor={colors.primary[400]}
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <StatBox
              title={fmt(stats.online)}
              subtitle="Online"
              progress={String(stats.total > 0 ? stats.online / stats.total : 0)}
              increase={stats.total > 0 ? `${((stats.online / stats.total) * 100).toFixed(0)}%` : "0%"}
              icon={
                <SignalCellularAlt
                  sx={{ color: colors.greenAccent[500], fontSize: "26px" }}
                />
              }
            />
          </Box>
          <Box
            gridColumn="span 3"
            backgroundColor={colors.primary[400]}
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <StatBox
              title={fmt(stats.secure)}
              subtitle="Secure"
              progress={String(stats.total > 0 ? stats.secure / stats.total : 0)}
              increase={stats.tampered > 0 ? `${stats.tampered} tampered` : "All clear"}
              icon={
                <SecurityOutlined
                  sx={{ color: stats.tampered > 0 ? colors.redAccent[400] : colors.greenAccent[500], fontSize: "26px" }}
                />
              }
            />
          </Box>
          <Box
            gridColumn="span 3"
            backgroundColor={colors.primary[400]}
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <StatBox
              title={`${fmt(stats.totalKwh)}`}
              subtitle="Total kWh"
              progress="0.80"
              increase="Cumulative"
              icon={
                <BoltOutlined
                  sx={{ color: colors.greenAccent[500], fontSize: "26px" }}
                />
              }
            />
          </Box>
        </Box>
      )}

      {/* Data Table */}
      <Box
        gridColumn="span 12"
        backgroundColor={colors.primary[400]}
        p="20px"
        position="relative"
      >
        {loading && (
          <Box
            sx={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              backgroundColor: "rgba(0, 0, 0, 0.8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 999,
            }}
          >
            <Box textAlign="center">
              <Typography variant="h5" color={colors.greenAccent[400]} mb={2}>
                Loading Meter Profiles...
              </Typography>
              <LinearProgress
                sx={{
                  width: 300,
                  height: 8,
                  backgroundColor: colors.grey[700],
                  "& .MuiLinearProgress-bar": {
                    backgroundColor: colors.greenAccent[500],
                  },
                }}
              />
            </Box>
          </Box>
        )}

        {error && !loading && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {!loading && !error && (
          <>
            <Box
              display="flex"
              justifyContent="space-between"
              alignItems="center"
              mb={2}
            >
              <Typography
                variant="h5"
                fontWeight="bold"
                color={colors.grey[100]}
              >
                Registered Meters ({meters.length})
              </Typography>
            </Box>

            <Box height="600px">
              <DataGrid
                rows={meters}
                columns={columns}
                initialState={{
                  pagination: { paginationModel: { pageSize: 25 } },
                }}
                pageSizeOptions={[10, 25, 50, 100]}
                checkboxSelection
                disableRowSelectionOnClick
                sx={{
                  backgroundColor: colors.primary[400],
                  color: colors.primary[100],
                  border: `1px solid ${colors.grey[600]}`,
                  "& .MuiDataGrid-cell": {
                    borderBottom: `1px solid ${colors.grey[700]}`,
                    fontSize: "0.875rem",
                    py: 1,
                  },
                  "& .MuiDataGrid-columnHeaders": {
                    backgroundColor: colors.grey[800],
                    borderBottom: `2px solid ${colors.blueAccent[500]}`,
                    fontSize: "0.9rem",
                    fontWeight: "bold",
                  },
                  "& .MuiDataGrid-virtualScroller": {
                    backgroundColor: colors.primary[400],
                  },
                  "& .MuiDataGrid-footerContainer": {
                    borderTop: `2px solid ${colors.grey[700]}`,
                    backgroundColor: colors.grey[800],
                  },
                  "& .MuiCheckbox-root": {
                    color: `${colors.greenAccent[300]} !important`,
                  },
                  "& .MuiButton-root": {
                    color: colors.primary[100],
                  },
                  "& .MuiDataGrid-row:hover": {
                    backgroundColor: colors.grey[800],
                  },
                }}
                slots={{ toolbar: GridToolbar }}
                slotProps={{
                  toolbar: {
                    showQuickFilter: true,
                    quickFilterProps: { debounceMs: 500 },
                  },
                }}
              />
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
