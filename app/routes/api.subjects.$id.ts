import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";

import { requireUser } from "~/lib/auth.server";
import {
  getSubject,
  listSubjectPhotos,
  softDeleteSubject,
  SUBJECT_KINDS,
  SUBJECT_TONES,
  updateSubject,
  type CreateSubjectInput,
} from "~/lib/subjects.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabase, responseHeaders } = await requireUser(request);
  const id = params.id;
  if (!id) return json({ error: "Missing id" }, { status: 400, headers: responseHeaders });

  const subject = await getSubject(supabase, id);
  if (!subject) return json({ error: "Not found" }, { status: 404, headers: responseHeaders });

  const photos = await listSubjectPhotos(supabase, id);
  return json({ subject, photos }, { headers: responseHeaders });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { supabase, responseHeaders } = await requireUser(request);
  const id = params.id;
  if (!id) return json({ error: "Missing id" }, { status: 400, headers: responseHeaders });

  if (request.method === "DELETE") {
    await softDeleteSubject(supabase, id);
    return json({ ok: true }, { headers: responseHeaders });
  }

  if (request.method === "PATCH") {
    const body = await readJsonBody(request);
    const patch = parsePatchInput(body);
    if (!patch.ok) return json({ error: patch.error }, { status: 400, headers: responseHeaders });
    const subject = await updateSubject(supabase, id, patch.value);
    return json({ subject }, { headers: responseHeaders });
  }

  return json({ error: "Method not allowed" }, { status: 405, headers: responseHeaders });
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function parsePatchInput(body: unknown): Parsed<Partial<CreateSubjectInput>> {
  if (!body || typeof body !== "object") return { ok: false, error: "Body must be a JSON object" };
  const b = body as Record<string, unknown>;
  const out: Partial<CreateSubjectInput> = {};

  if (b.kind !== undefined) {
    if (typeof b.kind !== "string" || !SUBJECT_KINDS.includes(b.kind as never)) {
      return { ok: false, error: `kind must be one of: ${SUBJECT_KINDS.join(", ")}` };
    }
    out.kind = b.kind as CreateSubjectInput["kind"];
  }
  if (b.display_name !== undefined) {
    if (typeof b.display_name !== "string" || b.display_name.trim().length === 0 || b.display_name.length > 120) {
      return { ok: false, error: "display_name must be 1–120 chars" };
    }
    out.display_name = b.display_name.trim();
  }
  if (b.age_at_subject !== undefined) {
    const v = b.age_at_subject;
    if (v !== null && (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 130)) {
      return { ok: false, error: "age_at_subject must be an integer 0–130 or null" };
    }
    out.age_at_subject = v as number | null;
  }
  if (b.tone !== undefined) {
    const v = b.tone;
    if (v !== null && (typeof v !== "string" || !SUBJECT_TONES.includes(v as never))) {
      return { ok: false, error: `tone must be one of: ${SUBJECT_TONES.join(", ")} or null` };
    }
    out.tone = v as CreateSubjectInput["tone"] | null;
  }
  if (b.relationship !== undefined) {
    if (b.relationship !== null && typeof b.relationship !== "string") {
      return { ok: false, error: "relationship must be a string or null" };
    }
    out.relationship = b.relationship as string | null;
  }
  if (b.key_memories !== undefined) {
    if (!Array.isArray(b.key_memories) || b.key_memories.some((m) => typeof m !== "string")) {
      return { ok: false, error: "key_memories must be an array of strings" };
    }
    out.key_memories = b.key_memories as string[];
  }
  if (b.things_to_avoid !== undefined) {
    if (b.things_to_avoid !== null && typeof b.things_to_avoid !== "string") {
      return { ok: false, error: "things_to_avoid must be a string or null" };
    }
    out.things_to_avoid = b.things_to_avoid as string | null;
  }

  return { ok: true, value: out };
}
