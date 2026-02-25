/**
 * User management routes.
 */

import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireAdmin, requireAdminOrViewer, requireOrg } from "../middleware/auth.js";
import { users } from "../db/schema.js";
import { logAdminAction } from "../services/admin-audit.js";

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  role: z.enum(["admin", "viewer", "user"]).optional().default("user"),
  password: z.string().min(6).optional(),
});

const UpdateUserSchema = z.object({
  name: z.string().optional(),
  role: z.enum(["admin", "viewer", "user"]).optional(),
});

export async function userRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/v1/users/:orgId
   * List org users (admin or viewer).
   */
  app.get<{ Params: { orgId: string } }>(
    "/api/v1/users/:orgId",
    async (request, reply) => {
      requireAdminOrViewer(request, reply);
      if (reply.sent) return;
      const { orgId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const orgUsers = await app.db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          lastSeenAt: users.lastSeenAt,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.orgId, orgId))
        .orderBy(users.email);

      return reply.send({ users: orgUsers });
    },
  );

  /**
   * POST /api/v1/users/:orgId
   * Create/invite a user (admin only).
   */
  app.post<{ Params: { orgId: string } }>(
    "/api/v1/users/:orgId",
    async (request, reply) => {
      requireAdmin(request, reply);
      if (reply.sent) return;
      const { orgId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const parseResult = CreateUserSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: "Invalid request body",
          details: parseResult.error.issues,
        });
      }

      const { email, name, role, password } = parseResult.data;

      // Check for existing user with same email in this org.
      const [existing] = await app.db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.orgId, orgId), eq(users.email, email)))
        .limit(1);

      if (existing) {
        return reply.code(409).send({ error: "A user with this email already exists in the organization" });
      }

      const passwordHash = password ? await bcrypt.hash(password, 12) : null;

      const [created] = await app.db
        .insert(users)
        .values({
          orgId,
          email,
          name: name ?? null,
          role: role ?? "user",
          passwordHash,
        })
        .returning({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          createdAt: users.createdAt,
        });

      logAdminAction(app.db, {
        orgId,
        userId: request.authUser!.userId,
        action: "user_created",
        resourceType: "user",
        resourceId: created.id,
        details: { email, role },
      }).catch(() => {});

      return reply.code(201).send({ user: created });
    },
  );

  /**
   * PUT /api/v1/users/:orgId/:userId
   * Update a user (admin only).
   */
  app.put<{ Params: { orgId: string; userId: string } }>(
    "/api/v1/users/:orgId/:userId",
    async (request, reply) => {
      requireAdmin(request, reply);
      if (reply.sent) return;
      const { orgId, userId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const parseResult = UpdateUserSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: "Invalid request body",
          details: parseResult.error.issues,
        });
      }

      const { name, role } = parseResult.data;

      // Fetch the target user.
      const [target] = await app.db
        .select()
        .from(users)
        .where(and(eq(users.id, userId), eq(users.orgId, orgId)))
        .limit(1);

      if (!target) {
        return reply.code(404).send({ error: "User not found" });
      }

      // Prevent demoting the last admin.
      if (role === "user" && target.role === "admin") {
        const admins = await app.db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.orgId, orgId), eq(users.role, "admin")));
        if (admins.length <= 1) {
          return reply.code(400).send({ error: "Cannot demote the last admin in the organization" });
        }
      }

      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name;
      if (role !== undefined) updates.role = role;

      if (Object.keys(updates).length === 0) {
        return reply.code(400).send({ error: "No fields to update" });
      }

      const [updated] = await app.db
        .update(users)
        .set(updates)
        .where(and(eq(users.id, userId), eq(users.orgId, orgId)))
        .returning({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          lastSeenAt: users.lastSeenAt,
          createdAt: users.createdAt,
        });

      logAdminAction(app.db, {
        orgId,
        userId: request.authUser!.userId,
        action: "user_updated",
        resourceType: "user",
        resourceId: userId,
        details: { userId, changes: Object.keys(updates) },
      }).catch(() => {});

      return reply.send({ user: updated });
    },
  );

  /**
   * DELETE /api/v1/users/:orgId/:userId
   * Remove a user (admin only).
   */
  app.delete<{ Params: { orgId: string; userId: string } }>(
    "/api/v1/users/:orgId/:userId",
    async (request, reply) => {
      requireAdmin(request, reply);
      if (reply.sent) return;
      const { orgId, userId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      // Prevent self-deletion.
      if (request.authUser!.userId === userId) {
        return reply.code(400).send({ error: "Cannot delete your own account" });
      }

      // Fetch the target user.
      const [target] = await app.db
        .select()
        .from(users)
        .where(and(eq(users.id, userId), eq(users.orgId, orgId)))
        .limit(1);

      if (!target) {
        return reply.code(404).send({ error: "User not found" });
      }

      // Prevent deleting the last admin.
      if (target.role === "admin") {
        const admins = await app.db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.orgId, orgId), eq(users.role, "admin")));
        if (admins.length <= 1) {
          return reply.code(400).send({ error: "Cannot delete the last admin in the organization" });
        }
      }

      await app.db
        .delete(users)
        .where(and(eq(users.id, userId), eq(users.orgId, orgId)));

      logAdminAction(app.db, {
        orgId,
        userId: request.authUser!.userId,
        action: "user_deleted",
        resourceType: "user",
        resourceId: userId,
        details: { email: target.email },
      }).catch(() => {});

      return reply.send({ success: true });
    },
  );

  /**
   * PUT /api/v1/users/:orgId/:userId/password
   * Reset a user's password (admin only).
   */
  app.put<{ Params: { orgId: string; userId: string } }>(
    "/api/v1/users/:orgId/:userId/password",
    async (request, reply) => {
      requireAdmin(request, reply);
      if (reply.sent) return;
      const { orgId, userId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const schema = z.object({ password: z.string().min(6) });
      const parseResult = schema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: "Invalid request body",
          details: parseResult.error.issues,
        });
      }

      const [target] = await app.db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, userId), eq(users.orgId, orgId)))
        .limit(1);

      if (!target) {
        return reply.code(404).send({ error: "User not found" });
      }

      const passwordHash = await bcrypt.hash(parseResult.data.password, 12);

      await app.db
        .update(users)
        .set({ passwordHash })
        .where(eq(users.id, userId));

      logAdminAction(app.db, {
        orgId,
        userId: request.authUser!.userId,
        action: "user_password_reset",
        resourceType: "user",
        resourceId: userId,
        details: { targetUserId: userId },
      }).catch(() => {});

      return reply.send({ success: true });
    },
  );
}
