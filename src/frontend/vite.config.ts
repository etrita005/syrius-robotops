import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_TARGET = process.env.VITE_API_TARGET ?? "http://localhost:30001";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    headers: {
      "Permissions-Policy": "unload=()",
    },
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
});
