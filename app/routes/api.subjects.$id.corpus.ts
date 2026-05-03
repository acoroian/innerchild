import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";

import { requireUser } from "~/lib/auth.server";
import {
  buildCorpusStoragePath,
  CORPUS_BUCKET,
  CORPUS_FILE_MAX_BYTES,
  CORPUS_INLINE_MAX_CHARS,
  corpusMimeToSourceKind,
  isAllowedCorpusMime,
  type AllowedCorpusMime,
  type CorpusSourceKind,
} from "~/lib/corpus";
import { dispatchJob, ensureInProcessHandlersWired } from "~/lib/dispatch.server";
import { getSubject } from "~/lib/subjects.server";

// Corpus management for a Subject.
//
//   GET → { docs }
//   POST { intent: "upload-url", content_type, title } →
//        { upload_url, storage_path, doc_id }
//   POST { intent: "confirm-file", doc_id, storage_path, content_type, byte_size, title } →
//        { doc } (also enqueues embed-subject-corpus)
//   POST { intent: "paste", title, text } →
//        { doc } (also enqueues embed-subject-corpus)
//   DELETE ?doc_id=... → cascades to chunks; removes Storage object if any.

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabase, responseHeaders } = await requireUser(request);
  const subjectId = params.id;
  if (!subjectId) {
    return json({ error: "Missing subject id" }, { status: 400, headers: responseHeaders });
  }
  const { data, error } = await supabase
    .from("subject_corpus_docs")
    .select("*")
    .eq("subject_id", subjectId)
    .order("created_at", { ascending: false });
  if (error) return json({ error: error.message }, { status: 500, headers: responseHeaders });
  return json({ docs: data ?? [] }, { headers: responseHeaders });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { user, supabase, responseHeaders } = await requireUser(request);
  const subjectId = params.id;
  if (!subjectId) {
    return json({ error: "Missing subject id" }, { status: 400, headers: responseHeaders });
  }
  const subject = await getSubject(supabase, subjectId);
  if (!subject) {
    return json({ error: "Subject not found" }, { status: 404, headers: responseHeaders });
  }

  if (request.method === "DELETE") {
    const url = new URL(request.url);
    const docId = url.searchParams.get("doc_id");
    if (!docId) {
      return json({ error: "doc_id required" }, { status: 400, headers: responseHeaders });
    }
    return deleteDoc({ supabase, responseHeaders, subjectId, docId });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405, headers: responseHeaders });
  }

  const body = (await readJsonBody(request)) as Record<string, unknown> | null;
  if (!body) {
    return json({ error: "Body must be JSON" }, { status: 400, headers: responseHeaders });
  }

  if (body.intent === "upload-url") {
    const contentType = body.content_type;
    const title = body.title;
    if (typeof contentType !== "string" || !isAllowedCorpusMime(contentType)) {
      return json(
        { error: "content_type must be text/plain, text/markdown, or application/pdf" },
        { status: 400, headers: responseHeaders },
      );
    }
    if (typeof title !== "string" || title.trim().length === 0 || title.length > 200) {
      return json({ error: "title must be 1–200 chars" }, { status: 400, headers: responseHeaders });
    }
    const docId = crypto.randomUUID();
    const storagePath = buildCorpusStoragePath({
      userId: user.id,
      subjectId,
      docId,
      contentType: contentType as AllowedCorpusMime,
    });
    const { data, error } = await supabase.storage
      .from(CORPUS_BUCKET)
      .createSignedUploadUrl(storagePath);
    if (error || !data) {
      return json(
        { error: error?.message ?? "Could not issue upload URL" },
        { status: 500, headers: responseHeaders },
      );
    }
    return json(
      { upload_url: data.signedUrl, storage_path: storagePath, doc_id: docId },
      { status: 201, headers: responseHeaders },
    );
  }

  if (body.intent === "confirm-file") {
    const docId = body.doc_id;
    const storagePath = body.storage_path;
    const contentType = body.content_type;
    const byteSize = body.byte_size;
    const title = body.title;

    if (typeof docId !== "string" || typeof storagePath !== "string" || typeof contentType !== "string") {
      return json(
        { error: "doc_id, storage_path, content_type are required" },
        { status: 400, headers: responseHeaders },
      );
    }
    if (!isAllowedCorpusMime(contentType)) {
      return json({ error: "content_type not allowed" }, { status: 400, headers: responseHeaders });
    }
    if (typeof title !== "string" || title.trim().length === 0 || title.length > 200) {
      return json({ error: "title must be 1–200 chars" }, { status: 400, headers: responseHeaders });
    }
    const expectedPath = buildCorpusStoragePath({
      userId: user.id,
      subjectId,
      docId,
      contentType: contentType as AllowedCorpusMime,
    });
    if (storagePath !== expectedPath) {
      return json({ error: "storage_path does not match expected layout" }, {
        status: 400,
        headers: responseHeaders,
      });
    }
    if (
      byteSize !== undefined &&
      (typeof byteSize !== "number" || !Number.isInteger(byteSize) || byteSize < 0 || byteSize > CORPUS_FILE_MAX_BYTES)
    ) {
      return json({ error: "byte_size invalid" }, { status: 400, headers: responseHeaders });
    }

    const { data: doc, error } = await supabase
      .from("subject_corpus_docs")
      .insert({
        id: docId,
        subject_id: subjectId,
        storage_path: storagePath,
        title: title.trim(),
        source_kind: corpusMimeToSourceKind(contentType as AllowedCorpusMime),
        byte_size: byteSize ?? null,
        ingest_status: "pending",
      })
      .select("*")
      .single();
    if (error) return json({ error: error.message }, { status: 500, headers: responseHeaders });

    await ensureInProcessHandlersWired();
    await dispatchJob({
      kind: "embed-subject-corpus",
      payload: { doc_id: docId },
      taskName: `embed-corpus-${docId}`,
    });

    return json({ doc }, { status: 202, headers: responseHeaders });
  }

  if (body.intent === "paste") {
    const title = body.title;
    const text = body.text;
    if (typeof title !== "string" || title.trim().length === 0 || title.length > 200) {
      return json({ error: "title must be 1–200 chars" }, { status: 400, headers: responseHeaders });
    }
    if (typeof text !== "string" || text.trim().length === 0) {
      return json({ error: "text must be a non-empty string" }, { status: 400, headers: responseHeaders });
    }
    if (text.length > CORPUS_INLINE_MAX_CHARS) {
      return json(
        { error: `pasted text must be ${CORPUS_INLINE_MAX_CHARS.toLocaleString()} chars or fewer` },
        { status: 400, headers: responseHeaders },
      );
    }

    const docId = crypto.randomUUID();
    const { data: doc, error } = await supabase
      .from("subject_corpus_docs")
      .insert({
        id: docId,
        subject_id: subjectId,
        storage_path: null,
        title: title.trim(),
        source_kind: "pasted" satisfies CorpusSourceKind,
        byte_size: new TextEncoder().encode(text).length,
        ingest_status: "pending",
        inline_text: text,
      })
      .select("*")
      .single();
    if (error) return json({ error: error.message }, { status: 500, headers: responseHeaders });

    await ensureInProcessHandlersWired();
    await dispatchJob({
      kind: "embed-subject-corpus",
      payload: { doc_id: docId },
      taskName: `embed-corpus-${docId}`,
    });

    return json({ doc }, { status: 202, headers: responseHeaders });
  }

  return json({ error: "intent must be 'upload-url' | 'confirm-file' | 'paste'" }, {
    status: 400,
    headers: responseHeaders,
  });
}

async function deleteDoc({
  supabase,
  responseHeaders,
  subjectId,
  docId,
}: {
  supabase: ReturnType<typeof import("~/lib/supabase.server").createServerSupabaseClient>;
  responseHeaders: Headers;
  subjectId: string;
  docId: string;
}) {
  const { data: existing, error: fetchErr } = await supabase
    .from("subject_corpus_docs")
    .select("storage_path")
    .eq("id", docId)
    .eq("subject_id", subjectId)
    .maybeSingle();
  if (fetchErr) return json({ error: fetchErr.message }, { status: 500, headers: responseHeaders });
  if (!existing) return json({ error: "Doc not found" }, { status: 404, headers: responseHeaders });

  // Cascade deletes chunks via the FK.
  const { error: delErr } = await supabase
    .from("subject_corpus_docs")
    .delete()
    .eq("id", docId);
  if (delErr) return json({ error: delErr.message }, { status: 500, headers: responseHeaders });

  if (existing.storage_path) {
    await supabase.storage.from(CORPUS_BUCKET).remove([existing.storage_path]);
  }

  return json({ ok: true }, { headers: responseHeaders });
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
