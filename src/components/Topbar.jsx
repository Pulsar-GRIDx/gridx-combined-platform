import { Box, IconButton, useTheme } from "@mui/material";
import { useContext } from "react";
import { ColorModeContext, tokens } from "../theme";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import Tooltip from "@mui/material/Tooltip";
import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";
import { useNavigate } from "react-router-dom";
import { bgBlur } from "../css";

const Topbar = () => {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const colorMode = useContext(ColorModeContext);
  const navigate = useNavigate();

  const handleLogout = () => {
    navigate("/login");
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
  };

  return (
    <Box
      sx={{
        boxShadow: "none",
        position: "fixed",
        ...bgBlur({ color: theme.palette.background.default }),
        width: "100%",
        zIndex: theme.zIndex.appBar + 1,
      }}
      display="flex"
      justifyContent="flex-start"
      p={2}
      pl={4}
    >
      <Box display="flex" gap="4px">
        <Tooltip title={theme.palette.mode === "dark" ? "Light Mode" : "Dark Mode"}>
          <IconButton
            onClick={colorMode.toggleColorMode}
            sx={{
              color: colors.grey[300],
              "&:hover": { bgcolor: "rgba(255,255,255,0.06)" },
            }}
          >
            {theme.palette.mode === "dark" ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}
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
