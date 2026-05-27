import type { AuditEntry } from "@clawforgeai/policy-schema";
import type { AuditBatchOptions } from "./types.js";

const DEFAULT_MAX_ENTRIES = 100;
const DEFAULT_MAX_BYTES = 65_536;
const DEFAULT_MAX_MS = 5_000;

export type AuditTransport = (batch: AuditEntry[]) => Promise<void>;

export interface AuditBatcherOptions {
  transport: AuditTransport;
  batch?: AuditBatchOptions;
  /** Override the wall clock for tests. */
  now?: () => number;
  /** Override timers for tests. */
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
  /** Called on transport failure so callers can log / persist. */
  onFlushError?: (err: unknown, batch: AuditEntry[]) => void;
}

/**
 * Minimal bounded batcher tuned for AGT `AuditEntry` payloads.
 *
 * Auto-flush triggers: maxEntries reached, maxBytes (serialized) exceeded,
 * or maxMs since first enqueued entry. Flushes are awaited serially so the
 * server sees entries in their chain order.
 */
export class AuditBatcher {
  private readonly transport: AuditTransport;
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private readonly maxMs: number;
  private readonly now: () => number;
  private readonly setTimeoutImpl: typeof setTimeout;
  private readonly clearTimeoutImpl: typeof clearTimeout;
  private readonly onFlushError?: AuditBatcherOptions["onFlushError"];

  private buffer: AuditEntry[] = [];
  private bufferBytes = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private flushChain: Promise<void> = Promise.resolve();
  private closed = false;

  constructor(opts: AuditBatcherOptions) {
    this.transport = opts.transport;
    this.maxEntries = opts.batch?.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.maxBytes = opts.batch?.maxBytes ?? DEFAULT_MAX_BYTES;
    this.maxMs = opts.batch?.maxMs ?? DEFAULT_MAX_MS;
    this.now = opts.now ?? Date.now;
    this.setTimeoutImpl = opts.setTimeoutImpl ?? setTimeout;
    this.clearTimeoutImpl = opts.clearTimeoutImpl ?? clearTimeout;
    this.onFlushError = opts.onFlushError;
  }

  enqueue(entry: AuditEntry): void {
    if (this.closed) return;

    const size = JSON.stringify(entry).length;
    this.buffer.push(entry);
    this.bufferBytes += size;

    if (this.buffer.length >= this.maxEntries || this.bufferBytes >= this.maxBytes) {
      this.scheduleFlushNow();
      return;
    }

    if (this.timer === undefined) {
      this.timer = this.setTimeoutImpl(() => this.scheduleFlushNow(), this.maxMs);
    }
  }

  get pendingCount(): number {
    return this.buffer.length;
  }

  /** Force a flush and wait for it to complete. */
  async flush(): Promise<void> {
    this.scheduleFlushNow();
    await this.flushChain;
  }

  /** Stop accepting new entries; flush whatever remains. */
  async close(): Promise<void> {
    this.closed = true;
    await this.flush();
  }

  private scheduleFlushNow(): void {
    if (this.timer !== undefined) {
      this.clearTimeoutImpl(this.timer);
      this.timer = undefined;
    }
    if (this.buffer.length === 0) return;

    const batch = this.buffer;
    this.buffer = [];
    this.bufferBytes = 0;

    this.flushChain = this.flushChain.then(() => this.doFlush(batch));
  }

  private async doFlush(batch: AuditEntry[]): Promise<void> {
    try {
      await this.transport(batch);
    } catch (err) {
      this.onFlushError?.(err, batch);
      throw err;
    }
  }
}
