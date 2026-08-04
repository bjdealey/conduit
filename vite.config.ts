import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The section markup is imported verbatim via `?raw`, so no extra config is
// needed — Vite supports raw string imports out of the box.
//
// `base` is only set for production builds so the app works when served from the
// `/conduit/` subpath on GitHub Pages; local dev stays at the root.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/conduit/" : "/",
  plugins: [react()],
  resolve: {
    alias: {
      // The frontend shares the canonical domain models with the backend/connectors.
      "@conduit/domain": fileURLToPath(new URL("./packages/domain/src/index.ts", import.meta.url)),
      // With no backend configured the browser tab *is* the runner: the builder's Test
      // run executes the flow here, through the same engine the runner CLI hosts.
      "@conduit/runtime": fileURLToPath(new URL("./packages/runtime/src/index.ts", import.meta.url)),
    },
  },
}));
