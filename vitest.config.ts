import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The integration abstraction lives in `packages/*` as plain TS so both the
// (future) Deno Edge Functions and the Node test runner can consume it. Aliases
// resolve the workspace packages to their TS sources — no build step needed.
export default defineConfig({
  resolve: {
    alias: {
      "@conduit/domain": fileURLToPath(new URL("./packages/domain/src/index.ts", import.meta.url)),
      "@conduit/connector-sdk": fileURLToPath(
        new URL("./packages/connector-sdk/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts"],
  },
});
