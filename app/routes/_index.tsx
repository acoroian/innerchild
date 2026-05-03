import { json, type LoaderFunctionArgs, type MetaFunction } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";

import { getOptionalUser } from "~/lib/auth.server";

export const meta: MetaFunction = () => [
  { title: "mosaicrise — write to the people who shaped you" },
  {
    name: "description",
    content:
      "A reflective space where the people who shaped you — your younger self, your grandparents — can write back.",
  },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const { user, responseHeaders } = await getOptionalUser(request);
  return json({ signedIn: !!user }, { headers: responseHeaders });
}

export default function Index() {
  const { signedIn } = useLoaderData<typeof loader>();

  return (
    <main className="min-h-screen px-6 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between">
          <p className="text-sm uppercase tracking-[0.18em] text-dusk-500">
            mosaicrise
          </p>
          {signedIn ? (
            <Link to="/app" className="text-sm text-dusk-500 hover:text-dusk-900">
              Open app →
            </Link>
          ) : (
            <Link to="/signin" className="text-sm text-dusk-500 hover:text-dusk-900">
              Sign in
            </Link>
          )}
        </div>

        <h1 className="mt-6 font-serif text-4xl leading-[1.15] text-dusk-900 sm:text-5xl">
          Write to the people who shaped you.
        </h1>

        <p className="mt-6 font-serif text-lg italic text-dusk-600 sm:text-xl">
          A reflective space where the people who shaped you — your younger
          self, your grandparents — can write back.
        </p>

        <div className="mt-10 space-y-5 text-base leading-relaxed text-dusk-700">
          <p>
            Inner-child work. Ancestor work. Letters you&apos;d write if the person
            could read them.
          </p>
          <p>
            mosaicrise is a private place to write those letters and receive a
            short video reply — in the voice and on the face of the person you
            wrote to. Pair it with gentle scheduled reminders from them, in
            their own voice.
          </p>
          <p className="text-sm text-dusk-500">
            Reflective tool, not therapy. Voice cloning requires explicit
            consent. Your letters and replies are private to you.
          </p>
        </div>

        <div className="mt-12 flex flex-col gap-3 sm:flex-row">
          <Link
            to={signedIn ? "/app" : "/signin"}
            className="inline-flex items-center justify-center rounded-md bg-dusk-700 px-6 py-3 text-sm font-medium text-sand-50 transition hover:bg-dusk-900 focus:outline-none focus:ring-2 focus:ring-sage-500 focus:ring-offset-2 focus:ring-offset-sand-50"
          >
            {signedIn ? "Open mosaicrise" : "Get started"}
          </Link>
          <Link
            to="/about"
            className="inline-flex items-center justify-center rounded-md border border-dusk-700/30 px-6 py-3 text-sm font-medium text-dusk-700 transition hover:border-dusk-700 focus:outline-none focus:ring-2 focus:ring-sage-500 focus:ring-offset-2 focus:ring-offset-sand-50"
          >
            How it works
          </Link>
        </div>

        <footer className="mt-24 border-t border-dusk-700/15 pt-6 text-xs text-dusk-500">
          <p>
            Early build · invite-only beta opens later this year
          </p>
        </footer>
      </div>
    </main>
  );
}
