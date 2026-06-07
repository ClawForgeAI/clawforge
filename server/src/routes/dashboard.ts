/**
 * Dashboard aggregate stats (Cut 2a step 2.3).
 *
 *   GET /api/v1/dashboard/stats  →  { allowedCount, deniedCount, pendingApprovals }
 *
 * Reads from AGT tables only (audit_entries, approvals). Hard cut from the
 * legacy audit_events / skill_submissions queries — per user decision
 * 2026-05-31 we don't union with legacy rows. Existing legacy rows remain
 * in the DB until Cut 2b retirement drops the tables.
 */

import type { FastifyInstance } from "fastify";
import { and, count, eq } from "drizzle-orm";
import { approvals, auditEntries } from "../db/schema.js";
import { requireAdminOrViewer } from "../middleware/auth.js";

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/dashboard/stats", async (request, reply) => {
    requireAdminOrViewer(request, reply);
    if (reply.sent) return;
    const orgId = request.authUser?.orgId;
    if (!orgId) return reply.code(401).send({ error: "unauthorized" });

    const [allowed, denied, pending] = await Promise.all([
      app.db
        .select({ count: count() })
        .from(auditEntries)
        .where(and(eq(auditEntries.orgId, orgId), eq(auditEntries.decision, "allow"))),
      app.db
        .select({ count: count() })
        .from(auditEntries)
        .where(and(eq(auditEntries.orgId, orgId), eq(auditEntries.decision, "deny"))),
      app.db
        .select({ count: count() })
        .from(approvals)
        .where(and(eq(approvals.orgId, orgId), eq(approvals.status, "pending"))),
    ]);

    return reply.send({
      allowedCount: Number(allowed[0]?.count ?? 0),
      deniedCount: Number(denied[0]?.count ?? 0),
      pendingApprovals: Number(pending[0]?.count ?? 0),
    });
  });
}
