import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs, type MetaFunction } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "@remix-run/react";

import { requireUser } from "~/lib/auth.server";
import { LETTER_BODY_MAX_CHARS, LETTER_BODY_MIN_CHARS } from "~/lib/letters";
import { getSubject } from "~/lib/subjects.server";
import { getLatestVoiceSample } from "~/lib/voice.server";
import { dispatchJob, ensureInProcessHandlersWired } from "~/lib/dispatch.server";

export const meta: MetaFunction = () => [{ title: "Write — mosaicrise" }];

interface ActionError {
  error: string;
  body?: string;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabase, responseHeaders } = await requireUser(request);
  const id = params.id;
  if (!id) throw redirect("/app", { headers: responseHeaders });
  const subject = await getSubject(supabase, id);
  if (!subject) throw redirect("/app", { headers: responseHeaders });

  const [voiceSample, primaryPhotoCount] = await Promise.all([
    getLatestVoiceSample(supabase, id),
    supabase
      .from("subject_photos")
      .select("id", { count: "exact", head: true })
      .eq("subject_id", id)
      .eq("is_primary", true),
  ]);
  return json(
    {
      subject,
      voiceReady: !!subject.voice_id,
      voiceSampleStatus: voiceSample?.clone_status ?? null,
      hasPrimaryPhoto: (primaryPhotoCount.count ?? 0) > 0,
    },
    { headers: responseHeaders },
  );
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { user, supabase, responseHeaders } = await requireUser(request);
  const id = params.id;
  if (!id) return json<ActionError>({ error: "Missing subject id" }, { status: 400, headers: responseHeaders });

  const form = await request.formData();
  const body = String(form.get("body") ?? "").trim();
  if (body.length < LETTER_BODY_MIN_CHARS) {
    return json<ActionError>(
      { error: `Letter must be at least ${LETTER_BODY_MIN_CHARS} characters.`, body },
      { status: 400, headers: responseHeaders },
    );
  }
  if (body.length > LETTER_BODY_MAX_CHARS) {
    return json<ActionError>(
      { error: `Letter must be ${LETTER_BODY_MAX_CHARS.toLocaleString()} characters or fewer.`, body },
      { status: 400, headers: responseHeaders },
    );
  }

  const { data: letter, error } = await supabase
    .from("letters")
    .insert({ user_id: user.id, subject_id: id, body })
    .select("*")
    .single();
  if (error) {
    return json<ActionError>({ error: error.message, body }, { status: 500, headers: responseHeaders });
  }

  await ensureInProcessHandlersWired();
  await dispatchJob({
    kind: "render-letter-reply",
    payload: { letter_id: letter.id },
    taskName: `render-letter-${letter.id}`,
  });

  throw redirect(`/app/letters/${letter.id}`, { headers: responseHeaders });
}

export default function WriteLetter() {
  const { subject, voiceReady, voiceSampleStatus, hasPrimaryPhoto } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  const blocked: string[] = [];
  if (!hasPrimaryPhoto) blocked.push("Add a primary photo first.");
  if (!voiceReady) {
    blocked.push(
      voiceSampleStatus === "pending" || voiceSampleStatus === "cloning"
        ? "Voice clone is still in progress."
        : "Clone a voice sample first.",
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link to={`/app/subjects/${subject.id}`} className="text-sm text-dusk-500 hover:text-dusk-900">
        ← Back to {subject.display_name}
      </Link>

      <h1 className="mt-4 font-serif text-3xl text-dusk-900 sm:text-4xl">
        Write to {subject.display_name}
      </h1>
      <p className="mt-2 text-sm text-dusk-700">
        They&apos;ll write back as a short video reply, in their cloned voice. Replies are
        private to you.
      </p>

      {blocked.length > 0 ? (
        <div className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">Not quite ready</p>
          <ul className="mt-1 list-disc pl-5">
            {blocked.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <Link to={`/app/subjects/${subject.id}`} className="mt-3 inline-block text-amber-900 underline">
            Set them up
          </Link>
        </div>
      ) : null}

      <Form method="post" className="mt-6 space-y-3">
        <label className="block">
          <span className="text-sm text-dusk-700">Your letter</span>
          <textarea
            name="body"
            rows={14}
            required
            minLength={LETTER_BODY_MIN_CHARS}
            maxLength={LETTER_BODY_MAX_CHARS}
            defaultValue={actionData?.body ?? ""}
            placeholder="Take your time. Write what you'd say if they were here."
            className="mt-1 block w-full rounded-md border border-dusk-700/30 bg-white px-3 py-3 font-serif text-base leading-relaxed text-dusk-900 focus:border-sage-500 focus:outline-none focus:ring-1 focus:ring-sage-500"
          />
          <span className="mt-1 block text-xs text-dusk-500">
            Up to {LETTER_BODY_MAX_CHARS.toLocaleString()} characters.
          </span>
        </label>

        {actionData?.error ? (
          <p role="alert" className="text-sm text-red-700">
            {actionData.error}
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting || blocked.length > 0}
            className="inline-flex items-center justify-center rounded-md bg-dusk-700 px-5 py-2 text-sm font-medium text-sand-50 transition hover:bg-dusk-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Sending…" : "Send and wait for reply"}
          </button>
          <Link to={`/app/subjects/${subject.id}`} className="text-sm text-dusk-500 hover:text-dusk-900">
            Cancel
          </Link>
        </div>
      </Form>
    </div>
  );
}
