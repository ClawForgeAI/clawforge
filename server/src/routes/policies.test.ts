/**
 * Integration tests for policy routes.
 *
 * Tests GET/PUT policy endpoints and kill-switch toggle via Fastify inject.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  createMockDb,
  type MockDb,
  generateTestToken,
  TEST_ORG_ID,
  TEST_USER_ID,
  TEST_ADMIN_ID,
  testPolicy,
} from "../test/helpers.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Helper to configure mock DB to return specific results from select/update/insert.
 */
function mockDbChain(result: unknown[]) {
  const obj: Record<string, unknown> = {};
  const methods = [
    "from", "where", "limit", "offset", "orderBy",
    "values", "set", "returning", "onConflictDoUpdate",
  ];
  for (const m of methods) {
    obj[m] = vi.fn().mockReturnValue(obj);
  }
  obj.then = vi.fn((resolve: (v: unknown) => void) => resolve(result));
  return obj;
}

describe("Policy Routes", () => {
  let app: FastifyInstance;
  let mockDb: MockDb;

  beforeAll(async () => {
    mockDb = createMockDb();
    app = await createTestApp(mockDb);
  });

  afterAll(async () => {
    await app.close();
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/policies/:orgId/effective
  // -------------------------------------------------------------------------

  describe("GET /api/v1/policies/:orgId/effective", () => {
    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/policies/${TEST_ORG_ID}/effective`,
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns 404 when no policy exists", async () => {
      const token = generateTestToken(app, {
        userId: TEST_USER_ID,
        orgId: TEST_ORG_ID,
        role: "user",
      });

      // Mock select to return empty (no policy)
      mockDb.select = vi.fn(() => mockDbChain([]) as ReturnType<MockDb["select"]>);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/policies/${TEST_ORG_ID}/effective`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "No policy configured for this organization" });
    });

    it("returns effective policy for authenticated user", async () => {
      const token = generateTestToken(app, {
        userId: TEST_USER_ID,
        orgId: TEST_ORG_ID,
        role: "user",
      });

      // First select: policy, second select: approved skills
      let callCount = 0;
      mockDb.select = vi.fn(() => {
        callCount++;
        const result = callCount === 1 ? [testPolicy] : [];
        return mockDbChain(result) as ReturnType<MockDb["select"]>;
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/policies/${TEST_ORG_ID}/effective`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty("version", 1);
      expect(body).toHaveProperty("tools");
      expect(body).toHaveProperty("skills");
      expect(body).toHaveProperty("killSwitch");
      expect(body).toHaveProperty("auditLevel", "metadata");
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/policies/:orgId (admin only)
  // -------------------------------------------------------------------------

  describe("GET /api/v1/policies/:orgId", () => {
    it("returns 403 for non-admin users", async () => {
      const token = generateTestToken(app, {
        userId: TEST_USER_ID,
        orgId: TEST_ORG_ID,
        role: "user",
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/policies/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it("returns 404 when no policy exists", async () => {
      const token = generateTestToken(app, {
        userId: TEST_ADMIN_ID,
        orgId: TEST_ORG_ID,
        role: "admin",
      });

      mockDb.select = vi.fn(() => mockDbChain([]) as ReturnType<MockDb["select"]>);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/policies/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns the raw policy for admin", async () => {
      const token = generateTestToken(app, {
        userId: TEST_ADMIN_ID,
        orgId: TEST_ORG_ID,
        role: "admin",
      });

      mockDb.select = vi.fn(() => mockDbChain([testPolicy]) as ReturnType<MockDb["select"]>);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/policies/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty("id");
      expect(body).toHaveProperty("orgId", TEST_ORG_ID);
    });
  });

  // -------------------------------------------------------------------------
  // PUT /api/v1/policies/:orgId
  // -------------------------------------------------------------------------

  describe("PUT /api/v1/policies/:orgId", () => {
    it("returns 403 for non-admin users", async () => {
      const token = generateTestToken(app, {
        userId: TEST_USER_ID,
        orgId: TEST_ORG_ID,
        role: "user",
      });

      const res = await app.inject({
        method: "PUT",
        url: `/api/v1/policies/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { auditLevel: "full" },
      });

      expect(res.statusCode).toBe(403);
    });

    it("returns 400 for invalid body", async () => {
      const token = generateTestToken(app, {
        userId: TEST_ADMIN_ID,
        orgId: TEST_ORG_ID,
        role: "admin",
      });

      const res = await app.inject({
        method: "PUT",
        url: `/api/v1/policies/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { auditLevel: "invalid-level" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("updates the policy successfully", async () => {
      const token = generateTestToken(app, {
        userId: TEST_ADMIN_ID,
        orgId: TEST_ORG_ID,
        role: "admin",
      });

      const updatedPolicy = { ...testPolicy, auditLevel: "full", version: 2 };

      // upsertOrgPolicy calls getOrgPolicy (select) then update
      mockDb.select = vi.fn(() => mockDbChain([testPolicy]) as ReturnType<MockDb["select"]>);
      mockDb.update = vi.fn(() => mockDbChain([updatedPolicy]) as ReturnType<MockDb["update"]>);
      // Mock insert for the audit log (logAdminAction)
      mockDb.insert = vi.fn(() => mockDbChain([]) as ReturnType<MockDb["insert"]>);

      const res = await app.inject({
        method: "PUT",
        url: `/api/v1/policies/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { auditLevel: "full" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty("auditLevel", "full");
      expect(body).toHaveProperty("version", 2);
    });
  });

  // -------------------------------------------------------------------------
  // PUT /api/v1/policies/:orgId/kill-switch
  // -------------------------------------------------------------------------

  describe("PUT /api/v1/policies/:orgId/kill-switch", () => {
    it("returns 403 for non-admin users", async () => {
      const token = generateTestToken(app, {
        userId: TEST_USER_ID,
        orgId: TEST_ORG_ID,
        role: "user",
      });

      const res = await app.inject({
        method: "PUT",
        url: `/api/v1/policies/${TEST_ORG_ID}/kill-switch`,
        headers: { authorization: `Bearer ${token}` },
        payload: { active: true },
      });

      expect(res.statusCode).toBe(403);
    });

    it("returns 400 for invalid body", async () => {
      const token = generateTestToken(app, {
        userId: TEST_ADMIN_ID,
        orgId: TEST_ORG_ID,
        role: "admin",
      });

      const res = await app.inject({
        method: "PUT",
        url: `/api/v1/policies/${TEST_ORG_ID}/kill-switch`,
        headers: { authorization: `Bearer ${token}` },
        payload: { wrongField: true },
      });

      expect(res.statusCode).toBe(400);
    });

    it("activates the kill switch", async () => {
      const token = generateTestToken(app, {
        userId: TEST_ADMIN_ID,
        orgId: TEST_ORG_ID,
        role: "admin",
      });

      const updated = { ...testPolicy, killSwitch: true, killSwitchMessage: "Emergency!", version: 2 };

      // setKillSwitch calls getOrgPolicy (select) then update
      mockDb.select = vi.fn(() => mockDbChain([testPolicy]) as ReturnType<MockDb["select"]>);
      mockDb.update = vi.fn(() => mockDbChain([updated]) as ReturnType<MockDb["update"]>);
      mockDb.insert = vi.fn(() => mockDbChain([]) as ReturnType<MockDb["insert"]>);

      const res = await app.inject({
        method: "PUT",
        url: `/api/v1/policies/${TEST_ORG_ID}/kill-switch`,
        headers: { authorization: `Bearer ${token}` },
        payload: { active: true, message: "Emergency!" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty("killSwitch", true);
      expect(body).toHaveProperty("killSwitchMessage", "Emergency!");
    });

    it("deactivates the kill switch", async () => {
      const token = generateTestToken(app, {
        userId: TEST_ADMIN_ID,
        orgId: TEST_ORG_ID,
        role: "admin",
      });

      const existing = { ...testPolicy, killSwitch: true, killSwitchMessage: "Emergency!" };
      const updated = { ...existing, killSwitch: false, killSwitchMessage: null, version: 2 };

      mockDb.select = vi.fn(() => mockDbChain([existing]) as ReturnType<MockDb["select"]>);
      mockDb.update = vi.fn(() => mockDbChain([updated]) as ReturnType<MockDb["update"]>);
      mockDb.insert = vi.fn(() => mockDbChain([]) as ReturnType<MockDb["insert"]>);

      const res = await app.inject({
        method: "PUT",
        url: `/api/v1/policies/${TEST_ORG_ID}/kill-switch`,
        headers: { authorization: `Bearer ${token}` },
        payload: { active: false },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty("killSwitch", false);
    });
  });
});
