import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Box, Typography } from "@mui/material";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

const Layout = () => {
  const navigate = useNavigate();
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const token = sessionStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }
    // Block technicians from the main dashboard
    try {
      const userData = sessionStorage.getItem("user");
      if (userData) {
        const user = JSON.parse(userData);
        if (user.AccessLevel === "TECHNICIAN") {
          setBlocked(true);
          sessionStorage.removeItem("token");
          sessionStorage.removeItem("user");
          navigate("/login");
        }
      }
    } catch (e) { /* ignore */ }
  }, [navigate]);

  return (
    <Box>
      <div className="app">
        <Sidebar />
        <main className="content">
          <Topbar />
          <Box sx={{ m: "0px 0px 0px 0px" }}>
            <Outlet />
          </Box>
        </main>
      </div>
    </Box>
  );
};

export default Layout;
