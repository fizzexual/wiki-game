import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Deployed as a static site to GitHub Pages at
// https://fizzexual.github.io/wiki-game/ — every asset URL is prefixed with
// the repo name. The game now runs entirely in the browser (no backend), so
// there's no dev proxy. Override the base with VITE_BASE for other hosts.
export default defineConfig({
  base: process.env.VITE_BASE ?? "/wiki-game/",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
  },
});
