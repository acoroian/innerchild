---
status: pending
priority: p2
issue_id: 005
tags: [code-review, security, headers]
dependencies: []
---

# Add HSTS + COOP/CORP to baseline security headers

## Problem Statement

`app/entry.server.tsx:20-26` sets X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy. Missing:

- `Strict-Transport-Security` — must ship before first prod deploy; forgetting it leaves a window where a downgraded HTTPS connection accepts a malicious cert
- `Cross-Origin-Opener-Policy: same-origin` — protects against XS-Leaks
- `Cross-Origin-Resource-Policy: same-origin` — protects against XS-Leaks

CSP is intentionally deferred (comment explains why), but HSTS + COOP/CORP are one-liners with zero cost.

## Findings

- File: `app/entry.server.tsx:20-26`
- Severity: P2
- Source: security-sentinel (P2 #4), kieran-typescript-reviewer (P3 #14)

## Proposed Solution

Add to `entry.server.tsx`:
```ts
responseHeaders.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
responseHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
responseHeaders.set("Cross-Origin-Resource-Policy", "same-origin");
```

## Acceptance Criteria

- [ ] All three headers present in response
- [ ] No regressions (CSS / fonts still load)
