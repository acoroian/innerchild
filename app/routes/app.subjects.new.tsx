import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs, type MetaFunction } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "@remix-run/react";

import { requireUser } from "~/lib/auth.server";
import {
  SUBJECT_KINDS,
  SUBJECT_LANGUAGES,
  SUBJECT_TONES,
  type CreateSubjectInput,
  type SubjectKind,
  type SubjectTone,
  isSupportedSubjectLanguage,
} from "~/lib/subjects";
import { createSubject } from "~/lib/subjects.server";

export const meta: MetaFunction = () => [{ title: "New subject — mosaicrise" }];

interface ActionError {
  error: string;
  values?: Record<string, string>;
}

// Pre-fill the language dropdown from the user's profile locale so a Romanian
// user gets ro-RO selected by default, etc. They can still pick anything.
export async function loader({ request }: LoaderFunctionArgs) {
  const { user, supabase, responseHeaders } = await requireUser(request);
  const { data } = await supabase
    .from("user_profiles")
    .select("locale")
    .eq("user_id", user.id)
    .maybeSingle();
  const defaultLanguage = data?.locale ?? "en-US";
  return json({ defaultLanguage }, { headers: responseHeaders });
}

export async function action({ request }: ActionFunctionArgs) {
  const { user, supabase, responseHeaders } = await requireUser(request);
  const form = await request.formData();
  const kind = String(form.get("kind") ?? "");
  const display_name = String(form.get("display_name") ?? "").trim();
  const relationship = String(form.get("relationship") ?? "").trim();
  const tone = String(form.get("tone") ?? "");
  const ageRaw = String(form.get("age_at_subject") ?? "").trim();
  const things_to_avoid = String(form.get("things_to_avoid") ?? "").trim();
  const memoriesRaw = String(form.get("key_memories") ?? "").trim();
  const language = String(form.get("language") ?? "").trim();

  const values: Record<string, string> = {
    kind,
    display_name,
    relationship,
    tone,
    age_at_subject: ageRaw,
    things_to_avoid,
    key_memories: memoriesRaw,
    language,
  };

  if (!SUBJECT_KINDS.includes(kind as SubjectKind)) {
    return json<ActionError>(
      { error: "Choose what kind of subject this is.", values },
      { status: 400, headers: responseHeaders },
    );
  }
  if (!display_name) {
    return json<ActionError>(
      { error: "Display name is required.", values },
      { status: 400, headers: responseHeaders },
    );
  }
  let age: number | null = null;
  if (ageRaw) {
    const parsed = Number.parseInt(ageRaw, 10);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 130) {
      return json<ActionError>(
        { error: "Age must be 0–130 if provided.", values },
        { status: 400, headers: responseHeaders },
      );
    }
    age = parsed;
  }
  const toneVal: SubjectTone | null = tone && SUBJECT_TONES.includes(tone as SubjectTone)
    ? (tone as SubjectTone)
    : null;

  const key_memories = memoriesRaw
    ? memoriesRaw
        .split("\n")
        .map((m) => m.trim())
        .filter((m) => m.length > 0)
    : [];

  if (language && !isSupportedSubjectLanguage(language)) {
    return json<ActionError>(
      { error: "Pick a language from the list.", values },
      { status: 400, headers: responseHeaders },
    );
  }

  const input: CreateSubjectInput = {
    kind: kind as SubjectKind,
    display_name,
    age_at_subject: age,
    relationship: relationship || null,
    tone: toneVal,
    key_memories,
    things_to_avoid: things_to_avoid || null,
    ...(language ? { language } : {}),
  };

  const subject = await createSubject(supabase, user.id, input);
  throw redirect(`/app/subjects/${subject.id}`, { headers: responseHeaders });
}

export default function NewSubject() {
  const { defaultLanguage } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const v = actionData?.values ?? {};
  const submitting = nav.state === "submitting";

  return (
    <div className="mx-auto max-w-xl">
      <Link to="/app" className="text-sm text-dusk-500 hover:text-dusk-900">
        ← Back to subjects
      </Link>
      <h1 className="mt-4 font-serif text-3xl text-dusk-900">Add a subject</h1>
      <p className="mt-2 text-sm text-dusk-700">
        You can edit any of this later. The About fields help shape the tone of replies.
      </p>

      <Form method="post" className="mt-8 space-y-6">
        <fieldset>
          <legend className="block text-sm font-medium text-dusk-700">Who is this?</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {SUBJECT_KINDS.map((k) => (
              <label
                key={k}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-dusk-700/20 bg-white px-3 py-2 text-sm text-dusk-700 has-[:checked]:border-sage-500 has-[:checked]:bg-sage-400/10"
              >
                <input
                  type="radio"
                  name="kind"
                  value={k}
                  defaultChecked={(v.kind || "inner_child") === k}
                  className="text-sage-500 focus:ring-sage-500"
                />
                {k === "inner_child" ? "Inner child" : k === "ancestor" ? "Ancestor" : "Someone else"}
              </label>
            ))}
          </div>
        </fieldset>

        <Field label="Display name" hint="What you'll call them in the app.">
          <input
            name="display_name"
            type="text"
            required
            maxLength={120}
            defaultValue={v.display_name ?? ""}
            className="mt-1 block w-full rounded-md border border-dusk-700/30 bg-white px-3 py-2 text-base text-dusk-900 focus:border-sage-500 focus:outline-none focus:ring-1 focus:ring-sage-500"
          />
        </Field>

        <Field label="Age (optional)" hint="The age they're depicted as. e.g. 7 for an inner-child, 65 for a grandparent.">
          <input
            name="age_at_subject"
            type="number"
            min={0}
            max={130}
            defaultValue={v.age_at_subject ?? ""}
            className="mt-1 block w-32 rounded-md border border-dusk-700/30 bg-white px-3 py-2 text-base text-dusk-900 focus:border-sage-500 focus:outline-none focus:ring-1 focus:ring-sage-500"
          />
        </Field>

        <Field label="Relationship (optional)" hint="e.g. 'My grandmother on my father's side'.">
          <input
            name="relationship"
            type="text"
            maxLength={200}
            defaultValue={v.relationship ?? ""}
            className="mt-1 block w-full rounded-md border border-dusk-700/30 bg-white px-3 py-2 text-base text-dusk-900 focus:border-sage-500 focus:outline-none focus:ring-1 focus:ring-sage-500"
          />
        </Field>

        <Field
          label="Language"
          hint="What language they speak. Replies are generated in this language."
        >
          <select
            name="language"
            defaultValue={v.language ?? defaultLanguage}
            className="mt-1 block w-full rounded-md border border-dusk-700/30 bg-white px-3 py-2 text-base text-dusk-900 focus:border-sage-500 focus:outline-none focus:ring-1 focus:ring-sage-500"
          >
            {SUBJECT_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Tone of replies (optional)" hint="How replies should sound.">
          <select
            name="tone"
            defaultValue={v.tone ?? ""}
            className="mt-1 block w-full rounded-md border border-dusk-700/30 bg-white px-3 py-2 text-base text-dusk-900 focus:border-sage-500 focus:outline-none focus:ring-1 focus:ring-sage-500"
          >
            <option value="">— unset —</option>
            {SUBJECT_TONES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Key memories (optional)" hint="One per line. Replies can draw on these.">
          <textarea
            name="key_memories"
            rows={4}
            defaultValue={v.key_memories ?? ""}
            className="mt-1 block w-full rounded-md border border-dusk-700/30 bg-white px-3 py-2 text-base text-dusk-900 focus:border-sage-500 focus:outline-none focus:ring-1 focus:ring-sage-500"
          />
        </Field>

        <Field label="Things to avoid (optional)" hint="Topics, phrases, or memories the model should steer clear of.">
          <textarea
            name="things_to_avoid"
            rows={3}
            defaultValue={v.things_to_avoid ?? ""}
            className="mt-1 block w-full rounded-md border border-dusk-700/30 bg-white px-3 py-2 text-base text-dusk-900 focus:border-sage-500 focus:outline-none focus:ring-1 focus:ring-sage-500"
          />
        </Field>

        {actionData?.error ? (
          <p role="alert" className="text-sm text-red-700">
            {actionData.error}
          </p>
        ) : null}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center rounded-md bg-dusk-700 px-5 py-2 text-sm font-medium text-sand-50 transition hover:bg-dusk-900 focus:outline-none focus:ring-2 focus:ring-sage-500 disabled:cursor-wait disabled:opacity-70"
          >
            {submitting ? "Creating…" : "Create subject"}
          </button>
          <Link to="/app" className="text-sm text-dusk-500 hover:text-dusk-900">
            Cancel
          </Link>
        </div>
      </Form>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-dusk-700">{label}</span>
      {hint ? <span className="mt-1 block text-xs text-dusk-500">{hint}</span> : null}
      {children}
    </label>
  );
}
