import { Box, IconButton, useTheme } from "@mui/material";
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
        zIndex: theme.zIndex.appBar,
        bgcolor: isDark ? "rgba(20,27,45,0.85)" : "rgba(245,245,245,0.85)",
        backdropFilter: "blur(8px)",
        borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.06)"}`,
      }}
      display="flex"
      justifyContent="flex-end"
      alignItems="center"
      p={1.5}
      pr={3}
    >
      <Box display="flex" gap="4px">
        <Tooltip title={isDark ? "Light Mode" : "Dark Mode"}>
          <IconButton
            onClick={colorMode.toggleColorMode}
            sx={{
              color: colors.grey[300],
              "&:hover": {
                bgcolor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
              },
            }}
          >
            {isDark ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}
          </IconButton>
        </Tooltip>
        <Tooltip title="Log Out">
          <IconButton
            onClick={handleLogout}
            sx={{
              color: colors.grey[300],
              "&:hover": { bgcolor: "rgba(219,79,74,0.1)", color: "#db4f4a" },
            }}
          >
            <LogoutOutlinedIcon />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
};

export default Topbar;
