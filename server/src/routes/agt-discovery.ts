/**
 * AGT discovery routes (Cut 2b step 2.12 — addendum §A18).
 *
 * The "Discovery" surface tracks agent runtimes the control plane sees but
 * has not yet onboarded as `identities`. The plugin (or an external scanner)
 * reports a fingerprint; the server upserts a `shadow_agents` row with
 * `lastSeen` bumped. Admins review and either promote to a known identity
 * or quarantine the runtime.
 *
 *   POST   /api/v1/shadow-agents               -> upsert a sighting
 *   GET    /api/v1/shadow-agents               -> list (admin/viewer)
 *   PATCH  /api/v1/shadow-agents/:id/status    -> change status (admin)
 *   PATCH  /api/v1/shadow-agents/:id/notes     -> annotate (admin)
 *
 * Promotion to a full identity is a separate route in §A18 Tier 3 (Cut 3).
 */

import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { shadowAgents } from "../db/schema.js";
import { requireAdmin, requireAdminOrViewer } from "../middleware/auth.js";

const ShadowAgentStatus = z.enum(["unknown", "investigating", "known", "quarantined"]);

const SightingBodySchema = z.object({
  did: z.string().min(1).optional(),
  fingerprint: z.string().min(1),
  capabilities: z.array(z.string()).default([]),
  runtime: z.string().optional(),
});

const StatusBodySchema = z.object({ status: ShadowAgentStatus });
const NotesBodySchema = z.object({ notes: z.string().max(2000) });

export async function agtDiscoveryRoutes(app: FastifyInstance): Promise<void> {
  // ---------------------------------------------------------------------------
  // POST /api/v1/shadow-agents — upsert a sighting by (orgId, fingerprint)
  // ---------------------------------------------------------------------------
  app.post(
    "/api/v1/shadow-agents",
    { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const orgId = request.authUser?.orgId;
      if (!orgId) return reply.code(401).send({ error: "unauthorized" });

      const parsed = SightingBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(422).send({ error: "invalid body", issues: parsed.error.issues });
      }

      const now = new Date();
      // Look up an existing row by (orgId, fingerprint). If found, update
      // lastSeen + capabilities; otherwise insert a new sighting.
      const [existing] = await app.db
        .select()
        .from(shadowAgents)
        .where(and(eq(shadowAgents.orgId, orgId), eq(shadowAgents.fingerprint, parsed.data.fingerprint)))
        .limit(1);

      if (existing) {
        const [updated] = await app.db
          .update(shadowAgents)
          .set({
            lastSeen: now,
            capabilities: parsed.data.capabilities,
            did: parsed.data.did ?? existing.did,
            runtime: parsed.data.runtime ?? existing.runtime,
          })
          .where(eq(shadowAgents.id, existing.id))
          .returning();
        return reply.send(updated);
      }

      const [inserted] = await app.db
        .insert(shadowAgents)
        .values({
          orgId,
          did: parsed.data.did,
          fingerprint: parsed.data.fingerprint,
          capabilities: parsed.data.capabilities,
          runtime: parsed.data.runtime,
          firstSeen: now,
          lastSeen: now,
        })
        .returning();
      return reply.code(201).send(inserted);
    },
  );

  // ---------------------------------------------------------------------------
  // GET /api/v1/shadow-agents — list (admin/viewer); filterable by status
  // ---------------------------------------------------------------------------
  app.get<{ Querystring: { status?: string } }>("/api/v1/shadow-agents", async (request, reply) => {
    requireAdminOrViewer(request, reply);
    if (reply.sent) return;
    const orgId = request.authUser?.orgId;
    if (!orgId) return reply.code(401).send({ error: "unauthorized" });

    const conditions = [eq(shadowAgents.orgId, orgId)];
    if (request.query.status) {
      const s = ShadowAgentStatus.safeParse(request.query.status);
      if (!s.success) return reply.code(422).send({ error: "invalid status filter" });
      conditions.push(eq(shadowAgents.status, s.data));
    }

    const rows = await app.db
      .select()
      .from(shadowAgents)
      .where(and(...conditions))
      .orderBy(desc(shadowAgents.lastSeen));

    return reply.send({ shadowAgents: rows });
  });

  // ---------------------------------------------------------------------------
  // PATCH /api/v1/shadow-agents/:id/status — change status (admin)
  // ---------------------------------------------------------------------------
  app.patch<{ Params: { id: string } }>("/api/v1/shadow-agents/:id/status", async (request, reply) => {
    requireAdmin(request, reply);
    if (reply.sent) return;
    const orgId = request.authUser?.orgId;
    if (!orgId) return reply.code(401).send({ error: "unauthorized" });

    const parsed = StatusBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send({ error: "invalid status", issues: parsed.error.issues });
    }
    const [row] = await app.db
      .update(shadowAgents)
      .set({ status: parsed.data.status })
      .where(and(eq(shadowAgents.id, request.params.id), eq(shadowAgents.orgId, orgId)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return reply.send(row);
  });

  // ---------------------------------------------------------------------------
  // PATCH /api/v1/shadow-agents/:id/notes — annotate (admin)
  // ---------------------------------------------------------------------------
  app.patch<{ Params: { id: string } }>("/api/v1/shadow-agents/:id/notes", async (request, reply) => {
    requireAdmin(request, reply);
    if (reply.sent) return;
    const orgId = request.authUser?.orgId;
    if (!orgId) return reply.code(401).send({ error: "unauthorized" });

    const parsed = NotesBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send({ error: "invalid notes", issues: parsed.error.issues });
    }
    const [row] = await app.db
      .update(shadowAgents)
      .set({ notes: parsed.data.notes })
      .where(and(eq(shadowAgents.id, request.params.id), eq(shadowAgents.orgId, orgId)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return reply.send(row);
  });
}
