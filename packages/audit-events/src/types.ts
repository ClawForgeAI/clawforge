import type { AuditEvent, AuditEventType } from "@clawforgeai/contracts";

export type { AuditEvent, AuditEventType };

export type AuditOutcome = AuditEvent["outcome"];

/**
 * Audit-record level inherited from the org policy. Controls how much
 * payload detail is retained on each event.
 *
 * - "full"     — include `metadata` on every event
 * - "metadata" — drop the `metadata` payload but keep counters and reasons
 * - "off"      — drop events entirely
 */
export type AuditLevel = "full" | "metadata" | "off";

/** Minimal logger surface used by the batched queue for warnings. */
export interface AuditLoggerSink {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

/**
 * Inputs accepted by `BatchedAuditQueue.enqueue`. Identity fields
 * (userId, orgId, timestamp) are filled in by the queue from the
 * caller-supplied identity context, keeping enqueue sites terse.
 */
export interface AuditEventDraft {
  eventType: AuditEventType;
  outcome: AuditOutcome;
  toolName?: string;
  agentId?: string;
  sessionKey?: string;
  metadata?: Record<string, unknown>;
}

/** Identity context attached to every event the queue emits. */
export interface AuditIdentity {
  userId: string;
  orgId: string;
}

/**
 * Transport hook called by the queue when a batch is ready. Returns
 * `true` on successful delivery; `false` puts the batch back on the
 * head of the buffer (for retry on the next flush) and signals the
 * persistence layer to checkpoint.
 */
export type AuditTransport = (batch: AuditEvent[]) => Promise<boolean>;

/**
 * Optional durable persistence hook. The queue calls `save` after a
 * failed flush so the caller (plugin or worker) can checkpoint to disk
 * for crash resilience, and `load` once at startup to recover unshipped
 * events. Implementations should be best-effort and never throw.
 */
export interface AuditPersistence {
  load: () => AuditEvent[];
  save: (events: AuditEvent[]) => void;
  clear: () => void;
}

export interface BatchedAuditQueueOptions {
  identity: AuditIdentity;
  transport: AuditTransport;
  persistence?: AuditPersistence;
  logger?: AuditLoggerSink;
  auditLevel?: AuditLevel;
  /** Number of events that triggers an automatic flush. Default 100. */
  batchSize?: number;
  /** Maximum events held in memory. Oldest are dropped beyond this. Default 10_000. */
  maxBufferSize?: number;
  /** Capacity ratio (0..1) at which a single warning is emitted. Default 0.8. */
  warningThreshold?: number;
  /** Clock for testability — defaults to `Date.now`. */
  now?: () => number;
}
