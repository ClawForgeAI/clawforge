/**
 * ClawForge control plane API client for the admin console.
 */

import { clearAuth } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";

type FetchOptions = {
  method?: string;
  body?: unknown;
  token?: string;
};

async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (opts.token) {
    headers.Authorization = `Bearer ${opts.token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (response.status === 401) {
    clearAuth();
    window.location.href = "/login?expired=1";
    throw new Error("Session expired");
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error (${response.status}): ${text}`);
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
  return apiFetch(`/api/v1/policies/${orgId}`, { method: "PUT", token, body });
}

export function setKillSwitch(orgId: string, token: string, active: boolean, message?: string) {
  return apiFetch(`/api/v1/policies/${orgId}/kill-switch`, {
    method: "PUT",
    token,
    body: { active, message },
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
  return apiFetch<{ skills: ApprovedSkill[] }>(
    `/api/v1/skills/${orgId}/approved`,
    { token },
  );
}

export function reviewSkill(
  orgId: string,
  id: string,
  token: string,
  body: { status: string; reviewNotes?: string },
) {
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

export function queryAudit(orgId: string, token: string, params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return apiFetch<{ events: AuditEvent[]; total: number; nextCursor?: string }>(`/api/v1/audit/${orgId}/query${qs}`, { token });
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

export function updateUser(
  orgId: string,
  userId: string,
  token: string,
  body: { name?: string; role?: string },
) {
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
  return apiFetch<{ clients: ConnectedClient[]; summary: ClientsSummary }>(
    `/api/v1/heartbeat/${orgId}`,
    { token },
  );
}
