// Pure types, constants, and helpers safe to import from client code.
// Server-only Supabase calls live in subjects.server.ts.

export type SubjectKind = "inner_child" | "ancestor" | "other";
export type SubjectTone = "playful" | "wise" | "gentle" | "formal" | "mixed";

// Curated BCP-47 set. Sorted so the dropdown reads naturally. Add by editing
// here — the column itself is unconstrained so nothing breaks if you ship a
// new code without redeploying the schema.
export const SUBJECT_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "ro-RO", label: "Română" },
  { code: "es-ES", label: "Español (España)" },
  { code: "es-MX", label: "Español (México)" },
  { code: "pt-BR", label: "Português (Brasil)" },
  { code: "pt-PT", label: "Português (Portugal)" },
  { code: "fr-FR", label: "Français" },
  { code: "de-DE", label: "Deutsch" },
  { code: "it-IT", label: "Italiano" },
  { code: "nl-NL", label: "Nederlands" },
  { code: "pl-PL", label: "Polski" },
  { code: "uk-UA", label: "Українська" },
  { code: "ru-RU", label: "Русский" },
  { code: "el-GR", label: "Ελληνικά" },
  { code: "hu-HU", label: "Magyar" },
  { code: "cs-CZ", label: "Čeština" },
  { code: "tr-TR", label: "Türkçe" },
  { code: "he-IL", label: "עברית" },
  { code: "ar", label: "العربية" },
  { code: "fa-IR", label: "فارسی" },
  { code: "hi-IN", label: "हिन्दी" },
  { code: "zh-CN", label: "中文 (简体)" },
  { code: "zh-TW", label: "中文 (繁體)" },
  { code: "ja-JP", label: "日本語" },
  { code: "ko-KR", label: "한국어" },
  { code: "vi-VN", label: "Tiếng Việt" },
];

export const SUBJECT_LANGUAGE_CODES = SUBJECT_LANGUAGES.map((l) => l.code);

export function isSupportedSubjectLanguage(code: string): boolean {
  return SUBJECT_LANGUAGE_CODES.includes(code);
}

export function languageLabel(code: string | null | undefined): string {
  if (!code) return "—";
  return SUBJECT_LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

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
  language: string;
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
  language?: string;
}
