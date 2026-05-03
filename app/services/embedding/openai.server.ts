import { EMBEDDING_DIMENSIONS, type EmbeddingEngine } from "./types.server";

const MODEL_ID = "text-embedding-3-small";
const ENDPOINT = "https://api.openai.com/v1/embeddings";

// Caps:
//   - text-embedding-3-small: 8192 token input limit per item.
//   - Batch size: API supports up to 2048 inputs per call. We cap at 96 here
//     to keep per-request size sane (~ 2 MB of text at 20K chars each).
const BATCH_SIZE = 96;

export class OpenAIEmbeddingEngine implements EmbeddingEngine {
  constructor(private readonly apiKey: string) {
    if (!apiKey) {
      throw new Error("OpenAIEmbeddingEngine requires OPENAI_API_KEY");
    }
  }

  modelId(): string {
    return MODEL_ID;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL_ID,
          input: batch,
          dimensions: EMBEDDING_DIMENSIONS,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`OpenAI embed failed (${res.status}): ${text}`);
      }
      const json = (await res.json()) as { data?: { embedding: number[] }[] };
      if (!json.data || json.data.length !== batch.length) {
        throw new Error("OpenAI embed response missing data");
      }
      for (const item of json.data) results.push(item.embedding);
    }
    return results;
  }
}
