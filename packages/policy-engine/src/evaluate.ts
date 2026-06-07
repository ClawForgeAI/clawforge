import type { OrgPolicy } from "@clawforgeai/contracts";
import {
  expandGroups,
  isExecBlockedByFsDeny,
  normalizeToolName,
  scanToolArguments,
} from "@clawforgeai/tool-governance";
import type { PolicyDecision, PolicyEvaluationContext, ToolCallEvaluationInput } from "./types.js";

const KILL_SWITCH_DEFAULT_MESSAGE = "ClawForge: All tool calls blocked by organization kill switch";

/**
 * Evaluate a single tool call against the current policy and runtime state.
 *
 * Pure function — no I/O, no logging. Callers (plugin hook, stateless
 * enforce endpoint, admin preview) decide what to do with the decision.
 *
 * Precedence order (matches the legacy `plugin/src/policy/tool-enforcer.ts`
 * exactly — covered by snapshot tests against the existing plugin suite):
 *   1. pendingInit + no policy -> deny pending_init
 *   2. killSwitchActive       -> deny kill_switch (overrides offline mode)
 *   3. offlineOverride='allow' -> allow offline_allow_mode
 *   4. offlineOverride='cached'-> evaluate against cached policy, mode tagged
 *   5. normal policy evaluation
 */
export function evaluateToolCall(ctx: PolicyEvaluationContext, input: ToolCallEvaluationInput): PolicyDecision {
  const toolName = normalizeToolName(input.rawToolName);

  if (ctx.pendingInit && !ctx.policy) {
    return {
      outcome: "deny",
      reason: "pending_init",
      blockMessage: "ClawForge: Plugin is still initializing. Please try again shortly.",
    };
  }

  if (ctx.killSwitchActive) {
    return {
      outcome: "deny",
      reason: "kill_switch",
      blockMessage: ctx.killSwitchMessage ?? KILL_SWITCH_DEFAULT_MESSAGE,
    };
  }

  if (ctx.offlineOverride === "allow") {
    return { outcome: "allow", reason: "offline_allow_mode" };
  }

  const mode = ctx.offlineOverride === "cached" ? ("offline_cached_mode" as const) : undefined;
  return evaluatePolicy(ctx.policy, toolName, input, mode);
}

function evaluatePolicy(
  policy: OrgPolicy | null,
  toolName: string,
  input: ToolCallEvaluationInput,
  mode: "offline_cached_mode" | undefined,
): PolicyDecision {
  if (!policy) {
    return { outcome: "allow", reason: "no_policy", mode };
  }

  if (policy.tools.deny && policy.tools.deny.length > 0) {
    const denySet = expandGroups(policy.tools.deny);

    if (denySet.has(toolName)) {
      return {
        outcome: "deny",
        reason: "deny_list",
        mode,
        blockMessage: `ClawForge: Tool "${input.rawToolName}" is blocked by organization policy`,
      };
    }

    if (toolName === "exec" && isExecBlockedByFsDeny(denySet, input.params)) {
      const command = (input.params.command ?? input.params.cmd ?? "") as string;
      return {
        outcome: "deny",
        reason: "fs_deny_exec",
        mode,
        blockedCommand: command,
        blockMessage: "ClawForge: Shell command blocked — filesystem access is denied by organization policy",
      };
    }
  }

  if (policy.tools.allow && policy.tools.allow.length > 0) {
    const allowSet = expandGroups(policy.tools.allow);
    if (!allowSet.has(toolName)) {
      return {
        outcome: "deny",
        reason: "not_in_allowlist",
        mode,
        blockMessage: `ClawForge: Tool "${input.rawToolName}" is not in the organization's allowed tools list`,
      };
    }
  }

  if (policy.dlpRules && policy.dlpRules.length > 0) {
    const dlpResult = scanToolArguments(policy.dlpRules, input.params);

    if (dlpResult.violations.length > 0) {
      if (dlpResult.effectiveAction === "block") {
        const blockingRules = dlpResult.violations.filter((v) => v.action === "block");
        const ruleNames = blockingRules.map((v) => v.ruleName).join(", ");
        return {
          outcome: "deny",
          reason: "dlp_block",
          mode,
          dlp: dlpResult,
          blockMessage: `ClawForge DLP: Tool call blocked — sensitive data detected (rules: ${ruleNames})`,
        };
      }

      return {
        outcome: "allow",
        reason: "dlp_violation_allowed",
        mode,
        dlp: dlpResult,
      };
    }
  }

  return { outcome: "allow", reason: "allowed", mode };
}
