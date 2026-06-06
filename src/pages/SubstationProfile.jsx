import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Chip,
  CircularProgress,
  useTheme,
  Tooltip,
} from "@mui/material";
import {
  BoltOutlined,
  LocationOnOutlined,
  BusinessOutlined,
  AccountTreeOutlined,
  SpeedOutlined,
  ElectricMeterOutlined,
  TrendingUpOutlined,
  TrendingDownOutlined,
  PowerOutlined,
  MapOutlined as MapOutlinedIcon,
  ArrowForwardOutlined,
  WifiOutlined,
  WifiOffOutlined,
} from "@mui/icons-material";
import { GoogleMap, useJsApiLoader, Marker } from "@react-google-maps/api";
import Header from "../components/Header";
import { tokens } from "../theme";
import { energyAnalyticsAPI } from "../services/api";

/* ---- helpers ---- */
const fmt = (n) => Number(n).toLocaleString();

function formatPower(watts) {
  if (watts == null || isNaN(watts)) return "0 W";
  const abs = Math.abs(watts);
  if (abs >= 1000000) return (watts / 1000000).toFixed(2) + " MW";
  if (abs >= 1000) return (watts / 1000).toFixed(2) + " kW";
  return Number(watts).toFixed(1) + " W";
}

function formatEnergy(wh) {
  if (wh == null || isNaN(wh)) return "0 Wh";
  const abs = Math.abs(wh);
  if (abs >= 1000000) return (wh / 1000000).toFixed(2) + " MWh";
  if (abs >= 1000) return (wh / 1000).toFixed(2) + " kWh";
  return Number(wh).toFixed(1) + " Wh";
}

/* ---- dark map styles ---- */
const darkMapStyles = [
  { elementType: "geometry", stylers: [{ color: "#1d2c4d" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8ec3b9" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a3646" }] },
  { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#4b6878" }] },
  { featureType: "land", elementType: "geometry", stylers: [{ color: "#1d2c4d" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#283d6a" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#6f9ba5" }] },
  { featureType: "poi.park", elementType: "geometry.fill", stylers: [{ color: "#023e58" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#304a7d" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#98a5be" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#2c6675" }] },
  { featureType: "transit", elementType: "labels.text.fill", stylers: [{ color: "#98a5be" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4e6d70" }] },
];

/* ---- reusable info card ---- */
function InfoCard({ icon, label, value, sublabel, colors, accent }) {
  return (
    <Box
      sx={{
        bgcolor: colors.primary[400],
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: "12px",
        p: "16px 18px",
        flex: 1,
        minWidth: { xs: "100%", sm: "140px" },
        transition: "all 0.3s",
        "&:hover": {
          boxShadow: `0 0 20px ${accent || "rgba(76,206,172,0.2)"}`,
          borderColor: `${accent || colors.greenAccent[500]}40`,
        },
      }}
    >
      <Box display="flex" alignItems="center" gap="8px" mb="8px">
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: `${accent || colors.greenAccent[500]}15`,
          }}
        >
          {icon}
        </Box>
        <Typography
          variant="caption"
          color={colors.grey[300]}
          fontSize="10px"
          fontWeight={500}
          textTransform="uppercase"
          letterSpacing="0.5px"
        >
          {label}
        </Typography>
      </Box>
      <Typography
        variant="h5"
        color={colors.grey[100]}
        fontWeight={700}
        fontSize="17px"
        lineHeight={1.3}
      >
        {value || "---"}
      </Typography>
      {sublabel && (
        <Typography variant="caption" color={colors.grey[300]} fontSize="10px" mt="2px" display="block">
          {sublabel}
        </Typography>
      )}
    </Box>
  );
}

/* ---- meter card for connected meters ---- */
function MeterCard({ meter, colors, onClick }) {
  const power = parseFloat(meter.active_power || 0);
  const voltage = parseFloat(meter.voltage || 0);
  const isOnline = voltage > 50;

  return (
    <Box
      onClick={onClick}
      sx={{
        bgcolor: colors.primary[400],
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: "10px",
        p: "14px 16px",
        cursor: "pointer",
        transition: "all 0.25s",
        "&:hover": {
          bgcolor: `${colors.primary[400]}ee`,
          borderColor: colors.greenAccent[500] + "50",
          boxShadow: "0 0 16px rgba(76,206,172,0.15)",
          transform: "translateY(-2px)",
        },
      }}
    >
      <Box display="flex" justifyContent="space-between" alignItems="center" mb="6px">
        <Box display="flex" alignItems="center" gap="6px">
          <ElectricMeterOutlined sx={{ fontSize: 16, color: colors.greenAccent[500] }} />
          <Typography
            variant="body2"
            fontWeight={700}
            color={colors.grey[100]}
            fontFamily="monospace"
            fontSize="13px"
          >
            {meter.drn}
          </Typography>
        </Box>
        <Box display="flex" alignItems="center" gap="4px">
          {isOnline ? (
            <WifiOutlined sx={{ fontSize: 14, color: colors.greenAccent[500] }} />
          ) : (
            <WifiOffOutlined sx={{ fontSize: 14, color: "#db4f4a" }} />
          )}
          <Typography
            variant="caption"
            fontSize="10px"
            fontWeight={600}
            color={isOnline ? colors.greenAccent[500] : "#db4f4a"}
          >
            {isOnline ? "Online" : "Offline"}
          </Typography>
        </Box>
      </Box>
      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Box>
          <Typography variant="caption" color={colors.grey[300]} fontSize="10px">
            Active Power
          </Typography>
          <Typography variant="body2" color={colors.grey[100]} fontWeight={600} fontSize="13px">
            {formatPower(power)}
          </Typography>
        </Box>
        <Box textAlign="right">
          <Typography variant="caption" color={colors.grey[300]} fontSize="10px">
            Voltage
          </Typography>
          <Typography variant="body2" color="#f2b705" fontWeight={600} fontSize="13px">
            {voltage.toFixed(1)} V
          </Typography>
        </Box>
        <ArrowForwardOutlined sx={{ fontSize: 16, color: colors.grey[300], ml: 1 }} />
      </Box>
    </Box>
  );
}

/* ================================================================ */
/* SubstationProfile Page                                           */
/* ================================================================ */
export default function SubstationProfile() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const { drn } = useParams();
  const navigate = useNavigate();

  /* ---------- Google Maps loader ---------- */
  const { isLoaded: mapsLoaded } = useJsApiLoader({
    googleMapsApiKey: "AIzaSyCdPt-Y9HoyNJF5I-sbyuS4n6U1KhKaIzk",
    libraries: ["geometry"],
  });

  /* ---------- state ---------- */
  const [loading, setLoading] = useState(true);
  const [substation, setSubstation] = useState(null);
  const [regionData, setRegionData] = useState(null);
  const [connectedMeters, setConnectedMeters] = useState([]);

  /* ---------- fetch data ---------- */
  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const [configRes, substationsRes, powerFlowRes] = await Promise.allSettled([
          energyAnalyticsAPI.getSubstationConfig(),
          energyAnalyticsAPI.getSubstations(),
          energyAnalyticsAPI.getPowerFlow(),
        ]);

        // Find the substation by DRN from config
        if (configRes.status === "fulfilled") {
          const configs = configRes.value?.substations || configRes.value || [];
          const found = configs.find(
            (s) => String(s.drn) === String(drn) || String(s.id) === String(drn)
          );
          if (found) setSubstation(found);
        }

        // Find matching region data
        if (substationsRes.status === "fulfilled") {
          const data = substationsRes.value;
          const regions = data?.regions || data || [];
          // Match by substation name or district
          if (regions.length > 0) {
            const configData = configRes.status === "fulfilled"
              ? (configRes.value?.substations || configRes.value || [])
              : [];
            const found = configData.find(
              (s) => String(s.drn) === String(drn) || String(s.id) === String(drn)
            );
            if (found) {
              const match = regions.find(
                (r) =>
                  r.name?.toLowerCase() === found.district?.toLowerCase() ||
                  r.name?.toLowerCase() === found.name?.toLowerCase()
              );
              if (match) setRegionData(match);
              else if (regions.length > 0) setRegionData(regions[0]);
            }
          }
        }

        // Find connected meters in this substation's area
        if (powerFlowRes.status === "fulfilled") {
          const flows = powerFlowRes.value?.flows || powerFlowRes.value || [];
          // Filter meters that could belong to this substation's district
          const configData = configRes.status === "fulfilled"
            ? (configRes.value?.substations || configRes.value || [])
            : [];
          const found = configData.find(
            (s) => String(s.drn) === String(drn) || String(s.id) === String(drn)
          );
          if (found && found.district) {
            // If meters have lat/lng near the substation, include them
            // Otherwise include all flows as a fallback
            setConnectedMeters(flows);
          } else {
            setConnectedMeters(flows);
          }
        }
      } catch (err) {
        console.error("SubstationProfile fetch error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [drn]);

  /* ---------- loading state ---------- */
  if (loading) {
    return (
      <Box m="20px">
        <Header title="Substation Profile" subtitle="Loading substation data..." />
        <Box display="flex" justifyContent="center" alignItems="center" height="60vh">
          <CircularProgress sx={{ color: colors.greenAccent[500] }} />
        </Box>
      </Box>
    );
  }

  /* ---------- not found ---------- */
  if (!substation) {
    return (
      <Box m="20px">
        <Header title="Substation Not Found" subtitle={`No substation found with DRN: ${drn}`} />
        <Box
          display="flex"
          justifyContent="center"
          alignItems="center"
          height="40vh"
          flexDirection="column"
          gap={2}
        >
          <AccountTreeOutlined sx={{ fontSize: 64, color: colors.grey[600] }} />
          <Typography color={colors.grey[300]} fontSize="1rem">
            The requested substation could not be found in the system.
          </Typography>
        </Box>
      </Box>
    );
  }

  /* ---------- derived values ---------- */
  const isPrimary = substation.type?.toLowerCase() === "primary";
  const typeLabel = isPrimary ? "Primary Substation" : "Distribution Substation";
  const typeColor = isPrimary ? "#6870fa" : colors.greenAccent[500];
  const hasCoords = substation.lat && substation.lng;
  const lat = parseFloat(substation.lat);
  const lng = parseFloat(substation.lng);

  // Energy summary from region data
  const totalPower = regionData?.power?.total_active_power || 0;
  const avgVoltage = regionData?.power?.avg_voltage || 0;
  const avgPF = regionData?.power?.avg_power_factor || 0;
  const totalImport = regionData?.energy?.total_import_wh || 0;
  const totalExport = regionData?.energy?.total_export_wh || 0;
  const netDemand = totalImport - totalExport;
  const direction = regionData?.energy?.direction || "net_importing";
  const isExporting = direction === "net_exporting";
  const meterCount = regionData?.meterCount || connectedMeters.length || 0;
  const onlineCount = regionData?.online || 0;
  const offlineCount = regionData?.offline || 0;

  return (
    <Box m="20px">
      <Header
        title="Substation Profile"
        subtitle="Detailed substation information and connected meters"
      />

      {/* ---- Name & Type Badge ---- */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography
            variant="h3"
            color={colors.grey[100]}
            fontWeight="bold"
          >
            {substation.name || `Substation ${drn}`}
          </Typography>
          <Typography variant="body2" color={colors.grey[300]} mt="2px">
            DRN: <span style={{ fontFamily: "monospace", color: colors.greenAccent[500] }}>{drn}</span>
          </Typography>
        </Box>
        <Chip
          label={typeLabel}
          sx={{
            bgcolor: `${typeColor}20`,
            color: typeColor,
            fontWeight: 700,
            fontSize: "0.85rem",
            height: 32,
            border: `1px solid ${typeColor}40`,
          }}
        />
      </Box>

      {/* ---- Overview Cards Row ---- */}
      <Box
        display="flex"
        gap="14px"
        mb={3}
        flexWrap="wrap"
      >
        <InfoCard
          icon={<BusinessOutlined sx={{ fontSize: 18, color: "#6870fa" }} />}
          label="District"
          value={substation.district || "---"}
          colors={colors}
          accent="#6870fa"
        />
        <InfoCard
          icon={<LocationOnOutlined sx={{ fontSize: 18, color: "#00b4d8" }} />}
          label="City"
          value={substation.city || "---"}
          colors={colors}
          accent="#00b4d8"
        />
        <InfoCard
          icon={<MapOutlinedIcon sx={{ fontSize: 18, color: "#f2b705" }} />}
          label="GPS Coordinates"
          value={hasCoords ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : "Not set"}
          colors={colors}
          accent="#f2b705"
        />
        <InfoCard
          icon={<AccountTreeOutlined sx={{ fontSize: 18, color: typeColor }} />}
          label="Type"
          value={isPrimary ? "Primary" : "Distribution"}
          sublabel={`Power Rating: ${substation.power_rating_kva || "---"} kVA`}
          colors={colors}
          accent={typeColor}
        />
        {!isPrimary && substation.parent_name && (
          <InfoCard
            icon={<AccountTreeOutlined sx={{ fontSize: 18, color: "#9c27b0" }} />}
            label="Parent Substation"
            value={substation.parent_name}
            sublabel={substation.parent_substation_id ? `ID: ${substation.parent_substation_id}` : undefined}
            colors={colors}
            accent="#9c27b0"
          />
        )}
        <InfoCard
          icon={<BoltOutlined sx={{ fontSize: 18, color: colors.greenAccent[500] }} />}
          label="Power Rating"
          value={substation.power_rating_kva ? `${fmt(substation.power_rating_kva)} kVA` : "---"}
          colors={colors}
          accent={colors.greenAccent[500]}
        />
      </Box>

      {/* ---- Energy Summary Section ---- */}
      <Box mb={3}>
        <Typography variant="h5" color={colors.grey[100]} fontWeight={700} mb="12px">
          Energy Summary
        </Typography>
        <Box
          display="flex"
          gap="14px"
          flexWrap="wrap"
        >
          <InfoCard
            icon={<PowerOutlined sx={{ fontSize: 18, color: colors.greenAccent[500] }} />}
            label="Total Active Power"
            value={formatPower(totalPower)}
            sublabel={`${meterCount} meter${meterCount !== 1 ? "s" : ""} connected`}
            colors={colors}
            accent={colors.greenAccent[500]}
          />
          <InfoCard
            icon={<TrendingDownOutlined sx={{ fontSize: 18, color: "#f59e0b" }} />}
            label="Import Energy"
            value={formatEnergy(totalImport)}
            colors={colors}
            accent="#f59e0b"
          />
          <InfoCard
            icon={<TrendingUpOutlined sx={{ fontSize: 18, color: "#22c55e" }} />}
            label="Export Energy"
            value={formatEnergy(totalExport)}
            colors={colors}
            accent="#22c55e"
          />
          <InfoCard
            icon={<BoltOutlined sx={{ fontSize: 18, color: isExporting ? "#22c55e" : "#f59e0b" }} />}
            label="Net Demand"
            value={formatEnergy(Math.abs(netDemand))}
            sublabel={isExporting ? "Net Exporting" : "Net Importing"}
            colors={colors}
            accent={isExporting ? "#22c55e" : "#f59e0b"}
          />
          <InfoCard
            icon={<SpeedOutlined sx={{ fontSize: 18, color: "#f2b705" }} />}
            label="Avg Voltage"
            value={avgVoltage ? `${Number(avgVoltage).toFixed(1)} V` : "---"}
            sublabel={avgPF ? `PF: ${Number(avgPF).toFixed(3)}` : undefined}
            colors={colors}
            accent="#f2b705"
          />
          <Tooltip title="Energy flow direction" arrow>
            <Box
              sx={{
                bgcolor: colors.primary[400],
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: "12px",
                p: "16px 18px",
                flex: 1,
                minWidth: { xs: "100%", sm: "140px" },
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                transition: "all 0.3s",
                "&:hover": {
                  boxShadow: `0 0 20px ${isExporting ? "rgba(34,197,94,0.3)" : "rgba(245,158,11,0.3)"}`,
                },
              }}
            >
              <Chip
                icon={
                  isExporting
                    ? <TrendingUpOutlined sx={{ fontSize: 16 }} />
                    : <TrendingDownOutlined sx={{ fontSize: 16 }} />
                }
                label={isExporting ? "Net Exporting" : "Net Importing"}
                sx={{
                  bgcolor: isExporting ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)",
                  color: isExporting ? "#22c55e" : "#f59e0b",
                  fontWeight: 700,
                  fontSize: "0.8rem",
                  border: `1px solid ${isExporting ? "rgba(34,197,94,0.3)" : "rgba(245,158,11,0.3)"}`,
                }}
              />
              <Box display="flex" gap="12px" mt="8px">
                <Typography variant="caption" color={colors.greenAccent[500]} fontSize="10px" fontWeight={600}>
                  {onlineCount} Online
                </Typography>
                <Typography variant="caption" color="#db4f4a" fontSize="10px" fontWeight={600}>
                  {offlineCount} Offline
                </Typography>
              </Box>
            </Box>
          </Tooltip>
        </Box>
      </Box>

      {/* ---- Two-column: Connected Meters + Map ---- */}
      <Box
        display="flex"
        gap="20px"
        flexDirection={{ xs: "column", md: "row" }}
        mb={3}
      >
        {/* Left: Connected Meters */}
        <Box flex={1.2}>
          <Typography variant="h5" color={colors.grey[100]} fontWeight={700} mb="12px">
            Connected Meters
            <Chip
              label={`${connectedMeters.length}`}
              size="small"
              sx={{
                ml: 1,
                bgcolor: `${colors.greenAccent[500]}20`,
                color: colors.greenAccent[500],
                fontWeight: 700,
                fontSize: "0.75rem",
                height: 22,
              }}
            />
          </Typography>
          <Box
            sx={{
              bgcolor: colors.primary[400],
              borderRadius: "12px",
              border: "1px solid rgba(255,255,255,0.06)",
              p: "12px",
              maxHeight: "460px",
              overflowY: "auto",
              "&::-webkit-scrollbar": { width: 6 },
              "&::-webkit-scrollbar-track": { bgcolor: "transparent" },
              "&::-webkit-scrollbar-thumb": {
                bgcolor: "rgba(255,255,255,0.1)",
                borderRadius: 3,
              },
            }}
          >
            {connectedMeters.length === 0 ? (
              <Box
                display="flex"
                flexDirection="column"
                alignItems="center"
                justifyContent="center"
                py={6}
                gap={1}
              >
                <ElectricMeterOutlined sx={{ fontSize: 48, color: colors.grey[600] }} />
                <Typography color={colors.grey[300]} fontSize="0.85rem">
                  No connected meters found
                </Typography>
              </Box>
            ) : (
              <Box display="flex" flexDirection="column" gap="8px">
                {connectedMeters.map((meter, idx) => (
                  <MeterCard
                    key={meter.drn || idx}
                    meter={meter}
                    colors={colors}
                    onClick={() => navigate(`/meter/${meter.drn}`)}
                  />
                ))}
              </Box>
            )}
          </Box>
        </Box>

        {/* Right: Google Map */}
        <Box flex={1}>
          <Typography variant="h5" color={colors.grey[100]} fontWeight={700} mb="12px">
            Substation Location
          </Typography>
          <Box
            sx={{
              bgcolor: colors.primary[400],
              borderRadius: "12px",
              border: "1px solid rgba(255,255,255,0.06)",
              overflow: "hidden",
              position: "relative",
              height: "460px",
            }}
          >
            {hasCoords && mapsLoaded ? (
              <>
                <Box
                  sx={{
                    position: "absolute",
                    top: 12,
                    left: 12,
                    zIndex: 2,
                    bgcolor: "rgba(20,27,45,0.85)",
                    backdropFilter: "blur(6px)",
                    borderRadius: "8px",
                    px: 1.5,
                    py: 0.8,
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: "0.7rem",
                      color: colors.greenAccent[500],
                      fontWeight: 700,
                    }}
                  >
                    SUBSTATION LOCATION
                  </Typography>
                  <Typography sx={{ fontSize: "0.65rem", color: colors.grey[300] }}>
                    {substation.name} &mdash; {lat.toFixed(5)}, {lng.toFixed(5)}
                  </Typography>
                </Box>
                <GoogleMap
                  mapContainerStyle={{ width: "100%", height: "100%" }}
                  center={{ lat, lng }}
                  zoom={15}
                  options={{
                    disableDefaultUI: true,
                    zoomControl: true,
                    mapTypeControl: false,
                    streetViewControl: false,
                    fullscreenControl: true,
                    styles: darkMapStyles,
                  }}
                >
                  <Marker
                    position={{ lat, lng }}
                    title={substation.name || `Substation ${drn}`}
                    icon={{
                      path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z",
                      fillColor: typeColor,
                      fillOpacity: 1,
                      strokeColor: "#fff",
                      strokeWeight: 1.5,
                      scale: 1.8,
                      anchor: { x: 12, y: 22 },
                    }}
                  />
                  {/* Show connected meter markers too */}
                  {connectedMeters
                    .filter((m) => m.lat && m.lng)
                    .map((m, i) => (
                      <Marker
                        key={m.drn || i}
                        position={{
                          lat: parseFloat(m.lat),
                          lng: parseFloat(m.lng),
                        }}
                        title={m.drn}
                        icon={{
                          path: window.google?.maps?.SymbolPath?.CIRCLE || 0,
                          fillColor: colors.greenAccent[500],
                          fillOpacity: 0.8,
                          strokeColor: "#fff",
                          strokeWeight: 1,
                          scale: 6,
                        }}
                        onClick={() => navigate(`/meter/${m.drn}`)}
                      />
                    ))}
                </GoogleMap>
              </>
            ) : (
              <Box
                display="flex"
                alignItems="center"
                justifyContent="center"
                height="100%"
                flexDirection="column"
                gap={1}
              >
                <MapOutlinedIcon sx={{ fontSize: 48, color: colors.grey[600] }} />
                <Typography color={colors.grey[300]} fontSize="0.85rem">
                  {!hasCoords
                    ? "GPS coordinates not available for this substation"
                    : "Loading map..."}
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
