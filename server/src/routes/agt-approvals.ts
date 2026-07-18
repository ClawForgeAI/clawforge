/**
 * AGT approvals queue (Cut 1 step 7 — addendum §5.3, §A18).
 *
 *   GET  /api/v1/approvals?status=&actionType=    -> list
 *   POST /api/v1/approvals                         -> create
 *   GET  /api/v1/approvals/:id                     -> get one
 *   PUT  /api/v1/approvals/:id/decision            -> approve / deny
 */

import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { approvals } from "../db/schema.js";
import { requireAdmin, requireAdminOrViewer } from "../middleware/auth.js";

const ActionTypeSchema = z.enum(["skill_load", "policy_change", "tool_call", "delegation"]);
const DecisionSchema = z.object({
  decision: z.enum(["approved", "denied"]),
  comment: z.string().optional(),
});
const CreateBodySchema = z.object({
  agentDid: z.string().optional(),
  actionType: ActionTypeSchema,
  target: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  requiredApprovers: z.array(z.string()).default([]),
  obligations: z.record(z.string(), z.unknown()).optional(),
  expiresAt: z.iso.datetime().optional(),
});

export async function agtApprovalRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { status?: string; actionType?: string } }>("/api/v1/approvals", async (request, reply) => {
    requireAdminOrViewer(request, reply);
    if (reply.sent) return;
    const orgId = request.authUser?.orgId;
    if (!orgId) return reply.code(401).send({ error: "unauthorized" });

    const where = [eq(approvals.orgId, orgId)];
    if (request.query.status) {
      const s = request.query.status as "pending" | "approved" | "denied" | "expired";
      where.push(eq(approvals.status, s));
    }
    if (request.query.actionType) {
      const parsed = ActionTypeSchema.safeParse(request.query.actionType);
      if (parsed.success) where.push(eq(approvals.actionType, parsed.data));
    }

    const rows = await app.db
      .select()
      .from(approvals)
      .where(and(...where))
      .orderBy(desc(approvals.requestedAt));
    return reply.send({ approvals: rows });
  });

  app.post("/api/v1/approvals", async (request, reply) => {
    const orgId = request.authUser?.orgId;
    if (!orgId) return reply.code(401).send({ error: "unauthorized" });
    const parsed = CreateBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send({ error: "invalid body", issues: parsed.error.issues });
    }
    const [row] = await app.db
      .insert(approvals)
      .values({
        orgId,
        agentDid: parsed.data.agentDid,
        actionType: parsed.data.actionType,
        target: parsed.data.target,
        payload: parsed.data.payload,
        requiredApprovers: parsed.data.requiredApprovers,
        obligations: parsed.data.obligations,
        requestedBy: request.authUser?.userId,
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      })
      .returning();
    return reply.code(201).send(row);
  });

  app.get<{ Params: { id: string } }>("/api/v1/approvals/:id", async (request, reply) => {
    requireAdminOrViewer(request, reply);
    if (reply.sent) return;
    const orgId = request.authUser?.orgId;
    if (!orgId) return reply.code(401).send({ error: "unauthorized" });
    const [row] = await app.db
      .select()
      .from(approvals)
      .where(and(eq(approvals.orgId, orgId), eq(approvals.id, request.params.id)))
      .limit(1);
    if (!row) return reply.code(404).send({ error: "not found" });
    return reply.send(row);
  });

  app.put<{ Params: { id: string } }>("/api/v1/approvals/:id/decision", async (request, reply) => {
    requireAdmin(request, reply);
    if (reply.sent) return;
    const orgId = request.authUser?.orgId;
    if (!orgId) return reply.code(401).send({ error: "unauthorized" });
    const userId = request.authUser?.userId;
    if (!userId) return reply.code(401).send({ error: "unauthorized" });

    const parsed = DecisionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send({ error: "invalid body", issues: parsed.error.issues });
    }

    const [existing] = await app.db
      .select()
      .from(approvals)
      .where(and(eq(approvals.orgId, orgId), eq(approvals.id, request.params.id)))
      .limit(1);
    if (!existing) return reply.code(404).send({ error: "not found" });
    if (existing.status !== "pending") {
      return reply.code(409).send({ error: "approval already decided", status: existing.status });
    }

    const decisions = [
      ...(existing.decisions ?? []),
      {
        decidedBy: userId,
        decision: parsed.data.decision,
        comment: parsed.data.comment,
        decidedAt: new Date().toISOString(),
      },
    ];
    const [row] = await app.db
      .update(approvals)
      .set({
        status: parsed.data.decision,
        decisions,
        decidedAt: new Date(),
      })
      .where(eq(approvals.id, request.params.id))
      .returning();
    return reply.send(row);
  });
}
