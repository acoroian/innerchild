// OpenAI omni-moderation pre-pass. Layer 1 of the crisis classifier.
//
// Endpoint: POST /v1/moderations  body { model, input }
//   model = "omni-moderation-latest"
// Response shape: { results: [{ categories: {...}, category_scores: {...} }] }
//
// We map self_harm + self_harm_intent + self_harm_instructions into our
// (none, borderline, flagged) bucketing. Threshold tuning is intentionally
// conservative — false positives just add a hotline clause to the reply,
// which is acceptable; false negatives are not.

const ENDPOINT = "https://api.openai.com/v1/moderations";
export const MODERATION_MODEL = "omni-moderation-latest";

export interface OmniModerationScores {
  self_harm: number;
  self_harm_intent: number;
  self_harm_instructions: number;
  // Other categories we might surface later; only the self-harm trio is used
  // for crisis bucketing today.
  violence?: number;
  hate?: number;
}

export interface OmniModerationResult {
  flagged: boolean;
  scores: OmniModerationScores;
}

interface ModerationApiResponse {
  results: Array<{
    flagged?: boolean;
    categories?: Record<string, boolean>;
    category_scores?: Record<string, number>;
  }>;
}

export async function callOmniModeration(
  apiKey: string,
  text: string,
): Promise<OmniModerationResult> {
  if (!apiKey) throw new Error("openai api key required");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: MODERATION_MODEL, input: text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`omni-moderation failed (${res.status}): ${body}`);
  }
  const json = (await res.json()) as ModerationApiResponse;
  const r = json.results?.[0];
  if (!r) throw new Error("omni-moderation returned no results");

  const scores = r.category_scores ?? {};
  return {
    flagged: r.flagged ?? false,
    scores: {
      self_harm: scores["self-harm"] ?? scores.self_harm ?? 0,
      self_harm_intent: scores["self-harm/intent"] ?? scores.self_harm_intent ?? 0,
      self_harm_instructions:
        scores["self-harm/instructions"] ?? scores.self_harm_instructions ?? 0,
      violence: scores.violence,
      hate: scores.hate,
    },
  };
}
