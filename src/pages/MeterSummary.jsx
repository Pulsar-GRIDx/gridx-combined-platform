import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography, Chip, Button, useTheme } from "@mui/material";
import { DataGrid, GridToolbar } from "@mui/x-data-grid";
import {
  SpeedOutlined,
  WifiOutlined,
  WifiOffOutlined,
  WarningAmberOutlined,
  VisibilityOutlined,
} from "@mui/icons-material";
import Header from "../components/Header";
import StatBox from "../components/StatBox";
import { tokens } from "../theme";
import { meters } from "../services/mockData";

/* ---- helpers ---- */
const fmt = (n) => Number(n).toLocaleString();

function formatDateTime(isoStr) {
  if (!isoStr) return "---";
  const d = new Date(isoStr);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ==================================================================== */
/* MeterSummary Page                                                    */
/* ==================================================================== */
export default function MeterSummary() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const navigate = useNavigate();

  /* ---- counts ---- */
  const totalMeters = meters.length;
  const onlineCount = meters.filter((m) => m.status === "Online").length;
  const offlineCount = meters.filter((m) => m.status === "Offline").length;
  const tamperedCount = meters.filter((m) => m.status === "Tampered").length;

  /* ---- DataGrid columns ---- */
  const columns = [
    {
      field: "drn",
      headerName: "DRN",
      width: 140,
      renderCell: (params) => (
        <Typography
          variant="body2"
          sx={{ fontFamily: "monospace", fontSize: "0.78rem", color: colors.greenAccent[500] }}
        >
          {params.value}
        </Typography>
      ),
    },
    {
      field: "meterNo",
      headerName: "Meter No",
      width: 130,
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: "0.78rem" }}>
          {params.value}
        </Typography>
      ),
    },
    {
      field: "customerName",
      headerName: "Customer",
      flex: 1,
      minWidth: 160,
    },
    { field: "area", headerName: "Area", width: 130 },
    { field: "suburb", headerName: "Suburb", width: 120 },
    {
      field: "transformer",
      headerName: "Transformer",
      width: 120,
      renderCell: (params) => (
        <Typography
          variant="body2"
          sx={{ fontFamily: "monospace", fontSize: "0.75rem", color: colors.grey[400] }}
        >
          {params.value}
        </Typography>
      ),
    },
    {
      field: "status",
      headerName: "Status",
      width: 110,
      renderCell: (params) => {
        const chipColor =
          params.value === "Online"
            ? { bg: "rgba(76,206,172,0.15)", text: colors.greenAccent[500] }
            : params.value === "Tampered"
            ? { bg: "rgba(219,79,74,0.15)", text: "#db4f4a" }
            : { bg: "rgba(108,117,125,0.2)", text: colors.grey[400] };
        return (
          <Chip
            label={params.value}
            size="small"
            sx={{
              bgcolor: chipColor.bg,
              color: chipColor.text,
              fontWeight: 600,
              fontSize: "0.72rem",
              height: 24,
            }}
          />
        );
      },
    },
    {
      field: "voltage",
      headerName: "Voltage",
      width: 90,
      valueGetter: (params) => params.row.power?.voltage,
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontSize: "0.78rem", color: colors.grey[100] }}>
          {params.value} <span style={{ color: colors.grey[400], fontSize: "0.68rem" }}>V</span>
        </Typography>
      ),
    },
    {
      field: "powerFactor",
      headerName: "PF",
      width: 80,
      valueGetter: (params) => params.row.power?.powerFactor,
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontSize: "0.78rem", color: colors.greenAccent[500] }}>
          {params.value}
        </Typography>
      ),
    },
    {
      field: "actions",
      headerName: "Actions",
      width: 140,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Button
          variant="outlined"
          size="small"
          startIcon={<VisibilityOutlined />}
          onClick={() => navigate(`/meter/${params.row.drn}`)}
          sx={{
            fontSize: "0.72rem",
            textTransform: "none",
            color: colors.greenAccent[500],
            borderColor: colors.greenAccent[500],
          }}
        >
          View Profile
        </Button>
      ),
    },
  ];

  /* ---- rows with id ---- */
  const rows = meters.map((m) => ({ ...m, id: m.drn }));

  return (
    <Box m="20px">
      <Header
        title="METER SUMMARY"
        subtitle="Overview of all registered smart meters in the system"
      />

      {/* ---- Stat Boxes ---- */}
      <Box
        display="grid"
        gridTemplateColumns="repeat(12, 1fr)"
        gridAutoRows="140px"
        gap="5px"
      >
        {/* Total Meters */}
        <Box
          gridColumn="span 3"
          backgroundColor={colors.primary[400]}
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <StatBox
            title={fmt(totalMeters)}
            subtitle="Total Meters"
            progress={1}
            increase="100%"
            icon={<SpeedOutlined sx={{ color: colors.greenAccent[600], fontSize: "26px" }} />}
            link="/meters"
          />
        </Box>

        {/* Online */}
        <Box
          gridColumn="span 3"
          backgroundColor={colors.primary[400]}
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <StatBox
            title={fmt(onlineCount)}
            subtitle="Online"
            progress={onlineCount / totalMeters}
            increase={`${((onlineCount / totalMeters) * 100).toFixed(1)}%`}
            icon={<WifiOutlined sx={{ color: colors.greenAccent[600], fontSize: "26px" }} />}
            link="/meters"
          />
        </Box>

        {/* Offline */}
        <Box
          gridColumn="span 3"
          backgroundColor={colors.primary[400]}
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <StatBox
            title={fmt(offlineCount)}
            subtitle="Offline"
            progress={offlineCount / totalMeters}
            increase={`${((offlineCount / totalMeters) * 100).toFixed(1)}%`}
            icon={<WifiOffOutlined sx={{ color: colors.grey[400], fontSize: "26px" }} />}
            link="/meters"
          />
        </Box>

        {/* Tampered */}
        <Box
          gridColumn="span 3"
          backgroundColor={colors.primary[400]}
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <StatBox
            title={fmt(tamperedCount)}
            subtitle="Tampered"
            progress={tamperedCount / totalMeters}
            increase={`${((tamperedCount / totalMeters) * 100).toFixed(1)}%`}
            icon={<WarningAmberOutlined sx={{ color: "#db4f4a", fontSize: "26px" }} />}
            link="/meters"
          />
        </Box>

        {/* ---- DataGrid Table ---- */}
        <Box
          gridColumn="span 12"
          gridRow="span 4"
          backgroundColor={colors.primary[400]}
          borderRadius="4px"
        >
          <Box sx={{ height: "100%", width: "100%" }}>
            <DataGrid
              rows={rows}
              columns={columns}
              initialState={{
                pagination: { paginationModel: { pageSize: 10 } },
              }}
              pageSizeOptions={[10, 25, 50]}
              disableRowSelectionOnClick
              slots={{ toolbar: GridToolbar }}
              slotProps={{
                toolbar: {
                  showQuickFilter: true,
                  quickFilterProps: { debounceMs: 300 },
                },
              }}
              sx={{
                border: "none",
                "& .MuiDataGrid-root": { border: "none" },
                "& .MuiDataGrid-cell": {
                  borderBottom: `1px solid rgba(255,255,255,0.05)`,
                  color: colors.grey[100],
                },
                "& .MuiDataGrid-columnHeaders": {
                  backgroundColor: colors.primary[400],
                  borderBottom: "none",
                  color: colors.grey[100],
                },
                "& .MuiDataGrid-virtualScroller": {
                  backgroundColor: colors.primary[400],
                },
                "& .MuiDataGrid-footerContainer": {
                  borderTop: "none",
                  backgroundColor: colors.primary[400],
                  color: colors.grey[100],
                },
                "& .MuiDataGrid-toolbarContainer": {
                  p: 2,
                  gap: 1,
                },
                "& .MuiCheckbox-root": {
                  color: `${colors.greenAccent[200]} !important`,
                },
              }}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
