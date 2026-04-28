---
status: pending
priority: p2
issue_id: 006
tags: [code-review, security, worker, dos]
dependencies: []
---

# Worker body limit 10MB is a DoS amplifier; drop to 1MB

## Problem Statement

`worker/src/index.ts:6`: `express.json({ limit: "10mb" })` is applied globally. The four current handlers receive only Cloud Tasks payloads (kilobytes). A 10MB ceiling lets an attacker who somehow bypasses ingress/auth tie up worker memory.

## Findings

- File: `worker/src/index.ts:6`
- Severity: P2
- Source: security-sentinel (P2 #5)

## Proposed Solution

Drop global limit to `1mb`. If a future route legitimately needs more, opt up per-route.

## Acceptance Criteria

- [ ] `express.json({ limit: "1mb" })` in `worker/src/index.ts`
- [ ] Existing tests still pass
