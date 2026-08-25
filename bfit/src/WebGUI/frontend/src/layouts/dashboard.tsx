import * as React from "react";
import { Outlet, Navigate, useLocation } from "react-router";
import { DashboardLayout } from "@toolpad/core/DashboardLayout";
import { Box, Typography } from "@mui/material";
import { useSession } from "../hooks/session";

function WelcomeToolbarActions() {
  const { session } = useSession();
  const username = session?.user?.name || "there";

  return (
    <Box
      sx={{
        display: { xs: "none", sm: "flex" },
        alignItems: "center",
        gap: 1,
        mr: 1.25,
        px: 1.5,
        py: 0.65,
        borderRadius: "10px",
        border: "1px solid rgba(32,211,238,0.22)",
        bgcolor: "rgba(11,17,24,0.42)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >
      <Box
        sx={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          bgcolor: "#20d3ee",
          boxShadow: "0 0 12px rgba(32,211,238,0.75)",
          flexShrink: 0,
        }}
      />
      <Typography
        sx={{
          color: "rgba(248,250,252,0.92)",
          fontSize: "0.84rem",
          fontWeight: 700,
          letterSpacing: "0.015em",
          lineHeight: 1.1,
          whiteSpace: "nowrap",
        }}
      >
        Welcome{" "}
        <Box component="span" sx={{ color: "#67e8f9" }}>
          {username}
        </Box>
        !
      </Typography>
      <Typography
        sx={{
          color: "rgb(203, 213, 225)",
          fontSize: "0.8rem",
          fontWeight: 600,
          lineHeight: 1.1,
          whiteSpace: "nowrap",
        }}
      >
        Ready to analyse?
      </Typography>
    </Box>
  );
}

export default function Layout() {
  const { session } = useSession();
  const location = useLocation();

  if (!session) {
    const callbackUrl = location.pathname + location.search;
    const redirectTo = `/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`;
    return <Navigate to={redirectTo} replace />;
  }
  return (
    <DashboardLayout
      branding={{ logo: <img src="/public/vite.svg" alt="logo" />, title: "" }}
      defaultSidebarCollapsed
      slots={{ toolbarActions: WelcomeToolbarActions }}
      slotProps={{
        toolbarAccount: {
          slotProps: {
            preview: {
              slotProps: {
                avatarIconButton: {
                  sx: {
                    p: 0.35,
                    borderRadius: "999px",
                    bgcolor: "rgba(11,17,24,0.58)",
                    border: "1px solid rgba(103,232,249,0.28)",
                    boxShadow: "0 8px 22px rgba(0,0,0,0.26)",
                    transition:
                      "background-color 160ms ease, border-color 160ms ease, transform 160ms ease, box-shadow 160ms ease",
                    "&:hover": {
                      bgcolor: "rgba(32,211,238,0.13)",
                      borderColor: "rgba(103,232,249,0.58)",
                      boxShadow:
                        "0 0 0 3px rgba(32,211,238,0.09), 0 10px 24px rgba(0,0,0,0.32)",
                      transform: "translateY(-1px)",
                    },
                  },
                },
                avatar: {
                  sx: {
                    width: 34,
                    height: 34,
                    color: "#e0faff",
                    bgcolor: "rgba(32,211,238,0.2)",
                    border: "1px solid rgba(103,232,249,0.5)",
                    boxShadow:
                      "inset 0 1px 0 rgba(255,255,255,0.12), 0 0 16px rgba(32,211,238,0.16)",
                    fontSize: "0.95rem",
                    fontWeight: 800,
                  },
                },
              },
            },
            popover: {
              slotProps: {
                paper: {
                  sx: {
                    mt: 1.25,
                    width: 238,
                    overflow: "visible",
                    borderRadius: "12px",
                    bgcolor: "#151b26",
                    color: "#f8fafc",
                    border: "1px solid rgba(103,232,249,0.22)",
                    boxShadow:
                      "0 20px 48px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.05)",
                    filter: "none",
                    "&::before": {
                      bgcolor: "#151b26",
                      borderLeft: "1px solid rgba(103,232,249,0.18)",
                      borderTop: "1px solid rgba(103,232,249,0.18)",
                    },
                  },
                },
              },
            },
            popoverContent: {
              sx: {
                py: 1,
                "& > .MuiStack-root:first-of-type": {
                  px: 1.75,
                  py: 1.25,
                  gap: 1.25,
                },
                "& .MuiAvatar-root": {
                  width: 46,
                  height: 46,
                  color: "#e0faff",
                  bgcolor: "rgba(32,211,238,0.18)",
                  border: "1px solid rgba(103,232,249,0.45)",
                  boxShadow:
                    "inset 0 1px 0 rgba(255,255,255,0.12), 0 0 18px rgba(32,211,238,0.16)",
                },
                "& .MuiTypography-body2": {
                  color: "#f8fafc",
                  fontSize: "0.88rem",
                  fontWeight: 800,
                  letterSpacing: "0.01em",
                },
                "& .MuiTypography-caption": {
                  color: "rgba(203, 213, 225, 0.8)",
                  fontSize: "0.6rem",
                  fontStyle: "italic",
                  lineHeight: 1.25,
                },
                "& .MuiDivider-root": {
                  borderColor: "rgba(148,163,184,0.14)",
                  mx: 1,
                },
              },
            },
            signOutButton: {
              sx: {
                mx: 1.25,
                mt: 1,
                mb: 0.25,
                width: "calc(100% - 20px)",
                minHeight: 36,
                borderRadius: "8px",
                color: "#07131c",
                bgcolor: "#20d3ee",
                fontWeight: 800,
                fontSize: "0.78rem",
                letterSpacing: "0.035em",
                boxShadow: "0 8px 20px rgba(32,211,238,0.18)",
                "&:hover": {
                  bgcolor: "#67e8f9",
                  boxShadow: "0 10px 24px rgba(32,211,238,0.24)",
                },
              },
            },
          },
        },
      }}
    >
      <Outlet />
    </DashboardLayout>
  );
}
