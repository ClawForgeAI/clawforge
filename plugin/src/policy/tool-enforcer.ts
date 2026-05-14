/**
 * Tool policy enforcer for ClawForge.
 *
 * Implements the OpenClaw `before_tool_call` hook. The actual decision logic
 * lives in `@clawforgeai/policy-engine`; this file is the thin translation
 * layer between OpenClaw's hook surface and the shared engine — it wires
 * the engine's `PolicyDecision` to OpenClaw's `PluginHookBeforeToolCallResult`
 * shape and emits the matching audit event via the existing AuditLogger.
 *
 * Behavior parity with the pre-extraction tool-enforcer is enforced by the
 * existing plugin test suite (`tool-enforcer.test.ts`).
 */

import type {
  PluginHookBeforeToolCallEvent,
  PluginHookBeforeToolCallResult,
  PluginHookToolContext,
} from "openclaw/plugin-sdk";
import { evaluateToolCall } from "@clawforgeai/policy-engine";
import type { PolicyDecision, PolicyEvaluationContext } from "@clawforgeai/policy-engine";
import type { OrgPolicy } from "../types.js";
import type { AuditLogger } from "../audit/audit-logger.js";
import type { ConnectionStateManager } from "../connection/connection-state.js";

export type ToolEnforcerState = {
  policy: OrgPolicy | null;
  killSwitchActive: boolean;
  killSwitchMessage?: string;
  /**
   * Offline override set by the KillSwitchManager when the failure threshold is reached.
   * - 'allow' — bypass all policy checks and allow all tools
   * - 'cached' — use the cached policy for enforcement (even if stale)
   * - undefined — normal enforcement
   */
  offlineOverride?: "allow" | "cached";
  /** True while initializeClawForge() is still running. Tools are blocked by default until init completes. */
  pendingInit?: boolean;
};

/**
 * Create the before_tool_call hook handler for org policy enforcement.
 */
export function createToolEnforcerHook(
  state: ToolEnforcerState,
  auditLogger: Pick<AuditLogger, "enqueue">,
  // Kept for backward compatibility; reserved for future connection-aware decisions.
  _connectionStateManager?: ConnectionStateManager,
): (event: PluginHookBeforeToolCallEvent, ctx: PluginHookToolContext) => PluginHookBeforeToolCallResult | undefined {
  return (
    event: PluginHookBeforeToolCallEvent,
    ctx: PluginHookToolContext,
  ): PluginHookBeforeToolCallResult | undefined => {
    const evalCtx: PolicyEvaluationContext = {
      policy: state.policy,
      killSwitchActive: state.killSwitchActive,
      killSwitchMessage: state.killSwitchMessage,
      offlineOverride: state.offlineOverride,
      pendingInit: state.pendingInit,
    };

    const decision = evaluateToolCall(evalCtx, {
      rawToolName: event.toolName,
      params: event.params,
    });

    return applyDecision(decision, event, ctx, auditLogger);
  };
}

function applyDecision(
  decision: PolicyDecision,
  event: PluginHookBeforeToolCallEvent,
  ctx: PluginHookToolContext,
  auditLogger: Pick<AuditLogger, "enqueue">,
): PluginHookBeforeToolCallResult | undefined {
  const normalizedToolName = toAuditToolName(event.toolName, decision);
  const reasonText = formatAuditReason(decision);

  if (decision.reason === "dlp_block" || decision.reason === "dlp_violation_allowed") {
    // DLP events get a dedicated event type so consumers can filter on them.
    const dlp = decision.dlp;
    if (!dlp) {
      // Defensive — engine always populates `dlp` on DLP-tagged decisions.
      return undefined;
    }
    const violationSummary = dlp.violations.map((v) => ({
      rule: v.ruleName,
      action: v.action,
      severity: v.severity,
      category: v.category,
      redactedContext: v.redactedContext,
    }));
    auditLogger.enqueue({
      eventType: "dlp_violation",
      toolName: normalizedToolName,
      outcome: decision.outcome === "deny" ? "blocked" : "allowed",
      agentId: ctx.agentId,
      sessionKey: ctx.sessionKey,
      metadata: {
        violations: violationSummary,
        scannedFields: dlp.scannedFields,
        effectiveAction: dlp.effectiveAction,
      },
    });
    if (decision.outcome === "deny" && decision.blockMessage) {
      return { block: true, blockReason: decision.blockMessage };
    }
    return undefined;
  }

  const metadata = buildToolCallMetadata(decision, reasonText);

  auditLogger.enqueue({
    eventType: "tool_call_attempt",
    toolName: normalizedToolName,
    outcome: decision.outcome === "deny" ? "blocked" : "allowed",
    agentId: ctx.agentId,
    sessionKey: ctx.sessionKey,
    metadata,
  });

  if (decision.outcome === "deny" && decision.blockMessage) {
    return { block: true, blockReason: decision.blockMessage };
  }
  return undefined;
}

/**
 * Build the `metadata` payload that older audit consumers expect on
 * `tool_call_attempt` events. Specifically, the legacy enforcer used to
 * pass `undefined` rather than `{ reason: undefined }` when the decision
 * was a plain allow with no offline mode active — preserved here so the
 * existing audit test assertions remain stable.
 */
function buildToolCallMetadata(
  decision: PolicyDecision,
  reasonText: string | undefined,
): Record<string, unknown> | undefined {
  // fs_deny_exec also reported the offending command in the legacy audit metadata.
  if (decision.reason === "fs_deny_exec") {
    return {
      reason: reasonText,
      command: decision.blockedCommand ?? "",
    };
  }

  if (!reasonText) return undefined;
  return { reason: reasonText };
}

/**
 * Translate a PolicyDecision into the audit-reason string the legacy
 * enforcer emitted. Same wording — same audit consumers keep working.
 */
function formatAuditReason(decision: PolicyDecision): string | undefined {
  const suffix = decision.mode === "offline_cached_mode" ? " (offline_cached_mode)" : "";

  switch (decision.reason) {
    case "pending_init":
      return "pending_init";
    case "kill_switch":
      return "kill_switch";
    case "offline_allow_mode":
      return "offline_allow_mode";
    case "no_policy":
      // Legacy quirk: in offline_cached mode + null policy, the reason
      // emitted is the bare mode tag, not "no_policy (offline_cached_mode)".
      return decision.mode === "offline_cached_mode" ? "offline_cached_mode" : "no_policy";
    case "deny_list":
      return `deny_list${suffix}`;
    case "fs_deny_exec":
      return `fs_deny_exec${suffix}`;
    case "not_in_allowlist":
      return `not_in_allowlist${suffix}`;
    case "allowed":
      return decision.mode === "offline_cached_mode" ? "offline_cached_mode" : undefined;
    case "dlp_block":
    case "dlp_violation_allowed":
      // Handled by the DLP audit branch in applyDecision; never reaches here.
      return undefined;
    default:
      return undefined;
  }
}

/**
 * Audit events have historically logged the normalized tool name (e.g.
 * "exec" instead of "bash"). The policy engine doesn't expose the
 * normalized name on the decision, but we can recover it from the raw
 * event name using the same normalization rule.
 */
function toAuditToolName(rawToolName: string, _decision: PolicyDecision): string {
  // Match `normalizeToolName` semantics from @clawforgeai/tool-governance.
  const normalized = rawToolName.trim().toLowerCase();
  if (normalized === "bash") return "exec";
  if (normalized === "apply-patch") return "apply_patch";
  return normalized;
}
