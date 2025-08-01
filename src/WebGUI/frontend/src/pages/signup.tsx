import * as React from "react"
import { SignInPage } from "@toolpad/core/SignInPage"
import { useNavigate } from "react-router"
import authService from "../services/auth"
import Typography from "@mui/material/Typography"
import Visibility from "@mui/icons-material/Visibility"
import VisibilityOff from "@mui/icons-material/VisibilityOff"
import {
  TextField,
  Link,
  Button,
  FormControl,
  InputLabel,
  OutlinedInput,
  InputAdornment,
  IconButton,
} from "@mui/material"
import { useAlert } from "../hooks/alert"

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
  )
}

function CustomPasswordField() {
  const [showPassword, setShowPassword] = React.useState(false)

  const handleClickShowPassword = () => setShowPassword((show) => !show)

  const handleMouseDownPassword = (event: React.MouseEvent) => {
    event.preventDefault()
  }

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
  )
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
      Sign Up
    </Button>
  )
}

function Title() {
  return <Typography variant="h5">Register to BFIT</Typography>
}

function Subtitle() {
  return (
    <Typography variant="body2" color="textSecondary">
      Already have an account?{" "}
      <Link href="/sign-in" variant="body2">
        Sign in
      </Link>
    </Typography>
  )
}

function RememberMe() {
  return null
}

export default function SignUpPage() {
  const navigate = useNavigate()
  const showAlert = useAlert()
  return (
    <SignInPage
      providers={[{ id: "credentials", name: "Credentials" }]}
      signIn={async (provider, formData, callbackUrl) => {
        try {
          const newUser = await authService.register(formData)
          if (newUser) {
            showAlert(
              `User ${newUser.username} registered, redirecting to Login page...`
            )
            setTimeout(
              () =>
                navigate(callbackUrl || "/sign-in", {
                  replace: true,
                  viewTransition: true,
                }),
              6000
            )
            return {}
          }
        } catch (error) {
          return {
            error:
              error instanceof Error ? error.message : "Error registering user",
          }
        }
        return {}
      }}
      slots={{
        title: Title,
        subtitle: Subtitle,
        rememberMe: RememberMe,
        emailField: CustomEmailField,
        passwordField: CustomPasswordField,
        submitButton: CustomButton,
      }}
    />
  )
}
