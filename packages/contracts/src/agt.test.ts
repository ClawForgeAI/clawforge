import { describe, expect, it } from "vitest";
import {
  AgentIdentityJSON,
  AuditEntry,
  Policy,
  PolicyAction,
  PolicyCondition,
  PolicyDecisionResult,
  PolicyRule,
  TrustScore,
} from "./agt.js";

describe("contracts/agt — AGT shape re-exports", () => {
  it("exposes a Policy Zod schema that round-trips a minimal AGT policy", () => {
    const parsed = Policy.parse({
      name: "test",
      rules: [
        {
          name: "r1",
          condition: { field: "tool_name", operator: "eq", value: "shell_exec" },
          action: "deny",
        },
      ],
    });
    expect(parsed.name).toBe("test");
    expect(parsed.rules).toHaveLength(1);
    expect(parsed.version).toBe("1.0"); // default applied
  });

  it("exposes PolicyAction with AGT YAML enum (allow / deny / audit / block)", () => {
    for (const action of ["allow", "deny", "audit", "block"] as const) {
      expect(PolicyAction.safeParse(action).success).toBe(true);
    }
    expect(PolicyAction.safeParse("warn").success).toBe(false);
  });

  it("exposes PolicyCondition with structured shape", () => {
    expect(PolicyCondition.safeParse({ field: "x", operator: "eq", value: 1 }).success).toBe(true);
  });

  it("exposes PolicyRule, AuditEntry, AgentIdentityJSON, TrustScore, PolicyDecisionResult", () => {
    expect(PolicyRule).toBeDefined();
    expect(AuditEntry).toBeDefined();
    expect(AgentIdentityJSON).toBeDefined();
    expect(TrustScore).toBeDefined();
    expect(PolicyDecisionResult).toBeDefined();
  });
});
