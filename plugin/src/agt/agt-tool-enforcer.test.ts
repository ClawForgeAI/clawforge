import { describe, expect, it, vi } from "vitest";
import type { AgtRuntime } from "./clawforge-client.js";
import { createAgtToolEnforcerHook } from "./agt-tool-enforcer.js";

function makeRuntime(
  decision: { allowed: boolean; action?: string; reason?: string; matchedRule?: string } = { allowed: true },
): AgtRuntime & {
  evaluateCalls: Array<{ action: string; context?: Record<string, unknown> }>;
  auditCalls: Array<{ agentId: string; action: string; decision: string }>;
} {
  const evaluateCalls: Array<{ action: string; context?: Record<string, unknown> }> = [];
  const auditCalls: Array<{ agentId: string; action: string; decision: string }> = [];
  return {
    client: {} as never,
    evaluateCalls,
    auditCalls,
    evaluateToolCall: async (action, context) => {
      evaluateCalls.push({ action, context });
      return {
        allowed: decision.allowed,
        action: (decision.action ?? (decision.allowed ? "allow" : "deny")) as never,
        matchedRule: decision.matchedRule,
        reason: decision.reason,
        approvers: [],
        rateLimited: false,
        evaluatedAt: new Date(),
      };
    },
    audit: (entry) => {
      auditCalls.push(entry);
    },
    disconnect: async () => {},
  };
}

const ctx = { agentId: "did:mesh:test", sessionKey: "s1" } as never;

describe("createAgtToolEnforcerHook — lifecycle short-circuits", () => {
  it("denies all tools during pendingInit", async () => {
    const runtime = makeRuntime();
    const hook = createAgtToolEnforcerHook(runtime, {
      pendingInit: true,
      killSwitchActive: false,
      agentId: "did:mesh:a1",
    });
    const result = await hook({ toolName: "shell_exec", params: {} } as never, ctx);
    expect(result).toMatchObject({ block: true });
    expect(result?.blockReason).toContain("initializing");
    expect(runtime.evaluateCalls).toHaveLength(0);
  });

  it("denies all tools while kill switch is active and uses the configured message", async () => {
    const runtime = makeRuntime();
    const hook = createAgtToolEnforcerHook(runtime, {
      killSwitchActive: true,
      killSwitchMessage: "emergency shutdown",
      agentId: "did:mesh:a1",
    });
    const result = await hook({ toolName: "anything", params: {} } as never, ctx);
    expect(result).toMatchObject({ block: true, blockReason: "emergency shutdown" });
    expect(runtime.evaluateCalls).toHaveLength(0);
  });

  it("allows everything when offlineOverride='allow'", async () => {
    const runtime = makeRuntime({ allowed: false, reason: "would deny but offline allow" });
    const hook = createAgtToolEnforcerHook(runtime, {
      offlineOverride: "allow",
      killSwitchActive: false,
      agentId: "did:mesh:a1",
    });
    const result = await hook({ toolName: "shell_exec", params: {} } as never, ctx);
    expect(result).toBeUndefined();
    expect(runtime.evaluateCalls).toHaveLength(0);
    expect(runtime.auditCalls).toHaveLength(0);
  });
});

describe("createAgtToolEnforcerHook — AGT evaluation path", () => {
  it("forwards toolName and params to the runtime evaluator and audits allow", async () => {
    const runtime = makeRuntime({ allowed: true });
    const hook = createAgtToolEnforcerHook(runtime, {
      killSwitchActive: false,
      agentId: "did:mesh:a1",
    });
    const result = await hook({ toolName: "web_search", params: { q: "openclaw" } } as never, ctx);
    expect(result).toBeUndefined();
    expect(runtime.evaluateCalls[0]).toEqual({
      action: "web_search",
      context: { args: { q: "openclaw" } },
    });
    expect(runtime.auditCalls[0]).toEqual({
      agentId: "did:mesh:a1",
      action: "web_search",
      decision: "allow",
    });
  });

  it("blocks denied decisions and includes the AGT reason in the block message", async () => {
    const runtime = makeRuntime({ allowed: false, reason: "shell access denied" });
    const hook = createAgtToolEnforcerHook(runtime, {
      killSwitchActive: false,
      agentId: "did:mesh:a1",
    });
    const result = await hook({ toolName: "shell_exec", params: {} } as never, ctx);
    expect(result).toMatchObject({
      block: true,
      blockReason: "ClawForge: shell access denied",
    });
    expect(runtime.auditCalls[0]).toMatchObject({ action: "shell_exec", decision: "deny" });
  });

  it("falls back to matched rule name when reason is absent", async () => {
    const runtime = makeRuntime({ allowed: false, matchedRule: "block-shell" });
    const hook = createAgtToolEnforcerHook(runtime, {
      killSwitchActive: false,
      agentId: "did:mesh:a1",
    });
    const result = await hook({ toolName: "shell_exec", params: {} } as never, ctx);
    expect(result?.blockReason).toContain("block-shell");
  });
});

describe("AgtRuntime contract — smoke", () => {
  it("supports a hand-rolled runtime for tests (createAgtBackedRuntime is the prod factory)", async () => {
    const runtime = makeRuntime({ allowed: true });
    const decision = await runtime.evaluateToolCall("anything");
    expect(decision.allowed).toBe(true);
    runtime.audit({ agentId: "a", action: "anything", decision: "allow" });
    await runtime.disconnect();
    expect(vi.isMockFunction(runtime.evaluateToolCall)).toBe(false);
  });
});
