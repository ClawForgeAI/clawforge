import type { AuditEvent } from "@clawforgeai/contracts";
import { describe, expect, it } from "vitest";
import { parseJsonl, serializeJsonl } from "./serialize.js";

const sample: AuditEvent[] = [
  {
    userId: "u1",
    orgId: "o1",
    eventType: "tool_call_attempt",
    outcome: "allowed",
    timestamp: 1,
  },
  {
    userId: "u1",
    orgId: "o1",
    eventType: "tool_call_attempt",
    outcome: "blocked",
    toolName: "exec",
    timestamp: 2,
    metadata: { reason: "deny_list" },
  },
];

describe("serializeJsonl / parseJsonl", () => {
  it("round-trips a batch of events", () => {
    const out = serializeJsonl(sample);
    expect(out.endsWith("\n")).toBe(true);
    expect(out.split("\n").filter(Boolean)).toHaveLength(2);

    const parsed = parseJsonl(out);
    expect(parsed).toEqual(sample);
  });

  it("returns empty string for an empty batch", () => {
    expect(serializeJsonl([])).toBe("");
  });

  it("returns empty array for empty input", () => {
    expect(parseJsonl("")).toEqual([]);
  });

  it("skips malformed lines", () => {
    const raw = [
      '{"userId":"u1","orgId":"o1","eventType":"tool_call_attempt","outcome":"allowed","timestamp":1}',
      "not-json",
      "",
    ].join("\n");
    const parsed = parseJsonl(raw);
    expect(parsed).toHaveLength(1);
  });
});
