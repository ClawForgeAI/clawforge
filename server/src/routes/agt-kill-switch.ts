/**
 * AGT kill-switch routes (Cut 1 step 7 — addendum §5.3, §A19).
 *
 *   GET /api/v1/kill-switch/:did          -> current state for an agent
 *   GET /api/v1/kill-switch/stream        -> SSE stub (heartbeat only in Cut 1)
 *
 * The SSE bus implementation is a placeholder: it opens the stream and emits
 * a comment-heartbeat. Real policy-changed / kill-switch-changed event fan-out
 * lands in Cut 2 along with the kill-switch admin page (§A18 Tier 2).
 */

import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { killSwitchScopes } from "../db/schema.js";
import { requireAdminOrViewer } from "../middleware/auth.js";

const HEARTBEAT_INTERVAL_MS = 15_000;

export async function agtKillSwitchRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { did: string } }>("/api/v1/kill-switch/:did", async (request, reply) => {
    const orgId = request.authUser?.orgId;
    if (!orgId) return reply.code(401).send({ error: "unauthorized" });

    // Resolve the highest-precedence active scope for this DID:
    // explicit agent scope wins, else org-wide.
    const [active] = await app.db
      .select()
      .from(killSwitchScopes)
      .where(and(eq(killSwitchScopes.orgId, orgId), eq(killSwitchScopes.active, true)))
      .orderBy(desc(killSwitchScopes.activatedAt))
      .limit(1);

    if (!active) {
      return reply.send({
        active: false,
        scope: "org",
        reason: "",
        updatedAt: new Date().toISOString(),
      });
    }
    return reply.send({
      active: true,
      scope: active.scope?.kind ?? "org",
      reason: active.message ?? "",
      updatedAt: (active.activatedAt ?? active.createdAt).toISOString(),
    });
  });

  app.get("/api/v1/kill-switch/stream", async (request, reply) => {
    requireAdminOrViewer(request, reply);
    if (reply.sent) return;

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    reply.raw.write(`event: connected\ndata: {"ok":true}\n\n`);
    const timer = setInterval(() => {
      reply.raw.write(`: heartbeat\n\n`);
    }, HEARTBEAT_INTERVAL_MS);
    request.raw.on("close", () => {
      clearInterval(timer);
      reply.raw.end();
    });
  });
}
