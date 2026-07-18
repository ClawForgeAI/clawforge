/**
 * AGT-canonical API client functions for the admin Tier 1 pages
 * (Cut 1 step 9 — addendum §A18). Sits alongside the legacy api.ts
 * which keeps serving the OrgPolicy / AuditEvent shapes.
 */

import { clearAuth } from "@/lib/auth";
import { getApiBase } from "@/lib/runtime-config";

type FetchOptions = {
  method?: string;
  body?: unknown;
  token: string;
  responseType?: "json" | "text";
};

async function agtFetch<T>(path: string, opts: FetchOptions): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${opts.token}` };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.responseType !== "text") headers["Accept"] = "application/json";

  const response = await fetch(`${getApiBase()}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (response.status === 401) {
    clearAuth();
    if (typeof window !== "undefined") window.location.replace("/login?expired=1");
    throw new Error("Session expired");
  }
  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try {
      const json = JSON.parse(text);
      message = json.error || json.message || text;
    } catch {
      /* not JSON */
    }
    throw new Error(message);
  }

  if (opts.responseType === "text") return (await response.text()) as unknown as T;
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

// ---------- Policies ----------

export interface AgtPolicySummary {
  id: string;
  name: string;
  version: number;
  schemaVersion: string | null;
  agt: boolean;
  createdAt: string;
  updatedAt: string;
}

export function listAgtPolicies(token: string) {
  return agtFetch<{ policies: AgtPolicySummary[] }>("/api/v1/policies", { token });
}

export function createAgtPolicy(token: string, body: { name: string; yamlSource: string }) {
  return agtFetch<{ id: string; name: string; version: number; createdAt: string }>("/api/v1/policies", {
    method: "POST",
    body,
    token,
  });
}

export function getEffectiveAgtYaml(token: string, agentDid: string) {
  return agtFetch<string>(`/api/v1/policies/effective?agentDid=${encodeURIComponent(agentDid)}`, {
    token,
    responseType: "text",
  });
}

export interface AgtEvaluateResult {
  allowed: boolean;
  action: string;
  matchedRule?: string;
  policyName?: string;
  reason?: string;
  approvers: string[];
  rateLimited: boolean;
  evaluatedAt: string;
}

export function evaluateAgtPolicy(
  token: string,
  body: { agentDid: string; action: string; context?: Record<string, unknown>; policyYaml?: string },
) {
  return agtFetch<AgtEvaluateResult>("/api/v1/policies/evaluate", { method: "POST", body, token });
}

// ---------- Dashboard ----------

export interface AgtDashboardStats {
  allowedCount: number;
  deniedCount: number;
  pendingApprovals: number;
}

export function getDashboardStats(token: string) {
  return agtFetch<AgtDashboardStats>("/api/v1/dashboard/stats", { token });
}

// ---------- Audit ----------

export interface AgtAuditEntry {
  chainSeq: string;
  timestamp: string;
  agentId: string;
  action: string;
  decision: "allow" | "deny" | "review";
  hash: string;
  previousHash: string;
  policyName: string | null;
  policyVersion: number | null;
  matchedRule: string | null;
}

export function listAgtAuditEntries(
  token: string,
  orgId: string,
  params?: { limit?: number; beforeSeq?: string; agentDid?: string },
) {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.beforeSeq) qs.set("beforeSeq", params.beforeSeq);
  if (params?.agentDid) qs.set("agentDid", params.agentDid);
  const q = qs.toString();
  return agtFetch<{ entries: AgtAuditEntry[]; nextBeforeSeq: string | null }>(
    `/api/v1/audit/${orgId}/entries${q ? `?${q}` : ""}`,
    { token },
  );
}

export function verifyAgtAuditChain(token: string, orgId: string) {
  return agtFetch<{ valid: boolean; entriesChecked: number; breakAt?: string }>(`/api/v1/audit/${orgId}/verify`, {
    method: "POST",
    token,
  });
}

// ---------- Approvals ----------

export interface AgtApproval {
  id: string;
  agentDid: string | null;
  actionType: "skill_load" | "policy_change" | "tool_call" | "delegation";
  target: string | null;
  payload: Record<string, unknown>;
  status: "pending" | "approved" | "denied" | "expired";
  requiredApprovers: string[];
  decisions: Array<{ decidedBy: string; decision: "approved" | "denied"; comment?: string; decidedAt: string }>;
  obligations: Record<string, unknown> | null;
  requestedAt: string;
  decidedAt: string | null;
  expiresAt: string | null;
}

export function listAgtApprovals(
  token: string,
  params?: { status?: AgtApproval["status"]; actionType?: AgtApproval["actionType"] },
) {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.actionType) qs.set("actionType", params.actionType);
  const q = qs.toString();
  return agtFetch<{ approvals: AgtApproval[] }>(`/api/v1/approvals${q ? `?${q}` : ""}`, { token });
}

export function decideAgtApproval(
  token: string,
  id: string,
  body: { decision: "approved" | "denied"; comment?: string },
) {
  return agtFetch<AgtApproval>(`/api/v1/approvals/${id}/decision`, { method: "PUT", body, token });
}
