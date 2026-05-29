import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@vector-ui": path.resolve(__dirname, "./vector-ui"),
    },
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    headers: {
      "Access-Control-Allow-Origin": "https://us.posthog.com",
    },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
