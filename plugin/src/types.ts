/**
 * Shared types for the ClawForge enterprise governance plugin.
 */

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
  | "policy_refresh";

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
