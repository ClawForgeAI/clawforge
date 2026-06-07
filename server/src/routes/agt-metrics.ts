/**
 * AGT metrics routes (Cut 2b step 2.11 — addendum §A18).
 *
 *   POST /api/v1/metrics            -> ingest a metric snapshot
 *   GET  /api/v1/metrics            -> list metrics (filterable)
 *   GET  /api/v1/metrics/summary    -> aggregate counters for the admin
 *
 * The `metrics` table is intentionally schema-free (jsonb `snapshot`). Agents
 * push whatever per-tick stats they want; the admin overview aggregates by
 * count + agent presence. Per-key aggregation lands in Cut 3.
 */

import type { FastifyInstance } from "fastify";
import { and, count, countDistinct, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { metrics } from "../db/schema.js";
import { requireAdminOrViewer } from "../middleware/auth.js";

const IngestBodySchema = z.object({
  agentDid: z.string().min(1).optional(),
  snapshot: z.record(z.string(), z.unknown()),
});

const ListQuerySchema = z.object({
  agentDid: z.string().optional(),
  sinceMinutes: z.coerce
    .number()
    .int()
    .positive()
    .max(7 * 24 * 60)
    .optional(),
  limit: z.coerce.number().int().positive().max(500).default(100),
});

export async function agtMetricsRoutes(app: FastifyInstance): Promise<void> {
  // ---------------------------------------------------------------------------
  // POST /api/v1/metrics — ingest a single snapshot
  // ---------------------------------------------------------------------------
  app.post(
    "/api/v1/metrics",
    { config: { rateLimit: { max: 600, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const orgId = request.authUser?.orgId;
      if (!orgId) return reply.code(401).send({ error: "unauthorized" });

      const parsed = IngestBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(422).send({ error: "invalid body", issues: parsed.error.issues });
      }
      const [row] = await app.db
        .insert(metrics)
        .values({
          orgId,
          agentDid: parsed.data.agentDid,
          snapshot: parsed.data.snapshot,
        })
        .returning();
      return reply.code(201).send(row);
    },
  );

  // ---------------------------------------------------------------------------
  // GET /api/v1/metrics — list snapshots (admin/viewer)
  // ---------------------------------------------------------------------------
  app.get("/api/v1/metrics", async (request, reply) => {
    requireAdminOrViewer(request, reply);
    if (reply.sent) return;
    const orgId = request.authUser?.orgId;
    if (!orgId) return reply.code(401).send({ error: "unauthorized" });

    const parsed = ListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(422).send({ error: "invalid query", issues: parsed.error.issues });
    }

    const conditions = [eq(metrics.orgId, orgId)];
    if (parsed.data.agentDid) {
      conditions.push(eq(metrics.agentDid, parsed.data.agentDid));
    }
    if (parsed.data.sinceMinutes) {
      const cutoff = new Date(Date.now() - parsed.data.sinceMinutes * 60_000);
      conditions.push(gte(metrics.recordedAt, cutoff));
    }

    const rows = await app.db
      .select()
      .from(metrics)
      .where(and(...conditions))
      .orderBy(desc(metrics.recordedAt))
      .limit(parsed.data.limit);

    return reply.send({ metrics: rows });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/metrics/summary — aggregate counters
  // ---------------------------------------------------------------------------
  app.get("/api/v1/metrics/summary", async (request, reply) => {
    requireAdminOrViewer(request, reply);
    if (reply.sent) return;
    const orgId = request.authUser?.orgId;
    if (!orgId) return reply.code(401).send({ error: "unauthorized" });

    const cutoff24h = new Date(Date.now() - 24 * 60 * 60_000);
    const cutoff1h = new Date(Date.now() - 60 * 60_000);

    const [overall, lastDay, lastHour] = await Promise.all([
      app.db
        .select({ total: count(), distinctAgents: countDistinct(metrics.agentDid) })
        .from(metrics)
        .where(eq(metrics.orgId, orgId)),
      app.db
        .select({ total: count(), distinctAgents: countDistinct(metrics.agentDid) })
        .from(metrics)
        .where(and(eq(metrics.orgId, orgId), gte(metrics.recordedAt, cutoff24h))),
      app.db
        .select({ total: count() })
        .from(metrics)
        .where(and(eq(metrics.orgId, orgId), gte(metrics.recordedAt, cutoff1h))),
    ]);

    // Top 5 agents by submission count in the last 24h.
    const topAgents = await app.db
      .select({
        agentDid: metrics.agentDid,
        total: count(),
      })
      .from(metrics)
      .where(and(eq(metrics.orgId, orgId), gte(metrics.recordedAt, cutoff24h)))
      .groupBy(metrics.agentDid)
      .orderBy(sql`count(*) desc`)
      .limit(5);

    return reply.send({
      total: Number(overall[0]?.total ?? 0),
      distinctAgents: Number(overall[0]?.distinctAgents ?? 0),
      last24h: {
        total: Number(lastDay[0]?.total ?? 0),
        distinctAgents: Number(lastDay[0]?.distinctAgents ?? 0),
      },
      lastHour: {
        total: Number(lastHour[0]?.total ?? 0),
      },
      topAgents: topAgents.map((r) => ({
        agentDid: r.agentDid,
        total: Number(r.total),
      })),
    });
  });
}
