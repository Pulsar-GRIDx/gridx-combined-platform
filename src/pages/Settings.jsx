import {
  Box,
  Typography,
  useTheme,
} from "@mui/material";
import {
  BoltOutlined,
  ElectricalServicesOutlined,
  SpeedOutlined,
  GraphicEqOutlined,
  ThermostatOutlined,
  TuneOutlined,
  SignalCellularAltOutlined,
  LockOutlined,
  SettingsOutlined,
} from "@mui/icons-material";
import Header from "../components/Header";
import { tokens } from "../theme";

/* ---- info row component ---- */
function InfoRow({ label, value, color }) {
  return (
    <Box
      display="flex"
      justifyContent="space-between"
      py={0.6}
      borderBottom="1px solid rgba(255,255,255,0.05)"
    >
      <Typography variant="body2" color="rgba(255,255,255,0.5)" fontSize="0.8rem">
        {label}
      </Typography>
      <Typography variant="body2" color={color || "#fff"} fontWeight={600} fontSize="0.8rem">
        {value}
      </Typography>
    </Box>
  );
}

/* ==================================================================== */
/* Settings Page                                                        */
/* ==================================================================== */
export default function Settings() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);

  return (
    <Box m="20px">
      <Header
        title="SYSTEM SETTINGS"
        subtitle="Configure platform parameters and integrations"
      />

      <Box
        display="grid"
        gridTemplateColumns="repeat(12, 1fr)"
        gridAutoRows="140px"
        gap="5px"
      >
        {/* ============================================================ */}
        {/* Electrical Thresholds (span 6, span 3)                       */}
        {/* ============================================================ */}
        <Box
          gridColumn="span 6"
          gridRow="span 3"
          backgroundColor={colors.primary[400]}
          p="20px"
          borderRadius="4px"
          overflow="auto"
        >
          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <BoltOutlined sx={{ color: "#f2b705" }} />
            <Typography variant="h6" color={colors.grey[100]} fontWeight="bold">
              Electrical Thresholds
            </Typography>
          </Box>

          <Typography variant="body2" color={colors.greenAccent[500]} fontWeight={600} fontSize="0.78rem" mb={1}>
            Voltage Limits
          </Typography>
          <InfoRow label="Under-Voltage Threshold" value="207.0 V" color="#db4f4a" />
          <InfoRow label="Over-Voltage Threshold" value="253.0 V" color="#db4f4a" />
          <InfoRow label="Nominal Voltage" value="230.0 V" color={colors.greenAccent[500]} />
          <InfoRow label="Voltage Tolerance" value="\u00B1 10%" />

          <Box mt={2}>
            <Typography variant="body2" color={colors.greenAccent[500]} fontWeight={600} fontSize="0.78rem" mb={1}>
              Current Limits
            </Typography>
            <InfoRow label="Maximum Current (Residential)" value="60 A" color="#f2b705" />
            <InfoRow label="Maximum Current (Commercial)" value="100 A" color="#f2b705" />
            <InfoRow label="Maximum Current (Industrial)" value="200 A" color="#f2b705" />
            <InfoRow label="Earth Leakage Threshold" value="30 mA" color="#db4f4a" />
          </Box>

          <Box mt={2}>
            <Typography variant="body2" color={colors.greenAccent[500]} fontWeight={600} fontSize="0.78rem" mb={1}>
              Power & Frequency
            </Typography>
            <InfoRow label="Frequency Range" value="49.5 - 50.5 Hz" color="#6870fa" />
            <InfoRow label="Power Factor Minimum" value="0.850" color={colors.greenAccent[500]} />
            <InfoRow label="Over-Power Trip Delay" value="5 seconds" />
            <InfoRow label="Temperature Alarm" value="65\u00B0C" color="#db4f4a" />
          </Box>
        </Box>

        {/* ============================================================ */}
        {/* Meter Settings (span 6, span 3)                              */}
        {/* ============================================================ */}
        <Box
          gridColumn="span 6"
          gridRow="span 3"
          backgroundColor={colors.primary[400]}
          p="20px"
          borderRadius="4px"
          overflow="auto"
        >
          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <TuneOutlined sx={{ color: "#00b4d8" }} />
            <Typography variant="h6" color={colors.grey[100]} fontWeight="bold">
              Meter Settings
            </Typography>
          </Box>

          <Typography variant="body2" color={colors.greenAccent[500]} fontWeight={600} fontSize="0.78rem" mb={1}>
            Update Cycles
          </Typography>
          <InfoRow label="Power Update Interval" value="5 minutes" color="#00b4d8" />
          <InfoRow label="Energy Update Interval" value="15 minutes" color="#00b4d8" />
          <InfoRow label="Network Update Interval" value="1 hour" color="#00b4d8" />
          <InfoRow label="Load Status Update" value="Real-time" color={colors.greenAccent[500]} />

          <Box mt={2}>
            <Typography variant="body2" color={colors.greenAccent[500]} fontWeight={600} fontSize="0.78rem" mb={1}>
              Communication
            </Typography>
            <InfoRow label="Protocol" value="DLMS/COSEM" />
            <InfoRow label="Transport" value="TCP/IP over GPRS" />
            <InfoRow label="Retry Attempts" value="3" />
            <InfoRow label="Retry Interval" value="30 seconds" />
            <InfoRow label="Connection Timeout" value="60 seconds" />
            <InfoRow label="Heartbeat Interval" value="5 minutes" />
          </Box>

          <Box mt={2}>
            <Typography variant="body2" color={colors.greenAccent[500]} fontWeight={600} fontSize="0.78rem" mb={1}>
              Data Collection
            </Typography>
            <InfoRow label="Meter Reading Schedule" value="Daily 00:00" />
            <InfoRow label="Tamper Check Interval" value="15 minutes" />
            <InfoRow label="Load Profile Interval" value="30 minutes" />
            <InfoRow label="Data Retention" value="3 Years" />
          </Box>
        </Box>

        {/* ============================================================ */}
        {/* STS Settings (span 6, span 2)                                */}
        {/* ============================================================ */}
        <Box
          gridColumn="span 6"
          gridRow="span 2"
          backgroundColor={colors.primary[400]}
          p="20px"
          borderRadius="4px"
          overflow="auto"
        >
          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <LockOutlined sx={{ color: "#6870fa" }} />
            <Typography variant="h6" color={colors.grey[100]} fontWeight="bold">
              STS Configuration
            </Typography>
          </Box>

          <Typography variant="body2" color={colors.greenAccent[500]} fontWeight={600} fontSize="0.78rem" mb={1}>
            Key Management
          </Typography>
          <InfoRow label="Encryption Standard" value="STS Standard (IEC 62055)" />
          <InfoRow label="Key Revision Number (KRN)" value="1" />
          <InfoRow label="Supply Group Code (SGC)" value="48901" color="#f2b705" />
          <InfoRow label="Tariff Index (TI)" value="01" />
          <InfoRow label="Key Type" value="AES-128" color="#6870fa" />
          <InfoRow label="Key Change Token Support" value="Enabled" color={colors.greenAccent[500]} />

          <Box mt={2}>
            <Typography variant="body2" color={colors.greenAccent[500]} fontWeight={600} fontSize="0.78rem" mb={1}>
              Gateway
            </Typography>
            <InfoRow label="STS Gateway Host" value="sts-gateway.gridx-meters.com" />
            <InfoRow label="API Port (ISO 8583)" value="8583" />
            <InfoRow label="Connection Status" value="Connected" color={colors.greenAccent[500]} />
            <InfoRow label="TLS Version" value="1.3" />
          </Box>
        </Box>

        {/* ============================================================ */}
        {/* System Configuration (span 6, span 2)                        */}
        {/* ============================================================ */}
        <Box
          gridColumn="span 6"
          gridRow="span 2"
          backgroundColor={colors.primary[400]}
          p="20px"
          borderRadius="4px"
          overflow="auto"
        >
          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <SettingsOutlined sx={{ color: colors.greenAccent[500] }} />
            <Typography variant="h6" color={colors.grey[100]} fontWeight="bold">
              System Configuration
            </Typography>
          </Box>

          <Typography variant="body2" color={colors.greenAccent[500]} fontWeight={600} fontSize="0.78rem" mb={1}>
            Tariff Charges
          </Typography>
          <InfoRow label="VAT Rate" value="15%" color="#f2b705" />
          <InfoRow label="Fixed Charge" value="N$ 8.50" />
          <InfoRow label="REL Levy" value="N$ 2.40" />
          <InfoRow label="Minimum Purchase" value="N$ 5.00" />
          <InfoRow label="Arrears Deduction Mode" value="Auto-deduct" />
          <InfoRow label="Arrears Deduction %" value="25%" color="#db4f4a" />

          <Box mt={2}>
            <Typography variant="body2" color={colors.greenAccent[500]} fontWeight={600} fontSize="0.78rem" mb={1}>
              Security
            </Typography>
            <InfoRow label="Session Timeout" value="1 hour" />
            <InfoRow label="Max Login Attempts" value="5" />
            <InfoRow label="Password Expiry" value="90 days" />
            <InfoRow label="Two-Factor Auth" value="Enabled" color={colors.greenAccent[500]} />
          </Box>

          <Box mt={2}>
            <Typography variant="body2" color={colors.greenAccent[500]} fontWeight={600} fontSize="0.78rem" mb={1}>
              Backup
            </Typography>
            <InfoRow label="Auto-backup Schedule" value="Daily" />
            <InfoRow label="Backup Time" value="02:00 AM" />
            <InfoRow label="Last Backup" value="12 Mar 2026, 02:00 AM" />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
