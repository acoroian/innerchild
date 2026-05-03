// Pure types, constants, and helpers safe to import from client code.
// Server-only Supabase calls live in subjects.server.ts.

export type SubjectKind = "inner_child" | "ancestor" | "other";
export type SubjectTone = "playful" | "wise" | "gentle" | "formal" | "mixed";

export interface Subject {
  id: string;
  user_id: string;
  kind: SubjectKind;
  display_name: string;
  age_at_subject: number | null;
  relationship: string | null;
  tone: SubjectTone | null;
  key_memories: string[];
  things_to_avoid: string | null;
  voice_id: string | null;
  avatar_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubjectPhoto {
  id: string;
  subject_id: string;
  storage_path: string;
  content_type: string;
  is_primary: boolean;
  byte_size: number | null;
  created_at: string;
}

export const SUBJECT_KINDS: SubjectKind[] = ["inner_child", "ancestor", "other"];
export const SUBJECT_TONES: SubjectTone[] = ["playful", "wise", "gentle", "formal", "mixed"];

const ALLOWED_PHOTO_MIME = ["image/jpeg", "image/png", "image/heic", "image/webp"] as const;
export type AllowedPhotoMime = (typeof ALLOWED_PHOTO_MIME)[number];
export function isAllowedPhotoMime(mime: string): mime is AllowedPhotoMime {
  return (ALLOWED_PHOTO_MIME as readonly string[]).includes(mime);
}

export const PHOTO_BUCKET = "subject-photos";
export const SIGNED_URL_TTL_SECONDS = 60 * 60;
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

const MIME_TO_EXT: Record<AllowedPhotoMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/webp": "webp",
};

export function buildPhotoStoragePath(args: {
  userId: string;
  subjectId: string;
  photoId: string;
  contentType: AllowedPhotoMime;
}): string {
  const ext = MIME_TO_EXT[args.contentType];
  return `${args.userId}/${args.subjectId}/${args.photoId}.${ext}`;
}

export interface CreateSubjectInput {
  kind: SubjectKind;
  display_name: string;
  age_at_subject?: number | null;
  relationship?: string | null;
  tone?: SubjectTone | null;
  key_memories?: string[];
  things_to_avoid?: string | null;
}
