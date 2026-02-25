import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import jwtPlugin from "@fastify/jwt";
import { registerAuthMiddleware } from "../middleware/auth.js";
import { enrollmentRoutes } from "./enrollment.js";
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

function createTestDb(selectResults: unknown[][] = [[]], insertResults: unknown[][] = [[]], updateResults: unknown[][] = [[]]) {
  let selectCall = 0;
  let insertCall = 0;
  let updateCall = 0;
  return {
    select: vi.fn(() => makeChain(selectResults[selectCall++] ?? [])),
    insert: vi.fn(() => makeChain(insertResults[insertCall++] ?? [])),
    update: vi.fn(() => makeChain(updateResults[updateCall++] ?? [])),
    delete: vi.fn(() => makeChain([])),
  };
}

async function buildApp(db: any) {
  const app = Fastify({ logger: false });
  await app.register(jwtPlugin, { secret: JWT_SECRET });
  app.decorate("db", db as never);
  await registerAuthMiddleware(app);
  await app.register(enrollmentRoutes);
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

describe("enrollment routes", () => {
  describe("POST /api/v1/enrollment-tokens/:orgId", () => {
    it("creates an enrollment token for admin", async () => {
      const created = {
        id: "t1",
        token: "abc123",
        label: "dev-team",
        expiresAt: null,
        maxUses: 10,
        usedCount: 0,
        createdAt: new Date().toISOString(),
      };
      const db = createTestDb([], [[created]]);
      const app = await buildApp(db);

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/enrollment-tokens/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { label: "dev-team", maxUses: 10 },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().label).toBe("dev-team");

      await app.close();
    });

    it("rejects non-admin", async () => {
      const db = createTestDb();
      const app = await buildApp(db);

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/enrollment-tokens/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${userToken(app)}` },
        payload: { label: "test" },
      });
      expect(res.statusCode).toBe(403);

      await app.close();
    });
  });

  describe("GET /api/v1/enrollment-tokens/:orgId", () => {
    it("lists tokens for admin", async () => {
      const tokens = [{ id: "t1", token: "abc", label: "test" }];
      const db = createTestDb([tokens]);
      const app = await buildApp(db);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/enrollment-tokens/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().tokens).toHaveLength(1);

      await app.close();
    });
  });

  describe("DELETE /api/v1/enrollment-tokens/:orgId/:tokenId", () => {
    it("revokes a token", async () => {
      const revoked = { id: "t1", revokedAt: new Date() };
      const db = createTestDb([], [], [[revoked]]);
      const app = await buildApp(db);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/v1/enrollment-tokens/${TEST_ORG_ID}/t1`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ success: true });

      await app.close();
    });

    it("returns 404 for non-existent token", async () => {
      const db = createTestDb([], [], [[]]);
      const app = await buildApp(db);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/v1/enrollment-tokens/${TEST_ORG_ID}/nonexistent`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
      });
      expect(res.statusCode).toBe(404);

      await app.close();
    });
  });

  describe("POST /api/v1/auth/enroll", () => {
    it("enrolls a new user with valid token", async () => {
      const enrollToken = {
        id: "t1",
        orgId: TEST_ORG_ID,
        token: "valid-token",
        revokedAt: null,
        expiresAt: null,
        maxUses: null,
        usedCount: 0,
      };
      const newUser = {
        id: "new-user-id",
        orgId: TEST_ORG_ID,
        email: "new@test.com",
        role: "user",
      };

      // select token, select existing user (empty), insert user, update token count
      const db = createTestDb(
        [[enrollToken], []], // two selects
        [[newUser]], // insert returns new user
        [[]], // update token count
      );
      const app = await buildApp(db);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/enroll",
        payload: { token: "valid-token", email: "new@test.com", name: "New User" },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.accessToken).toBeDefined();
      expect(body.refreshToken).toBeDefined();
      expect(body.email).toBe("new@test.com");

      await app.close();
    });

    it("rejects invalid enrollment token", async () => {
      const db = createTestDb([[]]); // no token found
      const app = await buildApp(db);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/enroll",
        payload: { token: "invalid", email: "new@test.com" },
      });
      expect(res.statusCode).toBe(401);

      await app.close();
    });

    it("rejects revoked token", async () => {
      const enrollToken = {
        id: "t1",
        orgId: TEST_ORG_ID,
        token: "revoked-token",
        revokedAt: new Date(),
        expiresAt: null,
        maxUses: null,
        usedCount: 0,
      };
      const db = createTestDb([[enrollToken]]);
      const app = await buildApp(db);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/enroll",
        payload: { token: "revoked-token", email: "new@test.com" },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toMatch(/revoked/);

      await app.close();
    });

    it("rejects expired token", async () => {
      const enrollToken = {
        id: "t1",
        orgId: TEST_ORG_ID,
        token: "expired-token",
        revokedAt: null,
        expiresAt: new Date("2020-01-01"),
        maxUses: null,
        usedCount: 0,
      };
      const db = createTestDb([[enrollToken]]);
      const app = await buildApp(db);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/enroll",
        payload: { token: "expired-token", email: "new@test.com" },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toMatch(/expired/);

      await app.close();
    });

    it("rejects token at usage limit", async () => {
      const enrollToken = {
        id: "t1",
        orgId: TEST_ORG_ID,
        token: "maxed-token",
        revokedAt: null,
        expiresAt: null,
        maxUses: 5,
        usedCount: 5,
      };
      const db = createTestDb([[enrollToken]]);
      const app = await buildApp(db);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/enroll",
        payload: { token: "maxed-token", email: "new@test.com" },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toMatch(/usage limit/);

      await app.close();
    });

    it("rejects duplicate user email", async () => {
      const enrollToken = {
        id: "t1",
        orgId: TEST_ORG_ID,
        token: "valid-token",
        revokedAt: null,
        expiresAt: null,
        maxUses: null,
        usedCount: 0,
      };
      const existingUser = { id: "existing", email: "dup@test.com" };
      const db = createTestDb([[enrollToken], [existingUser]]);
      const app = await buildApp(db);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/enroll",
        payload: { token: "valid-token", email: "dup@test.com" },
      });
      expect(res.statusCode).toBe(409);

      await app.close();
    });

    it("rejects invalid body", async () => {
      const db = createTestDb();
      const app = await buildApp(db);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/enroll",
        payload: { token: "", email: "not-email" },
      });
      expect(res.statusCode).toBe(400);

      await app.close();
    });
  });
});
