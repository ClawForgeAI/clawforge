import { describe, expect, it } from "vitest";
import { Iso, OrgId, Outcome, UserId, Uuid } from "./common.js";

describe("Iso", () => {
  it("accepts ISO datetimes with milliseconds and Z", () => {
    expect(Iso.safeParse("2026-05-10T00:00:00.000Z").success).toBe(true);
  });

  it("rejects bare dates", () => {
    expect(Iso.safeParse("2026-05-10").success).toBe(false);
  });
});

describe("Uuid", () => {
  it("accepts a v4 uuid", () => {
    expect(Uuid.safeParse("550e8400-e29b-41d4-a716-446655440000").success).toBe(true);
  });

  it("rejects a non-uuid string", () => {
    expect(Uuid.safeParse("not-a-uuid").success).toBe(false);
  });
});

describe("OrgId / UserId", () => {
  it("require non-empty strings", () => {
    expect(OrgId.safeParse("").success).toBe(false);
    expect(UserId.safeParse("").success).toBe(false);
    expect(OrgId.safeParse("o1").success).toBe(true);
    expect(UserId.safeParse("u1").success).toBe(true);
  });
});

describe("Outcome", () => {
  it("accepts the four allowed outcomes", () => {
    for (const v of ["allowed", "blocked", "error", "success"] as const) {
      expect(Outcome.safeParse(v).success).toBe(true);
    }
  });

  it("rejects unknown outcomes", () => {
    expect(Outcome.safeParse("maybe").success).toBe(false);
  });
});
