/**
 * Audit service for ingesting and querying audit events.
 */

import { eq, and, gte, lte, desc, lt, sql, count } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { auditEvents } from "../db/schema.js";
import type * as schema from "../db/schema.js";

export type AuditEventInput = {
  userId: string;
  orgId: string;
  eventType: string;
  toolName?: string;
  outcome: string;
  agentId?: string;
  sessionKey?: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
};

export type AuditQueryParams = {
  orgId: string;
  userId?: string;
  eventType?: string;
  toolName?: string;
  outcome?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
  cursor?: string;
  tag?: string;
  group?: string;
};

export type AuditExportParams = AuditQueryParams & {
  batchSize?: number;
};

export class AuditService {
  constructor(private db: PostgresJsDatabase<typeof schema>) {}

  async ingestEvents(events: AuditEventInput[]) {
    if (events.length === 0) return;

    await this.db.insert(auditEvents).values(
      events.map((e) => ({
        orgId: e.orgId,
        userId: e.userId,
        eventType: e.eventType,
        toolName: e.toolName,
        outcome: e.outcome,
        agentId: e.agentId,
        sessionKey: e.sessionKey,
        metadata: e.metadata,
        timestamp: new Date(e.timestamp),
      })),
    );
  }

  private buildConditions(params: AuditQueryParams) {
    const conditions = [eq(auditEvents.orgId, params.orgId)];
    if (params.userId) conditions.push(eq(auditEvents.userId, params.userId));
    if (params.eventType) conditions.push(eq(auditEvents.eventType, params.eventType));
    if (params.toolName) conditions.push(eq(auditEvents.toolName, params.toolName));
    if (params.outcome) conditions.push(eq(auditEvents.outcome, params.outcome));
    if (params.from) conditions.push(gte(auditEvents.timestamp, params.from));
    if (params.to) conditions.push(lte(auditEvents.timestamp, params.to));
    if (params.tag) {
      conditions.push(
        sql`EXISTS (
          SELECT 1
          FROM "client_heartbeats" AS ch
          WHERE ch."org_id" = ${params.orgId}
            AND ch."user_id" = ${auditEvents.userId}
            AND ch."tags" ? ${params.tag}
        )`,
      );
    }
    if (params.group) {
      conditions.push(
        sql`EXISTS (
          SELECT 1
          FROM "client_heartbeats" AS ch
          WHERE ch."org_id" = ${params.orgId}
            AND ch."user_id" = ${auditEvents.userId}
            AND ch."group_name" = ${params.group}
        )`,
      );
    }
    return conditions;
  }

  async queryEvents(params: AuditQueryParams) {
    const conditions = this.buildConditions(params);

    if (params.cursor) {
      // Cursor-based: fetch events older than cursor's timestamp
      const cursorSubquery = sql`(SELECT "timestamp" FROM "audit_events" WHERE "id" = ${params.cursor})`;
      conditions.push(lt(auditEvents.timestamp, cursorSubquery));
    }

    return this.db
      .select()
      .from(auditEvents)
      .where(and(...conditions))
      .orderBy(desc(auditEvents.timestamp))
      .limit(params.limit ?? 100)
      .offset(params.cursor ? 0 : (params.offset ?? 0));
  }

  async countEvents(params: AuditQueryParams): Promise<number> {
    const conditions = this.buildConditions(params);
    const [result] = await this.db
      .select({ total: count() })
      .from(auditEvents)
      .where(and(...conditions));
    return result?.total ?? 0;
  }

  async *streamEventsForExport(params: AuditExportParams) {
    const totalLimit = Math.min(params.limit ?? 10000, 100000);
    const batchSize = Math.min(params.batchSize ?? 1000, totalLimit);

    let remaining = totalLimit;
    let cursor = params.cursor;

    while (remaining > 0) {
      const events = await this.queryEvents({
        ...params,
        cursor,
        limit: Math.min(batchSize, remaining),
        offset: 0,
      });

      if (events.length === 0) {
        break;
      }

      yield events;

      remaining -= events.length;
      cursor = events[events.length - 1]?.id;

      if (events.length < Math.min(batchSize, remaining + events.length)) {
        break;
      }
    }
  }

  async getEvent(id: string) {
    const [event] = await this.db.select().from(auditEvents).where(eq(auditEvents.id, id)).limit(1);
    return event ?? null;
  }

  async deleteOldEvents(orgId: string, olderThan: Date): Promise<number> {
    const result = await this.db
      .delete(auditEvents)
      .where(and(eq(auditEvents.orgId, orgId), lt(auditEvents.timestamp, olderThan)))
      .returning({ id: auditEvents.id });
    return result.length;
  }
}
