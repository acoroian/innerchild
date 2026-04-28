---
status: pending
priority: p2
issue_id: 004
tags: [code-review, docker, security, supply-chain]
dependencies: []
---

# Missing `.dockerignore` — `.env` and `docs/` shipped to Docker daemon as build context

## Problem Statement

`docker build -f worker/Dockerfile .` sends the entire repo as build context to the daemon. The Dockerfile only `COPY`s `app/services`, `app/lib`, `worker`, and `package*.json`, but a developer running `make worker-build` locally with a populated `.env` ships that file into the daemon's storage. Also bloats build cache invalidation.

## Findings

- Missing file: `.dockerignore`
- Severity: P2 — local-developer footgun, no production exposure today
- Source: security-sentinel (P2 #7)

## Proposed Solution

Create `.dockerignore` covering:
```
.env
.env.*
.git
.github
docs
node_modules
app/components
app/routes
app/entry.client.tsx
app/entry.server.tsx
app/root.tsx
app/tailwind.css
public
build
todos
```

## Acceptance Criteria

- [ ] `.dockerignore` exists at repo root
- [ ] `docker build -f worker/Dockerfile . --progress=plain 2>&1 | grep "transferring context"` shows < 5MB transferred
