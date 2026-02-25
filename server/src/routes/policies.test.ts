import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import Fastify from "fastify";
import jwtPlugin from "@fastify/jwt";
import { registerAuthMiddleware } from "../middleware/auth.js";
import { policyRoutes } from "./policies.js";
import { JWT_SECRET, TEST_ORG_ID, TEST_ADMIN_ID, TEST_USER_ID } from "../test/helpers.js";

// Shared mock fns
const mockGetEffectivePolicy = vi.fn();
const mockGetOrgPolicy = vi.fn();
const mockUpsertOrgPolicy = vi.fn();
const mockSetKillSwitch = vi.fn();

vi.mock("../services/policy-service.js", () => ({
  PolicyService: class {
    getEffectivePolicy = mockGetEffectivePolicy;
    getOrgPolicy = mockGetOrgPolicy;
    upsertOrgPolicy = mockUpsertOrgPolicy;
    setKillSwitch = mockSetKillSwitch;
  },
}));

vi.mock("../services/admin-audit.js", () => ({
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}));

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(jwtPlugin, { secret: JWT_SECRET });
  app.decorate("db", {} as never);
  await registerAuthMiddleware(app);
  await app.register(policyRoutes);
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

describe("policy routes", () => {
  describe("GET /api/v1/policies/:orgId/effective", () => {
    it("returns effective policy for authenticated user", async () => {
      const app = await buildApp();
      const policy = {
        version: 1,
        tools: { deny: ["rm"] },
        skills: { approved: [], requireApproval: true },
        killSwitch: { active: false },
        auditLevel: "metadata",
      };
      mockGetEffectivePolicy.mockResolvedValueOnce(policy);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/policies/${TEST_ORG_ID}/effective`,
        headers: { authorization: `Bearer ${userToken(app)}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(policy);

      await app.close();
    });

    it("returns 404 when no policy configured", async () => {
      const app = await buildApp();
      mockGetEffectivePolicy.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/policies/${TEST_ORG_ID}/effective`,
        headers: { authorization: `Bearer ${userToken(app)}` },
      });
      expect(res.statusCode).toBe(404);

      await app.close();
    });

    it("rejects unauthenticated requests", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/policies/${TEST_ORG_ID}/effective`,
      });
      expect(res.statusCode).toBe(401);

      await app.close();
    });

    it("rejects org mismatch", async () => {
      const app = await buildApp();
      const otherOrg = "00000000-0000-0000-0000-000000000099";
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/policies/${otherOrg}/effective`,
        headers: { authorization: `Bearer ${userToken(app)}` },
      });
      expect(res.statusCode).toBe(403);

      await app.close();
    });
  });

  describe("GET /api/v1/policies/:orgId", () => {
    it("returns org policy for admin", async () => {
      const app = await buildApp();
      const policy = { id: "p1", orgId: TEST_ORG_ID, version: 3 };
      mockGetOrgPolicy.mockResolvedValueOnce(policy);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/policies/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(policy);

      await app.close();
    });

    it("rejects non-admin", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/policies/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${userToken(app)}` },
      });
      expect(res.statusCode).toBe(403);

      await app.close();
    });
  });

  describe("PUT /api/v1/policies/:orgId", () => {
    it("updates policy for admin", async () => {
      const app = await buildApp();
      const updated = { id: "p1", orgId: TEST_ORG_ID, version: 4 };
      mockUpsertOrgPolicy.mockResolvedValueOnce(updated);

      const res = await app.inject({
        method: "PUT",
        url: `/api/v1/policies/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { toolsConfig: { deny: ["rm", "exec"] } },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(updated);

      await app.close();
    });

    it("rejects invalid body", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "PUT",
        url: `/api/v1/policies/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { toolsConfig: { allow: 123 } }, // invalid type
      });
      expect(res.statusCode).toBe(400);

      await app.close();
    });

    it("rejects non-admin", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "PUT",
        url: `/api/v1/policies/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${userToken(app)}` },
        payload: { toolsConfig: { deny: ["rm"] } },
      });
      expect(res.statusCode).toBe(403);

      await app.close();
    });
  });

  describe("PUT /api/v1/policies/:orgId/kill-switch", () => {
    it("activates kill switch for admin", async () => {
      const app = await buildApp();
      const updated = { id: "p1", orgId: TEST_ORG_ID, killSwitch: true };
      mockSetKillSwitch.mockResolvedValueOnce(updated);

      const res = await app.inject({
        method: "PUT",
        url: `/api/v1/policies/${TEST_ORG_ID}/kill-switch`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { active: true, message: "Emergency shutdown" },
      });
      expect(res.statusCode).toBe(200);

      await app.close();
    });

    it("rejects invalid body", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "PUT",
        url: `/api/v1/policies/${TEST_ORG_ID}/kill-switch`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { active: "yes" }, // should be boolean
      });
      expect(res.statusCode).toBe(400);

      await app.close();
    });

    it("rejects non-admin", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "PUT",
        url: `/api/v1/policies/${TEST_ORG_ID}/kill-switch`,
        headers: { authorization: `Bearer ${userToken(app)}` },
        payload: { active: true },
      });
      expect(res.statusCode).toBe(403);

      await app.close();
    });
  });
});
