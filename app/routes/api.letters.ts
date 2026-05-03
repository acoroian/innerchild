import { json, type ActionFunctionArgs } from "@remix-run/node";

import { requireUser } from "~/lib/auth.server";
import { dispatchJob, ensureInProcessHandlersWired } from "~/lib/dispatch.server";
import { LETTER_BODY_MAX_CHARS, LETTER_BODY_MIN_CHARS } from "~/lib/letters";
import { getSubject } from "~/lib/subjects.server";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }
  const { user, supabase, responseHeaders } = await requireUser(request);

  const body = (await readJsonBody(request)) as Record<string, unknown> | null;
  if (!body) return json({ error: "Body must be JSON" }, { status: 400, headers: responseHeaders });

  const subjectId = body.subject_id;
  const text = body.body;
  if (typeof subjectId !== "string") {
    return json({ error: "subject_id is required" }, { status: 400, headers: responseHeaders });
  }
  if (typeof text !== "string" || text.trim().length < LETTER_BODY_MIN_CHARS) {
    return json(
      { error: `Letter must be at least ${LETTER_BODY_MIN_CHARS} characters.` },
      { status: 400, headers: responseHeaders },
    );
  }
  if (text.length > LETTER_BODY_MAX_CHARS) {
    return json(
      { error: `Letter must be ${LETTER_BODY_MAX_CHARS.toLocaleString()} characters or fewer.` },
      { status: 400, headers: responseHeaders },
    );
  }

  const subject = await getSubject(supabase, subjectId);
  if (!subject) return json({ error: "Subject not found" }, { status: 404, headers: responseHeaders });

  const { data: letter, error } = await supabase
    .from("letters")
    .insert({
      user_id: user.id,
      subject_id: subjectId,
      body: text.trim(),
    })
    .select("*")
    .single();
  if (error) return json({ error: error.message }, { status: 500, headers: responseHeaders });

  await ensureInProcessHandlersWired();
  await dispatchJob({
    kind: "render-letter-reply",
    payload: { letter_id: letter.id },
    taskName: `render-letter-${letter.id}`,
  });

  return json({ letter }, { status: 202, headers: responseHeaders });
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
