/**
 * Audit logger for ClawForge.
 *
 * Thin plugin-specific wrapper around `BatchedAuditQueue` from
 * `@clawforgeai/audit-events`. The queue owns the bounded buffer,
 * drop-oldest overflow, capacity warnings, and batch-size auto-flush.
 * This wrapper supplies:
 *   - HTTP transport to `POST /api/v1/audit/:orgId/events`
 *   - Filesystem persistence at `~/.openclaw/clawforge/audit-buffer.jsonl`
 *   - A periodic flush timer
 *   - Token mutation hooks for session refresh
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { BatchedAuditQueue, parseJsonl, serializeJsonl } from "@clawforgeai/audit-events";
import type { AuditEvent as PackageAuditEvent, AuditPersistence, AuditTransport } from "@clawforgeai/audit-events";
import type { AuditEvent, AuditEventType, ClawForgePluginConfig, SessionTokens } from "../types.js";

const CLAWFORGE_DIR = path.join(os.homedir(), ".openclaw", "clawforge");
const BUFFER_FILE = path.join(CLAWFORGE_DIR, "audit-buffer.jsonl");

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_FLUSH_INTERVAL_MS = 30_000;
const DEFAULT_MAX_BUFFER_SIZE = 10_000;

export type AuditLoggerEnqueueParams = {
  eventType: AuditEventType;
  toolName?: string;
  outcome: AuditEvent["outcome"];
  agentId?: string;
  sessionKey?: string;
  metadata?: Record<string, unknown>;
};

type LoggerSink = { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };

export class AuditLogger {
  private readonly queue: BatchedAuditQueue;
  private readonly flushIntervalMs: number;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private controlPlaneUrl: string;
  private orgId: string;
  private accessToken: string;
  private logger?: LoggerSink;

  constructor(params: {
    config: ClawForgePluginConfig;
    session: SessionTokens;
    auditLevel?: "full" | "metadata" | "off";
    logger?: LoggerSink;
  }) {
    this.controlPlaneUrl = params.config.controlPlaneUrl ?? "";
    this.orgId = params.session.orgId;
    this.accessToken = params.session.accessToken;
    this.flushIntervalMs = params.config.auditFlushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    this.logger = params.logger;

    const transport: AuditTransport = async (batch) => {
      if (!this.controlPlaneUrl) {
        // No control plane configured -> treat as failed delivery so the
        // queue requeues and persistence checkpoints.
        return false;
      }
      try {
        const url = `${this.controlPlaneUrl}/api/v1/audit/${encodeURIComponent(this.orgId)}/events`;
        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ events: batch }),
        });
        if (!response.ok) {
          this.logger?.warn(`Audit event submission failed (${response.status})`);
          return false;
        }
        this.logger?.info(`Shipped ${batch.length} audit events`);
        return true;
      } catch (err) {
        this.logger?.warn(`Audit event submission error: ${String(err)}`);
        return false;
      }
    };

    const persistence: AuditPersistence = {
      load: () => {
        try {
          const raw = fs.readFileSync(BUFFER_FILE, "utf-8");
          return parseJsonl(raw) as PackageAuditEvent[];
        } catch {
          return [];
        }
      },
      save: (events) => {
        try {
          fs.mkdirSync(CLAWFORGE_DIR, { recursive: true });
          fs.writeFileSync(BUFFER_FILE, serializeJsonl(events), { mode: 0o600 });
        } catch {
          // Best-effort.
        }
      },
      clear: () => {
        try {
          fs.unlinkSync(BUFFER_FILE);
        } catch {
          // Ignore.
        }
      },
    };

    this.queue = new BatchedAuditQueue({
      identity: { userId: params.session.userId, orgId: params.session.orgId },
      transport,
      persistence,
      logger: this.logger,
      auditLevel: params.auditLevel ?? "metadata",
      batchSize: params.config.auditBatchSize ?? DEFAULT_BATCH_SIZE,
      maxBufferSize: params.config.maxAuditBufferSize ?? DEFAULT_MAX_BUFFER_SIZE,
    });
  }

  /** Start the periodic flush timer. */
  start(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => {
      this.queue.flush().catch((err) => this.logger?.warn(`Audit flush failed: ${String(err)}`));
    }, this.flushIntervalMs);
    if (this.flushTimer.unref) this.flushTimer.unref();
  }

  /** Stop the periodic flush timer and flush remaining events. */
  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.queue.flush();
  }

  /** Update the access token (e.g. after a session refresh). */
  updateAccessToken(token: string): void {
    this.accessToken = token;
  }

  /** Update the audit level from policy refresh. */
  updateAuditLevel(level: "full" | "metadata" | "off"): void {
    this.queue.setAuditLevel(level);
  }

  get bufferSize(): number {
    return this.queue.bufferSize;
  }

  get bufferCapacity(): number {
    return this.queue.bufferCapacity;
  }

  /** Enqueue an audit event. Triggers an automatic flush when the batch is full. */
  enqueue(params: AuditLoggerEnqueueParams): void {
    const sizeBefore = this.queue.bufferSize;
    this.queue.enqueue({
      eventType: params.eventType,
      outcome: params.outcome,
      toolName: params.toolName,
      agentId: params.agentId,
      sessionKey: params.sessionKey,
      metadata: params.metadata,
    });
    // Preserve the legacy "auto-flush on batch full" behavior. The queue
    // exposes `shouldFlush()` for this — call it iff we just grew the buffer
    // (auditLevel="off" no-ops, so size stays the same).
    if (this.queue.bufferSize > sizeBefore && this.queue.shouldFlush()) {
      void this.queue.flush().catch((err) => this.logger?.warn(`Audit flush failed: ${String(err)}`));
    }
  }

  /** Flush buffered events to the control plane. */
  async flush(): Promise<void> {
    await this.queue.flush();
  }
}
