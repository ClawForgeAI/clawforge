/**
 * SSE client for real-time event streaming from the ClawForge control plane.
 *
 * Connects to the server's SSE endpoint and dispatches kill_switch and
 * policy_updated events to the appropriate handlers. Falls back to
 * heartbeat-only mode if the connection cannot be established.
 *
 * Reconnects with exponential backoff: 1s, 2s, 4s, 8s, ..., max 30s.
 */

import type { ClawForgePluginConfig, SessionTokens } from "../types.js";
import type { ToolEnforcerState } from "../policy/tool-enforcer.js";

const INITIAL_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 30_000;

export type SSEClientLogger = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
};

export class SSEClient {
  private abortController: AbortController | null = null;
  private reconnectMs = INITIAL_RECONNECT_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  private readonly controlPlaneUrl: string;
  private readonly orgId: string;
  private readonly accessToken: string;
  private readonly enforcerState: ToolEnforcerState;
  private readonly onPolicyRefreshNeeded?: () => void;
  private readonly logger?: SSEClientLogger;

  constructor(params: {
    config: ClawForgePluginConfig;
    session: SessionTokens;
    enforcerState: ToolEnforcerState;
    onPolicyRefreshNeeded?: () => void;
    logger?: SSEClientLogger;
  }) {
    this.controlPlaneUrl = params.config.controlPlaneUrl ?? "";
    this.orgId = params.session.orgId;
    this.accessToken = params.session.accessToken;
    this.enforcerState = params.enforcerState;
    this.onPolicyRefreshNeeded = params.onPolicyRefreshNeeded;
    this.logger = params.logger;
  }

  /**
   * Start the SSE connection. Non-blocking; runs in the background.
   */
  start(): void {
    if (!this.controlPlaneUrl) {
      this.logger?.warn("SSE client: no controlPlaneUrl configured, skipping");
      return;
    }
    this.stopped = false;
    this.connect();
  }

  /**
   * Stop the SSE connection and cancel any pending reconnection.
   */
  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private connect(): void {
    if (this.stopped) return;

    const url = `${this.controlPlaneUrl}/api/v1/events/${encodeURIComponent(this.orgId)}/stream`;
    this.abortController = new AbortController();

    this.logger?.info("SSE client: connecting...");

    fetch(url, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "text/event-stream",
      },
      signal: this.abortController.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        if (!response.body) {
          throw new Error("No response body");
        }

        // Connection succeeded; reset backoff.
        this.reconnectMs = INITIAL_RECONNECT_MS;
        this.logger?.info("SSE client: connected");

        return this.readStream(response.body);
      })
      .then(() => {
        // Stream ended normally (server closed).
        this.scheduleReconnect();
      })
      .catch((err: unknown) => {
        if (this.stopped) return;
        const message = err instanceof Error ? err.message : String(err);
        // Abort errors are expected when stop() is called.
        if (message === "This operation was aborted" || message.includes("abort")) {
          return;
        }
        this.logger?.warn(`SSE client: connection error: ${message}`);
        this.scheduleReconnect();
      });
  }

  private async readStream(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (!this.stopped) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by double newlines.
        const parts = buffer.split("\n\n");
        // The last element may be an incomplete event; keep it in the buffer.
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          this.parseAndDispatch(part);
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private parseAndDispatch(raw: string): void {
    let eventName = "";
    let dataLines: string[] = [];

    for (const line of raw.split("\n")) {
      if (line.startsWith("event: ")) {
        eventName = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        dataLines.push(line.slice(6));
      } else if (line.startsWith(":")) {
        // SSE comment (keepalive); ignore.
      }
    }

    if (!eventName || dataLines.length === 0) return;

    let data: unknown;
    try {
      data = JSON.parse(dataLines.join("\n"));
    } catch {
      this.logger?.warn(`SSE client: failed to parse event data for "${eventName}"`);
      return;
    }

    this.handleEvent(eventName, data);
  }

  private handleEvent(event: string, data: unknown): void {
    switch (event) {
      case "kill_switch": {
        const payload = data as { active: boolean; message?: string };
        if (payload.active) {
          if (!this.enforcerState.killSwitchActive) {
            this.logger?.warn(
              `Kill switch activated via SSE: ${payload.message ?? "No message"}`,
            );
          }
          this.enforcerState.killSwitchActive = true;
          this.enforcerState.killSwitchMessage = payload.message;
        } else {
          if (this.enforcerState.killSwitchActive) {
            this.logger?.info("Kill switch deactivated via SSE");
          }
          this.enforcerState.killSwitchActive = false;
          this.enforcerState.killSwitchMessage = undefined;
        }
        break;
      }

      case "policy_updated": {
        this.logger?.info("Policy update received via SSE");
        this.onPolicyRefreshNeeded?.();
        break;
      }

      case "connected": {
        this.logger?.info("SSE client: server acknowledged connection");
        break;
      }

      default:
        this.logger?.info(`SSE client: unknown event "${event}", ignoring`);
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;

    this.logger?.info(
      `SSE client: reconnecting in ${this.reconnectMs}ms`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectMs);

    // Exponential backoff, capped at MAX_RECONNECT_MS.
    this.reconnectMs = Math.min(this.reconnectMs * 2, MAX_RECONNECT_MS);
  }
}
