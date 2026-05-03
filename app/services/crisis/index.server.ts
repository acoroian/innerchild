// Crisis service. Orchestrates the layered detection per Plan-CRITICAL #19.
//
//   classify(text):
//     1. Run omni-moderation. On failure → keyword fallback + force borderline.
//     2. Map scores to (none | borderline | flagged) bucketing.
//     3. If borderline OR flagged, run Haiku second pass for a calibrated read.
//     4. Return final flag + scores + classifier versions for audit.
//
// Stays out of LLM.classifyCrisis() so the LLM contract remains a thin
// wrapper around the model API. The renderLetterReplyJob calls THIS service.

import { config } from "~/lib/config.server";
import { getLLM } from "~/services/llm/index.server";

import { keywordBucket } from "./keyword-fallback";
import { callOmniModeration, MODERATION_MODEL } from "./openai-moderation.server";
import type { CrisisFlag, CrisisResult } from "./types.server";

// Tunable thresholds. Chosen conservatively — false positives only add a
// hotline clause, false negatives matter more.
const THRESHOLD_FLAGGED = 0.85;
const THRESHOLD_BORDERLINE = 0.35;

export async function classifyCrisis(text: string): Promise<CrisisResult> {
  // Layer 1: omni-moderation.
  let preFlag: CrisisFlag = "none";
  let scores: Record<string, number> | undefined;
  let prePassUsed: string;

  if (!config.OPENAI_API_KEY) {
    // No key configured — fall back to keyword pre-filter so local-dev /
    // mock setups still get crisis-aware replies.
    return keywordOnlyResult(text);
  }

  try {
    const mod = await callOmniModeration(config.OPENAI_API_KEY, text);
    prePassUsed = MODERATION_MODEL;
    scores = mod.scores as unknown as Record<string, number>;
    const peak = Math.max(
      mod.scores.self_harm,
      mod.scores.self_harm_intent,
      mod.scores.self_harm_instructions,
    );
    if (peak >= THRESHOLD_FLAGGED || mod.scores.self_harm_intent >= THRESHOLD_BORDERLINE) {
      preFlag = "flagged";
    } else if (peak >= THRESHOLD_BORDERLINE) {
      preFlag = "borderline";
    } else {
      preFlag = "none";
    }
  } catch (err) {
    // Circuit breaker: omni-moderation is dark. Fall back to keyword check
    // and force borderline — failing closed (no reply) is hostile, failing
    // open (no detection) is irresponsible.
    console.error("[crisis] omni-moderation failed, using keyword fallback:", err);
    return circuitBrokenResult(text);
  }

  // Skip the second pass when the cheap layer is confident the text is benign.
  if (preFlag === "none") {
    return {
      flag: "none",
      classifierVersions: { prePass: prePassUsed },
      scores,
    };
  }

  // Layer 2: Haiku second pass for borderline / flagged. The LLM impl decides
  // whether a borderline pre-pass deserves promotion to flagged or demotion
  // to none. We trust its bucket but keep the more severe of the two.
  try {
    const llm = getLLM();
    const second = await llm.classifyCrisis({ text });
    const finalFlag = mostSevere(preFlag, second.flag);
    return {
      flag: finalFlag,
      rationale: second.rationale ?? `omni-moderation peak=${preFlag}`,
      classifierVersions: {
        prePass: prePassUsed,
        secondPass: second.classifierVersions.secondPass,
      },
      scores,
    };
  } catch (err) {
    // Second-pass failure is non-fatal — keep the pre-pass verdict.
    console.warn("[crisis] second-pass classifier failed, keeping pre-pass verdict:", err);
    return {
      flag: preFlag,
      rationale: `omni-moderation peak=${preFlag}; second pass unavailable`,
      classifierVersions: { prePass: prePassUsed },
      scores,
    };
  }
}

function circuitBrokenResult(text: string): CrisisResult {
  const bucket = keywordBucket(text);
  const flag: CrisisFlag = bucket === "explicit" ? "flagged" : "borderline";
  return {
    flag,
    rationale: `omni-moderation unavailable; keyword fallback bucket=${bucket}`,
    classifierVersions: { prePass: "fallback-keyword" },
  };
}

function keywordOnlyResult(text: string): CrisisResult {
  const bucket = keywordBucket(text);
  if (bucket === "explicit") {
    return {
      flag: "flagged",
      rationale: "no openai key; keyword bucket=explicit",
      classifierVersions: { prePass: "keyword-only" },
    };
  }
  if (bucket === "passive") {
    return {
      flag: "borderline",
      rationale: "no openai key; keyword bucket=passive",
      classifierVersions: { prePass: "keyword-only" },
    };
  }
  return {
    flag: "none",
    classifierVersions: { prePass: "keyword-only" },
  };
}

function mostSevere(a: CrisisFlag, b: CrisisFlag): CrisisFlag {
  const rank = { none: 0, borderline: 1, flagged: 2 } as const;
  return rank[a] >= rank[b] ? a : b;
}

export type { CrisisResult, CrisisFlag } from "./types.server";
