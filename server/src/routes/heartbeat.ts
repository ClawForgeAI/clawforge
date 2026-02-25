/**
 * Heartbeat routes – client health check and kill switch status.
 */

import type { FastifyInstance } from "fastify";
import { eq, desc } from "drizzle-orm";
import { requireAdmin, requireAdminOrViewer, requireOrg } from "../middleware/auth.js";
import { clientHeartbeats, policies, users } from "../db/schema.js";

export async function heartbeatRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/v1/heartbeat/:orgId
   * List all connected clients for the org (admin or viewer).
   */
  app.get<{ Params: { orgId: string } }>(
    "/api/v1/heartbeat/:orgId",
    async (request, reply) => {
      requireAdminOrViewer(request, reply);
      if (reply.sent) return;
      const { orgId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const db = app.db;

      const clients = await db
        .select({
          userId: clientHeartbeats.userId,
          email: users.email,
          name: users.name,
          role: users.role,
          lastHeartbeatAt: clientHeartbeats.lastHeartbeatAt,
          clientVersion: clientHeartbeats.clientVersion,
        })
        .from(clientHeartbeats)
        .innerJoin(users, eq(clientHeartbeats.userId, users.id))
        .where(eq(clientHeartbeats.orgId, orgId))
        .orderBy(desc(clientHeartbeats.lastHeartbeatAt));

      // Determine online/offline status (online = heartbeat within last 5 minutes)
      const now = Date.now();
      const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

      const enriched = clients.map((c) => ({
        ...c,
        status: (now - new Date(c.lastHeartbeatAt).getTime()) < ONLINE_THRESHOLD_MS ? "online" : "offline",
      }));

      return reply.send({
        clients: enriched,
        summary: {
          total: enriched.length,
          online: enriched.filter((c) => c.status === "online").length,
          offline: enriched.filter((c) => c.status === "offline").length,
        },
      });
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
    async (request, reply) => {
      const { orgId, userId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const db = app.db;
      const clientVersionParam = request.query.clientVersion;

      // Upsert heartbeat record.
      await db
        .insert(clientHeartbeats)
        .values({
          orgId,
          userId,
          lastHeartbeatAt: new Date(),
          clientVersion: clientVersionParam ?? null,
        })
        .onConflictDoUpdate({
          target: [clientHeartbeats.orgId, clientHeartbeats.userId],
          set: {
            lastHeartbeatAt: new Date(),
            clientVersion: clientVersionParam ?? undefined,
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
      const clientVersion = request.query.policyVersion
        ? parseInt(request.query.policyVersion, 10)
        : null;

      // If client sent its version and it differs from server, tell it to refresh.
      const refreshPolicyNow =
        clientVersion !== null && !isNaN(clientVersion) && clientVersion !== serverVersion;

      return reply.send({
        policyVersion: serverVersion,
        killSwitch: policy?.killSwitch ?? false,
        killSwitchMessage: policy?.killSwitchMessage ?? undefined,
        refreshPolicyNow,
      });
    },
  );
}
