/**
 * Tests for webhook routes (#43).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import jwtPlugin from "@fastify/jwt";
import { registerAuthMiddleware } from "../middleware/auth.js";
import { webhookRoutes } from "./webhooks.js";
import { JWT_SECRET, TEST_ORG_ID, TEST_ADMIN_ID, TEST_USER_ID } from "../test/helpers.js";

const mockListWebhooks = vi.fn().mockResolvedValue([]);
const mockGetWebhook = vi.fn().mockResolvedValue(null);
const mockRegisterWebhook = vi.fn().mockResolvedValue({ id: "wh-1" });
const mockUpdateWebhook = vi.fn().mockResolvedValue(null);
const mockDeleteWebhook = vi.fn().mockResolvedValue(undefined);
const mockGetDeliveries = vi.fn().mockResolvedValue([]);
const mockSendTest = vi.fn().mockResolvedValue({ success: true, statusCode: 200, latencyMs: 50 });

vi.mock("../services/webhook.js", () => ({
  WebhookService: class {
    listWebhooks = mockListWebhooks;
    getWebhook = mockGetWebhook;
    registerWebhook = mockRegisterWebhook;
    updateWebhook = mockUpdateWebhook;
    deleteWebhook = mockDeleteWebhook;
    getDeliveries = mockGetDeliveries;
    sendTest = mockSendTest;
  },
  WEBHOOK_EVENT_TYPES: [
    "policy.violation",
    "killswitch.activated",
    "killswitch.deactivated",
    "dlp.alert",
    "anomaly.detected",
    "skill.submitted",
    "skill.approved",
    "skill.rejected",
    "agent.connected",
    "agent.disconnected",
  ],
}));

vi.mock("../services/admin-audit.js", () => ({
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}));

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(jwtPlugin, { secret: JWT_SECRET });
  app.decorate("db", {} as never);
  const noopCounter = { inc: () => {} };
  const noopGauge = { set: () => {}, inc: () => {}, dec: () => {} };
  app.decorate("metrics", {
    heartbeatCounter: noopCounter,
    auditEventsCounter: noopCounter,
    activeInstancesGauge: noopGauge,
    policyFetchCounter: noopCounter,
    killSwitchGauge: noopGauge,
  } as never);
  await registerAuthMiddleware(app);
  await app.register(webhookRoutes);
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

function viewerToken(app: any) {
  return app.jwt.sign(
    { userId: TEST_USER_ID, orgId: TEST_ORG_ID, email: "viewer@test.com", role: "viewer" },
    { expiresIn: "1h" },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("webhook routes", () => {
  // ---------------------------------------------------------------------------
  // GET /api/v1/webhooks/:orgId
  // ---------------------------------------------------------------------------

  describe("GET /api/v1/webhooks/:orgId", () => {
    it("lists webhooks for admin", async () => {
      const app = await buildApp();
      const webhookList = [{ id: "wh-1", name: "Slack", url: "https://hooks.slack.com/test", enabled: true }];
      mockListWebhooks.mockResolvedValueOnce(webhookList);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/webhooks/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.webhooks).toEqual(webhookList);
      expect(body.eventTypes).toHaveLength(10);

      await app.close();
    });

    it("lists webhooks for viewer", async () => {
      const app = await buildApp();
      mockListWebhooks.mockResolvedValueOnce([]);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/webhooks/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${viewerToken(app)}` },
      });

      expect(res.statusCode).toBe(200);
      await app.close();
    });

    it("rejects non-admin non-viewer users", async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/webhooks/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${userToken(app)}` },
      });

      expect(res.statusCode).toBe(403);
      await app.close();
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/webhooks/:orgId
  // ---------------------------------------------------------------------------

  describe("POST /api/v1/webhooks/:orgId", () => {
    it("creates a webhook for admin", async () => {
      const app = await buildApp();
      const webhook = { id: "wh-1", name: "Slack Alert", url: "https://hooks.slack.com/test" };
      mockRegisterWebhook.mockResolvedValueOnce(webhook);

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/webhooks/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: {
          name: "Slack Alert",
          url: "https://hooks.slack.com/test",
          secret: "this-is-a-long-enough-secret",
          events: ["killswitch.activated"],
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual(webhook);
      expect(mockRegisterWebhook).toHaveBeenCalledWith(TEST_ORG_ID, {
        name: "Slack Alert",
        url: "https://hooks.slack.com/test",
        secret: "this-is-a-long-enough-secret",
        events: ["killswitch.activated"],
      });

      await app.close();
    });

    it("rejects invalid body (missing events)", async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/webhooks/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: {
          name: "Test",
          url: "https://example.com",
          secret: "short",
          events: [],
        },
      });

      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it("rejects non-admin users", async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/webhooks/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${userToken(app)}` },
        payload: {
          name: "Test",
          url: "https://example.com/webhook",
          secret: "this-is-a-long-enough-secret",
          events: ["killswitch.activated"],
        },
      });

      expect(res.statusCode).toBe(403);
      await app.close();
    });
  });

  // ---------------------------------------------------------------------------
  // PUT /api/v1/webhooks/:orgId/:webhookId
  // ---------------------------------------------------------------------------

  describe("PUT /api/v1/webhooks/:orgId/:webhookId", () => {
    it("updates a webhook", async () => {
      const app = await buildApp();
      const updated = { id: "wh-1", name: "Updated", enabled: false };
      mockUpdateWebhook.mockResolvedValueOnce(updated);

      const res = await app.inject({
        method: "PUT",
        url: `/api/v1/webhooks/${TEST_ORG_ID}/wh-1`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { name: "Updated", enabled: false },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(updated);
      await app.close();
    });

    it("returns 404 for non-existent webhook", async () => {
      const app = await buildApp();
      mockUpdateWebhook.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: "PUT",
        url: `/api/v1/webhooks/${TEST_ORG_ID}/nonexistent`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
        payload: { name: "Updated" },
      });

      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/v1/webhooks/:orgId/:webhookId
  // ---------------------------------------------------------------------------

  describe("DELETE /api/v1/webhooks/:orgId/:webhookId", () => {
    it("deletes a webhook", async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: "DELETE",
        url: `/api/v1/webhooks/${TEST_ORG_ID}/wh-1`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ success: true });
      expect(mockDeleteWebhook).toHaveBeenCalledWith("wh-1");
      await app.close();
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/webhooks/:orgId/:webhookId/test
  // ---------------------------------------------------------------------------

  describe("POST /api/v1/webhooks/:orgId/:webhookId/test", () => {
    it("sends a test payload", async () => {
      const app = await buildApp();
      mockSendTest.mockResolvedValueOnce({ success: true, statusCode: 200, latencyMs: 42 });

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/webhooks/${TEST_ORG_ID}/wh-1/test`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ success: true, statusCode: 200, latencyMs: 42 });
      await app.close();
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/webhooks/:orgId/:webhookId/deliveries
  // ---------------------------------------------------------------------------

  describe("GET /api/v1/webhooks/:orgId/:webhookId/deliveries", () => {
    it("returns delivery history", async () => {
      const app = await buildApp();
      const deliveryList = [
        {
          id: "del-1",
          webhookId: "wh-1",
          eventType: "killswitch.activated",
          status: "success",
          responseCode: 200,
          latencyMs: 50,
          attempt: 1,
          createdAt: "2026-04-05T00:00:00Z",
        },
      ];
      mockGetDeliveries.mockResolvedValueOnce(deliveryList);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/webhooks/${TEST_ORG_ID}/wh-1/deliveries`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().deliveries).toEqual(deliveryList);
      await app.close();
    });

    it("accepts limit parameter", async () => {
      const app = await buildApp();
      mockGetDeliveries.mockResolvedValueOnce([]);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/webhooks/${TEST_ORG_ID}/wh-1/deliveries?limit=10`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
      });

      expect(res.statusCode).toBe(200);
      expect(mockGetDeliveries).toHaveBeenCalledWith("wh-1", 10);
      await app.close();
    });
  });
});
