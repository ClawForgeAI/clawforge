/**
 * Integration tests for AGT discovery (shadow-agents) routes (Cut 2b step 2.12).
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { agtDiscoveryRoutes } from "./agt-discovery.js";
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

describe("AGT discovery routes", () => {
  let app: FastifyInstance;
  let mockDb: MockDb;

  beforeAll(async () => {
    mockDb = createMockDb();
    app = await createTestApp(mockDb, [agtDiscoveryRoutes]);
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /api/v1/shadow-agents", () => {
    it("returns 422 when fingerprint is missing", async () => {
      const token = generateTestToken(app, { userId: TEST_USER_ID, orgId: TEST_ORG_ID, role: "user" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/shadow-agents",
        headers: { authorization: `Bearer ${token}` },
        payload: { capabilities: ["mcp:tool"] },
      });
      expect(res.statusCode).toBe(422);
    });

    it("inserts a new sighting when fingerprint is unseen", async () => {
      const token = generateTestToken(app, { userId: TEST_USER_ID, orgId: TEST_ORG_ID, role: "user" });
      // First .select returns empty (no existing row).
      // Second call .insert returns the new row.
      mockDb.select = vi.fn(() => chain([]) as ReturnType<MockDb["select"]>);
      mockDb.insert = vi.fn(
        () =>
          chain([
            {
              id: "s-1",
              orgId: TEST_ORG_ID,
              fingerprint: "fp-1",
              capabilities: ["mcp:tool"],
              status: "unknown",
              firstSeen: new Date(),
              lastSeen: new Date(),
            },
          ]) as ReturnType<MockDb["insert"]>,
      );
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/shadow-agents",
        headers: { authorization: `Bearer ${token}` },
        payload: { fingerprint: "fp-1", capabilities: ["mcp:tool"] },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ fingerprint: "fp-1", status: "unknown" });
    });

    it("updates lastSeen + capabilities for an existing fingerprint", async () => {
      const token = generateTestToken(app, { userId: TEST_USER_ID, orgId: TEST_ORG_ID, role: "user" });
      const existing = {
        id: "s-1",
        orgId: TEST_ORG_ID,
        fingerprint: "fp-1",
        capabilities: [],
        status: "unknown",
        firstSeen: new Date("2026-01-01"),
        lastSeen: new Date("2026-01-01"),
      };
      mockDb.select = vi.fn(() => chain([existing]) as ReturnType<MockDb["select"]>);
      mockDb.update = vi.fn(
        () =>
          chain([{ ...existing, lastSeen: new Date(), capabilities: ["mcp:tool"] }]) as ReturnType<MockDb["update"]>,
      );
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/shadow-agents",
        headers: { authorization: `Bearer ${token}` },
        payload: { fingerprint: "fp-1", capabilities: ["mcp:tool"] },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().capabilities).toEqual(["mcp:tool"]);
    });
  });

  describe("GET /api/v1/shadow-agents", () => {
    it("returns 403 for regular users", async () => {
      const token = generateTestToken(app, { userId: TEST_USER_ID, orgId: TEST_ORG_ID, role: "user" });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/shadow-agents",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns sightings filtered by status when provided", async () => {
      const token = generateTestToken(app, { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, role: "admin" });
      mockDb.select = vi.fn(
        () => chain([{ id: "s-1", fingerprint: "fp-1", status: "investigating" }]) as ReturnType<MockDb["select"]>,
      );
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/shadow-agents?status=investigating",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().shadowAgents[0].status).toBe("investigating");
    });

    it("returns 422 for an invalid status filter", async () => {
      const token = generateTestToken(app, { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, role: "admin" });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/shadow-agents?status=bogus",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(422);
    });
  });

  describe("PATCH /api/v1/shadow-agents/:id/status", () => {
    it("returns 403 for non-admin users", async () => {
      const token = generateTestToken(app, { userId: TEST_USER_ID, orgId: TEST_ORG_ID, role: "user" });
      const res = await app.inject({
        method: "PATCH",
        url: "/api/v1/shadow-agents/s-1/status",
        headers: { authorization: `Bearer ${token}` },
        payload: { status: "quarantined" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("updates the status and returns the row", async () => {
      const token = generateTestToken(app, { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, role: "admin" });
      mockDb.update = vi.fn(() => chain([{ id: "s-1", status: "quarantined" }]) as ReturnType<MockDb["update"]>);
      const res = await app.inject({
        method: "PATCH",
        url: "/api/v1/shadow-agents/s-1/status",
        headers: { authorization: `Bearer ${token}` },
        payload: { status: "quarantined" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("quarantined");
    });
  });

  describe("PATCH /api/v1/shadow-agents/:id/notes", () => {
    it("stores notes on the row", async () => {
      const token = generateTestToken(app, { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, role: "admin" });
      mockDb.update = vi.fn(() => chain([{ id: "s-1", notes: "looks suspicious" }]) as ReturnType<MockDb["update"]>);
      const res = await app.inject({
        method: "PATCH",
        url: "/api/v1/shadow-agents/s-1/notes",
        headers: { authorization: `Bearer ${token}` },
        payload: { notes: "looks suspicious" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().notes).toBe("looks suspicious");
    });
  });
});
