// Notifier contract — delivers a "your reply is ready" or "your affirmation
// arrived" notification to the user. V1 ships email-only (Phase 6 mobile push
// adds the mobile path). Architecture review YAGNI flag: a single
// `notify(userId, payload)` signature beats split per-channel methods.

export interface NotifyPayload {
  userId: string;
  title: string;
  body: string;
  deepLink: string;
  /** "letter_ready" | "affirmation_ready" | "voice_clone_done" | … */
  kind: string;
}

export interface Notifier {
  notify(payload: NotifyPayload): Promise<{ delivered: boolean; channel: "email" | "push" | "none" }>;
}
