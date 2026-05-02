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
    "from",
    "where",
    "limit",
    "offset",
    "orderBy",
    "values",
    "set",
    "returning",
    "onConflictDoUpdate",
    "innerJoin",
    "leftJoin",
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

    it("returns 401 when user does not exist in database", async () => {
      const token = generateTestToken(app, {
        userId: TEST_USER_ID,
        orgId: TEST_ORG_ID,
        role: "user",
      });

      // User lookup returns empty — user not in DB
      mockDb.select = vi.fn(() => mockDbChain([]) as ReturnType<MockDb["select"]>);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/heartbeat/${TEST_ORG_ID}/${TEST_USER_ID}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json()).toHaveProperty("error", "Unknown user; please re-authenticate");
    });

    it("returns heartbeat response with default values when no policy exists", async () => {
      const token = generateTestToken(app, {
        userId: TEST_USER_ID,
        orgId: TEST_ORG_ID,
        role: "user",
      });

      // select is called for user lookup, previous heartbeat, org settings, then policy.
      let selectCall = 0;
      mockDb.insert = vi.fn(() => mockDbChain([]) as ReturnType<MockDb["insert"]>);
      mockDb.select = vi.fn(() => {
        selectCall++;
        if (selectCall === 1) return mockDbChain([{ id: TEST_USER_ID }]) as ReturnType<MockDb["select"]>;
        if (selectCall === 2) return mockDbChain([]) as ReturnType<MockDb["select"]>;
        if (selectCall === 3) return mockDbChain([]) as ReturnType<MockDb["select"]>;
        return mockDbChain([]) as ReturnType<MockDb["select"]>;
      });

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

      // select is called for user lookup, previous heartbeat, org settings, then policy.
      let selectCall = 0;
      mockDb.insert = vi.fn(() => mockDbChain([]) as ReturnType<MockDb["insert"]>);
      mockDb.select = vi.fn(() => {
        selectCall++;
        if (selectCall === 1) return mockDbChain([{ id: TEST_USER_ID }]) as ReturnType<MockDb["select"]>;
        if (selectCall === 2) return mockDbChain([]) as ReturnType<MockDb["select"]>;
        if (selectCall === 3) return mockDbChain([]) as ReturnType<MockDb["select"]>;
        return mockDbChain([policyWithKillSwitch]) as ReturnType<MockDb["select"]>;
      });

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

      let selectCall = 0;
      mockDb.insert = vi.fn(() => mockDbChain([]) as ReturnType<MockDb["insert"]>);
      mockDb.select = vi.fn(() => {
        selectCall++;
        if (selectCall === 1) return mockDbChain([{ id: TEST_USER_ID }]) as ReturnType<MockDb["select"]>;
        if (selectCall === 2) return mockDbChain([]) as ReturnType<MockDb["select"]>;
        if (selectCall === 3) return mockDbChain([]) as ReturnType<MockDb["select"]>;
        return mockDbChain([policyRow]) as ReturnType<MockDb["select"]>;
      });

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

      let selectCall = 0;
      mockDb.insert = vi.fn(() => mockDbChain([]) as ReturnType<MockDb["insert"]>);
      mockDb.select = vi.fn(() => {
        selectCall++;
        if (selectCall === 1) return mockDbChain([{ id: TEST_USER_ID }]) as ReturnType<MockDb["select"]>;
        if (selectCall === 2) return mockDbChain([]) as ReturnType<MockDb["select"]>;
        if (selectCall === 3) return mockDbChain([]) as ReturnType<MockDb["select"]>;
        return mockDbChain([policyRow]) as ReturnType<MockDb["select"]>;
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/heartbeat/${TEST_ORG_ID}/${TEST_USER_ID}?policyVersion=5`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty("refreshPolicyNow", false);
    });

    it("records crash and restart events when heartbeat gap and startup marker change are detected", async () => {
      const token = generateTestToken(app, {
        userId: TEST_USER_ID,
        orgId: TEST_ORG_ID,
        role: "user",
      });

      const previousHeartbeat = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      let selectCall = 0;
      mockDb.insert = vi.fn(() => mockDbChain([]) as ReturnType<MockDb["insert"]>);
      mockDb.select = vi.fn(() => {
        selectCall++;
        if (selectCall === 1) return mockDbChain([{ id: TEST_USER_ID }]) as ReturnType<MockDb["select"]>;
        if (selectCall === 2) {
          return mockDbChain([{ lastHeartbeatAt: previousHeartbeat, startupId: "startup-old" }]) as ReturnType<
            MockDb["select"]
          >;
        }
        if (selectCall === 3) {
          return mockDbChain([{ settings: { heartbeatOfflineThresholdMs: 60_000 } }]) as ReturnType<MockDb["select"]>;
        }
        return mockDbChain([{ version: 5, killSwitch: false, killSwitchMessage: null }]) as ReturnType<
          MockDb["select"]
        >;
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/heartbeat/${TEST_ORG_ID}/${TEST_USER_ID}?startupId=startup-new`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(mockDb.insert).toHaveBeenCalledTimes(3);
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
          groupName: "Engineering",
          tags: ["prod", "team-core"],
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
      expect(body).toHaveProperty("facets");
      expect(body.summary).toHaveProperty("total", 1);
      expect(body.clients[0]).toHaveProperty("status");
      expect(body.facets.tags).toContain("prod");
      expect(body.facets.groups).toContain("Engineering");
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
      expect(body.facets).toEqual({ tags: [], groups: [] });
    });

    it("updates instance metadata for admin", async () => {
      const token = generateTestToken(app, {
        userId: TEST_ADMIN_ID,
        orgId: TEST_ORG_ID,
        role: "admin",
      });

      const updatedRow = { userId: TEST_USER_ID, groupName: "Platform", tags: ["prod", "critical"] };
      mockDb.update = vi.fn(() => mockDbChain([updatedRow]) as ReturnType<MockDb["update"]>);

      const res = await app.inject({
        method: "PUT",
        url: `/api/v1/heartbeat/${TEST_ORG_ID}/${TEST_USER_ID}/metadata`,
        headers: { authorization: `Bearer ${token}` },
        payload: { groupName: " Platform ", tags: ["prod", "critical", "prod"] },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ instance: updatedRow });
    });

    it("filters clients by status using query params", async () => {
      const token = generateTestToken(app, {
        userId: TEST_ADMIN_ID,
        orgId: TEST_ORG_ID,
        role: "admin",
      });

      const clients = [
        {
          userId: TEST_USER_ID,
          email: "user@test.com",
          name: "Test User",
          role: "user",
          lastHeartbeatAt: new Date().toISOString(),
          clientVersion: "1.0.0",
          groupName: "Ops",
          tags: ["prod"],
        },
        {
          userId: "00000000-0000-4000-8000-000000000099",
          email: "offline@test.com",
          name: "Offline User",
          role: "user",
          lastHeartbeatAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
          clientVersion: "1.0.1",
          groupName: "Ops",
          tags: ["staging"],
        },
      ];

      mockDb.select = vi.fn(() => mockDbChain(clients) as ReturnType<MockDb["select"]>);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/heartbeat/${TEST_ORG_ID}?status=online`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().clients).toHaveLength(1);
      expect(res.json().summary).toEqual({ total: 1, online: 1, offline: 0 });
    });
  });

  describe("GET /api/v1/heartbeat/:orgId/:userId/events", () => {
    it("returns crash/restart history for admins", async () => {
      const token = generateTestToken(app, {
        userId: TEST_ADMIN_ID,
        orgId: TEST_ORG_ID,
        role: "admin",
      });

      let selectCall = 0;
      mockDb.select = vi.fn(() => {
        selectCall++;
        if (selectCall === 1) {
          return mockDbChain([
            { id: "1", eventType: "agent_crash", outcome: "error", metadata: {}, timestamp: new Date().toISOString() },
          ]) as ReturnType<MockDb["select"]>;
        }
        return mockDbChain([
          {
            id: "2",
            eventType: "agent_restart",
            outcome: "success",
            metadata: {},
            timestamp: new Date().toISOString(),
          },
        ]) as ReturnType<MockDb["select"]>;
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/heartbeat/${TEST_ORG_ID}/${TEST_USER_ID}/events`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty("events");
      expect(body).toHaveProperty("summary");
      expect(body.summary).toHaveProperty("crashes", 1);
      expect(body.summary).toHaveProperty("restarts", 1);
    });
  });
});
