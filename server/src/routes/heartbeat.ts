/**
 * Heartbeat routes – client health check and kill switch status.
 */

import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { requireAdminOrViewer, requireOrg } from "../middleware/auth.js";
import { auditEvents, clientHeartbeats, organizations, policies, users } from "../db/schema.js";

const DEFAULT_ONLINE_THRESHOLD_MS = 5 * 60 * 1000;
const DEFAULT_CRASH_GAP_THRESHOLD_MS = 5 * 60 * 1000;

type CrashRestartEventType = "agent_crash" | "agent_restart";

async function recordAgentLifecycleEvent(params: {
  app: FastifyInstance;
  orgId: string;
  userId: string;
  eventType: CrashRestartEventType;
  outcome: "error" | "success";
  metadata: Record<string, unknown>;
}): Promise<void> {
  await params.app.db.insert(auditEvents).values({
    orgId: params.orgId,
    userId: params.userId,
    eventType: params.eventType,
    outcome: params.outcome,
    metadata: params.metadata,
    timestamp: new Date(),
  });
}

export async function heartbeatRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/v1/heartbeat/:orgId
   * List all connected clients for the org (admin or viewer).
   */
  app.get<{
    Params: { orgId: string };
    Querystring: { tag?: string; group?: string; status?: "online" | "offline" };
  }>(
    "/api/v1/heartbeat/:orgId",
    { config: { rateLimit: { max: 100, timeWindow: "1 minute" } } },
    async (request, reply) => {
      requireAdminOrViewer(request, reply);
      if (reply.sent) return;
      const { orgId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const db = app.db;
      const tagFilter = request.query.tag?.trim();
      const groupFilter = request.query.group?.trim();
      const statusFilter = request.query.status;

      const clients = await db
        .select({
          userId: clientHeartbeats.userId,
          email: users.email,
          name: users.name,
          role: users.role,
          lastHeartbeatAt: clientHeartbeats.lastHeartbeatAt,
          clientVersion: clientHeartbeats.clientVersion,
          groupName: clientHeartbeats.groupName,
          tags: clientHeartbeats.tags,
        })
        .from(clientHeartbeats)
        .innerJoin(users, eq(clientHeartbeats.userId, users.id))
        .where(eq(clientHeartbeats.orgId, orgId))
        .orderBy(desc(clientHeartbeats.lastHeartbeatAt));

      // Determine online/offline status (online = heartbeat within last 5 minutes)
      const now = Date.now();
      const [orgRow] = await db
        .select({ settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);
      const onlineThresholdMs = orgRow?.settings?.heartbeatOnlineThresholdMs ?? DEFAULT_ONLINE_THRESHOLD_MS;

      const filtered = clients
        .map((client) => ({
          ...client,
          tags: client.tags ?? [],
          status: now - new Date(client.lastHeartbeatAt).getTime() < onlineThresholdMs ? "online" : "offline",
        }))
        .filter((client) => {
          if (tagFilter && !client.tags.includes(tagFilter)) return false;
          if (groupFilter && client.groupName !== groupFilter) return false;
          if (statusFilter && client.status !== statusFilter) return false;
          return true;
        });

      const uniqueTags = Array.from(
        new Set(
          clients.flatMap((client) => {
            const tags = client.tags ?? [];
            return tags;
          }),
        ),
      ).sort((a, b) => a.localeCompare(b));
      const uniqueGroups = Array.from(
        new Set(clients.map((client) => client.groupName).filter((v): v is string => !!v)),
      ).sort((a, b) => a.localeCompare(b));

      return reply.send({
        clients: filtered,
        summary: {
          total: filtered.length,
          online: filtered.filter((c) => c.status === "online").length,
          offline: filtered.filter((c) => c.status === "offline").length,
        },
        facets: {
          tags: uniqueTags,
          groups: uniqueGroups,
        },
      });
    },
  );

  app.put<{
    Params: { orgId: string; userId: string };
    Body: { groupName?: string | null; tags?: string[] };
  }>(
    "/api/v1/heartbeat/:orgId/:userId/metadata",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request, reply) => {
      requireAdminOrViewer(request, reply);
      if (reply.sent) return;
      const { orgId, userId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const normalizedTags = Array.from(
        new Set((request.body.tags ?? []).map((tag) => tag.trim()).filter((tag) => tag.length > 0)),
      );
      const groupName = request.body.groupName?.trim() || null;

      const [updated] = await app.db
        .update(clientHeartbeats)
        .set({
          groupName,
          tags: normalizedTags,
        })
        .where(and(eq(clientHeartbeats.orgId, orgId), eq(clientHeartbeats.userId, userId)))
        .returning({
          userId: clientHeartbeats.userId,
          groupName: clientHeartbeats.groupName,
          tags: clientHeartbeats.tags,
        });

      if (!updated) {
        return reply.code(404).send({ error: "Instance heartbeat not found" });
      }

      return reply.send({ instance: updated });
    },
  );

  /**
   * GET /api/v1/heartbeat/:orgId/:userId
   * Client heartbeat – returns kill switch status and policy version.
   * Accepts optional ?policyVersion=N to enable smart refresh detection.
   */
  app.get<{
    Params: { orgId: string; userId: string };
    Querystring: { policyVersion?: string; clientVersion?: string; startupId?: string };
  }>(
    "/api/v1/heartbeat/:orgId/:userId",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { orgId, userId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const db = app.db;
      const clientVersionParam = request.query.clientVersion;
      const startupIdParam = request.query.startupId;
      const now = new Date();

      // Track heartbeat metric (#76)
      app.metrics.heartbeatCounter.inc();

      // Verify user exists before upserting heartbeat (prevents FK violation).
      const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
      if (!user) {
        return reply.code(401).send({ error: "Unknown user; please re-authenticate" });
      }

      const [existingHeartbeat] = await db
        .select({
          lastHeartbeatAt: clientHeartbeats.lastHeartbeatAt,
          startupId: clientHeartbeats.startupId,
        })
        .from(clientHeartbeats)
        .where(and(eq(clientHeartbeats.orgId, orgId), eq(clientHeartbeats.userId, userId)))
        .limit(1);

      const [orgRow] = await db
        .select({ settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);
      const crashGapThresholdMs = orgRow?.settings?.heartbeatOfflineThresholdMs ?? DEFAULT_CRASH_GAP_THRESHOLD_MS;

      if (existingHeartbeat) {
        const previousHeartbeatAt = new Date(existingHeartbeat.lastHeartbeatAt);
        const gapMs = now.getTime() - previousHeartbeatAt.getTime();
        if (gapMs >= crashGapThresholdMs) {
          await recordAgentLifecycleEvent({
            app,
            orgId,
            userId,
            eventType: "agent_crash",
            outcome: "error",
            metadata: {
              reason: "heartbeat_gap",
              heartbeatGapMs: gapMs,
              thresholdMs: crashGapThresholdMs,
              previousHeartbeatAt: previousHeartbeatAt.toISOString(),
              detectedAt: now.toISOString(),
              clientVersion: clientVersionParam ?? null,
              startupId: startupIdParam ?? existingHeartbeat.startupId ?? null,
            },
          });
        }

        if (startupIdParam && existingHeartbeat.startupId && startupIdParam !== existingHeartbeat.startupId) {
          await recordAgentLifecycleEvent({
            app,
            orgId,
            userId,
            eventType: "agent_restart",
            outcome: "success",
            metadata: {
              reason: "startup_marker_changed",
              previousStartupId: existingHeartbeat.startupId,
              startupId: startupIdParam,
              detectedAt: now.toISOString(),
              previousHeartbeatAt: previousHeartbeatAt.toISOString(),
              heartbeatGapMs: gapMs,
              clientVersion: clientVersionParam ?? null,
            },
          });
        }
      }

      // Upsert heartbeat record.
      await db
        .insert(clientHeartbeats)
        .values({
          orgId,
          userId,
          lastHeartbeatAt: now,
          clientVersion: clientVersionParam ?? null,
          startupId: startupIdParam ?? null,
          tags: [],
        })
        .onConflictDoUpdate({
          target: [clientHeartbeats.orgId, clientHeartbeats.userId],
          set: {
            lastHeartbeatAt: now,
            clientVersion: clientVersionParam ?? null,
            startupId: startupIdParam ?? null,
          },
        });

      // Fetch current policy for kill switch status.
      const [policy] = await db
        .select({
          version: policies.version,
          killSwitch: policies.killSwitch,
          killSwitchMessage: policies.killSwitchMessage,
        })
        .from(policies)
        .where(eq(policies.orgId, orgId))
        .limit(1);

      const serverVersion = policy?.version ?? 0;
      const clientVersion = request.query.policyVersion ? parseInt(request.query.policyVersion, 10) : null;

      // If client sent its version and it differs from server, tell it to refresh.
      const refreshPolicyNow = clientVersion !== null && !isNaN(clientVersion) && clientVersion !== serverVersion;

      return reply.send({
        policyVersion: serverVersion,
        killSwitch: policy?.killSwitch ?? false,
        killSwitchMessage: policy?.killSwitchMessage ?? undefined,
        refreshPolicyNow,
      });
    },
  );

  /**
   * GET /api/v1/heartbeat/:orgId/:userId/events
   * Query crash/restart lifecycle history for a specific client.
   */
  app.get<{
    Params: { orgId: string; userId: string };
    Querystring: { limit?: string };
  }>(
    "/api/v1/heartbeat/:orgId/:userId/events",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request, reply) => {
      requireAdminOrViewer(request, reply);
      if (reply.sent) return;
      const { orgId, userId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const limit = Math.min(Math.max(parseInt(request.query.limit ?? "100", 10) || 100, 1), 500);
      const events = await app.db
        .select({
          id: auditEvents.id,
          eventType: auditEvents.eventType,
          outcome: auditEvents.outcome,
          metadata: auditEvents.metadata,
          timestamp: auditEvents.timestamp,
        })
        .from(auditEvents)
        .where(
          and(eq(auditEvents.orgId, orgId), eq(auditEvents.userId, userId), eq(auditEvents.eventType, "agent_crash")),
        )
        .orderBy(desc(auditEvents.timestamp))
        .limit(limit);

      const restartEvents = await app.db
        .select({
          id: auditEvents.id,
          eventType: auditEvents.eventType,
          outcome: auditEvents.outcome,
          metadata: auditEvents.metadata,
          timestamp: auditEvents.timestamp,
        })
        .from(auditEvents)
        .where(
          and(eq(auditEvents.orgId, orgId), eq(auditEvents.userId, userId), eq(auditEvents.eventType, "agent_restart")),
        )
        .orderBy(desc(auditEvents.timestamp))
        .limit(limit);

      const combined = [...events, ...restartEvents]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);

      return reply.send({
        events: combined,
        summary: {
          total: combined.length,
          crashes: combined.filter((event) => event.eventType === "agent_crash").length,
          restarts: combined.filter((event) => event.eventType === "agent_restart").length,
        },
      });
    },
  );
}
