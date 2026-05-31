/**
 * AGT trust-score routes (Cut 2b step 2.13 — addendum §A18).
 *
 *   POST /api/v1/trust-scores            -> upsert overall + per-dimension scores
 *   GET  /api/v1/trust-scores            -> list every agent's score (admin/viewer)
 *   GET  /api/v1/trust-scores/:did       -> single agent's score
 *
 * The heatmap in the admin page is rendered client-side from the list endpoint.
 * Backed by `trust_scores` (unique per (orgId, did)). The tier is either
 * caller-supplied or derived from `overall` via the standard AGT bands.
 */

import type { FastifyInstance } from "fastify";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { TrustTier } from "@clawforgeai/policy-schema";
import { trustScores } from "../db/schema.js";
import { requireAdminOrViewer } from "../middleware/auth.js";

const UpsertBodySchema = z.object({
  did: z.string().min(1),
  overall: z.number().int().min(0).max(100),
  dimensions: z.record(z.string(), z.number().min(0).max(100)).default({}),
  tier: TrustTier.optional(),
});

/** AGT default band thresholds — caller can override by sending an explicit `tier`. */
function deriveTier(overall: number): z.infer<typeof TrustTier> {
  if (overall >= 80) return "Verified";
  if (overall >= 60) return "Trusted";
  if (overall >= 30) return "Provisional";
  return "Untrusted";
}

export async function agtTrustRoutes(app: FastifyInstance): Promise<void> {
  // ---------------------------------------------------------------------------
  // POST /api/v1/trust-scores — upsert by (orgId, did)
  // ---------------------------------------------------------------------------
  app.post(
    "/api/v1/trust-scores",
    { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const orgId = request.authUser?.orgId;
      if (!orgId) return reply.code(401).send({ error: "unauthorized" });

      const parsed = UpsertBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(422).send({ error: "invalid body", issues: parsed.error.issues });
      }

      const tier = parsed.data.tier ?? deriveTier(parsed.data.overall);
      const now = new Date();
      const [row] = await app.db
        .insert(trustScores)
        .values({
          orgId,
          did: parsed.data.did,
          overall: parsed.data.overall,
          dimensions: parsed.data.dimensions,
          tier,
          lastUpdated: now,
        })
        .onConflictDoUpdate({
          target: [trustScores.orgId, trustScores.did],
          set: {
            overall: parsed.data.overall,
            dimensions: parsed.data.dimensions,
            tier,
            lastUpdated: now,
          },
        })
        .returning();
      return reply.code(201).send(row);
    },
  );

  // ---------------------------------------------------------------------------
  // GET /api/v1/trust-scores — list (admin/viewer)
  // ---------------------------------------------------------------------------
  app.get("/api/v1/trust-scores", async (request, reply) => {
    requireAdminOrViewer(request, reply);
    if (reply.sent) return;
    const orgId = request.authUser?.orgId;
    if (!orgId) return reply.code(401).send({ error: "unauthorized" });

    const rows = await app.db
      .select()
      .from(trustScores)
      .where(eq(trustScores.orgId, orgId))
      .orderBy(asc(trustScores.did));

    // Collect the union of dimension keys so the admin can render a stable
    // heatmap grid without scanning every row client-side.
    const dimensionKeys = new Set<string>();
    for (const r of rows) for (const k of Object.keys(r.dimensions ?? {})) dimensionKeys.add(k);

    return reply.send({
      trustScores: rows,
      dimensionKeys: [...dimensionKeys].sort(),
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/trust-scores/:did — single agent (admin/viewer)
  // ---------------------------------------------------------------------------
  app.get<{ Params: { did: string } }>("/api/v1/trust-scores/:did", async (request, reply) => {
    requireAdminOrViewer(request, reply);
    if (reply.sent) return;
    const orgId = request.authUser?.orgId;
    if (!orgId) return reply.code(401).send({ error: "unauthorized" });

    const [row] = await app.db
      .select()
      .from(trustScores)
      .where(and(eq(trustScores.orgId, orgId), eq(trustScores.did, request.params.did)))
      .limit(1);

    if (!row) return reply.code(404).send({ error: "not found" });
    return reply.send(row);
  });
}
