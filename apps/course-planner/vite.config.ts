import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  plugins: [react()],
  resolve: { alias: { "@kit": resolve(import.meta.dirname, "web/src/kit/index.ts") } },
  server: {
    port: 5173,
    fs: { allow: [resolve(import.meta.dirname, "../..")] },
    // Generated components are compiled by the server and imported from /api/malleable/components.
    proxy: { "/api": { target: "http://localhost:8787", changeOrigin: true } },
  },
  optimizeDeps: { include: ["react", "react-dom/client", "motion/react", "react/jsx-dev-runtime"] },
});
