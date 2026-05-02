/**
 * Alert routes for anomaly detection (#51).
 *
 * Provides endpoints for managing alert rules and viewing/resolving triggered alerts.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin, requireAdminOrViewer, requireOrg } from "../middleware/auth.js";
import { AlertService } from "../services/alert-service.js";
import { logAdminAction } from "../services/admin-audit.js";

const CreateAlertRuleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  ruleType: z.enum([
    "denied_tool_burst",
    "dlp_violation_burst",
    "off_hours_activity",
    "sensitive_tool_access",
    "session_anomaly",
    "blocked_tool_persistence",
  ]),
  config: z.record(z.string(), z.unknown()),
  severity: z.enum(["critical", "high", "medium", "low"]).optional(),
  webhookUrl: z.string().url().optional(),
  enabled: z.boolean().optional(),
});

const UpdateAlertRuleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  severity: z.enum(["critical", "high", "medium", "low"]).optional(),
  webhookUrl: z.string().url().nullable().optional(),
  enabled: z.boolean().optional(),
});

export async function alertRoutes(app: FastifyInstance): Promise<void> {
  const alertService = new AlertService(app.db);

  // ---------------------------------------------------------------------------
  // Alert Rules
  // ---------------------------------------------------------------------------

  /**
   * GET /api/v1/alerts/:orgId/rules
   * List all alert rules for an org.
   */
  app.get<{ Params: { orgId: string } }>("/api/v1/alerts/:orgId/rules", async (request, reply) => {
    requireAdminOrViewer(request, reply);
    if (reply.sent) return;
    const { orgId } = request.params;
    requireOrg(request, reply, orgId);
    if (reply.sent) return;

    const rules = await alertService.listAlertRules(orgId);
    return reply.send({ rules });
  });

  /**
   * POST /api/v1/alerts/:orgId/rules
   * Create a new alert rule.
   */
  app.post<{ Params: { orgId: string } }>("/api/v1/alerts/:orgId/rules", async (request, reply) => {
    requireAdmin(request, reply);
    if (reply.sent) return;
    const { orgId } = request.params;
    requireOrg(request, reply, orgId);
    if (reply.sent) return;

    const parseResult = CreateAlertRuleSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: "Invalid request body", details: parseResult.error.issues });
    }

    const rule = await alertService.createAlertRule(orgId, parseResult.data);

    logAdminAction(app.db, {
      orgId,
      userId: request.authUser!.userId,
      action: "alert_rule_created",
      resourceType: "alert_rule",
      resourceId: rule.id,
      details: { name: parseResult.data.name, ruleType: parseResult.data.ruleType },
    }).catch(() => {});

    return reply.code(201).send(rule);
  });

  /**
   * PUT /api/v1/alerts/:orgId/rules/:ruleId
   * Update an alert rule.
   */
  app.put<{ Params: { orgId: string; ruleId: string } }>(
    "/api/v1/alerts/:orgId/rules/:ruleId",
    async (request, reply) => {
      requireAdmin(request, reply);
      if (reply.sent) return;
      const { orgId, ruleId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const parseResult = UpdateAlertRuleSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({ error: "Invalid request body", details: parseResult.error.issues });
      }

      const updated = await alertService.updateAlertRule(ruleId, parseResult.data);
      if (!updated) {
        return reply.code(404).send({ error: "Alert rule not found" });
      }

      return reply.send(updated);
    },
  );

  /**
   * DELETE /api/v1/alerts/:orgId/rules/:ruleId
   * Delete an alert rule.
   */
  app.delete<{ Params: { orgId: string; ruleId: string } }>(
    "/api/v1/alerts/:orgId/rules/:ruleId",
    async (request, reply) => {
      requireAdmin(request, reply);
      if (reply.sent) return;
      const { orgId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      await alertService.deleteAlertRule(request.params.ruleId);
      return reply.send({ success: true });
    },
  );

  // ---------------------------------------------------------------------------
  // Alerts
  // ---------------------------------------------------------------------------

  /**
   * GET /api/v1/alerts/:orgId
   * List alerts for an org with optional filters.
   */
  app.get<{
    Params: { orgId: string };
    Querystring: { status?: string; severity?: string; limit?: string; offset?: string };
  }>("/api/v1/alerts/:orgId", async (request, reply) => {
    requireAdminOrViewer(request, reply);
    if (reply.sent) return;
    const { orgId } = request.params;
    requireOrg(request, reply, orgId);
    if (reply.sent) return;

    const alertList = await alertService.listAlerts(orgId, {
      status: request.query.status as "open" | "acknowledged" | "resolved" | undefined,
      severity: request.query.severity,
      limit: request.query.limit ? parseInt(request.query.limit, 10) : undefined,
      offset: request.query.offset ? parseInt(request.query.offset, 10) : undefined,
    });

    return reply.send({ alerts: alertList });
  });

  /**
   * GET /api/v1/alerts/:orgId/stats
   * Get alert statistics.
   */
  app.get<{ Params: { orgId: string } }>("/api/v1/alerts/:orgId/stats", async (request, reply) => {
    requireAdminOrViewer(request, reply);
    if (reply.sent) return;
    const { orgId } = request.params;
    requireOrg(request, reply, orgId);
    if (reply.sent) return;

    const stats = await alertService.getAlertStats(orgId);
    return reply.send(stats);
  });

  /**
   * GET /api/v1/alerts/:orgId/:alertId
   * Get a single alert with details.
   */
  app.get<{ Params: { orgId: string; alertId: string } }>("/api/v1/alerts/:orgId/:alertId", async (request, reply) => {
    requireAdminOrViewer(request, reply);
    if (reply.sent) return;
    const { orgId, alertId } = request.params;
    requireOrg(request, reply, orgId);
    if (reply.sent) return;

    const alert = await alertService.getAlert(alertId);
    if (!alert) {
      return reply.code(404).send({ error: "Alert not found" });
    }

    return reply.send({ alert });
  });

  /**
   * PUT /api/v1/alerts/:orgId/:alertId/acknowledge
   * Acknowledge an alert.
   */
  app.put<{ Params: { orgId: string; alertId: string } }>(
    "/api/v1/alerts/:orgId/:alertId/acknowledge",
    async (request, reply) => {
      requireAdmin(request, reply);
      if (reply.sent) return;
      const { orgId, alertId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const updated = await alertService.acknowledgeAlert(alertId, request.authUser!.userId);
      if (!updated) {
        return reply.code(404).send({ error: "Alert not found" });
      }

      return reply.send(updated);
    },
  );

  /**
   * PUT /api/v1/alerts/:orgId/:alertId/resolve
   * Resolve an alert.
   */
  app.put<{ Params: { orgId: string; alertId: string } }>(
    "/api/v1/alerts/:orgId/:alertId/resolve",
    async (request, reply) => {
      requireAdmin(request, reply);
      if (reply.sent) return;
      const { orgId, alertId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const updated = await alertService.resolveAlert(alertId, request.authUser!.userId);
      if (!updated) {
        return reply.code(404).send({ error: "Alert not found" });
      }

      return reply.send(updated);
    },
  );

  /**
   * POST /api/v1/alerts/:orgId/evaluate
   * Manually trigger rule evaluation (admin only).
   */
  app.post<{ Params: { orgId: string } }>("/api/v1/alerts/:orgId/evaluate", async (request, reply) => {
    requireAdmin(request, reply);
    if (reply.sent) return;
    const { orgId } = request.params;
    requireOrg(request, reply, orgId);
    if (reply.sent) return;

    const alertsCreated = await alertService.evaluateRules(orgId);
    return reply.send({ alertsCreated });
  });
}
