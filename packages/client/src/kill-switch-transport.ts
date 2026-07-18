import type { KillSwitchEvent, KillSwitchEventHandler, KillSwitchSource } from "./types.js";
import { HttpClient } from "./http.js";

interface KillSwitchSnapshot {
  active: boolean;
  scope: string;
  reason: string;
  updatedAt: string;
}

/**
 * Default kill-switch transport: polls `/api/v1/kill-switch/:agentDid` and
 * dispatches a handler when the snapshot transitions to active. SSE will
 * replace this in Cut 2 once the server side ships the stream endpoint.
 */
export class PollingKillSwitchSource implements KillSwitchSource {
  private readonly http: HttpClient;
  private readonly agentDid: string;
  private readonly intervalMs: number;
  private readonly setIntervalImpl: typeof setInterval;
  private readonly clearIntervalImpl: typeof clearInterval;

  private timer: ReturnType<typeof setInterval> | undefined;
  private handler?: KillSwitchEventHandler;
  private lastActive = false;

  constructor(
    http: HttpClient,
    agentDid: string,
    options?: {
      intervalMs?: number;
      setIntervalImpl?: typeof setInterval;
      clearIntervalImpl?: typeof clearInterval;
    },
  ) {
    this.http = http;
    this.agentDid = agentDid;
    this.intervalMs = options?.intervalMs ?? 2_000;
    this.setIntervalImpl = options?.setIntervalImpl ?? setInterval;
    this.clearIntervalImpl = options?.clearIntervalImpl ?? clearInterval;
  }

  start(handler: KillSwitchEventHandler): void {
    this.handler = handler;
    if (this.timer !== undefined) return;
    this.timer = this.setIntervalImpl(() => {
      this.tick().catch(() => {
        // swallow — next tick retries
      });
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer !== undefined) {
      this.clearIntervalImpl(this.timer);
      this.timer = undefined;
    }
    this.handler = undefined;
  }

  private async tick(): Promise<void> {
    if (this.handler === undefined) return;
    const snap = await this.http.get<KillSwitchSnapshot>(`/api/v1/kill-switch/${encodeURIComponent(this.agentDid)}`);
    if (snap.active !== this.lastActive) {
      this.lastActive = snap.active;
      const event: KillSwitchEvent = {
        active: snap.active,
        scope: snap.scope,
        reason: snap.reason,
        receivedAt: new Date().toISOString(),
      };
      await this.handler(event);
    }
  }
}

/**
 * Test-friendly in-memory kill-switch source. Tests call `.trigger(event)`
 * to simulate a server event; the client treats it identically to an SSE push.
 */
export class InMemoryKillSwitchSource implements KillSwitchSource {
  private handler?: KillSwitchEventHandler;

  start(handler: KillSwitchEventHandler): void {
    this.handler = handler;
  }

  stop(): void {
    this.handler = undefined;
  }

  async trigger(event: KillSwitchEvent): Promise<void> {
    await this.handler?.(event);
  }
}
