import type { AuditEvent } from "@clawforgeai/contracts";
import type {
  AuditEventDraft,
  AuditIdentity,
  AuditLevel,
  AuditLoggerSink,
  AuditPersistence,
  AuditTransport,
  BatchedAuditQueueOptions,
} from "./types.js";

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_MAX_BUFFER_SIZE = 10_000;
const DEFAULT_WARNING_THRESHOLD = 0.8;

/**
 * Bounded in-memory audit queue with bulk flush, drop-oldest overflow,
 * and optional durable persistence. Pure of any transport or file-system
 * coupling — callers inject `transport` and `persistence`.
 *
 * Behavior mirrors the legacy `plugin/src/audit/audit-logger.ts`:
 *   - `auditLevel === "off"` short-circuits enqueue
 *   - `auditLevel === "metadata"` drops the per-event `metadata` payload
 *   - the queue auto-flushes once `buffer.length >= batchSize`
 *   - exceeding `maxBufferSize` evicts the oldest events with a warning
 *   - failed transport puts the batch back on the head of the buffer and
 *     checkpoints to persistence; successful transport clears persistence
 *   - a capacity warning fires once per cycle above `warningThreshold`
 */
export class BatchedAuditQueue {
  private readonly identity: AuditIdentity;
  private readonly transport: AuditTransport;
  private readonly persistence?: AuditPersistence;
  private readonly logger?: AuditLoggerSink;
  private readonly batchSize: number;
  private readonly maxBufferSize: number;
  private readonly warningThreshold: number;
  private readonly now: () => number;

  private buffer: AuditEvent[] = [];
  private auditLevel: AuditLevel;
  private hasWarnedCapacity = false;

  constructor(options: BatchedAuditQueueOptions) {
    this.identity = options.identity;
    this.transport = options.transport;
    this.persistence = options.persistence;
    this.logger = options.logger;
    this.auditLevel = options.auditLevel ?? "metadata";
    this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    this.maxBufferSize = options.maxBufferSize ?? DEFAULT_MAX_BUFFER_SIZE;
    this.warningThreshold = options.warningThreshold ?? DEFAULT_WARNING_THRESHOLD;
    this.now = options.now ?? Date.now;

    if (this.persistence) {
      const restored = this.persistence.load();
      this.buffer.push(...restored);
      this.enforceBufferLimit();
    }
  }

  setAuditLevel(level: AuditLevel): void {
    this.auditLevel = level;
  }

  get bufferSize(): number {
    return this.buffer.length;
  }

  get bufferCapacity(): number {
    return this.maxBufferSize;
  }

  /**
   * Enqueue an event. No-op when `auditLevel === "off"`.
   * Returns the resulting buffer length (useful for tests).
   */
  enqueue(draft: AuditEventDraft): number {
    if (this.auditLevel === "off") return this.buffer.length;

    const event: AuditEvent = {
      userId: this.identity.userId,
      orgId: this.identity.orgId,
      agentId: draft.agentId,
      sessionKey: draft.sessionKey,
      eventType: draft.eventType,
      toolName: draft.toolName,
      timestamp: this.now(),
      outcome: draft.outcome,
      metadata: this.auditLevel === "full" ? draft.metadata : undefined,
    };

    this.buffer.push(event);

    if (this.buffer.length > this.maxBufferSize) {
      const dropped = this.buffer.length - this.maxBufferSize;
      this.buffer.splice(0, dropped);
      this.logger?.warn(`Audit buffer exceeded max size (${this.maxBufferSize}). Dropped ${dropped} oldest event(s).`);
    }

    const ratio = this.buffer.length / this.maxBufferSize;
    if (ratio > this.warningThreshold && !this.hasWarnedCapacity) {
      this.hasWarnedCapacity = true;
      this.logger?.warn(
        `Audit buffer approaching capacity: ${this.buffer.length}/${this.maxBufferSize} (${Math.round(ratio * 100)}%)`,
      );
    } else if (ratio <= this.warningThreshold) {
      this.hasWarnedCapacity = false;
    }

    return this.buffer.length;
  }

  /**
   * True when enqueueing has accumulated enough events that the caller's
   * timer should trigger a flush early. Callers may also call flush
   * directly at any time.
   */
  shouldFlush(): boolean {
    return this.buffer.length >= this.batchSize;
  }

  /**
   * Drain the queue and hand the batch to the transport. On failure,
   * the batch goes back on the head of the buffer and is checkpointed
   * via persistence. On success, persistence is cleared.
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const batch = this.buffer.splice(0);
    let delivered = false;
    try {
      delivered = await this.transport(batch);
    } catch (err) {
      this.logger?.warn(`Audit transport threw: ${String(err)}`);
      delivered = false;
    }

    if (delivered) {
      this.hasWarnedCapacity = false;
      this.persistence?.clear();
    } else {
      this.buffer.unshift(...batch);
      this.enforceBufferLimit();
      this.persistence?.save(this.buffer);
    }
  }

  /** Drop all buffered events without delivering. Used in tests + shutdown paths. */
  reset(): void {
    this.buffer = [];
    this.hasWarnedCapacity = false;
    this.persistence?.clear();
  }

  private enforceBufferLimit(): void {
    if (this.buffer.length > this.maxBufferSize) {
      const dropped = this.buffer.length - this.maxBufferSize;
      this.buffer.splice(0, dropped);
      this.logger?.warn(
        `Audit buffer trimmed: dropped ${dropped} oldest event(s) to stay within limit (${this.maxBufferSize}).`,
      );
    }
  }
}
