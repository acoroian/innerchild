---
status: pending
priority: p3
issue_id: 010
tags: [code-review, follow-ups, deferred]
dependencies: []
---

# Deferred follow-ups (revisit before Phase 1)

## Problem Statement

Bundling smaller findings that don't merit individual todos. Address before Phase 1 starts:

## Findings

- **Worker stub handlers log raw `req.body`** (`worker/src/index.ts:23,30,38,45`): replace with `JSON.stringify({ keys: Object.keys(req.body) })` to avoid PII when Phase 4 wires real letters. (security P2 #6)
- **Zod schema needs min lengths**: `SUPABASE_SERVICE_ROLE_KEY: z.string().min(20)`, `WORKER_SHARED_SECRET: z.string().min(32)`. Add a `.superRefine` so non-mock vendor selection requires the matching API key set. (security P2 #3, kieran P3)
- **Service-role client guard**: throw if `typeof window !== "undefined"` in `getServiceRoleSupabaseClient`. (security P2 #2)
- **SHA-pin GitHub Actions** in `ci.yml` (`actions/checkout@v4`, `actions/setup-node@v4`). (security P2 #8)
- **Supabase trigger hygiene**: `revoke all on function public.handle_new_user() from public;`; add `set search_path = public` to `touch_updated_at`. (security P3 #9)
- **Add `AGENT_API_KEY` / `AGENT_ALLOWLIST` optional fields** to `config.server.ts` so the eventual agent gate stays in the unified env surface. (agent-native #5)
- **Worker auth `X-CloudTasks-QueueName` blocks future agent callers**: add a TODO at `worker/src/auth.ts:27` documenting the planned agent branch. (agent-native #2)
- **Type ergonomics**: extract `RenderEvent = RenderStatus & { providerJobId: string }` once in `avatar/types.server.ts`; mark `CrisisClassification.classifierVersions` and array inputs `readonly`; extract `SubjectTone` enum. (kieran P3 #7, #10, #11)
- **`MockNotifier` discriminated union**: tighten return shape. (kieran P3 #9)
- **`.env.example` layout**: physically separate `VITE_*` block from server-side keys with a `# NEVER prefix this with VITE_` warning. (security P3 #10)
- **`Makefile.db-push`**: echo target project URL before pushing. (security P3 #11)

## Severity

P3 — none block merge. Address opportunistically or roll into Phase 1 cleanup.
