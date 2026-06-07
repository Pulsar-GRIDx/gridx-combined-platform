import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Chip,
  TextField,
  InputAdornment,
  IconButton,
  CircularProgress,
  useTheme,
  Button,
  Select,
  MenuItem,
  FormControl,
  Collapse,
} from "@mui/material";
import {
  SearchOutlined,
  ArrowBackOutlined,
  ElectricMeterOutlined,
  WifiOutlined,
  WifiOffOutlined,
  WarningAmberOutlined,
  AccountTreeOutlined,
  TransformOutlined,
  ExpandMore,
  ChevronRight,
  FiberManualRecord,
  OpenInNewOutlined,
  RefreshOutlined,
  BoltOutlined,
} from "@mui/icons-material";
import { tokens } from "../theme";

/* ================================================================
   Build topology tree from flat API data
   ================================================================ */
function buildTopologyTree(data) {
  const { meters, substations, transformers } = data;

  // Create root node (Main Station)
  const tree = {
    id: "main",
    name: "Windhoek Grid",
    type: "main_station",
    children: [],
    status: "online",
  };

  // Add substations as children of main
  (substations || []).forEach((sub) => {
    const subNode = {
      id: `sub-${sub.id}`,
      name: sub.name || `Substation ${sub.id}`,
      type: sub.type === "primary" ? "substation" : "feeder",
      lat: sub.lat,
      lng: sub.lng,
      district: sub.district,
      status: "online",
      children: [],
    };

    // Find meters near this substation
    (meters || []).forEach((m) => {
      const lat = parseFloat(m.Lat);
      const lng = parseFloat(m.Longitude);
      if (!isNaN(lat) && !isNaN(lng) && sub.lat && sub.lng) {
        const dist = Math.sqrt(
          Math.pow(lat - sub.lat, 2) + Math.pow(lng - sub.lng, 2)
        );
        if (dist < 0.02) {
          subNode.children.push({
            id: `meter-${m.DRN}`,
            name: m.DRN,
            type: "meter",
            customerName: m.customerName,
            area: m.LocationName,
            suburb: m.Suburb,
            lat,
            lng,
            status: m.Status == "1" || m.Status == 1 ? "online" : "offline",
            drn: m.DRN,
            tariff: m.tariff_type,
            city: m.City,
            region: m.Region,
          });
        }
      }
    });

    tree.children.push(subNode);
  });

  // Collect mapped DRNs
  const mappedDrns = new Set();
  tree.children.forEach((sub) =>
    (sub.children || []).forEach((m) => mappedDrns.add(m.drn))
  );

  // Add orphan meters
  const orphans = (meters || []).filter((m) => !mappedDrns.has(m.DRN));
  if (orphans.length > 0) {
    tree.children.push({
      id: "unmapped",
      name: "Unmapped Meters",
      type: "feeder",
      status: "warning",
      children: orphans.map((m) => ({
        id: `meter-${m.DRN}`,
        name: m.DRN,
        type: "meter",
        customerName: m.customerName,
        area: m.LocationName,
        suburb: m.Suburb,
        status: m.Status == "1" || m.Status == 1 ? "online" : "offline",
        drn: m.DRN,
        tariff: m.tariff_type,
        city: m.City,
        region: m.Region,
      })),
    });
  }

  return tree;
}

/* ================================================================
   Collect all nodes (flat) from tree, for filtering
   ================================================================ */
function flattenTree(node) {
  const result = [node];
  (node.children || []).forEach((c) => result.push(...flattenTree(c)));
  return result;
}

/* ================================================================
   Icon/color helpers per node type
   ================================================================ */
const nodeStyles = {
  main_station: { color: "#2563EB", bg: "rgba(37,99,235,0.12)", icon: <BoltOutlined sx={{ fontSize: 16 }} />, shape: "square" },
  substation: { color: "#3B82F6", bg: "rgba(59,130,246,0.10)", icon: <AccountTreeOutlined sx={{ fontSize: 16 }} />, shape: "square" },
  feeder: { color: "#F59E0B", bg: "rgba(245,158,11,0.10)", icon: <AccountTreeOutlined sx={{ fontSize: 14 }} />, shape: "diamond" },
  transformer: { color: "#D97706", bg: "rgba(217,119,6,0.10)", icon: <TransformOutlined sx={{ fontSize: 14 }} />, shape: "diamond" },
  meter: { color: "#10B981", bg: "rgba(16,185,129,0.10)", icon: <ElectricMeterOutlined sx={{ fontSize: 14 }} />, shape: "circle" },
};

const statusColors = {
  online: "#10B981",
  offline: "#EF4444",
  warning: "#F59E0B",
  critical: "#DC2626",
};

/* ================================================================
   TreeNode component — recursive, expandable
   ================================================================ */
function TreeNode({ node, depth, expanded, toggleExpand, selectedNode, setSelectedNode, isDark, colors, filter }) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expanded.has(node.id);
  const isSelected = selectedNode?.id === node.id;
  const style = nodeStyles[node.type] || nodeStyles.meter;
  const statusColor = statusColors[node.status] || "#64748B";

  // Filter logic: if filter is set and node doesn't match AND no children match, hide
  const filteredChildren = useMemo(() => {
    if (!hasChildren) return [];
    if (!filter) return node.children;
    return node.children.filter((c) => {
      const flat = flattenTree(c);
      return flat.some(
        (n) =>
          (n.name || "").toLowerCase().includes(filter) ||
          (n.customerName || "").toLowerCase().includes(filter) ||
          (n.drn || "").toLowerCase().includes(filter) ||
          (n.area || "").toLowerCase().includes(filter)
      );
    });
  }, [hasChildren, node.children, filter]);

  // If filtering and this node + no children match, hide
  if (filter && filteredChildren.length === 0) {
    const selfMatch =
      (node.name || "").toLowerCase().includes(filter) ||
      (node.customerName || "").toLowerCase().includes(filter) ||
      (node.drn || "").toLowerCase().includes(filter) ||
      (node.area || "").toLowerCase().includes(filter);
    if (!selfMatch) return null;
  }

  const headingColor = isDark ? colors.grey[100] : "#111827";
  const labelColor = isDark ? colors.grey[300] : "#6B7280";

  return (
    <Box>
      {/* Node row */}
      <Box
        onClick={() => setSelectedNode(node)}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          pl: `${depth * 28 + 8}px`,
          pr: 1.5,
          py: "7px",
          cursor: "pointer",
          borderRadius: "8px",
          bgcolor: isSelected
            ? isDark
              ? "rgba(37,99,235,0.12)"
              : "rgba(37,99,235,0.06)"
            : "transparent",
          border: isSelected
            ? `1px solid ${isDark ? "rgba(37,99,235,0.3)" : "rgba(37,99,235,0.2)"}`
            : "1px solid transparent",
          transition: "all 0.15s",
          "&:hover": {
            bgcolor: isDark
              ? "rgba(37,99,235,0.06)"
              : "rgba(37,99,235,0.03)",
          },
          mb: "2px",
        }}
      >
        {/* Expand/collapse toggle */}
        {hasChildren ? (
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand(node.id);
            }}
            sx={{
              width: 22,
              height: 22,
              color: labelColor,
              transition: "transform 0.2s",
            }}
          >
            {isExpanded ? (
              <ExpandMore sx={{ fontSize: 16 }} />
            ) : (
              <ChevronRight sx={{ fontSize: 16 }} />
            )}
          </IconButton>
        ) : (
          <Box sx={{ width: 22 }} />
        )}

        {/* Node icon */}
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: style.shape === "circle" ? "50%" : style.shape === "diamond" ? "6px" : "6px",
            transform: style.shape === "diamond" ? "rotate(45deg)" : "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: style.bg,
            border: `1.5px solid ${style.color}`,
            flexShrink: 0,
          }}
        >
          <Box sx={{ transform: style.shape === "diamond" ? "rotate(-45deg)" : "none", display: "flex" }}>
            {style.icon}
          </Box>
        </Box>

        {/* Name + meta */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box display="flex" alignItems="center" gap={0.75}>
            <Typography
              fontSize="13px"
              fontWeight={node.type === "main_station" ? 700 : 600}
              color={headingColor}
              noWrap
              sx={{ fontFamily: node.type === "meter" ? "monospace" : "inherit" }}
            >
              {node.name}
            </Typography>
            {node.customerName && (
              <Typography fontSize="11px" color={labelColor} noWrap>
                {node.customerName}
              </Typography>
            )}
          </Box>
          <Box display="flex" alignItems="center" gap={0.5} mt="1px">
            <Typography
              fontSize="10px"
              color={labelColor}
              textTransform="capitalize"
            >
              {node.type.replace("_", " ")}
            </Typography>
            {node.area && (
              <Typography fontSize="10px" color={labelColor}>
                &middot; {node.area}
              </Typography>
            )}
            {node.district && (
              <Typography fontSize="10px" color={labelColor}>
                &middot; {node.district}
              </Typography>
            )}
            {hasChildren && (
              <Typography fontSize="10px" color={labelColor}>
                &middot; {node.children.length} children
              </Typography>
            )}
          </Box>
        </Box>

        {/* Status dot */}
        <FiberManualRecord
          sx={{ fontSize: 10, color: statusColor, flexShrink: 0 }}
        />
      </Box>

      {/* Children */}
      {hasChildren && (
        <Collapse in={isExpanded} timeout={200}>
          <Box
            sx={{
              ml: `${depth * 28 + 19}px`,
              borderLeft: `1px solid ${isDark ? "#1E293B" : "#E5E7EB"}`,
              pl: 0,
            }}
          >
            {filteredChildren.map((child) => (
              <TreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                expanded={expanded}
                toggleExpand={toggleExpand}
                selectedNode={selectedNode}
                setSelectedNode={setSelectedNode}
                isDark={isDark}
                colors={colors}
                filter={filter}
              />
            ))}
          </Box>
        </Collapse>
      )}
    </Box>
  );
}

/* ================================================================
   Main Component
   ================================================================ */
export default function GridTopology() {
  const navigate = useNavigate();
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const isDark = theme.palette.mode === "dark";

  const [loading, setLoading] = useState(true);
  const [topologyData, setTopologyData] = useState(null);
  const [tree, setTree] = useState(null);
  const [expanded, setExpanded] = useState(new Set(["main"]));
  const [selectedNode, setSelectedNode] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const cardBg = isDark ? colors.primary[400] : "#FFFFFF";
  const cardBorder = `1px solid ${isDark ? "#1E293B" : "#E5E7EB"}`;
  const headingColor = isDark ? colors.grey[100] : "#111827";
  const labelColor = isDark ? colors.grey[300] : "#6B7280";

  const fetchTopology = useCallback(async () => {
    setLoading(true);
    try {
      const token = sessionStorage.getItem("token");
      const res = await fetch("/cb/loadcontrol/grid-topology", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success && json.data) {
        setTopologyData(json.data);
        const builtTree = buildTopologyTree(json.data);
        setTree(builtTree);
      }
    } catch (err) {
      console.error("Topology fetch error:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTopology();
  }, [fetchTopology]);

  const toggleExpand = useCallback((nodeId) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  // Expand all / collapse all
  const expandAll = useCallback(() => {
    if (!tree) return;
    const allIds = new Set();
    const collect = (node) => {
      allIds.add(node.id);
      (node.children || []).forEach(collect);
    };
    collect(tree);
    setExpanded(allIds);
  }, [tree]);

  const collapseAll = useCallback(() => {
    setExpanded(new Set(["main"]));
  }, []);

  // Stats
  const stats = topologyData?.stats || {};
  const alertCount = useMemo(() => {
    if (!tree) return 0;
    const all = flattenTree(tree);
    return all.filter(
      (n) => n.status === "warning" || n.status === "critical"
    ).length;
  }, [tree]);

  // Search filter
  const filterQuery = useMemo(() => {
    const q = search.toLowerCase().trim();
    return q || null;
  }, [search]);

  // Status filter — applied at tree level
  const filteredTree = useMemo(() => {
    if (!tree) return null;
    if (statusFilter === "all" && !filterQuery) return tree;

    function filterNode(node) {
      // Check children recursively
      const filteredChildren = (node.children || [])
        .map(filterNode)
        .filter(Boolean);

      // Check self match
      const statusMatch =
        statusFilter === "all" || node.status === statusFilter;
      const searchMatch =
        !filterQuery ||
        (node.name || "").toLowerCase().includes(filterQuery) ||
        (node.customerName || "").toLowerCase().includes(filterQuery) ||
        (node.drn || "").toLowerCase().includes(filterQuery) ||
        (node.area || "").toLowerCase().includes(filterQuery);

      // If self matches or has matching children, include
      if ((statusMatch && searchMatch) || filteredChildren.length > 0) {
        return { ...node, children: filteredChildren };
      }
      return null;
    }

    return filterNode(tree);
  }, [tree, statusFilter, filterQuery]);

  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        height="80vh"
      >
        <CircularProgress sx={{ color: "#2563EB" }} />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        bgcolor: isDark ? colors.primary[500] : "#F9FAFB",
        minHeight: "calc(100vh - 70px)",
      }}
    >
      {/* ===== HEADER ===== */}
      <Box
        sx={{
          px: 3,
          pt: 3,
          pb: 1,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <Box display="flex" alignItems="center" gap={2}>
          <IconButton
            onClick={() => navigate("/load-control")}
            sx={{
              color: labelColor,
              border: cardBorder,
              borderRadius: "10px",
              width: 36,
              height: 36,
              mr: 1.5,
            }}
          >
            <ArrowBackOutlined sx={{ fontSize: 18 }} />
          </IconButton>
          <Box>
            <Typography variant="h4" fontWeight={700} color={headingColor}>
              Grid Topology
            </Typography>
            <Typography variant="body2" color={labelColor} mt={0.25}>
              Network View &mdash; Hierarchical grid infrastructure
            </Typography>
          </Box>
        </Box>
        <Box display="flex" gap={1} alignItems="center">
          <TextField
            size="small"
            placeholder="Search DRN, name, substation..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{
              width: 280,
              "& .MuiOutlinedInput-root": {
                bgcolor: cardBg,
                borderRadius: "8px",
                height: 36,
                fontSize: 13,
                border: cardBorder,
                "& fieldset": { border: "none" },
              },
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlined sx={{ fontSize: 18, color: labelColor }} />
                </InputAdornment>
              ),
            }}
          />
          <IconButton
            size="small"
            onClick={fetchTopology}
            sx={{
              color: labelColor,
              border: cardBorder,
              borderRadius: "8px",
              width: 36,
              height: 36,
            }}
          >
            <RefreshOutlined sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
      </Box>

      {/* ===== HEALTH DASHBOARD ===== */}
      <Box sx={{ px: 3, py: 2, display: "flex", gap: 2, flexWrap: "wrap" }}>
        {[
          {
            label: "Total Meters",
            value: stats.totalMeters || 0,
            icon: <ElectricMeterOutlined sx={{ fontSize: 20 }} />,
            iconColor: "#2563EB",
            iconBg: isDark ? "rgba(37,99,235,0.1)" : "#EFF6FF",
          },
          {
            label: "Online",
            value: stats.onlineMeters || 0,
            icon: <WifiOutlined sx={{ fontSize: 20 }} />,
            iconColor: "#10B981",
            iconBg: isDark ? "rgba(16,185,129,0.1)" : "#ECFDF5",
          },
          {
            label: "Offline",
            value: stats.offlineMeters || 0,
            icon: <WifiOffOutlined sx={{ fontSize: 20 }} />,
            iconColor: "#EF4444",
            iconBg: isDark ? "rgba(239,68,68,0.1)" : "#FEF2F2",
          },
          {
            label: "Substations",
            value: stats.totalSubstations || 0,
            icon: <AccountTreeOutlined sx={{ fontSize: 20 }} />,
            iconColor: "#3B82F6",
            iconBg: isDark ? "rgba(59,130,246,0.1)" : "#EFF6FF",
          },
          {
            label: "Transformers",
            value: stats.totalTransformers || 0,
            icon: <TransformOutlined sx={{ fontSize: 20 }} />,
            iconColor: "#D97706",
            iconBg: isDark ? "rgba(217,119,6,0.1)" : "#FFFBEB",
          },
          {
            label: "Active Alerts",
            value: alertCount,
            icon: <WarningAmberOutlined sx={{ fontSize: 20 }} />,
            iconColor: alertCount > 0 ? "#F59E0B" : "#64748B",
            iconBg:
              alertCount > 0
                ? isDark
                  ? "rgba(245,158,11,0.1)"
                  : "#FFFBEB"
                : isDark
                ? "rgba(100,116,139,0.1)"
                : "#F3F4F6",
          },
        ].map((s) => (
          <Box
            key={s.label}
            sx={{
              flex: "1 1 150px",
              bgcolor: cardBg,
              border: cardBorder,
              borderRadius: "12px",
              p: "14px 18px",
              display: "flex",
              alignItems: "center",
              gap: 1.5,
            }}
          >
            <Box
              sx={{
                width: 38,
                height: 38,
                borderRadius: "10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: s.iconBg,
                color: s.iconColor,
              }}
            >
              {s.icon}
            </Box>
            <Box>
              <Typography variant="h5" fontWeight={700} color={headingColor}>
                {s.value}
              </Typography>
              <Typography variant="caption" color={labelColor} fontSize="11px">
                {s.label}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>

      {/* ===== FILTER BAR ===== */}
      <Box
        sx={{
          px: 3,
          pb: 1.5,
          display: "flex",
          gap: 1.5,
          alignItems: "center",
        }}
      >
        <FormControl size="small">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            sx={{
              height: 32,
              fontSize: 12,
              borderRadius: "8px",
              bgcolor: cardBg,
              border: cardBorder,
              "& fieldset": { border: "none" },
              minWidth: 130,
            }}
          >
            <MenuItem value="all">All Status</MenuItem>
            <MenuItem value="online">Online</MenuItem>
            <MenuItem value="offline">Offline</MenuItem>
            <MenuItem value="warning">Warning</MenuItem>
            <MenuItem value="critical">Critical</MenuItem>
          </Select>
        </FormControl>

        <Box sx={{ ml: "auto", display: "flex", gap: 1 }}>
          <Button
            size="small"
            onClick={expandAll}
            sx={{
              textTransform: "none",
              fontSize: 11,
              color: labelColor,
              borderRadius: "6px",
              "&:hover": {
                bgcolor: isDark ? "rgba(37,99,235,0.08)" : "#EFF6FF",
              },
            }}
          >
            Expand All
          </Button>
          <Button
            size="small"
            onClick={collapseAll}
            sx={{
              textTransform: "none",
              fontSize: 11,
              color: labelColor,
              borderRadius: "6px",
              "&:hover": {
                bgcolor: isDark ? "rgba(37,99,235,0.08)" : "#EFF6FF",
              },
            }}
          >
            Collapse All
          </Button>
        </Box>
      </Box>

      {/* ===== MAIN CONTENT: TREE + DETAIL PANEL ===== */}
      <Box sx={{ px: 3, pb: 4, display: "flex", gap: 2 }}>
        {/* Tree visualization */}
        <Box
          sx={{
            flex: 1,
            bgcolor: cardBg,
            border: cardBorder,
            borderRadius: "12px",
            minHeight: 500,
            maxHeight: "calc(100vh - 380px)",
            overflowY: "auto",
            py: 1,
            "&::-webkit-scrollbar": { width: 5 },
            "&::-webkit-scrollbar-thumb": {
              bgcolor: isDark ? "#374151" : "#D1D5DB",
              borderRadius: 4,
            },
          }}
        >
          {filteredTree ? (
            <TreeNode
              node={filteredTree}
              depth={0}
              expanded={expanded}
              toggleExpand={toggleExpand}
              selectedNode={selectedNode}
              setSelectedNode={setSelectedNode}
              isDark={isDark}
              colors={colors}
              filter={filterQuery}
            />
          ) : (
            <Box
              display="flex"
              justifyContent="center"
              alignItems="center"
              height={400}
            >
              <Typography color={labelColor} fontSize="13px">
                No nodes match the current filter
              </Typography>
            </Box>
          )}
        </Box>

        {/* Detail panel */}
        <Box
          sx={{
            width: 320,
            flexShrink: 0,
            bgcolor: cardBg,
            border: cardBorder,
            borderRadius: "12px",
            p: 0,
            minHeight: 500,
            maxHeight: "calc(100vh - 380px)",
            overflowY: "auto",
            "&::-webkit-scrollbar": { width: 5 },
            "&::-webkit-scrollbar-thumb": {
              bgcolor: isDark ? "#374151" : "#D1D5DB",
              borderRadius: 4,
            },
          }}
        >
          {selectedNode ? (
            <DetailPanel
              node={selectedNode}
              isDark={isDark}
              colors={colors}
              navigate={navigate}
              cardBorder={cardBorder}
            />
          ) : (
            <Box
              display="flex"
              flexDirection="column"
              justifyContent="center"
              alignItems="center"
              height="100%"
              minHeight={400}
              px={3}
            >
              <AccountTreeOutlined
                sx={{
                  fontSize: 48,
                  color: isDark ? colors.grey[500] : "#D1D5DB",
                  mb: 1.5,
                }}
              />
              <Typography
                fontSize="13px"
                fontWeight={600}
                color={headingColor}
                mb={0.5}
              >
                Select a Node
              </Typography>
              <Typography
                fontSize="12px"
                color={labelColor}
                textAlign="center"
              >
                Click on any node in the tree to view its details
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* ===== LEGEND ===== */}
      <Box sx={{ px: 3, pb: 3 }}>
        <Box
          sx={{
            bgcolor: cardBg,
            border: cardBorder,
            borderRadius: "12px",
            px: 3,
            py: 2,
            display: "flex",
            gap: 4,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <Typography
            fontSize="11px"
            fontWeight={700}
            color={labelColor}
            textTransform="uppercase"
            letterSpacing="0.5px"
          >
            Legend
          </Typography>
          {[
            { label: "Main Station", color: "#2563EB", shape: "square" },
            { label: "Substation", color: "#3B82F6", shape: "square" },
            { label: "Feeder", color: "#F59E0B", shape: "diamond" },
            { label: "Transformer", color: "#D97706", shape: "diamond" },
          ].map((item) => (
            <Box
              key={item.label}
              display="flex"
              alignItems="center"
              gap={0.75}
            >
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius:
                    item.shape === "square" ? "2px" : "50%",
                  transform:
                    item.shape === "diamond" ? "rotate(45deg)" : "none",
                  bgcolor: item.color,
                }}
              />
              <Typography fontSize="11px" color={labelColor}>
                {item.label}
              </Typography>
            </Box>
          ))}
          <Box sx={{ borderLeft: `1px solid ${isDark ? "#1E293B" : "#E5E7EB"}`, pl: 2, ml: 1 }}>
            {[
              { label: "Online", color: "#10B981" },
              { label: "Offline", color: "#EF4444" },
              { label: "Warning", color: "#F59E0B" },
            ].map((item) => (
              <Box
                key={item.label}
                display="inline-flex"
                alignItems="center"
                gap={0.5}
                mr={2}
              >
                <FiberManualRecord
                  sx={{ fontSize: 8, color: item.color }}
                />
                <Typography fontSize="11px" color={labelColor}>
                  {item.label}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

/* ================================================================
   Detail Panel — shown when a node is selected
   ================================================================ */
function DetailPanel({ node, isDark, colors, navigate, cardBorder }) {
  const headingColor = isDark ? colors.grey[100] : "#111827";
  const labelColor = isDark ? colors.grey[300] : "#6B7280";
  const style = nodeStyles[node.type] || nodeStyles.meter;
  const statusColor = statusColors[node.status] || "#64748B";

  const isMeter = node.type === "meter";
  const isSubstation = node.type === "substation" || node.type === "feeder";

  const details = [];
  if (isMeter) {
    details.push({ label: "DRN", value: node.drn || node.name });
    details.push({ label: "Customer", value: node.customerName || "---" });
    details.push({ label: "Area", value: node.area || "---" });
    details.push({ label: "Suburb", value: node.suburb || "---" });
    details.push({ label: "City", value: node.city || "---" });
    details.push({ label: "Region", value: node.region || "---" });
    details.push({ label: "Tariff", value: node.tariff || "---" });
    details.push({
      label: "Status",
      value: node.status,
      isStatus: true,
    });
    if (node.lat && node.lng) {
      details.push({
        label: "Coordinates",
        value: `${node.lat.toFixed(5)}, ${node.lng.toFixed(5)}`,
      });
    }
  } else if (isSubstation) {
    details.push({ label: "Name", value: node.name });
    details.push({
      label: "Type",
      value: node.type === "substation" ? "Primary" : "Distribution/Feeder",
    });
    details.push({
      label: "Connected Meters",
      value: (node.children || []).length,
    });
    if (node.district)
      details.push({ label: "District", value: node.district });
    if (node.lat && node.lng)
      details.push({
        label: "Coordinates",
        value: `${node.lat.toFixed(5)}, ${node.lng.toFixed(5)}`,
      });
    details.push({ label: "Status", value: node.status, isStatus: true });
  } else {
    details.push({ label: "Name", value: node.name });
    details.push({ label: "Type", value: node.type.replace("_", " ") });
    details.push({
      label: "Children",
      value: (node.children || []).length,
    });
    details.push({ label: "Status", value: node.status, isStatus: true });
  }

  return (
    <Box>
      {/* Header */}
      <Box
        sx={{
          px: 2.5,
          pt: 2.5,
          pb: 2,
          borderBottom: cardBorder,
        }}
      >
        <Box display="flex" alignItems="center" gap={1.5} mb={1}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius:
                style.shape === "circle"
                  ? "50%"
                  : style.shape === "diamond"
                  ? "8px"
                  : "8px",
              transform:
                style.shape === "diamond" ? "rotate(45deg)" : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: style.bg,
              border: `2px solid ${style.color}`,
            }}
          >
            <Box
              sx={{
                transform:
                  style.shape === "diamond" ? "rotate(-45deg)" : "none",
                display: "flex",
              }}
            >
              {style.icon}
            </Box>
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              fontSize="15px"
              fontWeight={700}
              color={headingColor}
              noWrap
              sx={{
                fontFamily: isMeter ? "monospace" : "inherit",
              }}
            >
              {node.name}
            </Typography>
            <Typography
              fontSize="11px"
              color={labelColor}
              textTransform="capitalize"
            >
              {node.type.replace("_", " ")}
            </Typography>
          </Box>
        </Box>

        {/* Status chip */}
        <Chip
          label={node.status}
          size="small"
          sx={{
            height: 22,
            fontSize: 10,
            fontWeight: 600,
            textTransform: "capitalize",
            bgcolor:
              node.status === "online"
                ? isDark
                  ? "rgba(16,185,129,0.15)"
                  : "#ECFDF5"
                : node.status === "offline"
                ? isDark
                  ? "rgba(239,68,68,0.15)"
                  : "#FEF2F2"
                : isDark
                ? "rgba(245,158,11,0.15)"
                : "#FFFBEB",
            color: statusColor,
            border: `1px solid ${statusColor}`,
          }}
        />
      </Box>

      {/* Details */}
      <Box sx={{ px: 2.5, py: 2 }}>
        {details.map((d) => (
          <Box
            key={d.label}
            display="flex"
            justifyContent="space-between"
            alignItems="center"
            sx={{ py: "6px", borderBottom: cardBorder }}
          >
            <Typography fontSize="12px" color={labelColor}>
              {d.label}
            </Typography>
            {d.isStatus ? (
              <Box display="flex" alignItems="center" gap={0.5}>
                <FiberManualRecord
                  sx={{
                    fontSize: 8,
                    color: statusColors[d.value] || "#64748B",
                  }}
                />
                <Typography
                  fontSize="12px"
                  fontWeight={600}
                  color={headingColor}
                  textTransform="capitalize"
                >
                  {d.value}
                </Typography>
              </Box>
            ) : (
              <Typography
                fontSize="12px"
                fontWeight={600}
                color={headingColor}
                noWrap
                sx={{
                  maxWidth: 180,
                  textAlign: "right",
                  fontFamily:
                    d.label === "DRN" ? "monospace" : "inherit",
                }}
              >
                {d.value}
              </Typography>
            )}
          </Box>
        ))}
      </Box>

      {/* Actions */}
      <Box sx={{ px: 2.5, pb: 2.5, display: "flex", flexDirection: "column", gap: 1 }}>
        {isMeter && (
          <Button
            fullWidth
            variant="contained"
            size="small"
            startIcon={<OpenInNewOutlined sx={{ fontSize: 14 }} />}
            onClick={() => navigate(`/meter/${node.drn || node.name}`)}
            sx={{
              textTransform: "none",
              fontSize: 12,
              borderRadius: "8px",
              bgcolor: "#2563EB",
              py: "6px",
              "&:hover": { bgcolor: "#1D4ED8" },
            }}
          >
            View Meter Profile
          </Button>
        )}
        {isSubstation && (
          <Button
            fullWidth
            variant="contained"
            size="small"
            startIcon={<OpenInNewOutlined sx={{ fontSize: 14 }} />}
            onClick={() =>
              navigate(`/substation/${node.id?.replace("sub-", "") || node.name}`)
            }
            sx={{
              textTransform: "none",
              fontSize: 12,
              borderRadius: "8px",
              bgcolor: "#2563EB",
              py: "6px",
              "&:hover": { bgcolor: "#1D4ED8" },
            }}
          >
            View Substation
          </Button>
        )}

        {/* Child summary for non-leaf nodes */}
        {node.children && node.children.length > 0 && (
          <Box
            sx={{
              mt: 1,
              p: 1.5,
              borderRadius: "8px",
              bgcolor: isDark ? "rgba(30,41,59,0.5)" : "#F9FAFB",
              border: cardBorder,
            }}
          >
            <Typography
              fontSize="10px"
              fontWeight={700}
              color={labelColor}
              textTransform="uppercase"
              letterSpacing="0.5px"
              mb={0.75}
            >
              Children Summary
            </Typography>
            {(() => {
              const counts = {};
              node.children.forEach((c) => {
                const t = c.type || "unknown";
                counts[t] = (counts[t] || 0) + 1;
              });
              return Object.entries(counts).map(([type, count]) => (
                <Box
                  key={type}
                  display="flex"
                  justifyContent="space-between"
                  alignItems="center"
                  sx={{ py: "3px" }}
                >
                  <Typography
                    fontSize="11px"
                    color={labelColor}
                    textTransform="capitalize"
                  >
                    {type.replace("_", " ")}
                  </Typography>
                  <Typography
                    fontSize="11px"
                    fontWeight={600}
                    color={headingColor}
                  >
                    {count}
                  </Typography>
                </Box>
              ));
            })()}
            {(() => {
              const onlineCount = node.children.filter(
                (c) => c.status === "online"
              ).length;
              const offlineCount = node.children.length - onlineCount;
              return (
                <Box display="flex" gap={1} mt={0.5}>
                  <Chip
                    label={`${onlineCount} online`}
                    size="small"
                    sx={{
                      height: 18,
                      fontSize: 9,
                      bgcolor: isDark
                        ? "rgba(16,185,129,0.12)"
                        : "#ECFDF5",
                      color: "#10B981",
                      "& .MuiChip-label": { px: "5px" },
                    }}
                  />
                  {offlineCount > 0 && (
                    <Chip
                      label={`${offlineCount} offline`}
                      size="small"
                      sx={{
                        height: 18,
                        fontSize: 9,
                        bgcolor: isDark
                          ? "rgba(239,68,68,0.12)"
                          : "#FEF2F2",
                        color: "#EF4444",
                        "& .MuiChip-label": { px: "5px" },
                      }}
                    />
                  )}
                </Box>
              );
            })()}
          </Box>
        )}
      </Box>
    </Box>
  );
}
