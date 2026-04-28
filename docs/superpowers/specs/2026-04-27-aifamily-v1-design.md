# aiFamily V1 — Design Spec

**Date:** 2026-04-27
**Status:** Draft, pending user review
**One-line framing:** *A reflective space where the people who shaped you — your younger self, your grandparents — can write back.*

---

## 1. What We're Building

aiFamily is a multi-tenant web + mobile product for inner-child and ancestor reflective work. A user uploads a photo and (optionally) a voice sample of a meaningful subject — typically a younger version of themselves or a grandparent — writes letters to that subject, and receives back lip-synced talking-head video replies in the subject's cloned voice. A second mode delivers short scheduled affirmation videos at intervals chosen by the user.

V1 is positioned as a **reflective tool, not therapy**, with the architecture intentionally designed so it can later be flipped into a clinical / therapist-companion product without re-platforming.

## 2. V1 Scope (the four user flows)

1. **Onboarding & Subject setup.** Sign up, then create one or more *Subjects*. Each Subject has: kind (`inner_child` | `ancestor`), display name, age in photo, relationship, a short structured "About" form (key memories, tone — playful / wise / etc.), 1+ photos, an optional voice sample for cloning, and an optional corpus of journals / letters / family stories used for RAG grounding.
2. **Letter → Reply.** User picks a Subject and writes a letter. Backend generates a reply script (Claude, grounded on the Subject's About + RAG chunks), synthesizes voice (cloned or preset), renders a talking-head video, persists the artifact, and notifies the user.
3. **Scheduled Affirmations.** User opts a Subject into affirmation delivery: cadence (daily / 3× week / weekly), themes ("encouragement," "before bed," "when I'm anxious"), local time window. The system pre-generates short (5–15s) videos in advance, delivers via Expo push (mobile) or email (web), and accepts a simple reaction (save / generate another).
4. **Journal & Library.** Browse all letters, replies, and saved affirmations. Search and tag.

**Explicitly out of V1** (designed for, not built): live two-way conversation, therapist accounts, transcript export, group / shared subjects, multi-language, photo enhancement.

## 3. Why This Approach (Async-first)

The full vision includes a live two-way avatar conversation, but live is the heaviest tech (≈$1–3/min, harder retention without daily touchpoints, slow first-session UX). Async-first ships real value in ~6 weeks, the daily affirmation loop is the retention engine, and the photo + voice profile built for affirmations is exactly what live conversation needs in Phase 2. Async-first also produces a positive-margin product before live conversation — which has questionable unit economics — gets layered on as a premium tier.

Two alternatives were considered:
- **Live-first (Tavus-style).** Most magical day one, but ~10–12 weeks, expensive minutes, and harder retention.
- **Both thin at once.** Full vision day one, ~12 weeks, high risk that nothing is polished enough to charge for.

Async-first won on time-to-value and unit economics.

## 4. Architecture

### 4.1 Stack

| Layer | Choice | Rationale |
|---|---|---|
| Client (iOS/Android/Web) | **Expo** (React Native + Web) | One TypeScript codebase, three targets. |
| API | **Remix** on Vercel | Same shape as aerohub. |
| Auth, DB, Storage, Vector | **Supabase** (Postgres + pgvector) | One platform; HIPAA BAA available later. |
| Background worker | **Cloud Run** (Node, Docker) | Mirrors aerohub; scales to zero; long timeouts for video render. |
| Job queue | **Cloud Tasks** | Same as aerohub; OIDC-signed, retries, rate limiting. |
| Cron | **Cloud Scheduler** | Hits a tick endpoint that fans out per-user affirmation jobs. |
| Infra-as-code | **Pulumi** | Mirrors aerohub. |
| CI/CD | **GitHub Actions** | Mirrors aerohub `deploy-worker.yml`. |

### 4.2 Vendor Adapters (swappable)

V1 treats avatar, voice, LLM, and push as roles, not brands:

```ts
interface AvatarEngine {
  enrollFromPhoto(photoUrl: string): Promise<{ avatarId: string }>;
  render(input: { avatarId: string; audioUrl: string }): Promise<{ videoUrl: string; durationMs: number }>;
}

interface VoiceEngine {
  cloneFromSample(audioUrl: string, consent: ConsentRecord): Promise<{ voiceId: string }>;
  synthesize(input: { voiceId: string; text: string }): Promise<{ audioUrl: string; durationMs: number }>;
}

interface LLM {
  generateReply(input: { letter: string; subject: SubjectContext; ragChunks: string[] }): Promise<string>;
  generateAffirmation(input: { theme: string; subject: SubjectContext; recentContext: string }): Promise<string>;
}
```

Each role gets one concrete vendor in V1, plus a `Mock` implementation used in tests and local dev so CI never hits a paid API.

**Vendor candidates (final pick deferred to plan-phase bake-off, with current docs verified):**
- AvatarEngine: D-ID, HeyGen, Grok Imagine, Sora image-to-video.
- VoiceEngine: ElevenLabs, Cartesia.
- LLM: Claude Sonnet 4.6 (replies), cheaper Haiku-class for short affirmations.
- Push: Expo Push (mobile), email (web).

Bake-off criteria: cost per clip, lip-sync quality, identity consistency across clips, voice-clone integration, content-policy fit for trauma-adjacent material, HIPAA BAA availability.

### 4.3 Data Flow

```
[Expo client (iOS/Android/Web)]
        │  HTTPS
        ▼
[Remix API on Vercel ── Supabase (Auth, Postgres+pgvector, Storage)]
        │ enqueue
        ▼
[Cloud Tasks queue: aifamily-jobs]
        │ OIDC POST
        ▼
[Cloud Run worker (Node, Docker)]
        ├─► AvatarEngine adapter
        ├─► VoiceEngine adapter
        ├─► LLM adapter
        └─► PushNotifier

[Cloud Scheduler] ──► /api/affirmations/tick ──► fans out per-user Cloud Tasks
```

## 5. Components & Job Flows

Three async job types cover everything in V1.

**`render_letter_reply`** (fired on letter submit)
1. Load Subject (photos, voice, About, RAG corpus).
2. `LLM.generateReply(letter, subject_context, rag_chunks)` → reply script.
3. `VoiceEngine.synthesize(script, voice_id)` → audio.
4. `AvatarEngine.render(avatar_id, audio)` → video.
5. Update `letters.reply_status = 'ready'`, push notify.

**`render_affirmation`** (fired by per-user enqueue from scheduler)
1. Pick a theme + recent journal context.
2. `LLM.generateAffirmation(theme, subject, journal_context)` → script.
3. Voice synth → avatar render (5–15s clip).
4. Insert into `affirmations` with `scheduled_for`, `status='ready'`.
5. At delivery time, push notify and mark `delivered_at`.

**`embed_subject_corpus`** (fired on doc upload)
1. Chunk document.
2. Embed via OpenAI `text-embedding-3-small` (cheaper, good enough at 1536 dims).
3. Upsert into `subject_chunks` (pgvector).

### API surface

- `POST /api/subjects`
- `POST /api/subjects/:id/photos`
- `POST /api/subjects/:id/voice` (kicks off voice clone)
- `POST /api/subjects/:id/corpus` (enqueues `embed_subject_corpus`)
- `POST /api/letters` (enqueues `render_letter_reply`)
- `GET /api/letters/:id` (poll status / fetch reply)
- `POST /api/affirmations/schedule`
- `POST /api/affirmations/tick` (Cloud Scheduler endpoint)
- `GET /api/feed` (combined journal + delivered affirmations)

## 6. Data Model

```
subjects
  id, user_id, kind ('inner_child' | 'ancestor'),
  display_name, age_in_photo, relationship,
  about_json, voice_id (nullable), avatar_id (nullable),
  created_at, updated_at

subject_photos
  id, subject_id, storage_path, is_primary, uploaded_at

subject_voice_samples
  id, subject_id, storage_path, consent_record_id, uploaded_at

consent_records
  id, user_id, subject_id, attestation_text,
  signed_at, ip, user_agent

subject_corpus_docs
  id, subject_id, kind, original_filename,
  storage_path, status ('pending'|'embedded'|'failed'), created_at

subject_chunks
  id, subject_id, doc_id, chunk_index, content,
  embedding vector(1536), token_count

letters
  id, user_id, subject_id, body,
  reply_status ('queued'|'rendering'|'ready'|'failed'),
  reply_script, reply_audio_path, reply_video_path,
  created_at, ready_at

affirmation_schedules
  id, user_id, subject_id,
  cadence ('daily'|'3x_week'|'weekly'),
  themes_json, time_window_local, active, created_at

affirmations
  id, schedule_id, user_id, subject_id,
  script, audio_path, video_path,
  status ('queued'|'rendering'|'ready'|'delivered'|'reacted'),
  scheduled_for, ready_at, delivered_at,
  reaction ('saved'|'another'|null)

job_runs
  id, kind, payload_json,
  status, attempts, last_error, created_at, finished_at
```

Every table is `user_id`-scoped via Supabase Row-Level Security (same pattern as aerohub). pgvector keeps RAG in the same database — no separate vector store in V1.

## 7. Privacy, Safety, and the Therapy Upgrade Path

**V1 reflective-tool baseline:**
- "Not a therapist" disclaimer at sign-up and on every reply screen.
- LLM system prompt includes a crisis-response clause: if the letter contains self-harm, suicidal ideation, or imminent-danger language, the reply leads with care + the 988 hotline (US) and a region-aware fallback line, *then* engages with the rest of the letter.
- No emergency calling, no clinician routing in V1.
- Voice cloning requires an explicit consent attestation per Subject, stored in `consent_records`. Attestation text covers two cases: "I am the owner of this voice" or "I am attesting that I have the right to use this voice for personal reflective purposes."
- All photos, voice samples, and rendered videos are private by default. Sharing is signed-URL only and out of V1.
- Content moderation: AvatarEngine vendors have their own content policies; we surface their rejection reasons clearly to the user and never silently fall back.

**Designed-in for the therapy upgrade (do not build in V1):**
- All vendors picked must have HIPAA BAAs available on a paid tier (Anthropic, ElevenLabs paid, Tavus enterprise, Supabase paid).
- A `tenant.mode` column (`'reflective' | 'clinical'`) on user profile; flipping to `clinical` enables therapist-account roles, transcript export, stricter retention, and audit logging.
- All data already user-scoped via RLS, so multi-tenant therapist orgs slot in without re-platforming.

## 8. Testing

- **Unit.** Each adapter has a `Mock` implementation that returns deterministic fixtures. Unit tests run against mocks; CI never hits a paid API.
- **Integration.** A small `pnpm test:integration` suite hits real vendors with throwaway fixtures (one short photo, one short voice clip, one one-line letter) and verifies the round trip. Gated behind an env var.
- **E2E.** Playwright happy paths on Expo web — sign up, create Subject, write letter, see reply ready, schedule affirmation. Mobile-native E2E deferred to Phase 2; V1 ships with manual smoke tests on iOS and Android.
- **Worker.** Each job type has a unit test that drives the job function with mock adapters and asserts DB transitions.
- **No database mocking.** Integration tests run against a real local Supabase, same as aerohub's pattern.

## 9. Key Decisions (snapshot)

- Build for others from day one (multi-tenant SaaS).
- Two-way conversation is the eventual hero feature; **async-first in V1**.
- Subjects: inner child + grandparents/ancestors.
- Voice: **optional cloning** with explicit per-Subject consent.
- Knowledge: **letter + structured About + uploaded docs (RAG)**.
- Posture: **reflective tool**, with clean upgrade path to clinical/therapist mode.
- Worker pattern: **Cloud Run + Cloud Tasks + Cloud Scheduler**, mirroring aerohub.
- Frontend: **Expo** for iOS / Android / Web.
- Vendor selection: deferred to plan-phase bake-off; design vendor-agnostic.

## 10. Open Questions for Plan Phase

- **Vendor bake-off** results — picks for AvatarEngine, VoiceEngine, LLM-for-affirmations.
- **GCP project layout** — reuse aerohub's project or a new aifamily project? (Default: new project for clean blast radius.)
- **Pricing** — free tier + paid tier shape; per-letter / per-affirmation cost ceilings.
- **Photo handling** — how to handle low-quality / B&W / damaged grandparent photos. (V1 default: surface vendor rejections cleanly; no auto-restoration.)
- **Mobile push provisioning** — Apple Push and FCM credentials; Expo Push token lifecycle.
- **Affirmation freshness window** — how far in advance to pre-render (default: 24h ahead, with a refresh job).
