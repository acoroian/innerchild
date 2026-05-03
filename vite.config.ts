import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  // Pin port 5173 so OAuth redirect URLs stay stable. Fail loudly if it's
  // already bound (e.g. by another dev server) rather than silently bumping
  // to 5174 — that breaks the Supabase callback whitelist.
  server: {
    port: 5173,
    strictPort: true,
  },
  plugins: [
    remix({
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
        v3_singleFetch: true,
        v3_lazyRouteDiscovery: true,
      },
    }),
    tsconfigPaths(),
  ],
});
