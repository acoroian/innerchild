import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";

import { getSiteUrl } from "~/lib/config.server";
import { createServerSupabaseClient } from "~/lib/supabase.server";

// Kicks off Google OAuth. Posted to from the "Continue with Google" button on
// /signin. Asks Supabase for a provider URL and redirects the user there.
// After the user authorizes on Google, Supabase posts back to its own callback
// (https://<project>.supabase.co/auth/v1/callback), then redirects to the
// `redirectTo` we pass below — which is our /auth/callback?code=... handler.

async function startGoogleOAuth(request: Request) {
  const responseHeaders = new Headers();
  const supabase = createServerSupabaseClient(request, responseHeaders);

  const url = new URL(request.url);
  // For POST: read `next` from form. For GET (linked): from query.
  let next = url.searchParams.get("next") ?? "/app";
  if (request.method !== "GET") {
    try {
      const form = await request.formData();
      next = String(form.get("next") ?? next);
    } catch {
      // body might be empty; fall through with default
    }
  }

  const redirectTo = `${getSiteUrl()}/auth/callback?next=${encodeURIComponent(next)}`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      // PKCE flow — Supabase appends ?code=… that auth.callback.tsx exchanges.
      queryParams: { access_type: "offline", prompt: "consent" },
    },
  });

  if (error || !data?.url) {
    const reason = error?.message ?? "no provider url returned";
    throw redirect(`/signin?error=${encodeURIComponent(reason)}`, { headers: responseHeaders });
  }

  throw redirect(data.url, { headers: responseHeaders });
}

export async function action({ request }: ActionFunctionArgs) {
  return startGoogleOAuth(request);
}

// GET works too in case someone hits the URL directly (e.g. bookmarked deep link).
export async function loader({ request }: LoaderFunctionArgs) {
  return startGoogleOAuth(request);
}
