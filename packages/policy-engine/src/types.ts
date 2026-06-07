import type { DlpScanResult, OrgPolicy } from "@clawforgeai/contracts";

export type PolicyOutcome = "allow" | "deny";

/**
 * Why the policy engine arrived at its decision. Mirrors the audit-log
 * reason strings emitted by the plugin's tool-enforcer hook so that
 * existing audit consumers see no behavior change after the extraction.
 */
export type PolicyDecisionReason =
  | "pending_init"
  | "kill_switch"
  | "offline_allow_mode"
  | "no_policy"
  | "deny_list"
  | "fs_deny_exec"
  | "not_in_allowlist"
  | "dlp_block"
  | "dlp_violation_allowed"
  | "allowed";

/**
 * Offline mode in effect at the moment of evaluation. Surfaced separately
 * from `reason` so callers can compose audit metadata (e.g. the plugin
 * suffixes "(offline_cached_mode)" onto reason strings).
 */
export type PolicyEvaluationMode = "offline_cached_mode";

export interface PolicyDecision {
  outcome: PolicyOutcome;
  reason: PolicyDecisionReason;
  mode?: PolicyEvaluationMode;
  /** Shell command string that triggered fs_deny_exec, for audit context. */
  blockedCommand?: string;
  /** DLP scan result if a scan ran. Present on both allow and deny outcomes. */
  dlp?: DlpScanResult;
  /**
   * User-facing block reason. Stable wording matching the plugin's previous
   * messages — surfaced via `PluginHookBeforeToolCallResult.blockReason`.
   * Only set when `outcome === "deny"`.
   */
  blockMessage?: string;
}

export interface PolicyEvaluationContext {
  policy: OrgPolicy | null;
  killSwitchActive: boolean;
  killSwitchMessage?: string;
  /**
   * Offline override set by the KillSwitchManager when the failure threshold
   * is reached. `undefined` means normal enforcement.
   */
  offlineOverride?: "allow" | "cached";
  /**
   * True while initializeClawForge() is still running. When true and no
   * policy is cached, every tool call is blocked as a safe-mode default.
   */
  pendingInit?: boolean;
}

export interface ToolCallEvaluationInput {
  /** Tool name as received from the runtime (may need normalization, e.g. "bash"). */
  rawToolName: string;
  params: Record<string, unknown>;
}
