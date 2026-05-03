import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";

import { requireUser } from "~/lib/auth.server";
import { listSubjects, type Subject } from "~/lib/subjects.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase, responseHeaders } = await requireUser(request);
  const subjects = await listSubjects(supabase);
  return json({ subjects }, { headers: responseHeaders });
}

const KIND_LABEL: Record<Subject["kind"], string> = {
  inner_child: "Inner child",
  ancestor: "Ancestor",
  other: "Someone else",
};

export default function Dashboard() {
  const { subjects } = useLoaderData<typeof loader>();

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl text-dusk-900 sm:text-4xl">Your subjects</h1>
          <p className="mt-2 text-sm text-dusk-700">
            People you write to — your younger self, your grandparents, anyone who shaped you.
          </p>
        </div>
        <Link
          to="/app/subjects/new"
          className="inline-flex shrink-0 items-center justify-center rounded-md bg-dusk-700 px-4 py-2 text-sm font-medium text-sand-50 transition hover:bg-dusk-900 focus:outline-none focus:ring-2 focus:ring-sage-500"
        >
          New subject
        </Link>
      </div>

      {subjects.length === 0 ? (
        <div className="mt-12 rounded-lg border border-dashed border-dusk-700/20 p-10 text-center">
          <p className="font-serif text-xl text-dusk-700">No subjects yet.</p>
          <p className="mt-2 text-sm text-dusk-500">
            Add the first person you&apos;d like to write to.
          </p>
          <Link
            to="/app/subjects/new"
            className="mt-6 inline-flex items-center justify-center rounded-md bg-dusk-700 px-4 py-2 text-sm font-medium text-sand-50 transition hover:bg-dusk-900"
          >
            Add a subject
          </Link>
        </div>
      ) : (
        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {subjects.map((s) => (
            <li key={s.id}>
              <Link
                to={`/app/subjects/${s.id}`}
                className="block rounded-lg border border-dusk-700/15 bg-white p-5 transition hover:border-dusk-700/40 hover:shadow-sm"
              >
                <p className="text-xs uppercase tracking-[0.14em] text-dusk-500">
                  {KIND_LABEL[s.kind]}
                </p>
                <p className="mt-2 font-serif text-xl text-dusk-900">{s.display_name}</p>
                {s.relationship ? (
                  <p className="mt-1 text-sm text-dusk-500">{s.relationship}</p>
                ) : null}
                <p className="mt-3 text-xs text-dusk-400">
                  {s.voice_id ? "Voice ready" : "Voice not yet cloned"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
