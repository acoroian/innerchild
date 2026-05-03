import { createHash } from "node:crypto";

import { EMBEDDING_DIMENSIONS, type EmbeddingEngine } from "./types.server";

// Deterministic mock embedder: same text → same vector. Built from sha256
// expanded to 1536 floats in [-1, 1]. Crude but consistent — exact-text
// retrieval works in tests, semantic search does not (which is fine for
// non-vendor unit tests).
export class MockEmbeddingEngine implements EmbeddingEngine {
  modelId(): string {
    return "mock-embedding-1536";
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => embedOne(t));
  }
}

function embedOne(text: string): number[] {
  const hash = createHash("sha256").update(text).digest();
  const out = new Array<number>(EMBEDDING_DIMENSIONS);
  // Stretch the 32-byte digest across 1536 dims by tiling and applying a
  // tiny LCG so the vector isn't blocky.
  let seed = 1;
  for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
    const byte = hash[(i + seed) % hash.length];
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    out[i] = (byte - 128) / 128;
  }
  return out;
}
