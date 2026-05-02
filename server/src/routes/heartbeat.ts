/**
 * Heartbeat routes – client health check and kill switch status.
 */

import type { FastifyInstance } from "fastify";
import { and, eq, desc } from "drizzle-orm";
import { requireAdminOrViewer, requireOrg } from "../middleware/auth.js";
import { clientHeartbeats, policies, users } from "../db/schema.js";

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
      const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

      const filtered = clients
        .map((client) => ({
          ...client,
          tags: client.tags ?? [],
          status: now - new Date(client.lastHeartbeatAt).getTime() < ONLINE_THRESHOLD_MS ? "online" : "offline",
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
    Querystring: { policyVersion?: string; clientVersion?: string };
  }>(
    "/api/v1/heartbeat/:orgId/:userId",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { orgId, userId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const db = app.db;
      const clientVersionParam = request.query.clientVersion;

      // Track heartbeat metric (#76)
      app.metrics.heartbeatCounter.inc();

      // Verify user exists before upserting heartbeat (prevents FK violation).
      const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
      if (!user) {
        return reply.code(401).send({ error: "Unknown user; please re-authenticate" });
      }

      // Upsert heartbeat record.
      await db
        .insert(clientHeartbeats)
        .values({
          orgId,
          userId,
          lastHeartbeatAt: new Date(),
          clientVersion: clientVersionParam ?? null,
          tags: [],
        })
        .onConflictDoUpdate({
          target: [clientHeartbeats.orgId, clientHeartbeats.userId],
          set: {
            lastHeartbeatAt: new Date(),
            clientVersion: clientVersionParam ?? null,
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
}
