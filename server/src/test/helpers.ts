/**
 * Test helpers – builds a Fastify app with mocked database for unit testing.
 */

import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { vi } from "vitest";
import { registerAuthMiddleware, type AuthUser } from "../middleware/auth.js";

// Reusable IDs
export const TEST_ORG_ID = "00000000-0000-0000-0000-000000000001";
export const TEST_USER_ID = "00000000-0000-0000-0000-000000000010";
export const TEST_ADMIN_ID = "00000000-0000-0000-0000-000000000020";
export const JWT_SECRET = "test-secret";

/**
 * Create a mock database that returns configurable results.
 * Each method returns a chainable query builder mock.
 */
export function createMockDb() {
  const mockResult: unknown[] = [];

  const chainable = () => {
    const chain: Record<string, unknown> = {};
    const methods = [
      "select",
      "from",
      "where",
      "limit",
      "orderBy",
      "innerJoin",
      "set",
      "values",
      "returning",
      "onConflictDoUpdate",
      "offset",
    ];
    for (const m of methods) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    // Terminal: returns the mock result
    chain.then = undefined; // make it a thenable resolved value
    // Override to return results at the end of the chain
    (chain as Record<string, unknown>).execute = vi.fn().mockResolvedValue(mockResult);
    return chain;
  };

  // We create a proxy that intercepts any method call and returns a chainable
  const db = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "select" || prop === "insert" || prop === "update" || prop === "delete") {
          return vi.fn().mockReturnValue(chainable());
        }
        return undefined;
      },
    },
  );

  return db;
}

/**
 * Build a test Fastify app with JWT and auth middleware.
 * Routes can be registered by the caller.
 */
export async function buildTestApp() {
  const app = Fastify({ logger: false });

  await app.register(jwt, { secret: JWT_SECRET });

  // Decorate with a mock db – individual tests will override via vi.spyOn or direct mocking
  const mockDb = createMockDb();
  app.decorate("db", mockDb as never);

  await registerAuthMiddleware(app);

  return app;
}

/**
 * Generate a valid JWT for testing.
 */
export function signTestToken(
  app: { jwt: { sign: (payload: object, opts?: object) => string } },
  payload?: Partial<AuthUser> & Record<string, unknown>,
) {
  return app.jwt.sign(
    {
      userId: TEST_ADMIN_ID,
      orgId: TEST_ORG_ID,
      email: "admin@test.com",
      role: "admin",
      ...payload,
    },
    { expiresIn: "1h" },
  );
}

/**
 * Generate a user (non-admin) JWT.
 */
export function signUserToken(
  app: { jwt: { sign: (payload: object, opts?: object) => string } },
  payload?: Partial<AuthUser> & Record<string, unknown>,
) {
  return app.jwt.sign(
    {
      userId: TEST_USER_ID,
      orgId: TEST_ORG_ID,
      email: "user@test.com",
      role: "user",
      ...payload,
    },
    { expiresIn: "1h" },
  );
}
