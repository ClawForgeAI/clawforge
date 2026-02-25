/**
 * Auth routes – SSO token exchange, email/password login, password change.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { users, organizations } from "../db/schema.js";
import { exchangeCodeAtIdp, verifyIdToken } from "../services/oidc-service.js";

const ExchangeBodySchema = z.discriminatedUnion("grantType", [
  z.object({
    grantType: z.literal("authorization_code"),
    code: z.string().min(1),
    codeVerifier: z.string().min(1),
    redirectUri: z.string().url(),
  }),
  z.object({
    grantType: z.literal("refresh_token"),
    refreshToken: z.string().min(1),
  }),
  z.object({
    grantType: z.literal("id_token"),
    idToken: z.string().min(1),
    orgId: z.string().uuid(),
  }),
]);

export async function authRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/v1/auth/exchange
   * Exchange an IdP token for a ClawForge session token.
   *
   * Supports three grant types:
   * - authorization_code: Exchange code + PKCE verifier via the org's IdP, then validate the id_token
   * - id_token: Directly validate an id_token against the org's SSO config
   * - refresh_token: Refresh a ClawForge session token
   */
  app.post("/api/v1/auth/exchange", async (request, reply) => {
    const parseResult = ExchangeBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: "Invalid request body",
        details: parseResult.error.issues,
      });
    }

    const body = parseResult.data;
    const db = app.db;

    if (body.grantType === "authorization_code") {
      // 1. We need to identify which org this code belongs to.
      //    The client must have stored the orgId context. We look it up
      //    from a header or query param provided alongside the code exchange.
      //    For simplicity, require an X-ClawForge-Org header.
      const orgId = (request.headers["x-clawforge-org"] as string) ?? "";
      if (!orgId) {
        return reply.code(400).send({
          error: "Missing X-ClawForge-Org header. Include the orgId for code exchange.",
        });
      }

      // 2. Look up the org's SSO config.
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);

      if (!org?.ssoConfig) {
        return reply.code(404).send({
          error: "Organization not found or SSO not configured.",
        });
      }

      const ssoConfig = org.ssoConfig;

      try {
        // 3. Exchange the code at the IdP's token endpoint.
        const idpTokens = await exchangeCodeAtIdp({
          issuerUrl: ssoConfig.issuerUrl,
          clientId: ssoConfig.clientId,
          code: body.code,
          codeVerifier: body.codeVerifier,
          redirectUri: body.redirectUri,
        });

        // 4. Verify the id_token.
        const claims = await verifyIdToken(idpTokens.id_token, {
          issuerUrl: ssoConfig.issuerUrl,
          clientId: ssoConfig.clientId,
          audience: ssoConfig.audience,
        });

        // 5. Upsert user and issue ClawForge JWTs.
        return await issueClawForgeTokens(app, db, orgId, claims);
      } catch (err) {
        return reply.code(401).send({
          error: `OIDC token exchange failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    if (body.grantType === "id_token") {
      // Direct id_token validation. The client already obtained the token
      // from their IdP and passes it directly.
      const orgId = body.orgId;

      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);

      if (!org?.ssoConfig) {
        return reply.code(404).send({
          error: "Organization not found or SSO not configured.",
        });
      }

      const ssoConfig = org.ssoConfig;

      try {
        const claims = await verifyIdToken(body.idToken, {
          issuerUrl: ssoConfig.issuerUrl,
          clientId: ssoConfig.clientId,
          audience: ssoConfig.audience,
        });

        return await issueClawForgeTokens(app, db, orgId, claims);
      } catch (err) {
        return reply.code(401).send({
          error: `ID token validation failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    if (body.grantType === "refresh_token") {
      try {
        const decoded = app.jwt.verify<{
          userId: string;
          orgId: string;
          email: string;
          role: string;
          type: string;
        }>(body.refreshToken);

        if (decoded.type !== "refresh") {
          return reply.code(400).send({ error: "Invalid refresh token" });
        }

        const accessToken = app.jwt.sign(
          {
            userId: decoded.userId,
            orgId: decoded.orgId,
            email: decoded.email,
            role: decoded.role,
          },
          { expiresIn: "1h" },
        );

        const refreshToken = app.jwt.sign(
          {
            userId: decoded.userId,
            orgId: decoded.orgId,
            email: decoded.email,
            role: decoded.role,
            type: "refresh",
          },
          { expiresIn: "30d" },
        );

        // Update last seen.
        await db
          .update(users)
          .set({ lastSeenAt: new Date() })
          .where(eq(users.id, decoded.userId));

        return reply.send({
          accessToken,
          refreshToken,
          expiresAt: Date.now() + 60 * 60 * 1000,
          userId: decoded.userId,
          orgId: decoded.orgId,
          email: decoded.email,
          roles: [decoded.role],
        });
      } catch {
        return reply.code(401).send({ error: "Invalid or expired refresh token" });
      }
    }
  });

  /**
   * POST /api/v1/auth/login
   * Email/password login.
   */
  app.post("/api/v1/auth/login", async (request, reply) => {
    const loginSchema = z.object({
      email: z.string().email(),
      password: z.string().min(1),
      orgId: z.string().uuid().optional(),
    });

    const parseResult = loginSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: "Invalid request body",
        details: parseResult.error.issues,
      });
    }

    const { email, password } = parseResult.data;
    let orgId = parseResult.data.orgId;
    const db = app.db;

    // For single-org deployments: auto-discover the org if not provided
    if (!orgId) {
      const [defaultOrg] = await db.select().from(organizations).limit(1);
      if (!defaultOrg) {
        return reply.code(400).send({ error: "No organization found. Please run the seed script." });
      }
      orgId = defaultOrg.id;
    }

    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.orgId, orgId), eq(users.email, email)))
      .limit(1);

    if (!user || !user.passwordHash) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }

    // Update last seen
    await db
      .update(users)
      .set({ lastSeenAt: new Date() })
      .where(eq(users.id, user.id));

    // Issue tokens
    const accessToken = app.jwt.sign(
      { userId: user.id, orgId, email: user.email, role: user.role },
      { expiresIn: "1h" },
    );
    const refreshToken = app.jwt.sign(
      { userId: user.id, orgId, email: user.email, role: user.role, type: "refresh" },
      { expiresIn: "30d" },
    );

    return reply.send({
      accessToken,
      refreshToken,
      expiresAt: Date.now() + 60 * 60 * 1000,
      userId: user.id,
      orgId,
      email: user.email,
      roles: [user.role],
    });
  });

  /**
   * GET /api/v1/auth/mode
   * Returns available authentication methods.
   */
  app.get("/api/v1/auth/mode", async (_request, reply) => {
    // For now, always return that email/password is available
    return reply.send({ methods: ["password"] });
  });

  /**
   * POST /api/v1/auth/change-password
   * Self-service password change for authenticated users.
   */
  app.post("/api/v1/auth/change-password", async (request, reply) => {
    if (!request.authUser) {
      return reply.code(401).send({ error: "Authentication required" });
    }

    const schema = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(6),
    });

    const parseResult = schema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: "Invalid request body",
        details: parseResult.error.issues,
      });
    }

    const { currentPassword, newPassword } = parseResult.data;
    const userId = request.authUser.userId;
    const db = app.db;

    // Fetch user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    // If user has no password (SSO-only), they can't use this endpoint
    if (!user.passwordHash) {
      return reply.code(400).send({ error: "Cannot change password for SSO-only accounts" });
    }

    // Verify current password
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return reply.code(401).send({ error: "Current password is incorrect" });
    }

    // Hash and save new password
    const newHash = await bcrypt.hash(newPassword, 12);
    await db
      .update(users)
      .set({ passwordHash: newHash })
      .where(eq(users.id, userId));

    return reply.send({ success: true });
  });
}

/**
 * Upsert a user from OIDC claims and issue ClawForge JWTs.
 */
async function issueClawForgeTokens(
  app: FastifyInstance,
  db: FastifyInstance["db"],
  orgId: string,
  claims: { sub: string; email?: string; name?: string },
) {
  const email = claims.email ?? `${claims.sub}@unknown`;

  // Upsert user record.
  const existing = await db
    .select()
    .from(users)
    .where(and(eq(users.orgId, orgId), eq(users.email, email)))
    .limit(1);

  let userId: string;
  let role: "admin" | "user";

  if (existing.length > 0) {
    userId = existing[0].id;
    role = existing[0].role as "admin" | "user";
    await db
      .update(users)
      .set({ lastSeenAt: new Date(), name: claims.name ?? existing[0].name })
      .where(eq(users.id, userId));
  } else {
    // First user in an org becomes admin, subsequent users are regular users.
    const userCount = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.orgId, orgId))
      .limit(1);

    role = userCount.length === 0 ? "admin" : "user";

    const [newUser] = await db
      .insert(users)
      .values({
        orgId,
        email,
        name: claims.name,
        role,
        lastSeenAt: new Date(),
      })
      .returning();
    userId = newUser.id;
  }

  // Issue ClawForge JWTs.
  const accessToken = app.jwt.sign(
    { userId, orgId, email, role },
    { expiresIn: "1h" },
  );

  const refreshToken = app.jwt.sign(
    { userId, orgId, email, role, type: "refresh" },
    { expiresIn: "30d" },
  );

  return {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + 60 * 60 * 1000,
    userId,
    orgId,
    email,
    roles: [role],
  };
}
