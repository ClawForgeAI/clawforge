import { z } from "zod";
import { OrgId, UserId, Uuid, Iso } from "./common.js";

/** Identifies which runtime the adapter governs. */
export const RuntimeKind = z.enum(["openclaw", "claude-code", "codex", "custom"]);
export type RuntimeKind = z.infer<typeof RuntimeKind>;

/**
 * Static metadata an adapter declares when it joins the control plane.
 * `capabilities` are the ones the runtime supports today — they let the
 * server short-circuit features the runtime can't honor (e.g. pre-tool
 * hooks for SDK-only runtimes).
 */
export const RuntimeRegistration = z.object({
  runtimeKind: RuntimeKind,
  runtimeVersion: z.string(),
  adapterVersion: z.string(),
  capabilities: z.object({
    preToolHooks: z.boolean(),
    sse: z.boolean(),
    artifacts: z.boolean(),
    approvals: z.boolean(),
  }),
  registeredAt: Iso,
});
export type RuntimeRegistration = z.infer<typeof RuntimeRegistration>;

/**
 * One running adapter instance — typically one per (user, device, runtime).
 * `deviceId` and `runnerId` are mutually optional: laptop-installed agents
 * report a `deviceId`, hosted runners report a `runnerId`, custom service
 * agents may report neither.
 */
export const AgentInstance = z.object({
  agentInstanceId: Uuid,
  orgId: OrgId,
  runtimeKind: RuntimeKind,
  deviceId: z.string().optional(),
  runnerId: z.string().optional(),
  userId: UserId,
  registration: RuntimeRegistration,
  enrolledAt: Iso,
});
export type AgentInstance = z.infer<typeof AgentInstance>;

export const RunStatus = z.enum(["starting", "running", "paused", "completed", "failed", "cancelled"]);
export type RunStatus = z.infer<typeof RunStatus>;

export const Run = z.object({
  runId: Uuid,
  agentInstanceId: Uuid,
  orgId: OrgId,
  userId: UserId,
  status: RunStatus,
  startedAt: Iso,
  endedAt: Iso.optional(),
  parentRunId: Uuid.optional(),
  policyVersionAtStart: z.number().int(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type Run = z.infer<typeof Run>;

/**
 * Action taxonomy normalized across runtimes. `tool_call` is the legacy entry
 * for compatibility with the OpenClaw plugin's existing `tool_call_attempt`
 * audit events; the more specific kinds (shell_exec, file_*, network_request)
 * are used by the platform when adapters can supply that detail.
 */
export const ActionKind = z.enum([
  "tool_call",
  "shell_exec",
  "file_read",
  "file_write",
  "network_request",
  "mcp_call",
  "repo_push",
  "secret_access",
]);
export type ActionKind = z.infer<typeof ActionKind>;

export const RiskTier = z.enum(["low", "medium", "high", "critical"]);
export type RiskTier = z.infer<typeof RiskTier>;

export const Action = z.object({
  actionId: Uuid,
  runId: Uuid,
  kind: ActionKind,
  toolName: z.string().optional(),
  args: z.record(z.string(), z.unknown()).optional(),
  requestedAt: Iso,
  riskTier: RiskTier.optional(),
});
export type Action = z.infer<typeof Action>;
