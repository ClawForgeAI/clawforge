/**
 * Integration tests for AGT Agent Hypervisor routes (Cut 2b step 2.15).
 *
 * The runtime-state derivation is deterministic enough to test by setting
 * mock timestamps and asserting on the returned `runtime` band.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { agtHypervisorRoutes } from "./agt-hypervisor.js";
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
  for (const m of [
    "from",
    "where",
    "limit",
    "offset",
    "orderBy",
    "values",
    "set",
    "returning",
    "groupBy",
    "onConflictDoUpdate",
  ]) {
    obj[m] = vi.fn().mockReturnValue(obj);
  }
  obj.then = vi.fn((resolve: (v: unknown) => void) => resolve(result));
  return obj;
}

describe("AGT hypervisor routes", () => {
  let app: FastifyInstance;
  let mockDb: MockDb;

  beforeAll(async () => {
    mockDb = createMockDb();
    app = await createTestApp(mockDb, [agtHypervisorRoutes]);
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /api/v1/hypervisor/agents", () => {
    it("returns 403 for regular users", async () => {
      const token = generateTestToken(app, { userId: TEST_USER_ID, orgId: TEST_ORG_ID, role: "user" });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/hypervisor/agents",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("classifies agents as live / idle / offline based on lastSeen", async () => {
      const token = generateTestToken(app, { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, role: "admin" });
      const now = Date.now();
      const liveTs = new Date(now - 60_000); // 1 minute ago
      const idleTs = new Date(now - 30 * 60_000); // 30 minutes ago
      // Plus one agent with no activity (offline).
      const identityRows = [
        {
          did: "did:mesh:live",
          name: "Live agent",
          status: "active",
          capabilities: ["mcp:tool"],
          delegationDepth: 0,
          createdAt: new Date("2026-01-01"),
        },
        {
          did: "did:mesh:idle",
          name: "Idle agent",
          status: "active",
          capabilities: ["mcp:tool"],
          delegationDepth: 0,
          createdAt: new Date("2026-01-01"),
        },
        {
          did: "did:mesh:silent",
          name: "Silent agent",
          status: "active",
          capabilities: [],
          delegationDepth: 0,
          createdAt: new Date("2026-01-01"),
        },
      ];
      // Sequential select responses: identityRows, auditLatest, metricLatest, killSwitchScopes
      const responses: unknown[] = [
        identityRows,
        [{ agentDid: "did:mesh:live", latest: liveTs }],
        [{ agentDid: "did:mesh:idle", latest: idleTs }],
        [],
      ];
      let i = 0;
      mockDb.select = vi.fn(() => chain(responses[i++] ?? []) as ReturnType<MockDb["select"]>);

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/hypervisor/agents",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      const byDid = Object.fromEntries(body.agents.map((a: { did: string; runtime: string }) => [a.did, a.runtime]));
      expect(byDid["did:mesh:live"]).toBe("live");
      expect(byDid["did:mesh:idle"]).toBe("idle");
      expect(byDid["did:mesh:silent"]).toBe("offline");
      expect(body.summary).toMatchObject({ total: 3, live: 1, idle: 1, offline: 1 });
    });

    it("treats org-scoped kill switch as covering every agent", async () => {
      const token = generateTestToken(app, { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, role: "admin" });
      const responses: unknown[] = [
        [
          {
            did: "did:mesh:a",
            name: "A",
            status: "active",
            capabilities: [],
            delegationDepth: 0,
            createdAt: new Date(),
          },
        ],
        [],
        [],
        [{ id: "ks-1", scope: { kind: "org" } }],
      ];
      let i = 0;
      mockDb.select = vi.fn(() => chain(responses[i++] ?? []) as ReturnType<MockDb["select"]>);

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/hypervisor/agents",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.orgKillSwitch).toBe(true);
      expect(body.agents[0].killSwitchActive).toBe(true);
    });
  });

  describe("GET /api/v1/hypervisor/agents/:did", () => {
    it("returns 404 when the identity does not exist", async () => {
      const token = generateTestToken(app, { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, role: "admin" });
      mockDb.select = vi.fn(() => chain([]) as ReturnType<MockDb["select"]>);
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/hypervisor/agents/did%3Amesh%3Aghost",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it("includes activity24h counts in the detail response", async () => {
      const token = generateTestToken(app, { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, role: "admin" });
      const now = new Date();
      const responses: unknown[] = [
        [
          {
            did: "did:mesh:a",
            name: "A",
            status: "active",
            capabilities: ["mcp:tool"],
            createdAt: now,
          },
        ],
        [{ ts: now }],
        [{ ts: null }],
        [{ value: 10 }],
        [{ value: 2 }],
        [{ value: 5 }],
      ];
      let i = 0;
      mockDb.select = vi.fn(() => chain(responses[i++] ?? []) as ReturnType<MockDb["select"]>);

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/hypervisor/agents/did%3Amesh%3Aa",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.runtime).toBe("live");
      expect(body.activity24h).toEqual({ allow: 10, deny: 2, metrics: 5 });
    });
  });

  describe("lifecycle actions", () => {
    it("pause sets status=suspended (admin only)", async () => {
      const token = generateTestToken(app, { userId: TEST_USER_ID, orgId: TEST_ORG_ID, role: "user" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/hypervisor/agents/did%3Amesh%3Ax/pause",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("pause returns the updated row", async () => {
      const token = generateTestToken(app, { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, role: "admin" });
      mockDb.update = vi.fn(() => chain([{ did: "did:mesh:x", status: "suspended" }]) as ReturnType<MockDb["update"]>);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/hypervisor/agents/did%3Amesh%3Ax/pause",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("suspended");
    });

    it("resume returns the updated row", async () => {
      const token = generateTestToken(app, { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, role: "admin" });
      mockDb.update = vi.fn(() => chain([{ did: "did:mesh:x", status: "active" }]) as ReturnType<MockDb["update"]>);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/hypervisor/agents/did%3Amesh%3Ax/resume",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("active");
    });

    it("terminate revokes identity and opens an agent-scoped kill switch", async () => {
      const token = generateTestToken(app, { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, role: "admin" });
      mockDb.update = vi.fn(() => chain([{ did: "did:mesh:x", status: "revoked" }]) as ReturnType<MockDb["update"]>);
      mockDb.insert = vi.fn(
        () => chain([{ id: "ks-1", scope: { kind: "agent", agentDid: "did:mesh:x" } }]) as ReturnType<MockDb["insert"]>,
      );
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/hypervisor/agents/did%3Amesh%3Ax/terminate",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.identity.status).toBe("revoked");
      expect(body.killSwitchScope.scope).toEqual({ kind: "agent", agentDid: "did:mesh:x" });
    });
  });
});
