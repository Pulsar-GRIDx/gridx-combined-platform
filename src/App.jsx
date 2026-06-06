import { Routes, Route } from "react-router-dom";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { ColorModeContext, useMode } from "./theme";
import { AuthProvider } from "./context/AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Vending from "./pages/Vending";
import Customers from "./pages/Customers";
import Transactions from "./pages/Transactions";
import Vendors from "./pages/Vendors";
import Engineering from "./pages/Engineering";
import Batches from "./pages/Batches";
import Tariffs from "./pages/Tariffs";
import Admin from "./pages/Admin";
import Map from "./pages/Map";
import MeterProfile from "./pages/MeterProfile";
import MeterProfiles from "./pages/MeterProfiles";
import MeterSummary from "./pages/MeterSummary";
import Billing from "./pages/Billing";
import Settings from "./pages/Settings";
import NewMeterDash from "./pages/NewMeterDash";
import GroupControl from "./pages/GroupControl";
import GroupDetail from "./pages/GroupDetail";
import Integrations from "./pages/Integrations";
import Installers from "./pages/Installers";
import TamperDetection from "./pages/TamperDetection";
import VsmTesting from "./pages/VsmTesting";
import AppUsers from "./pages/AppUsers";
import NetMetering from "./pages/NetMetering";
import DataUsage from "./pages/DataUsage";
import SubstationProfile from "./pages/SubstationProfile";
import SystemAnalysis from "./pages/SystemAnalysis";

function App() {
  const [theme, colorMode] = useMode();

  return (
    <ColorModeContext.Provider value={colorMode}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Layout />}>
              <Route index element={<Map />} />
              <Route path="vending" element={<Vending />} />
              <Route path="customers" element={<Customers />} />
              <Route path="transactions" element={<Transactions />} />
              <Route path="vendors" element={<Vendors />} />
              <Route path="engineering" element={<Engineering />} />
              <Route path="batches" element={<Batches />} />
              <Route path="tariffs" element={<Tariffs />} />
              <Route path="admin" element={<Admin />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="map" element={<Map />} />
              <Route path="meter/:drn" element={<MeterProfile />} />
              <Route path="substation/:drn" element={<SubstationProfile />} />
              <Route path="meter-profiles" element={<MeterProfiles />} />
              <Route path="meter-summary" element={<MeterSummary />} />
              <Route path="billing" element={<Billing />} />
              <Route path="settings" element={<Settings />} />
              <Route path="users" element={<Admin />} />
              <Route path="newmeterdash" element={<NewMeterDash />} />
              <Route path="load-control" element={<GroupControl />} />
              <Route path="load-control/group/:groupId" element={<GroupDetail />} />
              <Route path="integrations" element={<Integrations />} />
              <Route path="installers" element={<Installers />} />
              <Route path="tamper-detection" element={<TamperDetection />} />
              <Route path="hsm" element={<VsmTesting />} />
              <Route path="app-users" element={<AppUsers />} />
              <Route path="net-metering" element={<NetMetering />} />
              <Route path="data-usage" element={<DataUsage />} />
              <Route path="system-analysis" element={<SystemAnalysis />} />
            </Route>
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}

export default App;
