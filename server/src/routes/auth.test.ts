import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import jwtPlugin from "@fastify/jwt";
import bcrypt from "bcryptjs";
import { registerAuthMiddleware } from "../middleware/auth.js";
import { authRoutes } from "./auth.js";
import { JWT_SECRET, TEST_ORG_ID, TEST_USER_ID, TEST_ADMIN_ID } from "../test/helpers.js";

// Mock OIDC service since it hits external endpoints
vi.mock("../services/oidc-service.js", () => ({
  exchangeCodeAtIdp: vi.fn(),
  verifyIdToken: vi.fn(),
}));

function createMockDb(overrides: Record<string, unknown> = {}) {
  const defaults = {
    selectResult: [] as unknown[],
    insertResult: [] as unknown[],
    updateResult: [] as unknown[],
  };
  const opts = { ...defaults, ...overrides };

  const chain = () => {
    const c: any = {};
    for (const m of ["select", "from", "where", "limit", "orderBy", "set", "values", "returning", "insert", "update", "delete"]) {
      c[m] = vi.fn().mockReturnValue(c);
    }
    return c;
  };

  const selectChain = chain();
  // Make select chain resolve to selectResult (it's awaited directly)
  selectChain[Symbol.for("nodejs.util.inspect.custom")] = undefined;
  selectChain.then = (resolve: (v: unknown) => void) => resolve(opts.selectResult);

  const insertChain = chain();
  insertChain.then = (resolve: (v: unknown) => void) => resolve(opts.insertResult);

  const updateChain = chain();
  updateChain.then = (resolve: (v: unknown) => void) => resolve(opts.updateResult);

  return {
    select: vi.fn().mockReturnValue(selectChain),
    insert: vi.fn().mockReturnValue(insertChain),
    update: vi.fn().mockReturnValue(updateChain),
    delete: vi.fn().mockReturnValue(chain()),
  };
}

describe("auth routes", () => {
  describe("GET /api/v1/auth/mode", () => {
    it("returns available auth methods", async () => {
      const app = Fastify({ logger: false });
      await app.register(jwtPlugin, { secret: JWT_SECRET });
      app.decorate("db", createMockDb() as never);
      await registerAuthMiddleware(app);
      await app.register(authRoutes);
      await app.ready();

      const res = await app.inject({ method: "GET", url: "/api/v1/auth/mode" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ methods: ["password"] });

      await app.close();
    });
  });

  describe("POST /api/v1/auth/login", () => {
    it("rejects invalid body", async () => {
      const app = Fastify({ logger: false });
      await app.register(jwtPlugin, { secret: JWT_SECRET });
      app.decorate("db", createMockDb() as never);
      await registerAuthMiddleware(app);
      await app.register(authRoutes);
      await app.ready();

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "not-an-email" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/Invalid/);

      await app.close();
    });

    it("rejects wrong password", async () => {
      const hash = await bcrypt.hash("correct-pass", 4);
      const mockUser = {
        id: TEST_USER_ID,
        orgId: TEST_ORG_ID,
        email: "user@test.com",
        role: "user",
        passwordHash: hash,
      };
      const mockOrg = { id: TEST_ORG_ID, name: "Test Org" };

      const app = Fastify({ logger: false });
      await app.register(jwtPlugin, { secret: JWT_SECRET });

      // Build chainable mocks that return different results for different queries
      const selectFn = vi.fn();
      const makeChain = (result: unknown[]) => {
        const c: any = {};
        for (const m of ["from", "where", "limit", "orderBy"]) {
          c[m] = vi.fn().mockReturnValue(c);
        }
        c.then = (resolve: (v: unknown) => void) => resolve(result);
        return c;
      };

      // First select = organizations lookup, second = users lookup
      selectFn
        .mockReturnValueOnce(makeChain([mockOrg]))
        .mockReturnValueOnce(makeChain([mockUser]));

      const updateChain: any = {};
      for (const m of ["set", "where"]) {
        updateChain[m] = vi.fn().mockReturnValue(updateChain);
      }
      updateChain.then = (resolve: (v: unknown) => void) => resolve([]);

      app.decorate("db", {
        select: selectFn,
        update: vi.fn().mockReturnValue(updateChain),
        insert: vi.fn(),
        delete: vi.fn(),
      } as never);

      await registerAuthMiddleware(app);
      await app.register(authRoutes);
      await app.ready();

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "user@test.com", password: "wrong-pass", orgId: TEST_ORG_ID },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toMatch(/Invalid email or password/);

      await app.close();
    });

    it("succeeds with correct credentials", async () => {
      const hash = await bcrypt.hash("correct-pass", 4);
      const mockUser = {
        id: TEST_USER_ID,
        orgId: TEST_ORG_ID,
        email: "user@test.com",
        role: "user",
        passwordHash: hash,
      };

      const app = Fastify({ logger: false });
      await app.register(jwtPlugin, { secret: JWT_SECRET });

      const selectFn = vi.fn();
      const makeChain = (result: unknown[]) => {
        const c: any = {};
        for (const m of ["from", "where", "limit", "orderBy"]) {
          c[m] = vi.fn().mockReturnValue(c);
        }
        c.then = (resolve: (v: unknown) => void) => resolve(result);
        return c;
      };

      // When orgId is provided, the org query is skipped – first select is users
      selectFn.mockReturnValueOnce(makeChain([mockUser]));

      const updateChain: any = {};
      for (const m of ["set", "where"]) {
        updateChain[m] = vi.fn().mockReturnValue(updateChain);
      }
      updateChain.then = (resolve: (v: unknown) => void) => resolve([]);

      app.decorate("db", {
        select: selectFn,
        update: vi.fn().mockReturnValue(updateChain),
        insert: vi.fn(),
        delete: vi.fn(),
      } as never);

      await registerAuthMiddleware(app);
      await app.register(authRoutes);
      await app.ready();

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "user@test.com", password: "correct-pass", orgId: TEST_ORG_ID },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.accessToken).toBeDefined();
      expect(body.refreshToken).toBeDefined();
      expect(body.userId).toBe(TEST_USER_ID);
      expect(body.email).toBe("user@test.com");
      expect(body.roles).toEqual(["user"]);

      await app.close();
    });

    it("returns 401 for non-existent user", async () => {
      const app = Fastify({ logger: false });
      await app.register(jwtPlugin, { secret: JWT_SECRET });

      const selectFn = vi.fn();
      const makeChain = (result: unknown[]) => {
        const c: any = {};
        for (const m of ["from", "where", "limit", "orderBy"]) {
          c[m] = vi.fn().mockReturnValue(c);
        }
        c.then = (resolve: (v: unknown) => void) => resolve(result);
        return c;
      };

      const mockOrg = { id: TEST_ORG_ID };
      selectFn
        .mockReturnValueOnce(makeChain([mockOrg]))
        .mockReturnValueOnce(makeChain([])); // no user found

      app.decorate("db", {
        select: selectFn,
        update: vi.fn(),
        insert: vi.fn(),
        delete: vi.fn(),
      } as never);

      await registerAuthMiddleware(app);
      await app.register(authRoutes);
      await app.ready();

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "nobody@test.com", password: "pass123", orgId: TEST_ORG_ID },
      });
      expect(res.statusCode).toBe(401);

      await app.close();
    });
  });

  describe("POST /api/v1/auth/exchange (refresh_token)", () => {
    it("rejects invalid refresh token", async () => {
      const app = Fastify({ logger: false });
      await app.register(jwtPlugin, { secret: JWT_SECRET });
      app.decorate("db", createMockDb() as never);
      await registerAuthMiddleware(app);
      await app.register(authRoutes);
      await app.ready();

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/exchange",
        payload: { grantType: "refresh_token", refreshToken: "invalid" },
      });
      expect(res.statusCode).toBe(401);

      await app.close();
    });

    it("rejects non-refresh token type", async () => {
      const app = Fastify({ logger: false });
      await app.register(jwtPlugin, { secret: JWT_SECRET });
      app.decorate("db", createMockDb() as never);
      await registerAuthMiddleware(app);
      await app.register(authRoutes);
      await app.ready();

      // Sign an access token (no type: "refresh")
      const accessToken = app.jwt.sign(
        { userId: TEST_USER_ID, orgId: TEST_ORG_ID, email: "u@t.com", role: "user" },
        { expiresIn: "1h" },
      );

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/exchange",
        payload: { grantType: "refresh_token", refreshToken: accessToken },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/Invalid refresh token/);

      await app.close();
    });

    it("issues new tokens with valid refresh token", async () => {
      const app = Fastify({ logger: false });
      await app.register(jwtPlugin, { secret: JWT_SECRET });

      const updateChain: any = {};
      for (const m of ["set", "where"]) {
        updateChain[m] = vi.fn().mockReturnValue(updateChain);
      }
      updateChain.then = (resolve: (v: unknown) => void) => resolve([]);

      app.decorate("db", {
        select: vi.fn(),
        update: vi.fn().mockReturnValue(updateChain),
        insert: vi.fn(),
        delete: vi.fn(),
      } as never);

      await registerAuthMiddleware(app);
      await app.register(authRoutes);
      await app.ready();

      const refreshToken = app.jwt.sign(
        { userId: TEST_USER_ID, orgId: TEST_ORG_ID, email: "u@t.com", role: "user", type: "refresh" },
        { expiresIn: "30d" },
      );

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/exchange",
        payload: { grantType: "refresh_token", refreshToken },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.accessToken).toBeDefined();
      expect(body.refreshToken).toBeDefined();
      expect(body.userId).toBe(TEST_USER_ID);

      await app.close();
    });
  });

  describe("POST /api/v1/auth/change-password", () => {
    it("rejects unauthenticated requests", async () => {
      const app = Fastify({ logger: false });
      await app.register(jwtPlugin, { secret: JWT_SECRET });
      app.decorate("db", createMockDb() as never);
      await registerAuthMiddleware(app);
      await app.register(authRoutes);
      await app.ready();

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/change-password",
        payload: { currentPassword: "old", newPassword: "newpass" },
      });
      expect(res.statusCode).toBe(401);

      await app.close();
    });

    it("rejects invalid body", async () => {
      const app = Fastify({ logger: false });
      await app.register(jwtPlugin, { secret: JWT_SECRET });
      app.decorate("db", createMockDb() as never);
      await registerAuthMiddleware(app);
      await app.register(authRoutes);
      await app.ready();

      const token = app.jwt.sign(
        { userId: TEST_USER_ID, orgId: TEST_ORG_ID, email: "u@t.com", role: "user" },
        { expiresIn: "1h" },
      );

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/change-password",
        headers: { authorization: `Bearer ${token}` },
        payload: { currentPassword: "", newPassword: "ab" }, // too short new password
      });
      expect(res.statusCode).toBe(400);

      await app.close();
    });

    it("rejects wrong current password", async () => {
      const hash = await bcrypt.hash("real-pass", 4);
      const app = Fastify({ logger: false });
      await app.register(jwtPlugin, { secret: JWT_SECRET });

      const selectFn = vi.fn();
      const makeChain = (result: unknown[]) => {
        const c: any = {};
        for (const m of ["from", "where", "limit", "orderBy"]) {
          c[m] = vi.fn().mockReturnValue(c);
        }
        c.then = (resolve: (v: unknown) => void) => resolve(result);
        return c;
      };
      selectFn.mockReturnValue(makeChain([{ id: TEST_USER_ID, passwordHash: hash }]));

      app.decorate("db", {
        select: selectFn,
        update: vi.fn(),
        insert: vi.fn(),
        delete: vi.fn(),
      } as never);
      await registerAuthMiddleware(app);
      await app.register(authRoutes);
      await app.ready();

      const token = app.jwt.sign(
        { userId: TEST_USER_ID, orgId: TEST_ORG_ID, email: "u@t.com", role: "user" },
        { expiresIn: "1h" },
      );

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/change-password",
        headers: { authorization: `Bearer ${token}` },
        payload: { currentPassword: "wrong-pass", newPassword: "newpass123" },
      });
      expect(res.statusCode).toBe(401);

      await app.close();
    });

    it("succeeds with correct current password", async () => {
      const hash = await bcrypt.hash("real-pass", 4);
      const app = Fastify({ logger: false });
      await app.register(jwtPlugin, { secret: JWT_SECRET });

      const selectFn = vi.fn();
      const makeChain = (result: unknown[]) => {
        const c: any = {};
        for (const m of ["from", "where", "limit", "orderBy"]) {
          c[m] = vi.fn().mockReturnValue(c);
        }
        c.then = (resolve: (v: unknown) => void) => resolve(result);
        return c;
      };
      selectFn.mockReturnValue(makeChain([{ id: TEST_USER_ID, passwordHash: hash }]));

      const updateChain: any = {};
      for (const m of ["set", "where"]) {
        updateChain[m] = vi.fn().mockReturnValue(updateChain);
      }
      updateChain.then = (resolve: (v: unknown) => void) => resolve([]);

      app.decorate("db", {
        select: selectFn,
        update: vi.fn().mockReturnValue(updateChain),
        insert: vi.fn(),
        delete: vi.fn(),
      } as never);

      await registerAuthMiddleware(app);
      await app.register(authRoutes);
      await app.ready();

      const token = app.jwt.sign(
        { userId: TEST_USER_ID, orgId: TEST_ORG_ID, email: "u@t.com", role: "user" },
        { expiresIn: "1h" },
      );

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/change-password",
        headers: { authorization: `Bearer ${token}` },
        payload: { currentPassword: "real-pass", newPassword: "newpass123" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ success: true });

      await app.close();
    });
  });
});
