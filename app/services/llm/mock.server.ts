import type {
  AffirmationResult,
  CrisisClassification,
  LLM,
  ReplyResult,
  SubjectContext,
} from "./types.server";

interface ReplyInput {
  letter: string;
  subject: SubjectContext;
  ragChunks: string[];
  locale: string;
  crisis: CrisisClassification;
}

interface AffirmationInput {
  theme: string;
  subject: SubjectContext;
  recentScripts: string[];
}

export class MockLLM implements LLM {
  async classifyCrisis(input: { text: string }): Promise<CrisisClassification> {
    // Crude keyword stub so unit tests can exercise the crisis branch without
    // hitting the real classifier. Real implementation runs omni-moderation
    // first, then Haiku second-pass on borderline.
    const text = input.text.toLowerCase();
    const explicit = ["kill myself", "end it all", "suicide", "want to die"];
    const passive = ["hopeless", "i just want it to stop", "no point", "give up"];

    if (explicit.some((kw) => text.includes(kw))) {
      return {
        flag: "flagged",
        rationale: "explicit ideation keyword match (mock)",
        classifierVersions: { prePass: "mock-1" },
      };
    }
    if (passive.some((kw) => text.includes(kw))) {
      return {
        flag: "borderline",
        rationale: "passive ideation keyword match (mock)",
        classifierVersions: { prePass: "mock-1" },
      };
    }
    return {
      flag: "none",
      classifierVersions: { prePass: "mock-1" },
    };
  }

  async generateReply(input: ReplyInput): Promise<ReplyResult> {
    const hotlinePrefix =
      input.crisis.flag !== "none" && input.locale === "en-US"
        ? "I hear you, and I'm so glad you wrote. If you're in crisis, please call or text 988 — there's someone who wants to help. "
        : "";
    return {
      script: `${hotlinePrefix}Hello. It's me, ${input.subject.displayName}. I read your letter, and I'm here.`,
      crisis: input.crisis,
    };
  }

  async generateAffirmation(input: AffirmationInput): Promise<AffirmationResult> {
    return {
      script: `It's ${input.subject.displayName}. I'm proud of you today.`,
    };
  }
}
