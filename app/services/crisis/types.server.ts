// Crisis classification contract.
//
// Phase 5: layered detection.
//   Layer 1 (cheap, fast): OpenAI omni-moderation. Triggered on every letter.
//                          ~5ms latency, ~free.
//   Layer 2 (smarter):     Anthropic Haiku second-pass. Triggered ONLY when
//                          omni-moderation lands in the borderline band.
//                          Catches passive ideation that omni misses.
//   Circuit breaker:       If omni-moderation fails (network, 5xx, key
//                          rotation), fall back to a static keyword pre-filter
//                          and FORCE flag='borderline'. Failing closed (no
//                          reply) is hostile to a user in distress; failing
//                          open (no detection) is irresponsible. Borderline-
//                          forced gets the hotline-leading prompt without
//                          blocking the reply.

export type CrisisFlag = "none" | "borderline" | "flagged";

export interface CrisisClassifierVersions {
  prePass: string; // e.g. "omni-moderation-latest" | "skipped" | "fallback-keyword"
  secondPass?: string; // e.g. "claude-haiku-4-5" | undefined
}

export interface CrisisResult {
  flag: CrisisFlag;
  rationale?: string;
  classifierVersions: CrisisClassifierVersions;
  // Audit trail. The raw scores from omni-moderation, kept so a reviewer can
  // re-read the decision. Truncated to a few categories to keep rows small.
  scores?: Record<string, number>;
}
