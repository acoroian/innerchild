import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client. Reads VITE_-prefixed env vars at build time.
// File is named `.client.ts` so Remix never bundles it into a server route.
// Server-side helpers live in `supabase.server.ts`.

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Fail loud at import time, not silently with 401s on first call.
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. " +
      "These are inlined at build time and must be set before `npm run build` / `npm run dev`.",
  );
}

export function getBrowserSupabaseClient() {
  return createBrowserClient(url, anonKey);
}
