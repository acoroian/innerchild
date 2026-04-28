import type {
  VoiceCloneResult,
  VoiceEngine,
  VoiceSynthResult,
} from "./types.server";

export class MockVoiceEngine implements VoiceEngine {
  async cloneFromSample(): Promise<VoiceCloneResult> {
    return { voiceId: "mock-voice-id" };
  }

  async synthesize(input: { idempotencyKey: string }): Promise<VoiceSynthResult> {
    return {
      audioUrl: `https://mock.invalid/audio/${input.idempotencyKey}.mp3`,
      durationMs: 25_000,
    };
  }

  async deleteVoice(): Promise<{ deleted: true }> {
    return { deleted: true };
  }
}
