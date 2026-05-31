/**
 * Integration tests for AGT kill-switch routes (Cut 2b step 2.9).
 *
 * Covers the new list/activate/clear endpoints. The legacy poll route
 * `GET /api/v1/kill-switch/:did` and the deprecated stream stub are exercised
 * via existing client-side tests and the e2e SSE harness — not duplicated here.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { agtKillSwitchRoutes } from "./agt-kill-switch.js";
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

describe("AGT kill-switch routes", () => {
  let app: FastifyInstance;
  let mockDb: MockDb;

  beforeAll(async () => {
    mockDb = createMockDb();
    app = await createTestApp(mockDb, [agtKillSwitchRoutes]);
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/kill-switch — list active scopes
  // ---------------------------------------------------------------------------
  describe("GET /api/v1/kill-switch", () => {
    it("returns 401 without auth", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/kill-switch" });
      expect(res.statusCode).toBe(401);
    });

    it("returns active scopes for the org", async () => {
      const token = generateTestToken(app, { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, role: "admin" });
      const scopes = [
        {
          id: "a1",
          scope: { kind: "org" },
          active: true,
          message: "incident",
          activatedBy: TEST_ADMIN_ID,
          activatedAt: new Date("2026-05-01"),
          createdAt: new Date("2026-05-01"),
        },
      ];
      mockDb.select = vi.fn(() => chain(scopes) as ReturnType<MockDb["select"]>);

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/kill-switch",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ scopes: [{ id: "a1", scope: { kind: "org" }, active: true }] });
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/kill-switch — activate
  // ---------------------------------------------------------------------------
  describe("POST /api/v1/kill-switch", () => {
    it("returns 403 for non-admin users", async () => {
      const token = generateTestToken(app, { userId: TEST_USER_ID, orgId: TEST_ORG_ID, role: "user" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/kill-switch",
        headers: { authorization: `Bearer ${token}` },
        payload: { message: "halt" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 422 for invalid scope kind", async () => {
      const token = generateTestToken(app, { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, role: "admin" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/kill-switch",
        headers: { authorization: `Bearer ${token}` },
        payload: { scope: { kind: "bogus" } },
      });
      expect(res.statusCode).toBe(422);
    });

    it("creates an org-wide scope when no scope is supplied", async () => {
      const token = generateTestToken(app, { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, role: "admin" });
      const inserted = {
        id: "scope-1",
        scope: { kind: "org" },
        active: true,
        message: "halt now",
        activatedBy: TEST_ADMIN_ID,
        activatedAt: new Date("2026-05-31"),
        createdAt: new Date("2026-05-31"),
      };
      mockDb.insert = vi.fn(() => chain([inserted]) as ReturnType<MockDb["insert"]>);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/kill-switch",
        headers: { authorization: `Bearer ${token}` },
        payload: { message: "halt now" },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ id: "scope-1", scope: { kind: "org" }, active: true, message: "halt now" });
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/v1/kill-switch/:id — clear
  // ---------------------------------------------------------------------------
  describe("DELETE /api/v1/kill-switch/:id", () => {
    it("returns 403 for non-admin users", async () => {
      const token = generateTestToken(app, { userId: TEST_USER_ID, orgId: TEST_ORG_ID, role: "user" });
      const res = await app.inject({
        method: "DELETE",
        url: "/api/v1/kill-switch/some-id",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 404 if the scope does not exist for this org", async () => {
      const token = generateTestToken(app, { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, role: "admin" });
      mockDb.update = vi.fn(() => chain([]) as ReturnType<MockDb["update"]>);
      mockDb.select = vi.fn(() => chain([{ value: 0 }]) as ReturnType<MockDb["select"]>);
      const res = await app.inject({
        method: "DELETE",
        url: "/api/v1/kill-switch/missing",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it("clears the scope and returns the cleared row", async () => {
      const token = generateTestToken(app, { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, role: "admin" });
      const cleared = {
        id: "scope-1",
        scope: { kind: "org" },
        active: false,
        message: "halt now",
        clearedAt: new Date("2026-05-31"),
      };
      mockDb.update = vi.fn(() => chain([cleared]) as ReturnType<MockDb["update"]>);
      mockDb.select = vi.fn(() => chain([{ value: 0 }]) as ReturnType<MockDb["select"]>);

      const res = await app.inject({
        method: "DELETE",
        url: "/api/v1/kill-switch/scope-1",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ id: "scope-1", active: false });
    });
  });
});
