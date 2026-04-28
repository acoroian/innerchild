// VoiceEngine adapter contract.
//
// V1 default: ElevenLabs Instant Voice Cloning (~10s sample floor, BAA on
// Enterprise tier). Cartesia Sonic-3 is the latency-optimized Phase-2 swap.
//
// `consent` is a structural reference to the caller-provided ConsentRecord
// row — every voice clone call must be tied to a stored attestation.

export interface ConsentRecordRef {
  consentRecordId: string;
  attestationKind: "self" | "estate_executor" | "live_with_consent";
  attestationTextVersion: string;
}

export interface VoiceCloneResult {
  voiceId: string;
}

export interface VoiceSynthResult {
  audioUrl: string;
  durationMs: number;
}

export interface VoiceEngine {
  cloneFromSample(input: {
    audioUrl: string;
    consent: ConsentRecordRef;
  }): Promise<VoiceCloneResult>;

  synthesize(input: {
    voiceId: string;
    text: string;
    idempotencyKey: string;
  }): Promise<VoiceSynthResult>;
}

// Hard-delete shape (Security review HIGH #7) lives in a follow-up — added in
// Phase 5 when the actual cascade flow needs it.
