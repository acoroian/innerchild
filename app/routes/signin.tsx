import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs, type MetaFunction } from "@remix-run/node";
import { Form, Link, useActionData, useNavigation, useSearchParams } from "@remix-run/react";

import { getOptionalUser } from "~/lib/auth.server";
import { getSiteUrl } from "~/lib/config.server";
import { createServerSupabaseClient } from "~/lib/supabase.server";

export const meta: MetaFunction = () => [{ title: "Sign in — mosaicrise" }];

export async function loader({ request }: LoaderFunctionArgs) {
  const { user, responseHeaders } = await getOptionalUser(request);
  if (user) {
    const url = new URL(request.url);
    const next = url.searchParams.get("next") || "/app";
    throw redirect(next, { headers: responseHeaders });
  }
  return json({}, { headers: responseHeaders });
}

interface ActionData {
  status: "ok" | "error";
  message: string;
}

export async function action({ request }: ActionFunctionArgs) {
  const responseHeaders = new Headers();
  const supabase = createServerSupabaseClient(request, responseHeaders);
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const next = String(form.get("next") ?? "/app");

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json<ActionData>(
      { status: "error", message: "Please enter a valid email address." },
      { status: 400, headers: responseHeaders },
    );
  }

  const redirectTo = `${getSiteUrl()}/auth/callback?next=${encodeURIComponent(next)}`;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });

  if (error) {
    return json<ActionData>(
      { status: "error", message: error.message },
      { status: 400, headers: responseHeaders },
    );
  }

  return json<ActionData>(
    { status: "ok", message: `Magic link sent to ${email}. Check your inbox.` },
    { headers: responseHeaders },
  );
}

export default function SignIn() {
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const [params] = useSearchParams();
  const next = params.get("next") || "/app";
  const submitting = nav.state === "submitting";

  return (
    <main className="min-h-screen px-6 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-md">
        <Link to="/" className="text-sm uppercase tracking-[0.18em] text-dusk-500 hover:text-dusk-700">
          mosaicrise
        </Link>

        <h1 className="mt-8 font-serif text-3xl text-dusk-900 sm:text-4xl">Sign in</h1>
        <p className="mt-3 text-base text-dusk-700">
          We&apos;ll email you a magic link. No password to remember.
        </p>

        <Form method="post" className="mt-8 space-y-4">
          <input type="hidden" name="next" value={next} />
          <label className="block">
            <span className="block text-sm font-medium text-dusk-700">Email</span>
            <input
              name="email"
              type="email"
              required
              autoFocus
              autoComplete="email"
              placeholder="you@example.com"
              className="mt-1 block w-full rounded-md border border-dusk-700/30 bg-white px-3 py-2 text-base text-dusk-900 placeholder:text-dusk-400 focus:border-sage-500 focus:outline-none focus:ring-1 focus:ring-sage-500"
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center rounded-md bg-dusk-700 px-6 py-3 text-sm font-medium text-sand-50 transition hover:bg-dusk-900 focus:outline-none focus:ring-2 focus:ring-sage-500 focus:ring-offset-2 focus:ring-offset-sand-50 disabled:cursor-wait disabled:opacity-70"
          >
            {submitting ? "Sending…" : "Send magic link"}
          </button>
        </Form>

        {actionData ? (
          <p
            role={actionData.status === "error" ? "alert" : "status"}
            className={
              actionData.status === "error"
                ? "mt-4 text-sm text-red-700"
                : "mt-4 text-sm text-sage-500"
            }
          >
            {actionData.message}
          </p>
        ) : null}

        <p className="mt-10 text-xs text-dusk-500">
          By signing in you agree to mosaicrise being a reflective tool, not a substitute for therapy.
        </p>
      </div>
    </main>
  );
}
