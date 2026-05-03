// Pure types/constants for corpus docs. Server-only operations live in
// corpus.server.ts.

export type CorpusSourceKind = "text" | "markdown" | "pdf" | "pasted";
export type CorpusIngestStatus = "pending" | "embedding" | "ready" | "failed";

export const CORPUS_BUCKET = "subject-corpus";
export const CORPUS_FILE_MAX_BYTES = 25 * 1024 * 1024;
export const CORPUS_INLINE_MAX_CHARS = 200_000;

export interface SubjectCorpusDoc {
  id: string;
  subject_id: string;
  storage_path: string | null;
  title: string;
  source_kind: CorpusSourceKind;
  byte_size: number | null;
  ingest_status: CorpusIngestStatus;
  ingest_error: string | null;
  chunk_count: number;
  inline_text: string | null;
  created_at: string;
  updated_at: string;
}

export interface RetrievedChunk {
  chunk_id: string;
  doc_id: string;
  text: string;
  similarity: number;
}

const ALLOWED_CORPUS_MIME = ["text/plain", "text/markdown", "application/pdf"] as const;
export type AllowedCorpusMime = (typeof ALLOWED_CORPUS_MIME)[number];

export function isAllowedCorpusMime(mime: string): mime is AllowedCorpusMime {
  return (ALLOWED_CORPUS_MIME as readonly string[]).includes(mime);
}

export function corpusMimeToSourceKind(mime: AllowedCorpusMime): CorpusSourceKind {
  switch (mime) {
    case "text/plain":
      return "text";
    case "text/markdown":
      return "markdown";
    case "application/pdf":
      return "pdf";
  }
}

const CORPUS_MIME_TO_EXT: Record<AllowedCorpusMime, string> = {
  "text/plain": "txt",
  "text/markdown": "md",
  "application/pdf": "pdf",
};

export function buildCorpusStoragePath(args: {
  userId: string;
  subjectId: string;
  docId: string;
  contentType: AllowedCorpusMime;
}): string {
  const ext = CORPUS_MIME_TO_EXT[args.contentType];
  return `${args.userId}/${args.subjectId}/${args.docId}.${ext}`;
}

// Character-based chunking. We aim for ~2000 chars (~500 tokens) per chunk
// with a 200-char overlap, mirroring the plan's 512-token / 64-overlap ratio.
// Pure function — no embeddings called here.
export interface Chunk {
  index: number;
  text: string;
}

export function chunkText(input: string, opts?: { size?: number; overlap?: number }): Chunk[] {
  const size = opts?.size ?? 2000;
  const overlap = opts?.overlap ?? 200;
  if (size <= 0) throw new Error("chunk size must be > 0");
  if (overlap < 0 || overlap >= size) throw new Error("overlap must be in [0, size)");

  const normalized = input.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const chunks: Chunk[] = [];
  let start = 0;
  let index = 0;
  while (start < normalized.length) {
    let end = Math.min(normalized.length, start + size);
    if (end < normalized.length) {
      // Prefer to break at a paragraph or sentence boundary near `end`.
      const slice = normalized.slice(start, end);
      const lastPara = slice.lastIndexOf("\n\n");
      const lastSentence = slice.lastIndexOf(". ");
      const boundary = lastPara > size / 2 ? lastPara + 2 : lastSentence > size / 2 ? lastSentence + 2 : -1;
      if (boundary > 0) end = start + boundary;
    }
    const text = normalized.slice(start, end).trim();
    if (text) chunks.push({ index, text });
    if (end >= normalized.length) break;
    index += 1;
    start = end - overlap;
  }
  return chunks;
}
