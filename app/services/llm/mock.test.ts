import { describe, expect, it } from "vitest";

import { MockLLM } from "./mock.server";
import type { SubjectContext } from "./types.server";

const subject: SubjectContext = {
  subjectId: "s1",
  displayName: "Younger me",
  kind: "inner_child",
  ageInPhoto: 7,
  relationship: null,
  language: "en-US",
  about: { keyMemories: [], tone: "gentle", thingsToAvoid: "" },
};

describe("MockLLM crisis classifier", () => {
  const llm = new MockLLM();

  it("flags explicit ideation", async () => {
    const result = await llm.classifyCrisis({ text: "I want to kill myself." });
    expect(result.flag).toBe("flagged");
  });

  it("marks passive ideation as borderline", async () => {
    const result = await llm.classifyCrisis({ text: "I just want it to stop." });
    expect(result.flag).toBe("borderline");
  });

  it("returns none for benign letters", async () => {
    const result = await llm.classifyCrisis({ text: "Today I went for a walk in the woods." });
    expect(result.flag).toBe("none");
  });
});

describe("MockLLM generateReply", () => {
  const llm = new MockLLM();

  it("leads with hotline when crisis flag is non-none and locale is en-US", async () => {
    const result = await llm.generateReply({
      letter: "I'm so tired.",
      subject,
      ragChunks: [],
      locale: "en-US",
      crisis: {
        flag: "borderline",
        classifierVersions: { prePass: "mock-1" },
      },
    });
    expect(result.script).toMatch(/988/);
  });

  it("does not prefix hotline when flag is none", async () => {
    const result = await llm.generateReply({
      letter: "How are you?",
      subject,
      ragChunks: [],
      locale: "en-US",
      crisis: { flag: "none", classifierVersions: { prePass: "mock-1" } },
    });
    expect(result.script).not.toMatch(/988/);
  });
});
