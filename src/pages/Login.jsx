import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Container,
  Paper,
  TextField,
  Typography,
  CircularProgress,
  Alert,
  Link,
  useTheme,
} from "@mui/material";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { bgBlur } from "../css";
import { tokens, ColorModeContext, useMode } from "../theme";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err.message || "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `linear-gradient(135deg, ${colors.primary[500]} 0%, ${colors.primary[400]} 50%, ${colors.primary[500]} 100%)`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        borderRadius: 0,
      }}
    >
      <Container maxWidth="xs">
        <Box
          component="form"
          onSubmit={handleSubmit}
          sx={{
            ...bgBlur({ color: colors.primary[500], blur: 12, opacity: 0.85 }),
            borderRadius: "15px",
            p: { xs: 3, sm: 4.5 },
            border: `1px solid ${colors.grey[700]}`,
            boxShadow: "0 16px 64px rgba(0, 0, 0, 0.4)",
          }}
        >
          {/* Logo */}
          <Box sx={{ textAlign: "center", mb: 2 }}>
            <Typography
              variant="h2"
              fontWeight="800"
              sx={{
                color: colors.greenAccent[500],
                letterSpacing: "0.06em",
                mb: 0.5,
              }}
            >
              GRIDx
            </Typography>
            <Typography
              variant="h6"
              sx={{
                color: colors.grey[300],
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                fontSize: "11px",
              }}
            >
              Smart Metering Platform
            </Typography>
          </Box>

          {/* Error alert */}
          {error && (
            <Alert
              severity="error"
              onClose={() => setError("")}
              sx={{
                mb: 2,
                backgroundColor: "rgba(219, 79, 74, 0.12)",
                color: colors.redAccent[500],
                border: `1px solid ${colors.redAccent[700]}`,
                borderRadius: 2,
                "& .MuiAlert-icon": { color: colors.redAccent[500] },
              }}
            >
              {error}
            </Alert>
          )}

          {/* Email */}
          <TextField
            fullWidth
            label="Email Address"
            variant="outlined"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus
            sx={{ mb: 2.5 }}
          />

          {/* Password */}
          <TextField
            fullWidth
            label="Password"
            variant="outlined"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            sx={{ mb: 3.5 }}
          />

          {/* Sign In Button */}
          <Button
            type="submit"
            fullWidth
            variant="contained"
            disabled={loading || !email || !password}
            sx={{
              py: 1.5,
              fontWeight: 700,
              fontSize: "0.95rem",
              backgroundColor: colors.greenAccent[500],
              color: colors.primary[500],
              borderRadius: "8px",
              textTransform: "none",
              "&:hover": {
                backgroundColor: colors.greenAccent[400],
              },
              "&:disabled": {
                backgroundColor: colors.grey[700],
                color: colors.grey[500],
              },
            }}
          >
            {loading ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                <CircularProgress size={20} sx={{ color: colors.primary[500] }} />
                <span>Authenticating...</span>
              </Box>
            ) : (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <LockOutlinedIcon sx={{ fontSize: 20 }} />
                <span>Sign In</span>
              </Box>
            )}
          </Button>

          {/* Forgot Password */}
          <Box sx={{ textAlign: "center", mt: 2.5 }}>
            <Link
              href="#"
              underline="hover"
              sx={{
                color: colors.greenAccent[400],
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              Forgot Password?
            </Link>
          </Box>
        </Box>

        {/* Footer */}
        <Typography
          variant="caption"
          sx={{
            display: "block",
            textAlign: "center",
            color: colors.grey[400],
            fontSize: "11px",
            mt: 3,
          }}
        >
          &copy; 2026 Pulsar Electronic Solutions | GRIDx v4.0
        </Typography>
      </Container>
    </Paper>
  );
}
