import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Typography, Chip, TextField, InputAdornment, IconButton, CircularProgress,
  useTheme, Button, Select, MenuItem, FormControl, Collapse, Dialog, DialogTitle,
  DialogContent, DialogActions, Radio, RadioGroup, FormControlLabel, Alert, Checkbox,
} from "@mui/material";
import {
  SearchOutlined, ArrowBackOutlined, ElectricMeterOutlined, WifiOutlined,
  WifiOffOutlined, WarningAmberOutlined, AccountTreeOutlined, TransformOutlined,
  ExpandMore, ChevronRight, FiberManualRecord, OpenInNewOutlined, RefreshOutlined,
  BoltOutlined, AddOutlined, EditOutlined, DeleteOutlined, LinkOutlined,
  DeviceHubOutlined, ErrorOutlined,
} from "@mui/icons-material";
import { tokens } from "../theme";

const NS = {
  main_station: { color: "#2563EB", bg: "rgba(37,99,235,0.12)", icon: <BoltOutlined sx={{ fontSize: 16 }} />, shape: "square" },
  substation: { color: "#3B82F6", bg: "rgba(59,130,246,0.10)", icon: <AccountTreeOutlined sx={{ fontSize: 16 }} />, shape: "square" },
  feeder: { color: "#14B8A6", bg: "rgba(20,184,166,0.10)", icon: <DeviceHubOutlined sx={{ fontSize: 14 }} />, shape: "diamond" },
  distribution: { color: "#F59E0B", bg: "rgba(245,158,11,0.10)", icon: <AccountTreeOutlined sx={{ fontSize: 14 }} />, shape: "diamond" },
  transformer: { color: "#EA580C", bg: "rgba(234,88,12,0.10)", icon: <TransformOutlined sx={{ fontSize: 14 }} />, shape: "diamond" },
  meter: { color: "#10B981", bg: "rgba(16,185,129,0.10)", icon: <ElectricMeterOutlined sx={{ fontSize: 14 }} />, shape: "circle" },
};
const SC = { online: "#10B981", offline: "#EF4444", warning: "#F59E0B", critical: "#DC2626" };
const TL = { main_station: "Main Station", substation: "Substation", feeder: "Feeder", distribution: "Distribution Node", transformer: "Transformer", meter: "Meter" };
const inputSx = { "& .MuiOutlinedInput-root": { fontSize: 13, borderRadius: "8px" } };
const btnPrimary = { textTransform: "none", fontSize: 12, borderRadius: "8px", bgcolor: "#2563EB", "&:hover": { bgcolor: "#1D4ED8" } };

function buildPath(nodes, id) {
  const p = []; let c = nodes.find((n) => n.id === id);
  while (c) { p.unshift(c.node_name || c.node_id); c = c.parent_id ? nodes.find((n) => n.id === c.parent_id) : null; }
  return p.join(" → ");
}
function flattenTree(node) { const r = [node]; (node.children || []).forEach((c) => r.push(...flattenTree(c))); return r; }

function buildTopologyTree(data) {
  const { meters, substations, nodes } = data;

  /* Build manual assignment map from GridHierarchy: DRN -> parent node db id */
  const manualAssignments = {};
  (nodes || []).forEach((n) => {
    if (n.node_type === "meter" && n.parent_id) {
      manualAssignments[n.node_id] = n.parent_id;
    }
  });
  /* Also build a lookup for non-meter hierarchy nodes by db id */
  const hierNodeById = {};
  (nodes || []).forEach((n) => { if (n.node_type !== "meter") hierNodeById[n.id] = n; });

  /* Root */
  const root = {
    id: "main", name: "Windhoek Grid", type: "main_station",
    status: "online", children: [], expanded: true,
  };

  /* Separate primary substations from distribution nodes */
  const primarySubs = (substations || []).filter(s => s.type === "primary");
  const distSubs = (substations || []).filter(s => s.type !== "primary");

  /* Add 3 primary substations as children of root */
  const subNodeMap = {};
  const distNodeMap = {};
  primarySubs.forEach((sub) => {
    const subNode = {
      id: "sub-" + sub.id, name: sub.name || "Substation " + sub.id,
      type: "substation", lat: sub.lat, lng: sub.lng, district: sub.district,
      status: "online", children: [], expanded: false,
      dbId: sub.id, substationId: sub.id,
    };
    root.children.push(subNode);
    subNodeMap[sub.id] = subNode;
  });

  /* Nest distribution nodes under their nearest primary substation */
  distSubs.forEach((dist) => {
    const distNode = {
      id: "dist-" + dist.id, name: dist.name || dist.district + " Distribution",
      type: "distribution", lat: dist.lat, lng: dist.lng, district: dist.district,
      status: "online", children: [], expanded: false,
      dbId: dist.id, distId: dist.id,
    };
    /* Find nearest primary substation by distance */
    let nearestPrimary = null, minDist = Infinity;
    primarySubs.forEach((ps) => {
      if (ps.lat && ps.lng && dist.lat && dist.lng) {
        const d = Math.sqrt(Math.pow(dist.lat - ps.lat, 2) + Math.pow(dist.lng - ps.lng, 2));
        if (d < minDist) { minDist = d; nearestPrimary = subNodeMap[ps.id]; }
      }
    });
    if (nearestPrimary) {
      nearestPrimary.children.push(distNode);
    } else if (primarySubs.length > 0) {
      subNodeMap[primarySubs[0].id].children.push(distNode);
    } else {
      root.children.push(distNode);
    }
    distNodeMap[dist.id] = distNode;
  });

  /* Also add any non-meter GridHierarchy nodes that are NOT already represented as substations */
  const hierTreeNodes = {};
  (nodes || []).forEach((n) => {
    if (n.node_type === "meter") return;
    /* Check if this hierarchy node matches an existing substation by name */
    const matchingSub = root.children.find((s) => s.name === n.node_name || s.name === n.node_id);
    if (matchingSub) {
      /* Link the hierarchy db id to the substation tree node */
      matchingSub.dbId = n.id;
      matchingSub.code = n.node_code;
      matchingSub.capacityRating = n.capacity_rating;
      matchingSub.voltageLevel = n.voltage_level;
      matchingSub.description = n.description;
      hierTreeNodes[n.id] = matchingSub;
    } else {
      /* New hierarchy node — add to root */
      const hn = {
        id: "h-" + n.id, dbId: n.id, name: n.node_name || n.node_id, code: n.node_code,
        type: n.node_type, lat: parseFloat(n.lat) || null, lng: parseFloat(n.lng) || null,
        status: n.status || "online", capacityRating: n.capacity_rating, voltageLevel: n.voltage_level,
        description: n.description, children: [], expanded: false,
      };
      root.children.push(hn);
      hierTreeNodes[n.id] = hn;
    }
  });

  /* Helper: build a meter tree node */
  const mkMeter = (m) => {
    const lat = parseFloat(m.Lat), lng = parseFloat(m.Longitude);
    return {
      id: "meter-" + m.DRN, name: m.DRN, type: "meter", drn: m.DRN,
      customerName: m.customerName, area: m.LocationName, suburb: m.Suburb,
      lat: isNaN(lat) ? null : lat, lng: isNaN(lng) ? null : lng,
      status: (m.Status == "1" || m.Status == 1) ? "online" : "offline",
      tariff: m.tariff_type, city: m.City, region: m.Region,
    };
  };

  /* Map meters — manual assignments first, then distance-based auto-map */
  const mappedDrns = new Set();

  /* Pass 1: manual assignments from GridHierarchy */
  (meters || []).forEach((m) => {
    if (!manualAssignments[m.DRN]) return;
    const parentDbId = manualAssignments[m.DRN];
    const parentNode = hierTreeNodes[parentDbId] || root.children.find((s) => s.dbId === parentDbId);
    if (parentNode) {
      parentNode.children.push(mkMeter(m));
      mappedDrns.add(m.DRN);
    }
  });

  /* Pass 2: auto-map remaining meters by distance to nearest distribution node (<0.03 degrees) */
  (meters || []).forEach((m) => {
    if (mappedDrns.has(m.DRN)) return;
    const mLat = parseFloat(m.Lat), mLng = parseFloat(m.Longitude);
    if (isNaN(mLat) || isNaN(mLng)) return;
    let nearestDist = null, minDist = Infinity;
    Object.values(distNodeMap).forEach((dn) => {
      if (!dn.lat || !dn.lng) return;
      const d = Math.sqrt(Math.pow(mLat - dn.lat, 2) + Math.pow(mLng - dn.lng, 2));
      if (d < 0.03 && d < minDist) { minDist = d; nearestDist = dn; }
    });
    if (nearestDist) {
      nearestDist.children.push(mkMeter(m));
      mappedDrns.add(m.DRN);
    }
  });

  /* Unmapped meters */
  const orphans = (meters || []).filter((m) => !mappedDrns.has(m.DRN));
  if (orphans.length > 0) {
    root.children.push({
      id: "unmapped", name: "Unmapped Meters", type: "distribution",
      status: "warning", children: orphans.map(mkMeter), expanded: true,
    });
  }

  return root;
}

/* TreeNode */
function TreeNode({ node, depth, expanded, toggleExpand, selectedNode, setSelectedNode, isDark, colors, filter }) {
  const has = node.children && node.children.length > 0, isExp = expanded.has(node.id), isSel = selectedNode?.id === node.id;
  const st = NS[node.type] || NS.meter, sc = SC[node.status] || "#64748B";
  const hc = isDark ? colors.grey[100] : "#111827", lc = isDark ? colors.grey[300] : "#6B7280";
  const fc = useMemo(() => {
    if (!has) return []; if (!filter) return node.children;
    return node.children.filter((c) => flattenTree(c).some((n) =>
      (n.name || "").toLowerCase().includes(filter) || (n.customerName || "").toLowerCase().includes(filter) ||
      (n.drn || "").toLowerCase().includes(filter) || (n.area || "").toLowerCase().includes(filter)));
  }, [has, node.children, filter]);
  if (filter && fc.length === 0 && ![(node.name||""), (node.customerName||""), (node.drn||""), (node.area||"")].some((v) => v.toLowerCase().includes(filter))) return null;
  return (
    <Box>
      <Box onClick={() => setSelectedNode(node)} sx={{ display: "flex", alignItems: "center", gap: 1,
        pl: `${depth * 28 + 8}px`, pr: 1.5, py: "7px", cursor: "pointer", borderRadius: "8px", mb: "2px",
        bgcolor: isSel ? (isDark ? "rgba(37,99,235,0.12)" : "rgba(37,99,235,0.06)") : "transparent",
        border: isSel ? `1px solid ${isDark ? "rgba(37,99,235,0.3)" : "rgba(37,99,235,0.2)"}` : "1px solid transparent",
        transition: "all 0.15s", "&:hover": { bgcolor: isDark ? "rgba(37,99,235,0.06)" : "rgba(37,99,235,0.03)" } }}>
        {has ? <IconButton size="small" onClick={(e) => { e.stopPropagation(); toggleExpand(node.id); }}
          sx={{ width: 22, height: 22, color: lc }}>{isExp ? <ExpandMore sx={{ fontSize: 16 }} /> : <ChevronRight sx={{ fontSize: 16 }} />}</IconButton> : <Box sx={{ width: 22 }} />}
        <Box sx={{ width: 28, height: 28, borderRadius: st.shape === "circle" ? "50%" : "6px",
          transform: st.shape === "diamond" ? "rotate(45deg)" : "none", display: "flex", alignItems: "center",
          justifyContent: "center", bgcolor: st.bg, border: `1.5px solid ${st.color}`, flexShrink: 0 }}>
          <Box sx={{ transform: st.shape === "diamond" ? "rotate(-45deg)" : "none", display: "flex" }}>{st.icon}</Box>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box display="flex" alignItems="center" gap={0.75}>
            <Typography fontSize="13px" fontWeight={node.type === "main_station" ? 700 : 600} color={hc} noWrap
              sx={{ fontFamily: node.type === "meter" ? "monospace" : "inherit" }}>{node.name}</Typography>
            {node.customerName && <Typography fontSize="11px" color={lc} noWrap>{node.customerName}</Typography>}
          </Box>
          <Box display="flex" alignItems="center" gap={0.5} mt="1px">
            <Chip label={TL[node.type] || node.type} size="small" sx={{ height: 16, fontSize: 9, fontWeight: 600, bgcolor: st.bg, color: st.color, "& .MuiChip-label": { px: "5px" } }} />
            {node.area && <Typography fontSize="10px" color={lc}>&middot; {node.area}</Typography>}
            {has && <Typography fontSize="10px" color={lc}>&middot; {node.children.length}</Typography>}
          </Box>
        </Box>
        <FiberManualRecord sx={{ fontSize: 10, color: sc, flexShrink: 0 }} />
      </Box>
      {has && <Collapse in={isExp} timeout={200}><Box sx={{ ml: `${depth * 28 + 19}px`, borderLeft: `1px solid ${isDark ? "#1E293B" : "#E5E7EB"}` }}>
        {fc.map((ch) => <TreeNode key={ch.id} node={ch} depth={depth + 1} expanded={expanded} toggleExpand={toggleExpand}
          selectedNode={selectedNode} setSelectedNode={setSelectedNode} isDark={isDark} colors={colors} filter={filter} />)}
      </Box></Collapse>}
    </Box>
  );
}

/* Shared dialog field */
function DField({ label, children, isDark, colors }) {
  return <Box><Typography fontSize="11px" color={isDark ? colors.grey[300] : "#6B7280"} mb={0.5} fontWeight={600}>{label}</Typography>{children}</Box>;
}

/* Add Distribution Dialog */
function AddDlg({ open, onClose, onCreated, allNodes, isDark, colors, token }) {
  const [nt, setNt] = useState("substation"), [nm, setNm] = useState(""), [cd, setCd] = useState("");
  const [pid, setPid] = useState(""), [lt, setLt] = useState(""), [lg, setLg] = useState("");
  const [cap, setCap] = useState(""), [vol, setVol] = useState(""), [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false), [err, setErr] = useState("");
  const bg = isDark ? colors.primary[400] : "#FFF", hc = isDark ? colors.grey[100] : "#111827", lc = isDark ? colors.grey[300] : "#6B7280";
  const pOpts = useMemo(() => (allNodes || []).filter((n) => n.node_type !== "meter").map((n) => ({ id: n.id, label: buildPath(allNodes, n.id) || n.node_name })), [allNodes]);
  const selPath = useMemo(() => { if (!pid) return ""; const p = allNodes.find((n) => n.id === parseInt(pid)); return p ? buildPath(allNodes, p.id) + " → " + nm : ""; }, [pid, allNodes, nm]);
  const types = [["main_station","Main Station"],["substation","Substation"],["feeder","Feeder"],["distribution","Distribution Node"],["transformer","Transformer"]];
  const reset = () => { setNt("substation"); setNm(""); setCd(""); setPid(""); setLt(""); setLg(""); setCap(""); setVol(""); setDesc(""); setErr(""); onClose(); };
  const save = async () => {
    if (!nm.trim()) { setErr("Name is required"); return; } setSaving(true); setErr("");
    try {
      const r = await fetch("/cb/loadcontrol/grid-topology/nodes", { method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ node_type: nt, node_name: nm.trim(), node_code: cd.trim() || undefined,
          parent_id: pid ? parseInt(pid) : undefined, lat: lt ? parseFloat(lt) : undefined, lng: lg ? parseFloat(lg) : undefined,
          capacity_rating: cap.trim() || undefined, voltage_level: vol.trim() || undefined, description: desc.trim() || undefined }) });
      const j = await r.json(); if (j.success) { onCreated(j); reset(); } else setErr(j.error || "Failed");
    } catch (e) { setErr(e.message); } setSaving(false);
  };
  return (
    <Dialog open={open} onClose={reset} maxWidth="sm" fullWidth PaperProps={{ sx: { bgcolor: bg, borderRadius: "12px" } }}>
      <DialogTitle sx={{ color: hc, fontWeight: 700, fontSize: 16, pb: 1 }}>Add Distribution Asset</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "8px !important" }}>
        {err && <Alert severity="error" sx={{ fontSize: 12 }}>{err}</Alert>}
        <DField label="Asset Type" isDark={isDark} colors={colors}>
          <Select size="small" fullWidth value={nt} onChange={(e) => setNt(e.target.value)} sx={{ fontSize: 13, borderRadius: "8px" }}>
            {types.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}</Select></DField>
        <DField label="Name *" isDark={isDark} colors={colors}><TextField size="small" fullWidth value={nm} onChange={(e) => setNm(e.target.value)} placeholder="e.g. Rocky Crest Substation" sx={inputSx} /></DField>
        <DField label="Code (optional)" isDark={isDark} colors={colors}><TextField size="small" fullWidth value={cd} onChange={(e) => setCd(e.target.value)} placeholder="e.g. RC-SUB-01" sx={inputSx} /></DField>
        <DField label="Parent Node" isDark={isDark} colors={colors}>
          <Select size="small" fullWidth value={pid} onChange={(e) => setPid(e.target.value)} displayEmpty sx={{ fontSize: 13, borderRadius: "8px" }}>
            <MenuItem value=""><em>None (root level)</em></MenuItem>
            {pOpts.map((p) => <MenuItem key={p.id} value={p.id}><Typography fontSize="12px" noWrap>{p.label}</Typography></MenuItem>)}</Select></DField>
        {selPath && <Alert severity="info" sx={{ fontSize: 11, py: 0 }}>Full path: {selPath}</Alert>}
        <Box display="flex" gap={1.5}>
          <DField label="Latitude" isDark={isDark} colors={colors}><TextField size="small" fullWidth value={lt} onChange={(e) => setLt(e.target.value)} placeholder="-22.5597" sx={inputSx} /></DField>
          <DField label="Longitude" isDark={isDark} colors={colors}><TextField size="small" fullWidth value={lg} onChange={(e) => setLg(e.target.value)} placeholder="17.0832" sx={inputSx} /></DField>
        </Box>
        {["substation","transformer","distribution"].includes(nt) && <Box display="flex" gap={1.5}>
          <DField label="Capacity Rating" isDark={isDark} colors={colors}><TextField size="small" fullWidth value={cap} onChange={(e) => setCap(e.target.value)} placeholder="e.g. 500 kVA" sx={inputSx} /></DField>
          <DField label="Voltage Level" isDark={isDark} colors={colors}><TextField size="small" fullWidth value={vol} onChange={(e) => setVol(e.target.value)} placeholder="e.g. 11 kV" sx={inputSx} /></DField>
        </Box>}
        <DField label="Description" isDark={isDark} colors={colors}><TextField size="small" fullWidth multiline rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Optional notes..." sx={inputSx} /></DField>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={reset} sx={{ textTransform: "none", fontSize: 12, color: lc }}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving || !nm.trim()} sx={btnPrimary}>
          {saving ? <CircularProgress size={16} sx={{ color: "#fff" }} /> : "Create"}</Button>
      </DialogActions>
    </Dialog>
  );
}

/* Assign Meter Dialog */
function AssignDlg({ open, onClose, onAssigned, meterDrn, assignMode, parentNode, allNodes, tree, isDark, colors, token, allMeters }) {
  const [sel, setSel] = useState(""), [selMulti, setSelMulti] = useState(new Set()), [sq, setSq] = useState(""), [saving, setSaving] = useState(false), [err, setErr] = useState(""), [curA, setCurA] = useState(null);
  const bg = isDark ? colors.primary[400] : "#FFF", hc = isDark ? colors.grey[100] : "#111827", lc = isDark ? colors.grey[300] : "#6B7280";

  const isMeterAssign = assignMode === "meter" || (assignMode !== "substation" && assignMode !== "distribution" && !!meterDrn);
  const isSubstationAssign = assignMode === "substation";
  const isDistributionAssign = assignMode === "distribution";

  const title = isMeterAssign ? "Assign Meter to Distribution Node" : isSubstationAssign ? "Assign Distribution Nodes to Substation" : "Assign Meters to Distribution Node";
  const description = isMeterAssign
    ? <>Assign DRN <strong style={{ fontFamily: "monospace" }}>{meterDrn}</strong> to a distribution node.</>
    : isSubstationAssign
    ? <>Select distribution nodes to assign to <strong>{parentNode?.name}</strong>.</>
    : <>Select meter DRNs to assign to <strong>{parentNode?.name}</strong>.</>;

  useEffect(() => {
    if (!meterDrn || !tree || !isMeterAssign) { setCurA(null); return; }
    let found = null;
    const search = (node, parent) => {
      if (node.type === "meter" && node.drn === meterDrn && parent) { found = parent.name; return; }
      (node.children || []).forEach((ch) => search(ch, node));
    };
    search(tree, null);
    setCurA(found);
  }, [meterDrn, tree, isMeterAssign]);

  /* Build options based on mode */
  const opts = useMemo(() => {
    if (!tree) return [];
    const result = [];
    const q = sq.toLowerCase().trim();

    if (isMeterAssign) {
      /* Show Distribution Nodes only */
      const collect = (node, path) => {
        if (node.type === "distribution" && node.id !== "unmapped") {
          const fullPath = path ? path + " > " + node.name : node.name;
          result.push({ id: node.dbId || node.distId || node.id, label: fullPath, name: node.name, type: "distribution", childCount: (node.children || []).filter(c => c.type === "meter").length });
        }
        const nextPath = node.type === "main_station" ? "" : (path ? path + " > " + node.name : node.name);
        (node.children || []).forEach((ch) => collect(ch, nextPath));
      };
      collect(tree, "");
    } else if (isSubstationAssign) {
      /* Show Distribution Nodes to assign to this substation */
      const collect = (node, path) => {
        if (node.type === "distribution" && node.id !== "unmapped") {
          result.push({ id: node.dbId || node.distId || node.id, label: node.name, name: node.name, type: "distribution", childCount: (node.children || []).filter(c => c.type === "meter").length });
        }
        (node.children || []).forEach((ch) => collect(ch, path));
      };
      collect(tree, "");
    } else if (isDistributionAssign) {
      /* Show Meter DRNs to assign to this distribution node */
      (allMeters || []).forEach((m) => {
        result.push({ id: m.DRN, label: m.DRN, name: m.DRN, type: "meter", customerName: m.customerName || "", area: m.LocationName || "" });
      });
    }
    return q ? result.filter((n) => n.label.toLowerCase().includes(q) || (n.name || "").toLowerCase().includes(q) || (n.customerName || "").toLowerCase().includes(q)) : result;
  }, [tree, sq, isMeterAssign, isSubstationAssign, isDistributionAssign, allMeters]);

  const toggleMulti = (id) => setSelMulti(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const reset = () => { setSel(""); setSelMulti(new Set()); setSq(""); setErr(""); onClose(); };
  const assign = async () => {
    setSaving(true); setErr("");
    try {
      if (isMeterAssign) {
        if (!sel) { setErr("Select a distribution node"); setSaving(false); return; }
        const selOpt = opts.find((o) => String(o.id) === sel);
        const r = await fetch("/cb/loadcontrol/grid-topology/assign-meter", { method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ drn: meterDrn, parent_id: selOpt?.id }) });
        const j = await r.json(); if (j.success) { onAssigned(j); reset(); } else setErr(j.error || "Failed");
      } else if (isDistributionAssign && selMulti.size > 0) {
        /* Assign multiple meters to this distribution node */
        for (const drn of selMulti) {
          await fetch("/cb/loadcontrol/grid-topology/assign-meter", { method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ drn, parent_id: parentNode?.dbId || parentNode?.distId }) });
        }
        onAssigned({}); reset();
      } else if (isSubstationAssign && selMulti.size > 0) {
        /* For now just close — substation-distribution assignment needs backend support */
        onAssigned({}); reset();
      }
    } catch (e) { setErr(e.message); } setSaving(false);
  };

  const useRadio = isMeterAssign;
  const useCheckbox = isSubstationAssign || isDistributionAssign;
  const btnLabel = isMeterAssign ? "Assign Meter" : isSubstationAssign ? `Assign ${selMulti.size} Distribution(s)` : `Assign ${selMulti.size} Meter(s)`;

  return (
    <Dialog open={open} onClose={reset} maxWidth="sm" fullWidth PaperProps={{ sx: { bgcolor: bg, borderRadius: "12px" } }}>
      <DialogTitle sx={{ color: hc, fontWeight: 700, fontSize: 16, pb: 0.5 }}>{title}</DialogTitle>
      <DialogContent sx={{ pt: "8px !important" }}>
        <Typography fontSize="12px" color={lc} mb={1.5}>{description}</Typography>
        {curA && isMeterAssign && <Alert severity="info" sx={{ mb: 2, fontSize: 12 }}>Currently assigned to: <strong>{curA}</strong></Alert>}
        {err && <Alert severity="error" sx={{ mb: 2, fontSize: 12 }}>{err}</Alert>}
        <TextField size="small" fullWidth placeholder={isDistributionAssign ? "Search meter DRNs..." : "Search distribution nodes..."} value={sq} onChange={(e) => setSq(e.target.value)}
          sx={{ mb: 1.5, ...inputSx }} InputProps={{ startAdornment: <InputAdornment position="start"><SearchOutlined sx={{ fontSize: 16, color: lc }} /></InputAdornment> }} />
        <Box sx={{ maxHeight: 350, overflowY: "auto", border: `1px solid ${isDark ? "#1E293B" : "#E5E7EB"}`, borderRadius: "8px", p: 1 }}>
          {opts.length === 0 ? <Typography fontSize="12px" color={lc} textAlign="center" py={2}>No items found.</Typography> : (
            useRadio ? (
              <RadioGroup value={sel} onChange={(e) => setSel(e.target.value)}>
                {opts.map((n) => <FormControlLabel key={n.id} value={String(n.id)} control={<Radio size="small" sx={{ py: 0.5 }} />}
                  label={<Box><Typography fontSize="12px" fontWeight={600} color={hc}>{n.label}</Typography>
                    <Typography fontSize="10px" color={lc}>{TL[n.type] || n.type} &middot; {n.childCount} meters</Typography></Box>}
                  sx={{ alignItems: "flex-start", mb: 0.5, mx: 0, borderRadius: "6px", py: 0.5, px: 1,
                    bgcolor: sel === String(n.id) ? (isDark ? "rgba(37,99,235,0.08)" : "#EFF6FF") : "transparent" }} />)}
              </RadioGroup>
            ) : (
              opts.map((n) => (
                <Box key={n.id} onClick={() => toggleMulti(n.id)} sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.5, px: 1, mb: 0.5, borderRadius: "6px", cursor: "pointer",
                  bgcolor: selMulti.has(n.id) ? (isDark ? "rgba(37,99,235,0.08)" : "#EFF6FF") : "transparent",
                  "&:hover": { bgcolor: isDark ? "rgba(255,255,255,0.03)" : "#F9FAFB" } }}>
                  <Checkbox size="small" checked={selMulti.has(n.id)} sx={{ p: 0.3 }} />
                  <Box>
                    <Typography fontSize="12px" fontWeight={600} color={hc} sx={{ fontFamily: n.type === "meter" ? "monospace" : "inherit" }}>{n.label}</Typography>
                    {n.customerName && <Typography fontSize="10px" color={lc}>{n.customerName} &middot; {n.area}</Typography>}
                    {n.type !== "meter" && <Typography fontSize="10px" color={lc}>{TL[n.type] || n.type} &middot; {n.childCount} meters</Typography>}
                  </Box>
                </Box>
              ))
            )
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={reset} sx={{ textTransform: "none", fontSize: 12, color: lc }}>Cancel</Button>
        <Button variant="contained" onClick={assign} disabled={saving || (useRadio ? !sel : selMulti.size === 0)} sx={btnPrimary}>
          {saving ? <CircularProgress size={16} sx={{ color: "#fff" }} /> : btnLabel}</Button>
      </DialogActions>
    </Dialog>
  );
}

/* Edit Node Dialog */
function EditDlg({ open, onClose, onUpdated, node, allNodes, isDark, colors, token }) {
  const [nm, setNm] = useState(""), [cd, setCd] = useState(""), [pid, setPid] = useState("");
  const [st, setSt] = useState("online"), [cap, setCap] = useState(""), [vol, setVol] = useState(""), [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false), [err, setErr] = useState("");
  const bg = isDark ? colors.primary[400] : "#FFF", hc = isDark ? colors.grey[100] : "#111827", lc = isDark ? colors.grey[300] : "#6B7280";
  useEffect(() => { if (node && open) { const d = allNodes.find((n) => n.id === node.dbId);
    if (d) { setNm(d.node_name || ""); setCd(d.node_code || ""); setPid(d.parent_id ? String(d.parent_id) : "");
      setSt(d.status || "online"); setCap(d.capacity_rating || ""); setVol(d.voltage_level || ""); setDesc(d.description || ""); } } }, [node, open, allNodes]);
  const pOpts = useMemo(() => (allNodes || []).filter((n) => n.node_type !== "meter" && n.id !== node?.dbId).map((n) => ({ id: n.id, label: buildPath(allNodes, n.id) || n.node_name })), [allNodes, node]);
  const save = async () => {
    if (!nm.trim()) { setErr("Name is required"); return; } setSaving(true); setErr("");
    try {
      const r = await fetch(`/cb/loadcontrol/grid-topology/nodes/${node.dbId}`, { method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ node_name: nm.trim(), node_code: cd.trim() || null, parent_id: pid ? parseInt(pid) : null,
          status: st, capacity_rating: cap.trim() || null, voltage_level: vol.trim() || null, description: desc.trim() || null }) });
      const j = await r.json(); if (j.success) { onUpdated(); onClose(); } else setErr(j.error || "Update failed");
    } catch (e) { setErr(e.message); } setSaving(false);
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { bgcolor: bg, borderRadius: "12px" } }}>
      <DialogTitle sx={{ color: hc, fontWeight: 700, fontSize: 16, pb: 1 }}>Edit Node</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "8px !important" }}>
        {err && <Alert severity="error" sx={{ fontSize: 12 }}>{err}</Alert>}
        <DField label="Name" isDark={isDark} colors={colors}><TextField size="small" fullWidth value={nm} onChange={(e) => setNm(e.target.value)} sx={inputSx} /></DField>
        <DField label="Code" isDark={isDark} colors={colors}><TextField size="small" fullWidth value={cd} onChange={(e) => setCd(e.target.value)} sx={inputSx} /></DField>
        <DField label="Parent Node" isDark={isDark} colors={colors}>
          <Select size="small" fullWidth value={pid} onChange={(e) => setPid(e.target.value)} displayEmpty sx={{ fontSize: 13, borderRadius: "8px" }}>
            <MenuItem value=""><em>None (root)</em></MenuItem>
            {pOpts.map((p) => <MenuItem key={p.id} value={p.id}>{p.label}</MenuItem>)}</Select></DField>
        <DField label="Status" isDark={isDark} colors={colors}>
          <Select size="small" fullWidth value={st} onChange={(e) => setSt(e.target.value)} sx={{ fontSize: 13, borderRadius: "8px" }}>
            {["online","offline","warning","critical"].map((s) => <MenuItem key={s} value={s} sx={{ textTransform: "capitalize" }}>{s}</MenuItem>)}</Select></DField>
        <Box display="flex" gap={1.5}>
          <DField label="Capacity" isDark={isDark} colors={colors}><TextField size="small" fullWidth value={cap} onChange={(e) => setCap(e.target.value)} sx={inputSx} /></DField>
          <DField label="Voltage" isDark={isDark} colors={colors}><TextField size="small" fullWidth value={vol} onChange={(e) => setVol(e.target.value)} sx={inputSx} /></DField>
        </Box>
        <DField label="Description" isDark={isDark} colors={colors}><TextField size="small" fullWidth multiline rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} sx={inputSx} /></DField>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} sx={{ textTransform: "none", fontSize: 12, color: lc }}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving} sx={btnPrimary}>
          {saving ? <CircularProgress size={16} sx={{ color: "#fff" }} /> : "Save"}</Button>
      </DialogActions>
    </Dialog>
  );
}

/* Detail Panel */
function DetailPanel({ node, isDark, colors, navigate, cardBorder, onAssignMeter, onEditNode, onDeleteNode, allNodes }) {
  const hc = isDark ? colors.grey[100] : "#111827", lc = isDark ? colors.grey[300] : "#6B7280";
  const st = NS[node.type] || NS.meter, sc = SC[node.status] || "#64748B";
  const isMeter = node.type === "meter", isHierarchy = !isMeter && node.dbId;
  const bc = useMemo(() => (node.dbId && allNodes?.length) ? buildPath(allNodes, node.dbId) : "", [node, allNodes]);
  const details = [];
  if (isMeter) {
    details.push({ l: "DRN", v: node.drn || node.name }, { l: "Customer", v: node.customerName || "---" },
      { l: "Area", v: node.area || "---" }, { l: "Suburb", v: node.suburb || "---" },
      { l: "City", v: node.city || "---" }, { l: "Region", v: node.region || "---" },
      { l: "Tariff", v: node.tariff || "---" }, { l: "Status", v: node.status, s: true });
    if (node.lat && node.lng) details.push({ l: "Coordinates", v: `${node.lat.toFixed(5)}, ${node.lng.toFixed(5)}` });
  } else {
    details.push({ l: "Name", v: node.name }, { l: "Type", v: TL[node.type] || node.type });
    if (node.code) details.push({ l: "Code", v: node.code });
    if (node.district) details.push({ l: "District", v: node.district });
    if (node.capacityRating) details.push({ l: "Capacity", v: node.capacityRating });
    if (node.voltageLevel) details.push({ l: "Voltage", v: node.voltageLevel });
    if (node.description) details.push({ l: "Description", v: node.description });
    details.push({ l: "Children", v: (node.children || []).length });
    if (node.lat && node.lng) details.push({ l: "Coordinates", v: `${node.lat.toFixed(5)}, ${node.lng.toFixed(5)}` });
    details.push({ l: "Status", v: node.status, s: true });
  }
  return (
    <Box>
      <Box sx={{ px: 2.5, pt: 2.5, pb: 2, borderBottom: cardBorder }}>
        <Box display="flex" alignItems="center" gap={1.5} mb={1}>
          <Box sx={{ width: 36, height: 36, borderRadius: st.shape === "circle" ? "50%" : "8px",
            transform: st.shape === "diamond" ? "rotate(45deg)" : "none", display: "flex", alignItems: "center",
            justifyContent: "center", bgcolor: st.bg, border: `2px solid ${st.color}` }}>
            <Box sx={{ transform: st.shape === "diamond" ? "rotate(-45deg)" : "none", display: "flex" }}>{st.icon}</Box></Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography fontSize="15px" fontWeight={700} color={hc} noWrap sx={{ fontFamily: isMeter ? "monospace" : "inherit" }}>{node.name}</Typography>
            <Typography fontSize="11px" color={lc}>{TL[node.type] || node.type}</Typography></Box>
        </Box>
        {bc && <Typography fontSize="10px" color={lc} sx={{ bgcolor: isDark ? "rgba(30,41,59,0.5)" : "#F3F4F6", px: 1, py: 0.5, borderRadius: "4px", mb: 1 }}>{bc}</Typography>}
        <Chip label={node.status} size="small" sx={{ height: 22, fontSize: 10, fontWeight: 600, textTransform: "capitalize",
          bgcolor: node.status === "online" ? (isDark ? "rgba(16,185,129,0.15)" : "#ECFDF5") : node.status === "offline" ? (isDark ? "rgba(239,68,68,0.15)" : "#FEF2F2") : (isDark ? "rgba(245,158,11,0.15)" : "#FFFBEB"),
          color: sc, border: `1px solid ${sc}` }} />
      </Box>
      <Box sx={{ px: 2.5, py: 2 }}>
        {details.map((d) => (
          <Box key={d.l} display="flex" justifyContent="space-between" alignItems="center" sx={{ py: "6px", borderBottom: cardBorder }}>
            <Typography fontSize="12px" color={lc}>{d.l}</Typography>
            {d.s ? <Box display="flex" alignItems="center" gap={0.5}><FiberManualRecord sx={{ fontSize: 8, color: SC[d.v] || "#64748B" }} />
              <Typography fontSize="12px" fontWeight={600} color={hc} textTransform="capitalize">{d.v}</Typography></Box>
              : <Typography fontSize="12px" fontWeight={600} color={hc} noWrap sx={{ maxWidth: 180, textAlign: "right", fontFamily: d.l === "DRN" ? "monospace" : "inherit" }}>{d.v}</Typography>}
          </Box>))}
      </Box>
      <Box sx={{ px: 2.5, pb: 2.5, display: "flex", flexDirection: "column", gap: 1 }}>
        {isMeter && <>
          <Button fullWidth variant="contained" size="small" startIcon={<OpenInNewOutlined sx={{ fontSize: 14 }} />}
            onClick={() => navigate(`/meter/${node.drn || node.name}`)} sx={{ ...btnPrimary, py: "6px" }}>View Meter Profile</Button>
          <Button fullWidth variant="outlined" size="small" startIcon={<LinkOutlined sx={{ fontSize: 14 }} />}
            onClick={() => onAssignMeter(node.drn || node.name)}
            sx={{ textTransform: "none", fontSize: 12, borderRadius: "8px", borderColor: "#F59E0B", color: "#F59E0B", py: "6px",
              "&:hover": { borderColor: "#D97706", bgcolor: "rgba(245,158,11,0.05)" } }}>Assign to Distribution</Button></>}
        {!isMeter && node.type === "substation" && node.substationId &&
          <Button fullWidth variant="contained" size="small" startIcon={<OpenInNewOutlined sx={{ fontSize: 14 }} />}
            onClick={() => navigate(`/substation/${node.substationId}`)} sx={{ ...btnPrimary, py: "6px" }}>View Substation Profile</Button>}
        {!isMeter && node.type === "distribution" && node.district &&
          <Button fullWidth variant="contained" size="small" startIcon={<OpenInNewOutlined sx={{ fontSize: 14 }} />}
            onClick={() => navigate(`/load-control/area/${encodeURIComponent(node.district)}`)} sx={{ ...btnPrimary, py: "6px" }}>View Distribution Profile</Button>}
        {!isMeter && node.type === "substation" && <Button fullWidth variant="outlined" size="small" startIcon={<LinkOutlined sx={{ fontSize: 14 }} />}
          onClick={() => onAssignMeter(null, "substation", node)} sx={{ textTransform: "none", fontSize: 12, borderRadius: "8px", borderColor: "#3B82F6", color: "#3B82F6", py: "6px",
            "&:hover": { borderColor: "#2563EB", bgcolor: "rgba(37,99,235,0.05)" } }}>Assign Distribution Nodes</Button>}
        {!isMeter && node.type === "distribution" && <Button fullWidth variant="outlined" size="small" startIcon={<LinkOutlined sx={{ fontSize: 14 }} />}
          onClick={() => onAssignMeter(null, "distribution", node)} sx={{ textTransform: "none", fontSize: 12, borderRadius: "8px", borderColor: "#10B981", color: "#10B981", py: "6px",
            "&:hover": { borderColor: "#059669", bgcolor: "rgba(16,185,129,0.05)" } }}>Assign Meter DRNs</Button>}
        {isHierarchy && <Box display="flex" gap={1}>
          <Button fullWidth variant="outlined" size="small" startIcon={<EditOutlined sx={{ fontSize: 14 }} />} onClick={() => onEditNode(node)}
            sx={{ textTransform: "none", fontSize: 12, borderRadius: "8px", borderColor: isDark ? "#475569" : "#D1D5DB", color: hc, py: "6px" }}>Edit</Button>
          <Button fullWidth variant="outlined" size="small" startIcon={<DeleteOutlined sx={{ fontSize: 14 }} />} onClick={() => onDeleteNode(node)}
            sx={{ textTransform: "none", fontSize: 12, borderRadius: "8px", borderColor: "#EF4444", color: "#EF4444", py: "6px",
              "&:hover": { borderColor: "#DC2626", bgcolor: "rgba(239,68,68,0.05)" } }}>Delete</Button></Box>}
        {node.children?.length > 0 && <Box sx={{ mt: 1, p: 1.5, borderRadius: "8px", bgcolor: isDark ? "rgba(30,41,59,0.5)" : "#F9FAFB", border: cardBorder }}>
          <Typography fontSize="10px" fontWeight={700} color={lc} textTransform="uppercase" letterSpacing="0.5px" mb={0.75}>Children Summary</Typography>
          {(() => { const c = {}; node.children.forEach((ch) => { c[ch.type] = (c[ch.type] || 0) + 1; });
            return Object.entries(c).map(([t, n]) => <Box key={t} display="flex" justifyContent="space-between" sx={{ py: "3px" }}>
              <Typography fontSize="11px" color={lc}>{TL[t] || t}</Typography><Typography fontSize="11px" fontWeight={600} color={hc}>{n}</Typography></Box>); })()}
          {(() => { const on = node.children.filter((c) => c.status === "online").length, off = node.children.length - on;
            return <Box display="flex" gap={1} mt={0.5}>
              <Chip label={`${on} online`} size="small" sx={{ height: 18, fontSize: 9, bgcolor: isDark ? "rgba(16,185,129,0.12)" : "#ECFDF5", color: "#10B981", "& .MuiChip-label": { px: "5px" } }} />
              {off > 0 && <Chip label={`${off} offline`} size="small" sx={{ height: 18, fontSize: 9, bgcolor: isDark ? "rgba(239,68,68,0.12)" : "#FEF2F2", color: "#EF4444", "& .MuiChip-label": { px: "5px" } }} />}
            </Box>; })()}
        </Box>}
      </Box>
    </Box>
  );
}

/* ================================================================ MAIN ================================================================ */
export default function GridTopology() {
  const navigate = useNavigate(), theme = useTheme(), colors = tokens(theme.palette.mode), isDark = theme.palette.mode === "dark";
  const [loading, setLoading] = useState(true), [topologyData, setTopologyData] = useState(null), [tree, setTree] = useState(null);
  const [expanded, setExpanded] = useState(new Set(["main"])), [selectedNode, setSelectedNode] = useState(null);
  const [search, setSearch] = useState(""), [statusFilter, setStatusFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false), [assignOpen, setAssignOpen] = useState(false), [assignDrn, setAssignDrn] = useState("");
  const [assignMode, setAssignMode] = useState("meter"); // "meter" = assign meter to dist, "substation" = assign dist to sub, "distribution" = assign meters to dist
  const [assignParentNode, setAssignParentNode] = useState(null);
  const [editOpen, setEditOpen] = useState(false), [editNode, setEditNode] = useState(null);
  const cardBg = isDark ? colors.primary[400] : "#FFFFFF", cardBorder = `1px solid ${isDark ? "#1E293B" : "#E5E7EB"}`;
  const hc = isDark ? colors.grey[100] : "#111827", lc = isDark ? colors.grey[300] : "#6B7280";
  const token = sessionStorage.getItem("token");

  const fetchTopology = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch("/cb/loadcontrol/grid-topology", { headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json(); if (j.success && j.data) { setTopologyData(j.data); setTree(buildTopologyTree(j.data)); }
    } catch (e) { console.error("Topology fetch error:", e); } setLoading(false);
  }, [token]);
  useEffect(() => { fetchTopology(); }, [fetchTopology]);

  const toggleExpand = useCallback((id) => setExpanded((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; }), []);
  const expandAll = useCallback(() => { if (!tree) return; const a = new Set(); const c = (n) => { a.add(n.id); (n.children || []).forEach(c); }; c(tree); setExpanded(a); }, [tree]);
  const collapseAll = useCallback(() => setExpanded(new Set(["main"])), []);
  const stats = topologyData?.stats || {};
  const activeEvents = useMemo(() => tree ? flattenTree(tree).filter((n) => n.status === "warning" || n.status === "critical").length : 0, [tree]);
  const filterQuery = useMemo(() => search.toLowerCase().trim() || null, [search]);
  const filteredTree = useMemo(() => {
    if (!tree) return null; if (statusFilter === "all" && !filterQuery) return tree;
    const fn = (node) => { const fc = (node.children || []).map(fn).filter(Boolean);
      const sm = statusFilter === "all" || node.status === statusFilter;
      const qm = !filterQuery || [(node.name||""), (node.customerName||""), (node.drn||""), (node.area||"")].some((v) => v.toLowerCase().includes(filterQuery));
      return (sm && qm) || fc.length > 0 ? { ...node, children: fc } : null; };
    return fn(tree);
  }, [tree, statusFilter, filterQuery]);

  const handleAssign = useCallback((drn, mode, parentNode) => {
    setAssignDrn(drn || "");
    setAssignMode(mode || "meter");
    setAssignParentNode(parentNode || null);
    setAssignOpen(true);
  }, []);
  const handleEdit = useCallback((n) => { setEditNode(n); setEditOpen(true); }, []);
  const handleDelete = useCallback(async (n) => { if (!n.dbId || !window.confirm(`Delete "${n.name}"? Children will be re-parented.`)) return;
    try { const r = await fetch(`/cb/loadcontrol/grid-topology/nodes/${n.dbId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json(); if (j.success) { setSelectedNode(null); fetchTopology(); } } catch (e) { console.error(e); }
  }, [token, fetchTopology]);
  const allNodes = topologyData?.nodes || [];

  if (loading) return <Box display="flex" justifyContent="center" alignItems="center" height="80vh"><CircularProgress sx={{ color: "#2563EB" }} /></Box>;

  const dc = [
    { l: "Total Meters", v: stats.totalMeters || 0, i: <ElectricMeterOutlined sx={{ fontSize: 20 }} />, c: "#2563EB", b: isDark ? "rgba(37,99,235,0.1)" : "#EFF6FF" },
    { l: "Online", v: stats.onlineMeters || 0, i: <WifiOutlined sx={{ fontSize: 20 }} />, c: "#10B981", b: isDark ? "rgba(16,185,129,0.1)" : "#ECFDF5" },
    { l: "Offline", v: stats.offlineMeters || 0, i: <WifiOffOutlined sx={{ fontSize: 20 }} />, c: "#EF4444", b: isDark ? "rgba(239,68,68,0.1)" : "#FEF2F2" },
    { l: "Substations", v: stats.totalSubstations || 0, i: <AccountTreeOutlined sx={{ fontSize: 20 }} />, c: "#3B82F6", b: isDark ? "rgba(59,130,246,0.1)" : "#EFF6FF" },
    { l: "Distribution Nodes", v: stats.totalDistribution || 0, i: <DeviceHubOutlined sx={{ fontSize: 20 }} />, c: "#F59E0B", b: isDark ? "rgba(245,158,11,0.1)" : "#FFFBEB" },
    { l: "Transformers", v: stats.totalTransformers || 0, i: <TransformOutlined sx={{ fontSize: 20 }} />, c: "#EA580C", b: isDark ? "rgba(234,88,12,0.1)" : "#FFF7ED" },
    { l: "Tampered", v: stats.tamperCount || 0, i: <ErrorOutlined sx={{ fontSize: 20 }} />, c: stats.tamperCount > 0 ? "#DC2626" : "#64748B", b: stats.tamperCount > 0 ? (isDark ? "rgba(220,38,38,0.1)" : "#FEF2F2") : (isDark ? "rgba(100,116,139,0.1)" : "#F3F4F6") },
    { l: "Critical Alerts", v: stats.criticalAlerts || 0, i: <ErrorOutlined sx={{ fontSize: 20 }} />, c: stats.criticalAlerts > 0 ? "#DC2626" : "#64748B", b: stats.criticalAlerts > 0 ? (isDark ? "rgba(220,38,38,0.1)" : "#FEF2F2") : (isDark ? "rgba(100,116,139,0.1)" : "#F3F4F6") },
    { l: "Warning Alerts", v: stats.warningAlerts || 0, i: <WarningAmberOutlined sx={{ fontSize: 20 }} />, c: stats.warningAlerts > 0 ? "#F59E0B" : "#64748B", b: stats.warningAlerts > 0 ? (isDark ? "rgba(245,158,11,0.1)" : "#FFFBEB") : (isDark ? "rgba(100,116,139,0.1)" : "#F3F4F6") },
    { l: "Active Events", v: activeEvents, i: <WarningAmberOutlined sx={{ fontSize: 20 }} />, c: activeEvents > 0 ? "#F59E0B" : "#64748B", b: activeEvents > 0 ? (isDark ? "rgba(245,158,11,0.1)" : "#FFFBEB") : (isDark ? "rgba(100,116,139,0.1)" : "#F3F4F6") },
  ];

  return (
    <Box sx={{ bgcolor: isDark ? colors.primary[500] : "#F9FAFB", minHeight: "calc(100vh - 70px)" }}>
      {/* HEADER */}
      <Box sx={{ px: 3, pt: 3, pb: 1, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Box display="flex" alignItems="center" gap={2}>
          <IconButton onClick={() => navigate("/load-control")} sx={{ color: lc, border: cardBorder, borderRadius: "10px", width: 36, height: 36, mr: 1.5 }}>
            <ArrowBackOutlined sx={{ fontSize: 18 }} /></IconButton>
          <Box><Typography variant="h4" fontWeight={700} color={hc}>Grid Topology</Typography>
            <Typography variant="body2" color={lc} mt={0.25}>Network View &mdash; Distribution management</Typography></Box>
        </Box>
        <Box display="flex" gap={1} alignItems="center">
          <TextField size="small" placeholder="Search DRN, name, area..." value={search} onChange={(e) => setSearch(e.target.value)}
            sx={{ width: 280, "& .MuiOutlinedInput-root": { bgcolor: cardBg, borderRadius: "8px", height: 36, fontSize: 13, border: cardBorder, "& fieldset": { border: "none" } } }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchOutlined sx={{ fontSize: 18, color: lc }} /></InputAdornment> }} />
          <Button variant="contained" size="small" startIcon={<AddOutlined sx={{ fontSize: 16 }} />} onClick={() => setAddOpen(true)}
            sx={{ ...btnPrimary, height: 36, whiteSpace: "nowrap" }}>Add Distribution</Button>
          <IconButton size="small" onClick={fetchTopology} sx={{ color: lc, border: cardBorder, borderRadius: "8px", width: 36, height: 36 }}>
            <RefreshOutlined sx={{ fontSize: 18 }} /></IconButton>
        </Box>
      </Box>

      {/* DASHBOARD 2x5 */}
      <Box sx={{ px: 3, py: 2 }}><Box sx={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 2 }}>
        {dc.map((s) => <Box key={s.l} sx={{ bgcolor: cardBg, border: cardBorder, borderRadius: "12px", p: "14px 18px", display: "flex", alignItems: "center", gap: 1.5 }}>
          <Box sx={{ width: 38, height: 38, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: s.b, color: s.c }}>{s.i}</Box>
          <Box><Typography variant="h5" fontWeight={700} color={hc}>{s.v}</Typography><Typography variant="caption" color={lc} fontSize="11px">{s.l}</Typography></Box>
        </Box>)}
      </Box></Box>

      {/* FILTER BAR */}
      <Box sx={{ px: 3, pb: 1.5, display: "flex", gap: 1.5, alignItems: "center" }}>
        <FormControl size="small"><Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          sx={{ height: 32, fontSize: 12, borderRadius: "8px", bgcolor: cardBg, border: cardBorder, "& fieldset": { border: "none" }, minWidth: 130 }}>
          {["all","online","offline","warning","critical"].map((v) => <MenuItem key={v} value={v} sx={{ textTransform: "capitalize" }}>{v === "all" ? "All Status" : v}</MenuItem>)}
        </Select></FormControl>
        <Box sx={{ ml: "auto", display: "flex", gap: 1 }}>
          {[["Expand All", expandAll], ["Collapse All", collapseAll]].map(([l, fn]) =>
            <Button key={l} size="small" onClick={fn} sx={{ textTransform: "none", fontSize: 11, color: lc, borderRadius: "6px", "&:hover": { bgcolor: isDark ? "rgba(37,99,235,0.08)" : "#EFF6FF" } }}>{l}</Button>)}
        </Box>
      </Box>

      {/* TREE + DETAIL */}
      <Box sx={{ px: 3, pb: 4, display: "flex", gap: 2 }}>
        <Box sx={{ flex: 1, bgcolor: cardBg, border: cardBorder, borderRadius: "12px", minHeight: 500, maxHeight: "calc(100vh - 420px)",
          overflowY: "auto", py: 1, "&::-webkit-scrollbar": { width: 5 }, "&::-webkit-scrollbar-thumb": { bgcolor: isDark ? "#374151" : "#D1D5DB", borderRadius: 4 } }}>
          {filteredTree ? <TreeNode node={filteredTree} depth={0} expanded={expanded} toggleExpand={toggleExpand}
            selectedNode={selectedNode} setSelectedNode={setSelectedNode} isDark={isDark} colors={colors} filter={filterQuery} />
            : <Box display="flex" justifyContent="center" alignItems="center" height={400}><Typography color={lc} fontSize="13px">No nodes match the current filter</Typography></Box>}
        </Box>
        <Box sx={{ width: 340, flexShrink: 0, bgcolor: cardBg, border: cardBorder, borderRadius: "12px", minHeight: 500, maxHeight: "calc(100vh - 420px)",
          overflowY: "auto", "&::-webkit-scrollbar": { width: 5 }, "&::-webkit-scrollbar-thumb": { bgcolor: isDark ? "#374151" : "#D1D5DB", borderRadius: 4 } }}>
          {selectedNode ? <DetailPanel node={selectedNode} isDark={isDark} colors={colors} navigate={navigate} cardBorder={cardBorder}
            onAssignMeter={handleAssign} onEditNode={handleEdit} onDeleteNode={handleDelete} allNodes={allNodes} />
            : <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" height="100%" minHeight={400} px={3}>
              <AccountTreeOutlined sx={{ fontSize: 48, color: isDark ? colors.grey[500] : "#D1D5DB", mb: 1.5 }} />
              <Typography fontSize="13px" fontWeight={600} color={hc} mb={0.5}>Select a Node</Typography>
              <Typography fontSize="12px" color={lc} textAlign="center">Click on any node in the tree to view its details</Typography></Box>}
        </Box>
      </Box>

      {/* LEGEND */}
      <Box sx={{ px: 3, pb: 3 }}><Box sx={{ bgcolor: cardBg, border: cardBorder, borderRadius: "12px", px: 3, py: 2, display: "flex", gap: 3, flexWrap: "wrap", alignItems: "center" }}>
        <Typography fontSize="11px" fontWeight={700} color={lc} textTransform="uppercase" letterSpacing="0.5px">Legend</Typography>
        {[["Main Station","#2563EB"],["Substation","#3B82F6"],["Feeder","#14B8A6"],["Distribution","#F59E0B"],["Transformer","#EA580C"],["Meter","#10B981"]].map(([l, c]) =>
          <Box key={l} display="flex" alignItems="center" gap={0.75}><Box sx={{ width: 10, height: 10, borderRadius: "2px", bgcolor: c }} /><Typography fontSize="11px" color={lc}>{l}</Typography></Box>)}
        <Box sx={{ borderLeft: `1px solid ${isDark ? "#1E293B" : "#E5E7EB"}`, pl: 2, ml: 1 }}>
          {[["Online","#10B981"],["Offline","#EF4444"],["Warning","#F59E0B"],["Critical","#DC2626"]].map(([l, c]) =>
            <Box key={l} display="inline-flex" alignItems="center" gap={0.5} mr={2}><FiberManualRecord sx={{ fontSize: 8, color: c }} /><Typography fontSize="11px" color={lc}>{l}</Typography></Box>)}
        </Box>
      </Box></Box>

      {/* DIALOGS */}
      <AddDlg open={addOpen} onClose={() => setAddOpen(false)} onCreated={() => fetchTopology()} allNodes={allNodes} isDark={isDark} colors={colors} token={token} />
      <AssignDlg open={assignOpen} onClose={() => setAssignOpen(false)} onAssigned={() => fetchTopology()} meterDrn={assignDrn} assignMode={assignMode} parentNode={assignParentNode} allNodes={allNodes} tree={tree} isDark={isDark} colors={colors} token={token} allMeters={topologyData?.meters || []} />
      <EditDlg open={editOpen} onClose={() => setEditOpen(false)} onUpdated={() => fetchTopology()} node={editNode} allNodes={allNodes} isDark={isDark} colors={colors} token={token} />
    </Box>
  );
}
