---
status: pending
priority: p1
issue_id: 001
tags: [code-review, docker, worker, blocker]
dependencies: []
---

# Worker Dockerfile crashes at runtime — `tsx` and `express` are devDependencies

## Problem Statement

`worker/Dockerfile:11` runs `npm ci --omit=dev`, then line 22 starts the worker via `node --import tsx/esm worker/src/index.ts`. But `package.json:37,50` places `express` AND `tsx` under `devDependencies`. The container will boot, fail to resolve `tsx/esm`, and crash. Even if `tsx` were in `dependencies`, `express` (a runtime require) is still dev-scoped.

## Findings

- File: `worker/Dockerfile:11,22`, `package.json` `devDependencies`
- Severity: P1 — production worker won't run
- Source: kieran-typescript-reviewer

## Proposed Solution

Move `express` and `tsx` to `dependencies`. (Long-term, compile to JS in a build stage and run plain `node worker/dist/index.js` — `tsx/esm` loader hooks are still experimental and the API changed in Node 22. Defer compilation to Phase 1 when the worker has real handlers.)

## Acceptance Criteria

- [ ] `express` is in `dependencies`, not `devDependencies`
- [ ] `tsx` is in `dependencies`, not `devDependencies`
- [ ] `docker build -f worker/Dockerfile .` produces an image that boots and answers `GET /` with 200
