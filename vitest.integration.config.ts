import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Integration tests hit a real local Supabase + (optionally, gated on env vars)
// real vendor APIs. Never runs in CI by default.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["app/**/*.integration.test.ts", "worker/src/**/*.integration.test.ts"],
    testTimeout: 120_000,
  },
});
