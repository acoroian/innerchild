// LLM adapter contract.
//
// Two responsibilities:
//   - generateReply: hero-feature script generation, with crisis-aware framing.
//   - classifyCrisis: layered detection. The implementation runs OpenAI
//     omni-moderation as a cheap pre-pass; on borderline scores it falls back
//     to a Haiku-class classifier prompt for passive ideation. Returns one of
//     three flags so the reply path can lead with hotline + care when needed.
//
// Affirmation generation is a Phase-5 (deferred) feature — the contract for it
// will be designed alongside the actual delivery pipeline.
//
// Security review CRITICAL #3: prompt injection defense lives in the
// concrete implementations — user content (letter, About form, RAG chunks)
// must be wrapped in <letter>…</letter>, <about>…</about>, <corpus>…</corpus>
// XML tags with the model instructed to treat tag bodies as data, not
// instructions. The implementations also re-classify the *generated* output
// before persisting.

export interface SubjectContext {
  subjectId: string;
  displayName: string;
  kind: "inner_child" | "ancestor" | "other";
  ageInPhoto: number | null;
  relationship: string | null;
  about: {
    keyMemories: string[];
    tone: "playful" | "wise" | "gentle" | "formal" | "mixed";
    thingsToAvoid: string;
  };
}

export type CrisisFlag = "none" | "borderline" | "flagged";

export interface CrisisClassification {
  flag: CrisisFlag;
  rationale?: string;
  classifierVersions: { prePass: string; secondPass?: string };
}

export interface ReplyResult {
  script: string;
  crisis: CrisisClassification;
}

export interface LLM {
  classifyCrisis(input: { text: string }): Promise<CrisisClassification>;

  generateReply(input: {
    letter: string;
    subject: SubjectContext;
    ragChunks: readonly string[];
    locale: string;
    /** Pre-computed crisis flag — when non-`none`, prompt leads with hotline + care. */
    crisis: CrisisClassification;
  }): Promise<ReplyResult>;
}
