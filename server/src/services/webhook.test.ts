/**
 * Tests for the webhook service (#43).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { WebhookService, signPayload, WEBHOOK_EVENT_TYPES } from "./webhook.js";
import { createMockDb } from "../test/helpers.js";

describe("WebhookService", () => {
  let mockDb: ReturnType<typeof createMockDb>;
  let service: WebhookService;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockDb = createMockDb();
    mockFetch = vi.fn();
    service = new WebhookService(mockDb as never, mockFetch as typeof fetch);
  });

  describe("registerWebhook", () => {
    it("creates a webhook with correct values", async () => {
      const webhook = {
        id: "wh-1",
        orgId: "org-1",
        name: "Slack Alert",
        url: "https://hooks.slack.com/test",
        secret: "test-secret-abcdef123",
        events: ["killswitch.activated"],
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Override insert to return a chain that resolves to [webhook]
      (mockDb.insert as ReturnType<typeof vi.fn>).mockImplementation(() => {
        const chain: Record<string, ReturnType<typeof vi.fn>> = {};
        const methods = ["from", "where", "limit", "offset", "orderBy", "values", "set", "returning", "onConflictDoUpdate"];
        for (const method of methods) {
          chain[method] = vi.fn().mockReturnThis();
        }
        chain.then = vi.fn((resolve: (v: unknown) => void) => resolve([webhook]));
        return chain;
      });

      const result = await service.registerWebhook("org-1", {
        name: "Slack Alert",
        url: "https://hooks.slack.com/test",
        secret: "test-secret-abcdef123",
        events: ["killswitch.activated"],
      });

      expect(mockDb.insert).toHaveBeenCalled();
      expect(result).toEqual(webhook);
    });
  });

  describe("deliverEvent", () => {
    it("delivers to matching webhooks with HMAC signature", async () => {
      const webhook = {
        id: "wh-1",
        orgId: "org-1",
        name: "Test Hook",
        url: "https://example.com/webhook",
        secret: "my-secret-key-for-signing",
        events: ["killswitch.activated", "policy.violation"],
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock select to return matching webhooks
      (mockDb.select as ReturnType<typeof vi.fn>).mockImplementation(() => {
        const chain: Record<string, ReturnType<typeof vi.fn>> = {};
        const methods = ["from", "where", "limit", "offset", "orderBy", "innerJoin", "leftJoin"];
        for (const method of methods) {
          chain[method] = vi.fn().mockReturnThis();
        }
        chain.then = vi.fn((resolve: (v: unknown) => void) => resolve([webhook]));
        return chain;
      });

      // Mock insert for delivery logging
      (mockDb.insert as ReturnType<typeof vi.fn>).mockImplementation(() => {
        const chain: Record<string, ReturnType<typeof vi.fn>> = {};
        const methods = ["from", "where", "limit", "offset", "orderBy", "values", "set", "returning", "onConflictDoUpdate"];
        for (const method of methods) {
          chain[method] = vi.fn().mockReturnThis();
        }
        chain.then = vi.fn((resolve: (v: unknown) => void) => resolve([]));
        return chain;
      });

      // Mock successful fetch
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve("OK"),
      });

      await service.deliverEvent("org-1", "killswitch.activated", { active: true });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe("https://example.com/webhook");
      expect(opts.method).toBe("POST");
      expect(opts.headers["Content-Type"]).toBe("application/json");
      expect(opts.headers["X-ClawForge-Event"]).toBe("killswitch.activated");
      expect(opts.headers["X-ClawForge-Delivery-ID"]).toBeTruthy();
      expect(opts.headers["X-ClawForge-Signature"]).toBeTruthy();

      // Verify HMAC signature
      const body = opts.body;
      const expectedSig = signPayload(webhook.secret, body);
      expect(opts.headers["X-ClawForge-Signature"]).toBe(expectedSig);
    });

    it("skips webhooks that do not subscribe to the event", async () => {
      const webhook = {
        id: "wh-1",
        orgId: "org-1",
        name: "Test Hook",
        url: "https://example.com/webhook",
        secret: "my-secret-key-for-signing",
        events: ["skill.submitted"],
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const selectChain = mockDb.select();
      (selectChain as any).then = vi.fn((resolve: (v: unknown) => void) => resolve([webhook]));

      await service.deliverEvent("org-1", "killswitch.activated", { active: true });

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("retryFailedDeliveries", () => {
    it("retries failed deliveries that are past their backoff window", async () => {
      const failedDelivery = {
        id: "del-1",
        webhookId: "wh-1",
        eventType: "killswitch.activated",
        payload: { active: true },
        status: "failed",
        responseCode: 500,
        responseBody: "Internal Server Error",
        latencyMs: 100,
        attempt: 1,
        createdAt: new Date(Date.now() - 10_000), // 10 seconds ago, past 1s backoff
      };

      const webhook = {
        id: "wh-1",
        orgId: "org-1",
        name: "Test",
        url: "https://example.com/webhook",
        secret: "my-secret-key-for-signing",
        events: ["killswitch.activated"],
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // First select returns failed deliveries, subsequent selects return webhook
      let selectCallCount = 0;
      (mockDb.select as ReturnType<typeof vi.fn>).mockImplementation(() => {
        selectCallCount++;
        const chain: Record<string, ReturnType<typeof vi.fn>> = {};
        const methods = ["from", "where", "limit", "offset", "orderBy", "innerJoin", "leftJoin"];
        for (const method of methods) {
          chain[method] = vi.fn().mockReturnThis();
        }
        // First call = failed deliveries, second call = webhook lookup
        chain.then = vi.fn((resolve: (v: unknown) => void) => {
          if (selectCallCount === 1) resolve([failedDelivery]);
          else resolve([webhook]);
        });
        return chain;
      });

      const insertChain = mockDb.insert();
      (insertChain as any).then = vi.fn((resolve: (v: unknown) => void) => resolve([]));

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve("OK"),
      });

      const retried = await service.retryFailedDeliveries();
      expect(retried).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("does not retry deliveries that have reached max attempts", async () => {
      const failedDelivery = {
        id: "del-1",
        webhookId: "wh-1",
        eventType: "killswitch.activated",
        payload: { active: true },
        status: "failed",
        attempt: 5, // max retries
        createdAt: new Date(Date.now() - 10_000_000),
      };

      const selectChain = mockDb.select();
      (selectChain as any).then = vi.fn((resolve: (v: unknown) => void) => resolve([failedDelivery]));

      const retried = await service.retryFailedDeliveries();
      expect(retried).toBe(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("sendTest", () => {
    it("sends a test payload to a specific webhook", async () => {
      const webhook = {
        id: "wh-1",
        orgId: "org-1",
        name: "Test",
        url: "https://example.com/webhook",
        secret: "my-secret-key-for-signing",
        events: ["killswitch.activated"],
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      let selectCallCount = 0;
      (mockDb.select as ReturnType<typeof vi.fn>).mockImplementation(() => {
        selectCallCount++;
        const chain: Record<string, ReturnType<typeof vi.fn>> = {};
        const methods = ["from", "where", "limit", "offset", "orderBy", "innerJoin", "leftJoin"];
        for (const method of methods) {
          chain[method] = vi.fn().mockReturnThis();
        }
        chain.then = vi.fn((resolve: (v: unknown) => void) => resolve([webhook]));
        return chain;
      });

      const insertChain = mockDb.insert();
      (insertChain as any).then = vi.fn((resolve: (v: unknown) => void) => resolve([]));

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve("OK"),
      });

      const result = await service.sendTest("wh-1");
      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("returns failure for non-existent webhook", async () => {
      const selectChain = mockDb.select();
      (selectChain as any).then = vi.fn((resolve: (v: unknown) => void) => resolve([]));

      const result = await service.sendTest("nonexistent");
      expect(result.success).toBe(false);
    });
  });
});

describe("signPayload", () => {
  it("generates consistent HMAC-SHA256 signatures", () => {
    const secret = "test-secret-value";
    const payload = '{"event":"test"}';

    const sig1 = signPayload(secret, payload);
    const sig2 = signPayload(secret, payload);

    expect(sig1).toBe(sig2);
    expect(sig1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces different signatures for different secrets", () => {
    const payload = '{"event":"test"}';

    const sig1 = signPayload("secret-one-abcdef", payload);
    const sig2 = signPayload("secret-two-abcdef", payload);

    expect(sig1).not.toBe(sig2);
  });

  it("produces different signatures for different payloads", () => {
    const secret = "test-secret-value";

    const sig1 = signPayload(secret, '{"a":1}');
    const sig2 = signPayload(secret, '{"a":2}');

    expect(sig1).not.toBe(sig2);
  });
});

describe("WEBHOOK_EVENT_TYPES", () => {
  it("contains all expected event types", () => {
    expect(WEBHOOK_EVENT_TYPES).toContain("policy.violation");
    expect(WEBHOOK_EVENT_TYPES).toContain("killswitch.activated");
    expect(WEBHOOK_EVENT_TYPES).toContain("killswitch.deactivated");
    expect(WEBHOOK_EVENT_TYPES).toContain("dlp.alert");
    expect(WEBHOOK_EVENT_TYPES).toContain("anomaly.detected");
    expect(WEBHOOK_EVENT_TYPES).toContain("skill.submitted");
    expect(WEBHOOK_EVENT_TYPES).toContain("skill.approved");
    expect(WEBHOOK_EVENT_TYPES).toContain("skill.rejected");
    expect(WEBHOOK_EVENT_TYPES).toContain("agent.connected");
    expect(WEBHOOK_EVENT_TYPES).toContain("agent.disconnected");
  });
});
