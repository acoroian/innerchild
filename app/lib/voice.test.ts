import { describe, expect, it } from "vitest";

import {
  ATTESTATION_TEXT,
  ATTESTATION_TEXT_VERSION,
  buildVoiceSampleStoragePath,
  consentCanonicalJson,
  isAllowedVoiceMime,
} from "./voice";

describe("isAllowedVoiceMime", () => {
  it("accepts the five supported audio types", () => {
    expect(isAllowedVoiceMime("audio/mpeg")).toBe(true);
    expect(isAllowedVoiceMime("audio/mp4")).toBe(true);
    expect(isAllowedVoiceMime("audio/wav")).toBe(true);
    expect(isAllowedVoiceMime("audio/webm")).toBe(true);
    expect(isAllowedVoiceMime("audio/ogg")).toBe(true);
  });

  it("rejects unsupported types", () => {
    expect(isAllowedVoiceMime("audio/aac")).toBe(false);
    expect(isAllowedVoiceMime("video/mp4")).toBe(false);
    expect(isAllowedVoiceMime("")).toBe(false);
  });
});

describe("buildVoiceSampleStoragePath", () => {
  const userId = "u-1";
  const subjectId = "s-1";
  const sampleId = "v-1";

  it("uses user_id as the path prefix for Storage RLS", () => {
    const p = buildVoiceSampleStoragePath({
      userId,
      subjectId,
      sampleId,
      contentType: "audio/wav",
    });
    expect(p).toBe(`${userId}/${subjectId}/${sampleId}.wav`);
  });

  it("maps each MIME to its expected extension", () => {
    expect(
      buildVoiceSampleStoragePath({ userId, subjectId, sampleId, contentType: "audio/mpeg" }),
    ).toMatch(/\.mp3$/);
    expect(
      buildVoiceSampleStoragePath({ userId, subjectId, sampleId, contentType: "audio/mp4" }),
    ).toMatch(/\.m4a$/);
    expect(
      buildVoiceSampleStoragePath({ userId, subjectId, sampleId, contentType: "audio/webm" }),
    ).toMatch(/\.webm$/);
    expect(
      buildVoiceSampleStoragePath({ userId, subjectId, sampleId, contentType: "audio/ogg" }),
    ).toMatch(/\.ogg$/);
  });
});

describe("consentCanonicalJson", () => {
  it("is deterministic regardless of property insertion order", () => {
    const base = {
      user_id: "u",
      subject_id: "s",
      attestation_kind: "self" as const,
      attestation_text_version: ATTESTATION_TEXT_VERSION,
      attestation_text_full: ATTESTATION_TEXT,
      acknowledged_no_distribution: true,
      revoked: false,
      prev_hash: null,
      created_at: "2026-05-02T00:00:00.000Z",
    };
    const a = consentCanonicalJson(base);
    const b = consentCanonicalJson({ ...base });
    expect(a).toBe(b);
  });

  it("changes when any field changes", () => {
    const base = {
      user_id: "u",
      subject_id: "s",
      attestation_kind: "self" as const,
      attestation_text_version: ATTESTATION_TEXT_VERSION,
      attestation_text_full: ATTESTATION_TEXT,
      acknowledged_no_distribution: true,
      revoked: false,
      prev_hash: null,
      created_at: "2026-05-02T00:00:00.000Z",
    };
    expect(consentCanonicalJson(base)).not.toBe(
      consentCanonicalJson({ ...base, revoked: true }),
    );
    expect(consentCanonicalJson(base)).not.toBe(
      consentCanonicalJson({ ...base, prev_hash: "abc" }),
    );
    expect(consentCanonicalJson(base)).not.toBe(
      consentCanonicalJson({ ...base, attestation_kind: "estate_executor" as const }),
    );
  });
});
