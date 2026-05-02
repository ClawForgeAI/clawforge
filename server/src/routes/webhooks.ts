/**
 * Webhook routes — CRUD for webhook configurations and delivery history (#43).
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin, requireAdminOrViewer, requireOrg } from "../middleware/auth.js";
import { WebhookService, WEBHOOK_EVENT_TYPES } from "../services/webhook.js";
import { logAdminAction } from "../services/admin-audit.js";

const CreateWebhookSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url().max(2000),
  secret: z.string().min(16).max(256),
  events: z.array(z.string()).min(1),
  enabled: z.boolean().optional(),
});

const UpdateWebhookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().max(2000).optional(),
  secret: z.string().min(16).max(256).optional(),
  events: z.array(z.string()).min(1).optional(),
  enabled: z.boolean().optional(),
});

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  const webhookService = new WebhookService(app.db);

  // ---------------------------------------------------------------------------
  // List webhooks
  // ---------------------------------------------------------------------------

  /**
   * GET /api/v1/webhooks/:orgId
   * List all webhooks for an org.
   */
  app.get<{ Params: { orgId: string } }>("/api/v1/webhooks/:orgId", async (request, reply) => {
    requireAdminOrViewer(request, reply);
    if (reply.sent) return;
    const { orgId } = request.params;
    requireOrg(request, reply, orgId);
    if (reply.sent) return;

    const hookList = await webhookService.listWebhooks(orgId);
    return reply.send({ webhooks: hookList, eventTypes: WEBHOOK_EVENT_TYPES });
  });

  // ---------------------------------------------------------------------------
  // Create webhook
  // ---------------------------------------------------------------------------

  /**
   * POST /api/v1/webhooks/:orgId
   * Create a new webhook.
   */
  app.post<{ Params: { orgId: string } }>("/api/v1/webhooks/:orgId", async (request, reply) => {
    requireAdmin(request, reply);
    if (reply.sent) return;
    const { orgId } = request.params;
    requireOrg(request, reply, orgId);
    if (reply.sent) return;

    const parseResult = CreateWebhookSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: "Invalid request body", details: parseResult.error.issues });
    }

    const created = await webhookService.registerWebhook(orgId, parseResult.data);

    logAdminAction(app.db, {
      orgId,
      userId: request.authUser!.userId,
      action: "webhook_created",
      resourceType: "webhook",
      resourceId: created.id,
      details: { name: parseResult.data.name, events: parseResult.data.events },
    }).catch(() => {});

    return reply.code(201).send(created);
  });

  // ---------------------------------------------------------------------------
  // Update webhook
  // ---------------------------------------------------------------------------

  /**
   * PUT /api/v1/webhooks/:orgId/:webhookId
   * Update an existing webhook.
   */
  app.put<{ Params: { orgId: string; webhookId: string } }>(
    "/api/v1/webhooks/:orgId/:webhookId",
    async (request, reply) => {
      requireAdmin(request, reply);
      if (reply.sent) return;
      const { orgId, webhookId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const parseResult = UpdateWebhookSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({ error: "Invalid request body", details: parseResult.error.issues });
      }

      const updated = await webhookService.updateWebhook(webhookId, parseResult.data);
      if (!updated) {
        return reply.code(404).send({ error: "Webhook not found" });
      }

      logAdminAction(app.db, {
        orgId,
        userId: request.authUser!.userId,
        action: "webhook_updated",
        resourceType: "webhook",
        resourceId: webhookId,
        details: { fields: Object.keys(parseResult.data) },
      }).catch(() => {});

      return reply.send(updated);
    },
  );

  // ---------------------------------------------------------------------------
  // Delete webhook
  // ---------------------------------------------------------------------------

  /**
   * DELETE /api/v1/webhooks/:orgId/:webhookId
   * Delete a webhook.
   */
  app.delete<{ Params: { orgId: string; webhookId: string } }>(
    "/api/v1/webhooks/:orgId/:webhookId",
    async (request, reply) => {
      requireAdmin(request, reply);
      if (reply.sent) return;
      const { orgId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      await webhookService.deleteWebhook(request.params.webhookId);

      logAdminAction(app.db, {
        orgId,
        userId: request.authUser!.userId,
        action: "webhook_deleted",
        resourceType: "webhook",
        resourceId: request.params.webhookId,
      }).catch(() => {});

      return reply.send({ success: true });
    },
  );

  // ---------------------------------------------------------------------------
  // Test webhook
  // ---------------------------------------------------------------------------

  /**
   * POST /api/v1/webhooks/:orgId/:webhookId/test
   * Send a test payload to a webhook.
   */
  app.post<{ Params: { orgId: string; webhookId: string } }>(
    "/api/v1/webhooks/:orgId/:webhookId/test",
    async (request, reply) => {
      requireAdmin(request, reply);
      if (reply.sent) return;
      const { orgId, webhookId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const result = await webhookService.sendTest(webhookId);
      if (!result.success && !result.statusCode) {
        return reply.code(404).send({ error: "Webhook not found or delivery failed" });
      }

      return reply.send(result);
    },
  );

  // ---------------------------------------------------------------------------
  // Delivery history
  // ---------------------------------------------------------------------------

  /**
   * GET /api/v1/webhooks/:orgId/:webhookId/deliveries
   * Get delivery history for a webhook.
   */
  app.get<{ Params: { orgId: string; webhookId: string }; Querystring: { limit?: string } }>(
    "/api/v1/webhooks/:orgId/:webhookId/deliveries",
    async (request, reply) => {
      requireAdminOrViewer(request, reply);
      if (reply.sent) return;
      const { orgId, webhookId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const limit = request.query.limit ? parseInt(request.query.limit, 10) : 50;
      const deliveries = await webhookService.getDeliveries(webhookId, limit);
      return reply.send({ deliveries });
    },
  );
}
