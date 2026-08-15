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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import {
  Visibility,
  VisibilityOff,
  EmailOutlined,
  LockOutlined,
  SecurityOutlined,
} from "@mui/icons-material";
import { tokens } from "../theme";
import { useAuth } from "../context/AuthContext";
import { authAPI } from "../services/api";
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
      // Kept very low: the mesh now fills most of the panel, and a second
      // network of lines behind it at any real weight just reads as noise.
      opacity: 0.03,
      pointerEvents: "none",
    }}
  >
    <line x1="0" y1="120" x2="500" y2="120" stroke="#4cceac" strokeWidth="1" />
    <line x1="0" y1="300" x2="500" y2="300" stroke="#4cceac" strokeWidth="1" />
    <line x1="0" y1="480" x2="500" y2="480" stroke="#4cceac" strokeWidth="1" />
    <line x1="0" y1="660" x2="500" y2="660" stroke="#4cceac" strokeWidth="1" />
    <line x1="0" y1="780" x2="500" y2="780" stroke="#4cceac" strokeWidth="1" />
    <line x1="80" y1="0" x2="80" y2="900" stroke="#4cceac" strokeWidth="1" />
    <line x1="200" y1="0" x2="200" y2="900" stroke="#4cceac" strokeWidth="1" />
    <line x1="350" y1="0" x2="350" y2="900" stroke="#4cceac" strokeWidth="1" />
    <line x1="430" y1="0" x2="430" y2="900" stroke="#4cceac" strokeWidth="1" />
    <line x1="80" y1="120" x2="200" y2="300" stroke="#4cceac" strokeWidth="1.5" />
    <line x1="350" y1="300" x2="430" y2="480" stroke="#4cceac" strokeWidth="1.5" />
    <line x1="200" y1="480" x2="80" y2="660" stroke="#4cceac" strokeWidth="1.5" />
    <line x1="430" y1="660" x2="350" y2="780" stroke="#4cceac" strokeWidth="1.5" />
    {[
      [80, 120], [200, 120], [350, 120], [430, 120],
      [80, 300], [200, 300], [350, 300], [430, 300],
      [80, 480], [200, 480], [350, 480], [430, 480],
      [80, 660], [200, 660], [350, 660], [430, 660],
      [80, 780], [200, 780], [350, 780], [430, 780],
    ].map(([cx, cy], i) => (
      <circle key={i} cx={cx} cy={cy} r="3" fill="#4cceac" />
    ))}
    {[
      [200, 300], [350, 480], [80, 660], [430, 120],
    ].map(([cx, cy], i) => (
      <circle key={`lg-${i}`} cx={cx} cy={cy} r="6" fill="none" stroke="#4cceac" strokeWidth="1.5" />
    ))}
  </Box>
);

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

/* The scrolling three-phase oscilloscope trace that used to sit here has been
   removed along with its scopeScroll/scopeGlow keyframes. Two competing
   animations in one panel split the eye; the mesh is the stronger idea, so it
   now owns the space on its own. */

/* ---------------------------------------------------------------------------
 * MeshNetwork — the LoRa mesh, drawn as it actually behaves.
 *
 * Replaces the old "50 Hz / 230 V / 3-phase" spec strip. GRIDx meters really do
 * form a LoRa mesh and hop readings toward a gateway, so this shows the thing
 * the platform is rather than stating numbers about it.
 *
 * Nodes are drawn as small meter boxes, not generic dots, so they read as
 * hardware. The gateway is the ringed node on the right. The travelling pulses
 * follow the same edges the routing would, all converging on it.
 *
 * Some meters carry a Wi-Fi arc above the box. That is the point of the "one
 * complete solution" line: a meter backhauls over the LoRa mesh or over Wi-Fi,
 * so the diagram shows both paths rather than implying mesh is the only option.
 * ------------------------------------------------------------------------- */
const MESH_W = 560;
const MESH_H = 440;
const GATEWAY = { x: 486, y: 220 };

// Hand-placed rather than random so the layout is stable and legible across
// reloads. `wifi` marks the meters that show a Wi-Fi arc.
const METERS = [
  { x: 44, y: 60 }, { x: 128, y: 118 }, { x: 60, y: 190 },
  { x: 150, y: 42, wifi: true }, { x: 40, y: 300 }, { x: 132, y: 258 },
  { x: 72, y: 386 }, { x: 176, y: 340 }, { x: 160, y: 410 },
  { x: 238, y: 90 }, { x: 252, y: 176 }, { x: 246, y: 286, wifi: true },
  { x: 268, y: 396 }, { x: 338, y: 46 }, { x: 352, y: 138 },
  { x: 346, y: 240 }, { x: 330, y: 330 }, { x: 356, y: 408, wifi: true },
  { x: 424, y: 92 }, { x: 430, y: 330 },
];

// [fromIndex, toIndex] — -1 means the gateway. Roughly a routing tree: every
// meter has a path to the gateway, with a few redundant hops as a real mesh has.
const LINKS = [
  [0, 1], [3, 1], [2, 1], [1, 9], [9, 10], [10, 14], [14, 18], [18, -1],
  [2, 5], [4, 5], [5, 10], [5, 11], [11, 15], [15, -1],
  [6, 7], [8, 7], [7, 11], [12, 11], [12, 16], [16, 19], [19, -1],
  [13, 14], [17, 16], [10, 15],
];

const nodeAt = (i) => (i === -1 ? GATEWAY : METERS[i]);

// Edges that carry a visible pulse, with staggered starts so traffic looks
// asynchronous rather than choreographed.
const PULSES = [
  { link: [0, 1], delay: 0 }, { link: [1, 9], delay: 0.8 },
  { link: [9, 10], delay: 1.5 }, { link: [10, 14], delay: 2.2 },
  { link: [14, 18], delay: 2.9 }, { link: [18, -1], delay: 3.6 },
  { link: [4, 5], delay: 0.4 }, { link: [5, 11], delay: 1.2 },
  { link: [11, 15], delay: 2.0 }, { link: [15, -1], delay: 2.7 },
  { link: [6, 7], delay: 0.6 }, { link: [7, 11], delay: 1.4 },
  { link: [12, 16], delay: 1.9 }, { link: [16, 19], delay: 2.6 },
  { link: [19, -1], delay: 3.3 }, { link: [13, 14], delay: 1.1 },
];

function MeterNode({ x, y, i, wifi }) {
  return (
    <g opacity="0.9">
      <rect
        x={x - 7} y={y - 8} width="14" height="16" rx="3.5"
        fill="#0c101b" stroke="#4cceac" strokeWidth="1.5"
      />
      <line x1={x - 3.5} y1={y - 3} x2={x + 3.5} y2={y - 3} stroke="#4cceac" strokeWidth="1.3" opacity="0.85" />
      <circle cx={x} cy={y + 3.5} r="1.8" fill="#4cceac">
        <animate
          attributeName="opacity" values="0.25;1;0.25" dur="3s"
          begin={`${(i % 5) * 0.6}s`} repeatCount="indefinite"
        />
      </circle>

      {/* Wi-Fi backhaul, on the meters that use it instead of a mesh hop */}
      {wifi && (
        <g stroke="#6870fa" fill="none" strokeLinecap="round">
          {[5, 9].map((r, k) => (
            <path
              key={`w${k}`}
              d={`M${x - r},${y - 11} A ${r},${r} 0 0 1 ${x + r},${y - 11}`}
              strokeWidth="1.4"
              opacity="0.7"
            >
              <animate
                attributeName="opacity" values="0.15;0.85;0.15" dur="2.4s"
                begin={`${k * 0.3 + (i % 3) * 0.5}s`} repeatCount="indefinite"
              />
            </path>
          ))}
        </g>
      )}
    </g>
  );
}

function MeshNetwork() {
  return (
    <Box
      sx={{
        width: "100%",
        // Takes every pixel the headline leaves behind rather than sitting in a
        // fixed box, so the mesh is the panel rather than an illustration in it.
        flex: 1,
        minHeight: { xs: 260, md: 0 },
        display: "flex",
        mt: { xs: 3, md: 3 },
        animation: "fadeIn 1s ease 0.55s both",
      }}
    >
      <Box
        component="svg"
        viewBox={`0 0 ${MESH_W} ${MESH_H}`}
        preserveAspectRatio="xMidYMid meet"
        sx={{ width: "100%", height: "100%", display: "block", overflow: "visible" }}
      >
        {/* links */}
        {LINKS.map(([a, b], i) => {
          const p = nodeAt(a);
          const q = nodeAt(b);
          return (
            <line
              key={`l${i}`}
              x1={p.x} y1={p.y} x2={q.x} y2={q.y}
              stroke="#4cceac" strokeWidth="1.1" opacity="0.28"
            />
          );
        })}

        {/* travelling packets, each following its own link toward the gateway */}
        {PULSES.map(({ link: [a, b], delay }, i) => {
          const p = nodeAt(a);
          const q = nodeAt(b);
          return (
            <circle key={`p${i}`} r="3" fill="#4cceac" opacity="0.95">
              <animateMotion
                path={`M${p.x},${p.y} L${q.x},${q.y}`}
                dur="1.6s"
                begin={`${delay}s`}
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity" values="0;1;1;0" dur="1.6s"
                begin={`${delay}s`} repeatCount="indefinite"
              />
            </circle>
          );
        })}

        {METERS.map((m, i) => (
          <MeterNode key={`m${i}`} x={m.x} y={m.y} i={i} wifi={m.wifi} />
        ))}

        {/* gateway — ringed, so it reads as the uplink rather than another meter */}
        <g>
          {[16, 25, 34].map((r, i) => (
            <circle
              key={`g${i}`} cx={GATEWAY.x} cy={GATEWAY.y} r={r}
              fill="none" stroke="#6870fa" strokeWidth="1.2" opacity="0.35"
            >
              <animate
                attributeName="r" values={`${r};${r + 12};${r}`} dur="3.2s"
                begin={`${i * 0.5}s`} repeatCount="indefinite"
              />
              <animate
                attributeName="opacity" values="0.4;0;0.4" dur="3.2s"
                begin={`${i * 0.5}s`} repeatCount="indefinite"
              />
            </circle>
          ))}
          <circle cx={GATEWAY.x} cy={GATEWAY.y} r="10" fill="#6870fa" opacity="0.9" />
          <circle cx={GATEWAY.x} cy={GATEWAY.y} r="4.5" fill="#0c101b" />
        </g>
      </Box>
    </Box>
  );
}

/* MUI dark input styling shared across fields */
const darkInputSx = (accent, colors) => ({
  "& .MuiOutlinedInput-root": {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: "10px",
    "& fieldset": { borderColor: "rgba(255,255,255,0.08)" },
    "&:hover fieldset": { borderColor: "rgba(76,206,172,0.3)" },
    "&.Mui-focused fieldset": { borderColor: accent, borderWidth: 1 },
  },
  "& input": { color: "#fff", fontSize: "0.9rem", py: 1.5 },
  "& input::placeholder": { color: colors.grey[500], opacity: 1 },
});

/* ==================================================================== */
/* Login Page                                                           */
/* ==================================================================== */
export default function Login() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const navigate = useNavigate();
  const { login, verify2FA } = useAuth();

  // Login form state
  const [formData, setFormData] = useState({ Email: "", Password: "" });
  const [formErrors, setFormErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // 2FA state
  const [show2FA, setShow2FA] = useState(false);
  const [twoFACode, setTwoFACode] = useState("");
  const [twoFAData, setTwoFAData] = useState(null);
  const [twoFAError, setTwoFAError] = useState("");
  const [twoFALoading, setTwoFALoading] = useState(false);

  // Forgot password state
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState(1); // 1=email, 2=pin, 3=new password
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotPin, setForgotPin] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [forgotSuccess, setForgotSuccess] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

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
      const result = await login(formData.Email, formData.Password);

      // Check if 2FA is required
      if (result && result.requires2FA) {
        setTwoFAData(result);
        setShow2FA(true);
        setLoading(false);
        return;
      }

      // Block technicians from the main dashboard
      if (result && result.AccessLevel === "TECHNICIAN") {
        sessionStorage.removeItem("token");
        sessionStorage.removeItem("user");
        setFormErrors({ general: "This account is for the commissioning app only. You do not have access to the main dashboard." });
        setLoading(false);
        return;
      }

      navigate("/");
    } catch (err) {
      setFormErrors({ general: err.message || "Incorrect email or password" });
    } finally {
      setLoading(false);
    }
  };

  const handle2FASubmit = async () => {
    if (!twoFACode || twoFACode.length !== 6) {
      setTwoFAError("Please enter a 6-digit code");
      return;
    }
    setTwoFALoading(true);
    setTwoFAError("");
    try {
      await verify2FA(twoFAData.user.Admin_ID, twoFACode, twoFAData.tempToken);
      navigate("/");
    } catch (err) {
      setTwoFAError(err.message || "Invalid 2FA code");
    } finally {
      setTwoFALoading(false);
    }
  };

  // Forgot password handlers
  const handleForgotStep1 = async () => {
    if (!forgotEmail) { setForgotError("Email is required"); return; }
    setForgotLoading(true);
    setForgotError("");
    try {
      await authAPI.forgotPassword(forgotEmail);
      setForgotStep(2);
      setForgotSuccess("Verification PIN sent to your email.");
    } catch (err) {
      setForgotError(err.message || "Failed to send PIN");
    } finally {
      setForgotLoading(false);
    }
  };

  const handleForgotStep2 = async () => {
    if (!forgotPin) { setForgotError("PIN is required"); return; }
    setForgotLoading(true);
    setForgotError("");
    try {
      await authAPI.verifyPin(forgotEmail, forgotPin);
      setForgotStep(3);
      setForgotSuccess("PIN verified. Enter your new password.");
    } catch (err) {
      setForgotError(err.message || "Invalid or expired PIN");
    } finally {
      setForgotLoading(false);
    }
  };

  const handleForgotStep3 = async () => {
    if (!forgotNewPassword || forgotNewPassword.length < 6) {
      setForgotError("Password must be at least 6 characters");
      return;
    }
    setForgotLoading(true);
    setForgotError("");
    try {
      await authAPI.resetForgottenPassword(forgotEmail, forgotPin, forgotNewPassword);
      setForgotSuccess("Password reset successful! You can now sign in.");
      setTimeout(() => {
        setForgotOpen(false);
        setForgotStep(1);
        setForgotEmail("");
        setForgotPin("");
        setForgotNewPassword("");
        setForgotSuccess("");
      }, 2000);
    } catch (err) {
      setForgotError(err.message || "Failed to reset password");
    } finally {
      setForgotLoading(false);
    }
  };

  const closeForgot = () => {
    setForgotOpen(false);
    setForgotStep(1);
    setForgotEmail("");
    setForgotPin("");
    setForgotNewPassword("");
    setForgotError("");
    setForgotSuccess("");
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
          // Was "center". The brand lockup and headline now sit near the top and
          // the mesh takes the space underneath, instead of the whole group
          // floating in the middle of the panel.
          justifyContent: "flex-start",
          px: { xs: 4, md: 7 },
          py: { xs: 5, md: 6 },
          overflow: "hidden",
        }}
      >
        <CircuitBG />
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

        <Box
          sx={{
            position: "relative",
            zIndex: 2,
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minHeight: 0,
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              mb: 3,
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
              <img src={logoImage} alt="GRIDx" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </Box>
            <Box>
              <Typography sx={{ color: "#fff", fontWeight: 800, fontSize: "1.6rem", letterSpacing: "0.08em", lineHeight: 1 }}>
                GRIDx
              </Typography>
              <Typography sx={{ color: ACCENT, fontSize: "0.68rem", fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", mt: 0.3 }}>
                Smart Metering Platform
              </Typography>
            </Box>
          </Box>

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
            Every meter.
            <br />
            One screen.
          </Typography>

          <Typography
            sx={{
              color: colors.grey[400],
              fontSize: "0.85rem",
              lineHeight: 1.6,
              maxWidth: 380,
              animation: "slideUp 0.5s ease 0.3s both",
            }}
          >
            One meter, one complete solution — LoRa mesh and Wi-Fi connectivity
            built in.
          </Typography>

          <MeshNetwork />
        </Box>
      </Box>

      {/* ====== RIGHT PANEL ====== */}
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
        {/* Meter image */}
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
          {/* ---- 2FA VERIFICATION STEP ---- */}
          {show2FA ? (
            <>
              <Box sx={{ textAlign: "center", mb: 3 }}>
                <SecurityOutlined sx={{ fontSize: 48, color: ACCENT, mb: 1 }} />
                <Typography sx={{ color: "#fff", fontWeight: 700, fontSize: "1.4rem", mb: 0.5 }}>
                  Two-Factor Authentication
                </Typography>
                <Typography sx={{ color: colors.grey[400], fontSize: "0.85rem" }}>
                  Enter the 6-digit code from your authenticator app
                </Typography>
              </Box>

              {twoFAError && (
                <Alert
                  severity="error"
                  onClose={() => setTwoFAError("")}
                  sx={{
                    mb: 3,
                    backgroundColor: "rgba(219,79,74,0.1)",
                    border: "1px solid rgba(219,79,74,0.3)",
                    color: "#f1b9b7",
                    "& .MuiAlert-icon": { color: "#db4f4a" },
                  }}
                >
                  {twoFAError}
                </Alert>
              )}

              <TextField
                fullWidth
                value={twoFACode}
                onChange={(e) => setTwoFACode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                placeholder="000000"
                autoFocus
                inputProps={{ maxLength: 6, style: { textAlign: "center", letterSpacing: "0.5em", fontSize: "1.5rem" } }}
                sx={{ ...darkInputSx(ACCENT, colors), mb: 3 }}
                onKeyDown={(e) => { if (e.key === "Enter") handle2FASubmit(); }}
              />

              <Button
                fullWidth
                variant="contained"
                disabled={twoFALoading}
                onClick={handle2FASubmit}
                sx={{
                  py: 1.6,
                  borderRadius: "10px",
                  background: twoFALoading ? "rgba(76,206,172,0.3)" : `linear-gradient(135deg, ${ACCENT} 0%, #2e7c67 100%)`,
                  color: "#040509",
                  fontWeight: 700,
                  fontSize: "0.92rem",
                  textTransform: "none",
                  boxShadow: "0 4px 24px rgba(76,206,172,0.25)",
                  "&:hover": { background: `linear-gradient(135deg, #70d8bd 0%, #3da58a 100%)` },
                  "&.Mui-disabled": { color: "rgba(4,5,9,0.6)" },
                  mb: 2,
                }}
              >
                {twoFALoading ? (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                    <CircularProgress size={20} sx={{ color: "#040509" }} />
                    <span>Verifying...</span>
                  </Box>
                ) : (
                  "Verify Code"
                )}
              </Button>

              <Button
                fullWidth
                onClick={() => { setShow2FA(false); setTwoFACode(""); setTwoFAError(""); }}
                sx={{ color: colors.grey[400], textTransform: "none" }}
              >
                Back to Sign In
              </Button>
            </>
          ) : (
            <>
              {/* ---- NORMAL LOGIN FORM ---- */}
              <Typography sx={{ color: "#fff", fontWeight: 700, fontSize: "1.6rem", mb: 0.5 }}>
                Welcome back
              </Typography>
              <Typography sx={{ color: colors.grey[400], fontSize: "0.85rem", mb: 4 }}>
                Sign in to access your metering dashboard
              </Typography>

              {formErrors.general && (
                <Alert
                  severity="error"
                  onClose={() => setFormErrors((prev) => ({ ...prev, general: "" }))}
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

              <Box component="form" onSubmit={handleSubmit} noValidate>
                <Typography sx={{ color: colors.grey[400], fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", mb: 0.8 }}>
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
                        <EmailOutlined sx={{ color: colors.grey[500], fontSize: 20 }} />
                      </InputAdornment>
                    ),
                  }}
                  sx={{ ...darkInputSx(ACCENT, colors), mb: 3 }}
                />

                <Typography sx={{ color: colors.grey[400], fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", mb: 0.8 }}>
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
                        <LockOutlined sx={{ color: colors.grey[500], fontSize: 20 }} />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowPassword((s) => !s)}
                          edge="end"
                          sx={{ color: colors.grey[500] }}
                        >
                          {showPassword ? <VisibilityOff sx={{ fontSize: 20 }} /> : <Visibility sx={{ fontSize: 20 }} />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                  sx={{ ...darkInputSx(ACCENT, colors), mb: 1.5 }}
                />

                <Box display="flex" justifyContent="flex-end" mb={3.5}>
                  <Link
                    component="button"
                    type="button"
                    onClick={() => setForgotOpen(true)}
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
                    background: loading ? "rgba(76,206,172,0.3)" : `linear-gradient(135deg, ${ACCENT} 0%, #2e7c67 100%)`,
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
                    "&.Mui-disabled": { color: "rgba(4,5,9,0.6)" },
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

              {/* The "Secured by / 256-bit SSL / JWT Auth / 2FA Ready /
                  Role-Based" strip that sat here has been removed. Those badges
                  asserted things a visitor cannot check, and "2FA Ready" in
                  particular says nothing — the padlock in the address bar
                  already carries the TLS claim honestly. */}
            </>
          )}
        </Box>

        {/* Footer */}
        <Typography
          sx={{
            position: { md: "absolute" },
            bottom: { md: 30 },
            mt: { xs: 5, md: 0 },
            color: colors.grey[500],
            fontSize: "0.7rem",
            letterSpacing: "0.06em",
          }}
        >
          &copy; 2026 Pulsar Electronic Solutions | GRIDx
        </Typography>
      </Box>

      {/* ====== FORGOT PASSWORD DIALOG ====== */}
      <Dialog
        open={forgotOpen}
        onClose={closeForgot}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            background: "linear-gradient(180deg, #101624 0%, #0c101b 100%)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "12px",
          },
        }}
      >
        <DialogTitle sx={{ color: "#fff", fontWeight: 700 }}>
          {forgotStep === 1 && "Reset Password"}
          {forgotStep === 2 && "Enter Verification PIN"}
          {forgotStep === 3 && "Set New Password"}
        </DialogTitle>
        <DialogContent>
          {forgotError && (
            <Alert severity="error" sx={{ mb: 2, backgroundColor: "rgba(219,79,74,0.1)", border: "1px solid rgba(219,79,74,0.3)", color: "#f1b9b7" }}>
              {forgotError}
            </Alert>
          )}
          {forgotSuccess && (
            <Alert severity="success" sx={{ mb: 2, backgroundColor: "rgba(76,206,172,0.1)", border: "1px solid rgba(76,206,172,0.3)", color: "#4cceac" }}>
              {forgotSuccess}
            </Alert>
          )}

          {forgotStep === 1 && (
            <>
              <Typography sx={{ color: colors.grey[400], fontSize: "0.85rem", mb: 2 }}>
                Enter your email address and we will send you a verification PIN.
              </Typography>
              <TextField
                fullWidth
                value={forgotEmail}
                onChange={(e) => { setForgotEmail(e.target.value); setForgotError(""); }}
                placeholder="your.email@company.com"
                sx={darkInputSx(ACCENT, colors)}
              />
            </>
          )}

          {forgotStep === 2 && (
            <>
              <Typography sx={{ color: colors.grey[400], fontSize: "0.85rem", mb: 2 }}>
                A 6-digit PIN was sent to {forgotEmail}. Enter it below.
              </Typography>
              <TextField
                fullWidth
                value={forgotPin}
                onChange={(e) => { setForgotPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 6)); setForgotError(""); }}
                placeholder="000000"
                inputProps={{ maxLength: 6, style: { textAlign: "center", letterSpacing: "0.3em", fontSize: "1.3rem" } }}
                sx={darkInputSx(ACCENT, colors)}
              />
            </>
          )}

          {forgotStep === 3 && (
            <>
              <Typography sx={{ color: colors.grey[400], fontSize: "0.85rem", mb: 2 }}>
                Enter your new password (minimum 6 characters).
              </Typography>
              <TextField
                fullWidth
                type="password"
                value={forgotNewPassword}
                onChange={(e) => { setForgotNewPassword(e.target.value); setForgotError(""); }}
                placeholder="New password"
                sx={darkInputSx(ACCENT, colors)}
              />
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeForgot} sx={{ color: colors.grey[400], textTransform: "none" }}>
            Cancel
          </Button>
          <Button
            onClick={
              forgotStep === 1 ? handleForgotStep1 :
              forgotStep === 2 ? handleForgotStep2 :
              handleForgotStep3
            }
            disabled={forgotLoading}
            variant="contained"
            sx={{
              background: `linear-gradient(135deg, ${ACCENT} 0%, #2e7c67 100%)`,
              color: "#040509",
              fontWeight: 700,
              textTransform: "none",
              "&:hover": { background: `linear-gradient(135deg, #70d8bd 0%, #3da58a 100%)` },
            }}
          >
            {forgotLoading ? <CircularProgress size={20} sx={{ color: "#040509" }} /> :
             forgotStep === 1 ? "Send PIN" :
             forgotStep === 2 ? "Verify PIN" :
             "Reset Password"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
