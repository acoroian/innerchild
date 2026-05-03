import { config } from "~/lib/config.server";

import { MockEmbeddingEngine } from "./mock.server";
import { OpenAIEmbeddingEngine } from "./openai.server";
import type { EmbeddingEngine } from "./types.server";

let _instance: EmbeddingEngine | null = null;

export function getEmbeddingEngine(): EmbeddingEngine {
  if (_instance) return _instance;
  // Only OpenAI is supported as a real engine in V1. Falls back to mock when
  // no key is provided so local dev and tests never hit the network.
  if (config.OPENAI_API_KEY) {
    _instance = new OpenAIEmbeddingEngine(config.OPENAI_API_KEY);
  } else {
    _instance = new MockEmbeddingEngine();
  }
  return _instance;
}

export function _setEmbeddingEngineForTest(engine: EmbeddingEngine | null): void {
  _instance = engine;
}

export type { EmbeddingEngine } from "./types.server";
export { EMBEDDING_DIMENSIONS } from "./types.server";
