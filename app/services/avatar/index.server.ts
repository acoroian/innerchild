import { config } from "~/lib/config.server";

import { MockAvatarEngine } from "./mock.server";
import type { AvatarEngine } from "./types.server";

let _instance: AvatarEngine | null = null;

export function getAvatarEngine(): AvatarEngine {
  if (_instance) return _instance;
  switch (config.AVATAR_ENGINE) {
    case "tavus":
    case "heygen":
    case "did":
      // Real adapters are scoped for the Phase 0.5 vendor bake-off (see
      // docs/plans/...). Until one ships, the env var is reserved but
      // selecting it falls back to mock with a console warning so local dev
      // doesn't crash on misconfiguration.
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
