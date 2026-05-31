/**
 * AGT kill-switch routes (Cut 1 step 7 — addendum §5.3, §A19; Cut 2b step 2.9).
 *
 *   GET    /api/v1/kill-switch/:did     -> current state for an agent (legacy
 *                                          poll URL the client still uses)
 *   GET    /api/v1/kill-switch          -> list active scopes (admin/viewer)
 *   POST   /api/v1/kill-switch          -> activate a scope (admin)
 *   DELETE /api/v1/kill-switch/:id      -> clear a scope (admin)
 *
 * All mutations broadcast a `kill_switch` SSE event via the shared event bus
 * (`/api/v1/events/:orgId/stream`) so connected agents and admin tabs receive
 * a live update. The Cut 1 `/api/v1/kill-switch/stream` heartbeat placeholder
 * was retired in Cut 2b step 2.16; subscribe to the org-wide event bus instead.
 */

import type { FastifyInstance } from "fastify";
import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { killSwitchScopes } from "../db/schema.js";
import { requireAdmin, requireAdminOrViewer } from "../middleware/auth.js";
import { eventBus } from "../services/event-bus.js";

const KillSwitchScopeSchema = z
  .object({
    kind: z.enum(["org", "agent", "role", "tag"]).default("org"),
    agentDid: z.string().optional(),
    role: z.string().optional(),
    tag: z.string().optional(),
  })
  .default({ kind: "org" as const });

const ActivateBodySchema = z.object({
  scope: KillSwitchScopeSchema.optional(),
  message: z.string().max(1000).optional(),
});

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

  // ---------------------------------------------------------------------------
  // GET /api/v1/kill-switch — list active scopes for the org (admin or viewer)
  // ---------------------------------------------------------------------------
  app.get("/api/v1/kill-switch", async (request, reply) => {
    requireAdminOrViewer(request, reply);
    if (reply.sent) return;
    const orgId = request.authUser?.orgId;
    if (!orgId) return reply.code(401).send({ error: "unauthorized" });

    const rows = await app.db
      .select({
        id: killSwitchScopes.id,
        scope: killSwitchScopes.scope,
        active: killSwitchScopes.active,
        message: killSwitchScopes.message,
        activatedBy: killSwitchScopes.activatedBy,
        activatedAt: killSwitchScopes.activatedAt,
        createdAt: killSwitchScopes.createdAt,
      })
      .from(killSwitchScopes)
      .where(and(eq(killSwitchScopes.orgId, orgId), eq(killSwitchScopes.active, true)))
      .orderBy(desc(killSwitchScopes.activatedAt));

    return reply.send({ scopes: rows });
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/kill-switch — activate a scope (admin only)
  // ---------------------------------------------------------------------------
  app.post(
    "/api/v1/kill-switch",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      requireAdmin(request, reply);
      if (reply.sent) return;
      const orgId = request.authUser?.orgId;
      const userId = request.authUser?.userId;
      if (!orgId || !userId) return reply.code(401).send({ error: "unauthorized" });

      const parsed = ActivateBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(422).send({ error: "invalid body", issues: parsed.error.issues });
      }
      const scope = parsed.data.scope ?? { kind: "org" as const };
      const now = new Date();

      const [inserted] = await app.db
        .insert(killSwitchScopes)
        .values({
          orgId,
          scope,
          active: true,
          message: parsed.data.message,
          activatedBy: userId,
          activatedAt: now,
        })
        .returning({
          id: killSwitchScopes.id,
          scope: killSwitchScopes.scope,
          active: killSwitchScopes.active,
          message: killSwitchScopes.message,
          activatedBy: killSwitchScopes.activatedBy,
          activatedAt: killSwitchScopes.activatedAt,
          createdAt: killSwitchScopes.createdAt,
        });

      app.metrics.killSwitchGauge.set(1);
      eventBus.broadcast(orgId, "kill_switch", {
        active: true,
        scope: scope.kind,
        reason: parsed.data.message ?? "",
        scopeId: inserted.id,
      });

      return reply.code(201).send(inserted);
    },
  );

  // ---------------------------------------------------------------------------
  // DELETE /api/v1/kill-switch/:id — clear a scope (admin only)
  // ---------------------------------------------------------------------------
  app.delete<{ Params: { id: string } }>(
    "/api/v1/kill-switch/:id",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      requireAdmin(request, reply);
      if (reply.sent) return;
      const orgId = request.authUser?.orgId;
      const userId = request.authUser?.userId;
      if (!orgId || !userId) return reply.code(401).send({ error: "unauthorized" });

      const now = new Date();
      const [cleared] = await app.db
        .update(killSwitchScopes)
        .set({ active: false, clearedBy: userId, clearedAt: now })
        .where(and(eq(killSwitchScopes.id, request.params.id), eq(killSwitchScopes.orgId, orgId)))
        .returning({
          id: killSwitchScopes.id,
          scope: killSwitchScopes.scope,
          active: killSwitchScopes.active,
          message: killSwitchScopes.message,
          clearedAt: killSwitchScopes.clearedAt,
        });

      if (!cleared) return reply.code(404).send({ error: "scope not found" });

      // Decide gauge state: 0 only when no other scope is still active.
      const [remainingRow] = await app.db
        .select({ value: count() })
        .from(killSwitchScopes)
        .where(and(eq(killSwitchScopes.orgId, orgId), eq(killSwitchScopes.active, true)));
      const remaining = Number(remainingRow?.value ?? 0);
      if (remaining === 0) app.metrics.killSwitchGauge.set(0);

      eventBus.broadcast(orgId, "kill_switch", {
        active: remaining > 0,
        scope: (cleared.scope as { kind?: string })?.kind ?? "org",
        reason: "",
        scopeId: cleared.id,
      });

      return reply.send(cleared);
    },
  );
}
