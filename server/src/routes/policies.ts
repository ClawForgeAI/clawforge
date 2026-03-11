/**
 * Policy routes – CRUD for org policies.
 *
 * Supports multiple named policies per org (#23).
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

const CreatePolicySchema = z.object({
  name: z.string().min(1).max(100),
  isDefault: z.boolean().optional(),
  toolsConfig: z.object({
    allow: z.array(z.string()).optional(),
    deny: z.array(z.string()).optional(),
    profile: z.string().optional(),
  }).optional(),
  skillsConfig: z.object({
    requireApproval: z.boolean(),
    approved: z.array(z.object({
      name: z.string(),
      key: z.string(),
      scope: z.enum(["org", "self"]),
    })),
  }).optional(),
  auditLevel: z.enum(["full", "metadata", "off"]).optional(),
});

export async function policyRoutes(app: FastifyInstance): Promise<void> {
  const policyService = new PolicyService(app.db);

  // ---------------------------------------------------------------------------
  // Effective policy
  // ---------------------------------------------------------------------------

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
      const userRole = request.authUser!.role;
      const policy = await policyService.getEffectivePolicy(orgId, userId, userRole);

      if (!policy) {
        return reply.code(404).send({ error: "No policy configured for this organization" });
      }

      return reply.send(policy);
    },
  );

  // ---------------------------------------------------------------------------
  // List all policies (#23)
  // ---------------------------------------------------------------------------

  /**
   * GET /api/v1/policies/:orgId/list
   * List all policies for an org.
   */
  app.get<{ Params: { orgId: string } }>(
    "/api/v1/policies/:orgId/list",
    async (request, reply) => {
      requireAdminOrViewer(request, reply);
      if (reply.sent) return;
      const { orgId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const policyList = await policyService.listOrgPolicies(orgId);
      return reply.send({ policies: policyList });
    },
  );

  // ---------------------------------------------------------------------------
  // Get raw org policy (backward compatible, supports ?policyId=)
  // ---------------------------------------------------------------------------

  /**
   * GET /api/v1/policies/:orgId
   * Get raw org policy (admin or viewer).
   */
  app.get<{ Params: { orgId: string }; Querystring: { policyId?: string } }>(
    "/api/v1/policies/:orgId",
    async (request, reply) => {
      requireAdminOrViewer(request, reply);
      if (reply.sent) return;
      const { orgId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const policy = await policyService.getOrgPolicy(orgId, request.query.policyId);
      if (!policy) {
        return reply.code(404).send({ error: "No policy found" });
      }

      return reply.send({
        ...policy,
        tools: policy.toolsConfig ?? {},
        killSwitch: {
          active: policy.killSwitch ?? false,
          message: policy.killSwitchMessage ?? undefined,
        },
      });
    },
  );

  // ---------------------------------------------------------------------------
  // Create a new policy (#23)
  // ---------------------------------------------------------------------------

  /**
   * POST /api/v1/policies/:orgId
   * Create a new named policy.
   */
  app.post<{ Params: { orgId: string } }>(
    "/api/v1/policies/:orgId",
    async (request, reply) => {
      requireAdmin(request, reply);
      if (reply.sent) return;
      const { orgId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const parseResult = CreatePolicySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({ error: "Invalid request body", details: parseResult.error.issues });
      }

      const created = await policyService.createPolicy(orgId, parseResult.data);

      logAdminAction(app.db, {
        orgId,
        userId: request.authUser!.userId,
        action: "policy_created",
        resourceType: "policy",
        resourceId: created.id,
        details: { name: parseResult.data.name },
      }).catch(() => {});

      return reply.code(201).send(created);
    },
  );

  // ---------------------------------------------------------------------------
  // Update org policy (backward compatible)
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Clone a policy (#23)
  // ---------------------------------------------------------------------------

  /**
   * POST /api/v1/policies/:orgId/:policyId/clone
   * Clone an existing policy with a new name.
   */
  app.post<{ Params: { orgId: string; policyId: string } }>(
    "/api/v1/policies/:orgId/:policyId/clone",
    async (request, reply) => {
      requireAdmin(request, reply);
      if (reply.sent) return;
      const { orgId, policyId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const schema = z.object({ name: z.string().min(1).max(100) });
      const parseResult = schema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({ error: "Invalid request body", details: parseResult.error.issues });
      }

      try {
        const cloned = await policyService.clonePolicy(orgId, policyId, parseResult.data.name);
        return reply.code(201).send(cloned);
      } catch (err) {
        return reply.code(404).send({ error: err instanceof Error ? err.message : "Clone failed" });
      }
    },
  );

  // ---------------------------------------------------------------------------
  // Policy Assignments (#23)
  // ---------------------------------------------------------------------------

  /**
   * POST /api/v1/policies/:orgId/:policyId/assign
   * Assign a policy to a user or role.
   */
  app.post<{ Params: { orgId: string; policyId: string } }>(
    "/api/v1/policies/:orgId/:policyId/assign",
    async (request, reply) => {
      requireAdmin(request, reply);
      if (reply.sent) return;
      const { orgId, policyId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const assignSchema = z.object({
        userId: z.string().uuid().optional(),
        role: z.string().optional(),
      }).refine((d) => d.userId || d.role, { message: "Either userId or role is required" });

      const parseResult = assignSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({ error: "Invalid request body", details: parseResult.error.issues });
      }

      const { userId, role } = parseResult.data;
      let assignment;
      if (userId) {
        assignment = await policyService.assignPolicyToUser(orgId, policyId, userId);
      } else if (role) {
        assignment = await policyService.assignPolicyToRole(orgId, policyId, role);
      }

      return reply.code(201).send(assignment);
    },
  );

  /**
   * GET /api/v1/policies/:orgId/:policyId/assignments
   * Get assignments for a policy.
   */
  app.get<{ Params: { orgId: string; policyId: string } }>(
    "/api/v1/policies/:orgId/:policyId/assignments",
    async (request, reply) => {
      requireAdminOrViewer(request, reply);
      if (reply.sent) return;
      const { orgId, policyId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const assignments = await policyService.getPolicyAssignments(orgId, policyId);
      return reply.send({ assignments });
    },
  );

  /**
   * DELETE /api/v1/policies/:orgId/assignments/:assignmentId
   * Remove a policy assignment.
   */
  app.delete<{ Params: { orgId: string; assignmentId: string } }>(
    "/api/v1/policies/:orgId/assignments/:assignmentId",
    async (request, reply) => {
      requireAdmin(request, reply);
      if (reply.sent) return;
      const { orgId, assignmentId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      await policyService.removePolicyAssignment(assignmentId);
      return reply.send({ success: true });
    },
  );

  // ---------------------------------------------------------------------------
  // Kill switch (backward compatible)
  // ---------------------------------------------------------------------------

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
