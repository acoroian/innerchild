---
status: pending
priority: p2
issue_id: 008
tags: [code-review, supabase, boundary]
dependencies: []
---

# `supabase.ts` should be `supabase.client.ts`; fail-fast on missing env

## Problem Statement

`app/lib/supabase.ts` returns `createBrowserClient("", "")` when `VITE_SUPABASE_*` env vars are missing — silent broken client that 401s at first call. Also the file name doesn't enforce the client-only boundary; a future contributor could accidentally import `getBrowserSupabaseClient` from a server loader and get a runtime-undefined client.

## Findings

- File: `app/lib/supabase.ts:8-9`
- Severity: P2
- Source: kieran-typescript-reviewer (P2 #3, P2 #8)

## Proposed Solution

1. Rename `app/lib/supabase.ts` → `app/lib/supabase.client.ts` (Remix recognizes `.client.ts` suffix and excludes from server bundles).
2. Validate env at module init; throw a clear error if missing.

## Acceptance Criteria

- [ ] File renamed; no callers yet, so no consumer churn
- [ ] Missing `VITE_SUPABASE_URL` throws at import time with a clear message
- [ ] `npm run typecheck` clean
