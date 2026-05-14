import { BatchedAuditQueue } from "@clawforgeai/audit-events";
import type { AuditTransport, AuditPersistence, AuditEventDraft, AuditLevel } from "@clawforgeai/audit-events";
import type { OrgPolicy } from "@clawforgeai/contracts";
import type { PolicyDecision, PolicyEvaluationContext, ToolCallEvaluationInput } from "@clawforgeai/policy-engine";
import { evaluateToolCall } from "@clawforgeai/policy-engine";

export interface BaseAdapterOptions {
  identity: { userId: string; orgId: string };
  auditTransport: AuditTransport;
  auditPersistence?: AuditPersistence;
  auditLevel?: AuditLevel;
  logger?: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };
}

/**
 * Convenience scaffold for runtime adapters. Bundles:
 *   - a `BatchedAuditQueue` for the adapter to enqueue events into
 *   - a `policy-engine` accessor that always evaluates against the
 *     last applied policy + the adapter's current kill-switch + offline state
 *
 * Runtime-specific methods (`registerAgent`, `startRun`, etc.) are left
 * to subclasses, which decide how their host runtime exposes those hooks.
 *
 * Adapter authors who prefer raw composition can ignore this class and
 * wire `BatchedAuditQueue` + `evaluateToolCall` themselves.
 */
export abstract class BaseRuntimeAdapter {
  protected readonly auditQueue: BatchedAuditQueue;
  protected policy: OrgPolicy | null = null;
  protected killSwitchActive = false;
  protected killSwitchMessage: string | undefined;
  protected offlineOverride: "allow" | "cached" | undefined;
  protected pendingInit = true;

  constructor(protected readonly options: BaseAdapterOptions) {
    this.auditQueue = new BatchedAuditQueue({
      identity: options.identity,
      transport: options.auditTransport,
      persistence: options.auditPersistence,
      logger: options.logger,
      auditLevel: options.auditLevel ?? "metadata",
    });
  }

  /** Apply the latest org policy. Future tool calls evaluate against this. */
  setPolicy(policy: OrgPolicy | null): void {
    this.policy = policy;
    this.pendingInit = false;
  }

  /** Toggle the org kill switch state observed by future evaluations. */
  setKillSwitch(active: boolean, message?: string): void {
    this.killSwitchActive = active;
    this.killSwitchMessage = message;
  }

  /** Set or clear the offline override (controls cached vs. allow-all behavior). */
  setOfflineOverride(mode: "allow" | "cached" | undefined): void {
    this.offlineOverride = mode;
  }

  /** Mark initialization complete (clears pending-init safe mode). */
  markInitialized(): void {
    this.pendingInit = false;
  }

  /** Enqueue an audit event; the queue auto-flushes when batchSize is hit. */
  emitEvent(draft: AuditEventDraft): void {
    this.auditQueue.enqueue(draft);
  }

  /** Force-flush the audit queue (typically called on shutdown). */
  async flushAudit(): Promise<void> {
    await this.auditQueue.flush();
  }

  /**
   * Evaluate a tool call against the current state. Pure passthrough to
   * the policy-engine — adapters call this from their pre-tool hook.
   */
  evaluateTool(input: ToolCallEvaluationInput): PolicyDecision {
    const ctx: PolicyEvaluationContext = {
      policy: this.policy,
      killSwitchActive: this.killSwitchActive,
      killSwitchMessage: this.killSwitchMessage,
      offlineOverride: this.offlineOverride,
      pendingInit: this.pendingInit,
    };
    return evaluateToolCall(ctx, input);
  }
}
