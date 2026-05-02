/**
 * ClawForge control plane API client for the admin console.
 */

import { clearAuth } from "@/lib/auth";
import { getApiBase } from "@/lib/runtime-config";

type FetchOptions = {
  method?: string;
  body?: unknown;
  token?: string;
};

export type AuditQueryFilters = {
  userId?: string;
  eventType?: string;
  toolName?: string;
  outcome?: string;
  from?: string;
  to?: string;
  limit?: string;
};

async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body) {
    headers["Content-Type"] = "application/json";
  }
  if (opts.token) {
    headers.Authorization = `Bearer ${opts.token}`;
  }

  const response = await fetch(`${getApiBase()}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (response.status === 401 && opts.token) {
    clearAuth();
    if (typeof window !== "undefined") {
      window.location.replace("/login?expired=1");
    }
    throw new Error("Session expired");
  }

  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try {
      const json = JSON.parse(text);
      message = json.error || json.message || text;
    } catch {
      // not JSON, use raw text
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

// --- Auth ---

export function login(email: string, password: string) {
  return apiFetch<{
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    userId: string;
    orgId: string;
    email: string;
    roles: string[];
  }>("/api/v1/auth/login", {
    method: "POST",
    body: { email, password },
  });
}

export function changePassword(token: string, body: { currentPassword: string; newPassword: string }) {
  return apiFetch<{ success: boolean }>("/api/v1/auth/change-password", {
    method: "POST",
    token,
    body,
  });
}

// --- Policies ---

export type EffectivePolicy = {
  version: number;
  tools: { allow?: string[]; deny?: string[]; profile?: string };
  skills: {
    approved: Array<{ name: string; key: string; scope: string }>;
    requireApproval: boolean;
  };
  killSwitch: { active: boolean; message?: string };
  auditLevel: string;
};

export function getPolicy(orgId: string, token: string) {
  return apiFetch<EffectivePolicy>(`/api/v1/policies/${orgId}`, { token });
}

export function getEffectivePolicy(orgId: string, token: string) {
  return apiFetch<EffectivePolicy>(`/api/v1/policies/${orgId}/effective`, { token });
}

export function updatePolicy(orgId: string, token: string, body: unknown) {
  return apiFetch<{ status?: string; requestId?: string; message?: string; version?: number }>(
    `/api/v1/policies/${orgId}`,
    {
      method: "PUT",
      token,
      body,
    },
  );
}

export function setKillSwitch(orgId: string, token: string, active: boolean, message?: string) {
  return apiFetch(`/api/v1/policies/${orgId}/kill-switch`, {
    method: "PUT",
    token,
    body: { active, message },
  });
}

// --- Multiple Policies (#23) ---

export type PolicySummary = {
  id: string;
  name: string;
  isDefault: boolean;
  version: number;
  auditLevel: string;
  killSwitch: boolean;
  updatedAt: string;
};

export type PolicyAssignment = {
  id: string;
  policyId: string;
  userId?: string;
  role?: string;
  priority: number;
  createdAt: string;
};

export type PolicyChangeRequest = {
  id: string;
  orgId: string;
  policyId: string;
  changeType: "create" | "update" | "delete";
  status: "pending" | "approved" | "rejected";
  requestedBy: string;
  reviewedBy?: string;
  proposedChanges: Record<string, unknown>;
  beforeState?: Record<string, unknown>;
  rejectionReason?: string;
  reviewedAt?: string;
  createdAt: string;
};

export function listPolicies(orgId: string, token: string) {
  return apiFetch<{ policies: PolicySummary[] }>(`/api/v1/policies/${orgId}/list`, { token });
}

export function createPolicy(
  orgId: string,
  token: string,
  body: { name: string; isDefault?: boolean; toolsConfig?: unknown; skillsConfig?: unknown; auditLevel?: string },
) {
  return apiFetch<PolicySummary>(`/api/v1/policies/${orgId}`, { method: "POST", token, body });
}

export function clonePolicy(orgId: string, policyId: string, token: string, name: string) {
  return apiFetch<PolicySummary>(`/api/v1/policies/${orgId}/${policyId}/clone`, {
    method: "POST",
    token,
    body: { name },
  });
}

export function assignPolicy(orgId: string, policyId: string, token: string, body: { userId?: string; role?: string }) {
  return apiFetch<PolicyAssignment>(`/api/v1/policies/${orgId}/${policyId}/assign`, {
    method: "POST",
    token,
    body,
  });
}

export function getPolicyAssignments(orgId: string, policyId: string, token: string) {
  return apiFetch<{ assignments: PolicyAssignment[] }>(`/api/v1/policies/${orgId}/${policyId}/assignments`, { token });
}

export function removePolicyAssignment(orgId: string, assignmentId: string, token: string) {
  return apiFetch<{ success: boolean }>(`/api/v1/policies/${orgId}/assignments/${assignmentId}`, {
    method: "DELETE",
    token,
  });
}

export function listPolicyApprovals(
  orgId: string,
  token: string,
  status: "pending" | "approved" | "rejected" = "pending",
) {
  return apiFetch<{ requests: PolicyChangeRequest[] }>(`/api/v1/policies/${orgId}/approvals?status=${status}`, {
    token,
  });
}

export function approvePolicyChange(orgId: string, requestId: string, token: string) {
  return apiFetch<{ status: "approved" }>(`/api/v1/policies/${orgId}/approvals/${requestId}/approve`, {
    method: "POST",
    token,
  });
}

export function rejectPolicyChange(orgId: string, requestId: string, token: string, reason?: string) {
  return apiFetch<{ status: "rejected" }>(`/api/v1/policies/${orgId}/approvals/${requestId}/reject`, {
    method: "POST",
    token,
    body: { reason },
  });
}

// --- Skills ---

export type SkillSubmission = {
  id: string;
  skillName: string;
  skillKey?: string;
  metadata?: Record<string, unknown>;
  manifestContent?: string;
  scanResults?: {
    scannedFiles: number;
    critical: number;
    warn: number;
    info: number;
    findings: Array<{
      ruleId: string;
      severity: string;
      file: string;
      line: number;
      message: string;
      evidence: string;
    }>;
  };
  status: string;
  reviewNotes?: string;
  createdAt: string;
};

export type ApprovedSkill = {
  id: string;
  skillName: string;
  skillKey: string;
  scope: string;
  version: number;
  revokedAt?: string;
  createdAt: string;
};

export function getPendingSkills(orgId: string, token: string) {
  return apiFetch<{ submissions: SkillSubmission[] }>(`/api/v1/skills/${orgId}/review`, { token });
}

export function getApprovedSkills(orgId: string, token: string) {
  return apiFetch<{ skills: ApprovedSkill[] }>(`/api/v1/skills/${orgId}/approved`, { token });
}

export function reviewSkill(orgId: string, id: string, token: string, body: { status: string; reviewNotes?: string }) {
  return apiFetch(`/api/v1/skills/${orgId}/review/${id}`, {
    method: "PUT",
    token,
    body,
  });
}

export function revokeSkillApproval(orgId: string, skillId: string, token: string) {
  return apiFetch<{ success: boolean }>(`/api/v1/skills/${orgId}/approved/${skillId}`, {
    method: "DELETE",
    token,
  });
}

export function resubmitSkill(orgId: string, submissionId: string, token: string) {
  return apiFetch(`/api/v1/skills/${orgId}/review/${submissionId}/resubmit`, {
    method: "POST",
    token,
  });
}

export function getSkillHistory(orgId: string, token: string) {
  return apiFetch<{ skills: ApprovedSkill[] }>(`/api/v1/skills/${orgId}/approved/history`, { token });
}

// --- Audit ---

export type AuditEvent = {
  id: string;
  userId: string;
  eventType: string;
  toolName?: string;
  outcome: string;
  agentId?: string;
  sessionKey?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
};

export function queryAudit(orgId: string, token: string, params?: AuditQueryFilters) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return apiFetch<{ events: AuditEvent[]; total: number; nextCursor?: string }>(`/api/v1/audit/${orgId}/query${qs}`, {
    token,
  });
}

export async function exportAudit(orgId: string, token: string, format: "csv" | "json", params?: AuditQueryFilters) {
  const searchParams = new URLSearchParams({ ...(params ?? {}), format });
  const response = await fetch(`${getApiBase()}/api/v1/audit/${orgId}/export?${searchParams.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401) {
    clearAuth();
    if (typeof window !== "undefined") {
      window.location.replace("/login?expired=1");
    }
    throw new Error("Session expired");
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Export failed");
  }

  return {
    blob: await response.blob(),
    filename:
      response.headers.get("content-disposition")?.match(/filename="?([^";]+)"?/)?.[1] ??
      `audit-export.${format === "csv" ? "csv" : "ndjson"}`,
  };
}

export function getAuditEvent(orgId: string, eventId: string, token: string) {
  return apiFetch<{ event: AuditEvent }>(`/api/v1/audit/${orgId}/events/${eventId}`, { token });
}

export function deleteAuditRetention(orgId: string, token: string, retentionDays: number) {
  return apiFetch<{ deleted: number; cutoffDate: string }>(`/api/v1/audit/${orgId}/retention`, {
    method: "DELETE",
    token,
    body: { retentionDays },
  });
}

// --- Users ---

export type OrgUser = {
  id: string;
  email: string;
  name?: string;
  role: string;
  lastSeenAt?: string;
  createdAt: string;
};

export function getUsers(orgId: string, token: string) {
  return apiFetch<{ users: OrgUser[] }>(`/api/v1/users/${orgId}`, { token });
}

// --- Enrollment Tokens ---

export type EnrollmentToken = {
  id: string;
  token: string;
  label?: string;
  expiresAt?: string;
  maxUses?: number;
  usedCount: number;
  revokedAt?: string;
  createdAt: string;
};

export function getEnrollmentTokens(orgId: string, token: string) {
  return apiFetch<{ tokens: EnrollmentToken[] }>(`/api/v1/enrollment-tokens/${orgId}`, { token });
}

export function createEnrollmentToken(
  orgId: string,
  token: string,
  body: { label?: string; expiresAt?: string; maxUses?: number },
) {
  return apiFetch<EnrollmentToken>(`/api/v1/enrollment-tokens/${orgId}`, {
    method: "POST",
    token,
    body,
  });
}

export function revokeEnrollmentToken(orgId: string, tokenId: string, token: string) {
  return apiFetch(`/api/v1/enrollment-tokens/${orgId}/${tokenId}`, {
    method: "DELETE",
    token,
  });
}

// --- User Management ---

export function createUser(
  orgId: string,
  token: string,
  body: { email: string; name?: string; role?: string; password?: string },
) {
  return apiFetch<{ user: OrgUser }>(`/api/v1/users/${orgId}`, {
    method: "POST",
    token,
    body,
  });
}

export function updateUser(orgId: string, userId: string, token: string, body: { name?: string; role?: string }) {
  return apiFetch<{ user: OrgUser }>(`/api/v1/users/${orgId}/${userId}`, {
    method: "PUT",
    token,
    body,
  });
}

export function deleteUser(orgId: string, userId: string, token: string) {
  return apiFetch(`/api/v1/users/${orgId}/${userId}`, {
    method: "DELETE",
    token,
  });
}

export function resetUserPassword(orgId: string, userId: string, token: string, password: string) {
  return apiFetch(`/api/v1/users/${orgId}/${userId}/password`, {
    method: "PUT",
    token,
    body: { password },
  });
}

// --- Organizations ---

export type Organization = {
  id: string;
  name: string;
  ssoConfig?: {
    issuerUrl: string;
    clientId: string;
    audience?: string;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export function getOrganization(orgId: string, token: string) {
  return apiFetch<{ organization: Organization }>(`/api/v1/organizations/${orgId}`, { token });
}

export function updateOrganization(
  orgId: string,
  token: string,
  body: {
    name?: string;
    ssoConfig?: { issuerUrl: string; clientId: string; audience?: string } | null;
  },
) {
  return apiFetch<{ organization: Organization }>(`/api/v1/organizations/${orgId}`, {
    method: "PUT",
    token,
    body,
  });
}

// --- Org Settings (#45) ---

export type OrgSettings = {
  auditRetentionDays?: number;
  heartbeatOnlineThresholdMs?: number;
  heartbeatOfflineThresholdMs?: number;
  defaultNewUserRole?: "admin" | "viewer" | "user";
  killSwitchDefaultMessage?: string;
};

export function getOrgSettings(orgId: string, token: string) {
  return apiFetch<{ settings: OrgSettings }>(`/api/v1/organizations/${orgId}/settings`, { token });
}

export function updateOrgSettings(orgId: string, token: string, body: Partial<OrgSettings>) {
  return apiFetch<{ settings: OrgSettings }>(`/api/v1/organizations/${orgId}/settings`, {
    method: "PUT",
    token,
    body,
  });
}

// --- API Keys (#44) ---

export type ApiKey = {
  id: string;
  name: string;
  keyPrefix: string;
  role: string;
  expiresAt?: string;
  ipAllowlist?: string[];
  lastUsedAt?: string;
  createdAt: string;
  key?: string; // Only present on creation
};

export function getApiKeys(orgId: string, token: string) {
  return apiFetch<{ apiKeys: ApiKey[] }>(`/api/v1/api-keys/${orgId}`, { token });
}

export function createApiKey(
  orgId: string,
  token: string,
  body: { name: string; role?: string; expiresAt?: string; ipAllowlist?: string[] },
) {
  return apiFetch<ApiKey>(`/api/v1/api-keys/${orgId}`, {
    method: "POST",
    token,
    body,
  });
}

export function revokeApiKey(orgId: string, keyId: string, token: string) {
  return apiFetch<{ success: boolean }>(`/api/v1/api-keys/${orgId}/${keyId}`, {
    method: "DELETE",
    token,
  });
}

// --- Audit Stats (#39) ---

export type AuditStats = {
  eventCount: number;
  oldestEvent: string | null;
  newestEvent: string | null;
  retentionDays: number | null;
};

export function getAuditStats(orgId: string, token: string) {
  return apiFetch<AuditStats>(`/api/v1/audit/${orgId}/stats`, { token });
}

// --- Connected Clients ---

export type ConnectedClient = {
  userId: string;
  email: string;
  name?: string;
  role: string;
  lastHeartbeatAt: string;
  clientVersion?: string;
  status: "online" | "offline";
};

export type ClientsSummary = {
  total: number;
  online: number;
  offline: number;
};

export function getConnectedClients(orgId: string, token: string) {
  return apiFetch<{ clients: ConnectedClient[]; summary: ClientsSummary }>(`/api/v1/heartbeat/${orgId}`, { token });
}

// --- Roles (#61) ---

export type Permission = {
  name: string;
  resource: string;
  action: string;
  description: string;
};

export type Role = {
  id: string;
  name: string;
  description?: string;
  isBuiltIn: boolean;
  permissions: string[];
};

export function getRoles(orgId: string, token: string) {
  return apiFetch<{ roles: Role[] }>(`/api/v1/roles/${orgId}`, { token });
}

export function getPermissions(orgId: string, token: string) {
  return apiFetch<{ permissions: Permission[] }>(`/api/v1/roles/${orgId}/permissions`, { token });
}

// --- DLP (#66) ---

export type DlpRule = {
  name: string;
  pattern: string;
  action: "block" | "warn" | "log";
  severity: "critical" | "high" | "medium" | "info";
  category?: string;
  enabled?: boolean;
  message?: string;
};

export function getBuiltinDlpRules(token: string) {
  return apiFetch<{ rules: DlpRule[]; categories: string[] }>("/api/v1/policies/dlp/builtin-rules", { token });
}

// --- Alerts (#51) ---

export type AlertRule = {
  id: string;
  name: string;
  description?: string;
  ruleType: string;
  enabled: boolean;
  config: Record<string, unknown>;
  severity: string;
  webhookUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export type Alert = {
  id: string;
  ruleId: string;
  userId?: string;
  severity: string;
  status: "open" | "acknowledged" | "resolved";
  title: string;
  details?: Record<string, unknown>;
  relatedEventIds?: string[];
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
};

export type AlertStats = {
  total: number;
  open: number;
  acknowledged: number;
  resolved: number;
  critical: number;
  high: number;
};

export function getAlertRules(orgId: string, token: string) {
  return apiFetch<{ rules: AlertRule[] }>(`/api/v1/alerts/${orgId}/rules`, { token });
}

export function createAlertRule(
  orgId: string,
  token: string,
  body: {
    name: string;
    description?: string;
    ruleType: string;
    config: Record<string, unknown>;
    severity?: string;
    webhookUrl?: string;
    enabled?: boolean;
  },
) {
  return apiFetch<AlertRule>(`/api/v1/alerts/${orgId}/rules`, { method: "POST", token, body });
}

export function updateAlertRule(orgId: string, ruleId: string, token: string, body: Record<string, unknown>) {
  return apiFetch<AlertRule>(`/api/v1/alerts/${orgId}/rules/${ruleId}`, { method: "PUT", token, body });
}

export function deleteAlertRule(orgId: string, ruleId: string, token: string) {
  return apiFetch<{ success: boolean }>(`/api/v1/alerts/${orgId}/rules/${ruleId}`, { method: "DELETE", token });
}

export function getAlerts(orgId: string, token: string, params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return apiFetch<{ alerts: Alert[] }>(`/api/v1/alerts/${orgId}${qs}`, { token });
}

export function getAlertStats(orgId: string, token: string) {
  return apiFetch<AlertStats>(`/api/v1/alerts/${orgId}/stats`, { token });
}

export function acknowledgeAlert(orgId: string, alertId: string, token: string) {
  return apiFetch<Alert>(`/api/v1/alerts/${orgId}/${alertId}/acknowledge`, { method: "PUT", token });
}

export function resolveAlert(orgId: string, alertId: string, token: string) {
  return apiFetch<Alert>(`/api/v1/alerts/${orgId}/${alertId}/resolve`, { method: "PUT", token });
}

export function evaluateAlertRules(orgId: string, token: string) {
  return apiFetch<{ alertsCreated: number }>(`/api/v1/alerts/${orgId}/evaluate`, { method: "POST", token });
}

// --- Webhooks (#43) ---

export type Webhook = {
  id: string;
  orgId: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WebhookDelivery = {
  id: string;
  webhookId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: "pending" | "success" | "failed";
  responseCode?: number;
  responseBody?: string;
  latencyMs?: number;
  attempt: number;
  createdAt: string;
};

export function getWebhooks(orgId: string, token: string) {
  return apiFetch<{ webhooks: Webhook[]; eventTypes: string[] }>(`/api/v1/webhooks/${orgId}`, { token });
}

export function createWebhook(
  orgId: string,
  token: string,
  body: { name: string; url: string; secret: string; events: string[]; enabled?: boolean },
) {
  return apiFetch<Webhook>(`/api/v1/webhooks/${orgId}`, { method: "POST", token, body });
}

export function updateWebhook(
  orgId: string,
  webhookId: string,
  token: string,
  body: { name?: string; url?: string; secret?: string; events?: string[]; enabled?: boolean },
) {
  return apiFetch<Webhook>(`/api/v1/webhooks/${orgId}/${webhookId}`, { method: "PUT", token, body });
}

export function deleteWebhook(orgId: string, webhookId: string, token: string) {
  return apiFetch<{ success: boolean }>(`/api/v1/webhooks/${orgId}/${webhookId}`, { method: "DELETE", token });
}

export function testWebhook(orgId: string, webhookId: string, token: string) {
  return apiFetch<{ success: boolean; statusCode?: number; latencyMs?: number }>(
    `/api/v1/webhooks/${orgId}/${webhookId}/test`,
    { method: "POST", token },
  );
}

export function getWebhookDeliveries(orgId: string, webhookId: string, token: string) {
  return apiFetch<{ deliveries: WebhookDelivery[] }>(`/api/v1/webhooks/${orgId}/${webhookId}/deliveries`, { token });
}
