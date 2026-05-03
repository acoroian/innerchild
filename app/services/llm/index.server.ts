import { config } from "~/lib/config.server";

import { AnthropicLLM } from "./anthropic.server";
import { MockLLM } from "./mock.server";
import type { LLM } from "./types.server";

let _instance: LLM | null = null;

export function getLLM(): LLM {
  if (_instance) return _instance;
  switch (config.REPLY_LLM) {
    case "anthropic":
      _instance = new AnthropicLLM(config.ANTHROPIC_API_KEY ?? "");
      break;
    case "openai":
      throw new Error("OpenAI LLM adapter not implemented in V1; set REPLY_LLM=mock or anthropic");
    case "mock":
    default:
      _instance = new MockLLM();
      break;
  }
  return _instance;
}

export function _setLLMForTest(llm: LLM | null): void {
  _instance = llm;
}
