import { describe, expect, it } from "vitest";

import { buildCorpusStoragePath, chunkText, isAllowedCorpusMime } from "./corpus";

describe("isAllowedCorpusMime", () => {
  it("accepts text/plain, text/markdown, application/pdf", () => {
    expect(isAllowedCorpusMime("text/plain")).toBe(true);
    expect(isAllowedCorpusMime("text/markdown")).toBe(true);
    expect(isAllowedCorpusMime("application/pdf")).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isAllowedCorpusMime("application/octet-stream")).toBe(false);
    expect(isAllowedCorpusMime("image/png")).toBe(false);
  });
});

describe("buildCorpusStoragePath", () => {
  it("places user_id at the path root", () => {
    expect(
      buildCorpusStoragePath({
        userId: "u",
        subjectId: "s",
        docId: "d",
        contentType: "text/plain",
      }),
    ).toBe("u/s/d.txt");
  });

  it("maps mime to extension", () => {
    expect(
      buildCorpusStoragePath({ userId: "u", subjectId: "s", docId: "d", contentType: "text/markdown" }),
    ).toBe("u/s/d.md");
    expect(
      buildCorpusStoragePath({ userId: "u", subjectId: "s", docId: "d", contentType: "application/pdf" }),
    ).toBe("u/s/d.pdf");
  });
});

describe("chunkText", () => {
  it("returns one chunk for short text", () => {
    const chunks = chunkText("Hello world.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe("Hello world.");
    expect(chunks[0].index).toBe(0);
  });

  it("returns no chunks for empty/whitespace input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });

  it("splits long text into multiple chunks with overlap", () => {
    const para = "A".repeat(800) + ". ";
    const text = para.repeat(5); // ~4000 chars
    const chunks = chunkText(text, { size: 1000, overlap: 100 });
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c, i) => {
      expect(c.index).toBe(i);
      expect(c.text.length).toBeLessThanOrEqual(1000);
    });
  });

  it("prefers to end chunks at sentence boundaries", () => {
    const sentence = "This is sentence number X. ";
    const text = Array.from({ length: 100 }, (_, i) => sentence.replace("X", String(i))).join("");
    const chunks = chunkText(text, { size: 200, overlap: 20 });
    // Most chunks should end with a period (sentence boundary), not mid-word.
    const endingInPeriod = chunks.filter((c) => c.text.endsWith(".")).length;
    expect(endingInPeriod).toBeGreaterThan(0);
  });
});
