/**
 * Enrollment token routes – admin token management and public enrollment.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";
import { randomBytes } from "crypto";
import { requireAdmin, requireOrg } from "../middleware/auth.js";
import { enrollmentTokens, users } from "../db/schema.js";
import { logAdminAction } from "../services/admin-audit.js";

const CreateTokenSchema = z.object({
  label: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  maxUses: z.number().int().positive().optional(),
  defaultRole: z.enum(["admin", "viewer", "user"]).optional(),
});

const EnrollSchema = z.object({
  token: z.string().min(1),
  email: z.string().email(),
  name: z.string().optional(),
});

function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function enrollmentRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/v1/enrollment-tokens/:orgId
   * Create a new enrollment token (admin only).
   */
  app.post<{ Params: { orgId: string } }>(
    "/api/v1/enrollment-tokens/:orgId",
    async (request, reply) => {
      requireAdmin(request, reply);
      if (reply.sent) return;
      const { orgId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const parseResult = CreateTokenSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: "Invalid request body",
          details: parseResult.error.issues,
        });
      }

      const { label, expiresAt, maxUses } = parseResult.data;
      const token = generateToken();

      const [created] = await app.db
        .insert(enrollmentTokens)
        .values({
          orgId,
          token,
          label: label ?? null,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          maxUses: maxUses ?? null,
          createdBy: request.authUser!.userId,
        })
        .returning();

      logAdminAction(app.db, {
        orgId,
        userId: request.authUser!.userId,
        action: "enrollment_token_created",
        resourceType: "enrollment_token",
        resourceId: created.id,
        details: { label, maxUses },
      }).catch(() => {});

      return reply.code(201).send({
        id: created.id,
        token: created.token,
        label: created.label,
        expiresAt: created.expiresAt,
        maxUses: created.maxUses,
        usedCount: created.usedCount,
        createdAt: created.createdAt,
      });
    },
  );

  /**
   * GET /api/v1/enrollment-tokens/:orgId
   * List active enrollment tokens (admin only).
   */
  app.get<{ Params: { orgId: string } }>(
    "/api/v1/enrollment-tokens/:orgId",
    async (request, reply) => {
      requireAdmin(request, reply);
      if (reply.sent) return;
      const { orgId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const tokens = await app.db
        .select({
          id: enrollmentTokens.id,
          token: enrollmentTokens.token,
          label: enrollmentTokens.label,
          expiresAt: enrollmentTokens.expiresAt,
          maxUses: enrollmentTokens.maxUses,
          usedCount: enrollmentTokens.usedCount,
          revokedAt: enrollmentTokens.revokedAt,
          createdAt: enrollmentTokens.createdAt,
        })
        .from(enrollmentTokens)
        .where(
          and(
            eq(enrollmentTokens.orgId, orgId),
            isNull(enrollmentTokens.revokedAt),
          ),
        )
        .orderBy(enrollmentTokens.createdAt);

      return reply.send({ tokens });
    },
  );

  /**
   * DELETE /api/v1/enrollment-tokens/:orgId/:tokenId
   * Revoke an enrollment token (admin only).
   */
  app.delete<{ Params: { orgId: string; tokenId: string } }>(
    "/api/v1/enrollment-tokens/:orgId/:tokenId",
    async (request, reply) => {
      requireAdmin(request, reply);
      if (reply.sent) return;
      const { orgId, tokenId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const [updated] = await app.db
        .update(enrollmentTokens)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(enrollmentTokens.id, tokenId),
            eq(enrollmentTokens.orgId, orgId),
          ),
        )
        .returning();

      if (!updated) {
        return reply.code(404).send({ error: "Token not found" });
      }

      logAdminAction(app.db, {
        orgId,
        userId: request.authUser!.userId,
        action: "enrollment_token_revoked",
        resourceType: "enrollment_token",
        resourceId: tokenId,
        details: { tokenId },
      }).catch(() => {});

      return reply.send({ success: true });
    },
  );

  /**
   * POST /api/v1/auth/enroll
   * Public endpoint – enroll with an enrollment token.
   */
  app.post("/api/v1/auth/enroll", async (request, reply) => {
    const parseResult = EnrollSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: "Invalid request body",
        details: parseResult.error.issues,
      });
    }

    const { token, email, name } = parseResult.data;
    const db = app.db;

    // Find the token.
    const [enrollToken] = await db
      .select()
      .from(enrollmentTokens)
      .where(eq(enrollmentTokens.token, token))
      .limit(1);

    if (!enrollToken) {
      return reply.code(401).send({ error: "Invalid enrollment token" });
    }

    // Check if revoked.
    if (enrollToken.revokedAt) {
      return reply.code(401).send({ error: "Enrollment token has been revoked" });
    }

    // Check expiry.
    if (enrollToken.expiresAt && new Date() > enrollToken.expiresAt) {
      return reply.code(401).send({ error: "Enrollment token has expired" });
    }

    // Check max uses.
    if (enrollToken.maxUses !== null && enrollToken.usedCount >= enrollToken.maxUses) {
      return reply.code(401).send({ error: "Enrollment token has reached its usage limit" });
    }

    const orgId = enrollToken.orgId;

    // Check if user already exists in this org.
    const [existing] = await db
      .select()
      .from(users)
      .where(and(eq(users.orgId, orgId), eq(users.email, email)))
      .limit(1);

    if (existing) {
      return reply.code(409).send({ error: "A user with this email already exists in the organization" });
    }

    // Create the user.
    const [newUser] = await db
      .insert(users)
      .values({
        orgId,
        email,
        name: name ?? null,
        role: "user",
        lastSeenAt: new Date(),
      })
      .returning();

    // Increment usage count.
    await db
      .update(enrollmentTokens)
      .set({ usedCount: enrollToken.usedCount + 1 })
      .where(eq(enrollmentTokens.id, enrollToken.id));

    // Issue JWTs.
    const accessToken = app.jwt.sign(
      { userId: newUser.id, orgId, email: newUser.email, role: newUser.role },
      { expiresIn: "1h" },
    );

    const refreshToken = app.jwt.sign(
      { userId: newUser.id, orgId, email: newUser.email, role: newUser.role, type: "refresh" },
      { expiresIn: "30d" },
    );

    return reply.code(201).send({
      accessToken,
      refreshToken,
      expiresAt: Date.now() + 60 * 60 * 1000,
      userId: newUser.id,
      orgId,
      email: newUser.email,
      roles: [newUser.role],
    });
  });
}
