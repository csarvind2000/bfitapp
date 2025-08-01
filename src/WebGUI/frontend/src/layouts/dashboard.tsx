import * as React from "react";
import { Outlet, Navigate, useLocation } from "react-router";
import { DashboardLayout } from "@toolpad/core/DashboardLayout";
import { useSession } from "../hooks/session";

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
    >
      <Outlet />
    </DashboardLayout>
  );
}
