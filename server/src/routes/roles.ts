/**
 * Role management routes (#61).
 */

import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { requirePermission, requireOrg } from "../middleware/auth.js";
import { roles, rolePermissions, permissions } from "../db/schema.js";
import { PERMISSIONS, BUILT_IN_ROLES } from "../rbac/permissions.js";

export async function roleRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/v1/roles/:orgId
   * List all roles (built-in + custom).
   */
  app.get<{ Params: { orgId: string } }>(
    "/api/v1/roles/:orgId",
    async (request, reply) => {
      requirePermission(request, reply, "roles:read");
      if (reply.sent) return;
      const { orgId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const builtInRoles = Object.entries(BUILT_IN_ROLES).map(([name, def]) => ({
        id: name,
        name,
        description: def.description,
        isBuiltIn: true,
        permissions: def.permissions,
      }));

      const customRoles = await app.db
        .select()
        .from(roles)
        .where(eq(roles.orgId, orgId));

      // For custom roles, fetch their permissions
      const customWithPerms = await Promise.all(
        customRoles.map(async (role) => {
          const perms = await app.db
            .select({ name: permissions.name })
            .from(rolePermissions)
            .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
            .where(eq(rolePermissions.roleId, role.id));
          return {
            ...role,
            permissions: perms.map((p) => p.name),
          };
        }),
      );

      return reply.send({ roles: [...builtInRoles, ...customWithPerms] });
    },
  );

  /**
   * GET /api/v1/roles/:orgId/permissions
   * List all available permissions.
   */
  app.get<{ Params: { orgId: string } }>(
    "/api/v1/roles/:orgId/permissions",
    async (request, reply) => {
      requirePermission(request, reply, "roles:read");
      if (reply.sent) return;
      const { orgId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const permissionsList = Object.entries(PERMISSIONS).map(([name, def]) => ({
        name,
        ...def,
      }));

      return reply.send({ permissions: permissionsList });
    },
  );
}
