import type { NextFunction, Request, Response } from "express";

// Defense-in-depth auth for Cloud Tasks → Cloud Run requests.
// Mirrors the aerohub pattern (worker/src/auth.ts):
//   1. Cloud Run --ingress=internal already gates network access.
//   2. We additionally verify a shared secret header.
//   3. We require X-CloudTasks-QueueName to be present (only Cloud Tasks
//      sets this header).
// Architecture review P0: also verify OIDC signature on top of these in
// production via @google-cloud/cloud-run or jose. Phase-0 stub keeps the
// shared-secret + queue-header gate; OIDC verification lands when we wire
// the worker into Cloud Tasks.

const WORKER_SHARED_SECRET = process.env.WORKER_SHARED_SECRET ?? "";

export function requireCloudTasksAuth(req: Request, res: Response, next: NextFunction) {
  if (process.env.NODE_ENV !== "production" && !WORKER_SHARED_SECRET) {
    // Local dev: no shared secret configured, allow through.
    return next();
  }

  const provided = req.header("X-Worker-Secret");
  if (!provided || provided !== WORKER_SHARED_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }

  if (!req.header("X-CloudTasks-QueueName")) {
    return res.status(401).json({ error: "missing queue header" });
  }

  next();
}
