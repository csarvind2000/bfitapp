import * as React from "react";
import { SignInPage } from "@toolpad/core/SignInPage";
import { useNavigate } from "react-router";
import { buildToolpadSession, useSession } from "../hooks/session";
import authService from "../services/auth";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import {
  TextField,
  Link,
  Button,
  FormControl,
  InputLabel,
  OutlinedInput,
  InputAdornment,
  IconButton,
  Typography,
  Box,
} from "@mui/material";

const inputSx = {
  "& .MuiInputBase-root": {
    minHeight: 42,
    color: "#f1f5f9",
    bgcolor: "rgba(15,23,42,0.9)",
    borderRadius: "8px",
    transition:
      "background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease",
    "& fieldset": {
      borderColor: "rgba(148,163,184,0.45)",
    },
    "&:hover fieldset": {
      borderColor: "rgba(77,217,237,0.55)",
    },
    "&.Mui-focused": {
      bgcolor: "rgba(10,18,30,0.98)",
      boxShadow: "0 0 0 3px rgba(23,184,208,0.1)",
    },
    "&.Mui-focused fieldset": {
      borderColor: "#17b8d0",
    },
  },
  "& .MuiInputBase-input": {
    py: 1.05,
    fontSize: "0.92rem",
    fontWeight: 500,
    "&:-webkit-autofill": {
      WebkitBoxShadow: "0 0 0 100px rgba(10,18,30,0.98) inset",
      WebkitTextFillColor: "#f1f5f9",
      caretColor: "#f1f5f9",
    },
  },
  "& .MuiInputLabel-root": {
    color: "rgba(203,213,225,0.9)",
    fontSize: "0.86rem",
    fontWeight: 500,
  },
  "& .MuiInputLabel-root.Mui-focused": {
    color: "#4dd9ed",
  },
  "& .MuiInputAdornment-root .MuiSvgIcon-root": {
    fontSize: "1.1rem",
    color: "rgba(148,163,184,0.65)",
  },
};

function CustomEmailField() {
  return (
    <TextField
      label="Username"
      name="username"
      size="small"
      required
      fullWidth
      variant="outlined"
      sx={inputSx}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <PersonOutlineIcon />
          </InputAdornment>
        ),
      }}
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
    <FormControl sx={inputSx} fullWidth variant="outlined">
      <InputLabel size="small" htmlFor="outlined-adornment-password">
        Password
      </InputLabel>
      <OutlinedInput
        id="outlined-adornment-password"
        type={showPassword ? "text" : "password"}
        name="password"
        size="small"
        startAdornment={
          <InputAdornment position="start">
            <LockOutlinedIcon />
          </InputAdornment>
        }
        endAdornment={
          <InputAdornment position="end">
            <IconButton
              aria-label="toggle password visibility"
              onClick={handleClickShowPassword}
              onMouseDown={handleMouseDownPassword}
              edge="end"
              size="small"
              sx={{
                color: "rgba(203,213,225,0.75)",
                "&:hover": {
                  color: "#4dd9ed",
                  bgcolor: "rgba(23,184,208,0.07)",
                },
              }}
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
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "4px",
        mt: 0.5,
      }}
    >
      <Typography
        variant="body2"
        sx={{
          color: "rgba(148,163,184,0.85)",
          fontSize: "0.78rem",
          fontWeight: 500,
        }}
      >
        No account?
      </Typography>
      <Link
        href="/sign-up"
        variant="body2"
        sx={{
          color: "#4dd9ed",
          fontSize: "0.78rem",
          fontWeight: 700,
          textDecorationColor: "rgba(77,217,237,0.3)",
          "&:hover": {
            color: "#80e8f4",
            textDecorationColor: "#80e8f4",
          },
        }}
      >
        Create one
      </Link>
    </Box>
  );
}

function CustomButton() {
  return (
    <Button
      type="submit"
      variant="contained"
      size="small"
      disableElevation
      fullWidth
      sx={{
        mt: 2.75,
        mb: 0.75,
        minHeight: 40,
        borderRadius: "8px",
        color: "#07131c",
        bgcolor: "#17b8d0",
        fontSize: "0.78rem",
        fontWeight: 900,
        letterSpacing: "0.05em",
        boxShadow: "0 12px 26px rgba(23,184,208,0.18)",
        "&:hover": {
          bgcolor: "#4dd9ed",
          boxShadow: "0 14px 30px rgba(23,184,208,0.22)",
        },
      }}
    >
      Sign In
    </Button>
  );
}

function Title() {
  return (
    <Typography
      variant="h5"
      sx={{
        mt: 1.5,
        color: "#f8fafc",
        fontSize: "1.38rem",
        fontWeight: 800,
        letterSpacing: "0.01em",
        textAlign: "center",
      }}
    >
      Sign in to B-FIT
    </Typography>
  );
}

function Subtitle() {
  return (
    <Typography
      variant="body2"
      sx={{
        mt: 0.5,
        mb: 1.5,
        color: "rgba(203,213,225,0.9)",
        fontSize: "0.84rem",
        fontWeight: 500,
        textAlign: "center",
      }}
    >
      Welcome back. Ready to analyse?
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
            setSession(buildToolpadSession(response));
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
      slotProps={{
        rememberMe: {
          sx: {
            m: 0,
            "& .MuiCheckbox-root": {
              color: "rgba(148,163,184,0.72)",
              p: 0.5,
              mr: 0.5,
              "&.Mui-checked": {
                color: "#17b8d0",
              },
            },
          },
          slotProps: {
            typography: {
              sx: {
                color: "rgba(203,213,225,0.9)",
                fontSize: "0.82rem",
                fontWeight: 500,
              },
            },
          },
        },
      }}
      sx={{
        bgcolor: "#111827",
        "& .MuiContainer-root": {
          maxWidth: "430px",
        },
        "& main > .MuiBox-root": {
          p: { xs: 3, sm: 4 },
          borderRadius: "14px",
          bgcolor: "rgba(24,32,46,0.98)",
          border: "1px solid rgba(148,163,184,0.18)",
          boxShadow: "0 24px 58px rgba(0,0,0,0.5)",
        },
        "& main > .MuiBox-root > img": {
          width: 72,
          height: 72,
          objectFit: "contain",
          filter: "drop-shadow(0 10px 24px rgba(23,184,208,0.14))",
        },
        "& form > .MuiStack-root:first-of-type": {
          gap: 1.35,
          mb: 1.5,
        },
        "& .MuiAlert-root": {
          borderRadius: "8px",
          fontSize: "0.82rem",
        },
      }}
    />
  );
}