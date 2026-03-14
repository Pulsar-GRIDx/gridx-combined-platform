import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  TextField,
  Typography,
  CircularProgress,
  Alert,
  Link,
  useTheme,
  InputAdornment,
  IconButton,
} from "@mui/material";
import {
  Visibility,
  VisibilityOff,
  EmailOutlined,
  LockOutlined,
  BoltOutlined,
  SpeedOutlined,
  TuneOutlined,
  InsightsOutlined,
} from "@mui/icons-material";
import { tokens } from "../theme";
import { useAuth } from "../context/AuthContext";
import logoImage from "../assets/logo.png";
import meterImage from "../assets/meter-transparent.png";

/* ---- Animated circuit SVG background for left panel ---- */
const CircuitBG = () => (
  <Box
    component="svg"
    viewBox="0 0 500 900"
    sx={{
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%",
      opacity: 0.06,
      pointerEvents: "none",
    }}
  >
    {/* Horizontal traces */}
    <line x1="0" y1="120" x2="500" y2="120" stroke="#4cceac" strokeWidth="1" />
    <line x1="0" y1="300" x2="500" y2="300" stroke="#4cceac" strokeWidth="1" />
    <line x1="0" y1="480" x2="500" y2="480" stroke="#4cceac" strokeWidth="1" />
    <line x1="0" y1="660" x2="500" y2="660" stroke="#4cceac" strokeWidth="1" />
    <line x1="0" y1="780" x2="500" y2="780" stroke="#4cceac" strokeWidth="1" />
    {/* Vertical traces */}
    <line x1="80" y1="0" x2="80" y2="900" stroke="#4cceac" strokeWidth="1" />
    <line x1="200" y1="0" x2="200" y2="900" stroke="#4cceac" strokeWidth="1" />
    <line x1="350" y1="0" x2="350" y2="900" stroke="#4cceac" strokeWidth="1" />
    <line x1="430" y1="0" x2="430" y2="900" stroke="#4cceac" strokeWidth="1" />
    {/* Diagonal accents */}
    <line x1="80" y1="120" x2="200" y2="300" stroke="#4cceac" strokeWidth="1.5" />
    <line x1="350" y1="300" x2="430" y2="480" stroke="#4cceac" strokeWidth="1.5" />
    <line x1="200" y1="480" x2="80" y2="660" stroke="#4cceac" strokeWidth="1.5" />
    <line x1="430" y1="660" x2="350" y2="780" stroke="#4cceac" strokeWidth="1.5" />
    {/* Node dots at intersections */}
    {[
      [80, 120], [200, 120], [350, 120], [430, 120],
      [80, 300], [200, 300], [350, 300], [430, 300],
      [80, 480], [200, 480], [350, 480], [430, 480],
      [80, 660], [200, 660], [350, 660], [430, 660],
      [80, 780], [200, 780], [350, 780], [430, 780],
    ].map(([cx, cy], i) => (
      <circle key={i} cx={cx} cy={cy} r="3" fill="#4cceac" />
    ))}
    {/* Larger node highlights */}
    {[
      [200, 300], [350, 480], [80, 660], [430, 120],
    ].map(([cx, cy], i) => (
      <circle key={`lg-${i}`} cx={cx} cy={cy} r="6" fill="none" stroke="#4cceac" strokeWidth="1.5" />
    ))}
  </Box>
);

/* ---- Glowing pulse keyframes ---- */
const pulseKeyframes = {
  "@keyframes pulse": {
    "0%, 100%": { opacity: 0.4, transform: "scale(1)" },
    "50%": { opacity: 1, transform: "scale(1.1)" },
  },
  "@keyframes slideUp": {
    from: { opacity: 0, transform: "translateY(24px)" },
    to: { opacity: 1, transform: "translateY(0)" },
  },
  "@keyframes fadeIn": {
    from: { opacity: 0 },
    to: { opacity: 1 },
  },
};

/* ---- Feature item ---- */
function FeatureItem({ icon, title, desc, delay }) {
  return (
    <Box
      sx={{
        display: "flex",
        gap: 2,
        animation: `slideUp 0.6s ease ${delay}s both`,
        ...pulseKeyframes,
      }}
    >
      <Box
        sx={{
          width: 44,
          height: 44,
          minWidth: 44,
          borderRadius: "10px",
          background: "linear-gradient(135deg, rgba(76,206,172,0.15) 0%, rgba(76,206,172,0.05) 100%)",
          border: "1px solid rgba(76,206,172,0.2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </Box>
      <Box>
        <Typography
          sx={{
            color: "#fff",
            fontWeight: 700,
            fontSize: "0.88rem",
            letterSpacing: "0.02em",
            mb: 0.2,
          }}
        >
          {title}
        </Typography>
        <Typography
          sx={{
            color: "rgba(255,255,255,0.45)",
            fontSize: "0.74rem",
            lineHeight: 1.5,
          }}
        >
          {desc}
        </Typography>
      </Box>
    </Box>
  );
}

/* ==================================================================== */
/* Login Page                                                           */
/* ==================================================================== */
export default function Login() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const navigate = useNavigate();
  const { login } = useAuth();

  const [formData, setFormData] = useState({ Email: "", Password: "" });
  const [formErrors, setFormErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (formErrors[name]) setFormErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.Email.trim()) errors.Email = "Email Address is required";
    if (!formData.Password || formData.Password.length < 4)
      errors.Password = "Password is required";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setLoading(true);
    setFormErrors({});

    try {
      await login(formData.Email, formData.Password);
      navigate("/");
    } catch (err) {
      setFormErrors({ general: err.message || "Incorrect email or password" });
    } finally {
      setLoading(false);
    }
  };

  const ACCENT = "#4cceac";

  return (
    <Box
      sx={{
        width: "100%",
        height: "100vh",
        display: "flex",
        flexDirection: { xs: "column", md: "row" },
        overflow: "hidden",
        ...pulseKeyframes,
      }}
    >
      {/* ====== LEFT PANEL — Branding ====== */}
      <Box
        sx={{
          width: { xs: "100%", md: "46%" },
          minHeight: { xs: "40vh", md: "100vh" },
          background: `linear-gradient(165deg, #040509 0%, #0c101b 35%, #101624 60%, #0a1628 100%)`,
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          px: { xs: 4, md: 7 },
          py: { xs: 5, md: 0 },
          overflow: "hidden",
        }}
      >
        <CircuitBG />

        {/* Accent glow orb */}
        <Box
          sx={{
            position: "absolute",
            top: "-15%",
            right: "-25%",
            width: "500px",
            height: "500px",
            borderRadius: "50%",
            background: `radial-gradient(circle, rgba(76,206,172,0.08) 0%, transparent 70%)`,
            pointerEvents: "none",
          }}
        />
        <Box
          sx={{
            position: "absolute",
            bottom: "-10%",
            left: "-20%",
            width: "400px",
            height: "400px",
            borderRadius: "50%",
            background: `radial-gradient(circle, rgba(104,112,250,0.06) 0%, transparent 70%)`,
            pointerEvents: "none",
          }}
        />

        {/* Content */}
        <Box sx={{ position: "relative", zIndex: 2 }}>
          {/* Logo + Name */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              mb: 4,
              animation: "slideUp 0.5s ease 0.1s both",
            }}
          >
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: "14px",
                overflow: "hidden",
                border: `1px solid rgba(76,206,172,0.3)`,
                boxShadow: "0 0 24px rgba(76,206,172,0.15)",
                flexShrink: 0,
              }}
            >
              <img
                src={logoImage}
                alt="GRIDx"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            </Box>
            <Box>
              <Typography
                sx={{
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: "1.6rem",
                  letterSpacing: "0.08em",
                  lineHeight: 1,
                }}
              >
                GRIDx
              </Typography>
              <Typography
                sx={{
                  color: ACCENT,
                  fontSize: "0.68rem",
                  fontWeight: 600,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  mt: 0.3,
                }}
              >
                Smart Metering Platform
              </Typography>
            </Box>
          </Box>

          {/* Tagline */}
          <Typography
            sx={{
              color: "#fff",
              fontWeight: 700,
              fontSize: { xs: "1.5rem", md: "1.85rem" },
              lineHeight: 1.3,
              mb: 1,
              animation: "slideUp 0.5s ease 0.2s both",
            }}
          >
            Intelligent energy{" "}
            <Box
              component="span"
              sx={{
                background: `linear-gradient(90deg, ${ACCENT}, #6870fa)`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              management
            </Box>
            <br />
            at your fingertips
          </Typography>

          <Typography
            sx={{
              color: "rgba(255,255,255,0.4)",
              fontSize: "0.85rem",
              lineHeight: 1.6,
              mb: 5,
              maxWidth: 380,
              animation: "slideUp 0.5s ease 0.3s both",
            }}
          >
            Monitor, control, and optimize your electricity grid with real-time
            telemetry from every smart meter in the network.
          </Typography>

          {/* Features */}
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2.8 }}>
            <FeatureItem
              icon={<SpeedOutlined sx={{ color: ACCENT, fontSize: 22 }} />}
              title="Real-time Monitoring"
              desc="Live voltage, current, and power readings from every meter"
              delay={0.4}
            />
            <FeatureItem
              icon={<BoltOutlined sx={{ color: ACCENT, fontSize: 22 }} />}
              title="Smart Load Control"
              desc="Enable or disable mains and heater relays remotely"
              delay={0.5}
            />
            <FeatureItem
              icon={<TuneOutlined sx={{ color: ACCENT, fontSize: 22 }} />}
              title="STS Token Vending"
              desc="Generate and manage prepaid electricity tokens"
              delay={0.6}
            />
            <FeatureItem
              icon={<InsightsOutlined sx={{ color: ACCENT, fontSize: 22 }} />}
              title="Grid Analytics"
              desc="Area-level insights, transformer mapping, and consumption trends"
              delay={0.7}
            />
          </Box>
        </Box>

        {/* Bottom left stats strip */}
        <Box
          sx={{
            position: { xs: "relative", md: "absolute" },
            bottom: { md: 40 },
            left: { md: 56 },
            right: { md: 56 },
            mt: { xs: 5, md: 0 },
            display: "flex",
            gap: 3,
            zIndex: 2,
            animation: "fadeIn 0.8s ease 0.9s both",
          }}
        >
          {[
            { val: "99.9%", label: "Uptime" },
            { val: "<200ms", label: "Latency" },
            { val: "24/7", label: "Monitoring" },
          ].map((stat) => (
            <Box key={stat.label}>
              <Typography
                sx={{
                  color: ACCENT,
                  fontWeight: 800,
                  fontSize: "1.1rem",
                  fontFamily: "monospace",
                }}
              >
                {stat.val}
              </Typography>
              <Typography
                sx={{
                  color: "rgba(255,255,255,0.3)",
                  fontSize: "0.65rem",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                {stat.label}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>

      {/* ====== RIGHT PANEL — Login Form ====== */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: `linear-gradient(180deg, #080b12 0%, #0c101b 50%, #101624 100%)`,
          position: "relative",
          px: { xs: 3, sm: 6 },
          py: { xs: 5, md: 0 },
        }}
      >
        {/* Meter image with glow — top right */}
        <Box
          sx={{
            position: "absolute",
            top: { xs: 10, md: 20 },
            right: { xs: 10, md: 30 },
            width: { xs: 100, md: 160 },
            height: { xs: 100, md: 160 },
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2,
            pointerEvents: "none",
            "&::before": {
              content: '""',
              position: "absolute",
              inset: -20,
              borderRadius: "50%",
              background: `radial-gradient(circle, rgba(76,206,172,0.12) 0%, rgba(76,206,172,0.03) 50%, transparent 70%)`,
            },
          }}
        >
          <Box
            component="img"
            src={meterImage}
            alt="GRIDx Smart Meter"
            sx={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              filter: "drop-shadow(0 0 20px rgba(76,206,172,0.25))",
              animation: "pulse 4s ease-in-out infinite",
              opacity: 0.85,
            }}
          />
        </Box>

        <Box
          sx={{
            width: "100%",
            maxWidth: 400,
            position: "relative",
            zIndex: 1,
            animation: "slideUp 0.6s ease 0.2s both",
          }}
        >
          {/* Heading */}
          <Typography
            sx={{
              color: "#fff",
              fontWeight: 700,
              fontSize: "1.6rem",
              mb: 0.5,
            }}
          >
            Welcome back
          </Typography>
          <Typography
            sx={{
              color: "rgba(255,255,255,0.4)",
              fontSize: "0.85rem",
              mb: 4,
            }}
          >
            Sign in to access your metering dashboard
          </Typography>

          {/* Error alert */}
          {formErrors.general && (
            <Alert
              severity="error"
              onClose={() =>
                setFormErrors((prev) => ({ ...prev, general: "" }))
              }
              sx={{
                mb: 3,
                backgroundColor: "rgba(219,79,74,0.1)",
                border: "1px solid rgba(219,79,74,0.3)",
                color: "#f1b9b7",
                "& .MuiAlert-icon": { color: "#db4f4a" },
              }}
            >
              {formErrors.general}
            </Alert>
          )}

          {/* Form */}
          <Box component="form" onSubmit={handleSubmit} noValidate>
            <Typography
              sx={{
                color: "rgba(255,255,255,0.5)",
                fontSize: "0.72rem",
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                mb: 0.8,
              }}
            >
              Email Address
            </Typography>
            <TextField
              fullWidth
              id="Email"
              name="Email"
              autoComplete="email"
              autoFocus
              placeholder="admin@gridx-meters.com"
              value={formData.Email}
              onChange={handleInputChange}
              error={!!formErrors.Email}
              helperText={formErrors.Email}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <EmailOutlined
                      sx={{ color: "rgba(255,255,255,0.2)", fontSize: 20 }}
                    />
                  </InputAdornment>
                ),
              }}
              sx={{
                mb: 3,
                "& .MuiOutlinedInput-root": {
                  backgroundColor: "rgba(255,255,255,0.03)",
                  borderRadius: "10px",
                  "& fieldset": {
                    borderColor: "rgba(255,255,255,0.08)",
                  },
                  "&:hover fieldset": {
                    borderColor: "rgba(76,206,172,0.3)",
                  },
                  "&.Mui-focused fieldset": {
                    borderColor: ACCENT,
                    borderWidth: 1,
                  },
                },
                "& input": {
                  color: "#fff",
                  fontSize: "0.9rem",
                  py: 1.5,
                },
                "& input::placeholder": {
                  color: "rgba(255,255,255,0.2)",
                  opacity: 1,
                },
              }}
            />

            <Typography
              sx={{
                color: "rgba(255,255,255,0.5)",
                fontSize: "0.72rem",
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                mb: 0.8,
              }}
            >
              Password
            </Typography>
            <TextField
              fullWidth
              name="Password"
              type={showPassword ? "text" : "password"}
              id="Password"
              autoComplete="current-password"
              placeholder="Enter your password"
              value={formData.Password}
              onChange={handleInputChange}
              error={!!formErrors.Password}
              helperText={formErrors.Password}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LockOutlined
                      sx={{ color: "rgba(255,255,255,0.2)", fontSize: 20 }}
                    />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword((s) => !s)}
                      edge="end"
                      sx={{ color: "rgba(255,255,255,0.25)" }}
                    >
                      {showPassword ? (
                        <VisibilityOff sx={{ fontSize: 20 }} />
                      ) : (
                        <Visibility sx={{ fontSize: 20 }} />
                      )}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              sx={{
                mb: 1.5,
                "& .MuiOutlinedInput-root": {
                  backgroundColor: "rgba(255,255,255,0.03)",
                  borderRadius: "10px",
                  "& fieldset": {
                    borderColor: "rgba(255,255,255,0.08)",
                  },
                  "&:hover fieldset": {
                    borderColor: "rgba(76,206,172,0.3)",
                  },
                  "&.Mui-focused fieldset": {
                    borderColor: ACCENT,
                    borderWidth: 1,
                  },
                },
                "& input": {
                  color: "#fff",
                  fontSize: "0.9rem",
                  py: 1.5,
                },
                "& input::placeholder": {
                  color: "rgba(255,255,255,0.2)",
                  opacity: 1,
                },
              }}
            />

            <Box display="flex" justifyContent="flex-end" mb={3.5}>
              <Link
                href="#"
                underline="hover"
                sx={{
                  color: ACCENT,
                  fontSize: "0.78rem",
                  fontWeight: 500,
                  "&:hover": { color: "#70d8bd" },
                }}
              >
                Forgot Password?
              </Link>
            </Box>

            <Button
              type="submit"
              fullWidth
              variant="contained"
              disabled={loading}
              sx={{
                py: 1.6,
                borderRadius: "10px",
                background: loading
                  ? "rgba(76,206,172,0.3)"
                  : `linear-gradient(135deg, ${ACCENT} 0%, #2e7c67 100%)`,
                color: "#040509",
                fontWeight: 700,
                fontSize: "0.92rem",
                letterSpacing: "0.04em",
                textTransform: "none",
                boxShadow: "0 4px 24px rgba(76,206,172,0.25)",
                transition: "all 0.3s ease",
                "&:hover": {
                  background: `linear-gradient(135deg, #70d8bd 0%, #3da58a 100%)`,
                  boxShadow: "0 6px 32px rgba(76,206,172,0.35)",
                  transform: "translateY(-1px) scale(1)",
                },
                "&.Mui-disabled": {
                  color: "rgba(4,5,9,0.6)",
                },
              }}
            >
              {loading ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                  <CircularProgress size={20} sx={{ color: "#040509" }} />
                  <span>Signing In...</span>
                </Box>
              ) : (
                "Sign In"
              )}
            </Button>
          </Box>

          {/* Divider with "or" */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              my: 3.5,
            }}
          >
            <Box
              sx={{
                flex: 1,
                height: "1px",
                background: "rgba(255,255,255,0.06)",
              }}
            />
            <Typography
              sx={{
                color: "rgba(255,255,255,0.2)",
                fontSize: "0.72rem",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              Secured by
            </Typography>
            <Box
              sx={{
                flex: 1,
                height: "1px",
                background: "rgba(255,255,255,0.06)",
              }}
            />
          </Box>

          {/* Security badges */}
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              gap: 3,
            }}
          >
            {["256-bit SSL", "JWT Auth", "Role-Based"].map((badge) => (
              <Box
                key={badge}
                sx={{
                  px: 1.5,
                  py: 0.6,
                  borderRadius: "6px",
                  border: "1px solid rgba(255,255,255,0.06)",
                  backgroundColor: "rgba(255,255,255,0.02)",
                }}
              >
                <Typography
                  sx={{
                    color: "rgba(255,255,255,0.3)",
                    fontSize: "0.64rem",
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                  }}
                >
                  {badge}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>

        {/* Footer */}
        <Typography
          sx={{
            position: { md: "absolute" },
            bottom: { md: 30 },
            mt: { xs: 5, md: 0 },
            color: "rgba(255,255,255,0.18)",
            fontSize: "0.7rem",
            letterSpacing: "0.06em",
          }}
        >
          &copy; 2026 Pulsar Electronic Solutions | GRIDx
        </Typography>
      </Box>
    </Box>
  );
}
