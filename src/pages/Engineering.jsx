import { useState, useEffect, useMemo, useCallback } from "react";
import { Box, Typography, TextField, Button, Chip, Checkbox, InputAdornment, CircularProgress, IconButton, Tooltip, useTheme } from "@mui/material";
import { BuildOutlined, CheckCircleOutlined, WarningAmber, SearchOutlined, ContentCopyOutlined, PowerSettingsNewOutlined, DeleteSweepOutlined, BugReportOutlined, ElectricalServicesOutlined, SendOutlined, CheckBoxOutlined, CheckBoxOutlineBlankOutlined, FiberManualRecordOutlined } from "@mui/icons-material";
import { tokens } from "../theme";
import Header from "../components/Header";
import { groupControlAPI, energyAnalyticsAPI } from "../services/api";
import { getSubstationMarkers } from "../components/EnergyAnalytics";

// ---- Constants ----------------------------------------------------------------

const TOKEN_TYPES = [
  { value: "max_power_limit", label: "Set Max Power Limit", description: "Limit maximum power draw", unit: "Watts", defaultValue: "5000", subclass: 0, icon: PowerSettingsNewOutlined },
  { value: "clear_credit", label: "Clear Credit", description: "Clear all credit registers", unit: "", defaultValue: "65535", subclass: 1, icon: DeleteSweepOutlined },
  { value: "clear_tamper", label: "Clear Tamper", description: "Clear tamper condition flag", unit: "", defaultValue: "0", subclass: 5, icon: BugReportOutlined },
  { value: "max_phase_limit", label: "Set Max Phase Power Unbalance", description: "Set phase power unbalance limit", unit: "Watts", defaultValue: "4400", subclass: 6, icon: ElectricalServicesOutlined },
];

// ---- Helpers ----------------------------------------------------------------

function formatToken(t) {
  return (t || "").replace(/(.{4})/g, "$1 ").trim();
}

function isOnline(m) {
  return m.Status === "1" || m.Status === 1 || m.Status === "Active";
}

// ---- Main Component ---------------------------------------------------------

export default function Engineering() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const isDark = theme.palette.mode === "dark";

  const cardBg = isDark ? colors.primary[400] : "#FFFFFF";
  const cardBorder = "1px solid " + (isDark ? "#1E293B" : "#E5E7EB");
  const sidebarBg = isDark ? colors.primary[400] : "#FFFFFF";

  // HSM connection status
  const [hsmStatus, setHsmStatus] = useState(null);

  useEffect(() => {
    const fetchHsmStatus = () => {
      const token = sessionStorage.getItem("token");
      if (!token) return;
      fetch("/cb/vending/prismvend-check", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((r) => { if (r.success) setHsmStatus(r.data); })
        .catch(() => {});
    };
    fetchHsmStatus();
    const interval = setInterval(fetchHsmStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  const hsmOffline = hsmStatus?.connected !== true;

  // Data
  const [allMeters, setAllMeters] = useState([]);
  const [groups, setGroups] = useState([]);
  const [substations, setSubstations] = useState([]);
  const [loading, setLoading] = useState(true);

  // Selection
  const [selectedTargets, setSelectedTargets] = useState(new Set());
  const [meterSearch, setMeterSearch] = useState("");

  // Token config
  const [tokenType, setTokenType] = useState("clear_credit");
  const [tokenValue, setTokenValue] = useState("");
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState([]);

  // Fetch data on mount
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [metersRes, groupsRes, subRes] = await Promise.allSettled([
        groupControlAPI.getMetersState(),
        groupControlAPI.getGroups(),
        energyAnalyticsAPI.getSubstationConfig(),
      ]);
      if (metersRes.status === "fulfilled") {
        const d = metersRes.value?.data || metersRes.value || [];
        setAllMeters(Array.isArray(d) ? d : []);
      }
      if (groupsRes.status === "fulfilled") {
        const d = groupsRes.value?.data || groupsRes.value || [];
        setGroups(Array.isArray(d) ? d : []);
      }
      if (subRes.status === "fulfilled") {
        const d = subRes.value?.data || subRes.value || [];
        if (Array.isArray(d) && d.length > 0) setSubstations(getSubstationMarkers(d, []));
      }
    } catch (err) {
      console.error("Engineering fetch error:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Derived: areas
  const areas = useMemo(() => {
    const areaMap = {};
    allMeters.forEach(m => {
      const area = m.LocationName || m.Suburb || m.City || "Unknown";
      if (!areaMap[area]) areaMap[area] = { name: area, count: 0, drns: [] };
      areaMap[area].count++;
      areaMap[area].drns.push(m.DRN);
    });
    return Object.values(areaMap).sort((a, b) => b.count - a.count);
  }, [allMeters]);

  // Derived: substations with nearby meters
  const substationList = useMemo(() => {
    return substations.map(sub => {
      const nearby = [];
      allMeters.forEach(m => {
        const lat = parseFloat(m.Lat);
        const lng = parseFloat(m.Longitude);
        if (!isNaN(lat) && !isNaN(lng)) {
          const dist = Math.sqrt(Math.pow(lat - sub.lat, 2) + Math.pow(lng - sub.lng, 2));
          if (dist < 0.05) nearby.push(m.DRN);
        }
      });
      return { ...sub, drns: nearby, count: nearby.length };
    }).filter(s => s.count > 0).sort((a, b) => b.count - a.count);
  }, [substations, allMeters]);

  // Filtered meters for search
  const filteredMeters = useMemo(() => {
    if (!meterSearch) return allMeters;
    const q = meterSearch.toLowerCase();
    return allMeters.filter(m =>
      (m.DRN || "").toLowerCase().includes(q) ||
      (m.customerName || "").toLowerCase().includes(q) ||
      (m.LocationName || "").toLowerCase().includes(q)
    );
  }, [allMeters, meterSearch]);

  // Selection helpers
  const toggleMeter = (drn) => setSelectedTargets(prev => { const n = new Set(prev); n.has(drn) ? n.delete(drn) : n.add(drn); return n; });
  const toggleAll = () => setSelectedTargets(selectedTargets.size === allMeters.length ? new Set() : new Set(allMeters.map(m => m.DRN)));
  const toggleDrns = (drns) => {
    const allSel = drns.every(d => selectedTargets.has(d));
    setSelectedTargets(prev => { const n = new Set(prev); drns.forEach(d => allSel ? n.delete(d) : n.add(d)); return n; });
  };
  const toggleGroup = (g) => toggleDrns((g.members || g.meters || []).map(m => m.DRN || m.meter_drn || m));
  const toggleArea = (a) => toggleDrns(a.drns);
  const toggleSubstation = (s) => toggleDrns(s.drns);

  // Current token type config
  const currentType = TOKEN_TYPES.find(t => t.value === tokenType) || TOKEN_TYPES[0];

  // Set default value when token type changes
  useEffect(() => {
    const tt = TOKEN_TYPES.find(t => t.value === tokenType);
    if (tt) setTokenValue(tt.defaultValue);
  }, [tokenType]);

  // Send engineering tokens
  const handleSend = async () => {
    if (selectedTargets.size === 0 || hsmOffline) return;
    setSending(true);
    setResults([]);
    const authToken = sessionStorage.getItem("token");
    const resultsList = [];

    for (const drn of selectedTargets) {
      try {
        const res = await fetch("/cb/vending/vend-engineering", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({
            meterId: drn,
            subclass: currentType.subclass,
            supp: parseInt(tokenValue) || 0,
          }),
        });
        const data = await res.json();
        resultsList.push({
          drn,
          success: data.success,
          token: data.data?.tokenDec || data.data?.token || null,
          error: data.error || null,
          description: data.data?.description || null,
        });
      } catch (e) {
        resultsList.push({ drn, success: false, error: e.message });
      }
    }
    setResults(resultsList);
    setSending(false);
  };

  const handleCopyToken = (tok) => {
    navigator.clipboard.writeText(formatToken(tok));
  };

  // Shared styles
  const sectionTitle = { fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: isDark ? colors.grey[300] : "#6B7280", mb: "6px", px: "4px" };
  const listItemBase = { display: "flex", alignItems: "center", gap: "6px", px: "8px", py: "5px", borderRadius: "4px", cursor: "pointer", transition: "background 0.15s", fontSize: "12px" };

  return (
    <Box m="20px">
      <Header title="ENGINEERING TOKENS" subtitle="Generate Specialized STS Tokens" />

      {/* HSM Status Banner */}
      {hsmStatus && hsmStatus.connected === true && (
        <Box display="flex" alignItems="center" gap="8px" mb="12px" px="10px" py="6px"
          sx={{ backgroundColor: "rgba(16,185,129,0.08)", borderRadius: "6px", border: "1px solid rgba(16,185,129,0.25)" }}>
          <CheckCircleOutlined sx={{ color: "#10B981", fontSize: 20 }} />
          <Chip label="HSM Connected" size="small" sx={{ backgroundColor: "rgba(16,185,129,0.12)", color: "#10B981", fontWeight: 600, fontSize: "0.75rem" }} />
          {hsmStatus.txCreditsRemaining != null && (
            <Typography variant="caption" color={isDark ? colors.grey[300] : "#6B7280"}>
              TX Credits: <strong style={{ color: "#10B981" }}>{hsmStatus.txCreditsRemaining.toLocaleString()}</strong>
            </Typography>
          )}
        </Box>
      )}
      {hsmStatus && hsmStatus.connected !== true && (
        <Box display="flex" alignItems="center" gap="8px" mb="12px" px="12px" py="10px"
          sx={{ backgroundColor: "rgba(239,68,68,0.08)", borderRadius: "6px", border: "1px solid rgba(239,68,68,0.25)" }}>
          <WarningAmber sx={{ color: "#EF4444", fontSize: 22 }} />
          <Typography variant="body2" sx={{ color: "#EF4444", fontWeight: 600 }}>HSM Not Connected</Typography>
          <Typography variant="caption" color={isDark ? colors.grey[300] : "#6B7280"} sx={{ ml: 1 }}>
            Engineering token generation is disabled until the HSM connection is established.
          </Typography>
        </Box>
      )}

      {/* Main layout: left content + right sidebar */}
      <Box display="flex" gap="16px" alignItems="flex-start">

        {/* LEFT — Token Configuration */}
        <Box flex={1} minWidth={0}>

          {/* Token Type Cards */}
          <Box sx={{ background: cardBg, border: cardBorder, borderRadius: "8px", p: "20px", mb: "16px" }}>
            <Typography sx={{ ...sectionTitle, mb: "12px" }}>Token Type</Typography>
            <Box display="grid" gridTemplateColumns="1fr 1fr" gap="10px">
              {TOKEN_TYPES.map(tt => {
                const Icon = tt.icon;
                const selected = tokenType === tt.value;
                return (
                  <Box key={tt.value} onClick={() => setTokenType(tt.value)}
                    sx={{
                      p: "14px", borderRadius: "8px", cursor: "pointer", transition: "all 0.15s",
                      border: selected ? "2px solid #2563EB" : cardBorder,
                      background: selected ? (isDark ? "rgba(37,99,235,0.1)" : "#EFF6FF") : (isDark ? "rgba(255,255,255,0.02)" : "#F9FAFB"),
                      "&:hover": { borderColor: "#2563EB", background: isDark ? "rgba(37,99,235,0.06)" : "#F0F7FF" },
                    }}>
                    <Box display="flex" alignItems="center" gap="10px" mb="4px">
                      <Icon sx={{ fontSize: 20, color: selected ? "#2563EB" : (isDark ? colors.grey[300] : "#6B7280") }} />
                      <Typography sx={{ fontSize: "13px", fontWeight: 600, color: selected ? "#2563EB" : (isDark ? colors.grey[100] : "#1F2937") }}>
                        {tt.label}
                      </Typography>
                    </Box>
                    <Typography sx={{ fontSize: "11px", color: isDark ? colors.grey[400] : "#9CA3AF", ml: "30px" }}>
                      {tt.description}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          </Box>

          {/* Value input + Send */}
          <Box sx={{ background: cardBg, border: cardBorder, borderRadius: "8px", p: "20px", mb: "16px" }}>
            <Typography sx={{ ...sectionTitle, mb: "12px" }}>Configuration</Typography>

            {currentType.unit && (
              <TextField
                fullWidth size="small" label={`Value (${currentType.unit})`}
                value={tokenValue}
                onChange={(e) => setTokenValue(e.target.value)}
                type="number"
                InputProps={{
                  endAdornment: currentType.unit ? <InputAdornment position="end"><Typography sx={{ fontSize: "12px", color: isDark ? colors.grey[400] : "#9CA3AF" }}>{currentType.unit}</Typography></InputAdornment> : null,
                }}
                sx={{
                  mb: "16px",
                  "& .MuiOutlinedInput-root": {
                    color: isDark ? colors.grey[100] : "#1F2937",
                    backgroundColor: isDark ? "rgba(0,0,0,0.2)" : "#F9FAFB",
                    "& fieldset": { borderColor: isDark ? "#334155" : "#D1D5DB" },
                    "&:hover fieldset": { borderColor: "#2563EB" },
                    "&.Mui-focused fieldset": { borderColor: "#2563EB" },
                  },
                  "& .MuiInputLabel-root": { color: isDark ? colors.grey[300] : "#6B7280" },
                  "& .MuiInputLabel-root.Mui-focused": { color: "#2563EB" },
                }}
              />
            )}

            <Box display="flex" alignItems="center" gap="12px" mb="8px">
              <Button
                variant="contained" onClick={handleSend}
                disabled={selectedTargets.size === 0 || hsmOffline || sending}
                startIcon={sending ? <CircularProgress size={16} sx={{ color: "#fff" }} /> : <SendOutlined />}
                sx={{
                  flex: 1, py: "10px", fontWeight: 600, textTransform: "none", fontSize: "13px",
                  backgroundColor: "#2563EB", color: "#fff",
                  "&:hover": { backgroundColor: "#1D4ED8" },
                  "&.Mui-disabled": { backgroundColor: isDark ? colors.primary[300] : "#E5E7EB", color: isDark ? colors.grey[400] : "#9CA3AF" },
                }}
              >
                {sending ? "Sending..." : `Send to Selected (${selectedTargets.size})`}
              </Button>
            </Box>

            {selectedTargets.size === 0 && (
              <Typography sx={{ fontSize: "11px", color: isDark ? colors.grey[400] : "#9CA3AF", mt: "4px" }}>
                Select meters, groups, or areas from the sidebar to enable sending.
              </Typography>
            )}
          </Box>

          {/* Results */}
          {results.length > 0 && (
            <Box sx={{ background: cardBg, border: cardBorder, borderRadius: "8px", p: "20px" }}>
              <Typography sx={{ ...sectionTitle, mb: "10px" }}>
                Results ({results.filter(r => r.success).length}/{results.length} successful)
              </Typography>
              <Box sx={{ maxHeight: "400px", overflowY: "auto" }}>
                {results.map((r, i) => (
                  <Box key={i} sx={{
                    display: "flex", alignItems: "center", gap: "10px", py: "8px", px: "10px",
                    borderBottom: i < results.length - 1 ? (isDark ? "1px solid #1E293B" : "1px solid #F3F4F6") : "none",
                  }}>
                    <Box sx={{
                      width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                      backgroundColor: r.success ? "#10B981" : "#EF4444",
                    }} />
                    <Typography sx={{ fontSize: "12px", fontWeight: 600, color: isDark ? colors.grey[100] : "#1F2937", minWidth: "120px" }}>
                      {r.drn}
                    </Typography>
                    {r.success && r.token ? (
                      <Box display="flex" alignItems="center" gap="4px" flex={1} minWidth={0}>
                        <Typography sx={{
                          fontSize: "12px", fontFamily: '"Courier New", monospace', fontWeight: 600,
                          color: "#10B981", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {formatToken(r.token)}
                        </Typography>
                        <Tooltip title="Copy token">
                          <IconButton size="small" onClick={() => handleCopyToken(r.token)}
                            sx={{ color: isDark ? colors.grey[300] : "#6B7280", p: "2px" }}>
                            <ContentCopyOutlined sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    ) : r.success ? (
                      <Typography sx={{ fontSize: "12px", color: "#10B981" }}>
                        {r.description || "Success"}
                      </Typography>
                    ) : (
                      <Typography sx={{ fontSize: "12px", color: "#EF4444", flex: 1 }}>
                        {r.error || "Failed"}
                      </Typography>
                    )}
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </Box>

        {/* RIGHT SIDEBAR — Target Selector */}
        <Box sx={{ width: "280px", flexShrink: 0 }}>

          {/* Selected count */}
          {selectedTargets.size > 0 && (
            <Box sx={{
              background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.2)", borderRadius: "8px",
              px: "12px", py: "8px", mb: "10px", display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <Typography sx={{ fontSize: "12px", fontWeight: 600, color: "#2563EB" }}>
                {selectedTargets.size} meter{selectedTargets.size !== 1 ? "s" : ""} selected
              </Typography>
              <Typography onClick={() => setSelectedTargets(new Set())}
                sx={{ fontSize: "11px", color: "#2563EB", cursor: "pointer", "&:hover": { textDecoration: "underline" } }}>
                Clear
              </Typography>
            </Box>
          )}

          {loading && (
            <Box display="flex" justifyContent="center" py="30px">
              <CircularProgress size={24} sx={{ color: "#2563EB" }} />
            </Box>
          )}

          {!loading && (
            <Box display="flex" flexDirection="column" gap="10px">

              {/* METERS */}
              <Box sx={{ background: sidebarBg, border: cardBorder, borderRadius: "8px", overflow: "hidden" }}>
                <Box sx={{ px: "12px", pt: "10px", pb: "6px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <Box display="flex" alignItems="center" gap="6px">
                    <Typography sx={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: isDark ? colors.grey[300] : "#6B7280" }}>
                      Meters
                    </Typography>
                    <Chip label={allMeters.length} size="small" sx={{ height: 18, fontSize: "10px", fontWeight: 700, backgroundColor: isDark ? "#1E293B" : "#F3F4F6", color: isDark ? colors.grey[300] : "#6B7280" }} />
                  </Box>
                  <Typography onClick={toggleAll}
                    sx={{ fontSize: "10px", color: "#2563EB", cursor: "pointer", fontWeight: 600, "&:hover": { textDecoration: "underline" } }}>
                    {selectedTargets.size === allMeters.length ? "Deselect All" : "Select All"}
                  </Typography>
                </Box>

                <Box sx={{ px: "8px", pb: "6px" }}>
                  <TextField
                    fullWidth size="small" placeholder="Search meters..."
                    value={meterSearch} onChange={(e) => setMeterSearch(e.target.value)}
                    InputProps={{
                      startAdornment: <InputAdornment position="start"><SearchOutlined sx={{ fontSize: 16, color: isDark ? colors.grey[400] : "#9CA3AF" }} /></InputAdornment>,
                    }}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        height: "30px", fontSize: "11px",
                        color: isDark ? colors.grey[100] : "#1F2937",
                        backgroundColor: isDark ? "rgba(0,0,0,0.2)" : "#F9FAFB",
                        "& fieldset": { borderColor: isDark ? "#334155" : "#E5E7EB" },
                        "&:hover fieldset": { borderColor: "#2563EB" },
                        "&.Mui-focused fieldset": { borderColor: "#2563EB" },
                      },
                    }}
                  />
                </Box>

                <Box sx={{ maxHeight: "220px", overflowY: "auto", px: "4px", pb: "6px" }}>
                  {filteredMeters.map(m => {
                    const sel = selectedTargets.has(m.DRN);
                    const online = isOnline(m);
                    return (
                      <Box key={m.DRN} onClick={() => toggleMeter(m.DRN)}
                        sx={{
                          ...listItemBase,
                          background: sel ? (isDark ? "rgba(37,99,235,0.12)" : "#EFF6FF") : "transparent",
                          "&:hover": { background: sel ? (isDark ? "rgba(37,99,235,0.18)" : "#DBEAFE") : (isDark ? "rgba(255,255,255,0.03)" : "#F9FAFB") },
                        }}>
                        <Checkbox size="small" checked={sel} sx={{ p: 0, "& .MuiSvgIcon-root": { fontSize: 16 }, color: isDark ? colors.grey[400] : "#D1D5DB", "&.Mui-checked": { color: "#2563EB" } }} />
                        <FiberManualRecordOutlined sx={{ fontSize: 8, color: online ? "#10B981" : "#EF4444" }} />
                        <Box flex={1} minWidth={0}>
                          <Typography sx={{ fontSize: "11px", fontWeight: 600, color: isDark ? colors.grey[100] : "#1F2937", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {m.DRN}
                          </Typography>
                          {m.customerName && (
                            <Typography sx={{ fontSize: "10px", color: isDark ? colors.grey[400] : "#9CA3AF", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {m.customerName}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    );
                  })}
                  {filteredMeters.length === 0 && (
                    <Typography sx={{ fontSize: "11px", color: isDark ? colors.grey[400] : "#9CA3AF", textAlign: "center", py: "12px" }}>
                      {meterSearch ? "No meters match search" : "No meters available"}
                    </Typography>
                  )}
                </Box>
              </Box>

              {/* GROUPS */}
              {groups.length > 0 && (
                <Box sx={{ background: sidebarBg, border: cardBorder, borderRadius: "8px", overflow: "hidden" }}>
                  <Box sx={{ px: "12px", pt: "10px", pb: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Typography sx={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: isDark ? colors.grey[300] : "#6B7280" }}>
                      Groups
                    </Typography>
                    <Chip label={groups.length} size="small" sx={{ height: 18, fontSize: "10px", fontWeight: 700, backgroundColor: isDark ? "#1E293B" : "#F3F4F6", color: isDark ? colors.grey[300] : "#6B7280" }} />
                  </Box>
                  <Box sx={{ maxHeight: "160px", overflowY: "auto", px: "4px", pb: "6px" }}>
                    {groups.map(g => {
                      const memberDrns = (g.members || g.meters || []).map(m => m.DRN || m.meter_drn || m);
                      const allSel = memberDrns.length > 0 && memberDrns.every(d => selectedTargets.has(d));
                      const someSel = !allSel && memberDrns.some(d => selectedTargets.has(d));
                      return (
                        <Box key={g.id || g.name} onClick={() => toggleGroup(g)}
                          sx={{
                            ...listItemBase,
                            background: allSel ? (isDark ? "rgba(37,99,235,0.12)" : "#EFF6FF") : "transparent",
                            "&:hover": { background: isDark ? "rgba(255,255,255,0.03)" : "#F9FAFB" },
                          }}>
                          {allSel ? <CheckBoxOutlined sx={{ fontSize: 16, color: "#2563EB" }} /> :
                           someSel ? <CheckBoxOutlined sx={{ fontSize: 16, color: isDark ? colors.grey[400] : "#9CA3AF", opacity: 0.5 }} /> :
                           <CheckBoxOutlineBlankOutlined sx={{ fontSize: 16, color: isDark ? colors.grey[400] : "#D1D5DB" }} />}
                          <Box flex={1} minWidth={0}>
                            <Typography sx={{ fontSize: "11px", fontWeight: 600, color: isDark ? colors.grey[100] : "#1F2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {g.name}
                            </Typography>
                          </Box>
                          <Chip label={memberDrns.length} size="small" sx={{ height: 16, fontSize: "9px", fontWeight: 700, backgroundColor: isDark ? "#1E293B" : "#F3F4F6", color: isDark ? colors.grey[400] : "#9CA3AF" }} />
                        </Box>
                      );
                    })}
                  </Box>
                </Box>
              )}

              {/* AREAS */}
              {areas.length > 0 && (
                <Box sx={{ background: sidebarBg, border: cardBorder, borderRadius: "8px", overflow: "hidden" }}>
                  <Box sx={{ px: "12px", pt: "10px", pb: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Typography sx={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: isDark ? colors.grey[300] : "#6B7280" }}>
                      Areas / Regions
                    </Typography>
                    <Chip label={areas.length} size="small" sx={{ height: 18, fontSize: "10px", fontWeight: 700, backgroundColor: isDark ? "#1E293B" : "#F3F4F6", color: isDark ? colors.grey[300] : "#6B7280" }} />
                  </Box>
                  <Box sx={{ maxHeight: "160px", overflowY: "auto", px: "4px", pb: "6px" }}>
                    {areas.map(a => {
                      const allSel = a.drns.every(d => selectedTargets.has(d));
                      const someSel = !allSel && a.drns.some(d => selectedTargets.has(d));
                      return (
                        <Box key={a.name} onClick={() => toggleArea(a)}
                          sx={{
                            ...listItemBase,
                            background: allSel ? (isDark ? "rgba(37,99,235,0.12)" : "#EFF6FF") : "transparent",
                            "&:hover": { background: isDark ? "rgba(255,255,255,0.03)" : "#F9FAFB" },
                          }}>
                          {allSel ? <CheckBoxOutlined sx={{ fontSize: 16, color: "#2563EB" }} /> :
                           someSel ? <CheckBoxOutlined sx={{ fontSize: 16, color: isDark ? colors.grey[400] : "#9CA3AF", opacity: 0.5 }} /> :
                           <CheckBoxOutlineBlankOutlined sx={{ fontSize: 16, color: isDark ? colors.grey[400] : "#D1D5DB" }} />}
                          <Typography sx={{ fontSize: "11px", fontWeight: 500, color: isDark ? colors.grey[100] : "#1F2937", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {a.name}
                          </Typography>
                          <Chip label={a.count} size="small" sx={{ height: 16, fontSize: "9px", fontWeight: 700, backgroundColor: isDark ? "#1E293B" : "#F3F4F6", color: isDark ? colors.grey[400] : "#9CA3AF" }} />
                        </Box>
                      );
                    })}
                  </Box>
                </Box>
              )}

              {/* SUBSTATIONS */}
              {substationList.length > 0 && (
                <Box sx={{ background: sidebarBg, border: cardBorder, borderRadius: "8px", overflow: "hidden" }}>
                  <Box sx={{ px: "12px", pt: "10px", pb: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Typography sx={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: isDark ? colors.grey[300] : "#6B7280" }}>
                      Substations
                    </Typography>
                    <Chip label={substationList.length} size="small" sx={{ height: 18, fontSize: "10px", fontWeight: 700, backgroundColor: isDark ? "#1E293B" : "#F3F4F6", color: isDark ? colors.grey[300] : "#6B7280" }} />
                  </Box>
                  <Box sx={{ maxHeight: "160px", overflowY: "auto", px: "4px", pb: "6px" }}>
                    {substationList.map(s => {
                      const subId = s.id || s.name;
                      const allSel = s.drns.length > 0 && s.drns.every(d => selectedTargets.has(d));
                      const someSel = !allSel && s.drns.some(d => selectedTargets.has(d));
                      return (
                        <Box key={subId} onClick={() => toggleSubstation(s)}
                          sx={{
                            ...listItemBase,
                            background: allSel ? (isDark ? "rgba(37,99,235,0.12)" : "#EFF6FF") : "transparent",
                            "&:hover": { background: isDark ? "rgba(255,255,255,0.03)" : "#F9FAFB" },
                          }}>
                          {allSel ? <CheckBoxOutlined sx={{ fontSize: 16, color: "#2563EB" }} /> :
                           someSel ? <CheckBoxOutlined sx={{ fontSize: 16, color: isDark ? colors.grey[400] : "#9CA3AF", opacity: 0.5 }} /> :
                           <CheckBoxOutlineBlankOutlined sx={{ fontSize: 16, color: isDark ? colors.grey[400] : "#D1D5DB" }} />}
                          <Typography sx={{ fontSize: "11px", fontWeight: 500, color: isDark ? colors.grey[100] : "#1F2937", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {s.name || subId}
                          </Typography>
                          <Chip label={s.count} size="small" sx={{ height: 16, fontSize: "9px", fontWeight: 700, backgroundColor: isDark ? "#1E293B" : "#F3F4F6", color: isDark ? colors.grey[400] : "#9CA3AF" }} />
                        </Box>
                      );
                    })}
                  </Box>
                </Box>
              )}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
