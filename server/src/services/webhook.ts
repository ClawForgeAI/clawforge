/**
 * Webhook delivery service for external alerting (#43).
 *
 * Manages webhook configurations and delivers events with HMAC-SHA256 signing,
 * retry logic with exponential backoff, and delivery tracking.
 */

import { createHmac, randomUUID } from "node:crypto";
import { eq, and, desc } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { webhooks, webhookDeliveries } from "../db/schema.js";
import type * as schema from "../db/schema.js";

/** All supported webhook event types. */
export const WEBHOOK_EVENT_TYPES = [
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
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

/** Retry backoff intervals in milliseconds: 1s, 5s, 30s, 5m, 30m */
const RETRY_DELAYS_MS = [1_000, 5_000, 30_000, 300_000, 1_800_000];
const MAX_RETRIES = 5;

export type WebhookConfig = {
  name: string;
  url: string;
  secret: string;
  events: string[];
  enabled?: boolean;
};

export class WebhookService {
  constructor(
    private db: PostgresJsDatabase<typeof schema>,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  // ---------------------------------------------------------------------------
  // Webhook CRUD
  // ---------------------------------------------------------------------------

  async listWebhooks(orgId: string) {
    return this.db.select().from(webhooks).where(eq(webhooks.orgId, orgId)).orderBy(webhooks.name);
  }

  async getWebhook(webhookId: string) {
    const [webhook] = await this.db.select().from(webhooks).where(eq(webhooks.id, webhookId)).limit(1);
    return webhook ?? null;
  }

  async registerWebhook(orgId: string, config: WebhookConfig) {
    const [created] = await this.db
      .insert(webhooks)
      .values({
        orgId,
        name: config.name,
        url: config.url,
        secret: config.secret,
        events: config.events,
        enabled: config.enabled ?? true,
      })
      .returning();
    return created;
  }

  async updateWebhook(
    webhookId: string,
    data: {
      name?: string;
      url?: string;
      secret?: string;
      events?: string[];
      enabled?: boolean;
    },
  ) {
    const [updated] = await this.db
      .update(webhooks)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(webhooks.id, webhookId))
      .returning();
    return updated;
  }

  async deleteWebhook(webhookId: string) {
    await this.db.delete(webhooks).where(eq(webhooks.id, webhookId));
  }

  // ---------------------------------------------------------------------------
  // Delivery history
  // ---------------------------------------------------------------------------

  async getDeliveries(webhookId: string, limit = 50) {
    return this.db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.webhookId, webhookId))
      .orderBy(desc(webhookDeliveries.createdAt))
      .limit(limit);
  }

  // ---------------------------------------------------------------------------
  // Event delivery
  // ---------------------------------------------------------------------------

  /**
   * Deliver an event to all matching webhooks for an organization.
   * Non-blocking — fires deliveries and logs results, but does not throw.
   */
  async deliverEvent(orgId: string, eventType: WebhookEventType, payload: Record<string, unknown>): Promise<void> {
    const matchingWebhooks = await this.db
      .select()
      .from(webhooks)
      .where(and(eq(webhooks.orgId, orgId), eq(webhooks.enabled, true)));

    const targets = matchingWebhooks.filter((wh) => {
      const events = wh.events as string[];
      return events.includes(eventType);
    });

    await Promise.allSettled(targets.map((wh) => this.deliverToWebhook(wh, eventType, payload)));
  }

  /**
   * Deliver a test payload to a specific webhook.
   */
  async sendTest(webhookId: string): Promise<{ success: boolean; statusCode?: number; latencyMs?: number }> {
    const webhook = await this.getWebhook(webhookId);
    if (!webhook) {
      return { success: false };
    }

    const testPayload = {
      event: "test",
      webhook_id: webhookId,
      message: "This is a test delivery from ClawForge",
      timestamp: new Date().toISOString(),
    };

    const result = await this.deliverToWebhook(webhook, "test" as WebhookEventType, testPayload);
    return result;
  }

  /**
   * Retry failed deliveries with exponential backoff.
   */
  async retryFailedDeliveries(): Promise<number> {
    const failed = await this.db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.status, "failed"))
      .limit(100);

    let retried = 0;

    for (const delivery of failed) {
      if (delivery.attempt >= MAX_RETRIES) continue;

      const delayMs = RETRY_DELAYS_MS[Math.min(delivery.attempt - 1, RETRY_DELAYS_MS.length - 1)];
      const retryAfter = new Date(delivery.createdAt.getTime() + delayMs);
      if (new Date() < retryAfter) continue;

      const webhook = await this.getWebhook(delivery.webhookId);
      if (!webhook || !webhook.enabled) continue;

      const payload = delivery.payload as Record<string, unknown>;
      await this.deliverToWebhook(webhook, delivery.eventType as WebhookEventType, payload, delivery.attempt + 1);
      retried++;
    }

    return retried;
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private async deliverToWebhook(
    webhook: typeof webhooks.$inferSelect,
    eventType: string,
    payload: Record<string, unknown>,
    attempt = 1,
  ): Promise<{ success: boolean; statusCode?: number; latencyMs?: number }> {
    const deliveryId = randomUUID();
    const body = JSON.stringify(payload);
    const signature = createHmac("sha256", webhook.secret).update(body).digest("hex");

    const start = Date.now();
    let responseCode: number | undefined;
    let responseBody: string | undefined;
    let status: "success" | "failed" = "failed";

    try {
      const response = await this.fetchImpl(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-ClawForge-Signature": signature,
          "X-ClawForge-Event": eventType,
          "X-ClawForge-Delivery-ID": deliveryId,
        },
        body,
        signal: AbortSignal.timeout(30_000),
      });

      responseCode = response.status;
      responseBody = await response.text().catch(() => "");
      status = response.ok ? "success" : "failed";
    } catch (err) {
      responseBody = err instanceof Error ? err.message : "Delivery failed";
    }

    const latencyMs = Date.now() - start;

    // Record delivery
    await this.db
      .insert(webhookDeliveries)
      .values({
        webhookId: webhook.id,
        eventType,
        payload,
        status,
        responseCode,
        responseBody: responseBody?.slice(0, 4000),
        latencyMs,
        attempt,
      })
      .catch(() => {}); // Don't let delivery logging failures break the flow

    return { success: status === "success", statusCode: responseCode, latencyMs };
  }
}

// ---------------------------------------------------------------------------
// HMAC signing utility (exported for testing)
// ---------------------------------------------------------------------------

export function signPayload(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}
