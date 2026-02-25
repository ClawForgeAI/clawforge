import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import jwtPlugin from "@fastify/jwt";
import { registerAuthMiddleware } from "../middleware/auth.js";
import { auditRoutes } from "./audit.js";
import { JWT_SECRET, TEST_ORG_ID, TEST_ADMIN_ID, TEST_USER_ID } from "../test/helpers.js";

const mockIngestEvents = vi.fn().mockResolvedValue(undefined);
const mockQueryEvents = vi.fn().mockResolvedValue([]);
const mockCountEvents = vi.fn().mockResolvedValue(0);
const mockGetEvent = vi.fn().mockResolvedValue(null);
const mockDeleteOldEvents = vi.fn().mockResolvedValue(5);

vi.mock("../services/audit-service.js", () => ({
  AuditService: class {
    ingestEvents = mockIngestEvents;
    queryEvents = mockQueryEvents;
    countEvents = mockCountEvents;
    getEvent = mockGetEvent;
    deleteOldEvents = mockDeleteOldEvents;
  },
}));

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(jwtPlugin, { secret: JWT_SECRET });
  app.decorate("db", {} as never);
  await registerAuthMiddleware(app);
  await app.register(auditRoutes);
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

describe("audit routes", () => {
  describe("POST /api/v1/audit/:orgId/events", () => {
    it("ingests events for authenticated user", async () => {
      const app = await buildApp();
      mockIngestEvents.mockResolvedValueOnce(undefined);

      const events = [
        {
          userId: TEST_USER_ID,
          orgId: TEST_ORG_ID,
          eventType: "tool_use",
          toolName: "bash",
          outcome: "allowed",
          timestamp: Date.now(),
        },
      ];

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/audit/${TEST_ORG_ID}/events`,
        headers: { authorization: `Bearer ${userToken(app)}` },
        payload: { events },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual({ ingested: 1 });

      await app.close();
    });

    it("rejects events with orgId mismatch", async () => {
      const app = await buildApp();

      const events = [
        {
          userId: TEST_USER_ID,
          orgId: "wrong-org-id",
          eventType: "tool_use",
          outcome: "allowed",
          timestamp: Date.now(),
        },
      ];

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/audit/${TEST_ORG_ID}/events`,
        headers: { authorization: `Bearer ${userToken(app)}` },
        payload: { events },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/orgId mismatch/);

      await app.close();
    });

    it("rejects non-admin submitting events for other users", async () => {
      const app = await buildApp();

      const events = [
        {
          userId: "other-user-id",
          orgId: TEST_ORG_ID,
          eventType: "tool_use",
          outcome: "allowed",
          timestamp: Date.now(),
        },
      ];

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/audit/${TEST_ORG_ID}/events`,
        headers: { authorization: `Bearer ${userToken(app)}` },
        payload: { events },
      });
      expect(res.statusCode).toBe(403);

      await app.close();
    });

    it("allows admin to submit events for any user", async () => {
      const app = await buildApp();
      mockIngestEvents.mockResolvedValueOnce(undefined);

      const events = [
        {
          userId: TEST_USER_ID, // different from admin
          orgId: TEST_ORG_ID,
          eventType: "tool_use",
          outcome: "allowed",
          timestamp: Date.now(),
        },
      ];

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/audit/${TEST_ORG_ID}/events`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { events },
      });
      expect(res.statusCode).toBe(201);

      await app.close();
    });

    it("rejects invalid body", async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/audit/${TEST_ORG_ID}/events`,
        headers: { authorization: `Bearer ${userToken(app)}` },
        payload: { events: "not-an-array" },
      });
      expect(res.statusCode).toBe(400);

      await app.close();
    });
  });

  describe("GET /api/v1/audit/:orgId/query", () => {
    it("returns events for admin", async () => {
      const app = await buildApp();
      const events = [{ id: "e1", eventType: "tool_use" }];
      mockQueryEvents.mockResolvedValueOnce(events);
      mockCountEvents.mockResolvedValueOnce(1);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/audit/${TEST_ORG_ID}/query`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().events).toEqual(events);
      expect(res.json().total).toBe(1);

      await app.close();
    });

    it("rejects non-admin", async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/audit/${TEST_ORG_ID}/query`,
        headers: { authorization: `Bearer ${userToken(app)}` },
      });
      expect(res.statusCode).toBe(403);

      await app.close();
    });
  });

  describe("GET /api/v1/audit/:orgId/events/:eventId", () => {
    it("returns event detail for admin", async () => {
      const app = await buildApp();
      const event = { id: "e1", orgId: TEST_ORG_ID, eventType: "tool_use" };
      mockGetEvent.mockResolvedValueOnce(event);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/audit/${TEST_ORG_ID}/events/e1`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().event).toEqual(event);

      await app.close();
    });

    it("returns 404 for non-existent event", async () => {
      const app = await buildApp();
      mockGetEvent.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/audit/${TEST_ORG_ID}/events/nonexistent`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
      });
      expect(res.statusCode).toBe(404);

      await app.close();
    });

    it("returns 404 for event from different org", async () => {
      const app = await buildApp();
      mockGetEvent.mockResolvedValueOnce({ id: "e1", orgId: "other-org" });

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/audit/${TEST_ORG_ID}/events/e1`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
      });
      expect(res.statusCode).toBe(404);

      await app.close();
    });
  });

  describe("DELETE /api/v1/audit/:orgId/retention", () => {
    it("deletes old events for admin", async () => {
      const app = await buildApp();
      mockDeleteOldEvents.mockResolvedValueOnce(5);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/v1/audit/${TEST_ORG_ID}/retention`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { retentionDays: 30 },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().deleted).toBe(5);

      await app.close();
    });

    it("rejects invalid retention days", async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: "DELETE",
        url: `/api/v1/audit/${TEST_ORG_ID}/retention`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { retentionDays: 0 },
      });
      expect(res.statusCode).toBe(400);

      await app.close();
    });

    it("rejects non-admin", async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: "DELETE",
        url: `/api/v1/audit/${TEST_ORG_ID}/retention`,
        headers: { authorization: `Bearer ${userToken(app)}` },
        payload: { retentionDays: 30 },
      });
      expect(res.statusCode).toBe(403);

      await app.close();
    });
  });
});
