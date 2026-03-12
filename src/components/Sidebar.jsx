import { useState, useEffect } from "react";
import { ProSidebar, Menu, MenuItem } from "react-pro-sidebar";
import { Box, IconButton, Typography, useTheme } from "@mui/material";
import { Link } from "react-router-dom";
import "react-pro-sidebar/dist/css/styles.css";
import { tokens } from "../theme";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import PeopleOutlinedIcon from "@mui/icons-material/PeopleOutlined";
import MenuOutlinedIcon from "@mui/icons-material/MenuOutlined";
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
import AppsIcon from "@mui/icons-material/Apps";
import NotificationImportantIcon from "@mui/icons-material/NotificationImportant";
import AddHomeWorkIcon from "@mui/icons-material/AddHomeWork";
import SettingsIcon from "@mui/icons-material/Settings";
import InsertChartIcon from "@mui/icons-material/InsertChart";
import RequestQuoteIcon from "@mui/icons-material/RequestQuote";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
// New vending icons
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

const Item = ({ title, to, icon, selected, setSelected, isCollapsed }) => {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  return (
    <MenuItem
      active={selected === title}
      onClick={() => setSelected(title)}
      icon={icon}
    >
      {isCollapsed ? null : <Typography>{title}</Typography>}
      <Link to={to} />
    </MenuItem>
  );
};

const SectionTitle = ({ title, isCollapsed, colors }) => {
  if (isCollapsed) return null;
  return (
    <Box display="flex" justifyContent="space-between" alignItems="center" ml="15px">
      <Typography variant="h6" color={colors.grey[300]} sx={{ m: "15px 0 5px 20px" }}>
        {title}
      </Typography>
    </Box>
  );
};

const Sidebar = () => {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [selected, setSelected] = useState("Dashboard");
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const userData = sessionStorage.getItem('user');
    if (userData) {
      try {
        const user = JSON.parse(userData);
        if (user.name) {
          setUserName(user.name.charAt(0).toUpperCase() + user.name.slice(1));
        }
      } catch (error) {
        console.error('Error parsing user data:', error);
      }
    }
  }, []);

  return (
    <Box
      sx={{
        "& .pro-sidebar-inner": { backgroundColor: "rgba(0, 0, 0, 0) !important" },
        "& .pro-icon-wrapper": { backgroundColor: "transparent !important" },
        "& .pro-inner-item": { padding: "5px 5px 5px 10px !important" },
        "& .pro-inner-item:hover": { color: "#868dfb !important" },
        "& .pro-menu-item.active": { color: "#6870fa !important" },
      }}
    >
      <ProSidebar style={{ height: "100%" }} collapsed={isCollapsed}>
        <Box sx={{ height: 1, position: "fixed" }}>
          <Menu iconShape="square">
            {/* LOGO AND MENU ICON */}
            <MenuItem
              onClick={() => setIsCollapsed(!isCollapsed)}
              icon={isCollapsed ? <MenuOutlinedIcon /> : undefined}
              style={{ margin: "10px 0 20px 0", color: colors.redAccent[100] }}
            >
              {!isCollapsed && (
                <Box display="flex" justifyContent="space-between" alignItems="center" ml="15px">
                  <Box mb="5px">
                    <Typography variant="h3" color={colors.grey[100]}>GRIDx</Typography>
                    <Typography variant="h5" color={colors.greenAccent[300]}>
                      Smart Metering Platform
                    </Typography>
                    {userName && (
                      <Typography variant="h6" color={colors.blueAccent[300]} sx={{ mt: 1 }}>
                        Welcome, {userName}!
                      </Typography>
                    )}
                  </Box>
                  <IconButton onClick={() => setIsCollapsed(!isCollapsed)}>
                    <MenuOutlinedIcon />
                  </IconButton>
                </Box>
              )}
            </MenuItem>

            <Box paddingLeft={isCollapsed ? undefined : "0%"}>
              {/* DASHBOARD */}
              <Item title="Dashboard" to="/" icon={<HomeOutlinedIcon style={{ color: colors.outline[500] }} />}
                isCollapsed={isCollapsed} selected={selected} setSelected={setSelected} />

              {/* SYSTEM section - same as v3 */}
              <SectionTitle title="System" isCollapsed={isCollapsed} colors={colors} />
              <Item title="Map" to="/map" icon={<MapOutlinedIcon style={{ color: colors.outline[500] }} />}
                isCollapsed={isCollapsed} selected={selected} setSelected={setSelected} />
              <Item title="Grid Topology" to="/topology" icon={<AppsIcon style={{ color: colors.outline[500] }} />}
                isCollapsed={isCollapsed} selected={selected} setSelected={setSelected} />
              <Item title="Meter Summary" to="/meter-summary" icon={<SpeedIcon style={{ color: colors.outline[500] }} />}
                isCollapsed={isCollapsed} selected={selected} setSelected={setSelected} />

              {/* VENDING section - NEW */}
              <SectionTitle title="Vending" isCollapsed={isCollapsed} colors={colors} />
              <Item title="Vend Token" to="/vending" icon={<BoltIcon style={{ color: colors.yellowAccent[500] }} />}
                isCollapsed={isCollapsed} selected={selected} setSelected={setSelected} />
              <Item title="Engineering" to="/engineering" icon={<EngineeringIcon style={{ color: colors.outline[500] }} />}
                isCollapsed={isCollapsed} selected={selected} setSelected={setSelected} />
              <Item title="Batches" to="/batches" icon={<InventoryIcon style={{ color: colors.outline[500] }} />}
                isCollapsed={isCollapsed} selected={selected} setSelected={setSelected} />
              <Item title="Customers" to="/customers" icon={<GroupIcon style={{ color: colors.outline[500] }} />}
                isCollapsed={isCollapsed} selected={selected} setSelected={setSelected} />
              <Item title="Vendors" to="/vendors" icon={<StorefrontIcon style={{ color: colors.outline[500] }} />}
                isCollapsed={isCollapsed} selected={selected} setSelected={setSelected} />

              {/* DATA section - same as v3 */}
              <SectionTitle title="Data" isCollapsed={isCollapsed} colors={colors} />
              <Item title="Transactions" to="/transactions" icon={<ReceiptLongIcon style={{ color: colors.outline[500] }} />}
                isCollapsed={isCollapsed} selected={selected} setSelected={setSelected} />
              <Item title="Billing Summary" to="/billing" icon={<RequestQuoteIcon style={{ color: colors.outline[500] }} />}
                isCollapsed={isCollapsed} selected={selected} setSelected={setSelected} />
              <Item title="Tariffs" to="/tariffs" icon={<TuneIcon style={{ color: colors.outline[500] }} />}
                isCollapsed={isCollapsed} selected={selected} setSelected={setSelected} />
              <Item title="Reports" to="/reports" icon={<AssessmentIcon style={{ color: colors.outline[500] }} />}
                isCollapsed={isCollapsed} selected={selected} setSelected={setSelected} />
              <Item title="Notifications" to="/notifications" icon={<NotificationImportantIcon style={{ color: colors.outline[500] }} />}
                isCollapsed={isCollapsed} selected={selected} setSelected={setSelected} />
              <Item title="Analysis" to="/analysis" icon={<InsertChartIcon style={{ color: colors.outline[500] }} />}
                isCollapsed={isCollapsed} selected={selected} setSelected={setSelected} />

              {/* ADMINISTRATION section - same as v3 */}
              <SectionTitle title="Administration" isCollapsed={isCollapsed} colors={colors} />
              <Item title="Admin" to="/admin" icon={<AdminPanelSettingsIcon style={{ color: colors.outline[500] }} />}
                isCollapsed={isCollapsed} selected={selected} setSelected={setSelected} />
              <Item title="System Settings" to="/settings" icon={<SettingsIcon style={{ color: colors.outline[500] }} />}
                isCollapsed={isCollapsed} selected={selected} setSelected={setSelected} />
              <Item title="Manage Users" to="/users" icon={<PeopleOutlinedIcon style={{ color: colors.outline[500] }} />}
                isCollapsed={isCollapsed} selected={selected} setSelected={setSelected} />
            </Box>
          </Menu>
        </Box>
      </ProSidebar>
    </Box>
  );
};

export default Sidebar;
