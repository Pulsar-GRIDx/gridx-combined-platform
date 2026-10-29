import { useState } from "react";
import {
  Badge, Box, Button, Checkbox, Collapse, Drawer, IconButton,
  MenuItem, Select, TextField, Tooltip, Typography, useMediaQuery, useTheme,
} from "@mui/material";
import ChecklistOutlinedIcon from "@mui/icons-material/ChecklistOutlined";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import RemoveOutlinedIcon from "@mui/icons-material/RemoveOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import { tokens } from "../../theme";
import { useTasks, CATEGORIES, PRIORITIES, todayKey, tomorrowKey } from "../../context/TasksContext";

const PRIORITY_COLOR = { URGENT: "#EF4444", HIGH: "#F59E0B", MEDIUM: "#3B82F6", LOW: "#94A3B8" };

const formatDue = (dateKey) => {
  if (!dateKey) return null;
  const today = todayKey();
  const tomorrow = tomorrowKey();
  if (dateKey === today) return "Due today";
  if (dateKey === tomorrow) return "Due tomorrow";
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const opts = { day: "numeric", month: "short" };
  if (y !== new Date().getFullYear()) opts.year = "numeric";
  return `Due ${dt.toLocaleDateString("en-GB", opts)}`;
};

const emptyDraft = () => ({ title: "", description: "", category: "General", priority: "MEDIUM", dueDate: "", meterRef: "" });

const TaskForm = ({ colors, isDark, initial, onSave, onCancel }) => {
  const [draft, setDraft] = useState(initial || emptyDraft());
  const set = (field) => (e) => setDraft((d) => ({ ...d, [field]: e.target.value }));

  const fieldSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "8px",
      bgcolor: isDark ? "rgba(255,255,255,0.03)" : "#F9FAFB",
    },
  };

  return (
    <Box
      component="form"
      onSubmit={(e) => { e.preventDefault(); if (draft.title.trim()) onSave(draft); }}
      sx={{ display: "flex", flexDirection: "column", gap: 2, p: 2 }}
    >
      <TextField
        autoFocus
        label="Task"
        placeholder="e.g. Investigate meter export anomaly"
        value={draft.title}
        onChange={set("title")}
        size="small"
        fullWidth
        required
        sx={fieldSx}
      />

      <Box sx={{ display: "flex", gap: 1.5 }}>
        <TextField select label="Category" value={draft.category} onChange={set("category")} size="small" fullWidth sx={fieldSx}>
          {CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
        </TextField>
        <TextField select label="Priority" value={draft.priority} onChange={set("priority")} size="small" fullWidth sx={fieldSx}>
          {PRIORITIES.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
        </TextField>
      </Box>

      <Box sx={{ display: "flex", gap: 1.5 }}>
        <TextField
          label="Due"
          type="date"
          value={draft.dueDate || ""}
          onChange={set("dueDate")}
          size="small"
          fullWidth
          InputLabelProps={{ shrink: true }}
          sx={fieldSx}
        />
        <TextField
          label="Meter / DRN ref"
          placeholder="0260060135803"
          value={draft.meterRef}
          onChange={set("meterRef")}
          size="small"
          fullWidth
          helperText="Optional"
          sx={fieldSx}
        />
      </Box>

      <TextField
        label="Description"
        placeholder="Optional"
        value={draft.description}
        onChange={set("description")}
        size="small"
        fullWidth
        multiline
        minRows={2}
        sx={fieldSx}
      />

      <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, pt: 0.5 }}>
        <Button onClick={onCancel} size="small" sx={{ textTransform: "none", color: colors.grey[300] }}>Cancel</Button>
        <Button type="submit" variant="contained" size="small" disabled={!draft.title.trim()} sx={{ textTransform: "none", borderRadius: "8px" }}>
          Save Task
        </Button>
      </Box>
    </Box>
  );
};

const TaskRow = ({ task, overdue, colors, isDark, onToggle, onEdit, onDelete }) => {
  const due = formatDue(task.dueDate);
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "flex-start",
        gap: 0.5,
        px: 1,
        py: 0.5,
        borderRadius: "8px",
        "&:hover": { bgcolor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)" },
        "&:hover .task-row-actions": { opacity: 1 },
      }}
    >
      <Checkbox
        checked={task.completed}
        onChange={() => onToggle(task.id)}
        size="small"
        inputProps={{ "aria-label": `Mark "${task.title}" as ${task.completed ? "not completed" : "completed"}` }}
        sx={{ mt: "2px", p: "4px", color: colors.grey[400], "&.Mui-checked": { color: "#2563EB" } }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{
            fontSize: 13, fontWeight: 600,
            color: task.completed ? colors.grey[500] : (isDark ? colors.grey[100] : "#111827"),
            textDecoration: task.completed ? "line-through" : "none",
          }}
        >
          {task.title}
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.75, mt: 0.25 }}>
          <Typography sx={{ fontSize: 11, color: colors.grey[400] }}>{task.category}</Typography>
          <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.02em", color: PRIORITY_COLOR[task.priority] }}>
            {task.priority}
          </Typography>
          {due && (
            <Typography sx={{ fontSize: 11, fontWeight: overdue ? 700 : 400, color: overdue ? "#EF4444" : colors.grey[400] }}>
              {due}
            </Typography>
          )}
          {task.meterRef && (
            <Typography sx={{ fontSize: 11, fontFamily: "monospace", color: colors.grey[400] }}>
              Meter {task.meterRef}
            </Typography>
          )}
        </Box>
      </Box>
      <Box className="task-row-actions" sx={{ display: "flex", gap: 0.25, opacity: 0, transition: "opacity 0.15s" }}>
        <IconButton size="small" onClick={() => onEdit(task)} aria-label={`Edit "${task.title}"`} sx={{ p: "4px", color: colors.grey[400] }}>
          <EditOutlinedIcon sx={{ fontSize: 15 }} />
        </IconButton>
        <IconButton size="small" onClick={() => onDelete(task.id)} aria-label={`Delete "${task.title}"`} sx={{ p: "4px", color: colors.grey[400], "&:hover": { color: "#EF4444" } }}>
          <DeleteOutlineOutlinedIcon sx={{ fontSize: 15 }} />
        </IconButton>
      </Box>
    </Box>
  );
};

const Section = ({ title, tasks, overdue, ...rest }) => {
  if (!tasks.length) return null;
  return (
    <Box sx={{ mb: 2.5 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: overdue ? "#F59E0B" : rest.colors.grey[400], mb: 0.75 }}>
        {title}
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
        {tasks.map((t) => <TaskRow key={t.id} task={t} overdue={overdue} {...rest} />)}
      </Box>
    </Box>
  );
};

const PanelContent = ({ colors, isDark, onClose }) => {
  const { grouped, outstandingCount, addTask, updateTask, toggleComplete, deleteTask } = useTasks();
  const [mode, setMode] = useState("list");
  const [editingTask, setEditingTask] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [showCompleted, setShowCompleted] = useState(false);

  const byCat = (list) => (categoryFilter === "All" ? list : list.filter((t) => t.category === categoryFilter));
  const overdue = byCat(grouped.overdue);
  const today = byCat(grouped.today);
  const upcoming = byCat(grouped.upcoming);
  const completed = byCat(grouped.completed);
  const isEmpty = !overdue.length && !today.length && !upcoming.length && !completed.length;

  const rowProps = { colors, isDark, onToggle: toggleComplete, onEdit: (t) => { setEditingTask(t); setMode("edit"); }, onDelete: deleteTask };

  const handleSave = (draft) => {
    if (mode === "edit" && editingTask) updateTask(editingTask.id, draft);
    else addTask(draft);
    setMode("list");
    setEditingTask(null);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Box
        sx={{
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          px: 2, pt: 2, pb: 1.5, borderBottom: `1px solid ${isDark ? "#1E293B" : "#E5E7EB"}`,
        }}
      >
        <Box>
          <Typography sx={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#2563EB" }}>
            Utility Operations
          </Typography>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
            <Typography sx={{ fontSize: 18, fontWeight: 700, color: isDark ? colors.grey[100] : "#111827" }}>Tasks</Typography>
            <Typography sx={{ fontSize: 11, color: colors.grey[400] }}>{outstandingCount} outstanding</Typography>
          </Box>
        </Box>
        <Box sx={{ display: "flex", gap: 0.25 }}>
          <Tooltip title="Minimize">
            <IconButton size="small" onClick={onClose} aria-label="Minimize panel" sx={{ color: colors.grey[400] }}>
              <RemoveOutlinedIcon sx={{ fontSize: 17 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Close">
            <IconButton size="small" onClick={onClose} aria-label="Close panel" sx={{ color: colors.grey[400] }}>
              <CloseOutlinedIcon sx={{ fontSize: 17 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {mode === "list" ? (
        <>
          <Box sx={{ display: "flex", gap: 1, px: 2, py: 1.5, borderBottom: `1px solid ${isDark ? "#1E293B" : "#E5E7EB"}` }}>
            <Button
              onClick={() => setMode("add")}
              startIcon={<AddOutlinedIcon sx={{ fontSize: 16 }} />}
              variant="contained"
              size="small"
              sx={{ textTransform: "none", borderRadius: "8px", fontWeight: 700, whiteSpace: "nowrap" }}
            >
              Add Task
            </Button>
            <Select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              size="small"
              fullWidth
              displayEmpty
              inputProps={{ "aria-label": "Filter by category" }}
              sx={{ borderRadius: "8px", fontSize: 13, bgcolor: isDark ? "rgba(255,255,255,0.03)" : "#F9FAFB" }}
            >
              <MenuItem value="All">All categories</MenuItem>
              {CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
            </Select>
          </Box>

          <Box sx={{ flex: 1, overflowY: "auto", px: 2, py: 2 }}>
            {isEmpty ? (
              <Typography sx={{ fontSize: 13, color: colors.grey[400], lineHeight: 1.7 }}>
                No tasks yet. Use &ldquo;Add Task&rdquo; to log utility operations work — inspections, maintenance, meter or billing follow-ups.
              </Typography>
            ) : (
              <>
                <Section title="Overdue" tasks={overdue} overdue {...rowProps} colors={colors} />
                <Section title="Today" tasks={today} {...rowProps} colors={colors} />
                <Section title="Upcoming" tasks={upcoming} {...rowProps} colors={colors} />
                {completed.length > 0 && (
                  <Box>
                    <Box
                      component="button"
                      onClick={() => setShowCompleted((v) => !v)}
                      sx={{
                        display: "flex", alignItems: "center", gap: 0.5, width: "100%", textAlign: "left",
                        bgcolor: "transparent", border: "none", cursor: "pointer", p: 0, mb: 0.75,
                        fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: colors.grey[400],
                      }}
                    >
                      Completed ({completed.length})
                      <ExpandMoreOutlinedIcon sx={{ fontSize: 16, transform: showCompleted ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                    </Box>
                    <Collapse in={showCompleted}>
                      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
                        {completed.map((t) => <TaskRow key={t.id} task={t} colors={colors} isDark={isDark} onToggle={toggleComplete} onEdit={rowProps.onEdit} onDelete={deleteTask} />)}
                      </Box>
                    </Collapse>
                  </Box>
                )}
              </>
            )}
          </Box>
        </>
      ) : (
        <TaskForm
          colors={colors}
          isDark={isDark}
          initial={mode === "edit" ? editingTask : undefined}
          onSave={handleSave}
          onCancel={() => { setMode("list"); setEditingTask(null); }}
        />
      )}
    </Box>
  );
};

const UtilityTasksButton = () => {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const isDark = theme.palette.mode === "dark";
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [open, setOpen] = useState(false);
  const { outstandingCount } = useTasks();

  const close = () => setOpen(false);

  return (
    <>
      <Tooltip title={open ? "Close utility tasks" : "Open utility tasks"}>
        <IconButton
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close utility tasks" : "Open utility tasks"}
          aria-expanded={open}
          aria-controls="utility-tasks-panel"
          sx={{
            color: isDark ? colors.grey[300] : "#6B7280",
            borderRadius: "8px",
            p: "8px",
            "&:hover": { bgcolor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)" },
          }}
        >
          <Badge
            badgeContent={outstandingCount}
            max={99}
            invisible={outstandingCount === 0}
            sx={{ "& .MuiBadge-badge": { bgcolor: "#2563EB", color: "#fff", fontSize: 10, fontWeight: 700, minWidth: 16, height: 16 } }}
          >
            <ChecklistOutlinedIcon sx={{ fontSize: 20 }} />
          </Badge>
        </IconButton>
      </Tooltip>

      <Drawer
        id="utility-tasks-panel"
        anchor={isMobile ? "bottom" : "right"}
        open={open}
        onClose={close}
        ModalProps={{ keepMounted: false }}
        PaperProps={{
          sx: {
            width: isMobile ? "100%" : { xs: "100%", sm: 380 },
            maxWidth: "100vw",
            height: isMobile ? "min(85vh, 640px)" : "100%",
            borderRadius: isMobile ? "12px 12px 0 0" : 0,
            bgcolor: isDark ? "#0F172A" : "#FFFFFF",
            borderLeft: isMobile ? "none" : `1px solid ${isDark ? "#1E293B" : "#E5E7EB"}`,
          },
        }}
      >
        <Box role="dialog" aria-modal="true" aria-label="Utility Tasks" sx={{ height: "100%" }}>
          <PanelContent colors={colors} isDark={isDark} onClose={close} />
        </Box>
      </Drawer>
    </>
  );
};

export default UtilityTasksButton;
