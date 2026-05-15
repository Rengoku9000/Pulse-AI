import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Production: VITE_API_URL is set to the Render backend URL in Vercel env vars
  // Development: proxy /api to local backend at localhost:8080
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
  define: {
    // Makes VITE_API_URL available at build time
    __API_URL__: JSON.stringify(process.env.VITE_API_URL || ""),
  },
});
