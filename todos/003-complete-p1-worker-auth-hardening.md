---
status: pending
priority: p1
issue_id: 003
tags: [code-review, security, worker, auth]
dependencies: []
---

# Worker auth: timing-unsafe compare + NODE_ENV-only dev bypass

## Problem Statement

`worker/src/auth.ts` has two defense-in-depth weaknesses:

1. **Timing-unsafe compare** (line 23): `provided !== WORKER_SHARED_SECRET` is short-circuit string equality. With `--ingress=internal` it's still reachable from anything in the VPC; defense-in-depth means actually being defensive.
2. **Dev bypass keys off `NODE_ENV` only** (line 17): a misconfigured staging deploy that forgets to set `NODE_ENV=production`, or sets it to `staging`, gets a fully unauthenticated worker. Cloud Run env vars override Docker `ENV`, and `config.server.ts` only allows `'development' | 'production' | 'test'`.
3. **Module-load secret capture** (line 14): `WORKER_SHARED_SECRET` is read once into a const. Won't pick up rotation. Doesn't go through the validated config loader.

## Findings

- File: `worker/src/auth.ts:14,17,23`
- Severity: P1 — worker auth is the only application-layer gate; weaknesses graduate to live vulnerabilities the moment Phase 1 wires in real traffic
- Source: kieran-typescript-reviewer (P2 #4, #5), security-sentinel (P1 #1)

## Proposed Solution

1. Replace `provided !== WORKER_SHARED_SECRET` with `crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(WORKER_SHARED_SECRET))` plus length-equality guard.
2. Require explicit `WORKER_AUTH_DISABLED=true` env var to enable the dev bypass; never auto-enable from `NODE_ENV !== "production"`.
3. Read the shared secret through `config.server.ts` so the Zod loader fails fast at boot when missing in production.

## Acceptance Criteria

- [ ] Wrong-secret + correct-headers gets 401
- [ ] No-secret + correct-headers gets 401 in production (no `WORKER_AUTH_DISABLED`)
- [ ] `crypto.timingSafeEqual` used; length-mismatch handled safely
- [ ] Worker reads secret via the validated config loader, not raw `process.env`
