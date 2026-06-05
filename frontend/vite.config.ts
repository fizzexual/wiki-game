import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite dev server proxies API + article-proxy calls to the Flask backend.
// In production, Flask serves the built bundle directly.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:5000",
      "/play": "http://127.0.0.1:5000",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
  },
});
