import { describe, expect, it } from "vitest";
import {
  A2AConversationPolicy,
  AgentIdentityJSON,
  AuditEntry,
  PolicyAction,
  PolicyCondition,
  PolicyDecisionResult,
  PolicyDefaults,
  PolicyOperator,
  PolicyRule,
  Policy,
  TrustScore,
} from "./zod.js";

describe("Policy enums", () => {
  it("PolicyAction accepts only AGT JSON Schema values", () => {
    for (const v of ["allow", "deny", "audit", "block"] as const) {
      expect(PolicyAction.safeParse(v).success).toBe(true);
    }
    expect(PolicyAction.safeParse("warn").success).toBe(false);
    expect(PolicyAction.safeParse("require_approval").success).toBe(false);
  });

  it("PolicyOperator accepts all ten AGT comparison operators", () => {
    const all = ["eq", "ne", "gt", "lt", "gte", "lte", "in", "not_in", "matches", "contains"];
    for (const op of all) {
      expect(PolicyOperator.safeParse(op).success).toBe(true);
    }
    expect(PolicyOperator.safeParse("equals").success).toBe(false);
  });
});

describe("PolicyCondition", () => {
  it("requires field, operator, value", () => {
    expect(PolicyCondition.safeParse({ field: "x", operator: "eq", value: 1 }).success).toBe(true);
    expect(PolicyCondition.safeParse({ field: "x", operator: "eq" }).success).toBe(false);
  });

  it("rejects unknown keys (strict)", () => {
    expect(
      PolicyCondition.safeParse({
        field: "x",
        operator: "eq",
        value: 1,
        extra: "nope",
      }).success,
    ).toBe(false);
  });
});

describe("PolicyRule", () => {
  it("requires name, condition, action; defaults priority and message", () => {
    const parsed = PolicyRule.parse({
      name: "r1",
      condition: { field: "x", operator: "eq", value: 1 },
      action: "deny",
    });
    expect(parsed.priority).toBe(0);
    expect(parsed.message).toBe("");
  });

  it("rejects unknown rule keys", () => {
    expect(
      PolicyRule.safeParse({
        name: "r1",
        condition: { field: "x", operator: "eq", value: 1 },
        action: "deny",
        unknown: true,
      }).success,
    ).toBe(false);
  });

  it("rejects unknown action enum value", () => {
    expect(
      PolicyRule.safeParse({
        name: "r1",
        condition: { field: "x", operator: "eq", value: 1 },
        action: "nuke",
      }).success,
    ).toBe(false);
  });
});

describe("PolicyDefaults", () => {
  it("applies AGT defaults when fields are missing", () => {
    const parsed = PolicyDefaults.parse({});
    expect(parsed.action).toBe("allow");
    expect(parsed.max_tokens).toBe(4096);
    expect(parsed.max_tool_calls).toBe(10);
    expect(parsed.confidence_threshold).toBe(0.8);
  });

  it("clamps confidence_threshold to [0, 1]", () => {
    expect(PolicyDefaults.safeParse({ confidence_threshold: 1.5 }).success).toBe(false);
    expect(PolicyDefaults.safeParse({ confidence_threshold: -0.1 }).success).toBe(false);
  });
});

describe("Policy (top-level)", () => {
  it("parses an empty policy with defaults", () => {
    const parsed = Policy.parse({ name: "empty", rules: [] });
    expect(parsed.version).toBe("1.0");
    expect(parsed.description).toBe("");
    expect(parsed.rules).toEqual([]);
  });

  it("rejects unknown top-level keys", () => {
    expect(Policy.safeParse({ name: "p", rules: [], unexpected: 1 }).success).toBe(false);
  });
});

describe("A2AConversationPolicy", () => {
  it("applies AGT defaults", () => {
    const parsed = A2AConversationPolicy.parse({});
    expect(parsed.enabled).toBe(true);
    expect(parsed.on_escalation_detected).toBe("warn");
    expect(parsed.on_offensive_detected).toBe("break");
    expect(parsed.max_retry_cycles).toBe(3);
    expect(parsed.max_conversation_turns).toBe(30);
  });

  it("enforces retention_days minimum of 30 (EU AI Act Art. 26(6) floor)", () => {
    expect(A2AConversationPolicy.safeParse({ audit: { retention_days: 10 } }).success).toBe(false);
  });
});

describe("Runtime types", () => {
  it("PolicyDecisionResult accepts richer runtime actions", () => {
    const result = PolicyDecisionResult.parse({
      allowed: false,
      action: "require_approval",
      approvers: ["security-team"],
      rateLimited: false,
      evaluatedAt: new Date().toISOString(),
    });
    expect(result.allowed).toBe(false);
    expect(result.action).toBe("require_approval");
  });

  it("AuditEntry requires hash chain fields", () => {
    const valid = AuditEntry.safeParse({
      timestamp: new Date().toISOString(),
      agentId: "did:mesh:a1",
      action: "shell_exec",
      decision: "deny",
      hash: "abc123",
      previousHash: "000",
    });
    expect(valid.success).toBe(true);

    const missing = AuditEntry.safeParse({
      timestamp: new Date().toISOString(),
      agentId: "a1",
      action: "x",
      decision: "deny",
    });
    expect(missing.success).toBe(false);
  });

  it("AgentIdentityJSON requires did, publicKey, capabilities", () => {
    expect(
      AgentIdentityJSON.safeParse({
        did: "did:mesh:a1",
        publicKey: "AAAA",
        capabilities: [],
      }).success,
    ).toBe(true);
    expect(AgentIdentityJSON.safeParse({ did: "did:mesh:a1" }).success).toBe(false);
  });

  it("TrustScore tier is one of the four AGT tiers", () => {
    expect(TrustScore.safeParse({ overall: 0.7, dimensions: {}, tier: "Verified" }).success).toBe(true);
    expect(TrustScore.safeParse({ overall: 0.7, dimensions: {}, tier: "Excellent" }).success).toBe(false);
  });
});
