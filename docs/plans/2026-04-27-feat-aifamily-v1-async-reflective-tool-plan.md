---
title: "feat: aiFamily V1 — async reflective tool (letter→reply + scheduled affirmations)"
type: feat
status: active
date: 2026-04-27
deepened: 2026-04-27
origin: docs/superpowers/specs/2026-04-27-aifamily-v1-design.md
---

# feat: aiFamily V1 — Async Reflective Tool

## Enhancement Summary

**Deepened on:** 2026-04-27
**Reviewers:** security-sentinel, architecture-strategist, performance-oracle, code-simplicity-reviewer (4 parallel agents)

### Recommended scope reduction (Simplicity review)

The original 10-phase plan is sized for a multi-tenant SaaS at scale. For an unvalidated product this is over-engineered. **Recommended V1 cut:**

- **Defer Phase 5 (Scheduled Affirmations)** to V1.1 — retention bet on users you don't have. Hero feature is letter→reply.
- **Defer Phase 6 (Mobile)** to V1.2 — Web only first. Hero feature works on a laptop.
- **Defer Phase 9 (Stripe)** to V1.3 — invite-only beta caps cost via the invite list.
- **Insert new Phase 0.5: Vendor Bake-off** at week 1. Don't commit 7 phases to `Mock*` adapters before learning what real vendors can/can't do with trauma-adjacent content.
- **Replace Pulumi with a `gcloud` Makefile** for V1; one Supabase project, not staging+prod.
- **Trim test scope:** keep RLS integration tests + crisis-classifier tests at high coverage, smoke everything else for V1.

**Result:** ~3 weeks to invite-only beta vs ~7–8 weeks to full SaaS. Original 10-phase plan retained below as the V1.x roadmap; the slimmed plan is captured under "Slim V1 scope" below.

### Critical findings (must address regardless of scope)

| # | Source | Severity | Finding | Plan location |
|---|---|---|---|---|
| 1 | Security | CRITICAL | Cloud Scheduler endpoint OIDC verification on Vercel must be specified, not handwaved | New `app/lib/oidc.server.ts`; Phase 5 + Phase 0 secrets |
| 2 | Security | CRITICAL | pgvector retrieval needs explicit `subject_id = $1` filter + ownership round-trip; RLS-via-join is not enough under ivfflat | Phase 3 `app/services/retrieval.ts` |
| 3 | Security | CRITICAL | Reply LLM must defend against prompt injection: XML-delimited inputs, output classifier post-pass, denylist on harmful instructions in generated script | Phase 4 `app/services/llm/prompts/reply.ts` + Phase 7 hardening |
| 4 | Security | CRITICAL | Voice clone misuse: watermark all generated audio + video, voice-match challenge for "this is my own voice," public-figure denylist, output framing check (second-person only) | Phase 2, Phase 4, Phase 7 |
| 5 | Architecture | P0 | `AvatarEngine` must be split into `startRender / pollRender / handleWebhook` — real vendors are async, returning a job id then a webhook | Phase 4 + 8 |
| 6 | Architecture | P0 | Cloud Scheduler must hit the **worker**, not Remix — Vercel function timeouts and lack of internal-ingress make `/api/affirmations/tick` the wrong host | Phase 5 (when un-deferred) |
| 7 | Architecture | P0 | Worker mid-job idempotency: persist `reply_audio_path` after synth and check it before re-synthing; deterministic Storage paths `{kind}/{rowId}/v{attempt}.{ext}` | Phase 4 |
| 8 | Architecture | P0 | Service boundary: every adapter file uses `.server.ts` suffix + ESLint `no-restricted-imports` rule blocks adapter use from `app/components/**` and `app/routes/**` | Phase 0 |
| 9 | Performance | HIGH | **Per-user vendor cost is ~$6.25/mo** at midpoint usage — plan's `<$0.50` free-tier and `<$4` paid-tier targets are off by ~12×. Affirmation library + audio reuse is the only realistic fix. Without it, paid tier needs to price at $25+. | Phase 5 + Phase 9 |
| 10 | Performance | HIGH | Pipeline parallelization: `Promise.all(crisisCheck, retrieveChunks)`; stream LLM output → ElevenLabs WebSocket synth on first sentence boundary; saves 20–40s p50 | Phase 4 |
| 11 | Security | HIGH | `consent_records` must be **append-only** with `prev_hash` chain — Postgres trigger blocks UPDATE/DELETE; revocation is a new row | Phase 2 |
| 12 | Security | HIGH | Vendor cost ceiling at the user level (not just per-resource). Daily $ cap + Sentry alert on 5× rolling-average spike. Apply quota to `affirmations/:id/react?reaction=another` (currently ungated) | Phase 7 + 9 |
| 13 | Security | HIGH | GDPR/CCPA deletion: every adapter implements `delete()` returning `{deleted:true} | {deleted:false, reason}`. Vendors that can't hard-delete (D-ID retains) require explicit "quarantined" semantics + user-facing disclosure of what's hard-deleted vs retained | Phase 7 |
| 14 | Security | HIGH | Stripe webhook needs `stripe-signature` verification + `stripe_webhook_events` dedup table | Phase 9 |
| 15 | Security | HIGH | All secrets in **GCP Secret Manager**, not GitHub Actions secrets. GitHub uses **OIDC → GCP Workload Identity Federation** (no long-lived SA keys). Pin third-party Actions to commit SHAs. | Phase 0 |
| 16 | Performance | MED | Anthropic prompt caching pinned across the reply path (system prompt + crisis clause + Subject context block) saves ~60% input cost | Phase 4 |
| 17 | Performance | MED | Cloud Run `--min-instances=1` in prod ($30/mo) eliminates cold-start tax on render path | Phase 0 |
| 18 | Performance | MED | Replace 3s polling with Supabase Realtime on `letters` row UPDATE — drops API QPS 90%, drops perceived ready latency to <500ms | Phase 4 |
| 19 | Architecture | P1 | Crisis classifier circuit breaker: on omni-moderation failure, fall back to keyword pre-filter + force `borderline` flag + hotline-leading prompt | Phase 4 + 7 |
| 20 | Architecture | P1 | State-machine ownership: explicit `(from_state, to_state, allowed_actor, allowed_via)` table; enforce via Postgres CHECK or `_assert_transition()` plpgsql | Phase 4 + 5 |
| 21 | Performance | LOW | SLI/SLO catalog (letter_render p95 < 180s, vendor_error_rate < 2%, queue_depth < 200, etc.) wired to Sentry + GCP alerts | Phase 10 |
| 22 | Security | LOW | Mobile deep-link must be Universal Links (iOS) + App Links (Android), not custom `aifamily://` scheme — custom schemes are hijackable on Android | Phase 6 |

### Slim V1 scope (recommended for first ship)

**~3 weeks total.** Web-only invite-only beta with real vendors end-to-end.

1. **Phase 0 — Repo + infra (~2 days)** — `gcloud` Makefile, single Supabase, GH Actions CI, Cloud Run worker stub. **Drop Pulumi for V1.** Secrets in GCP Secret Manager from day one. ESLint boundary rule + `.server.ts` suffix in place.
2. **Phase 0.5 — Vendor bake-off (~2 days)** — One photo, one voice sample, one letter through Tavus + HeyGen and Sonnet 4.6 + GPT-5. Pick winners. Score on warmth, identity stability, lip-sync, BAA story, content-policy fit on a trauma-adjacent script. Move on with one real vendor per role.
3. **Phase 1 — Auth + Subject + photo (~3 days)** — Supabase magic link, Subject CRUD, photo upload via signed URL. RLS integration tests.
4. **Phase 2 — Voice clone + strengthened consent (~2 days)** — Append-only `consent_records` with hash chain, three-option attestation (own / executor / live-with-consent), voice-match challenge for option 1, public-figure denylist gate.
5. **Phase 3 — RAG corpus (~2 days)** — pgvector with explicit `subject_id` filter + ownership round-trip; partial index on `deleted_at IS NULL`.
6. **Phase 4 — Letter→Reply with real vendors (~4 days)** — async `start/poll/handleWebhook` adapter shape, mid-job idempotency, prompt-injection-hardened reply prompt, output classifier, watermarking, parallel crisis+RAG, prompt caching pinned.
7. **Phase 5-slim — Crisis hardening (~2 days)** — Layered detection with circuit breaker, hotline-leading reply, hard-delete cascade with vendor `delete()` returning explicit `{deleted/quarantined}` status, per-user daily cost ceiling.
8. **Phase 6-slim — Beta launch (~1 day)** — Invite 10 users, basic privacy + terms + voice-consent pages reviewed by counsel, Sentry, status page deferred.

**Deferred to V1.1+:**
- Affirmations (Phase 5 of original plan) — re-add only after letter→reply retention validated.
- Mobile (Phase 6) — re-add when web shows uncanny-vs-magic ratio is right.
- Stripe + paid tier rails (Phase 9) — re-add at 50 weekly-active users.
- Pulumi (replace Makefile with Pulumi when ops surface justifies it).
- Admin safety queue UI — `SELECT` from Postgres with a CLI for V1.

### Cost & latency targets (revised)

- **Per-user vendor cost:** under invite-only beta, vendor spend caps via the 10-user invite list, not via pricing model. Original `<$0.50` free / `<$4` paid targets reframed: per-letter cost target is **$0.20–$0.55** (verified from research), per-affirmation $0.10–$0.21. Paid tier price needs to be **$25–$50/mo**, not $9.99/$19.99, to break even at usage caps. Re-validate at V1.1.
- **Letter latency:** p50 < 60s (was 90s), p95 < 120s (was 180s) — achievable with parallel crisis+RAG, streaming LLM→TTS, eager avatar enrollment, `min-instances=1`.
- **Phase 2 (live conversation) economics:** at $1–3/min Tavus, must price ≥ $50/mo or meter above a 60-min/mo bundle. Original $9.99/$19.99 free/paid would lose ~$13K/mo per 1K Phase 2 users.

### Files / env vars / behaviors named by reviewers

- `app/lib/oidc.server.ts` — Cloud Scheduler OIDC verification
- `app/lib/csrf.server.ts` — CSRF token for mutating actions
- `app/lib/quota.server.ts` — vendor cost + per-user daily ceilings
- `app/config.server.ts` — Zod-validated env vars, single boot-time validation point
- `app/services/llm/prompts/reply.ts` — XML-delimited inputs, output classifier hooks
- `app/services/avatar/{provider}.ts` — `startRender / pollRender / handleWebhook` shape
- `app/services/*/quarantine.ts` — vendor-side "can't hard delete" semantics
- Adapter files use `.server.ts` suffix; ESLint `no-restricted-imports` blocks from `app/components/**` and `app/routes/**`
- Storage paths: `{kind}/{rowId}/v{attempt}.{ext}` (deterministic, attempt-versioned)
- `consent_records`: INSERT-only via Postgres trigger; `prev_hash` chain; mirror to GCS object-lock retention bucket
- `stripe_webhook_events` dedup table; `admin_audit_log`; `data_retention_records`
- All secrets in GCP Secret Manager; GitHub OIDC → Workload Identity Federation; pin third-party Actions to commit SHAs
- New env vars: `SCHEDULER_SHARED_SECRET`, `STRIPE_WEBHOOK_SECRET`

### What was NOT changed

- Original 10-phase plan is preserved below in full as the V1.x reference roadmap.
- Vendor research findings (drop Grok Imagine + Sora 2; bake off Tavus/HeyGen/D-ID; reply LLM not auto-Sonnet) stand.
- Architecture choices (Expo, Remix, Cloud Run + Cloud Tasks, Supabase, pgvector) stand.
- Consent / safety / therapy-upgrade-path posture stands.

---

## Overview

aiFamily is a multi-tenant Web + iOS + Android product for inner-child and ancestor reflective work. A user uploads a photo and (optionally) a voice sample of a meaningful subject — typically a younger version of themselves or a grandparent — writes letters to that subject, and receives back lip-synced talking-head video replies in the subject's cloned voice. A second mode delivers short scheduled affirmation videos at intervals.

V1 ships as a **reflective tool, not therapy**, with the architecture intentionally designed so it can later be flipped into a clinical / therapist-companion product (`user_profiles.mode = 'clinical'`) without re-platforming.

The full design specification is at `docs/superpowers/specs/2026-04-27-aifamily-v1-design.md`. This plan converts that spec into an executable, phased implementation roadmap. Patterns are mirrored from `~/Development/aerohub` wherever applicable; net-new patterns are flagged.

## Problem Statement

People doing inner-child or ancestor reflective work (often inspired by IFS-style "parts work" or family-of-origin healing) commonly write letters to a younger self or a deceased family member, then write a response from that voice. The user's prompt: "shouldn't AI today let me see and hear the response in the subject's actual voice and face?" Yes — the components exist (photo→talking-head, voice cloning, LLM responses), but no productized tool currently combines them in a way that is (a) emotionally appropriate, (b) respectful of consent and likeness law, and (c) priced for everyday use.

Existing analogues — HereAfter, StoryFile, Replika — are either documentary (HereAfter), one-off interactive stories (StoryFile), or general-purpose AI companions (Replika). None target the specific reflective practice of "write a letter, get a video reply" or pair it with daily ambient affirmations.

## Proposed Solution

Async-first SaaS with a swappable vendor adapter architecture. Two user-facing modes:

1. **Letter → Reply.** User writes a letter to a Subject (younger self / grandparent / etc.); backend generates a script, synthesizes the Subject's cloned voice, renders a talking-head video, returns it to the user.
2. **Scheduled Affirmations.** User opts a Subject into a delivery cadence (daily / 3× week / weekly) with theme tags ("encouragement," "before bed," "when I'm anxious"). System pre-renders short videos and delivers via mobile push or email.

Live two-way conversation is **explicitly Phase 2**; the photo + voice profile built for V1 reuses 1:1 for live mode, so V1 work is not throwaway.

## Technical Approach

### Architecture

| Layer | Choice | Notes |
|---|---|---|
| Client | **Expo** (React Native + Expo Web) | One TypeScript codebase, three targets. Expo Router. |
| API | **Remix** on Vercel | Same shape as aerohub. |
| Auth, DB, Storage, Vector | **Supabase** (Postgres + pgvector + Storage) | Pro tier in V1; Team + HIPAA add-on at clinical flip. |
| Background worker | **Cloud Run gen2** (Node, Docker, `--concurrency=1`) | Mirrors aerohub; gen2 mandatory for video-render CPU profile. |
| Job queue | **Cloud Tasks** | OIDC-signed, retries 5×, backoff 30→300s. |
| Cron | **Cloud Scheduler** | New vs aerohub; fires `/api/affirmations/tick`. |
| Infra-as-code | **Pulumi** (TS, GCS state) | Mirrors aerohub; one new resource: `gcp.cloudscheduler.Job`. |
| CI/CD | **GitHub Actions** | Mirrors aerohub `deploy-worker.yml` + `deploy.yml`. |

### Vendor adapters (swappable; final picks deferred to bake-off in Phase 8)

```ts
// app/services/avatar/types.ts
interface AvatarEngine {
  enrollFromPhoto(photoUrl: string): Promise<{ avatarId: string }>;
  render(input: { avatarId: string; audioUrl: string; idempotencyKey: string }):
    Promise<{ videoUrl: string; durationMs: number }>;
}

// app/services/voice/types.ts
interface VoiceEngine {
  cloneFromSample(audioUrl: string, consent: ConsentRecord): Promise<{ voiceId: string }>;
  synthesize(input: { voiceId: string; text: string; idempotencyKey: string }):
    Promise<{ audioUrl: string; durationMs: number }>;
}

// app/services/llm/types.ts
interface LLM {
  generateReply(input: { letter: string; subject: SubjectContext; ragChunks: string[] }):
    Promise<{ script: string; crisisFlag: 'none'|'borderline'|'flagged' }>;
  generateAffirmation(input: { theme: string; subject: SubjectContext; recentContext: string }):
    Promise<{ script: string }>;
  classifyCrisis(text: string): Promise<{ flag: 'none'|'borderline'|'flagged'; rationale?: string }>;
}

// app/services/notifier/types.ts
interface PushNotifier {
  notifyMobile(input: { userId: string; title: string; body: string; deepLink: string }): Promise<void>;
  notifyEmail(input: { userId: string; subject: string; body: string; deepLink: string }): Promise<void>;
}
```

Each role has a `Mock*` impl (deterministic fixtures for tests + local dev) and one production impl picked in the Phase 8 bake-off.

### Vendor candidates (research-verified 2026-04-27)

- **AvatarEngine bake-off:** Tavus (favored — has HIPAA BAA, extends to Phase 2 live) vs HeyGen Avatar IV (best lip-sync from single still) vs D-ID Creative Reality (cheapest baseline). **Drop Grok Imagine and Sora 2** — Grok Imagine doesn't expose user-driven cloned audio lip-sync (its audio is generated alongside, not driven from your file); Sora 2 API has confirmed shutdown 2026-09-24.
- **VoiceEngine:** ElevenLabs Instant Voice Cloning (V1 default — 10s sample floor, BAA on Enterprise); Cartesia Sonic-3 as latency-optimized swap for Phase 2.
- **LLM (replies):** **Bake off** Claude Sonnet 4.6 vs GPT-5.x vs Claude Opus 4.6/4.7 on a 10-letter empathy eval. Anthropic explicitly deprioritized emotional engagement in Sonnet 4.6 — do not assume it wins. Final pick goes to whoever scores best on warmth + groundedness against Subject context.
- **LLM (affirmations + crisis classifier):** Claude Haiku 4.5 with prompt caching (90% savings on repeated Subject context). $1/$5 per MTok.
- **Crisis pre-pass:** OpenAI omni-moderation (free, low-latency, multimodal `self-harm/*` categories).
- **Embeddings:** OpenAI `text-embedding-3-small` (1536 dims, fits pgvector cleanly).
- **Push:** Expo Push (mobile) + email via Resend/Postmark (web).

### Data flow

```
[Expo (iOS/Android/Web)]
        │  HTTPS + Supabase JWT
        ▼
[Remix API on Vercel ── Supabase (Auth, Postgres+pgvector, Storage)]
        │ enqueue (Cloud Tasks SDK; OIDC token attached by queue)
        ▼
[Cloud Tasks queue: aifamily-jobs]
        │ POST + OIDC + X-Worker-Secret + X-CloudTasks-QueueName
        ▼
[Cloud Run worker (Node 20, Docker, concurrency=1)]
        ├─► AvatarEngine adapter
        ├─► VoiceEngine adapter
        ├─► LLM adapter
        └─► PushNotifier

[Cloud Scheduler: cron] ──► /api/affirmations/tick ──► fans out per-user Cloud Tasks
                                                       (named for dedup: render-affirmation-${scheduleId}-${date})
```

### Implementation Phases

Each phase ends in a green CI build, deployable artifact, and demoable user-facing slice. Order is dependency-driven; later phases assume earlier phases shipped.

---

#### Phase 0 — Repo scaffolding + infra foundation (week 1, ~3 days)

**Goal:** Empty `aifamily` repo becomes a deployable Remix app + Cloud Run worker stub, with Supabase + GCP infra provisioned via Pulumi, all behind GH Actions CI.

**Tasks:**
- Initialize monorepo: `package.json`, `tsconfig.json`, `.eslintrc`, `.prettierrc`, `husky` (pre-commit: `npm run lint && npm run typecheck && npm test`; pre-push: `npm run build`).
- Scaffold Remix app per aerohub structure: `app/routes/`, `app/components/`, `app/services/`, `app/lib/`, `app/hooks/`, `app/entry.client.tsx`, `app/entry.server.tsx`, `app/root.tsx`. Tailwind + Headless UI.
- Scaffold worker per aerohub: `worker/Dockerfile` (node:20-alpine, copies `app/services/`, `app/lib/`, `worker/src/`, runs `tsx worker/src/index.ts`), `worker/src/index.ts` (Express, `GET /` health, placeholder `POST /jobs/:kind`).
- `worker/src/auth.ts` middleware mirroring aerohub: validates OIDC (Cloud Run `--ingress internal`), `X-Worker-Secret` header, and `X-CloudTasks-QueueName` header presence (defense-in-depth).
- Supabase: create `aifamily-prod` and `aifamily-staging` projects; commit `supabase/config.toml`. Initial migration creates the `vector` extension.
- GCP: create new project `aifamily-prod` (do **not** reuse aerohub's project — clean blast radius). Stand up Pulumi stack `infra/`:
  - Artifact Registry repo `aifamily` (DOCKER, regional).
  - Service accounts: `aifamily-worker`, `aifamily-tasks-invoker`, `aifamily-scheduler-invoker` (new — fires Cloud Scheduler with OIDC), `aifamily-github-actions`.
  - IAM bindings exactly per aerohub pattern (`storage.objectAdmin`, `iam.serviceAccountTokenCreator`, etc.). `roles/run.invoker` for the worker is granted by the deploy workflow, not Pulumi.
  - Cloud Tasks queue `aifamily-jobs` with same retryConfig as aerohub.
  - Cloud Scheduler job `aifamily-affirmation-tick` (cron `0 * * * *` — top of every hour; fans out are filtered by per-user TZ window inside the worker).
  - Outputs: queue name, registry repo URL, all SA emails, scheduler job name.
- GH Actions:
  - `.github/workflows/pulumi.yml` — runs `pulumi up` on push to main when `infra/**` changes.
  - `.github/workflows/deploy-worker.yml` — copy aerohub verbatim, swap names. Build → push → `gcloud run deploy --concurrency=1 --execution-environment=gen2 --timeout=900 --cpu=2 --memory=2Gi --min-instances=0 --max-instances=10 --ingress=internal`.
  - `.github/workflows/deploy.yml` — runs `supabase db push` on migration changes.
  - `.github/workflows/ci.yml` — `npm run lint && npm run typecheck && npm test` on every PR.
- Vercel project + env vars provisioned (Supabase URL/keys, Cloud Tasks queue name, worker URL, OIDC SA email, worker shared secret, all vendor API keys as placeholders).
- `.env.example` mirrors aerohub conventions: section banners, `VITE_` prefix for client-exposed Supabase vars, dual-write of `SUPABASE_URL`.
- `CLAUDE.md` for aifamily mirroring aerohub structure (Project Overview, Tech Stack, Project Structure, Key Conventions, Important Files, Database Migrations, Common Tasks, Letter→Reply Flow, Affirmation Flow, Code Style). Drop the migration-history and known-issues sections.

**Success criteria:**
- `npm run dev` boots Remix on `localhost:5173` with Supabase auth working (email magic link).
- `docker build && docker run worker` returns `200` on `GET /`.
- Pushing to `main` triggers Pulumi → Cloud Run deploy → Supabase migration; manual `gcloud tasks create-task` to the queue dispatches to the worker, which 200s.
- All four SAs exist; all IAM bindings present.

**Estimated effort:** 2–3 days for someone with the aerohub pattern fresh.

---

#### Phase 1 — Auth + Subject management (week 1–2, ~4 days)

**Goal:** A signed-in user can create a Subject, upload photos, fill in the About form. Voice + corpus uploads land in subsequent phases.

**Tasks:**
- Migration `001_user_profiles.sql`: `user_profiles` (1:1 with `auth.users`, triggered insert on new auth user; `mode 'reflective'|'clinical'` default `reflective`; `locale` default `en-US`; RLS: user can only see/update own row).
- Migration `002_subjects.sql`: `subjects`, `subject_photos`. RLS scoped to `user_id = auth.uid()`. `subject_photos` RLS via parent ownership (`subject_id in (select id from subjects where user_id = auth.uid())`).
- Supabase Storage bucket `subject-photos` with policy: signed-URL upload only, file size cap 10 MB, MIME whitelist (`image/jpeg`, `image/png`, `image/heic`).
- API routes:
  - `POST /api/subjects` — create Subject; returns row.
  - `GET /api/subjects` — list user's Subjects.
  - `GET /api/subjects/:id` — fetch one.
  - `PATCH /api/subjects/:id` — update About / display name.
  - `POST /api/subjects/:id/photos` — issue signed upload URL; client uploads to Supabase Storage; client POSTs back the storage_path; row inserted into `subject_photos`. (Two-step pattern keeps large bodies off the API.)
  - `DELETE /api/subjects/:id` — soft delete (set `deleted_at`).
- Auth pattern per aerohub: `createServerSupabaseClient(request, responseHeaders)` in every loader/action; always pass `responseHeaders` through.
- Client screens (Expo Web for MVP; mobile in Phase 5): Sign-in (Supabase magic-link email), Subject list, Subject create wizard (kind picker → display name + age → primary photo upload → About form), Subject detail view (photos, About, edit).
- About form schema: `relationship: enum`, `key_memories: text[]`, `tone: enum('playful'|'wise'|'gentle'|'formal'|'mixed')`, `things_to_avoid: text` (free-form, fed to LLM as negative constraints).
- Tests: unit tests for the API actions using a Mock Supabase client; integration test against local Supabase verifying RLS (user A cannot see user B's Subjects).

**Success criteria:**
- User signs up via magic link.
- User creates a Subject with kind, name, photo, About.
- RLS confirmed: a second user account cannot see or modify the first user's data.
- Photos viewable via signed URL only (1 hour TTL).

**Estimated effort:** 3–4 days.

---

#### Phase 2 — Voice cloning + consent attestation (week 2, ~3 days)

**Goal:** User can upload a 30-second-or-longer voice sample for a Subject, agree to a strengthened consent attestation, and have the voice cloned via the chosen VoiceEngine.

**Tasks:**
- Migration `003_voice_and_consent.sql`: `subject_voice_samples`, `consent_records`. `consent_records.attestation_text` stores the full versioned text the user agreed to (not just a boolean). RLS scoped per usual.
- Storage bucket `subject-voice-samples` (audio MIME whitelist: `audio/mpeg`, `audio/mp4`, `audio/wav`, `audio/webm`; size cap 50 MB).
- Adapter `app/services/voice/types.ts` and `app/services/voice/elevenlabs.ts` (real impl) + `app/services/voice/mock.ts` (returns deterministic `voiceId`). Selection via `process.env.VOICE_ENGINE = 'elevenlabs' | 'mock'`.
- Worker job `clone_voice` (new file `worker/src/jobs/cloneVoice.ts`): accepts `{ subjectVoiceSampleId }`, fetches sample + consent record, calls `voiceEngine.cloneFromSample(audioUrl, consent)`, writes resulting `voiceId` back to `subjects.voice_id`. Idempotent: short-circuit if `voice_id` already set.
- API routes:
  - `POST /api/subjects/:id/voice/upload` — issue signed upload URL.
  - `POST /api/subjects/:id/voice/confirm` — client confirms upload (storage_path) + posts the consent attestation form payload. Server: validates consent shape, inserts `consent_records`, inserts `subject_voice_samples`, enqueues Cloud Task `clone_voice`. Idempotency key: `clone-voice-${subjectId}` so duplicate confirms don't double-clone.
  - `DELETE /api/subjects/:id/voice` — revoke; deletes voice from VoiceEngine vendor (where supported), nulls `subjects.voice_id`, marks `consent_records.revoked_at`.
- **Consent attestation UI** (full-screen modal, blocks all forward action until acknowledged):
  - Three radio options (mutually exclusive, must pick one):
    1. "This is my own voice."
    2. "I am the legal estate executor or next-of-kin with authority over this person's likeness."
    3. "This person is alive and has given me direct consent. I will produce written consent if requested."
  - Mandatory checkbox: "I understand voice cloning is a regulated capability. I will not share or distribute generated audio. I can revoke this voice at any time."
  - Plain-language summary referencing the ELVIS Act, NO FAKES Act, and California estate-consent rules. Link to a `/legal/voice-consent` page.
  - Stores `attestation_text_version: 'v1.0'` along with the full text rendered, IP, user-agent, timestamp.
- Worker auth + retry handling per aerohub (200/429/500 contract; vendor quota errors → 429).

**Success criteria:**
- User uploads a sample, agrees to attestation, clone completes within ~60s, `subjects.voice_id` populated.
- Revoke flow nulls the voice and marks consent revoked.
- Cannot proceed past the attestation modal without picking one of the three options.

**Estimated effort:** 2–3 days. The consent UI is more product work than the technical clone wiring.

---

#### Phase 3 — RAG corpus ingest (week 3, ~3 days)

**Goal:** User can upload journals / letters / family stories / "About me" docs to a Subject, which are chunked, embedded, and stored in `subject_chunks` for retrieval at letter-reply time.

**Tasks:**
- Migration `004_subject_corpus.sql`: `subject_corpus_docs`, `subject_chunks (embedding vector(1536))`. `subject_chunks` RLS via parent: `subject_id in (select id from subjects where user_id = auth.uid())`. Add ivfflat index on `embedding`. (This is a net-new pattern vs aerohub, which uses Pinecone.)
- `app/services/embedding.ts` mirroring aerohub's pattern (single tracer span, OpenAI `text-embedding-3-small`, 1536 dims, exported constants `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS`).
- `app/services/chunking.ts`: token-based chunking, 512-token windows with 64-token overlap (off-the-shelf; revisit only if retrieval quality is bad).
- Worker job `embed_subject_corpus` (`worker/src/jobs/embedSubjectCorpus.ts`): accepts `{ subjectCorpusDocId }`, downloads file, extracts text (PDF via `pdf-parse`, txt/md as-is, docx via `mammoth`), chunks, embeds, upserts.
- API routes:
  - `POST /api/subjects/:id/corpus/upload` — signed URL.
  - `POST /api/subjects/:id/corpus/confirm` — record + enqueue `embed_subject_corpus`. Idempotency key: `embed-corpus-${docId}`.
  - `DELETE /api/subjects/:id/corpus/:docId` — deletes doc + cascades to chunks.
- Retrieval helper `app/services/retrieval.ts`: `retrieveChunks({ subjectId, query, k })` returns top-K chunks via `<=>` cosine search, RLS-scoped (uses anon-key client to inherit user's RLS; never service-role for this).

**Success criteria:**
- Upload a 10-page journal PDF; within 60s, chunks are queryable.
- Querying with a phrase from the journal returns the matching chunk in top-3.
- Cross-user isolation: user A's query against subject S cannot retrieve user B's chunks even if `subject_id` is guessed.

**Estimated effort:** 2–3 days.

---

#### Phase 4 — Letter → Reply (the hero feature) (week 3–4, ~5 days)

**Goal:** User picks a Subject, writes a letter, gets back a talking-head video reply within ~2 minutes.

**Tasks:**
- Migration `005_letters.sql`: `letters`. `reply_status` machine: `queued → rendering → ready | failed`. RLS scoped per user.
- Storage buckets: `letter-replies-audio`, `letter-replies-video`.
- `app/services/llm/anthropic.ts` (real impl) + `app/services/llm/mock.ts`. `generateReply` system prompt is hand-tuned and lives in `app/services/llm/prompts/reply.ts`. Includes Subject context, RAG chunks, **the crisis-response clause** (lead with `localeHotline(profile.locale)` + care if `crisisFlag !== 'none'`), and tone constraints from About.
- `app/services/avatar/{provider}.ts` — implementation of whichever vendor wins Phase 8 bake-off. Until then, only `mock.ts` exists; Phase 4 ships behind `AVATAR_ENGINE=mock` in CI. Real provider can land in Phase 8.
- Worker job `render_letter_reply` (`worker/src/jobs/renderLetterReply.ts`): the end-to-end pipeline.
  1. Load letter + Subject (photo, voice, About).
  2. Call `LLM.classifyCrisis(letter.body)` (omni-moderation pre-pass, then Haiku second pass on borderline). Result is folded into the reply prompt.
  3. Retrieve top-K (default 6) RAG chunks via `retrieval.retrieveChunks`.
  4. `LLM.generateReply({ letter, subject, ragChunks })` → script. Cap script to ~75 words (≈30s spoken). Hard refuse to exceed 120 words even if model returns more.
  5. `VoiceEngine.synthesize({ voiceId, text: script, idempotencyKey: \`reply-voice-${letter.id}\` })` → audio uploaded to Supabase Storage.
  6. `AvatarEngine.render({ avatarId, audioUrl, idempotencyKey: \`reply-video-${letter.id}\` })` → video uploaded to Supabase Storage.
  7. Update `letters` row with `reply_script`, `reply_audio_path`, `reply_video_path`, `reply_status='ready'`, `ready_at=now()`, `crisis_flag`.
  8. `PushNotifier.notifyMobile()` if registered, else `notifyEmail()`.
- Avatar enrollment is **separate, eager**. When a Subject's first photo is set, fire `enroll_avatar` worker job in the background so first-letter latency isn't dominated by enrollment. Stored in `subjects.avatar_id`.
- API routes:
  - `POST /api/letters` — create letter row, enqueue `render_letter_reply`. Idempotency key: client-supplied `client_request_id` to prevent double-submits.
  - `GET /api/letters/:id` — fetch letter + reply (handles polling).
  - `GET /api/letters` — list user's letters.
- Client screens: New Letter (Subject picker, large textarea, character count, send button → optimistic state), Letter Detail (status badge, polls every 3s while `rendering`, shows video player with transcript when `ready`).

**Success criteria:**
- First letter (with mock adapters) end-to-end < 5 seconds in CI.
- First letter (with real adapters in staging) end-to-end < 2 minutes 90% of the time.
- Crisis-flagged letter receives a reply that leads with hotline + care, then the rest.
- Cloud Tasks retry: kill the worker mid-render → next attempt picks up cleanly without double-charging the vendor (idempotency keys hold).

**Estimated effort:** 4–5 days.

---

#### Phase 5 — Scheduled Affirmations (week 5, ~4 days)

**Goal:** User opts a Subject into affirmations; the system pre-renders and delivers short videos at the cadence the user picked.

**Tasks:**
- Migration `006_affirmations.sql`: `affirmation_schedules`, `affirmations`.
- Cloud Scheduler hits `POST /api/affirmations/tick` hourly with OIDC. Endpoint:
  - Verifies `aifamily-scheduler-invoker` OIDC token.
  - Loads all `active` schedules whose local-time-window includes the current UTC hour (using `time_window_local.tz` via `luxon`).
  - For each schedule, decides whether a delivery is due (consults `cadence` + last delivery timestamp).
  - For each due schedule, enqueues a `render_affirmation` Cloud Task with **deterministic name** `render-affirmation-${scheduleId}-${YYYYMMDDHH}` so duplicate ticks don't double-render. (Net-new pattern vs aerohub.)
- Worker job `render_affirmation` (`worker/src/jobs/renderAffirmation.ts`):
  1. Load schedule + Subject. Pick a theme weighted-random from `themes_json.themes`.
  2. Pull last 3 delivered affirmation scripts from `affirmations` to feed in as "don't repeat these" context.
  3. `LLM.generateAffirmation({ theme, subject, recentContext })` → ~25-word script (~10s spoken). Use Haiku 4.5 with prompt cache.
  4. Voice synth → avatar render (idempotency keys: `affirmation-voice-${affirmationId}`, `affirmation-video-${affirmationId}`).
  5. Insert `affirmations` row with `status='ready'`, `scheduled_for` = next aligned slot in user's TZ window.
- Delivery worker `deliver_affirmation`: separate job, fires from a second Cloud Scheduler entry (every 5 min) that scans for `ready` affirmations whose `scheduled_for <= now()` and pushes/emails. Idempotent on `affirmations.delivered_at`.
- API routes:
  - `POST /api/affirmations/schedule` — create/update a schedule.
  - `GET /api/affirmations/schedule` — list schedules.
  - `DELETE /api/affirmations/schedule/:id` — deactivate.
  - `POST /api/affirmations/:id/react` — record `saved` / `another` reaction. `another` enqueues a fresh `render_affirmation`.
  - `POST /api/affirmations/tick` — Cloud Scheduler endpoint (OIDC-only).
  - `POST /api/affirmations/deliver-tick` — Cloud Scheduler endpoint (OIDC-only).
- Client screens: Schedule editor (cadence, themes multiselect, time window with TZ picker default to device TZ), Affirmation feed (list of delivered + saved).
- Push notification provisioning: Apple Push Notification keys (P8) + FCM service account JSON in env. `expo-notifications` registration on cold start writes to `user_push_tokens` table.

**Success criteria:**
- Scheduling a daily 8am–8pm cadence delivers exactly one affirmation per day in that window.
- "Another" reaction generates a fresh affirmation without breaking schedule cadence.
- Two consecutive scheduler ticks within the same hour do not produce two renders for the same schedule (deterministic task names hold).

**Estimated effort:** 3–4 days.

---

#### Phase 6 — Mobile (Expo iOS + Android) (week 6, ~5 days)

**Goal:** Same product, native mobile app on iOS and Android.

**Tasks:**
- `expo prebuild` for iOS and Android targets.
- Supabase auth on Expo: `expo-secure-store` adapter, `autoRefreshToken: true`, deep-link `aifamily://auth/callback` for magic-link verification.
- Push notifications: `expo-notifications` with APNs P8 + FCM service account configured. Register token on every cold start (tokens rotate). Store in `user_push_tokens (user_id, token, platform, created_at, last_seen_at)`.
- Background download of pre-rendered affirmations (so they play instantly when notification opens).
- Mobile-specific UI: full-screen video player with native controls; haptic on completion; long-press save to camera roll (with watermark + voice-clone disclaimer).
- App Store / Play Store listings: screenshots, privacy disclosures (covered: voice clone, photo usage, push notifications, analytics-none).
- TestFlight + Play Internal Testing distributions.

**Success criteria:**
- iOS + Android builds installable via TestFlight + Play Internal.
- End-to-end letter→reply works on device.
- Affirmations deliver as push and open into native player.
- App Store / Play Store privacy questionnaires complete and accepted.

**Estimated effort:** 5 days. Realistically slips by 2–3 days for first-time APNs/FCM provisioning.

---

#### Phase 7 — Crisis detection hardening + safety review (week 6–7, ~3 days)

**Goal:** Layered crisis-content detection, manual review queue, and pre-launch safety review.

**Tasks:**
- `app/services/llm/crisis.ts`:
  - First pass: OpenAI omni-moderation; flag on any non-zero `self-harm/*` score.
  - Second pass on borderline (moderation < 0.5 but content has hopelessness markers): Haiku 4.5 with a tight classifier prompt for *passive ideation, hopelessness, finality framing, plan/means/timing*.
  - Output: `{ flag: 'none'|'borderline'|'flagged', rationale, classifierVersions }`.
- All `letters` and `affirmations` (input + output) flow through this pipeline. Result stored on `letters.crisis_flag`, `affirmations.crisis_flag`.
- Reply prompt locks: when `crisisFlag !== 'none'`, the reply MUST lead with care + locale-keyed hotline (988 for `en-US`; lookup table `app/services/llm/hotlines.ts` keyed by `user_profiles.locale`).
- Manual review queue: admin-only page `/admin/safety-queue` listing all flagged letters with: original text, generated reply, classifier rationale, user_id (anonymized as initial+suffix). Admin role gated by `auth.users.app_metadata.is_admin`.
- Privacy page at `/legal/privacy`, terms at `/legal/terms`, voice consent explainer at `/legal/voice-consent`. Plain-language; reviewed pre-launch.
- "Not a therapist" disclaimer on sign-up (mandatory acknowledgment, stored as a consent record), and persistent on every reply screen.
- Removal flow: user can delete a Subject, which cascades to revoking the cloned voice from the VoiceEngine vendor (where supported), deleting all photos / voice samples / corpus / letters / replies / affirmations from Supabase Storage. Soft-delete first (24h grace), then hard delete.
- Penetration-test-friendly: rate limit per user (`X letters/hour`, `Y voice clones/day`) via Supabase Edge Functions or middleware to prevent runaway vendor cost from compromised accounts.

**Success criteria:**
- A canned letter with explicit suicidal ideation produces a reply that leads with hotline + care.
- Borderline letter ("I just want it to stop") gets flagged by second-pass classifier.
- Flagged items appear in admin review queue.
- Subject deletion cascades through all storage and vendor records within 24h.
- Rate limits hold under abuse simulation.

**Estimated effort:** 3 days.

---

#### Phase 8 — Vendor bake-off + final picks (week 7, ~4 days)

**Goal:** Select production AvatarEngine and reply LLM via empirical bake-off. Until this phase, V1 has been running on `Mock*` adapters and any single staging vendor.

**Tasks:**
- Reusable harness `scripts/bakeoff/` that, given a list of (Subject context, letter) pairs, invokes each candidate vendor and emits a comparison report.
- **AvatarEngine bake-off.** 5 representative photos × 3 candidate vendors (Tavus, HeyGen, D-ID), 3 fixed scripts each. Score: lip-sync quality (1–5 manual), identity stability across clips (1–5 manual), latency p50/p95 (auto), cost per clip (auto), HIPAA BAA available (binary), content-policy fit on trauma-adjacent script (binary). Tavus's BAA story is a tiebreaker — strongly weighted.
- **Reply LLM bake-off.** 10 letters × 3 candidates (Sonnet 4.6, GPT-5.x, Opus 4.6/4.7). Score by user (warmth 1–5, groundedness in About + RAG 1–5, appropriate hotline behavior on crisis cases, hallucination rate). Sonnet 4.6 is **not** the default — pick whoever scores best on warmth.
- Lock final picks; flip env vars in staging then prod.
- Sign BAAs where appropriate (anticipate clinical-mode flip): Anthropic HIPAA-ready Enterprise (note: pre-Dec-2-2025 BAAs do not extend), ElevenLabs Enterprise BAA, Tavus Enterprise BAA, Supabase Team + HIPAA add-on (defer signing until clinical flip but understand pricing).

**Success criteria:**
- Two bake-off reports written to `docs/bakeoffs/`.
- Production env vars `AVATAR_ENGINE`, `REPLY_LLM` set to winning vendors.
- BAA inventory documented.

**Estimated effort:** 3–4 days (bake-off is mostly waiting on real renders + manual scoring).

---

#### Phase 9 — Stripe + paid tier rails (week 8, ~3 days)

**Goal:** Pricing model in place so V1 doesn't burn vendor budgets on free users.

**Tasks:**
- Pricing model: free tier = 1 Subject, 1 voice clone, 5 letters/month, 7 affirmations/week. Paid tier = unlimited Subjects, 3 voice clones/month, 50 letters/month, daily affirmations.
- Stripe Checkout + Customer Portal. Webhook handler `app/routes/api.stripe-webhook.ts` updating `user_profiles.plan_tier` and `user_profiles.stripe_customer_id`.
- Quota middleware on letter / voice-clone / affirmation endpoints checks `plan_tier` and rate limits accordingly. Returns `402 Payment Required` with clear upgrade CTA on exceed.
- Usage telemetry: `usage_events` table tracking `kind, user_id, vendor_cost_estimate, ts` for cost visibility.
- Admin dashboard: per-user usage + cost-to-date.

**Success criteria:**
- Free tier hits limits cleanly with 402 + upgrade prompt.
- Stripe upgrade lifts limits within 30s of webhook.
- Cancellation downgrades on next billing cycle.
- Per-user vendor spend visible to admin.

**Estimated effort:** 3 days.

---

#### Phase 10 — Launch readiness (week 8, ~2 days)

**Tasks:**
- Pre-launch security review: Supabase RLS coverage audit, IAM least-privilege audit, secrets rotation, dependency vulnerability scan.
- Load test: 100 simultaneous letter submissions; verify queue + worker autoscale.
- Cost projection: per-user per-month at expected utilization for free + paid tiers.
- Status page (StatusPage.io or Better Stack).
- Monitoring: Sentry (front + back + worker), GCP Logs Explorer alerts on worker error rate, Cloud Tasks queue backlog alarm.
- Privacy / terms / consent pages reviewed by counsel.
- Beta invite list (5–10 users doing inner-child or ancestor work) for two-week closed beta.
- Public landing page on `aifamily.app` (or chosen domain).

**Success criteria:**
- Status page green, monitors firing on synthetic alerts.
- Beta invitees signed up and using the product.
- Cost-per-active-user-per-month well under per-tier price.

**Estimated effort:** 2 days plus beta-feedback loop.

---

### Total V1 effort estimate

~7–8 weeks for one experienced full-stack engineer with the aerohub patterns to draw from. Critical path: Phase 0–2 (infra + auth + voice) is the long pole if vendor onboarding hits any speed bumps.

## Alternative Approaches Considered

| Approach | Why rejected |
|---|---|
| **Live-first (Tavus interactive avatar in V1).** | Most magical day one, but ~10–12 weeks, $1–3/min vendor burn, harder retention without daily touchpoints, and the cold-start UX of the first session is rough. Async-first ships value in 6 weeks and the photo+voice profile is reused 1:1 when live lands as Phase 2. |
| **Both modes thin from day one.** | ~12 weeks, high risk that nothing is polished enough to charge for. Async-first lets retention loop (affirmations) emerge before the heavy live tech. |
| **Inngest instead of Cloud Tasks.** | Inngest is ergonomic, but the user already operates the Cloud Run + Cloud Tasks pattern in aerohub. Same Pulumi + GH Actions + observability scaffolding ports over for free; learning Inngest is net-new cost with no compensating benefit. |
| **Native iOS + native Android instead of Expo.** | Three codebases instead of one. Expo's tradeoffs (some native-API limitations, occasional Metro / Hermes friction) are well within tolerance for V1. |
| **Pinecone (matching aerohub) instead of pgvector.** | Aerohub uses Pinecone but the corpora here are tiny (10–100K tokens per user). Single-database simplicity + RLS via parent ownership wins on operational complexity. Pinecone stays as a swap if RAG scale ever demands it. |
| **Grok Imagine and Sora 2 as avatar candidates.** | Grok Imagine doesn't expose user-driven cloned-audio lip-sync — it generates audio alongside, which defeats the entire "grandma's voice" magic. Sora 2 has a confirmed shutdown date (2026-09-24). Both removed from the bake-off. |
| **Skip vendor adapter abstractions; call ElevenLabs / Tavus directly from worker.** | Saves a few hundred lines but locks the codebase to the V1 vendor picks. Adapter seam is small (~150 LOC each) and is what enables Phase 8 bake-off and future vendor swaps without ripping out call sites. |

## System-Wide Impact

### Interaction Graph

A `POST /api/letters` triggers, in order:
1. Remix action → Supabase JWT verification → letter row insert (RLS scoped) → `usage_events` increment → `cloudTasks.enqueue('render_letter_reply', {letterId})` with idempotency key.
2. Cloud Tasks → OIDC POST to Cloud Run worker `/jobs/render-letter-reply` (worker auth: OIDC + shared secret + queue header).
3. Worker handler: load letter + Subject → `LLM.classifyCrisis()` (omni-moderation → maybe Haiku second pass) → `retrieval.retrieveChunks()` (pgvector cosine) → `LLM.generateReply()` (Anthropic API) → `VoiceEngine.synthesize()` (ElevenLabs, idempotency-keyed) → `AvatarEngine.render()` (Tavus/HeyGen/D-ID, idempotency-keyed) → letter row update → `PushNotifier.notifyMobile()` or `.notifyEmail()`.
4. Mobile client receives push, deep-links into letter detail screen, plays video.

Affirmations follow a similar chain but originate from Cloud Scheduler and use deterministic Cloud Tasks names for dedup.

### Error & Failure Propagation

- Vendor API errors (HTTP 5xx, RESOURCE_EXHAUSTED) → worker returns 429 → Cloud Tasks backoff per queue config (30→300s, 5 attempts).
- Vendor API permanent rejection (e.g., AvatarEngine refuses content) → worker returns 200 with `letters.reply_status='failed'` and `letters.failure_reason` populated. Surface to user without silent fallback.
- Idempotency key collisions: vendor returns the previously-generated artifact rather than charging again.
- Push notification failures: try mobile push first, fall back to email; if both fail, log and continue (don't fail the job).
- Supabase write failures mid-job: job restarts cleanly because all writes are idempotent (status transitions are upsert with current-state guards).

### State Lifecycle Risks

- **Avatar enrollment race:** if a user uploads multiple photos quickly, only the first triggers `enroll_avatar`. Subsequent ones do not re-enroll unless the user explicitly sets a new primary. Mitigation: `enroll_avatar` is idempotent on `subjects.avatar_id` being null.
- **Voice clone race:** consent confirmation must succeed before enqueue. Two-phase: insert `consent_records` and `subject_voice_samples` in a transaction; only then enqueue.
- **Affirmation duplicate render:** Cloud Scheduler at-least-once delivery + duplicate Cloud Tasks names prevent fan-out duplication.
- **Subject deletion:** soft delete (24h grace) prevents irrecoverable loss; cascades to vendor revocation only after grace period.
- **User deletion:** GDPR-compliant erasure — full cascade including vendor accounts.

### API Surface Parity

Every action a user can take in the UI has a matching API route documented above. Future agent-native parity (Claude Agent SDK adapter) would consume the same routes — no parallel surface needed.

### Integration Test Scenarios

1. **Cross-user RLS leak attempt.** User A authenticates, queries `subjects` filtered by user B's UID — must return empty.
2. **Cloud Tasks at-least-once duplicate.** Manually post the same task body twice — both worker invocations must end with `letters.reply_status='ready'` and exactly one vendor charge per artifact.
3. **Vendor 429 mid-render.** Mock the AvatarEngine to return 429 on first call, success on second — letter must end `ready` after backoff.
4. **Crisis pre-pass disagreement with second pass.** Borderline letter where omni-moderation scores 0.4 and Haiku flags `borderline` — reply must lead with hotline.
5. **Subject deletion mid-render.** Submit letter, then delete Subject before render completes — render either completes and is then cleaned up, or aborts cleanly without orphan storage rows.

## Acceptance Criteria

### Functional Requirements

- [ ] User can sign up via magic-link email on web, iOS, Android.
- [ ] User can create a Subject (inner_child or ancestor) with name, age, photo, About form.
- [ ] User can upload a voice sample, complete consent attestation, and have voice cloned within 60s.
- [ ] User can upload journal / letter / family-story documents, which are chunked + embedded within 60s for an average-size doc.
- [ ] User can write a letter to a Subject and receive a talking-head video reply within 2 minutes (90% of the time, in staging with real vendors).
- [ ] User can configure an affirmation schedule (daily / 3× week / weekly, themes, local time window).
- [ ] Affirmations deliver on schedule via push (mobile) or email (web), playable in-app.
- [ ] User can delete a Subject; all associated photos, voice samples, corpus, letters, replies, affirmations, and vendor records are removed within 24h.
- [ ] User can revoke a cloned voice independently of deleting the Subject.
- [ ] Crisis-flagged letter content produces a reply that leads with the appropriate locale hotline before engaging.

### Non-Functional Requirements

- [ ] All Supabase tables have user-scoped RLS verified by integration tests.
- [ ] Cloud Run worker deploys via GitHub Actions on every merge to main, zero-downtime.
- [ ] Cloud Tasks queue retries failed jobs with 30→300s backoff, max 5 attempts.
- [ ] First-letter latency p50 < 90s, p95 < 180s in staging with real vendors.
- [ ] Avatar engine + voice engine + LLM are swappable via env var with no code changes outside the adapter directory.
- [ ] Free-tier quota enforcement returns 402 with upgrade CTA.
- [ ] App Store / Play Store privacy questionnaires complete and accepted.

### Quality Gates

- [ ] Unit test coverage > 70% on `app/services/` and `worker/src/jobs/`.
- [ ] Integration test suite green in CI against local Supabase.
- [ ] Playwright E2E happy path green for sign-up → Subject create → letter → reply.
- [ ] Sentry + GCP Logs Explorer alerts wired and verified with synthetic events.
- [ ] CLAUDE.md, README, and `docs/runbooks/` complete.
- [ ] Privacy / terms / voice-consent pages reviewed by counsel.

## Success Metrics

**Activation:** % of sign-ups who complete one Subject + one letter within 7 days. Target: > 40%.
**Retention (W4):** % of activated users who receive ≥ 4 affirmations and engage with at least one in week 4. Target: > 30%.
**Conversion:** % of W4-active free users who upgrade. Target: > 8%.
**Cost per active user:** vendor spend / monthly active user. Target: free tier < $0.50, paid tier < $4 (vs $9.99 / $19.99 hypothetical price points).
**Crisis safety:** 100% of letters with explicit suicidal ideation produce hotline-leading replies in offline eval (pre-launch + ongoing).

## Dependencies & Prerequisites

- GCP project `aifamily-prod` (new, not aerohub's) with billing enabled.
- Supabase organization, Pro tier projects (staging + prod).
- Anthropic API key on a plan supporting prompt caching (BAA upgrade deferred).
- ElevenLabs account on a plan supporting Instant Voice Cloning + API access (Enterprise BAA deferred to clinical-mode flip).
- Tavus / HeyGen / D-ID accounts for Phase 8 bake-off.
- OpenAI account for embeddings + omni-moderation (no BAA needed for moderation; embeddings BAA optional).
- Apple Developer account ($99/yr), Google Play Developer account ($25 one-time).
- Vercel team with custom-domain support.
- Resend or Postmark account for transactional email.
- Sentry project + GCP Cloud Monitoring access.
- Domain registered (e.g., `aifamily.app`).

## Risk Analysis & Mitigation

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| Avatar vendor identity drift across clips makes Subject feel like multiple people | High | Med | Phase 8 bake-off explicitly scores identity stability; pick vendor with stable avatar IDs. Tavus is favored for this reason. |
| Voice clone quality from grandparent's old voicemail is poor | High | High | UX expectation-setting on upload (show quality preview before saving); allow re-upload. Fall back to preset voice if user accepts. |
| Crisis pre-pass false negative (passive ideation missed) | Critical | Med | Layered detection (omni-moderation + Haiku second pass + reply-prompt guardrail). Manual review queue. Reviewed before launch. |
| Vendor cost spike on a single user | Med | Med | Per-user rate limits day one. Stripe quota gating. Per-user spend dashboard. |
| Apple App Store rejects "AI ancestor" framing as insensitive | Med | Med | Frame as "reflective journaling tool" in store listing; lead with inner child use case; voice cloning gated behind consent attestation. |
| Sora-2-style vendor shutdown of chosen avatar engine | Med | Low–Med | Adapter seam means swap is bounded to one file. Phase 8 picks vendor with strongest financial / roadmap signal. |
| Legal action over deceased-relative voice cloning (ELVIS / NO FAKES) | High | Low | Strengthened consent attestation per Phase 2 design. Versioned attestation records. Counsel review pre-launch. Estate-executor checkbox. |
| Supabase RLS bug leaks user data | Critical | Low | Integration test specifically attempts cross-user reads on every table. Pre-launch RLS audit. |
| Cloud Tasks at-least-once duplicate causes double vendor charge | Med | Med | Idempotency keys on every vendor call. Deterministic task names for scheduler fan-out. |
| Beta users find the experience uncanny / distressing | Med | Med | Gated 5–10-person beta with founder-led onboarding interview; rapid iteration. Distress feedback is killable; not all photos / use cases will work. |

## Resource Requirements

- 1 senior full-stack engineer (TS / React / Node / GCP / Supabase) for ~7–8 weeks.
- 1–2 hours / week of legal review (pre-launch consent + privacy review).
- ~$300 / month vendor + infra during V1 buildout, scaling with users.
- Apple + Google developer accounts (~$125 first year).

## Future Considerations

- **Phase 2: Live two-way conversation.** Tavus interactive (favored — reuses the V1 avatar profile). Beyond Presence as alternative. Phase 2 as a premium add-on, not a free-tier feature.
- **Therapist-companion mode.** Flip `user_profiles.mode = 'clinical'`. Sign Anthropic HIPAA-ready Enterprise BAA, ElevenLabs Enterprise BAA, Tavus Enterprise BAA, Supabase Team + HIPAA add-on. Add therapist accounts, transcript export, audit logging, stricter retention.
- **Multi-language replies.** Locale hotlines are already keyed by `user_profiles.locale`; reply LLM prompt and TTS voice would need locale-aware variants.
- **Photo enhancement.** Auto-restore B&W / damaged grandparent photos before avatar enrollment — out of V1; revisit if Phase 8 bake-off shows photo-quality is the dominant retention drag.
- **Letter templates / journaling prompts.** Currently free-form; could surface IFS-style or grief-work-style prompts.
- **Shared family Subjects.** A grandmother used by multiple grandkids. Out of V1 (consent + privacy complexity); revisit post-launch.
- **Agent-native interface (Claude Agent SDK).** Same API surface; no extra work day one.

## Documentation Plan

- `README.md` — top-level project orientation, dev setup, deploy.
- `CLAUDE.md` — mirrored from aerohub structure (see Phase 0).
- `docs/runbooks/incident-response.md` — what to do when vendor goes down, queue backs up, etc.
- `docs/runbooks/crisis-content.md` — manual review queue process; escalation paths.
- `docs/runbooks/deletion.md` — Subject + user deletion procedure including vendor cascades.
- `docs/legal/voice-consent.md` — plain-language consent explainer (referenced from in-app modal).
- `docs/bakeoffs/avatar-2026-04.md`, `docs/bakeoffs/reply-llm-2026-04.md` — Phase 8 outputs.
- `docs/architecture/adapter-seam.md` — how to add a new vendor adapter.
- `docs/architecture/data-model.md` — ERD + RLS policy inventory.
- App Store / Play Store privacy disclosures.

## Sources & References

### Origin

- **Brainstorm / spec:** [docs/superpowers/specs/2026-04-27-aifamily-v1-design.md](../superpowers/specs/2026-04-27-aifamily-v1-design.md)
  Key decisions carried forward:
  1. Async-first build with live conversation as Phase 2 (not V1).
  2. Subjects = inner child + grandparents/ancestors; voice cloning optional with explicit consent.
  3. Worker pattern mirrors aerohub: Cloud Run + Cloud Tasks + Cloud Scheduler.
  4. Vendor adapters are swappable; final picks deferred to Phase 8 bake-off.
  5. Reflective tool now, with a clean upgrade path to clinical / therapist mode.

### Internal references (aerohub patterns to mirror)

- `~/Development/aerohub/infra/index.ts` — Pulumi infra-as-code (SAs, IAM, Cloud Tasks queue, Artifact Registry).
- `~/Development/aerohub/.github/workflows/deploy-worker.yml` — Cloud Run deploy pipeline.
- `~/Development/aerohub/.github/workflows/deploy.yml` — Supabase migration pipeline.
- `~/Development/aerohub/worker/Dockerfile`, `worker/src/index.ts`, `worker/src/auth.ts` — worker scaffolding + defense-in-depth auth.
- `~/Development/aerohub/app/lib/cloud-tasks.server.ts` — Cloud Tasks enqueue pattern.
- `~/Development/aerohub/app/lib/supabase.ts`, `app/lib/supabase.server.ts` — server vs client Supabase clients.
- `~/Development/aerohub/app/services/embedding.ts` — service layer + tracer-span pattern.
- `~/Development/aerohub/supabase/migrations/20240319000000_initial_schema.sql` — RLS policy template.
- `~/Development/aerohub/CLAUDE.md` — sections to mirror.

### External references (verified 2026-04-27)

- [HeyGen Avatar IV API](https://www.heygen.com/blog/announcing-the-avatar-iv-api), [HeyGen — Audio as Voice](https://docs.heygen.com/docs/using-audio-source-as-voice)
- [D-ID API Pricing](https://www.d-id.com/pricing/api/)
- [Tavus pricing](https://www.tavus.io/pricing)
- [Sora discontinuation notice (Sept 24, 2026)](https://help.openai.com/en/articles/20001152-what-to-know-about-the-sora-discontinuation)
- [Grok Imagine API](https://x.ai/news/grok-imagine-api)
- [ElevenLabs Voice Cloning](https://elevenlabs.io/docs/creative-platform/voices/voice-cloning)
- [Cartesia pricing + Sonic-3](https://cartesia.ai/pricing)
- [Anthropic Claude Sonnet 4.6 release notes](https://www.anthropic.com/claude/sonnet)
- [Anthropic Claude Haiku 4.5](https://www.anthropic.com/claude/haiku)
- [Anthropic HIPAA-ready Enterprise plan](https://support.claude.com/en/articles/13296973-hipaa-ready-enterprise-plans)
- [OpenAI omni-moderation](https://platform.openai.com/docs/models/omni-moderation-latest)
- [Supabase pricing + HIPAA add-on](https://supabase.com/pricing)
- [Cloud Run + Cloud Tasks](https://docs.cloud.google.com/run/docs/triggering/using-tasks), [Cloud Run concurrency](https://docs.cloud.google.com/run/docs/about-concurrency)
- [Supabase Auth + Expo](https://docs.expo.dev/guides/using-supabase/), [Expo Push Notifications](https://docs.expo.dev/guides/using-push-notifications-services/)
- [Tennessee ELVIS Act analysis](https://www.wsgr.com/en/insights/the-elvis-act-setting-the-stage-for-policing-unauthorized-use-of-ai-generated-sound-and-likeness.html)
- [Synthetic-media right-of-publicity 2026 risk map](https://holonlaw.com/entertainment-law/synthetic-media-voice-cloning-and-the-new-right-of-publicity-risk-map-for-2026/)
- [LLM crisis-content handling (JMIR 2025)](https://arxiv.org/html/2509.24857v1)
- [2026 HIPAA Security Rule changes](https://www.hipaajournal.com/hipaa-updates-hipaa-changes/)

### AI tooling notes

- Plan written with Claude Opus 4.7 in `/ce:plan` after a `/ce:brainstorm` session and parallel `repo-research-analyst` (aerohub patterns) + `best-practices-researcher` (vendor stack 2026 verification) agents.
- All vendor claims independently verified against current docs as of 2026-04-27. Items marked `[VERIFY-AT-PLAN-PHASE]` in the research report (D-ID HIPAA BAA, Cartesia BAA counter-signing, final empathy LLM bake-off result, "reflective use" legal framing) are explicitly deferred to Phase 8 + counsel review.
