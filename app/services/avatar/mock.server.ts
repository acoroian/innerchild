import type {
  AvatarEngine,
  EnrollResult,
  RenderJob,
  RenderStatus,
} from "./types.server";

// Deterministic Mock used in unit tests + local dev.
// Returns canned shapes immediately so tests don't pay vendor latency or cost.
export class MockAvatarEngine implements AvatarEngine {
  private renders = new Map<string, RenderStatus>();

  async enrollFromPhoto(_: { photoUrl: string }): Promise<EnrollResult> {
    return { avatarId: "mock-avatar-id" };
  }

  async startRender(input: { idempotencyKey: string }): Promise<RenderJob> {
    const providerJobId = `mock-job-${input.idempotencyKey}`;
    this.renders.set(providerJobId, {
      status: "ready",
      videoUrl: `https://mock.invalid/video/${providerJobId}.mp4`,
      durationMs: 28_000,
    });
    return { providerJobId };
  }

  async pollRender(input: { providerJobId: string }): Promise<RenderStatus> {
    return this.renders.get(input.providerJobId) ?? { status: "queued" };
  }

  async handleWebhook(): Promise<{ providerJobId: string } & RenderStatus> {
    // Mock vendor never sends webhooks; the test harness drives state via
    // pollRender. Returning a synthetic ready event keeps the contract sane.
    return {
      providerJobId: "mock-webhook",
      status: "ready",
      videoUrl: "https://mock.invalid/video/webhook.mp4",
      durationMs: 28_000,
    };
  }

  async deleteAvatar(): Promise<{ deleted: true }> {
    return { deleted: true };
  }
}
