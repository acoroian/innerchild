import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client. Reads VITE_-prefixed env vars at build time.
// Server-side helpers live in supabase.server.ts (Remix won't bundle that file
// to the client because of the .server.ts suffix).
export function getBrowserSupabaseClient() {
  return createBrowserClient(
    import.meta.env.VITE_SUPABASE_URL ?? "",
    import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
  );
}
