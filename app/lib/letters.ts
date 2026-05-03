// Pure types/constants for letters. Server-only DB operations live in
// letters.server.ts.

export type LetterReplyStatus =
  | "queued"
  | "classifying"
  | "retrieving"
  | "scripting"
  | "synthesizing"
  | "rendering"
  | "ready"
  | "failed";

export type CrisisFlag = "none" | "borderline" | "flagged";

export interface Letter {
  id: string;
  user_id: string;
  subject_id: string;
  body: string;
  reply_status: LetterReplyStatus;
  reply_error: string | null;
  reply_script: string | null;
  reply_audio_path: string | null;
  reply_video_path: string | null;
  reply_video_duration_ms: number | null;
  crisis_flag: CrisisFlag;
  crisis_rationale: string | null;
  avatar_provider_job_id: string | null;
  llm_engine: string | null;
  voice_engine: string | null;
  avatar_engine: string | null;
  created_at: string;
  updated_at: string;
  ready_at: string | null;
}

export const LETTER_BODY_MAX_CHARS = 12_000;
export const LETTER_BODY_MIN_CHARS = 8;

export const LETTER_AUDIO_BUCKET = "letter-replies-audio";
export const LETTER_VIDEO_BUCKET = "letter-replies-video";
