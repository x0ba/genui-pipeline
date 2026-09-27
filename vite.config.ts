import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  // Generated components are never edited in place, and Fast Refresh's self-import
  // would load a second instance next to the runtime `?import` one.
  plugins: [react({ exclude: [/\/node_modules\//, /\/data\/runtime\//] })],
  resolve: { alias: { "@kit": resolve(import.meta.dirname, "web/src/kit/index.ts") } },
  define: {
    // Generated components live outside the Vite root and are imported at runtime.
    __GENERATED_DIR__: JSON.stringify(resolve(import.meta.dirname, "data/runtime/components")),
  },
  server: {
    port: 5173,
    fs: { allow: [import.meta.dirname] },
    watch: { ignored: ["**/data/runtime/staging/**", "**/data/runtime/specs/**"] },
    proxy: { "/api": { target: "http://localhost:8787", changeOrigin: true } },
  },
  optimizeDeps: { include: ["react", "react-dom/client", "motion/react", "react/jsx-dev-runtime"] },
});
