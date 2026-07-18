import { describe, expect, it } from "vitest";
import type { Policy, PolicyRule } from "@clawforgeai/policy-schema";
import { convertPolicyToLegacyRules, convertRule } from "./policy-loader.js";

function rule(overrides: Partial<PolicyRule>): PolicyRule {
  return {
    name: "test",
    condition: { field: "tool_name", operator: "eq", value: "shell_exec" },
    action: "deny",
    priority: 0,
    message: "",
    ...overrides,
  };
}

describe("convertRule — action enum mapping", () => {
  it.each([
    ["allow", "allow"],
    ["deny", "deny"],
    ["block", "deny"],
    ["audit", "allow"], // audit emission is automatic; runtime is allow
  ] as const)("maps %s -> %s", (input, expected) => {
    const out = convertRule(rule({ action: input }));
    expect(out.effect).toBe(expected);
  });
});

describe("convertRule — DSL operator mapping", () => {
  it.each([
    ["eq", "=="],
    ["ne", "!="],
    ["gt", ">"],
    ["lt", "<"],
    ["gte", ">="],
    ["lte", "<="],
  ] as const)("maps %s -> DSL '%s'", (op, dsl) => {
    const out = convertRule(rule({ condition: { field: "token_count", operator: op, value: 4096 } }));
    expect(out.condition).toBe(`token_count ${dsl} 4096`);
  });

  it("quotes string literals in the DSL", () => {
    const out = convertRule(rule({ condition: { field: "user_role", operator: "eq", value: "admin" } }));
    expect(out.condition).toBe("user_role == 'admin'");
  });

  it("emits a DSL condition for tool_name == value (no special fast path)", () => {
    const out = convertRule(rule({ condition: { field: "tool_name", operator: "eq", value: "shell_exec" } }));
    expect(out.condition).toBe("tool_name == 'shell_exec'");
    expect(out.effect).toBe("deny");
  });
});

describe("convertRule — list operators", () => {
  it("emits `in` for in operator", () => {
    const out = convertRule(rule({ condition: { field: "tool_name", operator: "in", value: ["shell", "exec"] } }));
    expect(out.condition).toBe("tool_name in ['shell', 'exec']");
  });

  it("emits `not in` for not_in operator", () => {
    const out = convertRule(rule({ condition: { field: "tool_name", operator: "not_in", value: ["safe"] } }));
    expect(out.condition).toBe("tool_name not in ['safe']");
  });
});

describe("convertRule — unsupported operators fall back to no condition", () => {
  it.each(["matches", "contains"] as const)("operator %s -> no condition emitted", (op) => {
    const out = convertRule(rule({ condition: { field: "x", operator: op, value: "y" } }));
    expect(out.condition).toBeUndefined();
  });
});

describe("convertPolicyToLegacyRules", () => {
  it("converts every rule preserving order and priorities", () => {
    const policy: Policy = {
      version: "1.0",
      name: "test",
      description: "",
      rules: [
        rule({ name: "r1", priority: 100 }),
        rule({
          name: "r2",
          priority: 50,
          action: "allow",
          condition: { field: "tool_name", operator: "eq", value: "web_search" },
        }),
      ],
    };
    const out = convertPolicyToLegacyRules(policy);
    expect(out).toHaveLength(2);
    expect(out[0].name).toBe("r1");
    expect(out[0].priority).toBe(100);
    expect(out[1].name).toBe("r2");
    expect(out[1].effect).toBe("allow");
  });
});
