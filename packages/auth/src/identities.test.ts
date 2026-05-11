import { describe, expect, it } from "vitest";
import {
  HUMAN_ROLES,
  isAgentInstance,
  isHuman,
  isServiceAccount,
  type AgentInstanceIdentity,
  type ClawForgeIdentity,
  type HumanIdentity,
  type ServiceAccountIdentity,
} from "./identities.js";

const HUMAN: HumanIdentity = {
  kind: "human",
  userId: "u1",
  orgId: "o1",
  email: "u1@example.com",
  role: "admin",
};

const SERVICE: ServiceAccountIdentity = {
  kind: "service_account",
  apiKeyId: "key1",
  orgId: "o1",
  createdByUserId: "u1",
  email: "api-key:ci-runner",
  role: "viewer",
};

const AGENT: AgentInstanceIdentity = {
  kind: "agent_instance",
  agentInstanceId: "agent-1",
  orgId: "o1",
  userId: "u1",
};

describe("identity guards", () => {
  it("isHuman narrows correctly", () => {
    const ids: ClawForgeIdentity[] = [HUMAN, SERVICE, AGENT];
    expect(ids.filter(isHuman)).toEqual([HUMAN]);
  });

  it("isServiceAccount narrows correctly", () => {
    const ids: ClawForgeIdentity[] = [HUMAN, SERVICE, AGENT];
    expect(ids.filter(isServiceAccount)).toEqual([SERVICE]);
  });

  it("isAgentInstance narrows correctly", () => {
    const ids: ClawForgeIdentity[] = [HUMAN, SERVICE, AGENT];
    expect(ids.filter(isAgentInstance)).toEqual([AGENT]);
  });
});

describe("HUMAN_ROLES", () => {
  it("matches the server's role enum exactly", () => {
    expect(HUMAN_ROLES).toEqual(["super_admin", "admin", "policy_admin", "security_admin", "viewer", "user"]);
  });
});
