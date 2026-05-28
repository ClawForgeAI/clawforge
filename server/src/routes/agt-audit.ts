/**
 * AGT-canonical audit routes (Cut 1 step 7 — addendum §5.3, §A19).
 *
 *   POST /api/v1/audit/:orgId/entries  -> append AGT AuditEntry[] with chain check
 *   GET  /api/v1/audit/:orgId/entries  -> paginated read
 *   POST /api/v1/audit/:orgId/verify   -> walk the chain, return integrity status
 */

import type { FastifyInstance } from "fastify";
import { and, desc, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { AuditEntry } from "@clawforgeai/policy-schema";
import { auditEntries } from "../db/schema.js";
import { requireAdminOrViewer, requireOrg } from "../middleware/auth.js";

const PostBodySchema = z.array(AuditEntry);

export async function agtAuditRoutes(app: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // POST /api/v1/audit/:orgId/entries
  // -------------------------------------------------------------------------
  app.post<{ Params: { orgId: string } }>("/api/v1/audit/:orgId/entries", async (request, reply) => {
    const { orgId } = request.params;
    requireOrg(request, reply, orgId);
    if (reply.sent) return;

    const parsed = PostBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send({ error: "invalid AuditEntry[]", issues: parsed.error.issues });
    }
    if (parsed.data.length === 0) return reply.code(204).send();

    // Server-side chain integrity check: each entry's previousHash must match
    // the prior entry's hash. Cross-batch chains are verified against the
    // latest stored hash for this org.
    const [latest] = await app.db
      .select({ hash: auditEntries.hash })
      .from(auditEntries)
      .where(eq(auditEntries.orgId, orgId))
      .orderBy(desc(auditEntries.chainSeq))
      .limit(1);
    let expectedPrev = latest?.hash ?? "0".repeat(64);
    for (let i = 0; i < parsed.data.length; i++) {
      const e = parsed.data[i];
      if (e.previousHash !== expectedPrev) {
        return reply.code(409).send({
          error: "chain integrity violation",
          index: i,
          expected: expectedPrev,
          actual: e.previousHash,
        });
      }
      expectedPrev = e.hash;
    }

    await app.db.insert(auditEntries).values(
      parsed.data.map((e) => ({
        orgId,
        timestamp: new Date(e.timestamp),
        agentDid: e.agentId,
        action: e.action,
        decision: e.decision,
        hash: e.hash,
        previousHash: e.previousHash,
      })),
    );

    app.metrics.auditEventsCounter.inc(parsed.data.length);
    return reply.code(201).send({ accepted: parsed.data.length });
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/audit/:orgId/entries?limit=&beforeSeq=&agentDid=
  // -------------------------------------------------------------------------
  app.get<{
    Params: { orgId: string };
    Querystring: { limit?: string; beforeSeq?: string; agentDid?: string };
  }>("/api/v1/audit/:orgId/entries", async (request, reply) => {
    const { orgId } = request.params;
    requireAdminOrViewer(request, reply);
    if (reply.sent) return;
    requireOrg(request, reply, orgId);
    if (reply.sent) return;

    const limit = Math.min(parseInt(request.query.limit ?? "100", 10) || 100, 500);
    const beforeSeq = request.query.beforeSeq ? BigInt(request.query.beforeSeq) : undefined;
    const agentDid = request.query.agentDid;

    const whereClauses = [eq(auditEntries.orgId, orgId)];
    if (beforeSeq !== undefined) whereClauses.push(lt(auditEntries.chainSeq, beforeSeq));
    if (agentDid) whereClauses.push(eq(auditEntries.agentDid, agentDid));

    const rows = await app.db
      .select()
      .from(auditEntries)
      .where(and(...whereClauses))
      .orderBy(desc(auditEntries.chainSeq))
      .limit(limit);

    return reply.send({
      entries: rows.map((r) => ({
        chainSeq: r.chainSeq.toString(),
        timestamp: r.timestamp.toISOString(),
        agentId: r.agentDid,
        action: r.action,
        decision: r.decision,
        hash: r.hash,
        previousHash: r.previousHash,
        policyName: r.policyName,
        policyVersion: r.policyVersion,
        matchedRule: r.matchedRule,
      })),
      nextBeforeSeq: rows.length === limit ? rows[rows.length - 1].chainSeq.toString() : null,
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/audit/:orgId/verify — full-chain integrity walk
  // -------------------------------------------------------------------------
  app.post<{ Params: { orgId: string } }>("/api/v1/audit/:orgId/verify", async (request, reply) => {
    const { orgId } = request.params;
    requireAdminOrViewer(request, reply);
    if (reply.sent) return;
    requireOrg(request, reply, orgId);
    if (reply.sent) return;

    const rows = await app.db
      .select({
        chainSeq: auditEntries.chainSeq,
        hash: auditEntries.hash,
        previousHash: auditEntries.previousHash,
      })
      .from(auditEntries)
      .where(eq(auditEntries.orgId, orgId))
      .orderBy(auditEntries.chainSeq);

    let expectedPrev = "0".repeat(64);
    for (const row of rows) {
      if (row.previousHash !== expectedPrev) {
        return reply.send({
          valid: false,
          breakAt: row.chainSeq.toString(),
          expected: expectedPrev,
          actual: row.previousHash,
          entriesChecked: rows.length,
        });
      }
      expectedPrev = row.hash;
    }
    return reply.send({ valid: true, entriesChecked: rows.length });
  });
}
