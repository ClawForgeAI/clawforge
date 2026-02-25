/**
 * JWT and API key authentication + RBAC middleware for ClawForge control plane.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { apiKeys } from "../db/schema.js";

export type AuthUser = {
  userId: string;
  orgId: string;
  email: string;
  role: "admin" | "viewer" | "user";
  isApiKey?: boolean;
};

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthUser;
  }
}

const PUBLIC_ENDPOINTS = new Set([
  "/api/v1/auth/exchange",
  "/api/v1/auth/login",
  "/api/v1/auth/mode",
  "/api/v1/auth/enroll",
  "/health",
  "/health/ready",
]);

/**
 * Register JWT + API key auth middleware.
 */
export async function registerAuthMiddleware(app: FastifyInstance): Promise<void> {
  app.decorateRequest("authUser", undefined);

  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for public endpoints.
    if (PUBLIC_ENDPOINTS.has(request.url) || request.url.startsWith("/health")) {
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      reply.code(401).send({ error: "Missing or invalid Authorization header" });
      return;
    }

    const token = authHeader.slice(7);

    // Check if this is an API key (prefixed with cf_live_ or cf_test_)
    if (token.startsWith("cf_live_") || token.startsWith("cf_test_")) {
      await authenticateApiKey(app, request, reply, token);
      return;
    }

    // JWT authentication
    try {
      const decoded = app.jwt.verify<AuthUser>(token);
      request.authUser = decoded;
    } catch {
      reply.code(401).send({ error: "Invalid or expired token" });
    }
  });
}

/**
 * Authenticate via API key (#44).
 */
async function authenticateApiKey(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  token: string,
): Promise<void> {
  const prefix = token.slice(0, 16);

  try {
    const [key] = await app.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyPrefix, prefix))
      .limit(1);

    if (!key) {
      reply.code(401).send({ error: "Invalid API key" });
      return;
    }

    // Check if revoked
    if (key.revokedAt) {
      reply.code(401).send({ error: "API key has been revoked" });
      return;
    }

    // Check expiry
    if (key.expiresAt && new Date() > key.expiresAt) {
      reply.code(401).send({ error: "API key has expired" });
      return;
    }

    // Verify key hash
    const valid = await bcrypt.compare(token, key.keyHash);
    if (!valid) {
      reply.code(401).send({ error: "Invalid API key" });
      return;
    }

    // Check IP allowlist
    if (key.ipAllowlist && key.ipAllowlist.length > 0) {
      if (!key.ipAllowlist.includes(request.ip)) {
        reply.code(403).send({ error: "IP address not in allowlist" });
        return;
      }
    }

    // Update last used timestamp (fire-and-forget)
    app.db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, key.id))
      .catch(() => {});

    request.authUser = {
      userId: key.createdBy,
      orgId: key.orgId,
      email: `api-key:${key.name}`,
      role: key.role as "admin" | "viewer",
      isApiKey: true,
    };
  } catch {
    reply.code(401).send({ error: "API key authentication failed" });
  }
}

/**
 * Guard: require admin role.
 */
export function requireAdmin(request: FastifyRequest, reply: FastifyReply): void {
  if (!request.authUser) {
    reply.code(401).send({ error: "Authentication required" });
    return;
  }
  if (request.authUser.role !== "admin") {
    reply.code(403).send({ error: "Admin access required" });
    return;
  }
}

/**
 * Guard: require admin or viewer role (read-only access) (#38).
 */
export function requireAdminOrViewer(request: FastifyRequest, reply: FastifyReply): void {
  if (!request.authUser) {
    reply.code(401).send({ error: "Authentication required" });
    return;
  }
  if (request.authUser.role !== "admin" && request.authUser.role !== "viewer") {
    reply.code(403).send({ error: "Admin or viewer access required" });
    return;
  }
}

/**
 * Guard: require same org.
 */
export function requireOrg(request: FastifyRequest, reply: FastifyReply, orgId: string): void {
  if (!request.authUser) {
    reply.code(401).send({ error: "Authentication required" });
    return;
  }
  if (request.authUser.orgId !== orgId) {
    reply.code(403).send({ error: "Access denied: organization mismatch" });
    return;
  }
}
