/**
 * ClawForge Plugin SDK — Stable Public API
 *
 * This module defines the stable public types and interfaces for the ClawForge
 * plugin. These are the types that external consumers (other plugins, integrations,
 * and configuration tools) can depend on.
 *
 * **Stability guarantee**: Breaking changes to any export in this module require
 * a major version bump. New additions are minor version bumps.
 *
 * ## Public API Surface
 *
 * ### Configuration Types
 * - `ClawForgePluginConfig` — plugin configuration options
 * - `OfflineMode` — behavior when control plane is unreachable
 * - `SsoConfig` — SSO/OIDC configuration
 *
 * ### Policy Types
 * - `OrgPolicy` — organization policy returned by control plane
 * - `ApprovedSkill` — an approved skill entry
 * - `DlpRule` — DLP rule configuration
 * - `DlpAction` — DLP rule action (block/warn/log)
 * - `DlpSeverity` — DLP rule severity levels
 *
 * ### Session Types
 * - `SessionTokens` — authentication session data
 *
 * ### Event Types
 * - `AuditEventType` — enumeration of audit event types
 * - `HeartbeatResponse` — heartbeat response from control plane
 *
 * ### Security Scanner Types
 * - `SkillScanSeverity` — scan finding severity levels
 * - `SkillScanFinding` — individual scan finding
 * - `SkillScanSummary` — aggregated scan results
 * - `SkillScanOptions` — scanner configuration options
 *
 * ### Hook Registration Types
 * - `ClawForgeHookContext` — context passed to hook callbacks
 * - `BeforeToolCallHook` — hook function signature for before_tool_call
 * - `AfterToolCallHook` — hook function signature for after_tool_call
 * - `ToolEnforcementResult` — result of tool policy enforcement
 *
 * ## Internal (NOT part of public API)
 *
 * The following are internal implementation details and may change without notice:
 * - `ConnectionStateManager`, `ConnectionStatus`
 * - `AuditLogger` internals
 * - `KillSwitchManager` internals
 * - `SSEClient` internals
 * - `TokenRefreshManager` internals
 * - Policy cache internals (`loadCachedPolicy`, `saveCachedPolicy`)
 * - Token store internals (`loadSession`, `saveSession`)
 */

// ---------------------------------------------------------------------------
// Re-export stable types from types.ts
// ---------------------------------------------------------------------------

export type {
  ClawForgePluginConfig,
  OfflineMode,
  OrgPolicy,
  ApprovedSkill,
  DlpRule,
  DlpAction,
  DlpSeverity,
  DlpViolation,
  DlpScanResult,
  SessionTokens,
  AuditEventType,
  AuditEvent,
  HeartbeatResponse,
  CachedPolicy,
} from "./types.js";

// ---------------------------------------------------------------------------
// Re-export scanner types
// ---------------------------------------------------------------------------

export type {
  SkillScanSeverity,
  SkillScanFinding,
  SkillScanSummary,
  SkillScanOptions,
} from "./security/skill-scanner.js";

// ---------------------------------------------------------------------------
// Hook registration types (stable public API)
// ---------------------------------------------------------------------------

/**
 * SSO configuration for OIDC authentication.
 * Part of `ClawForgePluginConfig.sso`.
 */
export type SsoConfig = {
  /** OIDC issuer URL (e.g., https://auth.example.com) */
  issuerUrl?: string;
  /** OIDC client ID */
  clientId?: string;
};

/**
 * Context available to ClawForge hook callbacks.
 */
export type ClawForgeHookContext = {
  /** Agent identifier */
  agentId?: string;
  /** Session key for correlating events */
  sessionKey?: string;
  /** Organization ID */
  orgId: string;
  /** User ID */
  userId: string;
};

/**
 * Result of tool policy enforcement in the before_tool_call hook.
 */
export type ToolEnforcementResult = {
  /** Whether the tool call is allowed */
  allowed: boolean;
  /** Reason for blocking (if blocked) */
  reason?: string;
  /** Which enforcement mechanism triggered (policy, kill-switch, dlp, offline) */
  enforcedBy?: "policy" | "kill-switch" | "dlp" | "offline-mode";
  /** DLP violations if any */
  dlpViolations?: Array<{
    ruleName: string;
    action: "block" | "warn" | "log";
    severity: string;
    redactedContext: string;
  }>;
};

/**
 * Hook function signature for before_tool_call.
 *
 * Implement this to add custom logic before tool calls are processed.
 * Return `{ block: true, message: string }` to prevent the tool call.
 */
export type BeforeToolCallHook = (
  event: {
    toolName: string;
    args: Record<string, unknown>;
  },
  context: ClawForgeHookContext,
) => { block: boolean; message?: string } | void | Promise<{ block: boolean; message?: string } | void>;

/**
 * Hook function signature for after_tool_call.
 *
 * Implement this to add custom logic after tool calls complete.
 */
export type AfterToolCallHook = (
  event: {
    toolName: string;
    durationMs: number;
    error?: string;
  },
  context: ClawForgeHookContext,
) => void | Promise<void>;

/**
 * Plugin version information.
 */
export const SDK_VERSION = "0.2.0" as const;

/**
 * Minimum compatible control plane version.
 */
export const MIN_CONTROL_PLANE_VERSION = "0.1.0" as const;
