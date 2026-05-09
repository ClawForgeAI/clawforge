import { describe, expect, it } from "vitest";
import { AuditEvent, AuditEventInput, AuditEventType, PromptInjectionAssessment } from "./audit.js";

const FIXTURE_EVENT = {
  userId: "u1",
  orgId: "o1",
  eventType: "tool_call_attempt" as const,
  toolName: "read",
  outcome: "allowed" as const,
  agentId: "agent-1",
  sessionKey: "sess-1",
  timestamp: 1700000000000,
  metadata: { foo: "bar", n: 42 },
};

describe("AuditEvent (plugin wire shape)", () => {
  it("accepts the canonical plugin-emitted shape", () => {
    const result = AuditEvent.safeParse(FIXTURE_EVENT);
    expect(result.success).toBe(true);
  });

  it("accepts events without optional fields", () => {
    const result = AuditEvent.safeParse({
      userId: "u1",
      orgId: "o1",
      eventType: "session_end",
      outcome: "success",
      timestamp: 1700000000000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown eventType", () => {
    const result = AuditEvent.safeParse({ ...FIXTURE_EVENT, eventType: "weird_thing" });
    expect(result.success).toBe(false);
  });

  it("rejects an outcome outside the closed set", () => {
    const result = AuditEvent.safeParse({ ...FIXTURE_EVENT, outcome: "yes" });
    expect(result.success).toBe(false);
  });

  it("rejects a string timestamp", () => {
    const result = AuditEvent.safeParse({ ...FIXTURE_EVENT, timestamp: "now" });
    expect(result.success).toBe(false);
  });
});

describe("AuditEventInput (server ingestion shape)", () => {
  it("accepts a string eventType (server is open to new families)", () => {
    const result = AuditEventInput.safeParse({
      userId: "u1",
      orgId: "o1",
      eventType: "future_event_kind",
      outcome: "ok",
      timestamp: 1700000000000,
    });
    expect(result.success).toBe(true);
  });
});

describe("AuditEventType", () => {
  it("includes the agent_enrolled family used by adapter skeletons", () => {
    expect(AuditEventType.safeParse("agent_enrolled").success).toBe(true);
  });

  it("includes the gateway crash/restart families", () => {
    expect(AuditEventType.safeParse("agent_crash").success).toBe(true);
    expect(AuditEventType.safeParse("agent_restart").success).toBe(true);
  });
});

describe("PromptInjectionAssessment", () => {
  it("accepts confidence between 0 and 100", () => {
    expect(PromptInjectionAssessment.safeParse({ detected: true, confidence: 0, signals: [] }).success).toBe(true);
    expect(PromptInjectionAssessment.safeParse({ detected: true, confidence: 100, signals: ["x"] }).success).toBe(true);
  });

  it("rejects confidence outside 0..100", () => {
    expect(PromptInjectionAssessment.safeParse({ detected: true, confidence: 101, signals: [] }).success).toBe(false);
    expect(PromptInjectionAssessment.safeParse({ detected: true, confidence: -1, signals: [] }).success).toBe(false);
  });
});
