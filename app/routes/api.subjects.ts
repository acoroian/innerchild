import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";

import { requireUser } from "~/lib/auth.server";
import {
  createSubject,
  listSubjects,
  SUBJECT_KINDS,
  SUBJECT_TONES,
  type CreateSubjectInput,
} from "~/lib/subjects.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase, responseHeaders } = await requireUser(request);
  const subjects = await listSubjects(supabase);
  return json({ subjects }, { headers: responseHeaders });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const { user, supabase, responseHeaders } = await requireUser(request);
  const body = await readJsonBody(request);
  const input = parseCreateInput(body);
  if (!input.ok) {
    return json({ error: input.error }, { status: 400, headers: responseHeaders });
  }

  const subject = await createSubject(supabase, user.id, input.value);
  return json({ subject }, { status: 201, headers: responseHeaders });
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function parseCreateInput(body: unknown): Parsed<CreateSubjectInput> {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;
  const kind = b.kind;
  if (typeof kind !== "string" || !SUBJECT_KINDS.includes(kind as never)) {
    return { ok: false, error: `kind must be one of: ${SUBJECT_KINDS.join(", ")}` };
  }
  const display_name = b.display_name;
  if (typeof display_name !== "string" || display_name.trim().length === 0) {
    return { ok: false, error: "display_name is required" };
  }
  if (display_name.length > 120) {
    return { ok: false, error: "display_name must be 120 characters or fewer" };
  }
  const tone = b.tone;
  if (tone !== undefined && tone !== null && (typeof tone !== "string" || !SUBJECT_TONES.includes(tone as never))) {
    return { ok: false, error: `tone must be one of: ${SUBJECT_TONES.join(", ")}` };
  }
  const age_at_subject = b.age_at_subject;
  if (
    age_at_subject !== undefined &&
    age_at_subject !== null &&
    (typeof age_at_subject !== "number" || !Number.isInteger(age_at_subject) || age_at_subject < 0 || age_at_subject > 130)
  ) {
    return { ok: false, error: "age_at_subject must be an integer 0–130" };
  }
  const key_memories = b.key_memories;
  if (
    key_memories !== undefined &&
    (!Array.isArray(key_memories) || key_memories.some((m) => typeof m !== "string"))
  ) {
    return { ok: false, error: "key_memories must be an array of strings" };
  }
  const things_to_avoid = b.things_to_avoid;
  if (things_to_avoid !== undefined && things_to_avoid !== null && typeof things_to_avoid !== "string") {
    return { ok: false, error: "things_to_avoid must be a string" };
  }
  const relationship = b.relationship;
  if (relationship !== undefined && relationship !== null && typeof relationship !== "string") {
    return { ok: false, error: "relationship must be a string" };
  }

  return {
    ok: true,
    value: {
      kind: kind as CreateSubjectInput["kind"],
      display_name: display_name.trim(),
      age_at_subject: (age_at_subject as number | null | undefined) ?? null,
      relationship: ((relationship as string | null | undefined) ?? null) || null,
      tone: (tone as CreateSubjectInput["tone"] | null | undefined) ?? null,
      key_memories: (key_memories as string[] | undefined) ?? [],
      things_to_avoid: ((things_to_avoid as string | null | undefined) ?? null) || null,
    },
  };
}
