import { Box, Typography, Button, useTheme } from "@mui/material";
import {
  TodayOutlined,
  MapOutlined,
  StorefrontOutlined,
  ElectricMeterOutlined,
  TokenOutlined,
  SecurityOutlined,
} from "@mui/icons-material";
import { tokens } from "../theme";
import Header from "../components/Header";

// ---- Report types ----
const reportTypes = [
  {
    id: "daily",
    label: "Daily Sales",
    description: "Revenue breakdown by day with vendor splits and payment method summaries.",
    icon: <TodayOutlined sx={{ fontSize: 36 }} />,
  },
  {
    id: "area",
    label: "Revenue by Area",
    description: "Geographic distribution of revenue across all service areas and suburbs.",
    icon: <MapOutlined sx={{ fontSize: 36 }} />,
  },
  {
    id: "vendor",
    label: "Vendor Performance",
    description: "Commission tracking, transaction volumes, and KPIs per vendor point.",
    icon: <StorefrontOutlined sx={{ fontSize: 36 }} />,
  },
  {
    id: "meter",
    label: "Meter Status",
    description: "Online/offline/tampered meter counts, connectivity health, and alerts.",
    icon: <ElectricMeterOutlined sx={{ fontSize: 36 }} />,
  },
  {
    id: "token",
    label: "Token Analysis",
    description: "STS token generation rates, consumption patterns, and reversal statistics.",
    icon: <TokenOutlined sx={{ fontSize: 36 }} />,
  },
  {
    id: "audit",
    label: "System Audit",
    description: "User activity logs, configuration changes, and security event trail.",
    icon: <SecurityOutlined sx={{ fontSize: 36 }} />,
  },
];

export default function Reports() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);

  return (
    <Box m="20px">
      <Header title="REPORTS" subtitle="System Reports and Analytics" />

      <Box
        display="grid"
        gridTemplateColumns="repeat(12, 1fr)"
        gridAutoRows="140px"
        gap="5px"
      >
        {/* ---- Report type cards: 6 types in 2x3 grid (each span 4, span 2) ---- */}
        {reportTypes.map((rt) => (
          <Box
            key={rt.id}
            gridColumn="span 4"
            gridRow="span 2"
            backgroundColor={colors.primary[400]}
            borderRadius="4px"
            p="20px"
            display="flex"
            flexDirection="column"
            justifyContent="space-between"
          >
            <Box>
              <Box
                display="flex"
                alignItems="center"
                gap="12px"
                mb="12px"
              >
                <Box sx={{ color: colors.greenAccent[500] }}>{rt.icon}</Box>
                <Typography
                  variant="h5"
                  color={colors.grey[100]}
                  fontWeight="bold"
                >
                  {rt.label}
                </Typography>
              </Box>
              <Typography variant="body2" color={colors.grey[300]}>
                {rt.description}
              </Typography>
            </Box>

            <Button
              variant="contained"
              fullWidth
              sx={{
                mt: "15px",
                backgroundColor: colors.greenAccent[500],
                color: "#000",
                fontWeight: 600,
                textTransform: "none",
                "&:hover": { backgroundColor: colors.greenAccent[600] },
              }}
            >
              Generate
            </Button>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
