import type { AuditEntry } from "@clawforgeai/policy-schema";

export interface AuditBatchOptions {
  /** Max entries before forcing a flush. Default 100. */
  maxEntries?: number;
  /** Max serialized bytes before forcing a flush. Default 65_536. */
  maxBytes?: number;
  /** Max milliseconds between flushes. Default 5_000. */
  maxMs?: number;
}

export interface PolicyPollOptions {
  /** Polling interval for the policy safety-net pull. Default 60_000 ms. */
  intervalMs?: number;
}

export interface OfflineBufferOptions {
  /** Filesystem path used for the offline spool. Default `./.clawforge-spool/`. */
  path?: string;
  /** Max bytes the spool may consume. Default 50 MiB. */
  maxBytes?: number;
}

export interface ClawforgeConnectOptions {
  /** Control-plane base URL. Defaults to env CLAWFORGE_URL. */
  url?: string;
  /** JWT bearer token. Defaults to env CLAWFORGE_TOKEN. */
  token?: string;
  /** Agent DID. Defaults to env CLAWFORGE_AGENT_DID. */
  agentDid?: string;
  /** Tuning knobs (all optional). */
  auditBatch?: AuditBatchOptions;
  policyPoll?: PolicyPollOptions;
  offlineBuffer?: OfflineBufferOptions;
  /** Custom fetch (for tests / proxies). Defaults to global fetch. */
  fetch?: typeof fetch;
  /** Cancels the connect-time setup. */
  signal?: AbortSignal;
  /**
   * Override the kill-switch event source (test injection). When provided,
   * this short-circuits the SSE/polling transport selection.
   */
  killSwitchSource?: KillSwitchSource;
  /**
   * Real-time transport for kill-switch + policy-changed events:
   *   - "auto"    (default): try SSE; fall back to polling on failure
   *   - "sse"     : require SSE; throw if the stream can't be opened
   *   - "polling" : skip SSE entirely; use the polling kill-switch source
   *                 (no policy_changed pushes — the client won't auto-reload)
   */
  transport?: "auto" | "sse" | "polling";
}

/**
 * The minimum surface a kill-switch transport must expose. The default
 * implementation polls `/api/v1/kill-switch/:did`; SSE will arrive in Cut 2.
 */
export interface KillSwitchSource {
  start(handler: KillSwitchEventHandler): void;
  stop(): void;
}

export interface KillSwitchEvent {
  active: boolean;
  scope: string;
  reason: string;
  receivedAt: string;
}

export type KillSwitchEventHandler = (event: KillSwitchEvent) => void | Promise<void>;

/**
 * Fired when the server broadcasts a `policy_changed` SSE event. The client
 * has already re-fetched and reloaded the effective policy by the time the
 * handler runs.
 */
export interface PolicyChangedEvent {
  policyId?: string;
  policyName?: string;
  version?: number;
  schemaVersion?: string;
  receivedAt: string;
}

export type PolicyChangedHandler = (event: PolicyChangedEvent) => void | Promise<void>;

export type AuditDraft = Omit<AuditEntry, "timestamp" | "hash" | "previousHash">;

export type Unsubscribe = () => void;
