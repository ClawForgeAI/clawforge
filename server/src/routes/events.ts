/**
 * SSE (Server-Sent Events) routes for real-time event streaming.
 *
 * Clients connect to GET /api/v1/events/:orgId/stream and receive push
 * notifications for kill_switch activations, policy updates, etc.
 */

import type { FastifyInstance } from "fastify";
import { requireOrg } from "../middleware/auth.js";
import { eventBus, type SSEClient } from "../services/event-bus.js";

const KEEPALIVE_INTERVAL_MS = 30_000;

export async function eventRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/v1/events/:orgId/stream
   * Authenticated SSE stream for an organization.
   */
  app.get<{ Params: { orgId: string } }>(
    "/api/v1/events/:orgId/stream",
    async (request, reply) => {
      const { orgId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const userId = request.authUser!.userId;

      // Set SSE headers on the raw response.
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      // Register this client with the event bus.
      const client: SSEClient = { orgId, userId, reply };
      eventBus.addClient(client);

      // Send an initial connection confirmation event.
      reply.raw.write(`event: connected\ndata: ${JSON.stringify({ orgId, userId })}\n\n`);

      // Keep-alive: send SSE comment every 30s to prevent proxy/LB timeouts.
      const keepAliveTimer = setInterval(() => {
        try {
          reply.raw.write(":keepalive\n\n");
        } catch {
          // Connection is gone; clean up handled below.
          clearInterval(keepAliveTimer);
        }
      }, KEEPALIVE_INTERVAL_MS);

      // Clean up on client disconnect.
      request.raw.on("close", () => {
        clearInterval(keepAliveTimer);
        eventBus.removeClient(client);
      });

      // Prevent Fastify from auto-closing the response by using hijack.
      // We already wrote to reply.raw directly, so we call hijack to tell
      // Fastify we are managing the response ourselves.
      await reply.hijack();
    },
  );
}
