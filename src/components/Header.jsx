import { Typography, Box, useTheme, Divider } from "@mui/material";
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
      <Divider sx={{ mt: "12px", backgroundColor: colors.greenAccent[300], opacity: 0.4 }} />
    </Box>
  );
};

export default Header;
