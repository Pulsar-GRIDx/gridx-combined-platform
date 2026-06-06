import { Box, IconButton, Typography, useTheme } from "@mui/material";
import { useContext } from "react";
import { ColorModeContext, tokens } from "../theme";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import Tooltip from "@mui/material/Tooltip";
import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";
import { useNavigate } from "react-router-dom";

const Topbar = () => {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const colorMode = useContext(ColorModeContext);
  const navigate = useNavigate();
  const isDark = theme.palette.mode === "dark";

  const handleLogout = () => {
    navigate("/login");
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
  };

  return (
    <Box
      sx={{
        position: "sticky",
        top: 0,
        zIndex: theme.zIndex.appBar + 1,
        bgcolor: isDark ? "#0F172A" : "#FFFFFF",
        borderBottom: `1px solid ${isDark ? "#1E293B" : "#E5E7EB"}`,
      }}
      display="flex"
      justifyContent="flex-end"
      alignItems="center"
      px={3}
      py={1}
    >
      <Box display="flex" alignItems="center" gap="2px">
        <Tooltip title={isDark ? "Light Mode" : "Dark Mode"}>
          <IconButton
            onClick={colorMode.toggleColorMode}
            sx={{
              color: isDark ? colors.grey[300] : "#6B7280",
              borderRadius: "8px",
              p: "8px",
              "&:hover": {
                bgcolor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
              },
            }}
          >
            {isDark ? (
              <LightModeOutlinedIcon sx={{ fontSize: 20 }} />
            ) : (
              <DarkModeOutlinedIcon sx={{ fontSize: 20 }} />
            )}
          </IconButton>
        </Tooltip>
        <Tooltip title="Log Out">
          <IconButton
            onClick={handleLogout}
            sx={{
              color: isDark ? colors.grey[300] : "#6B7280",
              borderRadius: "8px",
              p: "8px",
              "&:hover": {
                bgcolor: "rgba(239,68,68,0.08)",
                color: "#EF4444",
              },
            }}
          >
            <LogoutOutlinedIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
};

export default Topbar;
