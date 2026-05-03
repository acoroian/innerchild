import type {
  AvatarEngine,
  EnrollResult,
  RenderEvent,
  RenderJob,
  RenderStatus,
} from "./types.server";

// Tavus AvatarEngine. V1 picks Tavus because:
//   - Free tier (25 min/mo, no credit card) is enough for end-to-end testing.
//   - Identity stability across many short clips is best-in-class — important
//     because each Subject (e.g. "Grandma") will produce many short replies.
//   - Same vendor extends to Phase 2 live conversation, so we won't have to
//     re-engineer the avatar layer when live mode lands.
//   - HIPAA BAA available on Enterprise tier, keeping the clinical-mode flip
//     viable.
//
// Free-tier note: building a *personal* Replica from a single photo isn't
// available on free tier (Tavus's Personal Replicas need a 2-min training
// video). We fall back to a preset Stock Replica via TAVUS_PRESET_REPLICA_ID
// — when the account upgrades and we add real photo→replica enrollment,
// leave the preset unset and enrollFromPhoto will run the real flow.
//
// API ref: https://docs.tavus.io/api-reference

const BASE_URL = "https://tavusapi.com/v2";

interface TavusVideoResponse {
  video_id?: string;
  status?: string;
  hosted_url?: string;
  download_url?: string;
  generated_video_url?: string;
  duration?: number;
}

export class TavusAvatarEngine implements AvatarEngine {
  constructor(
    private readonly apiKey: string,
    /**
     * Optional: when set, enrollFromPhoto returns this Tavus Stock Replica id
     * instead of attempting to create a Personal Replica. Required on Free
     * tier (Personal Replicas need a 2-min training video, not a photo).
     */
    private readonly presetReplicaId?: string,
  ) {
    if (!apiKey) {
      throw new Error("TavusAvatarEngine requires TAVUS_API_KEY");
    }
  }

  async enrollFromPhoto(_input: { photoUrl: string }): Promise<EnrollResult> {
    if (this.presetReplicaId) {
      // Free-tier fallback: every Subject points at the same preset replica.
      // Audio is per-Subject (cloned voice), but the *face* is generic until
      // the account upgrades and we wire real Personal Replica creation.
      return { avatarId: this.presetReplicaId };
    }
    throw new Error(
      "Tavus Personal Replica creation from a single photo is not implemented yet. " +
        "Set TAVUS_PRESET_REPLICA_ID to use a Stock Replica, or upgrade and add the " +
        "Personal Replica training-video flow.",
    );
  }

  async startRender(input: {
    avatarId: string;
    audioUrl: string;
    idempotencyKey: string;
  }): Promise<RenderJob> {
    const res = await fetch(`${BASE_URL}/videos`, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        replica_id: input.avatarId,
        audio_url: input.audioUrl,
        video_name: input.idempotencyKey,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Tavus startRender failed (${res.status}): ${text}`);
    }
    const json = (await res.json()) as TavusVideoResponse;
    if (!json.video_id) {
      throw new Error(`Tavus startRender response missing video_id: ${JSON.stringify(json)}`);
    }
    return { providerJobId: json.video_id };
  }

  async pollRender(input: { providerJobId: string }): Promise<RenderStatus> {
    const res = await fetch(
      `${BASE_URL}/videos/${encodeURIComponent(input.providerJobId)}`,
      {
        method: "GET",
        headers: { "x-api-key": this.apiKey },
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Tavus pollRender failed (${res.status}): ${text}`);
    }
    const json = (await res.json()) as TavusVideoResponse;
    return mapStatus(json);
  }

  async handleWebhook(_input: {
    payload: unknown;
    signature: string | null;
  }): Promise<RenderEvent> {
    // Tavus webhook payload shape: { event_type, properties: { video_id, ... } }
    // For now we don't subscribe to webhooks (we poll). If/when we do, parse
    // and verify the HMAC signature here. Throwing keeps this honest.
    throw new Error("Tavus webhook handling not implemented; using polling instead");
  }
}

function mapStatus(json: TavusVideoResponse): RenderStatus {
  const url = json.download_url ?? json.generated_video_url ?? json.hosted_url;
  switch (json.status) {
    case "ready":
    case "completed":
      if (!url) return { status: "processing" };
      return {
        status: "ready",
        videoUrl: url,
        durationMs: Math.round((json.duration ?? 0) * 1000),
      };
    case "error":
    case "failed":
      return { status: "failed", reason: `Tavus reported status=${json.status}` };
    case "queued":
    case "pending":
      return { status: "queued" };
    case "generating":
    case "processing":
    default:
      return { status: "processing" };
  }
}
