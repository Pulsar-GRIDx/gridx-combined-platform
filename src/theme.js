import { createContext, useState, useMemo } from "react";
import { createTheme } from "@mui/material/styles";

// color design tokens export
export const tokens = (mode) => ({
  ...(mode === "dark"
    ? {
        grey: {
          100: "#F9FAFB", 200: "#F3F4F6", 300: "#94A3B8", 400: "#64748B",
          500: "#475569", 600: "#334155", 700: "#1E293B", 800: "#0F172A", 900: "#020617",
        },
        primary: {
          100: "#F1F5F9", 200: "#CBD5E1", 300: "#64748B", 400: "#1E293B",
          500: "#0F172A", 600: "#0B1120", 700: "#060D19", 800: "#030812", 900: "#010409",
        },
        greenAccent: {
          100: "#dbf5ee", 200: "#b7ebde", 300: "#94e2cd", 400: "#70d8bd",
          500: "#4cceac", 600: "#3da58a", 700: "#2e7c67", 800: "#1e5245", 900: "#0f2922",
        },
        redAccent: {
          100: "#f8dcdb", 200: "#f1b9b7", 300: "#e99592", 400: "#e2726e",
          500: "#db4f4a", 600: "#af3f3b", 700: "#832f2c", 800: "#58201e", 900: "#2c100f",
        },
        blueAccent: {
          100: "#EFF6FF", 200: "#DBEAFE", 300: "#93C5FD", 400: "#3B82F6",
          500: "#2563EB", 600: "#1D4ED8", 700: "#1E40AF", 800: "#1E3A8A", 900: "#172554",
        },
        yellowAccent: {
          100: "#fcf1cd", 200: "#fae29b", 300: "#f7d469", 400: "#f5c537",
          500: "#f2b705", 600: "#c29204", 700: "#916e03", 800: "#614902", 900: "#302501",
        },
        outline: { 100: "#FFD0D0", 500: "#eeeedd", 900: "#3AA6B9" },
        card: { 100: "#1E293B" },
        label: { 100: "#F9FAFB", 900: "#0F172A" },
      }
    : {
        grey: {
          100: "#111827", 200: "#1F2937", 300: "#374151", 400: "#6B7280",
          500: "#9CA3AF", 600: "#D1D5DB", 700: "#E5E7EB", 800: "#F3F4F6", 900: "#F9FAFB",
        },
        primary: {
          100: "#0F172A", 200: "#1E293B", 300: "#334155", 400: "#F3F4F6",
          500: "#FFFFFF", 600: "#F9FAFB", 700: "#E5E7EB", 800: "#D1D5DB", 900: "#FFFFFF",
        },
        greenAccent: {
          100: "#064E3B", 200: "#065F46", 300: "#047857", 400: "#059669",
          500: "#10B981", 600: "#34D399", 700: "#6EE7B7", 800: "#A7F3D0", 900: "#D1FAE5",
        },
        redAccent: {
          100: "#7F1D1D", 200: "#991B1B", 300: "#B91C1C", 400: "#DC2626",
          500: "#EF4444", 600: "#F87171", 700: "#FCA5A5", 800: "#FECACA", 900: "#FEE2E2",
        },
        blueAccent: {
          100: "#EFF6FF", 200: "#DBEAFE", 300: "#93C5FD", 400: "#3B82F6",
          500: "#2563EB", 600: "#1D4ED8", 700: "#1E40AF", 800: "#1E3A8A", 900: "#172554",
        },
        yellowAccent: {
          100: "#302501", 200: "#614902", 300: "#916e03", 400: "#c29204",
          500: "#f2b705", 600: "#f5c537", 700: "#f7d469", 800: "#fae29b", 900: "#fcf1cd",
        },
        outline: { 100: "#FF9EAA", 500: "#443355", 900: "#C1ECE4" },
        card: { 100: "#FFFFFF" },
        label: { 100: "#111827", 900: "#F9FAFB" },
      }),
});

// mui theme settings
export const themeSettings = (mode) => {
  const colors = tokens(mode);
  return {
    palette: {
      mode: mode,
      ...(mode === "dark"
        ? {
            primary: { main: colors.primary[500] },
            secondary: { main: colors.greenAccent[500] },
            neutral: { dark: colors.grey[700], main: colors.grey[500], light: colors.grey[100] },
            background: { default: "#0F172A" },
          }
        : {
            primary: { main: colors.primary[100] },
            secondary: { main: colors.greenAccent[500] },
            neutral: { dark: colors.grey[700], main: colors.grey[500], light: colors.grey[100] },
            background: { default: "#FFFFFF" },
          }),
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            transition: 'all 0.3s',
            '&:hover': { transform: 'scale(1.02)', backgroundColor: 'transparent' },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: { "&.Mui-focused $notchedOutline": { borderColor: colors.label[900] } },
        },
      },
    },
    typography: {
      fontFamily: ["Inter", "Segoe UI", "sans-serif"].join(","),
      fontSize: 12,
      h1: { fontFamily: ["Inter", "Segoe UI", "sans-serif"].join(","), fontSize: 40, fontWeight: 700 },
      h2: { fontFamily: ["Inter", "Segoe UI", "sans-serif"].join(","), fontSize: 32, fontWeight: 700 },
      h3: { fontFamily: ["Inter", "Segoe UI", "sans-serif"].join(","), fontSize: 24, fontWeight: 600 },
      h4: { fontFamily: ["Inter", "Segoe UI", "sans-serif"].join(","), fontSize: 20, fontWeight: 600 },
      h5: { fontFamily: ["Inter", "Segoe UI", "sans-serif"].join(","), fontSize: 16, fontWeight: 500 },
      h6: { fontFamily: ["Inter", "Segoe UI", "sans-serif"].join(","), fontSize: 14, fontWeight: 500 },
    },
  };
};

// context for color mode
export const ColorModeContext = createContext({ toggleColorMode: () => {} });

export const useMode = () => {
  const [mode, setMode] = useState("dark");
  const colorMode = useMemo(
    () => ({ toggleColorMode: () => setMode((prev) => (prev === "light" ? "dark" : "light")) }),
    []
  );
  const theme = useMemo(() => createTheme(themeSettings(mode)), [mode]);
  return [theme, colorMode];
};
