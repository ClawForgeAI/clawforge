/**
 * Connection state machine for ClawForge.
 *
 * Tracks the plugin's connectivity to the control plane and manages
 * transitions between connected, degraded, offline, and unauthenticated states.
 */

import type { AuditLogger } from "../audit/audit-logger.js";

export type ConnectionState = "connected" | "degraded" | "offline" | "unauthenticated";

export interface ConnectionStatus {
  state: ConnectionState;
  lastSuccessfulHeartbeat: Date | null;
  consecutiveFailures: number;
  cachedPolicyAge: number | null; // ms since last policy fetch
}

export interface ConnectionStateManagerParams {
  failureThreshold: number;
  auditLogger?: AuditLogger;
  cachedPolicyFetchedAt?: number | null;
  logger?: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
}

export class ConnectionStateManager {
  private _state: ConnectionState;
  private _lastSuccessfulHeartbeat: Date | null = null;
  private _consecutiveFailures = 0;
  private readonly failureThreshold: number;
  private cachedPolicyFetchedAt: number | null;
  private auditLogger?: AuditLogger;
  private logger?: ConnectionStateManagerParams["logger"];

  constructor(params: ConnectionStateManagerParams) {
    this.failureThreshold = params.failureThreshold;
    this.auditLogger = params.auditLogger;
    this.cachedPolicyFetchedAt = params.cachedPolicyFetchedAt ?? null;
    this.logger = params.logger;
    // Start as connected (we just authenticated and fetched policy).
    this._state = "connected";
  }

  get state(): ConnectionState {
    return this._state;
  }

  get lastSuccessfulHeartbeat(): Date | null {
    return this._lastSuccessfulHeartbeat;
  }

  get consecutiveFailures(): number {
    return this._consecutiveFailures;
  }

  /**
   * Returns the age of the cached policy in milliseconds, or null if unknown.
   */
  get cachedPolicyAge(): number | null {
    if (this.cachedPolicyFetchedAt == null) {
      return null;
    }
    return Date.now() - this.cachedPolicyFetchedAt;
  }

  /**
   * Return a snapshot of the current connection status.
   */
  getStatus(): ConnectionStatus {
    return {
      state: this._state,
      lastSuccessfulHeartbeat: this._lastSuccessfulHeartbeat,
      consecutiveFailures: this._consecutiveFailures,
      cachedPolicyAge: this.cachedPolicyAge,
    };
  }

  /**
   * Update the cached policy timestamp (e.g. after a successful policy fetch).
   */
  updateCachedPolicyFetchedAt(fetchedAt: number): void {
    this.cachedPolicyFetchedAt = fetchedAt;
  }

  /**
   * Record a successful heartbeat. Transitions back to 'connected' if needed.
   */
  recordSuccess(): void {
    const previousState = this._state;
    this._consecutiveFailures = 0;
    this._lastSuccessfulHeartbeat = new Date();
    this._state = "connected";

    if (previousState !== "connected") {
      this.logger?.info(`Connection restored: ${previousState} -> connected`);
      this.emitTransitionAudit(previousState, "connected");
    }
  }

  /**
   * Record a heartbeat failure. Transitions to 'degraded' or 'offline' based on threshold.
   */
  recordFailure(): void {
    const previousState = this._state;
    this._consecutiveFailures++;

    if (this._consecutiveFailures >= this.failureThreshold) {
      this._state = "offline";
    } else {
      this._state = "degraded";
    }

    if (previousState !== this._state) {
      this.logger?.warn(`Connection state changed: ${previousState} -> ${this._state}`);
      this.emitTransitionAudit(previousState, this._state);
    }
  }

  /**
   * Set state to unauthenticated (no valid session).
   */
  setUnauthenticated(): void {
    const previousState = this._state;
    if (previousState !== "unauthenticated") {
      this._state = "unauthenticated";
      this.logger?.warn(`Connection state changed: ${previousState} -> unauthenticated`);
      this.emitTransitionAudit(previousState, "unauthenticated");
    }
  }

  private emitTransitionAudit(from: ConnectionState, to: ConnectionState): void {
    this.auditLogger?.enqueue({
      eventType: "kill_switch_activated",
      outcome: to === "connected" ? "success" : "error",
      metadata: {
        transitionType: "connection_state_change",
        from,
        to,
        consecutiveFailures: this._consecutiveFailures,
      },
    });
  }
}
