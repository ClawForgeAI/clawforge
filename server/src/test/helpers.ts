/**
 * Test helpers for ClawForge server tests.
 *
 * Provides a mock DB layer, test app factory, JWT generation, and fixtures.
 */

import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { registerAuthMiddleware } from "../middleware/auth.js";
import { authRoutes } from "../routes/auth.js";
import { policyRoutes } from "../routes/policies.js";
import { auditRoutes } from "../routes/audit.js";
import { heartbeatRoutes } from "../routes/heartbeat.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const TEST_JWT_SECRET = "test-secret-for-unit-tests";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export const TEST_ORG_ID = "00000000-0000-4000-8000-000000000001";
export const TEST_USER_ID = "00000000-0000-4000-8000-000000000010";
export const TEST_ADMIN_ID = "00000000-0000-4000-8000-000000000020";

export const testOrg = {
  id: TEST_ORG_ID,
  name: "Test Organization",
  ssoConfig: null,
  createdAt: new Date("2025-01-01T00:00:00Z"),
  updatedAt: new Date("2025-01-01T00:00:00Z"),
};

export const testUser = {
  id: TEST_USER_ID,
  orgId: TEST_ORG_ID,
  email: "user@test.com",
  name: "Test User",
  role: "user" as const,
  passwordHash: "$2a$12$LJ3/H6DGZ7PCz5FDj3bBXeeDHLfPHyS7UG8V9v1nSFx0YIJR8SfUW", // "password123"
  lastSeenAt: new Date("2025-01-15T00:00:00Z"),
  createdAt: new Date("2025-01-01T00:00:00Z"),
};

export const testAdmin = {
  id: TEST_ADMIN_ID,
  orgId: TEST_ORG_ID,
  email: "admin@test.com",
  name: "Test Admin",
  role: "admin" as const,
  passwordHash: "$2a$12$LJ3/H6DGZ7PCz5FDj3bBXeeDHLfPHyS7UG8V9v1nSFx0YIJR8SfUW", // "password123"
  lastSeenAt: new Date("2025-01-15T00:00:00Z"),
  createdAt: new Date("2025-01-01T00:00:00Z"),
};

export const testPolicy = {
  id: "00000000-0000-4000-8000-000000000100",
  orgId: TEST_ORG_ID,
  version: 1,
  toolsConfig: { allow: ["Read", "Write"], deny: ["Bash"] },
  skillsConfig: { requireApproval: true, approved: [] },
  killSwitch: false,
  killSwitchMessage: null,
  auditLevel: "metadata" as const,
  updatedAt: new Date("2025-01-01T00:00:00Z"),
};

// ---------------------------------------------------------------------------
// Mock DB
// ---------------------------------------------------------------------------

/**
 * Creates a mocked Drizzle-like DB object.
 *
 * Each chained method (select, insert, update, delete) returns an object with
 * `.from()`, `.where()`, `.values()`, `.set()`, `.returning()`, `.limit()`,
 * `.offset()`, `.orderBy()`, `.onConflictDoUpdate()`, `.innerJoin()` etc.
 *
 * Tests can override the final resolution with `mockResolvedValueOnce`.
 */
export function createMockDb() {
  // A chainable mock that resolves to an empty array by default.
  function createChain(resolvedValue: unknown = []) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};

    const terminator = vi.fn().mockResolvedValue(resolvedValue);

    // Every chained method returns the chain itself, except the terminal .then()
    const methods = [
      "from",
      "where",
      "limit",
      "offset",
      "orderBy",
      "values",
      "set",
      "returning",
      "onConflictDoUpdate",
      "innerJoin",
      "leftJoin",
    ];

    for (const method of methods) {
      chain[method] = vi.fn().mockReturnThis();
    }

    // Make the chain thenable so `await db.select()...` works.
    chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));

    // Allow overriding the resolved value
    const proxy = new Proxy(chain, {
      get(target, prop) {
        if (prop === "then") {
          return target.then;
        }
        if (typeof prop === "string" && target[prop]) {
          return target[prop];
        }
        // For any unknown method, return a function that returns the chain
        if (typeof prop === "string") {
          target[prop] = vi.fn().mockReturnThis();
          return target[prop];
        }
        return undefined;
      },
    });

    return proxy;
  }

  const db = {
    select: vi.fn(() => createChain([])),
    insert: vi.fn(() => createChain([])),
    update: vi.fn(() => createChain([])),
    delete: vi.fn(() => createChain([])),
  };

  return db;
}

export type MockDb = ReturnType<typeof createMockDb>;

// ---------------------------------------------------------------------------
// Test App Factory
// ---------------------------------------------------------------------------

/**
 * Build a Fastify app wired for testing.
 *
 * Accepts a mock DB so callers can control database responses.
 */
export async function createTestApp(mockDb?: MockDb): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(cors, { origin: true });
  await app.register(jwt, { secret: TEST_JWT_SECRET });

  // Decorate with mock DB
  const db = mockDb ?? createMockDb();
  app.decorate("db", db as unknown as FastifyInstance["db"]);

  // Health check
  app.get("/health", async () => ({ status: "ok" }));

  // Auth middleware
  await registerAuthMiddleware(app);

  // Routes
  await app.register(authRoutes);
  await app.register(policyRoutes);
  await app.register(auditRoutes);
  await app.register(heartbeatRoutes);

  await app.ready();
  return app;
}

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------

/**
 * Generate a valid JWT for testing authenticated routes.
 */
export function generateTestToken(
  app: FastifyInstance,
  payload: {
    userId?: string;
    orgId?: string;
    email?: string;
    role?: "admin" | "user";
  } = {},
): string {
  return app.jwt.sign(
    {
      userId: payload.userId ?? TEST_USER_ID,
      orgId: payload.orgId ?? TEST_ORG_ID,
      email: payload.email ?? "user@test.com",
      role: payload.role ?? "user",
    },
    { expiresIn: "1h" },
  );
}

/**
 * Generate an expired JWT for testing token expiry.
 *
 * We set iat to 2 hours ago and expiresIn to 1h so the token is already expired.
 */
export function generateExpiredToken(
  app: FastifyInstance,
  payload: {
    userId?: string;
    orgId?: string;
    email?: string;
    role?: "admin" | "user";
  } = {},
): string {
  const nowSec = Math.floor(Date.now() / 1000);
  return app.jwt.sign(
    {
      userId: payload.userId ?? TEST_USER_ID,
      orgId: payload.orgId ?? TEST_ORG_ID,
      email: payload.email ?? "user@test.com",
      role: payload.role ?? "user",
      iat: nowSec - 7200, // 2 hours ago
      exp: nowSec - 3600, // expired 1 hour ago
    },
  );
}
