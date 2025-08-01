import * as React from "react";
import { SignInPage } from "@toolpad/core/SignInPage";
import { useNavigate } from "react-router";
import { useSession } from "../hooks/session";
import authService from "../services/auth";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import {
  TextField,
  Link,
  Button,
  FormControl,
  InputLabel,
  OutlinedInput,
  InputAdornment,
  IconButton,
} from "@mui/material";
import Typography from "@mui/material/Typography";

function CustomEmailField() {
  return (
    <TextField
      label="Username"
      name="username"
      size="small"
      required
      fullWidth
      variant="outlined"
    />
  );
}

function CustomPasswordField() {
  const [showPassword, setShowPassword] = React.useState(false);

  const handleClickShowPassword = () => setShowPassword((show) => !show);

  const handleMouseDownPassword = (event: React.MouseEvent) => {
    event.preventDefault();
  };

  return (
    <FormControl sx={{ my: 2 }} fullWidth variant="outlined">
      <InputLabel size="small" htmlFor="outlined-adornment-password">
        Password
      </InputLabel>
      <OutlinedInput
        id="outlined-adornment-password"
        type={showPassword ? "text" : "password"}
        name="password"
        size="small"
        endAdornment={
          <InputAdornment position="end">
            <IconButton
              aria-label="toggle password visibility"
              onClick={handleClickShowPassword}
              onMouseDown={handleMouseDownPassword}
              edge="end"
              size="small"
            >
              {showPassword ? (
                <VisibilityOff fontSize="inherit" />
              ) : (
                <Visibility fontSize="inherit" />
              )}
            </IconButton>
          </InputAdornment>
        }
        label="Password"
      />
    </FormControl>
  );
}

function SignUpLink() {
  return (
    <Link href="/sign-up" variant="body2">
      Sign up
    </Link>
  );
}

function CustomButton() {
  return (
    <Button
      type="submit"
      variant="outlined"
      color="info"
      size="small"
      disableElevation
      fullWidth
      sx={{ my: 2 }}
    >
      Sign In
    </Button>
  );
}

function Title() {
  return <Typography variant="h5">Sign in to BFIT</Typography>;
}

function Subtitle() {
  return (
    <Typography variant="body2" color="textSecondary">
      Welcome, please sign in to continue
    </Typography>
  );
}

export default function LoginPage() {
  const { setSession } = useSession();
  const navigate = useNavigate();
  return (
    <SignInPage
      providers={[{ id: "credentials", name: "Credentials" }]}
      signIn={async (provider, formData, callbackUrl) => {
        try {
          const response = await authService.login(formData);
          if (response) {
            // convert response to Session format
            const userSession = {
              user: {
                name: response.user,
              },
            };
            setSession(userSession);
            // TODO: Store authentication token in cookie
            window.localStorage.setItem("session", JSON.stringify(response));
            navigate(callbackUrl || "/", { replace: true });
            return {};
          }
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : "Error logging in",
          };
        }
        return {};
      }}
      slots={{
        title: Title,
        subtitle: Subtitle,
        emailField: CustomEmailField,
        passwordField: CustomPasswordField,
        submitButton: CustomButton,
        signUpLink: SignUpLink,
      }}
    />
  );
}
