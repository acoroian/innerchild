import { redirect, type LoaderFunctionArgs } from "@remix-run/node";

import { createServerSupabaseClient } from "~/lib/supabase.server";

// Magic-link callback. Supabase appends ?code=… (PKCE) which we exchange for
// a session cookie, then forward to ?next= (default /app).
export async function loader({ request }: LoaderFunctionArgs) {
  const responseHeaders = new Headers();
  const supabase = createServerSupabaseClient(request, responseHeaders);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/app";

  if (!code) {
    throw redirect("/signin?error=missing_code", { headers: responseHeaders });
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    throw redirect(`/signin?error=${encodeURIComponent(error.message)}`, { headers: responseHeaders });
  }

  throw redirect(next, { headers: responseHeaders });
}
