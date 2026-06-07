/**
 * Integration tests for AGT identity routes (Cut 1 + Cut 2b step 2.10).
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { agtIdentityRoutes } from "./agt-identities.js";
import {
  createTestApp,
  createMockDb,
  type MockDb,
  generateTestToken,
  TEST_ORG_ID,
  TEST_USER_ID,
  TEST_ADMIN_ID,
} from "../test/helpers.js";

function chain(result: unknown) {
  const obj: Record<string, unknown> = {};
  for (const m of ["from", "where", "limit", "offset", "orderBy", "values", "set", "returning", "onConflictDoUpdate"]) {
    obj[m] = vi.fn().mockReturnValue(obj);
  }
  obj.then = vi.fn((resolve: (v: unknown) => void) => resolve(result));
  return obj;
}

describe("AGT identity routes", () => {
  let app: FastifyInstance;
  let mockDb: MockDb;

  beforeAll(async () => {
    mockDb = createMockDb();
    app = await createTestApp(mockDb, [agtIdentityRoutes]);
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /api/v1/identities", () => {
    it("returns 401 without auth", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/identities" });
      expect(res.statusCode).toBe(401);
    });

    it("returns identities for the org", async () => {
      const token = generateTestToken(app, { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, role: "admin" });
      const rows = [
        {
          id: "id-1",
          orgId: TEST_ORG_ID,
          did: "did:mesh:alpha",
          publicKey: "pk",
          capabilities: ["mcp:tool"],
          status: "active",
          delegationDepth: 0,
        },
      ];
      mockDb.select = vi.fn(() => chain(rows) as ReturnType<MockDb["select"]>);

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/identities",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ identities: [{ did: "did:mesh:alpha", status: "active" }] });
    });
  });

  describe("POST /api/v1/identities", () => {
    it("returns 403 for non-admin users", async () => {
      const token = generateTestToken(app, { userId: TEST_USER_ID, orgId: TEST_ORG_ID, role: "user" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/identities",
        headers: { authorization: `Bearer ${token}` },
        payload: { did: "did:mesh:x", publicKey: "pk", capabilities: [] },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 422 for an invalid body", async () => {
      const token = generateTestToken(app, { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, role: "admin" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/identities",
        headers: { authorization: `Bearer ${token}` },
        payload: { did: "did:mesh:x" }, // missing publicKey + capabilities
      });
      expect(res.statusCode).toBe(422);
    });

    it("registers the identity and returns 201", async () => {
      const token = generateTestToken(app, { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, role: "admin" });
      const inserted = {
        id: "id-1",
        orgId: TEST_ORG_ID,
        did: "did:mesh:new",
        publicKey: "pk",
        capabilities: ["mcp:tool"],
        status: "active",
        delegationDepth: 0,
      };
      mockDb.insert = vi.fn(() => chain([inserted]) as ReturnType<MockDb["insert"]>);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/identities",
        headers: { authorization: `Bearer ${token}` },
        payload: { did: "did:mesh:new", publicKey: "pk", capabilities: ["mcp:tool"] },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ did: "did:mesh:new", status: "active" });
    });
  });

  describe("PATCH /api/v1/identities/:did/status", () => {
    it("returns 403 for non-admin users", async () => {
      const token = generateTestToken(app, { userId: TEST_USER_ID, orgId: TEST_ORG_ID, role: "user" });
      const res = await app.inject({
        method: "PATCH",
        url: "/api/v1/identities/did%3Amesh%3Ax/status",
        headers: { authorization: `Bearer ${token}` },
        payload: { status: "suspended" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 422 for an invalid status value", async () => {
      const token = generateTestToken(app, { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, role: "admin" });
      const res = await app.inject({
        method: "PATCH",
        url: "/api/v1/identities/did%3Amesh%3Ax/status",
        headers: { authorization: `Bearer ${token}` },
        payload: { status: "bogus" },
      });
      expect(res.statusCode).toBe(422);
    });

    it("updates the status and returns the updated row", async () => {
      const token = generateTestToken(app, { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, role: "admin" });
      const updated = { did: "did:mesh:x", status: "suspended" };
      mockDb.update = vi.fn(() => chain([updated]) as ReturnType<MockDb["update"]>);
      const res = await app.inject({
        method: "PATCH",
        url: "/api/v1/identities/did%3Amesh%3Ax/status",
        headers: { authorization: `Bearer ${token}` },
        payload: { status: "suspended" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ did: "did:mesh:x", status: "suspended" });
    });
  });

  describe("GET /api/v1/identities/:did/delegations", () => {
    it("splits rows into outgoing/incoming by issuer/subject", async () => {
      const token = generateTestToken(app, { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, role: "admin" });
      const did = "did:mesh:x";
      const rows = [
        {
          id: "d1",
          orgId: TEST_ORG_ID,
          issuerDid: did,
          subjectDid: "did:mesh:y",
          grantedCapabilities: ["mcp:tool"],
          deniedCapabilities: [],
          depth: 1,
          createdAt: new Date(),
        },
        {
          id: "d2",
          orgId: TEST_ORG_ID,
          issuerDid: "did:mesh:z",
          subjectDid: did,
          grantedCapabilities: ["mcp:audit"],
          deniedCapabilities: [],
          depth: 1,
          createdAt: new Date(),
        },
      ];
      mockDb.select = vi.fn(() => chain(rows) as ReturnType<MockDb["select"]>);
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/identities/${encodeURIComponent(did)}/delegations`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.outgoing).toHaveLength(1);
      expect(body.outgoing[0].subjectDid).toBe("did:mesh:y");
      expect(body.incoming).toHaveLength(1);
      expect(body.incoming[0].issuerDid).toBe("did:mesh:z");
    });
  });

  describe("GET /api/v1/delegations", () => {
    it("returns delegations for the org", async () => {
      const token = generateTestToken(app, { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, role: "admin" });
      const rows = [
        {
          id: "d1",
          orgId: TEST_ORG_ID,
          issuerDid: "a",
          subjectDid: "b",
          grantedCapabilities: [],
          deniedCapabilities: [],
          depth: 1,
          createdAt: new Date(),
        },
      ];
      mockDb.select = vi.fn(() => chain(rows) as ReturnType<MockDb["select"]>);
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/delegations",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().delegations).toHaveLength(1);
    });
  });
});
