import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import jwtPlugin from "@fastify/jwt";
import { registerAuthMiddleware } from "../middleware/auth.js";
import { organizationRoutes } from "./organizations.js";
import { JWT_SECRET, TEST_ORG_ID, TEST_ADMIN_ID, TEST_USER_ID } from "../test/helpers.js";

vi.mock("../services/admin-audit.js", () => ({
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}));

function makeChain(result: unknown[] = []) {
  const c: any = {};
  for (const m of ["select", "from", "where", "limit", "orderBy", "set", "values", "returning", "insert", "update", "delete"]) {
    c[m] = vi.fn().mockReturnValue(c);
  }
  c.then = (resolve: (v: unknown) => void) => resolve(result);
  return c;
}

function createTestDb(selectResults: unknown[][] = [[]], updateResults: unknown[][] = [[]]) {
  let selectCall = 0;
  let updateCall = 0;
  return {
    select: vi.fn(() => makeChain(selectResults[selectCall++] ?? [])),
    insert: vi.fn(() => makeChain([])),
    update: vi.fn(() => makeChain(updateResults[updateCall++] ?? [])),
    delete: vi.fn(() => makeChain([])),
  };
}

async function buildApp(db: any) {
  const app = Fastify({ logger: false });
  await app.register(jwtPlugin, { secret: JWT_SECRET });
  app.decorate("db", db as never);
  await registerAuthMiddleware(app);
  await app.register(organizationRoutes);
  await app.ready();
  return app;
}

function adminToken(app: any) {
  return app.jwt.sign(
    { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, email: "admin@test.com", role: "admin" },
    { expiresIn: "1h" },
  );
}

function userToken(app: any) {
  return app.jwt.sign(
    { userId: TEST_USER_ID, orgId: TEST_ORG_ID, email: "user@test.com", role: "user" },
    { expiresIn: "1h" },
  );
}

describe("organization routes", () => {
  describe("GET /api/v1/organizations/:orgId", () => {
    it("returns org details for admin", async () => {
      const org = { id: TEST_ORG_ID, name: "Test Org", ssoConfig: null, createdAt: "2025-01-01", updatedAt: "2025-01-01" };
      const db = createTestDb([[org]]);
      const app = await buildApp(db);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().organization.name).toBe("Test Org");

      await app.close();
    });

    it("returns 404 for non-existent org", async () => {
      const db = createTestDb([[]]);
      const app = await buildApp(db);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
      });
      expect(res.statusCode).toBe(404);

      await app.close();
    });

    it("rejects non-admin", async () => {
      const db = createTestDb();
      const app = await buildApp(db);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${userToken(app)}` },
      });
      expect(res.statusCode).toBe(403);

      await app.close();
    });
  });

  describe("PUT /api/v1/organizations/:orgId", () => {
    it("updates org name for admin", async () => {
      const updated = { id: TEST_ORG_ID, name: "New Name", ssoConfig: null, createdAt: "2025-01-01", updatedAt: "2025-01-02" };
      const db = createTestDb([], [[updated]]);
      const app = await buildApp(db);

      const res = await app.inject({
        method: "PUT",
        url: `/api/v1/organizations/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { name: "New Name" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().organization.name).toBe("New Name");

      await app.close();
    });

    it("rejects invalid body", async () => {
      const db = createTestDb();
      const app = await buildApp(db);

      const res = await app.inject({
        method: "PUT",
        url: `/api/v1/organizations/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { name: "" }, // too short
      });
      expect(res.statusCode).toBe(400);

      await app.close();
    });

    it("rejects non-admin", async () => {
      const db = createTestDb();
      const app = await buildApp(db);

      const res = await app.inject({
        method: "PUT",
        url: `/api/v1/organizations/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${userToken(app)}` },
        payload: { name: "New Name" },
      });
      expect(res.statusCode).toBe(403);

      await app.close();
    });

    it("returns 404 when update finds no org", async () => {
      const db = createTestDb([], [[]]);
      const app = await buildApp(db);

      const res = await app.inject({
        method: "PUT",
        url: `/api/v1/organizations/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { name: "New Name" },
      });
      expect(res.statusCode).toBe(404);

      await app.close();
    });
  });
});
