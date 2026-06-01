import { Typography, Box, useTheme } from "@mui/material";
import { tokens } from "../theme";

const Header = ({ title, subtitle }) => {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  return (
    <Box mb="12px" pt="40px">
      <Typography
        variant="h2"
        color={colors.grey[100]}
        fontWeight="bold"
        sx={{ mb: "4px" }}
      >
        {title}
      </Typography>
      <Typography variant="h5" color={colors.greenAccent[400]}>
        {subtitle}
      </Typography>
      <hr style={{
        border: "none",
        borderTop: `1px solid ${colors.greenAccent[300]}`,
        opacity: 0.5,
        margin: "12px -20px 0 -20px",
      }} />
    </Box>
  );
};

export default Header;
