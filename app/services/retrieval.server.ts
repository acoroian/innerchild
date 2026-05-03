import type { SupabaseClient } from "@supabase/supabase-js";

import type { RetrievedChunk } from "~/lib/corpus";

import { getEmbeddingEngine } from "./embedding/index.server";

// retrieveChunks: top-K chunks for a Subject given a free-text query.
//
// Plan-CRITICAL #2: callers must pass a per-request user-scoped Supabase
// client (not service-role) so the SECURITY DEFINER RPC enforces ownership
// via auth.uid(). The RPC also adds explicit subject_id filter on top of the
// ivfflat scan to avoid surprise plans.
export async function retrieveChunks({
  supabase,
  subjectId,
  query,
  k = 6,
}: {
  supabase: SupabaseClient;
  subjectId: string;
  query: string;
  k?: number;
}): Promise<RetrievedChunk[]> {
  if (!query.trim()) return [];

  const embedder = getEmbeddingEngine();
  const [embedding] = await embedder.embed([query]);

  // Supabase RPC needs the embedding as a JSON array; pgvector accepts that.
  const { data, error } = await supabase.rpc("retrieve_subject_chunks", {
    p_subject_id: subjectId,
    p_query: embedding,
    p_k: k,
  });
  if (error) throw error;
  return (data ?? []) as RetrievedChunk[];
}
