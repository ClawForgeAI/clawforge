/**
 * Shared types for the ClawForge enterprise governance plugin.
 */

export type DlpAction = "block" | "warn" | "log";
export type DlpSeverity = "critical" | "high" | "medium" | "info";

export type DlpRule = {
  name: string;
  pattern: string;
  action: DlpAction;
  severity: DlpSeverity;
  /** Optional category for grouping (e.g., "PCI", "HIPAA", "PII", "Secrets") */
  category?: string;
  /** Whether the rule is enabled. Defaults to true if omitted. */
  enabled?: boolean;
  /** Custom message shown when the rule triggers. */
  message?: string;
};

export type DlpViolation = {
  ruleName: string;
  action: DlpAction;
  severity: DlpSeverity;
  /** Redacted snippet showing where the match occurred (sensitive data replaced with ***) */
  redactedContext: string;
  category?: string;
};

export type DlpScanResult = {
  violations: DlpViolation[];
  /** Overall action to take: the most restrictive action among all violations */
  effectiveAction: DlpAction | null;
  scannedFields: number;
};

export type OrgPolicy = {
  version: number;
  tools: {
    allow?: string[];
    deny?: string[];
    profile?: string;
  };
  skills: {
    approved: ApprovedSkill[];
    requireApproval: boolean;
  };
  killSwitch: {
    active: boolean;
    message?: string;
  };
  auditLevel: "full" | "metadata" | "off";
  dlpRules?: DlpRule[];
};

export type ApprovedSkill = {
  name: string;
  key: string;
  scope: "org" | "self";
};

export type HeartbeatResponse = {
  policyVersion: number;
  killSwitch: boolean;
  killSwitchMessage?: string;
  refreshPolicyNow: boolean;
};

export type AuditEvent = {
  userId: string;
  orgId: string;
  agentId?: string;
  sessionKey?: string;
  eventType: AuditEventType;
  toolName?: string;
  timestamp: number;
  outcome: "allowed" | "blocked" | "error" | "success";
  metadata?: Record<string, unknown>;
};

export type AuditEventType =
  | "tool_call_attempt"
  | "tool_call_result"
  | "session_start"
  | "session_end"
  | "llm_input"
  | "llm_output"
  | "kill_switch_activated"
  | "policy_refresh"
  | "dlp_violation";

export type OfflineMode = "block" | "allow" | "cached";

export type ClawForgePluginConfig = {
  controlPlaneUrl?: string;
  orgId?: string;
  sso?: {
    issuerUrl?: string;
    clientId?: string;
  };
  policyCacheTtlMs?: number;
  heartbeatIntervalMs?: number;
  heartbeatFailureThreshold?: number;
  auditBatchSize?: number;
  auditFlushIntervalMs?: number;
  offlineMode?: OfflineMode; // default: 'block'
  maxAuditBufferSize?: number; // default: 10000
  /** Enable real-time SSE connection for instant kill switch and policy updates. Defaults to true. */
  sseEnabled?: boolean;
};

export type SessionTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  userId: string;
  orgId: string;
  email?: string;
  roles?: string[];
};

export type CachedPolicy = {
  policy: OrgPolicy;
  fetchedAt: number;
  ttlMs: number;
};
