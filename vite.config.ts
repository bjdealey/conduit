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
}));
