/**
 * Audit routes – event ingestion, querying, retention, and stats.
 */

import type { FastifyInstance } from "fastify";
import { Readable } from "node:stream";
import { z } from "zod";
import { requireAdmin, requireAdminOrViewer, requireOrg } from "../middleware/auth.js";
import { AuditService } from "../services/audit-service.js";
import { getAuditStats } from "../services/audit-retention.js";
import { WebhookService, type WebhookEventType } from "../services/webhook.js";

const MAX_BATCH_SIZE = 500;

const IngestBodySchema = z.object({
  events: z
    .array(
      z.object({
        userId: z.string(),
        orgId: z.string(),
        eventType: z.string(),
        toolName: z.string().optional(),
        outcome: z.string(),
        agentId: z.string().optional(),
        sessionKey: z.string().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
        timestamp: z.number(),
      }),
    )
    .max(MAX_BATCH_SIZE, {
      message: `Batch size exceeds maximum of ${MAX_BATCH_SIZE} events`,
    }),
});

const RetentionSchema = z.object({
  retentionDays: z.number().int().min(1).max(3650),
});

const ExportQuerySchema = z.object({
  format: z.enum(["csv", "json"]).default("json"),
  userId: z.string().optional(),
  eventType: z.string().optional(),
  toolName: z.string().optional(),
  outcome: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100000).default(10000),
  tag: z.string().optional(),
  group: z.string().optional(),
});

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const stringValue = typeof value === "string" ? value : JSON.stringify(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

/** Map audit event types to webhook event types. */
const AUDIT_TO_WEBHOOK: Record<string, WebhookEventType> = {
  tool_call_attempt: "policy.violation",
  dlp_violation: "dlp.alert",
};

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  const auditService = new AuditService(app.db);
  const webhookService = new WebhookService(app.db);

  // POST /api/v1/audit/:orgId/events - Ingest (keep existing)
  app.post<{ Params: { orgId: string } }>(
    "/api/v1/audit/:orgId/events",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { orgId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const parseResult = IngestBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: "Invalid request body",
          details: parseResult.error.issues,
        });
      }

      const authUser = request.authUser!;
      const events = parseResult.data.events;

      const invalidOrg = events.find((e) => e.orgId !== orgId);
      if (invalidOrg) {
        return reply.code(400).send({
          error: "Event orgId mismatch: all events must belong to the route orgId",
        });
      }

      if (authUser.role !== "admin" && authUser.role !== "super_admin") {
        const invalidUser = events.find((e) => e.userId !== authUser.userId);
        if (invalidUser) {
          return reply.code(403).send({
            error: "Non-admin users can only submit audit events for their own userId",
          });
        }
      }

      await auditService.ingestEvents(events);

      // Track audit ingestion metric (#76)
      app.metrics.auditEventsCounter.inc(events.length);

      // Deliver webhook events for policy violations and DLP alerts (#43)
      for (const event of events) {
        const webhookEvent = AUDIT_TO_WEBHOOK[event.eventType];
        if (webhookEvent && (event.outcome === "blocked" || event.eventType === "dlp_violation")) {
          webhookService
            .deliverEvent(orgId, webhookEvent, {
              orgId,
              userId: event.userId,
              eventType: event.eventType,
              toolName: event.toolName,
              outcome: event.outcome,
              metadata: event.metadata,
              timestamp: new Date(event.timestamp).toISOString(),
            })
            .catch(() => {});
        }
      }

      return reply.code(201).send({ ingested: events.length });
    },
  );

  // GET /api/v1/audit/:orgId/query - Query with pagination (#38: viewers can query)
  app.get<{
    Params: { orgId: string };
    Querystring: {
      userId?: string;
      eventType?: string;
      toolName?: string;
      outcome?: string;
      from?: string;
      to?: string;
      limit?: string;
      offset?: string;
      cursor?: string;
      tag?: string;
      group?: string;
    };
  }>("/api/v1/audit/:orgId/query", async (request, reply) => {
    requireAdminOrViewer(request, reply);
    if (reply.sent) return;
    const { orgId } = request.params;
    requireOrg(request, reply, orgId);
    if (reply.sent) return;

    const query = request.query;
    const params = {
      orgId,
      userId: query.userId,
      eventType: query.eventType,
      toolName: query.toolName,
      outcome: query.outcome,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
      offset: query.offset ? parseInt(query.offset, 10) : undefined,
      cursor: query.cursor,
      tag: query.tag,
      group: query.group,
    };

    const [events, total] = await Promise.all([auditService.queryEvents(params), auditService.countEvents(params)]);

    const limit = params.limit ?? 100;
    const nextCursor = events.length === limit ? events[events.length - 1]?.id : undefined;

    return reply.send({ events, total, nextCursor });
  });

  // GET /api/v1/audit/:orgId/events/:eventId - Single event detail (#38: viewers can read)
  app.get<{ Params: { orgId: string; eventId: string } }>(
    "/api/v1/audit/:orgId/events/:eventId",
    async (request, reply) => {
      requireAdminOrViewer(request, reply);
      if (reply.sent) return;
      const { orgId, eventId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const event = await auditService.getEvent(eventId);
      if (!event || event.orgId !== orgId) {
        return reply.code(404).send({ error: "Event not found" });
      }

      return reply.send({ event });
    },
  );

  // GET /api/v1/audit/:orgId/stats - Audit stats (#39)
  app.get<{ Params: { orgId: string } }>("/api/v1/audit/:orgId/stats", async (request, reply) => {
    requireAdminOrViewer(request, reply);
    if (reply.sent) return;
    const { orgId } = request.params;
    requireOrg(request, reply, orgId);
    if (reply.sent) return;

    const stats = await getAuditStats(app.db, orgId);
    const retentionDays = parseInt(process.env.AUDIT_RETENTION_DAYS ?? "0", 10);

    return reply.send({
      ...stats,
      retentionDays: retentionDays > 0 ? retentionDays : null,
    });
  });

  // GET /api/v1/audit/:orgId/export - Stream filtered audit logs (#42)
  app.get<{
    Params: { orgId: string };
    Querystring: {
      format?: "csv" | "json";
      userId?: string;
      eventType?: string;
      toolName?: string;
      outcome?: string;
      from?: string;
      to?: string;
      limit?: string;
      tag?: string;
      group?: string;
    };
  }>("/api/v1/audit/:orgId/export", async (request, reply) => {
    requireAdmin(request, reply);
    if (reply.sent) return;
    const { orgId } = request.params;
    requireOrg(request, reply, orgId);
    if (reply.sent) return;

    const parseResult = ExportQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: "Invalid export query",
        details: parseResult.error.issues,
      });
    }

    const query = parseResult.data;
    const params = {
      orgId,
      userId: query.userId,
      eventType: query.eventType,
      toolName: query.toolName,
      outcome: query.outcome,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      limit: query.limit,
      tag: query.tag,
      group: query.group,
    };

    const dateSuffix = new Date().toISOString().slice(0, 10);

    if (query.format === "csv") {
      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.header("Content-Disposition", `attachment; filename="audit-export-${dateSuffix}.csv"`);

      const stream = Readable.from(
        (async function* () {
          yield "id,timestamp,orgId,userId,eventType,toolName,outcome,agentId,sessionKey,metadata\n";

          for await (const events of auditService.streamEventsForExport(params)) {
            for (const event of events) {
              yield [
                event.id,
                event.timestamp.toISOString(),
                event.orgId,
                event.userId,
                event.eventType,
                event.toolName,
                event.outcome,
                event.agentId,
                event.sessionKey,
                event.metadata,
              ]
                .map(escapeCsvValue)
                .join(",") + "\n";
            }
          }
        })(),
      );

      return reply.send(stream);
    }

    reply.header("Content-Type", "application/x-ndjson; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="audit-export-${dateSuffix}.ndjson"`);

    const stream = Readable.from(
      (async function* () {
        for await (const events of auditService.streamEventsForExport(params)) {
          for (const event of events) {
            yield `${JSON.stringify(event)}\n`;
          }
        }
      })(),
    );

    return reply.send(stream);
  });

  // DELETE /api/v1/audit/:orgId/retention - Retention cleanup
  app.delete<{ Params: { orgId: string } }>("/api/v1/audit/:orgId/retention", async (request, reply) => {
    requireAdmin(request, reply);
    if (reply.sent) return;
    const { orgId } = request.params;
    requireOrg(request, reply, orgId);
    if (reply.sent) return;

    const parseResult = RetentionSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: "Invalid request body",
        details: parseResult.error.issues,
      });
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - parseResult.data.retentionDays);

    const deleted = await auditService.deleteOldEvents(orgId, cutoff);
    return reply.send({ deleted, cutoffDate: cutoff.toISOString() });
  });
}
