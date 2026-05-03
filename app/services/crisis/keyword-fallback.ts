// Static keyword pre-filter. Used ONLY by the circuit breaker when
// omni-moderation fails — never as the primary classifier.
//
// Two buckets, intentionally narrow:
//   explicit  — fairly unambiguous active ideation phrases.
//   passive   — distress signals that warrant the hotline clause.
//
// The fallback always returns 'borderline' on any match (or no match) so
// the reply still goes out with the hotline clause. Better to be a little
// over-eager when our smart classifier is dark.

const EXPLICIT = [
  "kill myself",
  "end it all",
  "want to die",
  "going to kill",
  "no reason to live",
  "take my own life",
  "suicide",
];

const PASSIVE = [
  "hopeless",
  "no point",
  "give up",
  "i can't go on",
  "want it to stop",
  "tired of being alive",
];

export type FallbackBucket = "explicit" | "passive" | "none";

export function keywordBucket(text: string): FallbackBucket {
  const t = text.toLowerCase();
  if (EXPLICIT.some((kw) => t.includes(kw))) return "explicit";
  if (PASSIVE.some((kw) => t.includes(kw))) return "passive";
  return "none";
}
