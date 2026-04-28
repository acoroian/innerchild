import { timingSafeEqual } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

import { config } from "../../app/lib/config.server.js";

// Defense-in-depth auth for Cloud Tasks → Cloud Run requests.
// Mirrors the aerohub pattern (worker/src/auth.ts):
//   1. Cloud Run --ingress=internal already gates network access.
//   2. We additionally verify a shared secret header (timing-safe compare).
//   3. We require X-CloudTasks-QueueName to be present.
//
// Architecture review P0: also verify OIDC signature on top of these in
// production via @google-cloud/cloud-run or jose. OIDC verification lands
// when we wire the worker into Cloud Tasks (Phase 1).
//
// TODO(Phase 4 agent-native): when an agent SDK calls these endpoints, accept
// either the Cloud Tasks header set OR an X-Agent-Caller header validated
// against a config allowlist. Keeps the API surface unified rather than
// growing a parallel /agent/jobs/* tree.

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function requireCloudTasksAuth(req: Request, res: Response, next: NextFunction) {
  // Local-dev bypass requires explicit opt-in. Never auto-enabled by NODE_ENV.
  if (config.WORKER_AUTH_DISABLED) return next();

  const expected = config.WORKER_SHARED_SECRET ?? "";
  if (!expected) {
    return res.status(401).json({ error: "worker not configured" });
  }

  const provided = req.header("X-Worker-Secret") ?? "";
  if (!safeEqual(provided, expected)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  if (!req.header("X-CloudTasks-QueueName")) {
    return res.status(401).json({ error: "missing queue header" });
  }

  next();
}
