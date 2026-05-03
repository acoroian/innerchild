import { config } from "~/lib/config.server";

import { MockAvatarEngine } from "./mock.server";
import { TavusAvatarEngine } from "./tavus.server";
import type { AvatarEngine } from "./types.server";

let _instance: AvatarEngine | null = null;

export function getAvatarEngine(): AvatarEngine {
  if (_instance) return _instance;
  switch (config.AVATAR_ENGINE) {
    case "tavus":
      _instance = new TavusAvatarEngine(
        config.TAVUS_API_KEY ?? "",
        config.TAVUS_PRESET_REPLICA_ID,
      );
      break;
    case "heygen":
    case "did":
      // HeyGen + D-ID adapters are not implemented; Tavus is the V1 pick.
      console.warn(
        `[avatar] AVATAR_ENGINE=${config.AVATAR_ENGINE} not yet implemented; falling back to mock`,
      );
      _instance = new MockAvatarEngine();
      break;
    case "mock":
    default:
      _instance = new MockAvatarEngine();
      break;
  }
  return _instance;
}

export function _setAvatarEngineForTest(engine: AvatarEngine | null): void {
  _instance = engine;
}
