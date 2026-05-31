/**
 * Integration tests for AGT metrics routes (Cut 2b step 2.11).
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { agtMetricsRoutes } from "./agt-metrics.js";
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

describe("AGT metrics routes", () => {
  let app: FastifyInstance;
  let mockDb: MockDb;

  beforeAll(async () => {
    mockDb = createMockDb();
    app = await createTestApp(mockDb, [agtMetricsRoutes]);
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /api/v1/metrics", () => {
    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/metrics",
        payload: { snapshot: { tools: 1 } },
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 422 when snapshot is missing", async () => {
      const token = generateTestToken(app, { userId: TEST_USER_ID, orgId: TEST_ORG_ID, role: "user" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/metrics",
        headers: { authorization: `Bearer ${token}` },
        payload: { agentDid: "did:mesh:x" },
      });
      expect(res.statusCode).toBe(422);
    });

    it("inserts a snapshot and returns the row", async () => {
      const token = generateTestToken(app, { userId: TEST_USER_ID, orgId: TEST_ORG_ID, role: "user" });
      const inserted = {
        id: "m-1",
        orgId: TEST_ORG_ID,
        agentDid: "did:mesh:x",
        snapshot: { tools: 3 },
        recordedAt: new Date("2026-05-31"),
      };
      mockDb.insert = vi.fn(() => chain([inserted]) as ReturnType<MockDb["insert"]>);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/metrics",
        headers: { authorization: `Bearer ${token}` },
        payload: { agentDid: "did:mesh:x", snapshot: { tools: 3 } },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ id: "m-1", agentDid: "did:mesh:x" });
    });
  });

  describe("GET /api/v1/metrics", () => {
    it("returns 403 for regular users", async () => {
      const token = generateTestToken(app, { userId: TEST_USER_ID, orgId: TEST_ORG_ID, role: "user" });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/metrics",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 422 for an unparseable query", async () => {
      const token = generateTestToken(app, { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, role: "admin" });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/metrics?limit=banana",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(422);
    });

    it("returns the recent snapshots for the org", async () => {
      const token = generateTestToken(app, { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, role: "admin" });
      const rows = [{ id: "m-1", orgId: TEST_ORG_ID, agentDid: "did:mesh:x", snapshot: {}, recordedAt: new Date() }];
      mockDb.select = vi.fn(() => chain(rows) as ReturnType<MockDb["select"]>);
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/metrics?limit=10&sinceMinutes=60",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().metrics).toHaveLength(1);
    });
  });

  describe("GET /api/v1/metrics/summary", () => {
    it("returns 403 for regular users", async () => {
      const token = generateTestToken(app, { userId: TEST_USER_ID, orgId: TEST_ORG_ID, role: "user" });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/metrics/summary",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("aggregates totals + top agents", async () => {
      const token = generateTestToken(app, { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, role: "admin" });
      // Sequential responses: overall, last24h, lastHour, topAgents
      const responses: unknown[] = [
        [{ total: 42, distinctAgents: 3 }],
        [{ total: 12, distinctAgents: 2 }],
        [{ total: 2 }],
        [{ agentDid: "did:mesh:x", total: 7 }],
      ];
      let i = 0;
      mockDb.select = vi.fn(() => chain(responses[i++] ?? []) as ReturnType<MockDb["select"]>);
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/metrics/summary",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBe(42);
      expect(body.distinctAgents).toBe(3);
      expect(body.last24h).toMatchObject({ total: 12, distinctAgents: 2 });
      expect(body.lastHour).toMatchObject({ total: 2 });
      expect(body.topAgents).toEqual([{ agentDid: "did:mesh:x", total: 7 }]);
    });
  });
});
