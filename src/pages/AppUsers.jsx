import { useState, useEffect } from "react";
import {
  Box,
  Typography,
  useTheme,
  Chip,
  LinearProgress,
  Grid,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from "@mui/material";
import { DataGrid, GridToolbar } from "@mui/x-data-grid";
import { tokens } from "../theme";
import {
  PersonOutlined,
  VerifiedUserOutlined,
  BlockOutlined,
  PhoneAndroidOutlined,
  ElectricMeterOutlined,
  LoginOutlined,
  DeleteOutlined,
} from "@mui/icons-material";
import { Link } from "react-router-dom";
import Header from "../components/Header";
import { authAPI } from "../services/api";

export default function AppUsers() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, user: null });
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await authAPI.getAllUsers();
        const list = Array.isArray(data) ? data : data?.users || [];
        setUsers(list.map((u) => ({ ...u, id: u.UserID || u.id })));
      } catch (err) {
        console.error("Failed to fetch app users:", err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  const handleDeleteUser = async () => {
    if (!deleteDialog.user) return;
    setDeleting(true);
    try {
      await authAPI.deleteUser(deleteDialog.user.UserID);
      setUsers((prev) => prev.filter((u) => u.UserID !== deleteDialog.user.UserID));
    } catch (err) {
      console.error("Failed to delete user:", err);
      alert("Failed to delete user: " + (err.message || "Unknown error"));
    } finally {
      setDeleting(false);
      setDeleteDialog({ open: false, user: null });
    }
  };

  const verified = users.filter((u) => u.isVerified === "1" || u.isVerified === 1).length;
  const unverified = users.length - verified;
  const recentLogins = users.filter((u) => {
    if (!u.lastLoginTime) return false;
    const diff = Date.now() - new Date(u.lastLoginTime).getTime();
    return diff < 7 * 24 * 60 * 60 * 1000;
  }).length;

  const columns = [
    {
      field: "UserID", headerName: "ID", flex: 0.05, minWidth: 60,
      renderCell: ({ value }) => (
        <Typography variant="body2" fontWeight={600} color={colors.grey[100]}>#{value}</Typography>
      ),
    },
    {
      field: "FirstName", headerName: "Name", flex: 0.18, minWidth: 150,
      renderCell: ({ row }) => (
        <Box display="flex" alignItems="center" gap={1.5}>
          <Box sx={{
            width: 34, height: 34, borderRadius: "50%", bgcolor: colors.blueAccent[700],
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <Typography variant="body2" fontWeight={700} color="#fff">
              {(row.FirstName?.[0] || "").toUpperCase()}{(row.LastName?.[0] || "").toUpperCase()}
            </Typography>
          </Box>
          <Box>
            <Typography variant="body2" fontWeight={600} color={colors.grey[100]}>
              {row.FirstName} {row.LastName || ""}
            </Typography>
            <Typography variant="caption" color={colors.grey[400]}>{row.Email}</Typography>
          </Box>
        </Box>
      ),
    },
    {
      field: "Email", headerName: "Email", flex: 0.18, minWidth: 160,
    },
    {
      field: "DRN", headerName: "Meter (DRN)", flex: 0.14, minWidth: 130,
      renderCell: ({ value }) => (
        <Box component={Link} to={`/meter/${value}`}
          sx={{ textDecoration: "none", color: colors.blueAccent[400], fontFamily: "monospace", fontWeight: 600, "&:hover": { color: colors.greenAccent[400] } }}>
          {value}
        </Box>
      ),
    },
    {
      field: "isVerified", headerName: "Verified", flex: 0.08, minWidth: 90,
      renderCell: ({ value }) => (
        <Chip label={value === "1" || value === 1 ? "Verified" : "Unverified"} size="small"
          icon={value === "1" || value === 1 ? <VerifiedUserOutlined sx={{ fontSize: 14 }} /> : <BlockOutlined sx={{ fontSize: 14 }} />}
          sx={{
            bgcolor: value === "1" || value === 1 ? "rgba(76,206,172,0.15)" : "rgba(219,79,74,0.15)",
            color: value === "1" || value === 1 ? colors.greenAccent[500] : "#db4f4a",
            fontWeight: 600, fontSize: "0.75rem",
          }} />
      ),
    },
    {
      field: "login_count", headerName: "Logins", flex: 0.06, minWidth: 70, align: "center", headerAlign: "center",
      renderCell: ({ value }) => (
        <Typography variant="body2" fontWeight={600} color={colors.grey[100]}>{value ?? 0}</Typography>
      ),
    },
    {
      field: "lastLoginTime", headerName: "Last Login", flex: 0.14, minWidth: 130,
      renderCell: ({ value }) => {
        if (!value) return <Typography variant="caption" color={colors.grey[500]}>Never</Typography>;
        const d = new Date(value);
        return (
          <Box>
            <Typography variant="body2" fontWeight={500}>{d.toLocaleDateString("en-ZA")}</Typography>
            <Typography variant="caption" color={colors.grey[400]}>{d.toLocaleTimeString()}</Typography>
          </Box>
        );
      },
    },
    {
      field: "ip_address", headerName: "IP Address", flex: 0.1, minWidth: 110,
      renderCell: ({ value }) => (
        <Typography variant="body2" fontFamily="monospace" color={colors.grey[300]}>{value || "-"}</Typography>
      ),
    },
    {
      field: "actions", headerName: "", flex: 0.05, minWidth: 50, sortable: false, filterable: false,
      renderCell: ({ row }) => (
        <IconButton size="small" onClick={() => setDeleteDialog({ open: true, user: row })}
          sx={{ color: colors.redAccent[400], "&:hover": { color: colors.redAccent[300], bgcolor: "rgba(219,79,74,0.1)" } }}>
          <DeleteOutlined fontSize="small" />
        </IconButton>
      ),
    },
  ];

  const StatCard = ({ title, value, icon, color }) => (
    <Box sx={{
      bgcolor: colors.primary[400], borderLeft: `4px solid ${color}`, p: 2,
      display: "flex", justifyContent: "space-between", alignItems: "center",
    }}>
      <Box>
        <Typography variant="body2" color={colors.grey[300]}>{title}</Typography>
        <Typography variant="h3" fontWeight="bold" color={colors.grey[100]}>{value}</Typography>
      </Box>
      <Box sx={{ bgcolor: color, width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 1 }}>
        {icon}
      </Box>
    </Box>
  );

  return (
    <Box m="20px">
      <Header title="APP USERS" subtitle="Users registered via the GRIDx meter mobile app" />

      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Total Users" value={users.length} icon={<PersonOutlined sx={{ color: "#fff" }} />} color={colors.blueAccent[500]} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Verified" value={verified} icon={<VerifiedUserOutlined sx={{ color: "#fff" }} />} color={colors.greenAccent[500]} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Unverified" value={unverified} icon={<BlockOutlined sx={{ color: "#fff" }} />} color={colors.redAccent[500]} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Active (7d)" value={recentLogins} icon={<LoginOutlined sx={{ color: "#fff" }} />} color="#f2b705" />
        </Grid>
      </Grid>

      <Box sx={{ bgcolor: colors.primary[400], p: 3 }}>
        {loading ? (
          <Box textAlign="center" py={4}>
            <Typography variant="h6" color={colors.greenAccent[400]} mb={2}>Loading App Users...</Typography>
            <LinearProgress sx={{ width: 280, mx: "auto", height: 6, bgcolor: colors.grey[700], "& .MuiLinearProgress-bar": { bgcolor: colors.greenAccent[500] } }} />
          </Box>
        ) : (
          <Box height="600px">
            <DataGrid
              rows={users}
              columns={columns}
              initialState={{ pagination: { paginationModel: { pageSize: 25 } }, sorting: { sortModel: [{ field: "UserID", sort: "desc" }] } }}
              pageSizeOptions={[25, 50, 100]}
              disableRowSelectionOnClick
              sx={{
                bgcolor: colors.primary[400], color: colors.primary[100],
                border: `1px solid ${colors.grey[700]}`,
                "& .MuiDataGrid-cell": { borderBottom: `1px solid ${colors.grey[700]}`, fontSize: "0.85rem", py: 1 },
                "& .MuiDataGrid-columnHeaders": { bgcolor: colors.grey[800], borderBottom: `2px solid ${colors.blueAccent[500]}`, fontWeight: "bold" },
                "& .MuiDataGrid-virtualScroller": { bgcolor: colors.primary[400] },
                "& .MuiDataGrid-footerContainer": { borderTop: `2px solid ${colors.grey[700]}`, bgcolor: colors.grey[800] },
                "& .MuiDataGrid-row:hover": { bgcolor: colors.grey[800] },
              }}
              slots={{ toolbar: GridToolbar }}
              slotProps={{ toolbar: { showQuickFilter: true, quickFilterProps: { debounceMs: 500 } } }}
            />
          </Box>
        )}
      </Box>

      <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, user: null })}
        PaperProps={{ sx: { bgcolor: colors.primary[400], color: colors.grey[100] } }}>
        <DialogTitle>Delete App User</DialogTitle>
        <DialogContent>
          <DialogContentText color={colors.grey[300]}>
            Are you sure you want to delete user{" "}
            <strong>{deleteDialog.user?.FirstName} {deleteDialog.user?.LastName}</strong>{" "}
            ({deleteDialog.user?.Email})? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, user: null })} sx={{ color: colors.grey[300] }}>
            Cancel
          </Button>
          <Button onClick={handleDeleteUser} disabled={deleting} variant="contained"
            sx={{ bgcolor: colors.redAccent[500], "&:hover": { bgcolor: colors.redAccent[600] } }}>
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
