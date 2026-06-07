/**
 * AGT integration entry point for the OpenClaw plugin (Cut 1 step 8).
 *
 * Wires `@clawforgeai/client`'s `Clawforge.connect()` into the plugin so the
 * `before_tool_call` hook can evaluate policies via the AGT-backed engine and
 * stream hash-chained audit entries to the control plane.
 *
 * Coexists with the legacy `policy/tool-enforcer.ts` and `audit/audit-logger.ts`
 * — plugin authors opt in by calling `createAgtBackedRuntime(config)` from
 * their plugin bootstrap. The legacy path remains the default until step 10.
 */

import { Clawforge, type ClawforgeConnectOptions, ClawforgeDenied, type KillSwitchEvent } from "@clawforgeai/client";
import type { PolicyDecisionResult } from "@clawforgeai/policy-schema";

export interface AgtRuntimeConfig {
  /** Required. Same shape as `Clawforge.connect()` — url / token / agentDid. */
  connect: ClawforgeConnectOptions;
  /** Optional kill-switch handler. Default: log to console. */
  onKillSwitch?: (event: KillSwitchEvent) => void | Promise<void>;
}

export interface AgtRuntime {
  /** The connected Clawforge client. Inspect `.agt.*` for the AGT primitives. */
  client: Clawforge;
  /**
   * Evaluate a tool call against the live policy. Returns the AGT
   * `PolicyDecisionResult`. Audit emission is left to the caller so the
   * plugin's existing audit metadata can be preserved.
   */
  evaluateToolCall(action: string, context?: Record<string, unknown>): Promise<PolicyDecisionResult>;
  /** Append an entry to the AGT hash-chained audit stream. */
  audit(entry: { agentId: string; action: string; decision: "allow" | "deny" | "review" }): void;
  /** Tear down — flushes audit batcher, closes kill-switch source. */
  disconnect(): Promise<void>;
}

/**
 * Build an AGT-backed runtime for the plugin's `before_tool_call` hook.
 *
 * Usage from a plugin bootstrap:
 *
 *   const runtime = await createAgtBackedRuntime({
 *     connect: { url, token, agentDid },
 *     onKillSwitch: (e) => stopAcceptingTools(e),
 *   });
 *   api.registerHook("before_tool_call", async (event) => {
 *     const decision = await runtime.evaluateToolCall(event.toolName, { args: event.params });
 *     runtime.audit({ agentId, action: event.toolName, decision: decision.allowed ? "allow" : "deny" });
 *     if (!decision.allowed) return { block: true, blockReason: decision.reason ?? "policy denied" };
 *     return undefined;
 *   });
 */
export async function createAgtBackedRuntime(config: AgtRuntimeConfig): Promise<AgtRuntime> {
  const client = await Clawforge.connect(config.connect);

  if (config.onKillSwitch) {
    client.onKillSwitch(config.onKillSwitch);
  } else {
    client.onKillSwitch((event) => {
      if (event.active) {
        console.warn(`[clawforge] kill switch activated (${event.scope}): ${event.reason ?? "no reason given"}`);
      }
    });
  }

  return {
    client,
    evaluateToolCall: (action, context) => client.evaluate(action, context ?? {}),
    audit: (entry) => {
      client.audit(entry);
    },
    disconnect: () => client.disconnect(),
  };
}

export { Clawforge, ClawforgeDenied };
export type { ClawforgeConnectOptions, KillSwitchEvent, PolicyDecisionResult };
