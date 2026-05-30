/**
 * AGT-canonical audit routes (Cut 1 step 7 — addendum §5.3, §A19).
 *
 *   POST /api/v1/audit/:orgId/entries  -> append AGT AuditEntry[] with chain check
 *   GET  /api/v1/audit/:orgId/entries  -> paginated read
 *   POST /api/v1/audit/:orgId/verify   -> walk the chain, return integrity status
 */

import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { and, desc, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { AuditEntry } from "@clawforgeai/policy-schema";
import { auditEntries } from "../db/schema.js";
import { requireAdminOrViewer, requireOrg } from "../middleware/auth.js";

const GENESIS_HASH = "0".repeat(64);

/**
 * Recompute the hash of an AGT AuditEntry from its content using the exact
 * recipe AGT's `AuditLogger.log()` uses (agent-governance-typescript/src/
 * audit.ts). The JSON key order is load-bearing — JS preserves insertion
 * order and so does AGT, so swap and the hashes stop matching. Keep in sync.
 */
function recomputeAuditHash(entry: {
  timestamp: string;
  agentId: string;
  action: string;
  decision: string;
  previousHash: string;
}): string {
  const payload = JSON.stringify({
    timestamp: entry.timestamp,
    agentId: entry.agentId,
    action: entry.action,
    decision: entry.decision,
    previousHash: entry.previousHash,
  });
  return createHash("sha256").update(payload).digest("hex");
}

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

    // AGT chains are per-agent — each `Clawforge.connect()` builds its own
    // `AuditLogger` starting at genesis. Validate the batch carries a single
    // agentDid and look up the last hash for THAT agent within the org.
    const agentDid = parsed.data[0].agentId;
    if (parsed.data.some((e) => e.agentId !== agentDid)) {
      return reply.code(422).send({
        error: "batch must contain entries from a single agentDid",
      });
    }
    const [latest] = await app.db
      .select({ hash: auditEntries.hash })
      .from(auditEntries)
      .where(and(eq(auditEntries.orgId, orgId), eq(auditEntries.agentDid, agentDid)))
      .orderBy(desc(auditEntries.chainSeq))
      .limit(1);
    let expectedPrev = latest?.hash ?? GENESIS_HASH;
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
  //
  // Two checks per row, in order:
  //   1. linkage:    row.previousHash must equal the prior row's hash
  //                  (catches missing / reordered rows)
  //   2. content:    sha256(canonical payload from row content) must equal
  //                  row.hash (catches in-place mutation of action, decision,
  //                  agent_did, or timestamp without a re-hash)
  //
  // A chain emitted by `cf.audit()` re-verifies via AGT's `AuditLogger.verify()`
  // because both sides use the exact same hash recipe.
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
        timestamp: auditEntries.timestamp,
        agentDid: auditEntries.agentDid,
        action: auditEntries.action,
        decision: auditEntries.decision,
        hash: auditEntries.hash,
        previousHash: auditEntries.previousHash,
      })
      .from(auditEntries)
      .where(eq(auditEntries.orgId, orgId))
      .orderBy(auditEntries.chainSeq);

    // Chains are per-agent — group rows by agentDid and walk each independently.
    // expectedPrev starts at genesis for every agent's first row.
    const perAgentExpected = new Map<string, string>();
    for (const row of rows) {
      const expectedPrev = perAgentExpected.get(row.agentDid) ?? GENESIS_HASH;
      if (row.previousHash !== expectedPrev) {
        return reply.send({
          valid: false,
          breakAt: row.chainSeq.toString(),
          breakKind: "linkage",
          breakAgentDid: row.agentDid,
          expected: expectedPrev,
          actual: row.previousHash,
          entriesChecked: rows.length,
        });
      }
      const recomputed = recomputeAuditHash({
        timestamp: row.timestamp.toISOString(),
        agentId: row.agentDid,
        action: row.action,
        decision: row.decision,
        previousHash: row.previousHash,
      });
      if (recomputed !== row.hash) {
        return reply.send({
          valid: false,
          breakAt: row.chainSeq.toString(),
          breakKind: "content",
          breakAgentDid: row.agentDid,
          expected: recomputed,
          actual: row.hash,
          entriesChecked: rows.length,
        });
      }
      perAgentExpected.set(row.agentDid, row.hash);
    }
    return reply.send({
      valid: true,
      entriesChecked: rows.length,
      agentsChecked: perAgentExpected.size,
    });
  });
}
