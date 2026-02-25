/**
 * Integration tests for auth routes.
 *
 * Tests email/password login endpoint via Fastify inject with a mock DB.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import {
  createTestApp,
  createMockDb,
  type MockDb,
  TEST_ORG_ID,
  TEST_USER_ID,
  testUser,
} from "../test/helpers.js";

describe("Auth Routes", () => {
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
  // POST /api/v1/auth/login
  // -------------------------------------------------------------------------

  describe("POST /api/v1/auth/login", () => {
    it("returns 400 for missing body fields", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toHaveProperty("error", "Invalid request body");
    });

    it("returns 400 for invalid email format", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: {
          email: "not-an-email",
          password: "password123",
          orgId: TEST_ORG_ID,
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 for non-UUID orgId", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: {
          email: "user@test.com",
          password: "password123",
          orgId: "not-a-uuid",
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 401 when user is not found", async () => {
      // Mock db.select to return empty (user not found)
      mockDb.select = vi.fn(() => {
        const obj: Record<string, unknown> = {};
        const methods = ["from", "where", "limit", "offset", "orderBy"];
        for (const m of methods) {
          obj[m] = vi.fn().mockReturnValue(obj);
        }
        obj.then = vi.fn((resolve: (v: unknown) => void) => resolve([]));
        return obj as ReturnType<MockDb["select"]>;
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: {
          email: "nonexistent@test.com",
          password: "password123",
          orgId: TEST_ORG_ID,
        },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: "Invalid email or password" });
    });

    it("returns 401 for wrong password", async () => {
      // Hash a known password
      const hash = await bcrypt.hash("correct-password", 4);
      const userWithHash = { ...testUser, passwordHash: hash };

      mockDb.select = vi.fn(() => {
        const obj: Record<string, unknown> = {};
        const methods = ["from", "where", "limit", "offset", "orderBy"];
        for (const m of methods) {
          obj[m] = vi.fn().mockReturnValue(obj);
        }
        obj.then = vi.fn((resolve: (v: unknown) => void) => resolve([userWithHash]));
        return obj as ReturnType<MockDb["select"]>;
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: {
          email: "user@test.com",
          password: "wrong-password",
          orgId: TEST_ORG_ID,
        },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: "Invalid email or password" });
    });

    it("returns tokens on successful login", async () => {
      const hash = await bcrypt.hash("password123", 4);
      const userWithHash = { ...testUser, passwordHash: hash };

      // select returns the user, update returns nothing (last seen update)
      mockDb.select = vi.fn(() => {
        const obj: Record<string, unknown> = {};
        const methods = ["from", "where", "limit", "offset", "orderBy"];
        for (const m of methods) {
          obj[m] = vi.fn().mockReturnValue(obj);
        }
        obj.then = vi.fn((resolve: (v: unknown) => void) => resolve([userWithHash]));
        return obj as ReturnType<MockDb["select"]>;
      });

      mockDb.update = vi.fn(() => {
        const obj: Record<string, unknown> = {};
        const methods = ["set", "where"];
        for (const m of methods) {
          obj[m] = vi.fn().mockReturnValue(obj);
        }
        obj.then = vi.fn((resolve: (v: unknown) => void) => resolve([]));
        return obj as ReturnType<MockDb["update"]>;
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: {
          email: "user@test.com",
          password: "password123",
          orgId: TEST_ORG_ID,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty("accessToken");
      expect(body).toHaveProperty("refreshToken");
      expect(body).toHaveProperty("expiresAt");
      expect(body).toHaveProperty("userId", TEST_USER_ID);
      expect(body).toHaveProperty("orgId", TEST_ORG_ID);
      expect(body).toHaveProperty("email", "user@test.com");
      expect(body).toHaveProperty("roles");
      expect(body.roles).toContain("user");

      // Verify the access token is a valid JWT
      const decoded = app.jwt.verify<{ userId: string; orgId: string }>(body.accessToken);
      expect(decoded.userId).toBe(TEST_USER_ID);
      expect(decoded.orgId).toBe(TEST_ORG_ID);
    });

    it("returns 401 for user without password hash (SSO-only)", async () => {
      const ssoUser = { ...testUser, passwordHash: null };

      mockDb.select = vi.fn(() => {
        const obj: Record<string, unknown> = {};
        const methods = ["from", "where", "limit", "offset", "orderBy"];
        for (const m of methods) {
          obj[m] = vi.fn().mockReturnValue(obj);
        }
        obj.then = vi.fn((resolve: (v: unknown) => void) => resolve([ssoUser]));
        return obj as ReturnType<MockDb["select"]>;
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: {
          email: "user@test.com",
          password: "password123",
          orgId: TEST_ORG_ID,
        },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: "Invalid email or password" });
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/auth/mode
  // -------------------------------------------------------------------------

  describe("GET /api/v1/auth/mode", () => {
    it("returns available auth methods", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/auth/mode",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ methods: ["password"] });
    });
  });
});
