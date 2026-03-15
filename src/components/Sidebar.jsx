import { useState, useEffect } from "react";
import { Box, IconButton, Typography, useTheme, Tooltip } from "@mui/material";
import { Link, useLocation } from "react-router-dom";
import { tokens } from "../theme";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import PeopleOutlinedIcon from "@mui/icons-material/PeopleOutlined";
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
import AppsIcon from "@mui/icons-material/Apps";
import NotificationImportantIcon from "@mui/icons-material/NotificationImportant";
import AddHomeWorkIcon from "@mui/icons-material/AddHomeWork";
import SettingsIcon from "@mui/icons-material/Settings";
import InsertChartIcon from "@mui/icons-material/InsertChart";
import RequestQuoteIcon from "@mui/icons-material/RequestQuote";
import BoltIcon from "@mui/icons-material/Bolt";
import EngineeringIcon from "@mui/icons-material/Engineering";
import InventoryIcon from "@mui/icons-material/Inventory";
import GroupIcon from "@mui/icons-material/Group";
import StorefrontIcon from "@mui/icons-material/Storefront";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import TuneIcon from "@mui/icons-material/Tune";
import AssessmentIcon from "@mui/icons-material/Assessment";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import SpeedIcon from "@mui/icons-material/Speed";
import HubIcon from "@mui/icons-material/Hub";
import KeyboardDoubleArrowLeftIcon from "@mui/icons-material/KeyboardDoubleArrowLeft";
import KeyboardDoubleArrowRightIcon from "@mui/icons-material/KeyboardDoubleArrowRight";

/* ── Nav Item ── */
const NavItem = ({ title, to, icon, isCollapsed, accentColor }) => {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const isDark = theme.palette.mode === "dark";
  const location = useLocation();
  const isActive = location.pathname === to || (to === "/" && location.pathname === "");

  return (
    <Tooltip title={isCollapsed ? title : ""} placement="right" arrow>
      <Box
        component={Link}
        to={to}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          px: isCollapsed ? "0" : "14px",
          py: "8px",
          mx: isCollapsed ? "6px" : "8px",
          my: "1px",
          borderRadius: "10px",
          textDecoration: "none",
          cursor: "pointer",
          position: "relative",
          justifyContent: isCollapsed ? "center" : "flex-start",
          overflow: "hidden",
          transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
          bgcolor: isActive ? `${accentColor || colors.blueAccent[500]}18` : "transparent",
          "&:hover": {
            bgcolor: isActive
              ? `${accentColor || colors.blueAccent[500]}22`
              : isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
            transform: "translateX(2px)",
          },
          // Active left indicator bar
          "&::before": isActive
            ? {
                content: '""',
                position: "absolute",
                left: 0,
                top: "20%",
                bottom: "20%",
                width: "3px",
                borderRadius: "0 3px 3px 0",
                bgcolor: accentColor || colors.blueAccent[500],
                boxShadow: `0 0 8px ${accentColor || colors.blueAccent[500]}60`,
              }
            : {},
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: "24px",
            color: isActive ? (accentColor || colors.blueAccent[400]) : colors.grey[400],
            transition: "color 0.2s",
            "& .MuiSvgIcon-root": { fontSize: "20px" },
          }}
        >
          {icon}
        </Box>
        {!isCollapsed && (
          <Typography
            sx={{
              fontSize: "13px",
              fontWeight: isActive ? 600 : 400,
              color: isActive ? colors.grey[100] : colors.grey[300],
              letterSpacing: "0.2px",
              transition: "color 0.2s",
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </Typography>
        )}
      </Box>
    </Tooltip>
  );
};

/* ── Section Header ── */
const SectionHeader = ({ title, isCollapsed, colors }) => {
  if (isCollapsed) {
    return (
      <Box
        sx={{
          mx: "auto",
          my: "8px",
          width: "24px",
          height: "1px",
          bgcolor: colors.grey[700],
          borderRadius: "1px",
        }}
      />
    );
  }
  return (
    <Box sx={{ px: "22px", pt: "16px", pb: "4px" }}>
      <Typography
        sx={{
          fontSize: "10px",
          fontWeight: 700,
          letterSpacing: "1.5px",
          textTransform: "uppercase",
          color: colors.grey[500],
        }}
      >
        {title}
      </Typography>
    </Box>
  );
};

/* ── Main Sidebar ── */
const Sidebar = () => {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const userData = sessionStorage.getItem("user");
    if (userData) {
      try {
        const user = JSON.parse(userData);
        if (user.name)
          setUserName(user.name.charAt(0).toUpperCase() + user.name.slice(1));
      } catch (e) {
        /* ignore */
      }
    }
  }, []);

  const sidebarWidth = isCollapsed ? 68 : 240;
  const isDark = theme.palette.mode === "dark";
  const hoverBg = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";

  return (
    <Box
      sx={{
        width: sidebarWidth,
        minWidth: sidebarWidth,
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        bgcolor: isDark ? colors.primary[500] : colors.primary[900],
        borderRight: `1px solid ${isDark ? colors.primary[400] : colors.grey[900]}`,
        transition:
          "width 0.25s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        position: "relative",
        zIndex: 100,
        // Subtle right-edge glow
        "&::after": {
          content: '""',
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: "1px",
          background: `linear-gradient(180deg, transparent 0%, ${colors.blueAccent[500]}30 30%, ${colors.greenAccent[500]}20 70%, transparent 100%)`,
        },
      }}
    >
      {/* ── Header / Logo ── */}
      <Box
        sx={{
          px: isCollapsed ? "8px" : "16px",
          py: "16px",
          display: "flex",
          alignItems: "center",
          justifyContent: isCollapsed ? "center" : "space-between",
          borderBottom: `1px solid ${isDark ? colors.primary[400] : colors.grey[900]}`,
          minHeight: isCollapsed ? "64px" : "auto",
        }}
      >
        {!isCollapsed ? (
          <>
            <Box>
              <Box display="flex" alignItems="baseline" gap="4px">
                <Typography
                  sx={{
                    fontSize: "22px",
                    fontWeight: 800,
                    letterSpacing: "-0.5px",
                    background: `linear-gradient(135deg, ${colors.greenAccent[400]}, ${colors.blueAccent[400]})`,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  GRIDx
                </Typography>
                <Box
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    bgcolor: colors.greenAccent[500],
                    boxShadow: `0 0 6px ${colors.greenAccent[500]}`,
                    animation: "pulse-dot 2s ease-in-out infinite",
                    "@keyframes pulse-dot": {
                      "0%, 100%": { opacity: 1, transform: "scale(1)" },
                      "50%": { opacity: 0.5, transform: "scale(0.8)" },
                    },
                  }}
                />
              </Box>
              <Typography
                sx={{
                  fontSize: "10px",
                  fontWeight: 500,
                  letterSpacing: "1px",
                  textTransform: "uppercase",
                  color: colors.grey[500],
                  mt: "-2px",
                }}
              >
                Smart Metering
              </Typography>
            </Box>
            <IconButton
              onClick={() => setIsCollapsed(true)}
              sx={{
                color: colors.grey[500],
                p: "4px",
                "&:hover": {
                  color: colors.grey[300],
                  bgcolor: hoverBg,
                },
              }}
            >
              <KeyboardDoubleArrowLeftIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </>
        ) : (
          <IconButton
            onClick={() => setIsCollapsed(false)}
            sx={{
              color: colors.grey[500],
              p: "4px",
              "&:hover": {
                color: colors.grey[300],
                bgcolor: "rgba(255,255,255,0.05)",
              },
            }}
          >
            <KeyboardDoubleArrowRightIcon sx={{ fontSize: 18 }} />
          </IconButton>
        )}
      </Box>

      {/* ── User greeting ── */}
      {!isCollapsed && userName && (
        <Box
          sx={{
            mx: "12px",
            mt: "10px",
            mb: "4px",
            px: "12px",
            py: "8px",
            borderRadius: "10px",
            background: `linear-gradient(135deg, ${colors.blueAccent[500]}12, ${colors.greenAccent[500]}08)`,
            border: `1px solid ${colors.blueAccent[500]}15`,
          }}
        >
          <Typography sx={{ fontSize: "11px", color: colors.grey[400] }}>
            Welcome back,
          </Typography>
          <Typography
            sx={{ fontSize: "13px", fontWeight: 600, color: colors.grey[100] }}
          >
            {userName}
          </Typography>
        </Box>
      )}

      {/* ── Scrollable Navigation ── */}
      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          py: "6px",
          // Custom thin scrollbar
          "&::-webkit-scrollbar": { width: "4px" },
          "&::-webkit-scrollbar-track": { background: "transparent" },
          "&::-webkit-scrollbar-thumb": {
            background: colors.grey[700],
            borderRadius: "4px",
            "&:hover": { background: colors.grey[600] },
          },
          // Firefox scrollbar
          scrollbarWidth: "thin",
          scrollbarColor: `${colors.grey[700]} transparent`,
        }}
      >
        {/* Dashboard */}
        <NavItem
          title="Dashboard"
          to="/"
          icon={<HomeOutlinedIcon />}
          isCollapsed={isCollapsed}
          accentColor={colors.blueAccent[500]}
        />

        {/* System */}
        <SectionHeader
          title="System"
          isCollapsed={isCollapsed}
          colors={colors}
        />
        <NavItem
          title="Map"
          to="/map"
          icon={<MapOutlinedIcon />}
          isCollapsed={isCollapsed}
          accentColor={colors.greenAccent[500]}
        />
        <NavItem
          title="Grid Topology"
          to="/topology"
          icon={<AppsIcon />}
          isCollapsed={isCollapsed}
          accentColor={colors.greenAccent[500]}
        />
        <NavItem
          title="Meter Summary"
          to="/meter-summary"
          icon={<SpeedIcon />}
          isCollapsed={isCollapsed}
          accentColor={colors.greenAccent[500]}
        />
        <NavItem
          title="New System Node"
          to="/newmeterdash"
          icon={<AddHomeWorkIcon />}
          isCollapsed={isCollapsed}
          accentColor={colors.greenAccent[500]}
        />
        <NavItem
          title="Load Control"
          to="/load-control"
          icon={<TuneIcon />}
          isCollapsed={isCollapsed}
          accentColor="#f2b705"
        />

        {/* Vending */}
        <SectionHeader
          title="Vending"
          isCollapsed={isCollapsed}
          colors={colors}
        />
        <NavItem
          title="Vend Token"
          to="/vending"
          icon={<BoltIcon />}
          isCollapsed={isCollapsed}
          accentColor={colors.yellowAccent[500]}
        />
        <NavItem
          title="Engineering"
          to="/engineering"
          icon={<EngineeringIcon />}
          isCollapsed={isCollapsed}
          accentColor={colors.yellowAccent[500]}
        />
        <NavItem
          title="Batches"
          to="/batches"
          icon={<InventoryIcon />}
          isCollapsed={isCollapsed}
          accentColor={colors.yellowAccent[500]}
        />
        <NavItem
          title="Customers"
          to="/customers"
          icon={<GroupIcon />}
          isCollapsed={isCollapsed}
          accentColor={colors.yellowAccent[500]}
        />
        <NavItem
          title="Vendors"
          to="/vendors"
          icon={<StorefrontIcon />}
          isCollapsed={isCollapsed}
          accentColor={colors.yellowAccent[500]}
        />
        <NavItem
          title="Integrations"
          to="/integrations"
          icon={<HubIcon />}
          isCollapsed={isCollapsed}
          accentColor={colors.yellowAccent[500]}
        />

        {/* Data */}
        <SectionHeader
          title="Data"
          isCollapsed={isCollapsed}
          colors={colors}
        />
        <NavItem
          title="Transactions"
          to="/transactions"
          icon={<ReceiptLongIcon />}
          isCollapsed={isCollapsed}
          accentColor={colors.blueAccent[500]}
        />
        <NavItem
          title="Billing Summary"
          to="/billing"
          icon={<RequestQuoteIcon />}
          isCollapsed={isCollapsed}
          accentColor={colors.blueAccent[500]}
        />
        <NavItem
          title="Tariffs"
          to="/tariffs"
          icon={<TuneIcon />}
          isCollapsed={isCollapsed}
          accentColor={colors.blueAccent[500]}
        />
        <NavItem
          title="Reports"
          to="/reports"
          icon={<AssessmentIcon />}
          isCollapsed={isCollapsed}
          accentColor={colors.blueAccent[500]}
        />
        <NavItem
          title="Notifications"
          to="/notifications"
          icon={<NotificationImportantIcon />}
          isCollapsed={isCollapsed}
          accentColor={colors.redAccent[500]}
        />
        <NavItem
          title="Analysis"
          to="/analysis"
          icon={<InsertChartIcon />}
          isCollapsed={isCollapsed}
          accentColor={colors.blueAccent[500]}
        />

        {/* Administration */}
        <SectionHeader
          title="Admin"
          isCollapsed={isCollapsed}
          colors={colors}
        />
        <NavItem
          title="Admin Panel"
          to="/admin"
          icon={<AdminPanelSettingsIcon />}
          isCollapsed={isCollapsed}
          accentColor={colors.redAccent[400]}
        />
        <NavItem
          title="System Settings"
          to="/settings"
          icon={<SettingsIcon />}
          isCollapsed={isCollapsed}
          accentColor={colors.redAccent[400]}
        />
        <NavItem
          title="Manage Users"
          to="/users"
          icon={<PeopleOutlinedIcon />}
          isCollapsed={isCollapsed}
          accentColor={colors.redAccent[400]}
        />

        {/* Bottom spacer */}
        <Box sx={{ height: "20px" }} />
      </Box>

      {/* ── Footer ── */}
      <Box
        sx={{
          px: isCollapsed ? "8px" : "16px",
          py: "10px",
          borderTop: `1px solid ${isDark ? colors.primary[400] : colors.grey[900]}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {!isCollapsed ? (
          <Typography
            sx={{
              fontSize: "9px",
              color: colors.grey[600],
              letterSpacing: "0.5px",
              textAlign: "center",
            }}
          >
            GRIDx Platform v2.0
          </Typography>
        ) : (
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              bgcolor: colors.greenAccent[500],
              boxShadow: `0 0 4px ${colors.greenAccent[500]}80`,
            }}
          />
        )}
      </Box>
    </Box>
  );
};

export default Sidebar;
