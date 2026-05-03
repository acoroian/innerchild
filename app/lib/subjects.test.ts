import { describe, expect, it } from "vitest";

import { buildPhotoStoragePath, isAllowedPhotoMime } from "./subjects";

describe("isAllowedPhotoMime", () => {
  it("accepts the four supported MIME types", () => {
    expect(isAllowedPhotoMime("image/jpeg")).toBe(true);
    expect(isAllowedPhotoMime("image/png")).toBe(true);
    expect(isAllowedPhotoMime("image/heic")).toBe(true);
    expect(isAllowedPhotoMime("image/webp")).toBe(true);
  });

  it("rejects unsupported types", () => {
    expect(isAllowedPhotoMime("image/gif")).toBe(false);
    expect(isAllowedPhotoMime("application/pdf")).toBe(false);
    expect(isAllowedPhotoMime("")).toBe(false);
  });
});

describe("buildPhotoStoragePath", () => {
  const userId = "11111111-1111-1111-1111-111111111111";
  const subjectId = "22222222-2222-2222-2222-222222222222";
  const photoId = "33333333-3333-3333-3333-333333333333";

  it("places user_id at the path root so Storage RLS works", () => {
    const path = buildPhotoStoragePath({
      userId,
      subjectId,
      photoId,
      contentType: "image/jpeg",
    });
    expect(path.startsWith(`${userId}/`)).toBe(true);
  });

  it("nests subject_id then photo_id", () => {
    const path = buildPhotoStoragePath({
      userId,
      subjectId,
      photoId,
      contentType: "image/png",
    });
    expect(path).toBe(`${userId}/${subjectId}/${photoId}.png`);
  });

  it("maps each MIME type to its expected extension", () => {
    expect(
      buildPhotoStoragePath({ userId, subjectId, photoId, contentType: "image/jpeg" }).endsWith(".jpg"),
    ).toBe(true);
    expect(
      buildPhotoStoragePath({ userId, subjectId, photoId, contentType: "image/png" }).endsWith(".png"),
    ).toBe(true);
    expect(
      buildPhotoStoragePath({ userId, subjectId, photoId, contentType: "image/heic" }).endsWith(".heic"),
    ).toBe(true);
    expect(
      buildPhotoStoragePath({ userId, subjectId, photoId, contentType: "image/webp" }).endsWith(".webp"),
    ).toBe(true);
  });
});
