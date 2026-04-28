// AvatarEngine adapter contract.
//
// Architecture review P0: real talking-head vendors (Tavus, HeyGen, D-ID) are
// async — `render` returns a job id and the video lands minutes later via
// webhook or polling. We model that explicitly so a sync-style implementation
// is the surprise, not the rule.
//
// Phase 0 ships only the type contract + a Mock implementation. Real vendor
// adapters land in Phase 4 once the bake-off picks a winner.

export interface EnrollResult {
  avatarId: string;
}

export interface RenderJob {
  providerJobId: string;
}

export type RenderStatus =
  | { status: "queued" }
  | { status: "processing" }
  | { status: "ready"; videoUrl: string; durationMs: number }
  | { status: "failed"; reason: string };

export interface AvatarEngine {
  /**
   * Eager enrollment. Fired the first time a Subject gets a primary photo so
   * the first-letter render path doesn't pay enrollment latency.
   */
  enrollFromPhoto(input: { photoUrl: string }): Promise<EnrollResult>;

  /**
   * Kicks off a render. Returns immediately with the provider's job id; the
   * video is fetched asynchronously via pollRender or handleWebhook.
   * `idempotencyKey` lets retries dedupe at the vendor (e.g. `reply-video-${letterId}`).
   */
  startRender(input: {
    avatarId: string;
    audioUrl: string;
    idempotencyKey: string;
  }): Promise<RenderJob>;

  pollRender(input: { providerJobId: string }): Promise<RenderStatus>;

  /**
   * Verify and parse a webhook callback. Returns the same shape as pollRender
   * so callers can treat both paths identically.
   */
  handleWebhook(input: {
    payload: unknown;
    signature: string | null;
  }): Promise<{ providerJobId: string } & RenderStatus>;

  /**
   * Hard-delete the vendor-side avatar identity. Some vendors (D-ID) cannot
   * actually erase training data; in that case return `{ deleted: false, reason }`
   * and the caller will record a quarantine entry rather than reporting success.
   * Security review HIGH #7.
   */
  deleteAvatar(input: { avatarId: string }): Promise<
    { deleted: true } | { deleted: false; reason: string }
  >;
}
