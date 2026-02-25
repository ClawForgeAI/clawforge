import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import jwtPlugin from "@fastify/jwt";
import { registerAuthMiddleware } from "../middleware/auth.js";
import { skillRoutes } from "./skills.js";
import { JWT_SECRET, TEST_ORG_ID, TEST_ADMIN_ID, TEST_USER_ID } from "../test/helpers.js";

const mockSubmitSkill = vi.fn();
const mockListPending = vi.fn();
const mockReviewSubmission = vi.fn();
const mockListApproved = vi.fn();
const mockListAllApproved = vi.fn();
const mockRevokeApproval = vi.fn();
const mockResubmitForReview = vi.fn();

vi.mock("../services/skill-review-service.js", () => ({
  SkillReviewService: class {
    submitSkill = mockSubmitSkill;
    listPending = mockListPending;
    reviewSubmission = mockReviewSubmission;
    listApproved = mockListApproved;
    listAllApproved = mockListAllApproved;
    revokeApproval = mockRevokeApproval;
    resubmitForReview = mockResubmitForReview;
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
  await app.register(skillRoutes);
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

describe("skill routes", () => {
  describe("POST /api/v1/skills/:orgId/submit", () => {
    it("submits a skill for review", async () => {
      const app = await buildApp();
      const submission = { id: "s1", skillName: "my-skill", status: "pending" };
      mockSubmitSkill.mockResolvedValueOnce(submission);

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/skills/${TEST_ORG_ID}/submit`,
        headers: { authorization: `Bearer ${userToken(app)}` },
        payload: { skillName: "my-skill" },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().skillName).toBe("my-skill");

      await app.close();
    });

    it("rejects invalid body", async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/skills/${TEST_ORG_ID}/submit`,
        headers: { authorization: `Bearer ${userToken(app)}` },
        payload: { skillName: "" }, // empty name
      });
      expect(res.statusCode).toBe(400);

      await app.close();
    });

    it("rejects unauthenticated", async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/skills/${TEST_ORG_ID}/submit`,
        payload: { skillName: "test" },
      });
      expect(res.statusCode).toBe(401);

      await app.close();
    });
  });

  describe("GET /api/v1/skills/:orgId/review", () => {
    it("lists pending submissions for admin", async () => {
      const app = await buildApp();
      const pending = [{ id: "s1", skillName: "skill-a", status: "pending" }];
      mockListPending.mockResolvedValueOnce(pending);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/skills/${TEST_ORG_ID}/review`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().submissions).toEqual(pending);

      await app.close();
    });

    it("rejects non-admin", async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/skills/${TEST_ORG_ID}/review`,
        headers: { authorization: `Bearer ${userToken(app)}` },
      });
      expect(res.statusCode).toBe(403);

      await app.close();
    });
  });

  describe("PUT /api/v1/skills/:orgId/review/:id", () => {
    it("approves a skill submission", async () => {
      const app = await buildApp();
      const updated = { id: "s1", skillName: "skill-a", status: "approved-org" };
      mockReviewSubmission.mockResolvedValueOnce(updated);

      const res = await app.inject({
        method: "PUT",
        url: `/api/v1/skills/${TEST_ORG_ID}/review/s1`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { status: "approved-org" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("approved-org");

      await app.close();
    });

    it("returns 404 for non-existent submission", async () => {
      const app = await buildApp();
      mockReviewSubmission.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: "PUT",
        url: `/api/v1/skills/${TEST_ORG_ID}/review/nonexistent`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { status: "rejected" },
      });
      expect(res.statusCode).toBe(404);

      await app.close();
    });

    it("rejects invalid status", async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: "PUT",
        url: `/api/v1/skills/${TEST_ORG_ID}/review/s1`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { status: "invalid-status" },
      });
      expect(res.statusCode).toBe(400);

      await app.close();
    });
  });

  describe("GET /api/v1/skills/:orgId/approved", () => {
    it("lists approved skills", async () => {
      const app = await buildApp();
      const approved = [{ id: "a1", skillName: "approved-skill" }];
      mockListApproved.mockResolvedValueOnce(approved);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/skills/${TEST_ORG_ID}/approved`,
        headers: { authorization: `Bearer ${userToken(app)}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().skills).toEqual(approved);

      await app.close();
    });
  });

  describe("GET /api/v1/skills/:orgId/approved/history", () => {
    it("lists full approval history for admin", async () => {
      const app = await buildApp();
      const all = [{ id: "a1", skillName: "s1" }, { id: "a2", skillName: "s2", revokedAt: "2025-01-01" }];
      mockListAllApproved.mockResolvedValueOnce(all);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/skills/${TEST_ORG_ID}/approved/history`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().skills).toHaveLength(2);

      await app.close();
    });
  });

  describe("DELETE /api/v1/skills/:orgId/approved/:skillId", () => {
    it("revokes a skill approval", async () => {
      const app = await buildApp();
      const revoked = { id: "a1", skillName: "s1", revokedAt: new Date().toISOString() };
      mockRevokeApproval.mockResolvedValueOnce(revoked);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/v1/skills/${TEST_ORG_ID}/approved/a1`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);

      await app.close();
    });

    it("returns 404 if already revoked", async () => {
      const app = await buildApp();
      mockRevokeApproval.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/v1/skills/${TEST_ORG_ID}/approved/a1`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
      });
      expect(res.statusCode).toBe(404);

      await app.close();
    });
  });

  describe("POST /api/v1/skills/:orgId/review/:id/resubmit", () => {
    it("resubmits a skill for review", async () => {
      const app = await buildApp();
      const updated = { id: "s1", status: "pending" };
      mockResubmitForReview.mockResolvedValueOnce(updated);

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/skills/${TEST_ORG_ID}/review/s1/resubmit`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("pending");

      await app.close();
    });

    it("returns 404 for non-existent submission", async () => {
      const app = await buildApp();
      mockResubmitForReview.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/skills/${TEST_ORG_ID}/review/nonexistent/resubmit`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
      });
      expect(res.statusCode).toBe(404);

      await app.close();
    });
  });
});
