# CLAUDE.md — aiFamily Project Documentation

## Project Overview

aiFamily is a multi-tenant web (and later mobile) product for inner-child and ancestor reflective work. A user uploads a photo and (optionally) a voice sample of a meaningful subject — typically a younger version of themselves or a grandparent — writes letters to that subject, and receives back lip-synced talking-head video replies in the subject's cloned voice. A second mode delivers short scheduled affirmation videos at intervals.

**V1 is positioned as a reflective tool, not therapy.** The architecture is intentionally designed to flip later into a clinical / therapist-companion product without re-platforming.

Hero feature: **letter → talking-head video reply.** Retention loop: scheduled affirmation videos (Phase 5).

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Client | Expo (React Native + Web) | Web first; mobile in V1.2. Single TypeScript codebase. |
| API | Remix on Vercel | Same shape as aerohub. |
| Auth, DB, Storage, Vector | Supabase (Postgres + pgvector + Storage) | Pro tier in V1; Team + HIPAA add-on at clinical flip. |
| Background worker | Cloud Run gen2 (Node, Docker, `--concurrency=1`) | Mirrors aerohub. |
| Job queue | Cloud Tasks | OIDC-signed, retries 5×, backoff 30→300s. |
| Cron | Cloud Scheduler | Hits the **worker** directly (not Remix), per architecture review. |
| Infra-as-code | `Makefile` of `gcloud` commands | Pulumi deferred to V1.x. |
| CI/CD | GitHub Actions + OIDC → GCP Workload Identity Federation | No long-lived SA keys in GitHub. |
| Secrets | GCP Secret Manager | Mounted into Cloud Run via `--set-secrets`. |

Key architectural rule: **vendor adapters live behind a `.server.ts` boundary.** ESLint blocks importing them from `app/components/**` and `app/routes/**` (non-`.server.ts` paths). Vendor swaps must touch one file, not the whole codebase.

## Project Structure

```
app/
├── components/         React UI components (no vendor imports)
├── lib/
│   ├── config.server.ts        Zod-validated env loader, single boot-time check
│   ├── supabase.ts             Browser client
│   └── supabase.server.ts      Server-side per-request client + service-role
├── routes/             Remix routes (file-based)
│   ├── _index.tsx              Landing page
│   └── api.*.ts                API resource routes
├── services/                   Isomorphic services (used by both Remix and worker)
│   ├── avatar/                 AvatarEngine adapter
│   ├── voice/                  VoiceEngine adapter
│   └── llm/                    LLM adapter (replies, crisis classifier)
├── tailwind.css
├── root.tsx
├── entry.client.tsx
└── entry.server.tsx

worker/
├── Dockerfile
├── tsconfig.json
└── src/
    ├── index.ts                Express app, route per job
    └── auth.ts                 OIDC + shared secret + queue header

supabase/
└── migrations/                 SQL migrations

docs/
├── brainstorms/
├── plans/
├── superpowers/specs/
└── runbooks/                   (Phase 5+)
```

## Key Conventions

### Import Paths

- `~/` alias points to `app/`. Use `~/services/llm/types.server` not `../../app/services/...`.
- Worker imports app code via relative paths (`../../app/services/...`).

### Server vs Client Boundary

- Files ending in `.server.ts` are **never bundled to the client**. Use this suffix for: vendor adapters, secret-bearing helpers, anything that touches the service-role Supabase client.
- ESLint rule blocks `app/services/{avatar,voice,llm}/**` imports from `app/components/**` and non-API `app/routes/**`. If you need an adapter from a route, put it behind an `api.*.ts` action.

### Vendor Adapters

Every vendor lives behind a typed interface in `app/services/<role>/types.server.ts` plus a `mock.server.ts` for tests and local dev, plus a real implementation. Selection is via `process.env.AVATAR_ENGINE | VOICE_ENGINE | REPLY_LLM` parsed in `app/lib/config.server.ts`.

The avatar adapter is **async-shaped**: `startRender` returns a job id, `pollRender` checks status, `handleWebhook` parses provider callbacks. This is non-negotiable — Tavus, HeyGen, and D-ID are all async.

### Job Dispatch

Worker uses **route per job** (`POST /jobs/render-letter-reply`, `/jobs/clone-voice`, etc.), not a single switch. Easier to add observability per job and to evolve retry semantics independently.

### Idempotency

- Cloud Tasks task `name` is deterministic for scheduler fan-out (`render-affirmation-${scheduleId}-${YYYYMMDDHH}`). Duplicate ticks dedup at the queue.
- Vendor calls take an `idempotencyKey` (`reply-voice-${letterId}`, `reply-video-${letterId}`). Vendors return the prior result instead of double-charging.
- Worker handlers persist intermediate state (`reply_audio_path` after synth) and check it before re-running steps. Mid-job restart is safe.
- Storage paths are versioned: `{kind}/{rowId}/v{attempt}.{ext}`.

### Database

Migrations live in `supabase/migrations/` named `YYYYMMDDHHMMSS_short_description.sql`. Lowercase SQL, `if not exists` everywhere for idempotency.

Every user-data table has Row-Level Security enabled. RLS policies key off `auth.uid()`. Child tables RLS via parent ownership (`subject_id in (select id from subjects where user_id = auth.uid())`).

`pgvector` retrieval **must** include an explicit `subject_id = $1` filter in the query AND a separate ownership round-trip from the calling user. Do not rely on RLS-via-join alone with `ivfflat` — the planner can produce surprising plans.

### `consent_records` is append-only

Voice-cloning consent records are inserted only — never updated, never deleted (Postgres trigger raises). Revocation is a *new row*. Each row has a `prev_hash` chain for tamper-evident audit. Mirrored to a GCS bucket with object retention lock.

### Crisis Detection

Layered: OpenAI omni-moderation pre-pass → Claude Haiku 4.5 second pass on borderline → reply prompt locks "lead with hotline + care" when flag is non-`none`. Locale-keyed hotline lookup (`988` for `en-US`). Manual review queue for flagged items.

The classifier has a circuit breaker: on omni-moderation failure, fall back to a static keyword pre-filter and force `borderline` flag rather than failing open or closed.

### Reply Prompt Defense

User content (letter, About form, RAG chunks) is wrapped in clearly delimited XML tags (`<letter>...</letter>`, `<about>...</about>`, `<corpus>...</corpus>`) with the model instructed to treat tag contents as data, not instructions. Generated scripts are re-classified before persisting (output-side guardrail). Scripts use second-person framing only ("you wrote", "I hear you") — never first-person declarative quotes that could be repurposed as a fake quote of the Subject.

## Important Files

- `app/lib/config.server.ts` — env validation. New env vars MUST be added to the Zod schema.
- `app/lib/supabase.server.ts` — server clients. Always pass `responseHeaders` through loaders/actions.
- `app/services/<role>/types.server.ts` — adapter contracts. Real implementations conform to these.
- `worker/src/index.ts` — job dispatch. Add a new `app.post('/jobs/<kind>', requireCloudTasksAuth, handler)` for each new job type.
- `worker/src/auth.ts` — defense-in-depth auth (OIDC + shared secret + queue header).
- `Makefile` — infra commands. Replaces Pulumi for V1.

## Common Tasks

### Adding a new API endpoint

1. Create `app/routes/api.<endpoint>.ts`.
2. Export `action` (POST/PUT/DELETE) or `loader` (GET).
3. Construct `responseHeaders = new Headers()`, then `createServerSupabaseClient(request, responseHeaders)`.
4. `await supabase.auth.getUser()` → 401 if no user.
5. Apply rate limit + quota middleware (Phase 7+).
6. On mutation, return `json({ ... }, { status: 202, headers: responseHeaders })`.
7. Standard error envelope: `{ error: string }`.

### Adding a new background job

1. Add the job type to `worker/src/index.ts` as `app.post('/jobs/<kind>', requireCloudTasksAuth, handler)`.
2. Implement the handler in `worker/src/jobs/<kind>.ts`. Re-fetch state from the DB rather than trusting payload contents.
3. Persist intermediate state on the row as you go (idempotency).
4. Each vendor call uses a deterministic `idempotencyKey`.
5. Return `200` on success, `429` on vendor-quota errors (Cloud Tasks backs off), `500` on transient errors.
6. The API route that triggers the job uses `app/lib/cloud-tasks.server.ts` (Phase 1) to enqueue.

### Adding a new vendor adapter

1. Implement `app/services/<role>/<vendor>.server.ts` against the typed contract in `types.server.ts`.
2. Add the vendor to the enum in `app/lib/config.server.ts`.
3. Add the vendor's API key as an optional Zod field.
4. Wire selection through a small factory in `app/services/<role>/index.server.ts`.
5. Write a unit test using the contract — mock the network, not the adapter shape.

## Database Migrations

```bash
supabase db push                  # apply pending migrations to linked project
supabase db reset                 # reset local Supabase (destroys data)
supabase migration new <name>     # scaffold a new migration file
```

GitHub Actions also runs `supabase db push` on push to main (Phase 0 stub: see `.github/workflows/deploy.yml` once added).

## Environment Variables

`.env` is git-ignored and contains real local development keys — read it directly when you need actual values. **Never commit `.env`.** `.env.example` lists the full surface without values.

All production secrets live in **GCP Secret Manager** and are mounted into Cloud Run via `--set-secrets=KEY=secret-name:latest`. GitHub Actions does not store long-lived service account keys; it uses OIDC → Workload Identity Federation.

## Testing

- **Unit (`npm test`):** mocks-only. Never hits paid vendors. Runs in CI.
- **Integration (`npm run test:integration`):** real local Supabase + (optionally) real vendors. Gated behind env vars; not in CI by default.
- **E2E:** Playwright happy paths on Expo web (Phase 5+).
- **No mocking the database** in integration tests — use a real local Supabase.

## Compound Engineering hooks

This project uses the `compound-engineering` plugin. Notable artifacts:

- Brainstorms in `docs/superpowers/specs/` (origin docs from `/ce:brainstorm`).
- Plans in `docs/plans/` (output of `/ce:plan`).
- Solutions / learnings in `docs/solutions/` (output of `/ce:compound`, when populated).

When asked to implement a feature, check for an existing plan first.

## Code Style

- TypeScript everywhere. No JavaScript files.
- Functional React components.
- Tailwind for styling. No CSS modules.
- Conventional commits: `feat(scope): …`, `fix(scope): …`, `docs(scope): …`.
- `.server.ts` suffix on all files that import vendor adapters or use server-only secrets.
- Default to no comments. Explain only the *why* when it's non-obvious.

## License

Private. Not yet open-sourced.
