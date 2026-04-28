import type {
  AvatarEngine,
  EnrollResult,
  RenderEvent,
  RenderJob,
  RenderStatus,
} from "./types.server";

interface EnrollInput {
  photoUrl: string;
}

interface StartRenderInput {
  avatarId: string;
  audioUrl: string;
  idempotencyKey: string;
}

// Deterministic Mock used in unit tests + local dev.
// Returns canned shapes immediately so tests don't pay vendor latency or cost.
export class MockAvatarEngine implements AvatarEngine {
  public enrollCalls: EnrollInput[] = [];
  public renderCalls: StartRenderInput[] = [];
  private renders = new Map<string, RenderStatus>();

  async enrollFromPhoto(input: EnrollInput): Promise<EnrollResult> {
    this.enrollCalls.push(input);
    return { avatarId: "mock-avatar-id" };
  }

  async startRender(input: StartRenderInput): Promise<RenderJob> {
    this.renderCalls.push(input);
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

  async handleWebhook(): Promise<RenderEvent> {
    // Mock vendor never sends webhooks; the test harness drives state via
    // pollRender. Returning a synthetic ready event keeps the contract sane.
    return {
      providerJobId: "mock-webhook",
      status: "ready",
      videoUrl: "https://mock.invalid/video/webhook.mp4",
      durationMs: 28_000,
    };
  }
}
