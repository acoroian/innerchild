import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["app/**/*.test.ts", "worker/src/**/*.test.ts"],
    exclude: ["**/*.integration.test.ts", "node_modules/**"],
  },
});
