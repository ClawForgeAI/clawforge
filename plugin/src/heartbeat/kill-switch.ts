/**
 * Heartbeat and kill switch manager for ClawForge.
 * Periodically pings the control plane and updates local state.
 * Tracks connection state and applies configured offline behavior.
 */

import type { ClawForgePluginConfig, HeartbeatResponse, OfflineMode, SessionTokens } from "../types.js";
import type { ToolEnforcerState } from "../policy/tool-enforcer.js";
import type { ConnectionStateManager } from "../connection/connection-state.js";

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_FAILURE_THRESHOLD = 10;

export class KillSwitchManager {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly intervalMs: number;
  private readonly failureThreshold: number;
  private readonly controlPlaneUrl: string;
  private readonly orgId: string;
  private readonly userId: string;
  private accessToken: string;
  private readonly enforcerState: ToolEnforcerState;
  private readonly offlineMode: OfflineMode;
  private connectionStateManager?: ConnectionStateManager;
  private onPolicyRefreshNeeded?: () => void;
  private logger?: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };

  constructor(params: {
    config: ClawForgePluginConfig;
    session: SessionTokens;
    enforcerState: ToolEnforcerState;
    connectionStateManager?: ConnectionStateManager;
    onPolicyRefreshNeeded?: () => void;
    logger?: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };
  }) {
    this.controlPlaneUrl = params.config.controlPlaneUrl ?? "";
    this.orgId = params.session.orgId;
    this.userId = params.session.userId;
    this.accessToken = params.session.accessToken;
    this.intervalMs = params.config.heartbeatIntervalMs ?? DEFAULT_INTERVAL_MS;
    this.failureThreshold = params.config.heartbeatFailureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.enforcerState = params.enforcerState;
    this.offlineMode = params.config.offlineMode ?? "block";
    this.connectionStateManager = params.connectionStateManager;
    this.onPolicyRefreshNeeded = params.onPolicyRefreshNeeded;
    this.logger = params.logger;
  }

  start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      this.heartbeat().catch((err) => {
        this.logger?.warn(`Heartbeat error: ${String(err)}`);
      });
    }, this.intervalMs);
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  updateAccessToken(token: string): void {
    this.accessToken = token;
  }

  private async heartbeat(): Promise<void> {
    if (!this.controlPlaneUrl) {
      return;
    }

    try {
      const url = `${this.controlPlaneUrl}/api/v1/heartbeat/${encodeURIComponent(this.orgId)}/${encodeURIComponent(this.userId)}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        this.handleFailure(`HTTP ${response.status}`);
        return;
      }

      const data = (await response.json()) as HeartbeatResponse;

      // Record success in connection state manager.
      this.connectionStateManager?.recordSuccess();

      // On reconnection from offline/degraded, restore normal enforcement.
      if (this.enforcerState.offlineOverride) {
        this.logger?.info("Connection restored, clearing offline override");
        this.enforcerState.offlineOverride = undefined;
      }

      // Update kill switch state
      if (data.killSwitch) {
        if (!this.enforcerState.killSwitchActive) {
          this.logger?.warn(
            `Kill switch activated: ${data.killSwitchMessage ?? "No message"}`,
          );
        }
        this.enforcerState.killSwitchActive = true;
        this.enforcerState.killSwitchMessage = data.killSwitchMessage;
      } else {
        if (this.enforcerState.killSwitchActive) {
          this.logger?.info("Kill switch deactivated");
        }
        this.enforcerState.killSwitchActive = false;
        this.enforcerState.killSwitchMessage = undefined;
      }

      // Check if policy needs refresh
      if (data.refreshPolicyNow) {
        this.logger?.info("Policy refresh requested by control plane");
        this.onPolicyRefreshNeeded?.();
      }
    } catch (err) {
      this.handleFailure(String(err));
    }
  }

  private handleFailure(reason: string): void {
    this.connectionStateManager?.recordFailure();
    const consecutiveFailures = this.connectionStateManager?.consecutiveFailures ?? 0;

    this.logger?.warn(
      `Heartbeat failed (${consecutiveFailures}/${this.failureThreshold}): ${reason}`,
    );

    if (consecutiveFailures >= this.failureThreshold) {
      this.applyOfflineBehavior();
    }
  }

  /**
   * Apply the configured offline mode behavior when the failure threshold is reached.
   */
  private applyOfflineBehavior(): void {
    switch (this.offlineMode) {
      case "block":
        this.logger?.error(
          `Heartbeat failure threshold reached (${this.failureThreshold}). Blocking all tools (offlineMode=block).`,
        );
        this.enforcerState.killSwitchActive = true;
        this.enforcerState.killSwitchMessage =
          "ClawForge: Cannot reach control plane. All tools blocked (offline mode: block).";
        this.enforcerState.offlineOverride = undefined;
        break;

      case "allow":
        this.logger?.warn(
          `Heartbeat failure threshold reached (${this.failureThreshold}). Allowing all tools (offlineMode=allow).`,
        );
        this.enforcerState.offlineOverride = "allow";
        break;

      case "cached":
        this.logger?.warn(
          `Heartbeat failure threshold reached (${this.failureThreshold}). Using cached policy (offlineMode=cached).`,
        );
        this.enforcerState.offlineOverride = "cached";
        break;
    }
  }
}
