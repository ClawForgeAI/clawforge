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
   * Override the kill-switch event source (test injection). When omitted the
   * client uses its default SSE/polling transport (see kill-switch-transport.ts).
   */
  killSwitchSource?: KillSwitchSource;
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

export type AuditDraft = Omit<AuditEntry, "timestamp" | "hash" | "previousHash">;

export type Unsubscribe = () => void;
