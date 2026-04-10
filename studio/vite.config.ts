import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  base: process.env.MPG_STUDIO_BASE ?? "/",
  build: {
    outDir: path.resolve(import.meta.dirname, "../dist-studio"),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4999",
    },
  },
});
