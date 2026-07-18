import { describe, expect, it } from "vitest";
import type { Policy } from "@clawforgeai/policy-schema";
import { ClawforgeEvaluator } from "./agt-evaluator.js";

function policy(rules: Policy["rules"]): Policy {
  return {
    version: "1.0",
    name: "test-policy",
    description: "",
    rules,
  };
}

describe("ClawforgeEvaluator", () => {
  it("starts with no policy loaded", () => {
    const ev = new ClawforgeEvaluator();
    expect(ev.hasPolicy()).toBe(false);
    expect(ev.policyName).toBeUndefined();
  });

  it("loads a policy and reports its name", () => {
    const ev = new ClawforgeEvaluator();
    ev.loadPolicy(policy([]));
    expect(ev.hasPolicy()).toBe(true);
    expect(ev.policyName).toBe("test-policy");
  });

  it("denies a tool blocked by a tool_name eq rule", () => {
    const ev = new ClawforgeEvaluator();
    ev.loadPolicy(
      policy([
        {
          name: "block-shell",
          condition: { field: "tool_name", operator: "eq", value: "shell_exec" },
          action: "deny",
          priority: 100,
          message: "",
        },
      ]),
    );
    const result = ev.evaluate("shell_exec");
    expect(result.allowed).toBe(false);
    expect(result.action).toBe("deny");
    expect(result.policyName).toBe("test-policy");
  });

  it("allows an explicitly allowed tool", () => {
    const ev = new ClawforgeEvaluator();
    ev.loadPolicy(
      policy([
        {
          name: "allow-search",
          condition: { field: "tool_name", operator: "eq", value: "web_search" },
          action: "allow",
          priority: 50,
          message: "",
        },
      ]),
    );
    const result = ev.evaluate("web_search");
    expect(result.allowed).toBe(true);
    expect(result.action).toBe("allow");
  });

  it("treats audit as allow at runtime — audit emission is automatic", () => {
    const ev = new ClawforgeEvaluator();
    ev.loadPolicy(
      policy([
        {
          name: "audit-write",
          condition: { field: "tool_name", operator: "eq", value: "write_file" },
          action: "audit",
          priority: 50,
          message: "",
        },
      ]),
    );
    const result = ev.evaluate("write_file");
    expect(result.allowed).toBe(true);
    expect(result.action).toBe("allow");
  });

  it("evaluates DSL conditions on non-tool_name fields", () => {
    const ev = new ClawforgeEvaluator();
    ev.loadPolicy(
      policy([
        {
          name: "block-large",
          condition: { field: "token_count", operator: "gt", value: 4096 },
          action: "deny",
          priority: 100,
          message: "",
        },
      ]),
    );
    expect(ev.evaluate("any_tool", { token_count: 5000 }).allowed).toBe(false);
    expect(ev.evaluate("any_tool", { token_count: 1000 }).allowed).toBe(true);
  });

  it("loadPolicy replaces the previous policy (no accumulation)", () => {
    const ev = new ClawforgeEvaluator();
    ev.loadPolicy(
      policy([
        {
          name: "block-shell",
          condition: { field: "tool_name", operator: "eq", value: "shell_exec" },
          action: "deny",
          priority: 100,
          message: "",
        },
      ]),
    );
    expect(ev.evaluate("shell_exec").allowed).toBe(false);

    ev.loadPolicy(
      policy([
        {
          name: "allow-shell",
          condition: { field: "tool_name", operator: "eq", value: "shell_exec" },
          action: "allow",
          priority: 100,
          message: "",
        },
      ]),
    );
    expect(ev.evaluate("shell_exec").allowed).toBe(true);
  });

  it("agt escape hatch returns the underlying PolicyEngine", () => {
    const ev = new ClawforgeEvaluator();
    ev.loadPolicy(
      policy([
        {
          name: "block-shell",
          condition: { field: "tool_name", operator: "eq", value: "shell_exec" },
          action: "deny",
          priority: 100,
          message: "",
        },
      ]),
    );
    expect(ev.agt.listPolicies()).toContain("test-policy");
  });
});
