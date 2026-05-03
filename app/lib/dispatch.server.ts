import { config } from "./config.server";

// Job dispatcher. In production: enqueues a Cloud Task that POSTs to the
// worker's HTTP endpoint. In local dev (CLOUD_TASKS_QUEUE unset): runs the
// job inline in-process. Mirrors the aerohub pattern.

type JobKind =
  | "clone-voice"
  | "render-letter-reply"
  | "enroll-avatar"
  | "embed-subject-corpus";

interface DispatchOptions {
  kind: JobKind;
  payload: Record<string, unknown>;
  // Deterministic name for Cloud Tasks dedup; ignored for in-process.
  taskName?: string;
}

type InProcessHandler = (payload: Record<string, unknown>) => Promise<unknown>;

const inProcessHandlers: Partial<Record<JobKind, InProcessHandler>> = {};

export function registerJobHandler(kind: JobKind, handler: InProcessHandler): void {
  inProcessHandlers[kind] = handler;
}

export async function dispatchJob({ kind, payload, taskName }: DispatchOptions): Promise<void> {
  const useCloudTasks =
    !!config.CLOUD_TASKS_QUEUE && !!config.CLOUD_TASKS_WORKER_URL;

  if (!useCloudTasks) {
    const handler = inProcessHandlers[kind];
    if (!handler) {
      throw new Error(
        `No in-process handler registered for job kind '${kind}'. ` +
          "Register one via registerJobHandler() or configure Cloud Tasks env vars.",
      );
    }
    // Fire-and-forget — mirrors the async-on-the-wire semantics of Cloud Tasks.
    // Errors are logged but not awaited so the API response stays fast.
    void handler(payload).catch((err) => {
      console.error(`[dispatch] job '${kind}' failed:`, err);
    });
    return;
  }

  await enqueueCloudTask({ kind, payload, taskName });
}

async function enqueueCloudTask({
  kind,
  payload,
  taskName,
}: DispatchOptions): Promise<void> {
  // Lazy import so non-GCP environments don't pay the startup cost.
  const { CloudTasksClient } = await import("@google-cloud/tasks");
  const client = new CloudTasksClient();

  const project = config.GCP_PROJECT;
  const location = config.GCP_REGION ?? "us-central1";
  const queue = config.CLOUD_TASKS_QUEUE!;
  const workerUrl = config.CLOUD_TASKS_WORKER_URL!;
  const sa = config.CLOUD_TASKS_SA_EMAIL;
  const sharedSecret = config.WORKER_SHARED_SECRET ?? "";
  if (!project) throw new Error("GCP_PROJECT required when CLOUD_TASKS_QUEUE set");
  if (!sa) throw new Error("CLOUD_TASKS_SA_EMAIL required when CLOUD_TASKS_QUEUE set");

  const parent = client.queuePath(project, location, queue);
  await client.createTask({
    parent,
    task: {
      ...(taskName ? { name: client.taskPath(project, location, queue, taskName) } : {}),
      httpRequest: {
        httpMethod: "POST",
        url: `${workerUrl}/jobs/${kind}`,
        headers: {
          "content-type": "application/json",
          "x-worker-secret": sharedSecret,
        },
        body: Buffer.from(JSON.stringify(payload)).toString("base64"),
        oidcToken: { serviceAccountEmail: sa, audience: workerUrl },
      },
    },
  });
}

// Wire up the in-process handlers. Done lazily at first dispatch so test code
// can inject overrides via registerJobHandler.
let _handlersWired = false;
export async function ensureInProcessHandlersWired(): Promise<void> {
  if (_handlersWired) return;
  _handlersWired = true;
  const [{ cloneVoiceJob }, { embedCorpusJob }, { renderLetterReplyJob }] = await Promise.all([
    import("~/services/jobs/clone-voice.server"),
    import("~/services/jobs/embed-corpus.server"),
    import("~/services/jobs/render-letter-reply.server"),
  ]);
  registerJobHandler("clone-voice", (payload) =>
    cloneVoiceJob(payload as { voice_sample_id: string }),
  );
  registerJobHandler("embed-subject-corpus", (payload) =>
    embedCorpusJob(payload as { doc_id: string }),
  );
  registerJobHandler("render-letter-reply", (payload) =>
    renderLetterReplyJob(payload as { letter_id: string }),
  );
}
