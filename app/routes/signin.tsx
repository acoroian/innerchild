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
          Continue with Google, or we&apos;ll email you a magic link.
        </p>

        <Form method="post" action="/auth/google" className="mt-8">
          <input type="hidden" name="next" value={next} />
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-3 rounded-md border border-dusk-700/25 bg-white px-6 py-3 text-sm font-medium text-dusk-900 transition hover:border-dusk-700/50 hover:bg-sand-50 focus:outline-none focus:ring-2 focus:ring-sage-500 focus:ring-offset-2 focus:ring-offset-sand-50"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 18 18"
              className="h-[18px] w-[18px]"
            >
              <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.17-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z" />
              <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18z" />
              <path fill="#FBBC05" d="M3.97 10.71A5.41 5.41 0 0 1 3.68 9c0-.59.1-1.17.29-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3.01-2.33z" />
              <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.43 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
            </svg>
            Continue with Google
          </button>
        </Form>

        <div className="mt-8 flex items-center gap-3">
          <span className="h-px flex-1 bg-dusk-700/15" />
          <span className="text-xs uppercase tracking-[0.18em] text-dusk-500">or</span>
          <span className="h-px flex-1 bg-dusk-700/15" />
        </div>

        <Form method="post" className="mt-8 space-y-4">
          <input type="hidden" name="next" value={next} />
          <label className="block">
            <span className="block text-sm font-medium text-dusk-700">Email</span>
            <input
              name="email"
              type="email"
              required
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
