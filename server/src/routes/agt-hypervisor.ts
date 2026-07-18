/**
 * AGT Agent Hypervisor routes (Cut 2b step 2.15 — addendum §A18 Tier 3).
 *
 *   GET  /api/v1/hypervisor/agents              -> runtime overview (admin/viewer)
 *   GET  /api/v1/hypervisor/agents/:did         -> per-agent detail
 *   POST /api/v1/hypervisor/agents/:did/pause   -> set identity suspended (admin)
 *   POST /api/v1/hypervisor/agents/:did/resume  -> set identity active (admin)
 *   POST /api/v1/hypervisor/agents/:did/terminate -> revoke identity + agent
 *                                                    kill switch (admin)
 *
 * Runtime state is *derived*, not stored: we read the identities table for
 * static facts (DID, status, capabilities) then layer in the most-recent
 * audit and metric timestamps to compute live / idle / offline.
 *
 *   live    -> last activity within 5 minutes
 *   idle    -> last activity within 1 hour
 *   offline -> older, or never seen
 *
 * Lifecycle actions are thin wrappers: pause/resume mutate `identities.status`
 * and emit `identity_changed`; terminate adds an agent-scoped kill-switch row
 * via the existing kill_switch_scopes table and emits `kill_switch`.
 */

import type { FastifyInstance } from "fastify";
import { and, count, desc, eq, gte, max } from "drizzle-orm";
import { auditEntries, identities, killSwitchScopes, metrics } from "../db/schema.js";
import { requireAdmin, requireAdminOrViewer } from "../middleware/auth.js";
import { eventBus } from "../services/event-bus.js";

const LIVE_THRESHOLD_MS = 5 * 60_000;
const IDLE_THRESHOLD_MS = 60 * 60_000;

type RuntimeState = "live" | "idle" | "offline";

function deriveState(lastSeen: Date | null, now: number): RuntimeState {
  if (!lastSeen) return "offline";
  const age = now - lastSeen.getTime();
  if (age <= LIVE_THRESHOLD_MS) return "live";
  if (age <= IDLE_THRESHOLD_MS) return "idle";
  return "offline";
}

function pickLatest(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

export async function agtHypervisorRoutes(app: FastifyInstance): Promise<void> {
  // ---------------------------------------------------------------------------
  // GET /api/v1/hypervisor/agents
  // ---------------------------------------------------------------------------
  app.get("/api/v1/hypervisor/agents", async (request, reply) => {
    requireAdminOrViewer(request, reply);
    if (reply.sent) return;
    const orgId = request.authUser?.orgId;
    if (!orgId) return reply.code(401).send({ error: "unauthorized" });

    const now = Date.now();

    const [identityRows, auditLatest, metricLatest, activeKsScopes] = await Promise.all([
      app.db
        .select({
          did: identities.did,
          name: identities.name,
          status: identities.status,
          capabilities: identities.capabilities,
          delegationDepth: identities.delegationDepth,
          createdAt: identities.createdAt,
        })
        .from(identities)
        .where(eq(identities.orgId, orgId))
        .orderBy(desc(identities.createdAt)),
      app.db
        .select({
          agentDid: auditEntries.agentDid,
          latest: max(auditEntries.timestamp),
        })
        .from(auditEntries)
        .where(eq(auditEntries.orgId, orgId))
        .groupBy(auditEntries.agentDid),
      app.db
        .select({
          agentDid: metrics.agentDid,
          latest: max(metrics.recordedAt),
        })
        .from(metrics)
        .where(eq(metrics.orgId, orgId))
        .groupBy(metrics.agentDid),
      app.db
        .select({
          id: killSwitchScopes.id,
          scope: killSwitchScopes.scope,
        })
        .from(killSwitchScopes)
        .where(and(eq(killSwitchScopes.orgId, orgId), eq(killSwitchScopes.active, true))),
    ]);

    const auditByDid = new Map<string, Date>();
    for (const r of auditLatest) if (r.latest && r.agentDid) auditByDid.set(r.agentDid, new Date(r.latest));
    const metricByDid = new Map<string, Date>();
    for (const r of metricLatest) if (r.latest && r.agentDid) metricByDid.set(r.agentDid, new Date(r.latest));

    // Org-wide kill switch dominates; per-agent kill switch overrides only
    // for that DID.
    let orgKillSwitch = false;
    const agentKillSwitch = new Set<string>();
    for (const s of activeKsScopes) {
      const scope = (s.scope as { kind?: string; agentDid?: string }) ?? {};
      if (scope.kind === "org") orgKillSwitch = true;
      else if (scope.kind === "agent" && scope.agentDid) agentKillSwitch.add(scope.agentDid);
    }

    const agents = identityRows.map((id) => {
      const lastSeen = pickLatest(auditByDid.get(id.did) ?? null, metricByDid.get(id.did) ?? null);
      const runtime: RuntimeState =
        id.status === "revoked" ? "offline" : id.status === "suspended" ? "idle" : deriveState(lastSeen, now);
      return {
        did: id.did,
        name: id.name,
        status: id.status,
        runtime,
        capabilities: id.capabilities,
        delegationDepth: id.delegationDepth,
        lastSeenAt: lastSeen ? lastSeen.toISOString() : null,
        killSwitchActive: orgKillSwitch || agentKillSwitch.has(id.did),
        registeredAt: id.createdAt,
      };
    });

    const summary = {
      total: agents.length,
      live: agents.filter((a) => a.runtime === "live").length,
      idle: agents.filter((a) => a.runtime === "idle").length,
      offline: agents.filter((a) => a.runtime === "offline").length,
      killSwitched: agents.filter((a) => a.killSwitchActive).length,
    };

    return reply.send({ agents, summary, orgKillSwitch });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/hypervisor/agents/:did
  // ---------------------------------------------------------------------------
  app.get<{ Params: { did: string } }>("/api/v1/hypervisor/agents/:did", async (request, reply) => {
    requireAdminOrViewer(request, reply);
    if (reply.sent) return;
    const orgId = request.authUser?.orgId;
    if (!orgId) return reply.code(401).send({ error: "unauthorized" });

    const did = request.params.did;
    const now = new Date();
    const since24h = new Date(now.getTime() - 24 * 60 * 60_000);

    const [identityRow] = await app.db
      .select()
      .from(identities)
      .where(and(eq(identities.orgId, orgId), eq(identities.did, did)))
      .limit(1);
    if (!identityRow) return reply.code(404).send({ error: "not found" });

    const [latestAudit, latestMetric, allowCount, denyCount, metricCount] = await Promise.all([
      app.db
        .select({ ts: max(auditEntries.timestamp) })
        .from(auditEntries)
        .where(and(eq(auditEntries.orgId, orgId), eq(auditEntries.agentDid, did))),
      app.db
        .select({ ts: max(metrics.recordedAt) })
        .from(metrics)
        .where(and(eq(metrics.orgId, orgId), eq(metrics.agentDid, did))),
      app.db
        .select({ value: count() })
        .from(auditEntries)
        .where(
          and(
            eq(auditEntries.orgId, orgId),
            eq(auditEntries.agentDid, did),
            eq(auditEntries.decision, "allow"),
            gte(auditEntries.timestamp, since24h),
          ),
        ),
      app.db
        .select({ value: count() })
        .from(auditEntries)
        .where(
          and(
            eq(auditEntries.orgId, orgId),
            eq(auditEntries.agentDid, did),
            eq(auditEntries.decision, "deny"),
            gte(auditEntries.timestamp, since24h),
          ),
        ),
      app.db
        .select({ value: count() })
        .from(metrics)
        .where(and(eq(metrics.orgId, orgId), eq(metrics.agentDid, did), gte(metrics.recordedAt, since24h))),
    ]);

    const auditTs = latestAudit[0]?.ts ? new Date(latestAudit[0].ts) : null;
    const metricTs = latestMetric[0]?.ts ? new Date(latestMetric[0].ts) : null;
    const lastSeen = pickLatest(auditTs, metricTs);

    const runtime: RuntimeState =
      identityRow.status === "revoked"
        ? "offline"
        : identityRow.status === "suspended"
          ? "idle"
          : deriveState(lastSeen, now.getTime());

    return reply.send({
      did: identityRow.did,
      name: identityRow.name,
      status: identityRow.status,
      runtime,
      capabilities: identityRow.capabilities,
      lastSeenAt: lastSeen ? lastSeen.toISOString() : null,
      lastAuditAt: auditTs ? auditTs.toISOString() : null,
      lastMetricAt: metricTs ? metricTs.toISOString() : null,
      registeredAt: identityRow.createdAt,
      activity24h: {
        allow: Number(allowCount[0]?.value ?? 0),
        deny: Number(denyCount[0]?.value ?? 0),
        metrics: Number(metricCount[0]?.value ?? 0),
      },
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/hypervisor/agents/:did/pause
  // ---------------------------------------------------------------------------
  app.post<{ Params: { did: string } }>("/api/v1/hypervisor/agents/:did/pause", async (request, reply) => {
    requireAdmin(request, reply);
    if (reply.sent) return;
    const orgId = request.authUser?.orgId;
    if (!orgId) return reply.code(401).send({ error: "unauthorized" });

    const [row] = await app.db
      .update(identities)
      .set({ status: "suspended" })
      .where(and(eq(identities.orgId, orgId), eq(identities.did, request.params.did)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });

    eventBus.broadcast(orgId, "identity_changed", {
      did: row.did,
      status: row.status,
      action: "pause",
    });
    return reply.send(row);
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/hypervisor/agents/:did/resume
  // ---------------------------------------------------------------------------
  app.post<{ Params: { did: string } }>("/api/v1/hypervisor/agents/:did/resume", async (request, reply) => {
    requireAdmin(request, reply);
    if (reply.sent) return;
    const orgId = request.authUser?.orgId;
    if (!orgId) return reply.code(401).send({ error: "unauthorized" });

    const [row] = await app.db
      .update(identities)
      .set({ status: "active" })
      .where(and(eq(identities.orgId, orgId), eq(identities.did, request.params.did)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });

    eventBus.broadcast(orgId, "identity_changed", {
      did: row.did,
      status: row.status,
      action: "resume",
    });
    return reply.send(row);
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/hypervisor/agents/:did/terminate
  //   1. set identity status to revoked
  //   2. open an agent-scoped kill switch (so the client stops mid-flight)
  // ---------------------------------------------------------------------------
  app.post<{ Params: { did: string } }>("/api/v1/hypervisor/agents/:did/terminate", async (request, reply) => {
    requireAdmin(request, reply);
    if (reply.sent) return;
    const orgId = request.authUser?.orgId;
    const userId = request.authUser?.userId;
    if (!orgId || !userId) return reply.code(401).send({ error: "unauthorized" });

    const did = request.params.did;
    const now = new Date();

    const [row] = await app.db
      .update(identities)
      .set({ status: "revoked" })
      .where(and(eq(identities.orgId, orgId), eq(identities.did, did)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });

    const [scope] = await app.db
      .insert(killSwitchScopes)
      .values({
        orgId,
        scope: { kind: "agent", agentDid: did },
        active: true,
        message: "Terminated via Hypervisor",
        activatedBy: userId,
        activatedAt: now,
      })
      .returning();

    app.metrics.killSwitchGauge.set(1);
    eventBus.broadcast(orgId, "identity_changed", {
      did: row.did,
      status: row.status,
      action: "terminate",
    });
    eventBus.broadcast(orgId, "kill_switch", {
      active: true,
      scope: "agent",
      reason: "Hypervisor termination",
      scopeId: scope.id,
      agentDid: did,
    });

    return reply.send({ identity: row, killSwitchScope: scope });
  });
}
