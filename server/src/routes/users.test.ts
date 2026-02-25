import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import jwtPlugin from "@fastify/jwt";
import { registerAuthMiddleware } from "../middleware/auth.js";
import { userRoutes } from "./users.js";
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

function createTestDb(selectResults: unknown[][] = [[]], insertResults: unknown[][] = [[]], updateResults: unknown[][] = [[]], deleteResults: unknown[][] = [[]]) {
  let selectCall = 0;
  let insertCall = 0;
  let updateCall = 0;
  let deleteCall = 0;
  return {
    select: vi.fn(() => makeChain(selectResults[selectCall++] ?? [])),
    insert: vi.fn(() => makeChain(insertResults[insertCall++] ?? [])),
    update: vi.fn(() => makeChain(updateResults[updateCall++] ?? [])),
    delete: vi.fn(() => makeChain(deleteResults[deleteCall++] ?? [])),
  };
}

async function buildApp(db: any) {
  const app = Fastify({ logger: false });
  await app.register(jwtPlugin, { secret: JWT_SECRET });
  app.decorate("db", db as never);
  await registerAuthMiddleware(app);
  await app.register(userRoutes);
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

describe("user routes", () => {
  describe("GET /api/v1/users/:orgId", () => {
    it("lists users for admin", async () => {
      const users = [{ id: TEST_USER_ID, email: "u@t.com", name: "User", role: "user" }];
      const db = createTestDb([[...users]]);
      const app = await buildApp(db);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/users/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().users).toEqual(users);

      await app.close();
    });

    it("rejects non-admin", async () => {
      const db = createTestDb();
      const app = await buildApp(db);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/users/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${userToken(app)}` },
      });
      expect(res.statusCode).toBe(403);

      await app.close();
    });
  });

  describe("POST /api/v1/users/:orgId", () => {
    it("creates a user for admin", async () => {
      const created = { id: "new-id", email: "new@test.com", name: "New", role: "user", createdAt: new Date().toISOString() };
      // select for duplicate check returns empty, insert returns created
      const db = createTestDb([[]], [[created]]);
      const app = await buildApp(db);

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/users/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { email: "new@test.com", name: "New", role: "user", password: "pass123" },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().user.email).toBe("new@test.com");

      await app.close();
    });

    it("rejects duplicate email", async () => {
      const db = createTestDb([[{ id: "existing" }]]); // duplicate found
      const app = await buildApp(db);

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/users/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { email: "dup@test.com", password: "pass123" },
      });
      expect(res.statusCode).toBe(409);

      await app.close();
    });

    it("rejects invalid email", async () => {
      const db = createTestDb();
      const app = await buildApp(db);

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/users/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { email: "not-an-email" },
      });
      expect(res.statusCode).toBe(400);

      await app.close();
    });
  });

  describe("PUT /api/v1/users/:orgId/:userId", () => {
    it("updates user role", async () => {
      const target = { id: TEST_USER_ID, orgId: TEST_ORG_ID, role: "user" };
      const updated = { ...target, role: "admin", email: "u@t.com", name: "U", lastSeenAt: null, createdAt: new Date().toISOString() };
      const db = createTestDb([[target]], [], [[updated]]);
      const app = await buildApp(db);

      const res = await app.inject({
        method: "PUT",
        url: `/api/v1/users/${TEST_ORG_ID}/${TEST_USER_ID}`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { role: "admin" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().user.role).toBe("admin");

      await app.close();
    });

    it("returns 404 for non-existent user", async () => {
      const db = createTestDb([[]]); // user not found
      const app = await buildApp(db);

      const res = await app.inject({
        method: "PUT",
        url: `/api/v1/users/${TEST_ORG_ID}/${TEST_USER_ID}`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { name: "New Name" },
      });
      expect(res.statusCode).toBe(404);

      await app.close();
    });

    it("rejects empty update", async () => {
      const target = { id: TEST_USER_ID, orgId: TEST_ORG_ID, role: "user" };
      const db = createTestDb([[target]]);
      const app = await buildApp(db);

      const res = await app.inject({
        method: "PUT",
        url: `/api/v1/users/${TEST_ORG_ID}/${TEST_USER_ID}`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/No fields/);

      await app.close();
    });

    it("prevents demoting last admin", async () => {
      const target = { id: TEST_USER_ID, orgId: TEST_ORG_ID, role: "admin" };
      // First select: find user, second select: admin count = 1
      const db = createTestDb([[target], [{ id: TEST_USER_ID }]]);
      const app = await buildApp(db);

      const res = await app.inject({
        method: "PUT",
        url: `/api/v1/users/${TEST_ORG_ID}/${TEST_USER_ID}`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { role: "user" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/last admin/);

      await app.close();
    });
  });

  describe("DELETE /api/v1/users/:orgId/:userId", () => {
    it("deletes a user", async () => {
      const target = { id: TEST_USER_ID, orgId: TEST_ORG_ID, role: "user", email: "u@t.com" };
      const db = createTestDb([[target]], [], [], [[]]);
      const app = await buildApp(db);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/v1/users/${TEST_ORG_ID}/${TEST_USER_ID}`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ success: true });

      await app.close();
    });

    it("prevents self-deletion", async () => {
      const db = createTestDb();
      const app = await buildApp(db);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/v1/users/${TEST_ORG_ID}/${TEST_ADMIN_ID}`, // same as token userId
        headers: { authorization: `Bearer ${adminToken(app)}` },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/own account/);

      await app.close();
    });

    it("prevents deleting last admin", async () => {
      const target = { id: TEST_USER_ID, orgId: TEST_ORG_ID, role: "admin", email: "u@t.com" };
      // First select: target user, second select: admin count = 1
      const db = createTestDb([[target], [{ id: target.id }]]);
      const app = await buildApp(db);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/v1/users/${TEST_ORG_ID}/${TEST_USER_ID}`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/last admin/);

      await app.close();
    });

    it("returns 404 for non-existent user", async () => {
      const db = createTestDb([[]]); // not found
      const app = await buildApp(db);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/v1/users/${TEST_ORG_ID}/${TEST_USER_ID}`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
      });
      expect(res.statusCode).toBe(404);

      await app.close();
    });
  });
});
