/**
 * AGT identity routes (Cut 1 step 7 — addendum §5.3; Cut 2b step 2.10).
 *
 *   GET    /api/v1/identities                          -> list for current org
 *   POST   /api/v1/identities                          -> register a DID (admin)
 *   GET    /api/v1/identities/:did                     -> single identity
 *   GET    /api/v1/identities/:did/delegations         -> delegations in & out
 *   PATCH  /api/v1/identities/:did/status              -> change status (admin)
 *   GET    /api/v1/delegations                         -> list all delegations
 */

import type { FastifyInstance } from "fastify";
import { and, desc, eq, or } from "drizzle-orm";
import { z } from "zod";
import { AgentIdentityJSON, IdentityStatus } from "@clawforgeai/policy-schema";
import { delegations, identities } from "../db/schema.js";
import { requireAdmin, requireAdminOrViewer } from "../middleware/auth.js";

const StatusUpdateSchema = z.object({ status: IdentityStatus });

export async function agtIdentityRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/identities", async (request, reply) => {
    requireAdminOrViewer(request, reply);
    if (reply.sent) return;
    const orgId = request.authUser?.orgId;
    if (!orgId) return reply.code(401).send({ error: "unauthorized" });

    const rows = await app.db
      .select()
      .from(identities)
      .where(eq(identities.orgId, orgId))
      .orderBy(desc(identities.createdAt));
    return reply.send({ identities: rows });
  });

  app.post("/api/v1/identities", async (request, reply) => {
    requireAdmin(request, reply);
    if (reply.sent) return;
    const orgId = request.authUser?.orgId;
    if (!orgId) return reply.code(401).send({ error: "unauthorized" });

    const parsed = AgentIdentityJSON.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send({ error: "invalid AgentIdentityJSON", issues: parsed.error.issues });
    }

    const [row] = await app.db
      .insert(identities)
      .values({
        orgId,
        did: parsed.data.did,
        publicKey: parsed.data.publicKey,
        parentDid: parsed.data.parentDid,
        capabilities: parsed.data.capabilities,
        status: parsed.data.status ?? "active",
        name: parsed.data.name,
        description: parsed.data.description,
        sponsor: parsed.data.sponsor,
        delegationDepth: parsed.data.delegationDepth ?? 0,
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      })
      .onConflictDoUpdate({
        target: [identities.orgId, identities.did],
        set: {
          publicKey: parsed.data.publicKey,
          capabilities: parsed.data.capabilities,
          status: parsed.data.status ?? "active",
        },
      })
      .returning();
    return reply.code(201).send(row);
  });

  app.get<{ Params: { did: string } }>("/api/v1/identities/:did", async (request, reply) => {
    requireAdminOrViewer(request, reply);
    if (reply.sent) return;
    const orgId = request.authUser?.orgId;
    if (!orgId) return reply.code(401).send({ error: "unauthorized" });

    const [row] = await app.db
      .select()
      .from(identities)
      .where(and(eq(identities.orgId, orgId), eq(identities.did, request.params.did)))
      .limit(1);
    if (!row) return reply.code(404).send({ error: "not found" });
    return reply.send(row);
  });

  app.patch<{ Params: { did: string } }>("/api/v1/identities/:did/status", async (request, reply) => {
    requireAdmin(request, reply);
    if (reply.sent) return;
    const orgId = request.authUser?.orgId;
    if (!orgId) return reply.code(401).send({ error: "unauthorized" });
    const parsed = StatusUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send({ error: "invalid status", issues: parsed.error.issues });
    }
    const [row] = await app.db
      .update(identities)
      .set({ status: parsed.data.status })
      .where(and(eq(identities.orgId, orgId), eq(identities.did, request.params.did)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return reply.send(row);
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/identities/:did/delegations — delegations touching this DID
  // ---------------------------------------------------------------------------
  app.get<{ Params: { did: string } }>("/api/v1/identities/:did/delegations", async (request, reply) => {
    requireAdminOrViewer(request, reply);
    if (reply.sent) return;
    const orgId = request.authUser?.orgId;
    if (!orgId) return reply.code(401).send({ error: "unauthorized" });

    const did = request.params.did;
    const rows = await app.db
      .select()
      .from(delegations)
      .where(and(eq(delegations.orgId, orgId), or(eq(delegations.issuerDid, did), eq(delegations.subjectDid, did))))
      .orderBy(desc(delegations.createdAt));

    const outgoing = rows.filter((r) => r.issuerDid === did);
    const incoming = rows.filter((r) => r.subjectDid === did);
    return reply.send({ outgoing, incoming });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/delegations — list every delegation for the current org
  // ---------------------------------------------------------------------------
  app.get("/api/v1/delegations", async (request, reply) => {
    requireAdminOrViewer(request, reply);
    if (reply.sent) return;
    const orgId = request.authUser?.orgId;
    if (!orgId) return reply.code(401).send({ error: "unauthorized" });

    const rows = await app.db
      .select()
      .from(delegations)
      .where(eq(delegations.orgId, orgId))
      .orderBy(desc(delegations.createdAt));

    return reply.send({ delegations: rows });
  });
}
