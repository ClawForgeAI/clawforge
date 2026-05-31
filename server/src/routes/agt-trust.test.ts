/**
 * Integration tests for AGT trust-score routes (Cut 2b step 2.13).
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { agtTrustRoutes } from "./agt-trust.js";
import {
  createTestApp,
  createMockDb,
  type MockDb,
  generateTestToken,
  TEST_ORG_ID,
  TEST_USER_ID,
  TEST_ADMIN_ID,
} from "../test/helpers.js";

function chain(result: unknown) {
  const obj: Record<string, unknown> = {};
  for (const m of ["from", "where", "limit", "offset", "orderBy", "values", "set", "returning", "onConflictDoUpdate"]) {
    obj[m] = vi.fn().mockReturnValue(obj);
  }
  obj.then = vi.fn((resolve: (v: unknown) => void) => resolve(result));
  return obj;
}

describe("AGT trust-score routes", () => {
  let app: FastifyInstance;
  let mockDb: MockDb;

  beforeAll(async () => {
    mockDb = createMockDb();
    app = await createTestApp(mockDb, [agtTrustRoutes]);
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /api/v1/trust-scores", () => {
    it("returns 422 for an out-of-range overall", async () => {
      const token = generateTestToken(app, { userId: TEST_USER_ID, orgId: TEST_ORG_ID, role: "user" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/trust-scores",
        headers: { authorization: `Bearer ${token}` },
        payload: { did: "did:mesh:x", overall: 150 },
      });
      expect(res.statusCode).toBe(422);
    });

    it("derives tier from overall when not supplied", async () => {
      const token = generateTestToken(app, { userId: TEST_USER_ID, orgId: TEST_ORG_ID, role: "user" });
      const captured: Record<string, unknown> = {};
      mockDb.insert = vi.fn(() => {
        const obj: Record<string, unknown> = {};
        for (const m of ["values", "set", "returning", "onConflictDoUpdate"]) {
          obj[m] = vi.fn().mockImplementation((arg?: unknown) => {
            if (m === "values" && arg) captured.values = arg;
            return obj;
          });
        }
        obj.then = vi.fn((resolve: (v: unknown) => void) =>
          resolve([{ did: "did:mesh:x", overall: 85, tier: "Verified", dimensions: {} }]),
        );
        return obj;
      });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/trust-scores",
        headers: { authorization: `Bearer ${token}` },
        payload: { did: "did:mesh:x", overall: 85 },
      });
      expect(res.statusCode).toBe(201);
      expect((captured.values as Record<string, unknown>).tier).toBe("Verified");
    });

    it("respects an explicit tier override", async () => {
      const token = generateTestToken(app, { userId: TEST_USER_ID, orgId: TEST_ORG_ID, role: "user" });
      mockDb.insert = vi.fn(
        () =>
          chain([{ did: "did:mesh:x", overall: 50, tier: "Untrusted", dimensions: {} }]) as ReturnType<
            MockDb["insert"]
          >,
      );
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/trust-scores",
        headers: { authorization: `Bearer ${token}` },
        payload: { did: "did:mesh:x", overall: 50, tier: "Untrusted" },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().tier).toBe("Untrusted");
    });
  });

  describe("GET /api/v1/trust-scores", () => {
    it("returns 403 for regular users", async () => {
      const token = generateTestToken(app, { userId: TEST_USER_ID, orgId: TEST_ORG_ID, role: "user" });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/trust-scores",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns rows + dimensionKeys union", async () => {
      const token = generateTestToken(app, { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, role: "admin" });
      const rows = [
        { did: "did:mesh:a", overall: 80, tier: "Verified", dimensions: { latency: 90, accuracy: 85 } },
        { did: "did:mesh:b", overall: 50, tier: "Provisional", dimensions: { accuracy: 60, audit_clean: 40 } },
      ];
      mockDb.select = vi.fn(() => chain(rows) as ReturnType<MockDb["select"]>);
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/trust-scores",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.trustScores).toHaveLength(2);
      expect(body.dimensionKeys).toEqual(["accuracy", "audit_clean", "latency"]);
    });
  });

  describe("GET /api/v1/trust-scores/:did", () => {
    it("returns 404 when no score exists", async () => {
      const token = generateTestToken(app, { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, role: "admin" });
      mockDb.select = vi.fn(() => chain([]) as ReturnType<MockDb["select"]>);
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/trust-scores/did%3Amesh%3Amissing",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it("returns the score when present", async () => {
      const token = generateTestToken(app, { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, role: "admin" });
      mockDb.select = vi.fn(
        () =>
          chain([{ did: "did:mesh:x", overall: 75, tier: "Trusted", dimensions: { latency: 80 } }]) as ReturnType<
            MockDb["select"]
          >,
      );
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/trust-scores/did%3Amesh%3Ax",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ did: "did:mesh:x", tier: "Trusted" });
    });
  });
});
