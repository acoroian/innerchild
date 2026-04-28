import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { config } from "./config.server";

// Per-request server client that wires Supabase auth into the Remix
// request/response cookie chain. Always pass `responseHeaders` back through
// the action/loader return so refreshed tokens reach the browser.
export function createServerSupabaseClient(request: Request, responseHeaders: Headers) {
  return createServerClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get("Cookie") ?? "")
          .filter((c): c is { name: string; value: string } => typeof c.value === "string");
      },
      setAll(cookies) {
        for (const { name, value, options } of cookies) {
          responseHeaders.append("Set-Cookie", serializeCookieHeader(name, value, options));
        }
      },
    },
  });
}

// Service-role client. Bypasses RLS — only use from API routes that have
// already authenticated the user and need to write across-table effects
// (e.g., admin actions, system jobs). Never expose to the browser.
let _serviceRoleClient: SupabaseClient | null = null;
export function getServiceRoleSupabaseClient(): SupabaseClient {
  if (!_serviceRoleClient) {
    _serviceRoleClient = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _serviceRoleClient;
}
