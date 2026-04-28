---
status: pending
priority: p2
issue_id: 009
tags: [code-review, simplicity, yagni]
dependencies: []
---

# Simplicity cuts: remove premature scaffolding for deferred features

## Problem Statement

Code-simplicity reviewer flagged three pieces of scaffolding that solve hypothetical Phase 4+ problems:

1. **`app/services/notifier/`** — V1 has zero users; defer to Phase 6 along with email vendor pick.
2. **`LLM.generateAffirmation` + `MockLLM` impl + `AffirmationResult` type** — affirmations are deferred to V1.1+, this is dead surface.
3. **`deleteAvatar` / `deleteVoice` on adapter contracts** — no caller exists; deletion semantics will be re-shaped when Phase 5 lands the actual cascade flow.

## Findings

- Files: `app/services/notifier/{types,mock}.server.ts`, `app/services/llm/{types,mock}.server.ts`, `app/services/avatar/types.server.ts`, `app/services/voice/types.server.ts`
- Severity: P2 — over-engineered surface to maintain
- Source: code-simplicity-reviewer

## Proposed Solution

1. Delete `app/services/notifier/` directory entirely (including the import in any future code; nothing imports it yet).
2. Remove `LLM.generateAffirmation`, `MockLLM.generateAffirmation`, `AffirmationResult`, `AffirmationInput` from `app/services/llm/{types,mock}.server.ts`.
3. Remove `deleteAvatar` from `AvatarEngine`, `deleteVoice` from `VoiceEngine`, and the matching mock methods.
4. Update CLAUDE.md to remove the notifier reference.

Keep: `AvatarEngine` async shape (genuine architecture decision), `VoiceEngine` + `ConsentRecordRef` coupling (legal/consent semantics), config schema, ESLint rule.

## Acceptance Criteria

- [ ] `app/services/notifier/` removed
- [ ] `LLM.generateAffirmation` and friends removed
- [ ] `deleteAvatar` / `deleteVoice` removed
- [ ] CLAUDE.md updated
- [ ] `npm run lint && npm run typecheck && npm test` all pass
