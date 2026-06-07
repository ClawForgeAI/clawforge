/**
 * AGT-backed `before_tool_call` hook factory (Cut 1 step 8).
 *
 * Drop-in alternative to `policy/tool-enforcer.ts` that uses the AGT
 * PolicyEngine via `@clawforgeai/client` instead of the legacy
 * `evaluateToolCall(ctx, input)` path.
 *
 * Differences from the legacy enforcer:
 *   - Decisions come from AGT (`PolicyDecisionResult`), so `policyName`,
 *     `matchedRule`, and `reason` propagate to the OpenClaw block reason.
 *   - Audit is hash-chained via AGT `AuditLogger` and batched to
 *     `POST /api/v1/audit/{orgId}/entries` (no JSONL spool here — the
 *     client maintains its own offline buffer).
 *   - Kill switch and offlineOverride states still apply.
 *   - DLP-specific behaviors from the legacy enforcer are NOT preserved
 *     in this Cut 1 cut. DLP-as-AGT-rules lands with the policy-engine
 *     extension work scoped for Cut 2.
 */

import type { AgtRuntime } from "./clawforge-client.js";

/**
 * Self-contained event shape. Structurally compatible with OpenClaw's
 * `PluginHookBeforeToolCallEvent`; customers may pass the OpenClaw value
 * directly without a cast.
 */
export interface AgtBeforeToolCallEvent {
  toolName: string;
  params?: Record<string, unknown>;
}

export interface AgtToolContext {
  agentId?: string;
  sessionKey?: string;
}

export interface AgtToolCallResult {
  block?: boolean;
  blockReason?: string;
}

export interface AgtToolEnforcerState {
  killSwitchActive: boolean;
  killSwitchMessage?: string;
  /** `'allow'` short-circuits to allow; `'cached'` keeps enforcing. */
  offlineOverride?: "allow" | "cached";
  /** While true, all calls are denied until init completes. */
  pendingInit?: boolean;
  /** Resolved agent identity for audit attribution. */
  agentId: string;
}

const KILL_SWITCH_DEFAULT_MESSAGE = "ClawForge: All tool calls blocked by organization kill switch";

export function createAgtToolEnforcerHook(
  runtime: AgtRuntime,
  state: AgtToolEnforcerState,
): (event: AgtBeforeToolCallEvent, ctx: AgtToolContext) => Promise<AgtToolCallResult | undefined> {
  return async (event, ctx) => {
    void ctx;

    if (state.pendingInit) {
      return { block: true, blockReason: "ClawForge: Plugin is still initializing. Please try again shortly." };
    }
    if (state.killSwitchActive) {
      return { block: true, blockReason: state.killSwitchMessage ?? KILL_SWITCH_DEFAULT_MESSAGE };
    }
    if (state.offlineOverride === "allow") {
      return undefined;
    }

    const decision = await runtime.evaluateToolCall(event.toolName, { args: event.params ?? {} });

    runtime.audit({
      agentId: state.agentId,
      action: event.toolName,
      decision: decision.allowed ? "allow" : "deny",
    });

    if (!decision.allowed) {
      const reason = decision.reason ?? decision.matchedRule ?? `Tool "${event.toolName}" denied by policy`;
      return { block: true, blockReason: `ClawForge: ${reason}` };
    }
    return undefined;
  };
}
