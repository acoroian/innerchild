import express, { type Request, type Response } from "express";

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
  // TODO(Phase 2): call VoiceEngine.cloneFromSample with consent record;
  // write voice_id back to subjects table; idempotent on subjects.voice_id.
  console.log("[clone_voice] received:", req.body);
  res.status(200).json({ status: "stub", todo: "Phase 2" });
});

app.post("/jobs/enroll-avatar", requireCloudTasksAuth, async (req, res) => {
  // TODO(Phase 1/4): AvatarEngine.enrollFromPhoto for the Subject's primary
  // photo; write avatar_id back. Eager — fired on first photo set so first-
  // letter latency doesn't pay enrollment cost.
  console.log("[enroll_avatar] received:", req.body);
  res.status(200).json({ status: "stub", todo: "Phase 1/4" });
});

app.post("/jobs/embed-subject-corpus", requireCloudTasksAuth, async (req, res) => {
  // TODO(Phase 3): chunk doc, embed via OpenAI text-embedding-3-small, upsert
  // into subject_chunks (pgvector). RLS via parent ownership.
  console.log("[embed_subject_corpus] received:", req.body);
  res.status(200).json({ status: "stub", todo: "Phase 3" });
});

const port = Number(process.env.PORT ?? 8080);
app.listen(port, () => {
  console.log(`mosaicrise-worker listening on :${port}`);
});
