import { defineConfig, loadEnv } from "vite";
import eslint from "vite-plugin-eslint2";
import react from "@vitejs/plugin-react";

const VITE_APP_API_URL = process.env.VITE_APP_API_URL || "http://backend:8000";
console.log(`Connected to ${VITE_APP_API_URL}`)

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    'process.env': {
      VITE_APP_API_URL: VITE_APP_API_URL,
    }
  },
  plugins: [react(), eslint({ lintInWorker: true, lintOnStart: true })],
  server: {
    proxy: {
      "/api": {
        target: VITE_APP_API_URL,
        changeOrigin: true,
        secure: false,
        xfwd: true,
      },
      "/content": {
        target: VITE_APP_API_URL,
        changeOrigin: true,
        secure: false,
        xfwd: true,
      }
    },
    host: true,
    port: 3000,
    allowedHosts: true
  },
});
