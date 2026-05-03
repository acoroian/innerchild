import { describe, expect, it } from "vitest";

import { keywordBucket } from "./keyword-fallback";

describe("keywordBucket", () => {
  it("returns 'none' for benign text", () => {
    expect(keywordBucket("had a great walk today")).toBe("none");
    expect(keywordBucket("")).toBe("none");
  });

  it("returns 'explicit' for active ideation phrases", () => {
    expect(keywordBucket("I want to die")).toBe("explicit");
    expect(keywordBucket("I'm going to kill myself tonight")).toBe("explicit");
    expect(keywordBucket("there's no reason to live")).toBe("explicit");
  });

  it("returns 'passive' for hopelessness phrases", () => {
    expect(keywordBucket("I feel hopeless")).toBe("passive");
    expect(keywordBucket("there's no point anymore")).toBe("passive");
    expect(keywordBucket("I just want it to stop")).toBe("passive");
  });

  it("explicit beats passive when both present", () => {
    expect(keywordBucket("I want to die, I feel hopeless")).toBe("explicit");
  });

  it("is case-insensitive", () => {
    expect(keywordBucket("I WANT TO DIE")).toBe("explicit");
    expect(keywordBucket("HOPELESS")).toBe("passive");
  });
});
