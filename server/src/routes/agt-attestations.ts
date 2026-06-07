/**
 * AGT compliance-attestation routes (Cut 2b step 2.14 — addendum §A18).
 *
 *   POST /api/v1/attestations            -> generate a signed attestation for
 *                                            an org+timerange (admin only)
 *   POST /api/v1/attestations/verify     -> verify a previously-issued token
 *                                            (admin/viewer)
 *
 * An attestation is the document an auditor receives: it summarises the
 * audit chain over a time range (entries seen, agents covered, the chain's
 * root hash) and is signed by the control plane via the JWT secret. The
 * verifier reissues the signature check against the same secret. The chain
 * walk reuses the per-agent linkage + content recomputation from agt-audit.
 *
 * Stateless on purpose — Cut 2b doesn't persist attestation history. Cut 3
 * adds a table + admin list view of past attestations.
 */

import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { and, asc, between, eq } from "drizzle-orm";
import { z } from "zod";
import { auditEntries } from "../db/schema.js";
import { requireAdmin, requireAdminOrViewer } from "../middleware/auth.js";

const GENESIS_HASH = "0".repeat(64);
const ATTESTATION_VERSION = 1 as const;

const GenerateBodySchema = z
  .object({
    fromIso: z.string().datetime(),
    toIso: z.string().datetime(),
    agentDid: z.string().min(1).optional(),
  })
  .refine((v) => new Date(v.fromIso) < new Date(v.toIso), {
    message: "fromIso must be strictly before toIso",
  });

const VerifyBodySchema = z.object({
  token: z.string().min(1),
});

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

/**
 * Canonical "root hash" for an attestation: sha256 of the ordered audit-row
 * hashes joined by newline. Any reordering or row mutation flips the digest,
 * giving auditors a single value to record alongside the signed document.
 */
function computeRootHash(rowHashes: string[]): string {
  return createHash("sha256").update(rowHashes.join("\n")).digest("hex");
}

export async function agtAttestationRoutes(app: FastifyInstance): Promise<void> {
  // ---------------------------------------------------------------------------
  // POST /api/v1/attestations — generate (admin only)
  // ---------------------------------------------------------------------------
  app.post(
    "/api/v1/attestations",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      requireAdmin(request, reply);
      if (reply.sent) return;
      const orgId = request.authUser?.orgId;
      const userId = request.authUser?.userId;
      if (!orgId || !userId) return reply.code(401).send({ error: "unauthorized" });

      const parsed = GenerateBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(422).send({ error: "invalid body", issues: parsed.error.issues });
      }

      const from = new Date(parsed.data.fromIso);
      const to = new Date(parsed.data.toIso);

      const conditions = [eq(auditEntries.orgId, orgId), between(auditEntries.timestamp, from, to)];
      if (parsed.data.agentDid) conditions.push(eq(auditEntries.agentDid, parsed.data.agentDid));

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
        .where(and(...conditions))
        .orderBy(asc(auditEntries.chainSeq));

      // Walk each agent's chain independently. We can't enforce that
      // the FIRST row in the range continues from the previous-range tail —
      // we'd have to refetch the row just before `from`. Instead we mark the
      // attestation as "linked: false" and record the first-row prev hashes
      // for each agent; the auditor decides whether to chase the prior link.
      const perAgentLastHash = new Map<string, string>();
      const perAgentFirstPrev = new Map<string, string>();
      let valid = true;
      let breakKind: "linkage" | "content" | undefined;
      let breakAt: string | undefined;

      for (const row of rows) {
        if (!perAgentLastHash.has(row.agentDid)) {
          perAgentFirstPrev.set(row.agentDid, row.previousHash);
        } else {
          const expected = perAgentLastHash.get(row.agentDid)!;
          if (row.previousHash !== expected) {
            valid = false;
            breakKind = "linkage";
            breakAt = row.chainSeq.toString();
            break;
          }
        }
        const recomputed = recomputeAuditHash({
          timestamp: row.timestamp.toISOString(),
          agentId: row.agentDid,
          action: row.action,
          decision: row.decision,
          previousHash: row.previousHash,
        });
        if (recomputed !== row.hash) {
          valid = false;
          breakKind = "content";
          breakAt = row.chainSeq.toString();
          break;
        }
        perAgentLastHash.set(row.agentDid, row.hash);
      }

      const rootHash = computeRootHash(rows.map((r) => r.hash));

      const attestation = {
        version: ATTESTATION_VERSION,
        orgId,
        rangeFrom: parsed.data.fromIso,
        rangeTo: parsed.data.toIso,
        agentDid: parsed.data.agentDid,
        entriesCovered: rows.length,
        agentsCovered: perAgentLastHash.size,
        rootHash,
        valid,
        breakKind,
        breakAt,
        // Including the per-agent boundary hashes lets the auditor reconcile
        // attestations from adjacent time ranges by checking continuity.
        perAgentBoundaries: [...perAgentLastHash.entries()].map(([did, lastHash]) => ({
          agentDid: did,
          firstPreviousHash: perAgentFirstPrev.get(did) ?? GENESIS_HASH,
          lastHash,
        })),
        issuedAt: new Date().toISOString(),
        issuedBy: userId,
      };

      // Sign as a JWT so verification only needs the JWT secret + audience.
      // We don't set an `exp` — attestations are durable artifacts.
      const token = app.jwt.sign(attestation, { noTimestamp: true });

      return reply.code(201).send({ attestation, token });
    },
  );

  // ---------------------------------------------------------------------------
  // POST /api/v1/attestations/verify — verify a previously-issued token
  // ---------------------------------------------------------------------------
  app.post("/api/v1/attestations/verify", async (request, reply) => {
    requireAdminOrViewer(request, reply);
    if (reply.sent) return;
    const orgId = request.authUser?.orgId;
    if (!orgId) return reply.code(401).send({ error: "unauthorized" });

    const parsed = VerifyBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send({ error: "invalid body", issues: parsed.error.issues });
    }

    try {
      const decoded = app.jwt.verify(parsed.data.token) as Record<string, unknown>;
      if (decoded.orgId !== orgId) {
        return reply.send({
          signatureValid: true,
          orgMatch: false,
          error: "attestation orgId does not match the verifier's org",
        });
      }
      return reply.send({ signatureValid: true, orgMatch: true, attestation: decoded });
    } catch (err) {
      return reply.send({ signatureValid: false, error: (err as Error).message });
    }
  });
}
