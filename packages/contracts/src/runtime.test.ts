import { describe, expect, it } from "vitest";
import { Action, ActionKind, AgentInstance, Run, RuntimeKind, RuntimeRegistration } from "./runtime.js";

const SAMPLE_REGISTRATION = {
  runtimeKind: "openclaw" as const,
  runtimeVersion: "1.2.3",
  adapterVersion: "0.1.6",
  capabilities: { preToolHooks: true, sse: true, artifacts: false, approvals: true },
  registeredAt: "2026-05-10T00:00:00.000Z",
};

describe("RuntimeKind", () => {
  it("includes openclaw, claude-code, codex, custom", () => {
    expect(RuntimeKind.safeParse("openclaw").success).toBe(true);
    expect(RuntimeKind.safeParse("claude-code").success).toBe(true);
    expect(RuntimeKind.safeParse("codex").success).toBe(true);
    expect(RuntimeKind.safeParse("custom").success).toBe(true);
    expect(RuntimeKind.safeParse("openai").success).toBe(false);
  });
});

describe("RuntimeRegistration", () => {
  it("accepts the canonical shape", () => {
    expect(RuntimeRegistration.safeParse(SAMPLE_REGISTRATION).success).toBe(true);
  });

  it("rejects a missing capability", () => {
    const broken = { ...SAMPLE_REGISTRATION, capabilities: { preToolHooks: true } };
    expect(RuntimeRegistration.safeParse(broken).success).toBe(false);
  });
});

describe("AgentInstance", () => {
  it("accepts an instance with a deviceId only", () => {
    const result = AgentInstance.safeParse({
      agentInstanceId: "550e8400-e29b-41d4-a716-446655440000",
      orgId: "o1",
      runtimeKind: "openclaw",
      deviceId: "laptop-42",
      userId: "u1",
      registration: SAMPLE_REGISTRATION,
      enrolledAt: "2026-05-10T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid agentInstanceId", () => {
    const result = AgentInstance.safeParse({
      agentInstanceId: "not-a-uuid",
      orgId: "o1",
      runtimeKind: "openclaw",
      userId: "u1",
      registration: SAMPLE_REGISTRATION,
      enrolledAt: "2026-05-10T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });
});

describe("Run", () => {
  it("accepts a minimum running run", () => {
    const result = Run.safeParse({
      runId: "550e8400-e29b-41d4-a716-446655440000",
      agentInstanceId: "550e8400-e29b-41d4-a716-446655440001",
      orgId: "o1",
      userId: "u1",
      status: "running",
      startedAt: "2026-05-10T00:00:00.000Z",
      policyVersionAtStart: 7,
    });
    expect(result.success).toBe(true);
  });
});

describe("Action", () => {
  it("accepts a tool_call action without args", () => {
    const result = Action.safeParse({
      actionId: "550e8400-e29b-41d4-a716-446655440000",
      runId: "550e8400-e29b-41d4-a716-446655440001",
      kind: "tool_call",
      toolName: "read",
      requestedAt: "2026-05-10T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("ActionKind covers shell_exec, file_*, network_request, mcp_call", () => {
    for (const k of ["shell_exec", "file_read", "file_write", "network_request", "mcp_call"]) {
      expect(ActionKind.safeParse(k).success).toBe(true);
    }
  });
});
