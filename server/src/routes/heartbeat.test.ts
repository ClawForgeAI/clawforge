/**
 * Integration tests for heartbeat routes.
 *
 * Tests the client heartbeat endpoint response format via Fastify inject.
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

function mockDbChain(result: unknown[]) {
  const obj: Record<string, unknown> = {};
  const methods = [
    "from", "where", "limit", "offset", "orderBy",
    "values", "set", "returning", "onConflictDoUpdate",
    "innerJoin", "leftJoin",
  ];
  for (const m of methods) {
    obj[m] = vi.fn().mockReturnValue(obj);
  }
  obj.then = vi.fn((resolve: (v: unknown) => void) => resolve(result));
  return obj;
}

describe("Heartbeat Routes", () => {
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
  // GET /api/v1/heartbeat/:orgId/:userId
  // -------------------------------------------------------------------------

  describe("GET /api/v1/heartbeat/:orgId/:userId", () => {
    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/heartbeat/${TEST_ORG_ID}/${TEST_USER_ID}`,
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns 403 for org mismatch", async () => {
      const otherOrg = "22222222-2222-4000-8000-222222222222";
      const token = generateTestToken(app, {
        userId: TEST_USER_ID,
        orgId: otherOrg,
        role: "user",
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/heartbeat/${TEST_ORG_ID}/${TEST_USER_ID}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it("returns heartbeat response with default values when no policy exists", async () => {
      const token = generateTestToken(app, {
        userId: TEST_USER_ID,
        orgId: TEST_ORG_ID,
        role: "user",
      });

      // insert (upsert heartbeat) then select (policy)
      mockDb.insert = vi.fn(() => mockDbChain([]) as ReturnType<MockDb["insert"]>);
      mockDb.select = vi.fn(() => mockDbChain([]) as ReturnType<MockDb["select"]>);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/heartbeat/${TEST_ORG_ID}/${TEST_USER_ID}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty("policyVersion", 0);
      expect(body).toHaveProperty("killSwitch", false);
      expect(body).toHaveProperty("refreshPolicyNow", false);
    });

    it("returns kill switch status from existing policy", async () => {
      const token = generateTestToken(app, {
        userId: TEST_USER_ID,
        orgId: TEST_ORG_ID,
        role: "user",
      });

      const policyWithKillSwitch = {
        version: 3,
        killSwitch: true,
        killSwitchMessage: "All systems halt",
      };

      // insert for heartbeat upsert, select for policy
      let callCount = 0;
      mockDb.insert = vi.fn(() => mockDbChain([]) as ReturnType<MockDb["insert"]>);
      mockDb.select = vi.fn(() => mockDbChain([policyWithKillSwitch]) as ReturnType<MockDb["select"]>);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/heartbeat/${TEST_ORG_ID}/${TEST_USER_ID}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty("policyVersion", 3);
      expect(body).toHaveProperty("killSwitch", true);
      expect(body).toHaveProperty("killSwitchMessage", "All systems halt");
    });

    it("sets refreshPolicyNow when client version differs from server", async () => {
      const token = generateTestToken(app, {
        userId: TEST_USER_ID,
        orgId: TEST_ORG_ID,
        role: "user",
      });

      const policyRow = { version: 5, killSwitch: false, killSwitchMessage: null };

      mockDb.insert = vi.fn(() => mockDbChain([]) as ReturnType<MockDb["insert"]>);
      mockDb.select = vi.fn(() => mockDbChain([policyRow]) as ReturnType<MockDb["select"]>);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/heartbeat/${TEST_ORG_ID}/${TEST_USER_ID}?policyVersion=3`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty("policyVersion", 5);
      expect(body).toHaveProperty("refreshPolicyNow", true);
    });

    it("does not set refreshPolicyNow when client version matches server", async () => {
      const token = generateTestToken(app, {
        userId: TEST_USER_ID,
        orgId: TEST_ORG_ID,
        role: "user",
      });

      const policyRow = { version: 5, killSwitch: false, killSwitchMessage: null };

      mockDb.insert = vi.fn(() => mockDbChain([]) as ReturnType<MockDb["insert"]>);
      mockDb.select = vi.fn(() => mockDbChain([policyRow]) as ReturnType<MockDb["select"]>);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/heartbeat/${TEST_ORG_ID}/${TEST_USER_ID}?policyVersion=5`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty("refreshPolicyNow", false);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/heartbeat/:orgId (admin - list clients)
  // -------------------------------------------------------------------------

  describe("GET /api/v1/heartbeat/:orgId", () => {
    it("returns 403 for non-admin", async () => {
      const token = generateTestToken(app, {
        userId: TEST_USER_ID,
        orgId: TEST_ORG_ID,
        role: "user",
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/heartbeat/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it("returns client list for admin", async () => {
      const token = generateTestToken(app, {
        userId: TEST_ADMIN_ID,
        orgId: TEST_ORG_ID,
        role: "admin",
      });

      const recentTime = new Date().toISOString();
      const clients = [
        {
          userId: TEST_USER_ID,
          email: "user@test.com",
          name: "Test User",
          role: "user",
          lastHeartbeatAt: recentTime,
          clientVersion: "1.0.0",
        },
      ];

      mockDb.select = vi.fn(() => mockDbChain(clients) as ReturnType<MockDb["select"]>);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/heartbeat/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty("clients");
      expect(body).toHaveProperty("summary");
      expect(body.summary).toHaveProperty("total", 1);
      expect(body.clients[0]).toHaveProperty("status");
    });

    it("returns empty client list", async () => {
      const token = generateTestToken(app, {
        userId: TEST_ADMIN_ID,
        orgId: TEST_ORG_ID,
        role: "admin",
      });

      mockDb.select = vi.fn(() => mockDbChain([]) as ReturnType<MockDb["select"]>);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/heartbeat/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.clients).toEqual([]);
      expect(body.summary).toEqual({ total: 0, online: 0, offline: 0 });
    });
  });
});
