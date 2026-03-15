import { useState, useEffect } from "react";
import {
  Box,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Snackbar,
  Alert,
  useTheme,
} from "@mui/material";
import { SaveOutlined } from "@mui/icons-material";
import { tokens } from "../theme";
import Header from "../components/Header";
import { vendingAPI } from "../services/api";
import { tariffGroups as mockTariffGroups, tariffConfig as mockTariffConfig } from "../services/mockData";

// ---- Block tier colors ----
const blockColors = ["#4cceac", "#00b4d8", "#f2b705", "#db4f4a"];

export default function Tariffs() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);

  const [selectedTab, setSelectedTab] = useState(0);
  const [tariffGroups, setTariffGroups] = useState(mockTariffGroups);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });

  const [config, setConfig] = useState({
    vatRate: mockTariffConfig.vatRate,
    fixedCharge: mockTariffConfig.fixedCharge,
    relLevy: mockTariffConfig.relLevy,
    minPurchase: mockTariffConfig.minPurchase,
  });

  useEffect(() => {
    vendingAPI.getTariffConfig().then(r => {
      if (r.success && r.data) {
        setConfig({
          vatRate: r.data.vatRate ?? mockTariffConfig.vatRate,
          fixedCharge: r.data.fixedCharge ?? mockTariffConfig.fixedCharge,
          relLevy: r.data.relLevy ?? mockTariffConfig.relLevy,
          minPurchase: r.data.minPurchase ?? mockTariffConfig.minPurchase,
        });
      }
    }).catch(() => {});
    vendingAPI.getTariffGroups().then(r => {
      if (r.success && r.data?.length > 0) setTariffGroups(r.data);
    }).catch(() => {});
  }, []);

  const handleChange = (field) => (e) => {
    setConfig((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSaveConfig = async () => {
    try {
      await vendingAPI.updateTariffConfig(config);
      setSnackbar({ open: true, message: "Configuration saved", severity: "success" });
    } catch (err) {
      setSnackbar({ open: true, message: err.message || "Save failed", severity: "error" });
    }
  };

  const selectedGroup = tariffGroups[selectedTab] || tariffGroups[0];

  return (
    <Box m="20px">
      <Header
        title="TARIFF MANAGEMENT"
        subtitle="Step Tariff Configuration"
      />

      <Box
        display="grid"
        gridTemplateColumns="repeat(12, 1fr)"
        gridAutoRows="140px"
        gap="5px"
      >
        {/* ---- System config card (span 4, span 2) ---- */}
        <Box
          gridColumn="span 4"
          gridRow="span 2"
          backgroundColor={colors.primary[400]}
          borderRadius="4px"
          p="20px"
          display="flex"
          flexDirection="column"
          justifyContent="space-between"
        >
          <Typography
            variant="h5"
            color={colors.grey[100]}
            fontWeight="bold"
            mb="10px"
          >
            System Configuration
          </Typography>

          <Box display="flex" flexDirection="column" gap="12px" flex="1">
            <TextField
              label="VAT Rate (%)"
              type="number"
              size="small"
              fullWidth
              value={config.vatRate}
              onChange={handleChange("vatRate")}
            />
            <TextField
              label="Fixed Charge (N$)"
              type="number"
              size="small"
              fullWidth
              value={config.fixedCharge}
              onChange={handleChange("fixedCharge")}
            />
            <TextField
              label="REL Levy (N$)"
              type="number"
              size="small"
              fullWidth
              value={config.relLevy}
              onChange={handleChange("relLevy")}
            />
            <TextField
              label="Min Purchase (N$)"
              type="number"
              size="small"
              fullWidth
              value={config.minPurchase}
              onChange={handleChange("minPurchase")}
            />
          </Box>

          <Button
            variant="contained"
            startIcon={<SaveOutlined />}
            onClick={handleSaveConfig}
            sx={{
              mt: "10px",
              backgroundColor: colors.greenAccent[500],
              color: "#000",
              fontWeight: 600,
              "&:hover": { backgroundColor: colors.greenAccent[600] },
            }}
          >
            Save Configuration
          </Button>
        </Box>

        {/* ---- Tariff groups tabs (span 8, span 2) ---- */}
        <Box
          gridColumn="span 8"
          gridRow="span 2"
          backgroundColor={colors.primary[400]}
          borderRadius="4px"
          p="20px"
          display="flex"
          flexDirection="column"
        >
          <Typography
            variant="h5"
            color={colors.grey[100]}
            fontWeight="bold"
            mb="10px"
          >
            Tariff Groups
          </Typography>

          <Tabs
            value={selectedTab}
            onChange={(_, v) => setSelectedTab(v)}
            sx={{
              mb: "15px",
              "& .MuiTab-root": {
                color: colors.grey[300],
                textTransform: "none",
                fontWeight: 600,
                "&.Mui-selected": { color: colors.greenAccent[500] },
              },
              "& .MuiTabs-indicator": {
                backgroundColor: colors.greenAccent[500],
              },
            }}
          >
            {tariffGroups.map((g) => (
              <Tab key={g.id} label={g.name} />
            ))}
          </Tabs>

          <Box flex="1" overflow="auto">
            <Box
              display="flex"
              justifyContent="space-between"
              alignItems="flex-start"
              mb="8px"
            >
              <Box>
                <Typography
                  variant="h6"
                  color={colors.grey[100]}
                  fontWeight="bold"
                >
                  {selectedGroup.name}
                </Typography>
                <Typography variant="body2" color={colors.grey[300]}>
                  {selectedGroup.description}
                </Typography>
              </Box>
              <Box textAlign="right">
                <Typography
                  variant="body2"
                  color={colors.greenAccent[500]}
                  fontWeight="600"
                >
                  SGC: {selectedGroup.sgc}
                </Typography>
                <Typography variant="body2" color={colors.grey[400]}>
                  {Number(selectedGroup.customerCount || 0).toLocaleString()} meters
                </Typography>
              </Box>
            </Box>
            <Typography
              variant="caption"
              sx={{
                display: "inline-block",
                px: 1.5,
                py: 0.3,
                borderRadius: 1,
                backgroundColor: `${colors.blueAccent[500]}22`,
                color: colors.blueAccent[500],
                fontWeight: 600,
                mb: "8px",
              }}
            >
              {selectedGroup.type === "Block"
                ? "Step Tariff Blocks"
                : selectedGroup.type === "Flat"
                ? "Flat Rate Tariff"
                : "Time-of-Use Tariff"}
            </Typography>
            <Typography variant="caption" color={colors.grey[400]} display="block">
              Effective from:{" "}
              {new Date(selectedGroup.effectiveDate).toLocaleDateString(
                "en-ZA",
                { year: "numeric", month: "long", day: "numeric" }
              )}
            </Typography>
          </Box>
        </Box>

        {/* ---- Selected tariff blocks table (span 12, span 3) ---- */}
        <Box
          gridColumn="span 12"
          gridRow="span 3"
          backgroundColor={colors.primary[400]}
          borderRadius="4px"
          overflow="auto"
        >
          <Box p="20px" pb="0">
            <Typography
              variant="h5"
              color={colors.grey[100]}
              fontWeight="bold"
              mb="10px"
            >
              {selectedGroup.name} - Rate Blocks
            </Typography>
          </Box>
          <TableContainer sx={{ px: "20px", pb: "20px" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell
                    sx={{
                      color: colors.grey[100],
                      fontWeight: 700,
                      borderBottom: `1px solid ${colors.grey[700]}`,
                    }}
                  >
                    Block Name
                  </TableCell>
                  <TableCell
                    sx={{
                      color: colors.grey[100],
                      fontWeight: 700,
                      borderBottom: `1px solid ${colors.grey[700]}`,
                    }}
                  >
                    Range
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      color: colors.grey[100],
                      fontWeight: 700,
                      borderBottom: `1px solid ${colors.grey[700]}`,
                    }}
                  >
                    Rate per kWh
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {selectedGroup.blocks.map((block, idx) => (
                  <TableRow key={idx}>
                    <TableCell
                      sx={{
                        borderBottom: `1px solid ${colors.grey[800]}`,
                      }}
                    >
                      <Box display="flex" alignItems="center" gap="10px">
                        <Box
                          sx={{
                            width: 5,
                            height: 36,
                            borderRadius: "2px",
                            backgroundColor:
                              blockColors[idx % blockColors.length],
                            flexShrink: 0,
                          }}
                        />
                        <Typography
                          color={colors.grey[100]}
                          fontWeight="600"
                        >
                          {block.name}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell
                      sx={{
                        color: colors.grey[300],
                        borderBottom: `1px solid ${colors.grey[800]}`,
                      }}
                    >
                      {block.range}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        color: blockColors[idx % blockColors.length],
                        fontWeight: 700,
                        fontSize: "1rem",
                        borderBottom: `1px solid ${colors.grey[800]}`,
                      }}
                    >
                      N$ {Number(block.rate).toFixed(2)}/kWh
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </Box>
      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
