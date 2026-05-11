import { describe, expect, it } from "vitest";
import { jwtClaimsToHumanIdentity, signClawForgeJwt, verifyClawForgeJwt } from "./jwt.js";

const SECRET = "test-secret-key-not-for-prod-do-not-use-anywhere-real";
const CLAIMS = {
  userId: "u1",
  orgId: "o1",
  email: "u1@example.com",
  role: "admin" as const,
};

describe("signClawForgeJwt / verifyClawForgeJwt", () => {
  it("round-trips a token and recovers the claims", async () => {
    const token = await signClawForgeJwt(CLAIMS, SECRET);
    const payload = await verifyClawForgeJwt(token, SECRET);
    expect(payload.userId).toBe("u1");
    expect(payload.orgId).toBe("o1");
    expect(payload.email).toBe("u1@example.com");
    expect(payload.role).toBe("admin");
  });

  it("includes iat and exp claims", async () => {
    const token = await signClawForgeJwt(CLAIMS, SECRET, { expiresInSec: 60 });
    const payload = await verifyClawForgeJwt(token, SECRET);
    expect(typeof payload.iat).toBe("number");
    expect(typeof payload.exp).toBe("number");
    expect(payload.exp! - payload.iat!).toBe(60);
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signClawForgeJwt(CLAIMS, SECRET);
    await expect(verifyClawForgeJwt(token, "different-secret-key")).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const token = await signClawForgeJwt(CLAIMS, SECRET, { expiresInSec: -10 });
    await expect(verifyClawForgeJwt(token, SECRET)).rejects.toThrow();
  });

  it("enforces audience when provided", async () => {
    const token = await signClawForgeJwt(CLAIMS, SECRET, { audience: "clawforge-control-plane" });
    const ok = await verifyClawForgeJwt(token, SECRET, { audience: "clawforge-control-plane" });
    expect(ok.userId).toBe("u1");
    await expect(verifyClawForgeJwt(token, SECRET, { audience: "wrong-aud" })).rejects.toThrow();
  });
});

describe("jwtClaimsToHumanIdentity", () => {
  it("projects claims into a HumanIdentity shape", () => {
    const identity = jwtClaimsToHumanIdentity({ ...CLAIMS, iat: 1, exp: 2 });
    expect(identity).toEqual({
      kind: "human",
      userId: "u1",
      orgId: "o1",
      email: "u1@example.com",
      role: "admin",
    });
  });
});
