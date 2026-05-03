// EmbeddingEngine adapter contract. 1536 dims everywhere.
//
// V1 default: OpenAI text-embedding-3-small (1536 dims, $0.02 / 1M tokens).
// Mock engine returns deterministic 1536-dim vectors derived from the text
// hash so retrieval still finds matching chunks in tests.

export const EMBEDDING_DIMENSIONS = 1536;

export interface EmbeddingEngine {
  modelId(): string;
  embed(texts: string[]): Promise<number[][]>;
}
