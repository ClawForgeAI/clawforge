/**
 * AGT-canonical policy routes (Cut 1 step 7 — addendum §5.3, §A19).
 *
 * Coexists with the legacy `/api/v1/policies/:orgId/...` routes which keep
 * serving the OrgPolicy JSON shape; consumers are migrated to these AGT
 * routes in Cut 1 step 8 (plugin) / step 9 (admin).
 *
 * Endpoints:
 *   GET  /api/v1/policies/effective?agentDid=…   -> AGT YAML (text/yaml)
 *   POST /api/v1/policies/evaluate                -> PolicyDecisionResult
 *   POST /api/v1/policies/agt                     -> create/upsert AGT policy
 *   GET  /api/v1/policies/agt                     -> list AGT policies for org
 */

import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { parsePolicyYaml, serializePolicy, type Policy } from "@clawforgeai/policy-schema";
import { ClawforgeEvaluator } from "@clawforgeai/policy-engine";
import { z } from "zod";
import { policies } from "../db/schema.js";
import { requireAdmin } from "../middleware/auth.js";

const EvaluateBodySchema = z.object({
  agentDid: z.string().min(1),
  action: z.string().min(1),
  context: z.record(z.string(), z.unknown()).optional(),
  /**
   * Inline policy YAML to evaluate against. When omitted, the server resolves
   * the effective policy for `agentDid` from the database.
   */
  policyYaml: z.string().optional(),
});

const CreatePolicyBodySchema = z.object({
  name: z.string().min(1).max(200),
  yamlSource: z.string().min(1),
});

export async function agtPolicyRoutes(app: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // GET /api/v1/policies/effective?agentDid=...
  // -------------------------------------------------------------------------
  app.get<{ Querystring: { agentDid?: string } }>("/api/v1/policies/effective", async (request, reply) => {
    const orgId = request.authUser?.orgId;
    if (!orgId) return reply.code(401).send({ error: "unauthorized" });

    const agentDid = request.query.agentDid;
    if (!agentDid) return reply.code(400).send({ error: "agentDid query parameter required" });

    // Cut 1 simplification: serve the org's most-recently-updated AGT policy.
    // Step 11 admin adds scope/assignment resolution per §A4 policy_assignments.
    const [row] = await app.db
      .select({
        name: policies.name,
        yamlSource: policies.yamlSource,
        parsedPolicy: policies.parsedPolicy,
      })
      .from(policies)
      .where(eq(policies.orgId, orgId))
      .orderBy(desc(policies.updatedAt))
      .limit(1);

    if (!row || !row.yamlSource) {
      // No AGT policy authored yet — return a minimal fail-open document.
      const empty = `version: "1.0"\nname: empty-policy\nrules: []\n`;
      return reply.type("text/yaml").send(empty);
    }

    return reply.type("text/yaml").send(row.yamlSource);
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/policies/evaluate — server-side dry-run
  // -------------------------------------------------------------------------
  app.post("/api/v1/policies/evaluate", async (request, reply) => {
    const orgId = request.authUser?.orgId;
    if (!orgId) return reply.code(401).send({ error: "unauthorized" });

    const parsed = EvaluateBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send({ error: "invalid body", issues: parsed.error.issues });
    }

    let policy: Policy | undefined;
    if (parsed.data.policyYaml) {
      const result = parsePolicyYaml(parsed.data.policyYaml);
      if (!result.ok) {
        return reply.code(422).send({ error: "invalid policy YAML", message: result.error.message });
      }
      policy = result.policy;
    } else {
      const [row] = await app.db
        .select({ yamlSource: policies.yamlSource })
        .from(policies)
        .where(eq(policies.orgId, orgId))
        .orderBy(desc(policies.updatedAt))
        .limit(1);
      if (row?.yamlSource) {
        const result = parsePolicyYaml(row.yamlSource);
        if (result.ok) policy = result.policy;
      }
    }

    if (!policy) {
      // No effective policy — fail-closed for evaluate dry-runs.
      return reply.send({
        allowed: false,
        action: "deny",
        reason: "no effective policy",
        approvers: [],
        rateLimited: false,
        evaluatedAt: new Date().toISOString(),
      });
    }

    const evaluator = new ClawforgeEvaluator();
    evaluator.loadPolicy(policy);
    const decision = evaluator.evaluate(parsed.data.action, parsed.data.context ?? {});
    return reply.send({
      ...decision,
      evaluatedAt: decision.evaluatedAt.toISOString(),
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/policies/agt — create/upsert AGT policy
  // -------------------------------------------------------------------------
  app.post("/api/v1/policies/agt", async (request, reply) => {
    requireAdmin(request, reply);
    if (reply.sent) return;
    const orgId = request.authUser?.orgId;
    if (!orgId) return reply.code(401).send({ error: "unauthorized" });

    const parsed = CreatePolicyBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send({ error: "invalid body", issues: parsed.error.issues });
    }

    const yamlResult = parsePolicyYaml(parsed.data.yamlSource);
    if (!yamlResult.ok) {
      return reply.code(422).send({ error: "invalid policy YAML", message: yamlResult.error.message });
    }

    const [inserted] = await app.db
      .insert(policies)
      .values({
        orgId,
        name: parsed.data.name,
        version: 1,
        yamlSource: parsed.data.yamlSource,
        parsedPolicy: yamlResult.policy as unknown as Record<string, unknown>,
        schemaVersion: yamlResult.policy.version,
        createdBy: request.authUser?.userId,
        auditLevel: "metadata",
      })
      .returning({
        id: policies.id,
        name: policies.name,
        version: policies.version,
        createdAt: policies.createdAt,
      });

    return reply.code(201).send(inserted);
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/policies/agt — list AGT policies for the current org
  // -------------------------------------------------------------------------
  app.get("/api/v1/policies/agt", async (request, reply) => {
    const orgId = request.authUser?.orgId;
    if (!orgId) return reply.code(401).send({ error: "unauthorized" });

    const rows = await app.db
      .select({
        id: policies.id,
        name: policies.name,
        version: policies.version,
        schemaVersion: policies.schemaVersion,
        hasYaml: policies.yamlSource,
        createdAt: policies.createdAt,
        updatedAt: policies.updatedAt,
      })
      .from(policies)
      .where(and(eq(policies.orgId, orgId)))
      .orderBy(desc(policies.updatedAt));

    return reply.send({
      policies: rows.map((r) => ({
        id: r.id,
        name: r.name,
        version: r.version,
        schemaVersion: r.schemaVersion,
        agt: r.hasYaml !== null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    });
  });
}

export { serializePolicy };
