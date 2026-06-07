/**
 * Integration tests for AGT compliance-attestation routes (Cut 2b step 2.14).
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { agtAttestationRoutes } from "./agt-attestations.js";
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

const GENESIS = "0".repeat(64);

/**
 * Build a synthetic but internally-consistent audit row using AGT's hash
 * recipe. Lets us craft a chain the verifier will accept (or break on demand).
 */
function buildRow(opts: {
  chainSeq: bigint;
  timestamp: Date;
  agentDid: string;
  action: string;
  decision: "allow" | "deny" | "review";
  previousHash: string;
}) {
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        timestamp: opts.timestamp.toISOString(),
        agentId: opts.agentDid,
        action: opts.action,
        decision: opts.decision,
        previousHash: opts.previousHash,
      }),
    )
    .digest("hex");
  return { ...opts, hash };
}

describe("AGT attestation routes", () => {
  let app: FastifyInstance;
  let mockDb: MockDb;

  beforeAll(async () => {
    mockDb = createMockDb();
    app = await createTestApp(mockDb, [agtAttestationRoutes]);
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /api/v1/attestations", () => {
    it("returns 403 for non-admin users", async () => {
      const token = generateTestToken(app, { userId: TEST_USER_ID, orgId: TEST_ORG_ID, role: "user" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/attestations",
        headers: { authorization: `Bearer ${token}` },
        payload: { fromIso: "2026-05-01T00:00:00.000Z", toIso: "2026-05-31T00:00:00.000Z" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 422 when fromIso is not before toIso", async () => {
      const token = generateTestToken(app, { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, role: "admin" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/attestations",
        headers: { authorization: `Bearer ${token}` },
        payload: { fromIso: "2026-05-31T00:00:00.000Z", toIso: "2026-05-01T00:00:00.000Z" },
      });
      expect(res.statusCode).toBe(422);
    });

    it("produces a signed attestation for a clean chain", async () => {
      const token = generateTestToken(app, { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, role: "admin" });
      const row1 = buildRow({
        chainSeq: 1n,
        timestamp: new Date("2026-05-10T10:00:00.000Z"),
        agentDid: "did:mesh:a",
        action: "search",
        decision: "allow",
        previousHash: GENESIS,
      });
      const row2 = buildRow({
        chainSeq: 2n,
        timestamp: new Date("2026-05-11T10:00:00.000Z"),
        agentDid: "did:mesh:a",
        action: "write",
        decision: "deny",
        previousHash: row1.hash,
      });
      mockDb.select = vi.fn(() => chain([row1, row2]) as ReturnType<MockDb["select"]>);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/attestations",
        headers: { authorization: `Bearer ${token}` },
        payload: { fromIso: "2026-05-01T00:00:00.000Z", toIso: "2026-05-31T00:00:00.000Z" },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.attestation.valid).toBe(true);
      expect(body.attestation.entriesCovered).toBe(2);
      expect(body.attestation.agentsCovered).toBe(1);
      expect(body.attestation.rootHash).toMatch(/^[0-9a-f]{64}$/);
      expect(typeof body.token).toBe("string");
      expect(body.token.split(".")).toHaveLength(3);
    });

    it("flags valid=false with breakKind=linkage when a row's prev hash is wrong", async () => {
      const token = generateTestToken(app, { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, role: "admin" });
      const row1 = buildRow({
        chainSeq: 1n,
        timestamp: new Date("2026-05-10T10:00:00.000Z"),
        agentDid: "did:mesh:a",
        action: "search",
        decision: "allow",
        previousHash: GENESIS,
      });
      // Row 2 deliberately doesn't continue from row1.hash.
      const row2 = buildRow({
        chainSeq: 2n,
        timestamp: new Date("2026-05-11T10:00:00.000Z"),
        agentDid: "did:mesh:a",
        action: "write",
        decision: "deny",
        previousHash: "f".repeat(64),
      });
      mockDb.select = vi.fn(() => chain([row1, row2]) as ReturnType<MockDb["select"]>);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/attestations",
        headers: { authorization: `Bearer ${token}` },
        payload: { fromIso: "2026-05-01T00:00:00.000Z", toIso: "2026-05-31T00:00:00.000Z" },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.attestation.valid).toBe(false);
      expect(body.attestation.breakKind).toBe("linkage");
    });
  });

  describe("POST /api/v1/attestations/verify", () => {
    it("returns signatureValid=false on a forged token", async () => {
      const token = generateTestToken(app, { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, role: "admin" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/attestations/verify",
        headers: { authorization: `Bearer ${token}` },
        payload: { token: "not.a.real.jwt" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().signatureValid).toBe(false);
    });

    it("round-trips: generated attestation verifies for the same org", async () => {
      const adminToken = generateTestToken(app, { userId: TEST_ADMIN_ID, orgId: TEST_ORG_ID, role: "admin" });
      const row = buildRow({
        chainSeq: 1n,
        timestamp: new Date("2026-05-10T10:00:00.000Z"),
        agentDid: "did:mesh:a",
        action: "search",
        decision: "allow",
        previousHash: GENESIS,
      });
      mockDb.select = vi.fn(() => chain([row]) as ReturnType<MockDb["select"]>);

      const genRes = await app.inject({
        method: "POST",
        url: "/api/v1/attestations",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { fromIso: "2026-05-01T00:00:00.000Z", toIso: "2026-05-31T00:00:00.000Z" },
      });
      const issued = genRes.json();

      const verifyRes = await app.inject({
        method: "POST",
        url: "/api/v1/attestations/verify",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { token: issued.token },
      });
      expect(verifyRes.statusCode).toBe(200);
      const body = verifyRes.json();
      expect(body.signatureValid).toBe(true);
      expect(body.orgMatch).toBe(true);
      expect(body.attestation.rootHash).toBe(issued.attestation.rootHash);
    });
  });
});
