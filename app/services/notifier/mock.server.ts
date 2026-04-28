import type { Notifier, NotifyPayload } from "./types.server";

export class MockNotifier implements Notifier {
  public sent: NotifyPayload[] = [];

  async notify(payload: NotifyPayload) {
    this.sent.push(payload);
    return { delivered: true as const, channel: "email" as const };
  }
}
