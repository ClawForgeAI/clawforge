/**
 * Organization management routes.
 */

import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin, requireAdminOrViewer, requireOrg } from "../middleware/auth.js";
import { organizations } from "../db/schema.js";
import { logAdminAction } from "../services/admin-audit.js";

const UpdateOrgSchema = z.object({
  name: z.string().min(1).optional(),
  ssoConfig: z
    .object({
      issuerUrl: z.string().url(),
      clientId: z.string().min(1),
      audience: z.string().optional(),
    })
    .nullable()
    .optional(),
});

export async function organizationRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/v1/organizations/:orgId
   * Get org details (admin or viewer).
   */
  app.get<{ Params: { orgId: string } }>(
    "/api/v1/organizations/:orgId",
    async (request, reply) => {
      requireAdminOrViewer(request, reply);
      if (reply.sent) return;
      const { orgId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const [org] = await app.db
        .select({
          id: organizations.id,
          name: organizations.name,
          ssoConfig: organizations.ssoConfig,
          createdAt: organizations.createdAt,
          updatedAt: organizations.updatedAt,
        })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);

      if (!org) {
        return reply.code(404).send({ error: "Organization not found" });
      }

      return reply.send({ organization: org });
    },
  );

  /**
   * PUT /api/v1/organizations/:orgId
   * Update org details (admin only).
   */
  app.put<{ Params: { orgId: string } }>(
    "/api/v1/organizations/:orgId",
    async (request, reply) => {
      requireAdmin(request, reply);
      if (reply.sent) return;
      const { orgId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const parseResult = UpdateOrgSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: "Invalid request body",
          details: parseResult.error.issues,
        });
      }

      const { name, ssoConfig } = parseResult.data;

      // If SSO config is provided, validate OIDC discovery.
      if (ssoConfig) {
        try {
          const discoveryUrl = `${ssoConfig.issuerUrl.replace(/\/$/, "")}/.well-known/openid-configuration`;
          const resp = await fetch(discoveryUrl, { signal: AbortSignal.timeout(10000) });
          if (!resp.ok) {
            return reply.code(400).send({
              error: `OIDC discovery failed for ${ssoConfig.issuerUrl}: HTTP ${resp.status}`,
            });
          }
        } catch (err) {
          return reply.code(400).send({
            error: `OIDC discovery failed for ${ssoConfig.issuerUrl}: ${err instanceof Error ? err.message : "unreachable"}`,
          });
        }
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (name !== undefined) updates.name = name;
      if (ssoConfig !== undefined) updates.ssoConfig = ssoConfig;

      const [updated] = await app.db
        .update(organizations)
        .set(updates)
        .where(eq(organizations.id, orgId))
        .returning({
          id: organizations.id,
          name: organizations.name,
          ssoConfig: organizations.ssoConfig,
          createdAt: organizations.createdAt,
          updatedAt: organizations.updatedAt,
        });

      if (!updated) {
        return reply.code(404).send({ error: "Organization not found" });
      }

      logAdminAction(app.db, {
        orgId,
        userId: request.authUser!.userId,
        action: "organization_updated",
        resourceType: "organization",
        resourceId: orgId,
        details: { fields: Object.keys(updates) },
      }).catch(() => {});

      return reply.send({ organization: updated });
    },
  );
}
