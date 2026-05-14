import type {
  Action,
  ApprovalDecision,
  ApprovalRequest,
  AuditEvent,
  AuditEventType,
  OrgPolicy,
  Run,
  RuntimeRegistration,
} from "@clawforgeai/contracts";
import type { PolicyDecision } from "@clawforgeai/policy-engine";

/**
 * Minimal tool descriptor reported by an adapter. Adapters supply only the
 * fields they have — the platform tolerates partial descriptors and enriches
 * them server-side from the tool-governance package.
 */
export interface ToolDescriptor {
  name: string;
  description?: string;
  /** Optional capability metadata (e.g. "filesystem", "network"). */
  tags?: string[];
}

/**
 * Aggregated usage report submitted at the end of a run (or periodically
 * for long-running runs). All fields are optional — adapters supply what
 * their runtime tracks.
 */
export interface UsageReport {
  promptTokens?: number;
  completionTokens?: number;
  toolCalls?: number;
  durationMs?: number;
  failures?: number;
}

/** Reference to an output collected by the adapter at the end of a run. */
export interface ArtifactRef {
  id: string;
  kind: "log" | "file" | "url" | "diff";
  uri?: string;
  bytes?: number;
  contentType?: string;
}

export interface StartRunInput {
  agentInstanceId: string;
  userId: string;
  orgId: string;
  parentRunId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * The canonical surface every ClawForge runtime adapter implements.
 *
 * Phase 1 introduces the contract; not every runtime supports every method
 * yet. Adapters can throw `RuntimeCapabilityError` for unsupported
 * operations rather than silently no-op'ing them.
 *
 * Methods grouped by lifecycle phase:
 *   register      -> identity + capability advertisement
 *   start/pause/resume/cancel -> run lifecycle
 *   requestApproval / emitEvent -> in-run governance
 *   applyPolicy / reportUsage / collectArtifacts -> control & wrap-up
 */
export interface RuntimeAdapter {
  /** Advertise the runtime kind, version, and capabilities to the control plane. */
  registerAgent(registration: RuntimeRegistration): Promise<RuntimeRegistrationResult>;

  /** Begin a new run. Returns the canonical Run record. */
  startRun(input: StartRunInput): Promise<Run>;

  /** Pause a running run; no new actions accepted until resumed. */
  pauseRun(runId: string): Promise<void>;

  /** Resume a paused run. */
  resumeRun(runId: string): Promise<void>;

  /** Cancel a run; the adapter MUST stop tool execution. */
  cancelRun(runId: string, reason?: string): Promise<void>;

  /**
   * Ask the control plane to gate an action. The adapter MUST block its
   * runtime on the returned promise — resolution carries the human decision.
   */
  requestApproval(action: Action, request: ApprovalRequest): Promise<ApprovalDecision>;

  /**
   * Emit a single audit event. Adapters typically queue + batch via
   * `BatchedAuditQueue` from `@clawforgeai/audit-events`.
   */
  emitEvent(event: Omit<AuditEvent, "userId" | "orgId" | "timestamp">): void;

  /** Report the tools the runtime currently exposes. */
  listTools(): Promise<ToolDescriptor[]>;

  /**
   * Receive a new effective policy from the control plane. The adapter
   * should apply it before the next action evaluation. The returned decision
   * (if provided) hints whether subsequent action evaluation should pause —
   * typically used in tests.
   */
  applyPolicy(policy: OrgPolicy): Promise<PolicyDecision | void>;

  /** Report aggregated usage for a run. May be called multiple times. */
  reportUsage(runId: string, usage: UsageReport): Promise<void>;

  /** Return references to artifacts produced during the run. */
  collectArtifacts(runId: string): Promise<ArtifactRef[]>;
}

export interface RuntimeRegistrationResult {
  agentInstanceId: string;
  /** Wall-clock the control plane assigned to this registration. */
  enrolledAt: string;
}

/** Thrown when an adapter is asked for a capability it does not advertise. */
export class RuntimeCapabilityError extends Error {
  constructor(
    public readonly capability: string,
    public readonly runtimeKind?: string,
  ) {
    super(
      runtimeKind
        ? `Runtime "${runtimeKind}" does not support capability "${capability}"`
        : `Runtime does not support capability "${capability}"`,
    );
    this.name = "RuntimeCapabilityError";
  }
}

/** Re-export for adapter authors who route their own audit emission. */
export type { AuditEvent, AuditEventType };
