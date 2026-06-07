import type { ActionKind, RiskTier } from "@clawforgeai/contracts";

/**
 * Action taxonomy helpers. The canonical enums live in `@clawforgeai/contracts`
 * (`ActionKind`, `RiskTier`); this module classifies actions into tiers and
 * exposes the inverse mapping that admins surface in the policy UI.
 */

/**
 * Default risk-tier mapping for normalized actions. Conservative bias —
 * shell, repo pushes, and secret access default to "high"; file reads /
 * tool calls default to "low".
 *
 * Adapters can override per-action by passing a `riskTier` on `Action`;
 * this map is only the fallback.
 */
export const DEFAULT_ACTION_RISK: Record<ActionKind, RiskTier> = {
  tool_call: "low",
  file_read: "low",
  file_write: "medium",
  network_request: "medium",
  mcp_call: "medium",
  shell_exec: "high",
  repo_push: "high",
  secret_access: "critical",
};

export function classifyRisk(kind: ActionKind, override?: RiskTier): RiskTier {
  return override ?? DEFAULT_ACTION_RISK[kind];
}

/** Risk tier ordering used by both UIs and policy filters. */
export const RISK_TIER_ORDER: readonly RiskTier[] = ["low", "medium", "high", "critical"];

export function compareRiskTier(a: RiskTier, b: RiskTier): number {
  return RISK_TIER_ORDER.indexOf(a) - RISK_TIER_ORDER.indexOf(b);
}
