/**
 * Integration tests for the auth middleware.
 *
 * Uses Fastify inject to verify JWT authentication and RBAC guards.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  generateTestToken,
  generateExpiredToken,
  TEST_ORG_ID,
  TEST_USER_ID,
  TEST_ADMIN_ID,
} from "../test/helpers.js";

describe("Auth Middleware", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  // -------------------------------------------------------------------------
  // Public endpoints bypass auth
  // -------------------------------------------------------------------------

  describe("public endpoints", () => {
    it("allows /health without auth", async () => {
      const res = await app.inject({ method: "GET", url: "/health" });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: "ok" });
    });

    it("allows /api/v1/auth/mode without auth", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/auth/mode" });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveProperty("methods");
    });

    it("allows /api/v1/auth/login without auth (will fail validation, not 401)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: {},
      });

      // Should get 400 (validation error), not 401 (auth error)
      expect(res.statusCode).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // Missing / invalid tokens
  // -------------------------------------------------------------------------

  describe("missing token", () => {
    it("returns 401 for protected routes without Authorization header", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/policies/${TEST_ORG_ID}/effective`,
      });

      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: "Missing or invalid Authorization header" });
    });

    it("returns 401 for non-Bearer authorization", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/policies/${TEST_ORG_ID}/effective`,
        headers: { authorization: "Basic dXNlcjpwYXNz" },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: "Missing or invalid Authorization header" });
    });
  });

  // -------------------------------------------------------------------------
  // Expired token
  // -------------------------------------------------------------------------

  describe("expired token", () => {
    it("returns 401 for an expired JWT", async () => {
      const expiredToken = generateExpiredToken(app);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/policies/${TEST_ORG_ID}/effective`,
        headers: { authorization: `Bearer ${expiredToken}` },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: "Invalid or expired token" });
    });
  });

  // -------------------------------------------------------------------------
  // Valid token
  // -------------------------------------------------------------------------

  describe("valid token", () => {
    it("allows access to protected routes with a valid JWT", async () => {
      const token = generateTestToken(app, {
        userId: TEST_USER_ID,
        orgId: TEST_ORG_ID,
        role: "user",
      });

      // This will hit the policy route which will call db.select() on the mock,
      // returning empty. We just verify we get past auth (not a 401).
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/policies/${TEST_ORG_ID}/effective`,
        headers: { authorization: `Bearer ${token}` },
      });

      // Should be 404 (no policy found) or 200, not 401
      expect(res.statusCode).not.toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // Org mismatch
  // -------------------------------------------------------------------------

  describe("org mismatch", () => {
    it("returns 403 when user's orgId does not match route orgId", async () => {
      const differentOrgId = "11111111-1111-4000-8000-111111111111";
      const token = generateTestToken(app, {
        userId: TEST_USER_ID,
        orgId: differentOrgId,
        role: "user",
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/policies/${TEST_ORG_ID}/effective`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: "Access denied: organization mismatch" });
    });
  });

  // -------------------------------------------------------------------------
  // Admin guard
  // -------------------------------------------------------------------------

  describe("admin guard", () => {
    it("returns 403 when a non-admin accesses admin-only route", async () => {
      const token = generateTestToken(app, {
        userId: TEST_USER_ID,
        orgId: TEST_ORG_ID,
        role: "user",
      });

      // GET /api/v1/policies/:orgId is admin-only
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/policies/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: "Admin or viewer access required" });
    });

    it("allows admin access to admin-only routes", async () => {
      const token = generateTestToken(app, {
        userId: TEST_ADMIN_ID,
        orgId: TEST_ORG_ID,
        role: "admin",
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/policies/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${token}` },
      });

      // Should get 404 (no policy) not 403
      expect(res.statusCode).not.toBe(403);
      expect(res.statusCode).not.toBe(401);
    });
  });
});
