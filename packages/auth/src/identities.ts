/**
 * Identity separation per the strategy doc: humans, devices, hosted runners,
 * service accounts (API keys), and agent instances are different trust models.
 *
 * Today's server collapses everything into `AuthUser`. These types let
 * subsequent refactors split that out without touching the wire shape.
 *
 * Plain string aliases are used here intentionally — runtime ID validation
 * (non-empty etc.) lives in `@clawforgeai/contracts`; this package exposes
 * the corresponding TypeScript types for typed callers.
 */

export type HumanRole = "super_admin" | "admin" | "policy_admin" | "security_admin" | "viewer" | "user";

export const HUMAN_ROLES: readonly HumanRole[] = [
  "super_admin",
  "admin",
  "policy_admin",
  "security_admin",
  "viewer",
  "user",
];

export type HumanIdentity = {
  kind: "human";
  userId: string;
  orgId: string;
  email: string;
  role: HumanRole;
};

/**
 * A laptop or workstation an agent is installed on. `deviceId` is stable
 * across enrollments for the same machine; the plugin stores it in the
 * session file.
 */
export type DeviceIdentity = {
  kind: "device";
  deviceId: string;
  orgId: string;
  /** The human user who enrolled this device. */
  enrolledByUserId: string;
};

/**
 * A hosted runner (CI box, cloud sandbox, managed worker). Distinct from
 * `DeviceIdentity` because runners are typically multi-tenant and should
 * carry their own scoped credentials.
 */
export type RunnerIdentity = {
  kind: "runner";
  runnerId: string;
  orgId: string;
};

/**
 * Service-account / API-key identity. Maps to the existing `apiKeys` table.
 * `email` is a synthetic label of the form `api-key:<name>` — keep this
 * shape unchanged so the server's existing audit log stays consistent.
 */
export type ServiceAccountIdentity = {
  kind: "service_account";
  apiKeyId: string;
  orgId: string;
  /** The user who owns/created this key. */
  createdByUserId: string;
  email: string;
  role: HumanRole;
};

/**
 * The agent instance itself. Not yet emitted by any current code path —
 * this is what an adapter's `registerAgent()` returns in PRs #7/#11.
 */
export type AgentInstanceIdentity = {
  kind: "agent_instance";
  agentInstanceId: string;
  orgId: string;
  userId: string;
};

export type ClawForgeIdentity =
  | HumanIdentity
  | DeviceIdentity
  | RunnerIdentity
  | ServiceAccountIdentity
  | AgentInstanceIdentity;

export function isHuman(identity: ClawForgeIdentity): identity is HumanIdentity {
  return identity.kind === "human";
}

export function isServiceAccount(identity: ClawForgeIdentity): identity is ServiceAccountIdentity {
  return identity.kind === "service_account";
}

export function isAgentInstance(identity: ClawForgeIdentity): identity is AgentInstanceIdentity {
  return identity.kind === "agent_instance";
}
