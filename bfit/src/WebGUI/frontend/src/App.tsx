import * as React from "react";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import AssignmentRoundedIcon from "@mui/icons-material/AssignmentRounded";
import TroubleshootIcon from "@mui/icons-material/Troubleshoot";
import SettingsIcon from "@mui/icons-material/Settings";
import { Outlet, useNavigate, useLocation } from "react-router";
import { ReactRouterAppProvider } from "@toolpad/core/react-router";
import { createTheme } from "@mui/material/styles";
import type { Navigation, Session } from "@toolpad/core/AppProvider";
import { AlertProvider } from "./hooks/alert";
import { TaskAlertProvider } from "./hooks/taskAlert";
import { PageVisibilityProvider } from "./hooks/visibility";
import { SessionContext } from "./hooks/session";
import authService from "./services/auth";

const NAVIGATION: Navigation = [
  {
    kind: "header",
    title: "Main items",
  },
  {
    segment: "studies",
    title: "DICOM Studies",
    icon: <FolderRoundedIcon />,
  },
  {
    segment: "analysis",
    title: "Analysis",
    pattern: "analysis{/:analysisId}*",
    icon: <TroubleshootIcon />,
  },
  {
    segment: "reports",
    title: "Reports",
    icon: <AssignmentRoundedIcon />,
  },
  {
    kind: "divider",
  },
  {
    segment: "preferences",
    title: "Settings",
    icon: <SettingsIcon />,
  },
];

export const theme = createTheme({
  // cssVariables: {
  //   colorSchemeSelector: "data-toolpad-color-scheme",
  // },
  palette: {
    mode: "dark",
    secondary: {
      main: "#20d3ee",
    },
    background: {
      default: "#1a212e",
      paper: "#1b202a",
    },
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        colorPrimary: {
          backgroundColor: "theme.palette.background.paper",
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          fontSize: "0.8rem",
        },
      },
    },
  },
});

export default function App() {
  const [session, setSession] = React.useState<Session | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const signIn = React.useCallback(() => {
    navigate("/sign-in");
  }, [navigate]);

  const signOut = React.useCallback(async () => {
    try {
      await authService.logout();
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Error logging out",
      };
    }
    setSession(null);
    window.localStorage.clear();
    navigate("/sign-in");
  }, [navigate]);

  const sessionContextValue = React.useMemo(
    () => ({ session, setSession }),
    [session, setSession]
  );

  React.useEffect(() => {
    (async () => {
      const url = location.pathname + location.search;
      console.debug(`navigating to ${url}, checking for authtoken...`);
      if (url.includes("sign-in") || url.includes("sign-up")) {
        // Skip auth check for public routes
        return;
      }
      /* TODO: Set expiring tokens and verify token expiry
      before setting user session
      */
      try {
        const sess = window.localStorage.getItem("session");
        if (sess) {
          const sessObj = JSON.parse(sess);
          await authService.verify(sessObj.token);
          const userSession = {
            user: {
              name: sessObj.user,
            },
          };
          setSession(userSession);
          navigate(url, {
            replace: true,
            viewTransition: true,
          });
        }
      } catch (error: any) {
        console.error(`Invalid token ${JSON.stringify(error.response?.data)}`);
        navigate("/sign-in", { replace: true, viewTransition: true });
      }
    })();
  }, []);

  return (
    <SessionContext.Provider value={sessionContextValue}>
      <AlertProvider>
        <TaskAlertProvider>
          <PageVisibilityProvider>
            <ReactRouterAppProvider
              navigation={NAVIGATION}
              branding={{
                logo: (
                  <img
                    src="/public/vite.svg"
                    height="72"
                    width="280"
                    alt="logo"
                  />
                ),
                title: "BFIT",
              }}
              theme={theme}
              session={session}
              authentication={{ signIn, signOut }}
            >
              <Outlet />
            </ReactRouterAppProvider>
          </PageVisibilityProvider>
        </TaskAlertProvider>
      </AlertProvider>
    </SessionContext.Provider>
  );
}
