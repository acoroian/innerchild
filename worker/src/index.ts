import express, { type Request, type Response } from "express";

import { cloneVoiceJob } from "../../app/services/jobs/clone-voice.server.js";
import { embedCorpusJob } from "../../app/services/jobs/embed-corpus.server.js";

import { requireCloudTasksAuth } from "./auth.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

// Health check — no auth, called by Cloud Run probes.
app.get("/", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", service: "mosaicrise-worker" });
});

// Architecture review: route per job, not a single switch. One handler per
// kind keeps the dispatcher trivial and lets each job grow its own
// observability + retry semantics.

app.post("/jobs/render-letter-reply", requireCloudTasksAuth, async (req, res) => {
  // TODO(Phase 4): load letter, run crisis classifier in parallel with RAG
  // retrieval, generate reply via LLM adapter, synthesize voice, render
  // avatar (async start/poll/handleWebhook), persist intermediate state for
  // mid-job idempotency, push notify on ready.
  // Stub: accept the job and return 200 so wiring tests pass.
  console.log("[render_letter_reply] received:", req.body);
  res.status(200).json({ status: "stub", todo: "Phase 4" });
});

app.post("/jobs/clone-voice", requireCloudTasksAuth, async (req, res) => {
  const payload = req.body as { voice_sample_id?: string };
  if (!payload?.voice_sample_id) {
    return res.status(400).json({ error: "voice_sample_id required" });
  }
  try {
    const result = await cloneVoiceJob({ voice_sample_id: payload.voice_sample_id });
    if (result.status === "error") {
      // 500 lets Cloud Tasks retry per the queue's retry config.
      return res.status(500).json(result);
    }
    return res.status(200).json(result);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error("[clone_voice] uncaught:", reason);
    return res.status(500).json({ status: "error", reason });
  }
});

app.post("/jobs/enroll-avatar", requireCloudTasksAuth, async (req, res) => {
  // TODO(Phase 1/4): AvatarEngine.enrollFromPhoto for the Subject's primary
  // photo; write avatar_id back. Eager — fired on first photo set so first-
  // letter latency doesn't pay enrollment cost.
  console.log("[enroll_avatar] received:", req.body);
  res.status(200).json({ status: "stub", todo: "Phase 1/4" });
});

app.post("/jobs/embed-subject-corpus", requireCloudTasksAuth, async (req, res) => {
  const payload = req.body as { doc_id?: string };
  if (!payload?.doc_id) {
    return res.status(400).json({ error: "doc_id required" });
  }
  try {
    const result = await embedCorpusJob({ doc_id: payload.doc_id });
    if (result.status === "error") return res.status(500).json(result);
    return res.status(200).json(result);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error("[embed_subject_corpus] uncaught:", reason);
    return res.status(500).json({ status: "error", reason });
  }
});

const port = Number(process.env.PORT ?? 8080);
app.listen(port, () => {
  console.log(`mosaicrise-worker listening on :${port}`);
});
