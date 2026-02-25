import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { registerAuthMiddleware, requireAdmin, requireOrg } from "./auth.js";
import { JWT_SECRET, TEST_ORG_ID, TEST_ADMIN_ID, TEST_USER_ID } from "../test/helpers.js";

describe("auth middleware", () => {
  const app = Fastify({ logger: false });

  beforeAll(async () => {
    await app.register(jwt, { secret: JWT_SECRET });
    app.decorate("db", {} as never);
    await registerAuthMiddleware(app);

    // Test route behind auth
    app.get("/api/v1/test/protected", async (request, reply) => {
      if (!request.authUser) {
        return reply.code(401).send({ error: "Not authenticated" });
      }
      return reply.send({ user: request.authUser });
    });

    // Public endpoints should be skipped
    app.get("/health", async () => ({ status: "ok" }));

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("allows /health without auth", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("rejects requests without Authorization header", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/test/protected" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toMatch(/Missing or invalid/);
  });

  it("rejects requests with invalid token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/test/protected",
      headers: { authorization: "Bearer invalid-token" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toMatch(/Invalid or expired/);
  });

  it("accepts requests with valid token and sets authUser", async () => {
    const token = app.jwt.sign(
      { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, email: "admin@test.com", role: "admin" },
      { expiresIn: "1h" },
    );
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/test/protected",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.userId).toBe(TEST_ADMIN_ID);
    expect(body.user.role).toBe("admin");
  });

  it("rejects non-Bearer auth schemes", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/test/protected",
      headers: { authorization: "Basic dXNlcjpwYXNz" },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("requireAdmin", () => {
  it("returns 401 when no authUser", () => {
    const request = { authUser: undefined } as any;
    const reply = { code: (c: number) => ({ send: (b: unknown) => b }), sent: false } as any;
    requireAdmin(request, reply);
    expect(reply.code).toBeDefined();
  });

  it("returns 403 for non-admin user", () => {
    const request = { authUser: { userId: TEST_USER_ID, orgId: TEST_ORG_ID, email: "u@t.com", role: "user" } } as any;
    let statusCode = 0;
    let body: unknown;
    const reply = {
      sent: false,
      code(c: number) {
        statusCode = c;
        return { send(b: unknown) { body = b; } };
      },
    } as any;
    requireAdmin(request, reply);
    expect(statusCode).toBe(403);
    expect((body as any).error).toMatch(/Admin/);
  });

  it("does nothing for admin user", () => {
    const request = { authUser: { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, email: "a@t.com", role: "admin" } } as any;
    let called = false;
    const reply = {
      sent: false,
      code() { called = true; return { send() {} }; },
    } as any;
    requireAdmin(request, reply);
    expect(called).toBe(false);
  });
});

describe("requireOrg", () => {
  it("returns 403 for org mismatch", () => {
    const request = { authUser: { userId: TEST_ADMIN_ID, orgId: "other-org", email: "a@t.com", role: "admin" } } as any;
    let statusCode = 0;
    const reply = {
      sent: false,
      code(c: number) { statusCode = c; return { send() {} }; },
    } as any;
    requireOrg(request, reply, TEST_ORG_ID);
    expect(statusCode).toBe(403);
  });

  it("does nothing for matching org", () => {
    const request = { authUser: { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, email: "a@t.com", role: "admin" } } as any;
    let called = false;
    const reply = {
      sent: false,
      code() { called = true; return { send() {} }; },
    } as any;
    requireOrg(request, reply, TEST_ORG_ID);
    expect(called).toBe(false);
  });
});
