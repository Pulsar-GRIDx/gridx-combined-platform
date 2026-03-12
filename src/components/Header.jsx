import { Typography, Box, useTheme } from "@mui/material";
import { tokens } from "../theme";
import Divider from '@mui/material/Divider';

const Header = ({ title, subtitle }) => {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  return (
    <Box mb="30px">
      <Typography
        variant="h2"
        color={colors.grey[100]}
        fontWeight="bold"
        sx={{ m: "70px 0 5px 0" }}
      >
        {title}
      </Typography>
      <Typography variant="h5" color={colors.greenAccent[400]}>
        {subtitle}
      </Typography>
      <Divider sx={{ m: "15px 0 0px 0px", backgroundColor: colors.greenAccent[300] }} />
    </Box>
  );
};

export default Header;
