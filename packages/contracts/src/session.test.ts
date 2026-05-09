import { describe, expect, it } from "vitest";
import { CachedPolicy, SessionTokens } from "./session.js";

describe("SessionTokens", () => {
  it("accepts a plugin on-disk session", () => {
    const result = SessionTokens.safeParse({
      accessToken: "jwt.access",
      refreshToken: "jwt.refresh",
      expiresAt: 1700000000000,
      userId: "u1",
      orgId: "o1",
      email: "user@example.com",
      roles: ["user"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a session without a refresh token (enrollment flow)", () => {
    const result = SessionTokens.safeParse({
      accessToken: "jwt.access",
      userId: "u1",
      orgId: "o1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty userId", () => {
    const result = SessionTokens.safeParse({ accessToken: "j", userId: "", orgId: "o" });
    expect(result.success).toBe(false);
  });
});

describe("CachedPolicy", () => {
  it("accepts a wrapped policy with TTL metadata", () => {
    const result = CachedPolicy.safeParse({
      policy: {
        version: 1,
        tools: {},
        skills: { approved: [], requireApproval: false },
        killSwitch: { active: false },
        auditLevel: "metadata",
      },
      fetchedAt: 1700000000000,
      ttlMs: 3_600_000,
    });
    expect(result.success).toBe(true);
  });
});
