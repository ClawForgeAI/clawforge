/**
 * Policy routes – CRUD for org policies.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin, requireAdminOrViewer, requireOrg } from "../middleware/auth.js";
import { PolicyService } from "../services/policy-service.js";
import { logAdminAction } from "../services/admin-audit.js";
import { eventBus } from "../services/event-bus.js";

const UpdatePolicyBodySchema = z.object({
  toolsConfig: z
    .object({
      allow: z.array(z.string()).optional(),
      deny: z.array(z.string()).optional(),
      profile: z.string().optional(),
    })
    .optional(),
  skillsConfig: z
    .object({
      requireApproval: z.boolean(),
      approved: z.array(
        z.object({
          name: z.string(),
          key: z.string(),
          scope: z.enum(["org", "self"]),
        }),
      ),
    })
    .optional(),
  auditLevel: z.enum(["full", "metadata", "off"]).optional(),
});

const KillSwitchBodySchema = z.object({
  active: z.boolean(),
  message: z.string().optional(),
});

export async function policyRoutes(app: FastifyInstance): Promise<void> {
  const policyService = new PolicyService(app.db);

  /**
   * GET /api/v1/policies/:orgId/effective
   * Get effective policy for the authenticated user.
   */
  app.get<{ Params: { orgId: string }; Querystring: { userId?: string } }>(
    "/api/v1/policies/:orgId/effective",
    async (request, reply) => {
      const { orgId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const userId = request.query.userId ?? request.authUser!.userId;
      const policy = await policyService.getEffectivePolicy(orgId, userId);

      if (!policy) {
        return reply.code(404).send({ error: "No policy configured for this organization" });
      }

      return reply.send(policy);
    },
  );

  /**
   * GET /api/v1/policies/:orgId
   * Get raw org policy (admin or viewer).
   */
  app.get<{ Params: { orgId: string } }>(
    "/api/v1/policies/:orgId",
    async (request, reply) => {
      requireAdminOrViewer(request, reply);
      if (reply.sent) return;
      const { orgId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const policy = await policyService.getOrgPolicy(orgId);
      if (!policy) {
        return reply.code(404).send({ error: "No policy found" });
      }

      return reply.send(policy);
    },
  );

  /**
   * PUT /api/v1/policies/:orgId
   * Update org policy (admin only).
   */
  app.put<{ Params: { orgId: string } }>(
    "/api/v1/policies/:orgId",
    async (request, reply) => {
      requireAdmin(request, reply);
      if (reply.sent) return;
      const { orgId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const parseResult = UpdatePolicyBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: "Invalid request body",
          details: parseResult.error.issues,
        });
      }

      const updated = await policyService.upsertOrgPolicy(orgId, parseResult.data);

      // Broadcast policy update to all connected SSE clients in the org.
      eventBus.broadcast(orgId, "policy_updated", {
        version: updated.version,
      });

      logAdminAction(app.db, {
        orgId,
        userId: request.authUser!.userId,
        action: "policy_updated",
        resourceType: "policy",
        resourceId: orgId,
        details: { fields: Object.keys(parseResult.data) },
      }).catch(() => {});

      return reply.send(updated);
    },
  );

  /**
   * PUT /api/v1/policies/:orgId/kill-switch
   * Toggle kill switch (admin only).
   */
  app.put<{ Params: { orgId: string } }>(
    "/api/v1/policies/:orgId/kill-switch",
    async (request, reply) => {
      requireAdmin(request, reply);
      if (reply.sent) return;
      const { orgId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const parseResult = KillSwitchBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: "Invalid request body",
          details: parseResult.error.issues,
        });
      }

      const updated = await policyService.setKillSwitch(
        orgId,
        parseResult.data.active,
        parseResult.data.message,
      );

      // Broadcast kill switch change to all connected SSE clients in the org.
      eventBus.broadcast(orgId, "kill_switch", {
        active: parseResult.data.active,
        message: parseResult.data.message,
      });

      logAdminAction(app.db, {
        orgId,
        userId: request.authUser!.userId,
        action: parseResult.data.active ? "kill_switch_activated" : "kill_switch_deactivated",
        resourceType: "policy",
        resourceId: orgId,
        details: { message: parseResult.data.message },
      }).catch(() => {});

      return reply.send(updated);
    },
  );
}
