import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Box } from "@mui/material";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

const Layout = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const token = sessionStorage.getItem("token");
    if (!token) {
      navigate("/login");
    }
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
