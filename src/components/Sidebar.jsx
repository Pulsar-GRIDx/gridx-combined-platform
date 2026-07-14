import { useState, useEffect } from "react";
import { Box, IconButton, Typography, useTheme, Tooltip } from "@mui/material";
import { Link, useLocation } from "react-router-dom";
import { tokens } from "../theme";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import PeopleOutlinedIcon from "@mui/icons-material/PeopleOutlined";
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
import AddHomeWorkIcon from "@mui/icons-material/AddHomeWork";
import SettingsIcon from "@mui/icons-material/Settings";
import RequestQuoteIcon from "@mui/icons-material/RequestQuote";
import BoltIcon from "@mui/icons-material/Bolt";
import EngineeringIcon from "@mui/icons-material/Engineering";
import InventoryIcon from "@mui/icons-material/Inventory";
import GroupIcon from "@mui/icons-material/Group";
import StorefrontIcon from "@mui/icons-material/Storefront";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import TuneIcon from "@mui/icons-material/Tune";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import SpeedIcon from "@mui/icons-material/Speed";
import SolarPowerIcon from "@mui/icons-material/SolarPower";
import ElectricMeterOutlinedIcon from "@mui/icons-material/ElectricMeterOutlined";
import HubIcon from "@mui/icons-material/Hub";
import BuildIcon from "@mui/icons-material/Build";
import SecurityIcon from "@mui/icons-material/Security";
import GppBadIcon from "@mui/icons-material/GppBad";
import PhoneAndroidIcon from "@mui/icons-material/PhoneAndroid";
import KeyboardDoubleArrowLeftIcon from "@mui/icons-material/KeyboardDoubleArrowLeft";
import KeyboardDoubleArrowRightIcon from "@mui/icons-material/KeyboardDoubleArrowRight";
import CellTowerIcon from "@mui/icons-material/CellTower";
import WaterDropOutlinedIcon from "@mui/icons-material/WaterDropOutlined";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import ListAltIcon from "@mui/icons-material/ListAlt";

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
          gap: "10px",
          px: isCollapsed ? "0" : "12px",
          py: "7px",
          mx: isCollapsed ? "8px" : "10px",
          my: "1px",
          borderRadius: "8px",
          textDecoration: "none",
          cursor: "pointer",
          justifyContent: isCollapsed ? "center" : "flex-start",
          transition: "all 0.15s ease",
          bgcolor: isActive ? "#2563EB" : "transparent",
          "&:hover": {
            bgcolor: isActive
              ? "#1D4ED8"
              : isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
          },
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: "22px",
            color: isActive ? "#FFFFFF" : (isDark ? colors.grey[400] : "#6B7280"),
            transition: "color 0.15s",
            "& .MuiSvgIcon-root": { fontSize: "19px" },
          }}
        >
          {icon}
        </Box>
        {!isCollapsed && (
          <Typography
            sx={{
              fontSize: "13px",
              fontWeight: isActive ? 500 : 400,
              color: isActive ? "#FFFFFF" : (isDark ? colors.grey[300] : "#374151"),
              letterSpacing: "0.1px",
              transition: "color 0.15s",
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
const SectionHeader = ({ title, isCollapsed, colors, isDark }) => {
  if (isCollapsed) {
    return (
      <Box
        sx={{
          mx: "auto",
          my: "8px",
          width: "20px",
          height: "1px",
          bgcolor: isDark ? colors.grey[600] : "#E5E7EB",
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
          fontWeight: 600,
          letterSpacing: "1.2px",
          textTransform: "uppercase",
          color: isDark ? colors.grey[500] : "#9CA3AF",
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

  return (
    <Box
      sx={{
        width: sidebarWidth,
        minWidth: sidebarWidth,
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        bgcolor: isDark ? colors.primary[500] : "#FAFAFA",
        borderRight: `1px solid ${isDark ? colors.primary[400] : "#E5E7EB"}`,
        transition:
          "width 0.25s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        position: "relative",
        zIndex: 100,
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
          borderBottom: `1px solid ${isDark ? colors.primary[400] : "#E5E7EB"}`,
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
                    color: "#2563EB",
                  }}
                >
                  GRIDx
                </Typography>
                <Box
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    bgcolor: "#10B981",
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
                  color: isDark ? colors.grey[500] : "#9CA3AF",
                  mt: "-2px",
                }}
              >
                Smart Metering
              </Typography>
            </Box>
            <IconButton
              onClick={() => setIsCollapsed(true)}
              sx={{
                color: isDark ? colors.grey[400] : "#9CA3AF",
                p: "4px",
                borderRadius: "6px",
                "&:hover": {
                  color: isDark ? colors.grey[200] : "#374151",
                  bgcolor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
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
              color: isDark ? colors.grey[400] : "#9CA3AF",
              p: "4px",
              borderRadius: "6px",
              "&:hover": {
                color: isDark ? colors.grey[200] : "#374151",
                bgcolor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
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
            borderRadius: "8px",
            bgcolor: isDark ? "rgba(37,99,235,0.08)" : "rgba(37,99,235,0.05)",
            border: `1px solid ${isDark ? "rgba(37,99,235,0.15)" : "rgba(37,99,235,0.1)"}`,
          }}
        >
          <Typography sx={{ fontSize: "11px", color: isDark ? colors.grey[400] : "#6B7280" }}>
            Welcome back,
          </Typography>
          <Typography
            sx={{ fontSize: "13px", fontWeight: 600, color: isDark ? colors.grey[100] : "#111827" }}
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
            background: isDark ? colors.grey[600] : "#D1D5DB",
            borderRadius: "4px",
            "&:hover": { background: isDark ? colors.grey[500] : "#9CA3AF" },
          },
          // Firefox scrollbar
          scrollbarWidth: "thin",
          scrollbarColor: `${isDark ? colors.grey[600] : "#D1D5DB"} transparent`,
        }}
      >
        {/* Network Map (default landing page) */}
        <NavItem
          title="Network Map"
          to="/"
          icon={<MapOutlinedIcon />}
          isCollapsed={isCollapsed}
          accentColor={colors.greenAccent[500]}
        />

        {/* System */}
        <SectionHeader
          title="System"
          isCollapsed={isCollapsed}
          colors={colors}
          isDark={isDark}
        />
        <NavItem
          title="Dashboard"
          to="/dashboard"
          icon={<HomeOutlinedIcon />}
          isCollapsed={isCollapsed}
          accentColor={colors.blueAccent[500]}
        />
        <NavItem
          title="Net Metering"
          to="/net-metering"
          icon={<SolarPowerIcon />}
          isCollapsed={isCollapsed}
          accentColor="#4caf50"
        />
        <NavItem
          title="Tamper Detection"
          to="/tamper-detection"
          icon={<GppBadIcon />}
          isCollapsed={isCollapsed}
          accentColor="#db4f4a"
        />
        <NavItem
          title="Geyser Detection"
          to="/geyser-detection"
          icon={<WaterDropOutlinedIcon />}
          isCollapsed={isCollapsed}
          accentColor="#0288d1"
        />
        <NavItem
          title="New System Node"
          to="/newmeterdash"
          icon={<AddHomeWorkIcon />}
          isCollapsed={isCollapsed}
          accentColor={colors.greenAccent[500]}
        />
        <NavItem
          title="Meter Profiles"
          to="/meter-profiles"
          icon={<ElectricMeterOutlinedIcon />}
          isCollapsed={isCollapsed}
          accentColor={colors.greenAccent[500]}
        />

        {/* Vending */}
        <SectionHeader
          title="Vending"
          isCollapsed={isCollapsed}
          colors={colors}
          isDark={isDark}
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
        {/* Integrations removed — POS connects via API (background) */}
        <NavItem
          title="HSM"
          to="/hsm"
          icon={<SecurityIcon />}
          isCollapsed={isCollapsed}
          accentColor="#00bfa5"
        />

        {/* Data */}
        <SectionHeader
          title="Data"
          isCollapsed={isCollapsed}
          colors={colors}
          isDark={isDark}
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
          title="Data Usage"
          to="/data-usage"
          icon={<CellTowerIcon />}
          isCollapsed={isCollapsed}
          accentColor="#06b6d4"
        />
        {/* System Analysis — disabled for now
        <NavItem
          title="System Analysis"
          to="/system-analysis"
          icon={<SpeedIcon />}
          isCollapsed={isCollapsed}
          accentColor="#6366f1"
        />
        */}
        {/* LoRa Network */}
        <SectionHeader
          title="LoRa Network"
          isCollapsed={isCollapsed}
          colors={colors}
          isDark={isDark}
        />
        <NavItem
          title="Mesh Overview"
          to="/lora-mesh-overview"
          icon={<HubIcon />}
          isCollapsed={isCollapsed}
          accentColor="#06b6d4"
        />
        <NavItem
          title="Routing Table"
          to="/lora-routing-table"
          icon={<AccountTreeOutlinedIcon />}
          isCollapsed={isCollapsed}
          accentColor="#06b6d4"
        />
        <NavItem
          title="Communication Log"
          to="/lora-communication-log"
          icon={<ListAltIcon />}
          isCollapsed={isCollapsed}
          accentColor="#06b6d4"
        />
        <NavItem
          title="Reliability Comparison"
          to="/lora-reliability-comparison"
          icon={<SpeedIcon />}
          isCollapsed={isCollapsed}
          accentColor="#06b6d4"
        />

        {/* Administration */}
        <SectionHeader
          title="Admin"
          isCollapsed={isCollapsed}
          colors={colors}
          isDark={isDark}
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
        <NavItem
          title="App Users"
          to="/app-users"
          icon={<PhoneAndroidIcon />}
          isCollapsed={isCollapsed}
          accentColor={colors.redAccent[400]}
        />
        <NavItem
          title="Installers"
          to="/installers"
          icon={<BuildIcon />}
          isCollapsed={isCollapsed}
          accentColor="#ff9800"
        />

        {/* Bottom spacer */}
        <Box sx={{ height: "20px" }} />
      </Box>

      {/* ── Footer ── */}
      <Box
        sx={{
          px: isCollapsed ? "8px" : "16px",
          py: "10px",
          borderTop: `1px solid ${isDark ? colors.primary[400] : "#E5E7EB"}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {!isCollapsed ? (
          <Typography
            sx={{
              fontSize: "9px",
              color: isDark ? colors.grey[500] : "#9CA3AF",
              letterSpacing: "0.5px",
              textAlign: "center",
            }}
          >
            GRIDx Platform v2.0
          </Typography>
        ) : (
          <Box
            sx={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              bgcolor: "#10B981",
            }}
          />
        )}
      </Box>
    </Box>
  );
};

export default Sidebar;
