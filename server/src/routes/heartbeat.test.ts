import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import jwtPlugin from "@fastify/jwt";
import { registerAuthMiddleware } from "../middleware/auth.js";
import { heartbeatRoutes } from "./heartbeat.js";
import { JWT_SECRET, TEST_ORG_ID, TEST_ADMIN_ID, TEST_USER_ID } from "../test/helpers.js";

function makeChain(result: unknown[] = []) {
  const c: any = {};
  for (const m of ["select", "from", "where", "limit", "orderBy", "innerJoin", "set", "values", "returning", "insert", "update", "delete", "onConflictDoUpdate"]) {
    c[m] = vi.fn().mockReturnValue(c);
  }
  c.then = (resolve: (v: unknown) => void) => resolve(result);
  return c;
}

function createTestDb(selectResults: unknown[][] = [[]], insertResults: unknown[][] = [[]]) {
  let selectCall = 0;
  let insertCall = 0;
  return {
    select: vi.fn(() => makeChain(selectResults[selectCall++] ?? [])),
    insert: vi.fn(() => makeChain(insertResults[insertCall++] ?? [])),
    update: vi.fn(() => makeChain([])),
    delete: vi.fn(() => makeChain([])),
  };
}

async function buildApp(db: any) {
  const app = Fastify({ logger: false });
  await app.register(jwtPlugin, { secret: JWT_SECRET });
  app.decorate("db", db as never);
  await registerAuthMiddleware(app);
  await app.register(heartbeatRoutes);
  await app.ready();
  return app;
}

function adminToken(app: any) {
  return app.jwt.sign(
    { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, email: "admin@test.com", role: "admin" },
    { expiresIn: "1h" },
  );
}

function userToken(app: any) {
  return app.jwt.sign(
    { userId: TEST_USER_ID, orgId: TEST_ORG_ID, email: "user@test.com", role: "user" },
    { expiresIn: "1h" },
  );
}

describe("heartbeat routes", () => {
  describe("GET /api/v1/heartbeat/:orgId (list clients)", () => {
    it("returns client list with status for admin", async () => {
      const now = new Date();
      const clients = [
        {
          userId: TEST_USER_ID,
          email: "u@t.com",
          name: "User",
          role: "user",
          lastHeartbeatAt: now.toISOString(),
          clientVersion: "1.0.0",
        },
      ];
      const db = createTestDb([clients]);
      const app = await buildApp(db);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/heartbeat/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${adminToken(app)}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.clients).toHaveLength(1);
      expect(body.summary.total).toBe(1);

      await app.close();
    });

    it("rejects non-admin", async () => {
      const db = createTestDb();
      const app = await buildApp(db);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/heartbeat/${TEST_ORG_ID}`,
        headers: { authorization: `Bearer ${userToken(app)}` },
      });
      expect(res.statusCode).toBe(403);

      await app.close();
    });
  });

  describe("GET /api/v1/heartbeat/:orgId/:userId (client heartbeat)", () => {
    it("returns heartbeat response with kill switch status", async () => {
      const policy = { version: 3, killSwitch: false, killSwitchMessage: null };
      // select returns policy
      const db = createTestDb([[policy]]);

      const app = await buildApp(db);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/heartbeat/${TEST_ORG_ID}/${TEST_USER_ID}`,
        headers: { authorization: `Bearer ${userToken(app)}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.killSwitch).toBe(false);
      expect(body.policyVersion).toBe(3);

      await app.close();
    });

    it("detects policy version mismatch", async () => {
      const policy = { version: 5, killSwitch: false, killSwitchMessage: null };
      const db = createTestDb([[policy]]);
      db.insert = vi.fn(() => makeChain([]));

      const app = await buildApp(db);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/heartbeat/${TEST_ORG_ID}/${TEST_USER_ID}?policyVersion=3`,
        headers: { authorization: `Bearer ${userToken(app)}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().refreshPolicyNow).toBe(true);

      await app.close();
    });

    it("reports no refresh needed when versions match", async () => {
      const policy = { version: 3, killSwitch: false, killSwitchMessage: null };
      const db = createTestDb([[policy]]);
      db.insert = vi.fn(() => makeChain([]));

      const app = await buildApp(db);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/heartbeat/${TEST_ORG_ID}/${TEST_USER_ID}?policyVersion=3`,
        headers: { authorization: `Bearer ${userToken(app)}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().refreshPolicyNow).toBe(false);

      await app.close();
    });

    it("rejects org mismatch", async () => {
      const db = createTestDb();
      const app = await buildApp(db);
      const otherOrg = "00000000-0000-0000-0000-000000000099";

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/heartbeat/${otherOrg}/${TEST_USER_ID}`,
        headers: { authorization: `Bearer ${userToken(app)}` },
      });
      expect(res.statusCode).toBe(403);

      await app.close();
    });
  });
});
