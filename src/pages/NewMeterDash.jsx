import { useState, useEffect } from "react";
import {
  Box, Typography, useTheme, Tabs, Tab, TextField, Button, Grid,
  Stepper, Step, StepLabel, Snackbar, Alert, Container, Paper, MenuItem,
} from "@mui/material";
import { tokens } from "../theme";
import Header from "../components/Header";
import { meterRegistrationAPI } from "../services/api";
import { cities, category, suburbsByCity } from "../data/MapData";

/* ---- Tab Panel ---- */
function TabPanel({ children, value, index }) {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ p: 2 }}>{children}</Box>}
    </div>
  );
}

/* ===== ADD METER FORM ===== */
function AddMeterForm() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const [activeStep, setActiveStep] = useState(0);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(false);
  const [availableSuburbs, setAvailableSuburbs] = useState([]);
  const [form, setForm] = useState({
    DRN: "", Surname: "", Name: "", Suburb: "", City: "",
    Streetname: "", Housenumber: "", Simnumber: "", Usercategory: "",
    Meterlng: "", Meterlat: "", Transformerlng: "", Transformerlat: "", TransformerDRN: "",
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (form.City) {
      setAvailableSuburbs(suburbsByCity[form.City] || ["No Suburb"]);
      setForm((p) => ({ ...p, Suburb: "" }));
    } else {
      setAvailableSuburbs([]);
    }
  }, [form.City]);

  const handleChange = (field) => (e) => {
    setForm((p) => ({ ...p, [field]: e.target.value }));
    if (errors[field]) setErrors((p) => ({ ...p, [field]: "" }));
  };

  const validateStep1 = () => {
    const e = {};
    if (!form.DRN) e.DRN = "DRN is required";
    if (!form.Surname.trim()) e.Surname = "Surname is required";
    if (!form.Name.trim()) e.Name = "Name is required";
    if (!form.City) e.City = "City is required";
    if (!form.Suburb) e.Suburb = "Suburb is required";
    if (!form.Streetname.trim()) e.Streetname = "Street name is required";
    if (!form.Housenumber) e.Housenumber = "House number is required";
    if (!form.Simnumber || form.Simnumber.length < 6) e.Simnumber = "Valid SIM number required";
    if (!form.Usercategory) e.Usercategory = "Category is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep2 = () => {
    const e = {};
    if (!form.Meterlat) e.Meterlat = "Meter latitude required";
    if (!form.Meterlng) e.Meterlng = "Meter longitude required";
    if (!form.TransformerDRN) e.TransformerDRN = "Transformer DRN required";
    if (!form.Transformerlat) e.Transformerlat = "Transformer latitude required";
    if (!form.Transformerlng) e.Transformerlng = "Transformer longitude required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => {
    if (activeStep === 0 && validateStep1()) setActiveStep(1);
    else if (activeStep === 1 && validateStep2()) setActiveStep(2);
  };

  const handleFinish = async () => {
    try {
      await meterRegistrationAPI.insertMeter(form);
      setSuccess(true);
      setActiveStep(0);
      setForm({
        DRN: "", Surname: "", Name: "", Suburb: "", City: "",
        Streetname: "", Housenumber: "", Simnumber: "", Usercategory: "",
        Meterlng: "", Meterlat: "", Transformerlng: "", Transformerlat: "", TransformerDRN: "",
      });
    } catch {
      setError(true);
    }
  };

  return (
    <Container component="main" maxWidth="sm" sx={{ mb: 4 }}>
      <Paper elevation={1} sx={{ my: 3, p: 3, backgroundColor: colors.primary[400] }}>
        <Typography variant="h4" align="center" sx={{ p: 2, color: colors.grey[100] }}>
          New System Meter
        </Typography>
        <Stepper activeStep={activeStep} sx={{ mb: 3 }}>
          <Step><StepLabel>Meter Profile</StepLabel></Step>
          <Step><StepLabel>Meter Location</StepLabel></Step>
          <Step><StepLabel>Review</StepLabel></Step>
        </Stepper>

        {activeStep === 0 && (
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField fullWidth label="DRN" value={form.DRN} onChange={handleChange("DRN")}
                error={!!errors.DRN} helperText={errors.DRN} />
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth label="Surname" value={form.Surname} onChange={handleChange("Surname")}
                error={!!errors.Surname} helperText={errors.Surname} />
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth label="Name" value={form.Name} onChange={handleChange("Name")}
                error={!!errors.Name} helperText={errors.Name} />
            </Grid>
            <Grid item xs={12}>
              <TextField select fullWidth label="City" value={form.City} onChange={handleChange("City")}
                error={!!errors.City} helperText={errors.City}>
                {cities.map((c) => <MenuItem key={c.id} value={c.name}>{c.name}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField select fullWidth label="Suburb" value={form.Suburb} onChange={handleChange("Suburb")}
                error={!!errors.Suburb} helperText={errors.Suburb} disabled={!form.City}>
                {availableSuburbs.map((s, i) => <MenuItem key={i} value={s}>{s}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth label="Street Name" value={form.Streetname} onChange={handleChange("Streetname")}
                error={!!errors.Streetname} helperText={errors.Streetname} />
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth label="House Number" value={form.Housenumber} onChange={handleChange("Housenumber")}
                error={!!errors.Housenumber} helperText={errors.Housenumber} />
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth label="SIM Number" value={form.Simnumber} onChange={handleChange("Simnumber")}
                error={!!errors.Simnumber} helperText={errors.Simnumber} />
            </Grid>
            <Grid item xs={6}>
              <TextField select fullWidth label="User Category" value={form.Usercategory} onChange={handleChange("Usercategory")}
                error={!!errors.Usercategory} helperText={errors.Usercategory}>
                {category.map((c) => <MenuItem key={c.id} value={c.name}>{c.name}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <Button variant="contained" color="secondary" onClick={handleNext}>Next</Button>
            </Grid>
          </Grid>
        )}

        {activeStep === 1 && (
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Typography variant="h6" color={colors.grey[100]} gutterBottom>Meter Coordinates</Typography>
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth label="Meter Latitude" value={form.Meterlat} onChange={handleChange("Meterlat")}
                error={!!errors.Meterlat} helperText={errors.Meterlat} />
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth label="Meter Longitude" value={form.Meterlng} onChange={handleChange("Meterlng")}
                error={!!errors.Meterlng} helperText={errors.Meterlng} />
            </Grid>
            <Grid item xs={12} sx={{ mt: 2 }}>
              <Typography variant="h6" color={colors.grey[100]} gutterBottom>Transformer Information</Typography>
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth label="Transformer DRN" value={form.TransformerDRN} onChange={handleChange("TransformerDRN")}
                error={!!errors.TransformerDRN} helperText={errors.TransformerDRN} />
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth label="Transformer Latitude" value={form.Transformerlat} onChange={handleChange("Transformerlat")}
                error={!!errors.Transformerlat} helperText={errors.Transformerlat} />
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth label="Transformer Longitude" value={form.Transformerlng} onChange={handleChange("Transformerlng")}
                error={!!errors.Transformerlng} helperText={errors.Transformerlng} />
            </Grid>
            <Grid item xs={6}>
              <Button variant="outlined" onClick={() => setActiveStep(0)}>Back</Button>
            </Grid>
            <Grid item xs={6}>
              <Button variant="contained" color="secondary" onClick={handleNext}>Next</Button>
            </Grid>
          </Grid>
        )}

        {activeStep === 2 && (
          <Box>
            <Typography variant="h5" color={colors.grey[100]} mb={2}>Review Information</Typography>
            {[
              ["DRN", form.DRN], ["Name", `${form.Name} ${form.Surname}`],
              ["City", form.City], ["Suburb", form.Suburb],
              ["Street", `${form.Housenumber} ${form.Streetname}`],
              ["SIM Number", form.Simnumber], ["Category", form.Usercategory],
              ["Meter Location", `${form.Meterlat}, ${form.Meterlng}`],
              ["Transformer DRN", form.TransformerDRN],
              ["Transformer Location", `${form.Transformerlat}, ${form.Transformerlng}`],
            ].map(([label, val]) => (
              <Box key={label} display="flex" justifyContent="space-between" py={0.8}
                borderBottom={`1px solid ${colors.grey[700]}`}>
                <Typography variant="body1" fontWeight={600} color={colors.blueAccent[200]}>{label}</Typography>
                <Typography variant="body1" color={colors.grey[100]}>{val || "—"}</Typography>
              </Box>
            ))}
            <Box display="flex" justifyContent="space-between" mt={3}>
              <Button variant="outlined" onClick={() => setActiveStep(1)}>Back</Button>
              <Button variant="contained" color="secondary" onClick={handleFinish}>Submit</Button>
            </Box>
          </Box>
        )}

        <Snackbar open={success} autoHideDuration={3000} onClose={() => setSuccess(false)}>
          <Alert severity="success">Meter added to the system!</Alert>
        </Snackbar>
        <Snackbar open={error} autoHideDuration={3000} onClose={() => setError(false)}>
          <Alert severity="error">Something went wrong, try again later</Alert>
        </Snackbar>
      </Paper>
    </Container>
  );
}

/* ===== ADD TRANSFORMER FORM ===== */
function AddTransformerForm() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const [activeStep, setActiveStep] = useState(0);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(false);
  const [form, setForm] = useState({
    DRN: "", LocationName: "", Name: "", City: "", Type: "",
    pLat: "", pLng: "", Status: "", PowerSupply: "", powerRating: "",
  });
  const [errors, setErrors] = useState({});

  const handleChange = (field) => (e) => {
    setForm((p) => ({ ...p, [field]: e.target.value }));
    if (errors[field]) setErrors((p) => ({ ...p, [field]: "" }));
  };

  const validateStep1 = () => {
    const e = {};
    if (!form.DRN) e.DRN = "DRN required";
    if (!form.LocationName.trim()) e.LocationName = "Location name required";
    if (!form.Name.trim()) e.Name = "Name required";
    if (!form.City) e.City = "City required";
    if (!form.Type.trim()) e.Type = "Type required";
    if (!form.pLat) e.pLat = "Latitude required";
    if (!form.pLng) e.pLng = "Longitude required";
    if (!form.Status.trim()) e.Status = "Status required";
    if (!form.PowerSupply.trim()) e.PowerSupply = "Power supply required";
    if (!form.powerRating.trim()) e.powerRating = "Power rating required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => {
    if (validateStep1()) setActiveStep(1);
  };

  const handleFinish = async () => {
    try {
      await meterRegistrationAPI.insertTransformer({ TransformerData: form });
      setSuccess(true);
      setActiveStep(0);
      setForm({
        DRN: "", LocationName: "", Name: "", City: "", Type: "",
        pLat: "", pLng: "", Status: "", PowerSupply: "", powerRating: "",
      });
    } catch {
      setError(true);
    }
  };

  const namibianCities = [
    "Windhoek", "Swakopmund", "Walvis Bay", "Oshakati", "Rundu",
    "Katima Mulilo", "Otjiwarongo", "Grootfontein", "Keetmanshoop",
    "Mariental", "Okahandja", "Ondangwa", "Outjo", "Gobabis",
    "Lüderitz", "Omaruru", "Karibib", "Tsumeb", "Rehoboth", "Okakarara",
  ];

  return (
    <Container component="main" maxWidth="sm" sx={{ mb: 4 }}>
      <Paper elevation={1} sx={{ my: 3, p: 3, backgroundColor: colors.primary[400] }}>
        <Typography variant="h4" align="center" sx={{ p: 2, color: colors.grey[100] }}>
          New Transformer
        </Typography>
        <Stepper activeStep={activeStep} sx={{ mb: 3 }}>
          <Step><StepLabel>Transformer Profile</StepLabel></Step>
          <Step><StepLabel>Review</StepLabel></Step>
        </Stepper>

        {activeStep === 0 && (
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField fullWidth label="DRN" value={form.DRN} onChange={handleChange("DRN")}
                error={!!errors.DRN} helperText={errors.DRN} />
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth label="Location Name" value={form.LocationName} onChange={handleChange("LocationName")}
                error={!!errors.LocationName} helperText={errors.LocationName} />
            </Grid>
            <Grid item xs={6}>
              <TextField select fullWidth label="City" value={form.City} onChange={handleChange("City")}
                error={!!errors.City} helperText={errors.City}>
                {namibianCities.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth label="Name" value={form.Name} onChange={handleChange("Name")}
                error={!!errors.Name} helperText={errors.Name} />
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth label="Latitude" value={form.pLat} onChange={handleChange("pLat")}
                error={!!errors.pLat} helperText={errors.pLat} />
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth label="Longitude" value={form.pLng} onChange={handleChange("pLng")}
                error={!!errors.pLng} helperText={errors.pLng} />
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth label="Status" value={form.Status} onChange={handleChange("Status")}
                error={!!errors.Status} helperText={errors.Status} />
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth label="Power Supply" value={form.PowerSupply} onChange={handleChange("PowerSupply")}
                error={!!errors.PowerSupply} helperText={errors.PowerSupply} />
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth label="Power Rating" value={form.powerRating} onChange={handleChange("powerRating")}
                error={!!errors.powerRating} helperText={errors.powerRating} />
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth label="Type" value={form.Type} onChange={handleChange("Type")}
                error={!!errors.Type} helperText={errors.Type} />
            </Grid>
            <Grid item xs={12}>
              <Button variant="contained" color="secondary" onClick={handleNext}>Next</Button>
            </Grid>
          </Grid>
        )}

        {activeStep === 1 && (
          <Box>
            <Typography variant="h5" color={colors.grey[100]} mb={2}>Review Transformer Information</Typography>
            {Object.entries(form).map(([key, val]) => (
              <Box key={key} display="flex" justifyContent="space-between" py={0.8}
                borderBottom={`1px solid ${colors.grey[700]}`}>
                <Typography variant="body1" fontWeight={600} color={colors.blueAccent[200]}>{key}</Typography>
                <Typography variant="body1" color={colors.grey[100]}>{val || "—"}</Typography>
              </Box>
            ))}
            <Box display="flex" justifyContent="space-between" mt={3}>
              <Button variant="outlined" onClick={() => setActiveStep(0)}>Back</Button>
              <Button variant="contained" color="secondary" onClick={handleFinish}>Submit</Button>
            </Box>
          </Box>
        )}

        <Snackbar open={success} autoHideDuration={3000} onClose={() => setSuccess(false)}>
          <Alert severity="success">Transformer added to the system!</Alert>
        </Snackbar>
        <Snackbar open={error} autoHideDuration={3000} onClose={() => setError(false)}>
          <Alert severity="error">Something went wrong, try again later</Alert>
        </Snackbar>
      </Paper>
    </Container>
  );
}

/* ===== MAIN PAGE ===== */
export default function NewMeterDash() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const [tab, setTab] = useState(0);

  return (
    <Box m="20px">
      <Header title="Manage Meters" subtitle="GRIDx Meter Management" />
      <Box sx={{ backgroundColor: colors.primary[400] }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} textColor="secondary">
          <Tab label="New Meter" />
          <Tab label="New Transformer" />
        </Tabs>
        <TabPanel value={tab} index={0}>
          <AddMeterForm />
        </TabPanel>
        <TabPanel value={tab} index={1}>
          <AddTransformerForm />
        </TabPanel>
      </Box>
    </Box>
  );
}
