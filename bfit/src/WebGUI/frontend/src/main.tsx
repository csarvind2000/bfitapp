import * as React from "react";
import * as ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router";
import App from "./App";
import Layout from "./layouts/dashboard";
import StudiesPage from "./pages/studies";
import AnalysisPage from "./pages/analysis";
import ReportsPage from "./pages/reports";
import SettingsPage from "./pages/settings";
import LoginPage from "./pages/login";
import SignUpPage from "./pages/signup";
import ErrorPage from "./pages/error";

const router = createBrowserRouter([
  {
    Component: App,
    errorElement: <ErrorPage />,
    children: [
      {
        path: "/",
        Component: Layout,
        children: [
          {
            index: true,
            element: <Navigate to="studies" replace />,
          },
          {
            path: "studies",
            Component: StudiesPage,
          },
          {
            path: "analysis",
            Component: AnalysisPage,
          },
          {
            path: "analysis/:analysisId",
            Component: AnalysisPage,
          },
          {
            path: "reports",
            Component: ReportsPage,
          },
          {
            path: "preferences",
            Component: SettingsPage,
          },
        ],
      },
      {
        path: "sign-in",
        Component: LoginPage,
      },
      {
        path: "sign-up",
        Component: SignUpPage,
      },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <RouterProvider router={router} />
  // <React.StrictMode>
  //   <RouterProvider router={router} />
  // </React.StrictMode>
);
