/**
 * API key management routes (#44).
 *
 * Admin endpoints for creating, listing, and revoking API keys
 * used for service account / machine-to-machine authentication.
 */

import type { FastifyInstance } from "fastify";
import { eq, and, isNull } from "drizzle-orm";
import { z } from "zod";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { requireAdmin, requireOrg } from "../middleware/auth.js";
import { apiKeys } from "../db/schema.js";
import { logAdminAction } from "../services/admin-audit.js";

const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  role: z.enum(["admin", "viewer"]).default("viewer"),
  expiresAt: z.string().datetime().optional(),
  ipAllowlist: z.array(z.string()).optional(),
});

function generateApiKey(): { key: string; prefix: string } {
  const random = randomBytes(32).toString("base64url");
  const key = `cf_live_${random}`;
  const prefix = key.slice(0, 16);
  return { key, prefix };
}

export async function apiKeyRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/v1/api-keys/:orgId
   * Create a new API key (admin only).
   * Returns the plain key exactly once.
   */
  app.post<{ Params: { orgId: string } }>(
    "/api/v1/api-keys/:orgId",
    async (request, reply) => {
      requireAdmin(request, reply);
      if (reply.sent) return;
      const { orgId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const parseResult = CreateApiKeySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: "Invalid request body",
          details: parseResult.error.issues,
        });
      }

      const { name, role, expiresAt, ipAllowlist } = parseResult.data;
      const { key, prefix } = generateApiKey();
      const keyHash = await bcrypt.hash(key, 12);

      const [created] = await app.db
        .insert(apiKeys)
        .values({
          orgId,
          name,
          keyHash,
          keyPrefix: prefix,
          role,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          ipAllowlist: ipAllowlist ?? null,
          createdBy: request.authUser!.userId,
        })
        .returning({
          id: apiKeys.id,
          name: apiKeys.name,
          keyPrefix: apiKeys.keyPrefix,
          role: apiKeys.role,
          expiresAt: apiKeys.expiresAt,
          ipAllowlist: apiKeys.ipAllowlist,
          createdAt: apiKeys.createdAt,
        });

      logAdminAction(app.db, {
        orgId,
        userId: request.authUser!.userId,
        action: "api_key_created",
        resourceType: "api_key",
        resourceId: created.id,
        details: { name, role },
      }).catch(() => {});

      // Return the plain key ONCE — it cannot be retrieved again
      return reply.code(201).send({
        ...created,
        key,
      });
    },
  );

  /**
   * GET /api/v1/api-keys/:orgId
   * List API keys (admin only). Does NOT return key values.
   */
  app.get<{ Params: { orgId: string } }>(
    "/api/v1/api-keys/:orgId",
    async (request, reply) => {
      requireAdmin(request, reply);
      if (reply.sent) return;
      const { orgId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const keys = await app.db
        .select({
          id: apiKeys.id,
          name: apiKeys.name,
          keyPrefix: apiKeys.keyPrefix,
          role: apiKeys.role,
          expiresAt: apiKeys.expiresAt,
          ipAllowlist: apiKeys.ipAllowlist,
          lastUsedAt: apiKeys.lastUsedAt,
          createdAt: apiKeys.createdAt,
        })
        .from(apiKeys)
        .where(
          and(
            eq(apiKeys.orgId, orgId),
            isNull(apiKeys.revokedAt),
          ),
        )
        .orderBy(apiKeys.createdAt);

      return reply.send({ apiKeys: keys });
    },
  );

  /**
   * DELETE /api/v1/api-keys/:orgId/:keyId
   * Revoke an API key (admin only).
   */
  app.delete<{ Params: { orgId: string; keyId: string } }>(
    "/api/v1/api-keys/:orgId/:keyId",
    async (request, reply) => {
      requireAdmin(request, reply);
      if (reply.sent) return;
      const { orgId, keyId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const [revoked] = await app.db
        .update(apiKeys)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(apiKeys.id, keyId),
            eq(apiKeys.orgId, orgId),
            isNull(apiKeys.revokedAt),
          ),
        )
        .returning();

      if (!revoked) {
        return reply.code(404).send({ error: "API key not found or already revoked" });
      }

      logAdminAction(app.db, {
        orgId,
        userId: request.authUser!.userId,
        action: "api_key_revoked",
        resourceType: "api_key",
        resourceId: keyId,
        details: { name: revoked.name },
      }).catch(() => {});

      return reply.send({ success: true });
    },
  );
}
