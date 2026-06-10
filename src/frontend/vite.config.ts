import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    headers: {
      "Permissions-Policy": "unload=()",
    },
    proxy: {
      "/api": {
        target: "http://localhost:30001",
        changeOrigin: true,
      },
    },
  },
});
