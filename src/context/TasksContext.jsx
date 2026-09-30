import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";

// Utility Operations Tasks — a lightweight task list scoped to the logged-in
// admin, for utility/energy operations work (meter inspections, net-metering
// follow-ups, maintenance, billing, etc.).
//
// This app already has real auth (AuthContext / sessionStorage token) but no
// dedicated tasks table on the backend yet, so persistence is localStorage
// for now, namespaced per Admin_ID so one admin's tasks don't bleed into
// another's on a shared machine. The task shape carries `source` and an
// optional `meterRef` so a future backend table / GRIDx-event-generated
// tasks (meter offline, tamper, high export, etc.) can slot in later without
// a data-model rework — nothing here talks to any live GRIDx event stream.

export const CATEGORIES = [
  "Metering",
  "Net Metering",
  "Maintenance",
  "Billing",
  "Tariffs",
  "Customers",
  "Installations",
  "Grid Operations",
  "Solar",
  "Projects",
  "Compliance",
  "General",
];

export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const PRIORITY_RANK = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

const makeId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
};

// Local (not UTC) date key — avoids the toISOString() UTC-shift class of bug
// this project has hit before with server timezones ahead of UTC.
export const toDateKey = (d) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

export const todayKey = () => toDateKey(new Date());

export const tomorrowKey = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toDateKey(d);
};

const storageKeyFor = (adminId) => `gridx_utility_tasks_v1_${adminId || "anon"}`;

const loadTasks = (adminId) => {
  try {
    const raw = window.localStorage.getItem(storageKeyFor(adminId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveTasks = (adminId, tasks) => {
  try {
    window.localStorage.setItem(storageKeyFor(adminId), JSON.stringify(tasks));
  } catch {
    // Storage unavailable (private mode, quota, etc.) — fail silently.
  }
};

const TasksContext = createContext(null);

export const TasksProvider = ({ children }) => {
  const { user } = useAuth() || {};
  const adminId = user?.Admin_ID || null;
  const createdByName = user?.Name || user?.name || "Admin";

  const [tasks, setTasks] = useState(() => loadTasks(adminId));

  // Re-hydrate if the logged-in admin changes (e.g. logout/login as someone else).
  useEffect(() => {
    setTasks(loadTasks(adminId));
  }, [adminId]);

  useEffect(() => {
    saveTasks(adminId, tasks);
  }, [adminId, tasks]);

  const addTask = useCallback((input) => {
    const now = new Date().toISOString();
    const task = {
      id: makeId(),
      title: input.title.trim(),
      description: (input.description || "").trim(),
      category: input.category || "General",
      priority: input.priority || "MEDIUM",
      dueDate: input.dueDate || null,
      meterRef: (input.meterRef || "").trim(),
      completed: false,
      source: "manual",
      createdBy: createdByName,
      createdAt: now,
      updatedAt: now,
    };
    setTasks((prev) => [task, ...prev]);
    return task.id;
  }, [createdByName]);

  const updateTask = useCallback((id, patch) => {
    setTasks((prev) => prev.map((t) => (
      t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t
    )));
  }, []);

  const toggleComplete = useCallback((id) => {
    setTasks((prev) => prev.map((t) => (
      t.id === id ? { ...t, completed: !t.completed, updatedAt: new Date().toISOString() } : t
    )));
  }, []);

  const deleteTask = useCallback((id) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const grouped = useMemo(() => {
    const today = todayKey();
    const sortFn = (a, b) => {
      const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (pr !== 0) return pr;
      if (a.dueDate && b.dueDate) return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    };

    const active = tasks.filter((t) => !t.completed);
    const overdue = active.filter((t) => t.dueDate && t.dueDate < today).sort(sortFn);
    const dueToday = active.filter((t) => t.dueDate === today).sort(sortFn);
    const upcoming = active.filter((t) => !t.dueDate || t.dueDate > today).sort(sortFn);
    const completed = tasks.filter((t) => t.completed).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

    return { overdue, today: dueToday, upcoming, completed };
  }, [tasks]);

  const outstandingCount = tasks.filter((t) => !t.completed).length;

  const value = useMemo(() => ({
    tasks,
    grouped,
    outstandingCount,
    addTask,
    updateTask,
    toggleComplete,
    deleteTask,
  }), [tasks, grouped, outstandingCount, addTask, updateTask, toggleComplete, deleteTask]);

  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>;
};

export const useTasks = () => {
  const ctx = useContext(TasksContext);
  if (!ctx) throw new Error("useTasks must be used within a TasksProvider");
  return ctx;
};
