---
status: pending
priority: p1
issue_id: 002
tags: [code-review, eslint, architecture, boundary]
dependencies: []
---

# ESLint `no-restricted-imports` rule excludes `.server.ts` globally — defeats its own purpose

## Problem Statement

`.eslintrc.cjs:29` lists `**/*.server.{ts,tsx}` in `excludedFiles`, intending to allow vendor adapter imports from `.server.ts` files. But the override is scoped to `app/components/**/*.{ts,tsx}` and `app/routes/**/*.{ts,tsx}`. With the wildcard exclude, any file in `app/components/foo.server.tsx` can freely import vendors — exactly what the rule says it forbids.

Also, the API-route exclude only covers `.ts` not `.tsx`: a future `app/routes/api.subjects.tsx` would be incorrectly blocked.

## Findings

- File: `.eslintrc.cjs:29`
- Severity: P1 — guardrail sells a guarantee it doesn't deliver
- Source: kieran-typescript-reviewer

## Proposed Solution

1. Drop `**/*.server.{ts,tsx}` from `excludedFiles`. Components should never import vendor adapters regardless of `.server.ts` suffix.
2. Update API-route exclude pattern to `app/routes/api.*.{ts,tsx}` so `.tsx` API routes work.

## Acceptance Criteria

- [ ] Test: a file at `app/components/foo.server.tsx` importing from `~/services/avatar/...` produces an ESLint error
- [ ] Test: `app/routes/api.subjects.ts` importing from `~/services/avatar/...` does NOT produce an ESLint error
- [ ] `npm run lint` still passes on the existing tree
