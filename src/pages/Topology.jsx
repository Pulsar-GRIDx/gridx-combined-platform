import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Box,
  Typography,
  Chip,
  Button,
  Collapse,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  useTheme,
} from "@mui/material";
import {
  LocationCityOutlined,
  PlaceOutlined,
  ElectricalServicesOutlined,
  SpeedOutlined,
  ExpandMore,
  ChevronRight,
  BoltOutlined,
  PowerOutlined,
  FiberManualRecord,
  VisibilityOutlined,
} from "@mui/icons-material";
import Header from "../components/Header";
import { tokens } from "../theme";
import { topologyData, meters } from "../services/mockData";

/* ---- helpers ---- */
const fmt = (n) => Number(n).toLocaleString();

function countMeters(node) {
  if (node.type === "meter") return 1;
  if (!node.children) return 0;
  return node.children.reduce((sum, child) => sum + countMeters(child), 0);
}

function sumPower(node) {
  if (node.type === "meter") return node.power || 0;
  if (!node.children) return 0;
  return node.children.reduce((sum, child) => sum + sumPower(child), 0);
}

function countType(node, type) {
  if (node.type === type) return 1;
  if (!node.children) return 0;
  return node.children.reduce((sum, child) => sum + countType(child, type), 0);
}

function collectMeters(node) {
  if (node.type === "meter") return [node];
  if (!node.children) return [];
  return node.children.flatMap((child) => collectMeters(child));
}

/* ---- type icons + colors ---- */
const typeConfig = {
  utility: { icon: <LocationCityOutlined />, color: "#00e5ff", label: "Utility" },
  location: { icon: <PlaceOutlined />, color: "#4cceac", label: "Location" },
  transformer: { icon: <ElectricalServicesOutlined />, color: "#f2b705", label: "Transformer" },
  meter: { icon: <SpeedOutlined />, color: "#00b4d8", label: "Meter" },
};

/* ---- TreeNode Component ---- */
function TreeNode({ node, depth = 0, selectedNode, onSelect, colors }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;
  const config = typeConfig[node.type] || typeConfig.meter;
  const isSelected = selectedNode === node;

  const handleClick = () => {
    onSelect(node);
    if (hasChildren) setExpanded(!expanded);
  };

  return (
    <>
      <ListItemButton
        onClick={handleClick}
        selected={isSelected}
        sx={{
          pl: 1.5 + depth * 2,
          py: 0.6,
          borderRadius: 1,
          mb: 0.3,
          minHeight: 36,
          "&.Mui-selected": {
            bgcolor: `rgba(76,206,172,0.08)`,
            borderLeft: `3px solid ${colors.greenAccent[500]}`,
            "&:hover": { bgcolor: "rgba(76,206,172,0.12)" },
          },
          "&:hover": { bgcolor: "rgba(0,180,216,0.06)" },
        }}
      >
        {hasChildren ? (
          expanded ? (
            <ExpandMore sx={{ fontSize: 18, color: colors.grey[400], mr: 0.5 }} />
          ) : (
            <ChevronRight sx={{ fontSize: 18, color: colors.grey[400], mr: 0.5 }} />
          )
        ) : (
          <Box sx={{ width: 22 }} />
        )}
        <ListItemIcon
          sx={{
            minWidth: 30,
            "& .MuiSvgIcon-root": { fontSize: 18, color: config.color },
          }}
        >
          {config.icon}
        </ListItemIcon>
        <ListItemText
          primary={node.name}
          primaryTypographyProps={{
            fontSize:
              node.type === "utility"
                ? "0.88rem"
                : node.type === "meter"
                ? "0.75rem"
                : "0.8rem",
            fontWeight:
              node.type === "utility" ? 700 : node.type === "location" ? 600 : 500,
            color: isSelected ? colors.greenAccent[500] : colors.grey[100],
            fontFamily: node.type === "meter" ? '"Roboto Mono", monospace' : "inherit",
          }}
        />
        {node.type !== "meter" && (
          <Chip
            label={countMeters(node)}
            size="small"
            sx={{
              height: 20,
              fontSize: "0.65rem",
              bgcolor: "rgba(0,180,216,0.12)",
              color: "#00b4d8",
              fontWeight: 600,
            }}
          />
        )}
        {node.type === "meter" && (
          <FiberManualRecord
            sx={{
              fontSize: 10,
              color:
                node.status === "Online"
                  ? colors.greenAccent[500]
                  : node.status === "Tampered"
                  ? "#db4f4a"
                  : colors.grey[400],
            }}
          />
        )}
      </ListItemButton>
      {hasChildren && (
        <Collapse in={expanded} timeout="auto" unmountOnExit>
          <List disablePadding>
            {node.children.map((child, i) => (
              <TreeNode
                key={`${child.name}-${i}`}
                node={child}
                depth={depth + 1}
                selectedNode={selectedNode}
                onSelect={onSelect}
                colors={colors}
              />
            ))}
          </List>
        </Collapse>
      )}
    </>
  );
}

/* ---- Detail panels ---- */
function CityDetail({ node, colors }) {
  const totalM = countMeters(node);
  const totalLoc = countType(node, "location");
  const totalTx = countType(node, "transformer");
  const totalPw = sumPower(node);

  const stats = [
    { label: "Locations", value: totalLoc, color: "#4cceac", icon: <PlaceOutlined /> },
    { label: "Transformers", value: totalTx, color: "#f2b705", icon: <ElectricalServicesOutlined /> },
    { label: "Meters", value: totalM, color: "#00b4d8", icon: <SpeedOutlined /> },
    { label: "kW Total Load", value: totalPw.toFixed(1), color: "#db4f4a", icon: <BoltOutlined /> },
  ];

  return (
    <>
      <Typography variant="h5" color={colors.grey[100]} fontWeight="bold" mb={0.5}>
        {node.name}
      </Typography>
      <Typography variant="body2" color={colors.grey[400]} mb={2} fontSize="0.82rem">
        Utility-level overview of the entire grid network
      </Typography>
      <Box display="flex" gap="5px" flexWrap="wrap" mb={3}>
        {stats.map((s) => (
          <Box
            key={s.label}
            flex="1 1 120px"
            backgroundColor={colors.primary[400]}
            p={2}
            borderRadius="4px"
            textAlign="center"
          >
            <Box sx={{ "& .MuiSvgIcon-root": { fontSize: 28, color: s.color, mb: 0.5 } }}>{s.icon}</Box>
            <Typography variant="h5" color={colors.grey[100]} fontWeight={700} fontSize="1.5rem">
              {s.value}
            </Typography>
            <Typography variant="caption" color={colors.grey[400]} fontSize="0.72rem">
              {s.label}
            </Typography>
          </Box>
        ))}
      </Box>
      <Typography variant="h6" color={colors.grey[100]} fontWeight={600} mb={1.5} fontSize="0.95rem">
        Locations
      </Typography>
      {(node.children || []).map((loc, i) => (
        <Box
          key={i}
          backgroundColor={colors.primary[400]}
          p={2}
          borderRadius="4px"
          mb={1}
          display="flex"
          justifyContent="space-between"
          alignItems="center"
        >
          <Box>
            <Typography variant="body1" color={colors.grey[100]} fontWeight={600} fontSize="0.88rem">
              {loc.name}
            </Typography>
            <Typography variant="caption" color={colors.grey[400]} fontSize="0.72rem">
              {countType(loc, "transformer")} transformers &bull; {countMeters(loc)} meters
            </Typography>
          </Box>
          <Chip
            label={`${sumPower(loc).toFixed(1)} kW`}
            size="small"
            sx={{
              bgcolor: "rgba(76,206,172,0.1)",
              color: colors.greenAccent[500],
              fontWeight: 600,
              fontSize: "0.72rem",
            }}
          />
        </Box>
      ))}
    </>
  );
}

function LocationDetail({ node, colors }) {
  const mc = countMeters(node);
  const tc = countType(node, "transformer");
  const pw = sumPower(node);

  return (
    <>
      <Box display="flex" alignItems="center" gap={1} mb={0.5}>
        <PlaceOutlined sx={{ color: "#4cceac", fontSize: 24 }} />
        <Typography variant="h5" color={colors.grey[100]} fontWeight="bold">
          {node.name}
        </Typography>
      </Box>
      <Typography variant="body2" color={colors.grey[400]} mb={2} fontSize="0.82rem">
        Location-level stats
      </Typography>
      <Box display="flex" gap="5px" mb={3}>
        {[
          { label: "Transformers", value: tc, color: "#f2b705" },
          { label: "Meters", value: mc, color: "#00b4d8" },
          { label: "kW Load", value: pw.toFixed(1), color: colors.greenAccent[500] },
        ].map((s) => (
          <Box
            key={s.label}
            flex="1"
            backgroundColor={colors.primary[400]}
            p={2}
            borderRadius="4px"
            textAlign="center"
          >
            <Typography variant="h5" color={s.color} fontWeight={700} fontSize="1.5rem">
              {s.value}
            </Typography>
            <Typography variant="caption" color={colors.grey[400]} fontSize="0.72rem">
              {s.label}
            </Typography>
          </Box>
        ))}
      </Box>
      <Typography variant="h6" color={colors.grey[100]} fontWeight={600} mb={1.5} fontSize="0.95rem">
        Transformers
      </Typography>
      {(node.children || []).map((tx, i) => (
        <Box
          key={i}
          backgroundColor={colors.primary[400]}
          p={2}
          borderRadius="4px"
          mb={1}
        >
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.5}>
            <Box display="flex" alignItems="center" gap={1}>
              <ElectricalServicesOutlined sx={{ color: "#f2b705", fontSize: 20 }} />
              <Typography variant="body1" color={colors.grey[100]} fontWeight={600} fontSize="0.88rem" fontFamily="monospace">
                {tx.name}
              </Typography>
            </Box>
            <Box display="flex" gap={1}>
              {tx.capacity && (
                <Chip label={tx.capacity} size="small" sx={{ bgcolor: "rgba(242,183,5,0.12)", color: "#f2b705", fontSize: "0.68rem", height: 22 }} />
              )}
              <Chip label={`${sumPower(tx).toFixed(1)} kW`} size="small" sx={{ bgcolor: "rgba(76,206,172,0.1)", color: colors.greenAccent[500], fontSize: "0.68rem", height: 22 }} />
            </Box>
          </Box>
          <Typography variant="caption" color={colors.grey[400]} fontSize="0.72rem">
            {countMeters(tx)} connected meters {tx.load ? `\u2022 ${tx.load}% loaded` : ""}
          </Typography>
        </Box>
      ))}
    </>
  );
}

function TransformerDetail({ node, colors }) {
  const meterList = collectMeters(node);
  const totalPw = sumPower(node);

  return (
    <>
      <Box display="flex" alignItems="center" gap={1} mb={0.5}>
        <ElectricalServicesOutlined sx={{ color: "#f2b705", fontSize: 24 }} />
        <Typography variant="h5" color={colors.grey[100]} fontWeight="bold" fontFamily="monospace">
          {node.name}
        </Typography>
      </Box>
      <Typography variant="body2" color={colors.grey[400]} mb={2} fontSize="0.82rem">
        {node.capacity ? `Capacity: ${node.capacity}` : "Transformer"}{" "}
        {node.load ? `\u2022 Load: ${node.load}%` : ""}
      </Typography>
      <Box display="flex" gap="5px" mb={3}>
        {[
          { label: "Connected Meters", value: meterList.length, color: "#00b4d8" },
          { label: "kW Total Load", value: totalPw.toFixed(1), color: colors.greenAccent[500] },
          {
            label: "Capacity Used",
            value: node.load !== undefined ? `${node.load}%` : "N/A",
            color:
              node.load > 80 ? "#db4f4a" : node.load > 60 ? "#f2b705" : colors.greenAccent[500],
          },
        ].map((s) => (
          <Box
            key={s.label}
            flex="1"
            backgroundColor={colors.primary[400]}
            p={2}
            borderRadius="4px"
            textAlign="center"
          >
            <Typography variant="h5" color={s.color} fontWeight={700} fontSize="1.5rem">
              {s.value}
            </Typography>
            <Typography variant="caption" color={colors.grey[400]} fontSize="0.72rem">
              {s.label}
            </Typography>
          </Box>
        ))}
      </Box>
      <Typography variant="h6" color={colors.grey[100]} fontWeight={600} mb={1.5} fontSize="0.95rem">
        Connected Meters
      </Typography>
      {meterList.map((m, i) => {
        const fullMeter = meters.find((fm) => fm.meterNo === m.meterNo);
        const statusColor =
          m.status === "Online"
            ? colors.greenAccent[500]
            : m.status === "Tampered"
            ? "#db4f4a"
            : colors.grey[400];
        return (
          <Box
            key={i}
            backgroundColor={colors.primary[400]}
            p={2}
            borderRadius="4px"
            mb={1}
            display="flex"
            justifyContent="space-between"
            alignItems="center"
            flexWrap="wrap"
            gap={1}
          >
            <Box>
              <Typography variant="body1" color={colors.grey[100]} fontWeight={600} fontSize="0.88rem" fontFamily="monospace">
                {m.name}
              </Typography>
              <Typography variant="caption" color={colors.grey[400]} fontSize="0.72rem">
                {m.customer} &bull; {m.power} kW
              </Typography>
            </Box>
            <Box display="flex" alignItems="center" gap={1}>
              <Chip
                label={m.status}
                size="small"
                sx={{
                  bgcolor:
                    m.status === "Online"
                      ? "rgba(76,206,172,0.15)"
                      : m.status === "Tampered"
                      ? "rgba(219,79,74,0.15)"
                      : "rgba(108,117,125,0.2)",
                  color: statusColor,
                  fontWeight: 600,
                  fontSize: "0.68rem",
                  height: 22,
                }}
              />
              {fullMeter && (
                <Button
                  component={RouterLink}
                  to={`/meter/${fullMeter.drn}`}
                  variant="outlined"
                  size="small"
                  sx={{
                    fontSize: "0.68rem",
                    minWidth: "auto",
                    py: 0.3,
                    px: 1,
                    color: colors.greenAccent[500],
                    borderColor: colors.greenAccent[500],
                  }}
                >
                  Profile
                </Button>
              )}
            </Box>
          </Box>
        );
      })}
    </>
  );
}

function MeterDetail({ node, colors }) {
  const fullMeter = meters.find((m) => m.meterNo === node.meterNo);
  const statusColor =
    node.status === "Online"
      ? colors.greenAccent[500]
      : node.status === "Tampered"
      ? "#db4f4a"
      : colors.grey[400];

  return (
    <>
      <Box display="flex" alignItems="center" gap={1} mb={0.5}>
        <SpeedOutlined sx={{ color: "#00b4d8", fontSize: 24 }} />
        <Typography variant="h5" color={colors.grey[100]} fontWeight="bold" fontFamily="monospace">
          {node.name}
        </Typography>
      </Box>
      <Typography variant="body2" color={colors.grey[400]} mb={2} fontSize="0.82rem">
        {node.customer}
      </Typography>
      <Box display="flex" gap="5px" flexWrap="wrap" mb={3}>
        {[
          { label: "Voltage", value: fullMeter ? `${fullMeter.power.voltage} V` : "N/A", color: "#f2b705" },
          { label: "Current", value: fullMeter ? `${fullMeter.power.current} A` : "N/A", color: "#00b4d8" },
          { label: "Power", value: `${node.power} kW`, color: colors.greenAccent[500] },
          { label: "Status", value: node.status, color: statusColor },
        ].map((s) => (
          <Box
            key={s.label}
            flex="1 1 100px"
            backgroundColor={colors.primary[400]}
            p={2}
            borderRadius="4px"
            textAlign="center"
          >
            <Typography variant="h6" color={s.color} fontWeight={700} fontSize="1.1rem">
              {s.value}
            </Typography>
            <Typography variant="caption" color={colors.grey[400]} fontSize="0.68rem">
              {s.label}
            </Typography>
          </Box>
        ))}
      </Box>
      {fullMeter && (
        <>
          <Divider sx={{ borderColor: "rgba(255,255,255,0.08)", mb: 2 }} />
          <Box display="flex" gap="5px" flexWrap="wrap" mb={3}>
            {[
              { label: "Power Factor", value: fullMeter.power.powerFactor, color: colors.greenAccent[500] },
              {
                label: "Last Update",
                value: new Date(fullMeter.lastUpdate).toLocaleString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                }),
                color: colors.grey[100],
              },
              { label: "Frequency", value: `${fullMeter.power.frequency} Hz`, color: "#00b4d8" },
              { label: "Temperature", value: `${fullMeter.power.temperature}\u00B0C`, color: "#db4f4a" },
            ].map((s) => (
              <Box
                key={s.label}
                flex="1 1 100px"
                backgroundColor={colors.primary[400]}
                p={1.5}
                borderRadius="4px"
              >
                <Typography variant="caption" color={colors.grey[400]} fontSize="0.68rem" display="block">
                  {s.label}
                </Typography>
                <Typography variant="body1" color={s.color} fontWeight={700}>
                  {s.value}
                </Typography>
              </Box>
            ))}
          </Box>
          <Button
            component={RouterLink}
            to={`/meter/${fullMeter.drn}`}
            variant="contained"
            fullWidth
            startIcon={<VisibilityOutlined />}
            sx={{
              backgroundColor: colors.greenAccent[700],
              "&:hover": { backgroundColor: colors.greenAccent[600] },
              textTransform: "none",
            }}
          >
            View Full Profile
          </Button>
        </>
      )}
    </>
  );
}

function NodeDetail({ node, colors }) {
  if (!node) {
    return (
      <Box textAlign="center" py={8}>
        <SpeedOutlined sx={{ fontSize: 48, color: colors.grey[400], mb: 1 }} />
        <Typography variant="body1" color={colors.grey[400]}>
          Select a node from the tree to view details
        </Typography>
      </Box>
    );
  }
  switch (node.type) {
    case "utility":
      return <CityDetail node={node} colors={colors} />;
    case "location":
      return <LocationDetail node={node} colors={colors} />;
    case "transformer":
      return <TransformerDetail node={node} colors={colors} />;
    case "meter":
      return <MeterDetail node={node} colors={colors} />;
    default:
      return null;
  }
}

/* ==================================================================== */
/* Topology Page                                                        */
/* ==================================================================== */
export default function Topology() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const [selectedNode, setSelectedNode] = useState(topologyData);

  return (
    <Box m="20px">
      <Header
        title="GRID TOPOLOGY"
        subtitle="Network hierarchy: City \u2192 Location \u2192 Transformer \u2192 Meter"
      />

      <Box
        display="grid"
        gridTemplateColumns="repeat(12, 1fr)"
        gridAutoRows="140px"
        gap="5px"
      >
        {/* ---- Left: Tree View (span 4) ---- */}
        <Box
          gridColumn="span 4"
          gridRow="span 5"
          backgroundColor={colors.primary[400]}
          borderRadius="4px"
          overflow="auto"
          p="10px"
        >
          <Typography
            variant="h6"
            color={colors.grey[400]}
            fontWeight={600}
            fontSize="0.82rem"
            mb={1.5}
            px={1}
            textTransform="uppercase"
            letterSpacing="0.05em"
          >
            Network Tree
          </Typography>
          <List disablePadding sx={{ maxHeight: 620, overflowY: "auto" }}>
            <TreeNode
              node={topologyData}
              depth={0}
              selectedNode={selectedNode}
              onSelect={setSelectedNode}
              colors={colors}
            />
          </List>
        </Box>

        {/* ---- Right: Node Details (span 8) ---- */}
        <Box
          gridColumn="span 8"
          gridRow="span 5"
          backgroundColor={colors.primary[400]}
          borderRadius="4px"
          overflow="auto"
          p="20px"
        >
          <NodeDetail node={selectedNode} colors={colors} />
        </Box>
      </Box>
    </Box>
  );
}
