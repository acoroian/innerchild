import type {
  ConsentRecordRef,
  VoiceCloneResult,
  VoiceEngine,
  VoiceSynthResult,
} from "./types.server";

interface CloneInput {
  audioUrl: string;
  consent: ConsentRecordRef;
}

interface SynthInput {
  voiceId: string;
  text: string;
  idempotencyKey: string;
}

export class MockVoiceEngine implements VoiceEngine {
  public cloneCalls: CloneInput[] = [];
  public synthCalls: SynthInput[] = [];

  async cloneFromSample(input: CloneInput): Promise<VoiceCloneResult> {
    this.cloneCalls.push(input);
    return { voiceId: "mock-voice-id" };
  }

  async synthesize(input: SynthInput): Promise<VoiceSynthResult> {
    this.synthCalls.push(input);
    return {
      audioUrl: `https://mock.invalid/audio/${input.idempotencyKey}.mp3`,
      durationMs: 25_000,
    };
  }
}
