import { config } from "~/lib/config.server";

import { ElevenLabsVoiceEngine } from "./elevenlabs.server";
import { MockVoiceEngine } from "./mock.server";
import type { VoiceEngine } from "./types.server";

let _instance: VoiceEngine | null = null;

export function getVoiceEngine(): VoiceEngine {
  if (_instance) return _instance;
  switch (config.VOICE_ENGINE) {
    case "elevenlabs":
      _instance = new ElevenLabsVoiceEngine(config.ELEVENLABS_API_KEY ?? "");
      break;
    case "cartesia":
      throw new Error("Cartesia adapter not yet implemented; set VOICE_ENGINE=mock or elevenlabs");
    case "mock":
    default:
      _instance = new MockVoiceEngine();
      break;
  }
  return _instance;
}

// Test hook so tests can inject a stub.
export function _setVoiceEngineForTest(engine: VoiceEngine | null): void {
  _instance = engine;
}
