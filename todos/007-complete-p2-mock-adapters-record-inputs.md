---
status: pending
priority: p2
issue_id: 007
tags: [code-review, testing, mocks]
dependencies: []
---

# Mock adapters drop input fields; can't assert correct calls in tests

## Problem Statement

`MockAvatarEngine.startRender` (`mock.server.ts:17`) destructures only `idempotencyKey`; the typed `avatarId`, `audioUrl` are dropped. Same in `MockVoiceEngine.synthesize` (line 12 only sees `idempotencyKey`). `MockAvatarEngine.enrollFromPhoto` and `MockVoiceEngine.cloneFromSample` rename the param to `_` so we lose the input shape entirely.

This means future tests can't assert "the mock was called with the right avatar/audio" — defeats the purpose of having mocks.

## Findings

- Files: `app/services/avatar/mock.server.ts`, `app/services/voice/mock.server.ts`
- Severity: P2 — affects test ergonomics for every following phase
- Source: kieran-typescript-reviewer (P2 #6)

## Proposed Solution

Each Mock records the calls it received in a `public calls: …[]` array (mirroring the existing `MockNotifier.sent` pattern):

```ts
export class MockAvatarEngine implements AvatarEngine {
  public enrollCalls: Array<{ photoUrl: string }> = [];
  public renderCalls: Array<{ avatarId: string; audioUrl: string; idempotencyKey: string }> = [];
  // ... store inputs in each method before returning
}
```

## Acceptance Criteria

- [ ] All four mocks (Avatar, Voice, LLM, Notifier) record calls in named arrays
- [ ] Existing test still passes
