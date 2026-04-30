# mosaicrise

> A reflective space where the people who shaped you — your younger self, your grandparents — can write back.

mosaicrise is a multi-tenant web (and later mobile) product for inner-child and ancestor reflective work. Users upload a photo and (optionally) a voice sample of a meaningful subject, write letters to that subject, and receive back lip-synced talking-head video replies in the subject's cloned voice. A second mode delivers short scheduled affirmation videos at intervals.

V1 is positioned as a **reflective tool, not therapy**, with the architecture intentionally designed so it can later be flipped into a clinical / therapist-companion product without re-platforming.

## Status

Phase 0 — repo + infra scaffolding. Not yet a working product.

- **Brainstorm:** [`docs/superpowers/specs/2026-04-27-aifamily-v1-design.md`](docs/superpowers/specs/2026-04-27-aifamily-v1-design.md)
- **Plan:** [`docs/plans/2026-04-27-feat-aifamily-v1-async-reflective-tool-plan.md`](docs/plans/2026-04-27-feat-aifamily-v1-async-reflective-tool-plan.md)
- **Conventions:** [`CLAUDE.md`](CLAUDE.md)

## Stack

| Layer | Choice |
|---|---|
| Client | Expo (web first, mobile in V1.2) |
| API | Remix on Vercel |
| Auth, DB, Storage, Vector | Supabase (Postgres + pgvector) |
| Background worker | Cloud Run gen2 (Node, Docker, concurrency=1) |
| Job queue | Cloud Tasks |
| Cron | Cloud Scheduler |
| Infra-as-code | `gcloud` Makefile (replaces Pulumi for V1) |
| CI/CD | GitHub Actions + OIDC → GCP Workload Identity Federation |

## Quickstart

```bash
# 1. Install
npm install

# 2. Copy env template
cp .env.example .env
# Fill in Supabase + (optional) vendor keys. Defaults run all vendors as mocks.

# 3. Run the web app
npm run dev
# Opens on http://localhost:5173

# 4. (Separately) Run the worker
npm run worker:dev
# Worker listens on :8080. Local dev runs jobs in-process when Cloud Tasks
# env vars are unset, mirroring the aerohub pattern.
```

## Lint, typecheck, test

```bash
npm run lint
npm run typecheck
npm test               # unit, mocks only — never hits paid vendors
npm run test:integration   # gated; runs against local Supabase + (optionally) real vendors
```

## Deploy

Infra is declared by the `Makefile`:

```bash
make help                    # list targets
make gcp-bootstrap           # one-time GCP project setup
make tasks-queue             # create Cloud Tasks queue
make worker-build            # build the worker Docker image
make worker-deploy           # deploy to Cloud Run
```

Web app deploys via Vercel on every push to `main`. The worker deploys via the `Deploy Worker` GitHub Actions workflow when files in `worker/`, `app/services/`, or `app/lib/` change.

## What's missing in this scaffolding PR

This is Phase 0. Things that are NOT here yet (see [the plan](docs/plans/2026-04-27-feat-aifamily-v1-async-reflective-tool-plan.md) for the roadmap):

- Auth + Subject CRUD + photo upload (Phase 1)
- Voice cloning + consent attestation (Phase 2)
- RAG corpus ingest (Phase 3)
- Letter → reply pipeline (Phase 4)
- Crisis hardening (Phase 5-slim)
- Real vendor adapters (the four `mock.server.ts` files are the only impls)
- Supabase migrations beyond the initial extension setup
- Live deploys, GCP project, signed BAAs

## License

Private; not yet open-sourced.
