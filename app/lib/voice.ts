// Pure types/constants for voice samples and consent. Safe to import from
// client code. Server-only operations live in voice.server.ts.

export type AttestationKind = "self" | "estate_executor" | "live_with_consent";

export const ATTESTATION_KINDS: AttestationKind[] = [
  "self",
  "estate_executor",
  "live_with_consent",
];

export const ATTESTATION_LABELS: Record<AttestationKind, string> = {
  self: "This is my own voice.",
  estate_executor:
    "I am the legal estate executor or next-of-kin with authority over this person's likeness.",
  live_with_consent:
    "This person is alive and has given me direct consent. I can produce written consent if asked.",
};

// Versioned attestation text. When this text materially changes, bump the
// version — the database stores both the version and the rendered full text.
export const ATTESTATION_TEXT_VERSION = "v1.0";

export const ATTESTATION_TEXT = `I confirm one of:
1) This is my own voice.
2) I am the legal estate executor or next-of-kin and have authority over this person's likeness.
3) This person is alive and has given me direct, informed consent. I can produce written consent if asked.

I understand voice cloning is a regulated capability under the ELVIS Act, the proposed NO FAKES Act, and California estate-consent rules. I will not share or distribute the generated audio. I can revoke this voice at any time, after which mosaicrise will stop generating new audio for this subject and request hard-deletion from the upstream voice provider.`;

const ALLOWED_VOICE_MIME = [
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
] as const;

export type AllowedVoiceMime = (typeof ALLOWED_VOICE_MIME)[number];

export function isAllowedVoiceMime(mime: string): mime is AllowedVoiceMime {
  return (ALLOWED_VOICE_MIME as readonly string[]).includes(mime);
}

const VOICE_MIME_TO_EXT: Record<AllowedVoiceMime, string> = {
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
};

export const VOICE_BUCKET = "subject-voice-samples";
export const VOICE_SAMPLE_MAX_BYTES = 50 * 1024 * 1024;
export const VOICE_SAMPLE_MIN_DURATION_MS = 10_000;

export function buildVoiceSampleStoragePath(args: {
  userId: string;
  subjectId: string;
  sampleId: string;
  contentType: AllowedVoiceMime;
}): string {
  const ext = VOICE_MIME_TO_EXT[args.contentType];
  return `${args.userId}/${args.subjectId}/${args.sampleId}.${ext}`;
}

export type VoiceCloneStatus = "pending" | "cloning" | "ready" | "failed";

export interface SubjectVoiceSample {
  id: string;
  subject_id: string;
  consent_record_id: string;
  storage_path: string;
  content_type: string;
  byte_size: number | null;
  duration_ms: number | null;
  clone_status: VoiceCloneStatus;
  clone_error: string | null;
  voice_id: string | null;
  engine: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConsentRecord {
  id: string;
  user_id: string;
  subject_id: string;
  attestation_kind: AttestationKind;
  attestation_text_version: string;
  attestation_text_full: string;
  acknowledged_no_distribution: boolean;
  ip: string | null;
  user_agent: string | null;
  content_hash: string;
  prev_hash: string | null;
  revoked: boolean;
  created_at: string;
}

// Canonical, deterministic JSON for hashing. Order matters.
export function consentCanonicalJson(input: {
  user_id: string;
  subject_id: string;
  attestation_kind: AttestationKind;
  attestation_text_version: string;
  attestation_text_full: string;
  acknowledged_no_distribution: boolean;
  revoked: boolean;
  prev_hash: string | null;
  created_at: string;
}): string {
  return JSON.stringify({
    user_id: input.user_id,
    subject_id: input.subject_id,
    attestation_kind: input.attestation_kind,
    attestation_text_version: input.attestation_text_version,
    attestation_text_full: input.attestation_text_full,
    acknowledged_no_distribution: input.acknowledged_no_distribution,
    revoked: input.revoked,
    prev_hash: input.prev_hash,
    created_at: input.created_at,
  });
}
