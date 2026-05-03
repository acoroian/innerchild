import { CORPUS_BUCKET, chunkText, type CorpusIngestStatus } from "~/lib/corpus";
import { getServiceRoleSupabaseClient } from "~/lib/supabase.server";
import { getEmbeddingEngine } from "~/services/embedding/index.server";

export interface EmbedCorpusPayload {
  doc_id: string;
}

export interface EmbedCorpusResult {
  status: "ok" | "skipped" | "error";
  chunk_count?: number;
  reason?: string;
}

// Embed a corpus doc end-to-end.
//   1. Load doc.
//   2. If status==='ready', skip.
//   3. Set status='embedding'; clear prior chunks.
//   4. Resolve text:
//      - inline_text for source_kind='pasted'
//      - bucket fetch for 'text' / 'markdown'
//      - PDF extraction stub for 'pdf' (V1: rejects with explicit error)
//   5. chunkText → embeddings → bulk insert into subject_chunks.
//   6. Persist status='ready' + chunk_count.
export async function embedCorpusJob(payload: EmbedCorpusPayload): Promise<EmbedCorpusResult> {
  const supabase = getServiceRoleSupabaseClient();
  const embedder = getEmbeddingEngine();

  const { data: doc, error: docErr } = await supabase
    .from("subject_corpus_docs")
    .select("*")
    .eq("id", payload.doc_id)
    .maybeSingle();
  if (docErr) return { status: "error", reason: docErr.message };
  if (!doc) return { status: "error", reason: "doc not found" };
  if (doc.ingest_status === "ready") {
    return { status: "skipped", chunk_count: doc.chunk_count, reason: "already embedded" };
  }

  await supabase
    .from("subject_corpus_docs")
    .update({ ingest_status: "embedding" satisfies CorpusIngestStatus, ingest_error: null })
    .eq("id", doc.id);

  // Clear prior chunks to keep idempotency (re-runs replace, not duplicate).
  await supabase.from("subject_chunks").delete().eq("doc_id", doc.id);

  let text = "";
  try {
    text = await resolveDocText(supabase, doc);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await supabase
      .from("subject_corpus_docs")
      .update({ ingest_status: "failed" satisfies CorpusIngestStatus, ingest_error: reason })
      .eq("id", doc.id);
    return { status: "error", reason };
  }

  const chunks = chunkText(text);
  if (chunks.length === 0) {
    await supabase
      .from("subject_corpus_docs")
      .update({
        ingest_status: "ready" satisfies CorpusIngestStatus,
        chunk_count: 0,
        ingest_error: null,
      })
      .eq("id", doc.id);
    return { status: "ok", chunk_count: 0 };
  }

  let embeddings: number[][];
  try {
    embeddings = await embedder.embed(chunks.map((c) => c.text));
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await supabase
      .from("subject_corpus_docs")
      .update({ ingest_status: "failed" satisfies CorpusIngestStatus, ingest_error: reason })
      .eq("id", doc.id);
    return { status: "error", reason };
  }

  const rows = chunks.map((c, i) => ({
    subject_id: doc.subject_id,
    doc_id: doc.id,
    chunk_index: c.index,
    text: c.text,
    embedding: embeddings[i],
    embed_model: embedder.modelId(),
  }));

  // Bulk insert. Cap is well within Supabase's payload limit at typical chunk
  // counts; if a doc ever produces thousands of chunks, batch this.
  const { error: insertErr } = await supabase.from("subject_chunks").insert(rows);
  if (insertErr) {
    await supabase
      .from("subject_corpus_docs")
      .update({ ingest_status: "failed" satisfies CorpusIngestStatus, ingest_error: insertErr.message })
      .eq("id", doc.id);
    return { status: "error", reason: insertErr.message };
  }

  await supabase
    .from("subject_corpus_docs")
    .update({
      ingest_status: "ready" satisfies CorpusIngestStatus,
      chunk_count: rows.length,
      ingest_error: null,
    })
    .eq("id", doc.id);

  return { status: "ok", chunk_count: rows.length };
}

async function resolveDocText(
  supabase: ReturnType<typeof getServiceRoleSupabaseClient>,
  doc: {
    id: string;
    storage_path: string | null;
    source_kind: string;
    inline_text: string | null;
  },
): Promise<string> {
  if (doc.source_kind === "pasted") {
    if (!doc.inline_text) throw new Error("pasted doc has no inline_text");
    return doc.inline_text;
  }
  if (!doc.storage_path) throw new Error("doc has no storage_path");

  const { data, error } = await supabase.storage.from(CORPUS_BUCKET).download(doc.storage_path);
  if (error || !data) throw new Error(error?.message ?? "could not download doc");

  if (doc.source_kind === "text" || doc.source_kind === "markdown") {
    return await data.text();
  }
  if (doc.source_kind === "pdf") {
    // V1: PDF extraction not wired. Users can paste content for PDFs until
    // pdf-parse / unpdf is added in a follow-up phase.
    throw new Error("PDF extraction not yet supported in V1; paste the text instead");
  }
  throw new Error(`unsupported source_kind: ${doc.source_kind}`);
}
