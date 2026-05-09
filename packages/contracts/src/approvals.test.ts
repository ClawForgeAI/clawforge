import { describe, expect, it } from "vitest";
import { ApprovalDecision, ApprovalRequest } from "./approvals.js";

const ID = "550e8400-e29b-41d4-a716-446655440000";

describe("ApprovalRequest", () => {
  it("accepts a minimum request without reason or expiry", () => {
    const result = ApprovalRequest.safeParse({
      approvalId: ID,
      runId: ID,
      actionId: ID,
      orgId: "o1",
      requestedBy: "u1",
      createdAt: "2026-05-10T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-uuid approvalId", () => {
    const result = ApprovalRequest.safeParse({
      approvalId: "abc",
      runId: ID,
      actionId: ID,
      orgId: "o1",
      requestedBy: "u1",
      createdAt: "2026-05-10T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });
});

describe("ApprovalDecision", () => {
  it("accepts approved/denied/expired", () => {
    for (const d of ["approved", "denied", "expired"] as const) {
      const result = ApprovalDecision.safeParse({
        approvalId: ID,
        decidedBy: "u1",
        decision: d,
        decidedAt: "2026-05-10T00:00:00.000Z",
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects an unknown decision", () => {
    const result = ApprovalDecision.safeParse({
      approvalId: ID,
      decidedBy: "u1",
      decision: "maybe",
      decidedAt: "2026-05-10T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });
});
