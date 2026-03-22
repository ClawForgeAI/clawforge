/**
 * Alert service for anomaly detection on audit logs (#51).
 *
 * Evaluates configurable alert rules against the audit event stream
 * and generates alerts when thresholds are exceeded.
 */

import { eq, and, desc, gte, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { alertRules, alerts, auditEvents } from "../db/schema.js";
import type * as schema from "../db/schema.js";

export type AlertRuleType =
  | "denied_tool_burst"
  | "dlp_violation_burst"
  | "off_hours_activity"
  | "sensitive_tool_access"
  | "session_anomaly"
  | "blocked_tool_persistence";

export type AlertStatus = "open" | "acknowledged" | "resolved";

export class AlertService {
  constructor(private db: PostgresJsDatabase<typeof schema>) {}

  // ---------------------------------------------------------------------------
  // Alert Rules CRUD
  // ---------------------------------------------------------------------------

  async listAlertRules(orgId: string) {
    return this.db.select().from(alertRules).where(eq(alertRules.orgId, orgId)).orderBy(alertRules.name);
  }

  async createAlertRule(
    orgId: string,
    data: {
      name: string;
      description?: string;
      ruleType: AlertRuleType;
      config: Record<string, unknown>;
      severity?: "critical" | "high" | "medium" | "low";
      webhookUrl?: string;
      enabled?: boolean;
    },
  ) {
    const [created] = await this.db
      .insert(alertRules)
      .values({
        orgId,
        name: data.name,
        description: data.description,
        ruleType: data.ruleType,
        config: data.config,
        severity: data.severity ?? "medium",
        webhookUrl: data.webhookUrl,
        enabled: data.enabled ?? true,
      })
      .returning();
    return created;
  }

  async updateAlertRule(
    ruleId: string,
    data: {
      name?: string;
      description?: string;
      config?: Record<string, unknown>;
      severity?: "critical" | "high" | "medium" | "low";
      webhookUrl?: string | null;
      enabled?: boolean;
    },
  ) {
    const [updated] = await this.db
      .update(alertRules)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(alertRules.id, ruleId))
      .returning();
    return updated;
  }

  async deleteAlertRule(ruleId: string) {
    await this.db.delete(alertRules).where(eq(alertRules.id, ruleId));
  }

  // ---------------------------------------------------------------------------
  // Alerts CRUD
  // ---------------------------------------------------------------------------

  async listAlerts(
    orgId: string,
    params: {
      status?: AlertStatus;
      severity?: string;
      limit?: number;
      offset?: number;
    } = {},
  ) {
    const conditions = [eq(alerts.orgId, orgId)];
    if (params.status) conditions.push(eq(alerts.status, params.status));
    if (params.severity) conditions.push(eq(alerts.severity, params.severity as "critical" | "high" | "medium" | "low"));

    const rows = await this.db
      .select()
      .from(alerts)
      .where(and(...conditions))
      .orderBy(desc(alerts.createdAt))
      .limit(params.limit ?? 100)
      .offset(params.offset ?? 0);

    return rows;
  }

  async getAlert(alertId: string) {
    const [alert] = await this.db.select().from(alerts).where(eq(alerts.id, alertId)).limit(1);
    return alert ?? null;
  }

  async acknowledgeAlert(alertId: string, userId: string) {
    const [updated] = await this.db
      .update(alerts)
      .set({
        status: "acknowledged",
        acknowledgedBy: userId,
        acknowledgedAt: new Date(),
      })
      .where(eq(alerts.id, alertId))
      .returning();
    return updated;
  }

  async resolveAlert(alertId: string, userId: string) {
    const [updated] = await this.db
      .update(alerts)
      .set({
        status: "resolved",
        resolvedBy: userId,
        resolvedAt: new Date(),
      })
      .where(eq(alerts.id, alertId))
      .returning();
    return updated;
  }

  async getAlertStats(orgId: string) {
    const [stats] = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        open: sql<number>`count(*) filter (where ${alerts.status} = 'open')::int`,
        acknowledged: sql<number>`count(*) filter (where ${alerts.status} = 'acknowledged')::int`,
        resolved: sql<number>`count(*) filter (where ${alerts.status} = 'resolved')::int`,
        critical: sql<number>`count(*) filter (where ${alerts.severity} = 'critical' and ${alerts.status} != 'resolved')::int`,
        high: sql<number>`count(*) filter (where ${alerts.severity} = 'high' and ${alerts.status} != 'resolved')::int`,
      })
      .from(alerts)
      .where(eq(alerts.orgId, orgId));

    return stats;
  }

  // ---------------------------------------------------------------------------
  // Rule Evaluation Engine
  // ---------------------------------------------------------------------------

  /**
   * Evaluate alert rules against recent audit events for an org.
   * Called periodically (e.g., every minute) or on audit event ingestion.
   */
  async evaluateRules(orgId: string): Promise<number> {
    const rules = await this.db
      .select()
      .from(alertRules)
      .where(and(eq(alertRules.orgId, orgId), eq(alertRules.enabled, true)));

    let alertsCreated = 0;

    for (const rule of rules) {
      const config = rule.config as Record<string, unknown>;

      switch (rule.ruleType) {
        case "denied_tool_burst":
          alertsCreated += await this.evaluateDeniedToolBurst(orgId, rule.id, rule.severity, config);
          break;
        case "dlp_violation_burst":
          alertsCreated += await this.evaluateDlpViolationBurst(orgId, rule.id, rule.severity, config);
          break;
        case "off_hours_activity":
          alertsCreated += await this.evaluateOffHoursActivity(orgId, rule.id, rule.severity, config);
          break;
        default:
          break;
      }
    }

    return alertsCreated;
  }

  /**
   * Denied tool burst: >N denied tool calls in M minutes from a single user.
   */
  private async evaluateDeniedToolBurst(
    orgId: string,
    ruleId: string,
    severity: string,
    config: Record<string, unknown>,
  ): Promise<number> {
    const threshold = (config.threshold as number) ?? 10;
    const windowMinutes = (config.windowMinutes as number) ?? 5;
    const since = new Date(Date.now() - windowMinutes * 60_000);

    const rows = await this.db
      .select({
        userId: auditEvents.userId,
        count: sql<number>`count(*)::int`,
      })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.orgId, orgId),
          eq(auditEvents.outcome, "blocked"),
          eq(auditEvents.eventType, "tool_call_attempt"),
          gte(auditEvents.timestamp, since),
        ),
      )
      .groupBy(auditEvents.userId);

    let created = 0;
    for (const row of rows) {
      if (row.count >= threshold) {
        // Check if we already have an open alert for this user/rule
        const [existing] = await this.db
          .select()
          .from(alerts)
          .where(
            and(
              eq(alerts.orgId, orgId),
              eq(alerts.ruleId, ruleId),
              eq(alerts.userId, row.userId),
              eq(alerts.status, "open"),
            ),
          )
          .limit(1);

        if (!existing) {
          await this.db.insert(alerts).values({
            orgId,
            ruleId,
            userId: row.userId,
            severity: severity as "critical" | "high" | "medium" | "low",
            title: `Denied tool burst: ${row.count} blocked calls in ${windowMinutes} minutes`,
            details: { count: row.count, windowMinutes, threshold },
          });
          created++;
        }
      }
    }
    return created;
  }

  /**
   * DLP violation burst: >N DLP violations in M minutes from a single user.
   */
  private async evaluateDlpViolationBurst(
    orgId: string,
    ruleId: string,
    severity: string,
    config: Record<string, unknown>,
  ): Promise<number> {
    const threshold = (config.threshold as number) ?? 5;
    const windowMinutes = (config.windowMinutes as number) ?? 10;
    const since = new Date(Date.now() - windowMinutes * 60_000);

    const rows = await this.db
      .select({
        userId: auditEvents.userId,
        count: sql<number>`count(*)::int`,
      })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.orgId, orgId),
          eq(auditEvents.eventType, "dlp_violation"),
          gte(auditEvents.timestamp, since),
        ),
      )
      .groupBy(auditEvents.userId);

    let created = 0;
    for (const row of rows) {
      if (row.count >= threshold) {
        const [existing] = await this.db
          .select()
          .from(alerts)
          .where(
            and(
              eq(alerts.orgId, orgId),
              eq(alerts.ruleId, ruleId),
              eq(alerts.userId, row.userId),
              eq(alerts.status, "open"),
            ),
          )
          .limit(1);

        if (!existing) {
          await this.db.insert(alerts).values({
            orgId,
            ruleId,
            userId: row.userId,
            severity: severity as "critical" | "high" | "medium" | "low",
            title: `DLP violation burst: ${row.count} violations in ${windowMinutes} minutes`,
            details: { count: row.count, windowMinutes, threshold },
          });
          created++;
        }
      }
    }
    return created;
  }

  /**
   * Off-hours activity: tool calls outside configured business hours.
   */
  private async evaluateOffHoursActivity(
    orgId: string,
    ruleId: string,
    severity: string,
    config: Record<string, unknown>,
  ): Promise<number> {
    const startHour = (config.businessHoursStart as number) ?? 9;
    const endHour = (config.businessHoursEnd as number) ?? 17;
    const timezone = (config.timezone as string) ?? "UTC";
    const windowMinutes = (config.windowMinutes as number) ?? 30;
    const since = new Date(Date.now() - windowMinutes * 60_000);

    // Find tool calls outside business hours
    const rows = await this.db
      .select({
        userId: auditEvents.userId,
        count: sql<number>`count(*)::int`,
      })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.orgId, orgId),
          eq(auditEvents.eventType, "tool_call_attempt"),
          gte(auditEvents.timestamp, since),
          sql`extract(hour from ${auditEvents.timestamp} at time zone ${timezone}) not between ${startHour} and ${endHour - 1}`,
        ),
      )
      .groupBy(auditEvents.userId);

    let created = 0;
    for (const row of rows) {
      if (row.count > 0) {
        const [existing] = await this.db
          .select()
          .from(alerts)
          .where(
            and(
              eq(alerts.orgId, orgId),
              eq(alerts.ruleId, ruleId),
              eq(alerts.userId, row.userId),
              eq(alerts.status, "open"),
            ),
          )
          .limit(1);

        if (!existing) {
          await this.db.insert(alerts).values({
            orgId,
            ruleId,
            userId: row.userId,
            severity: severity as "critical" | "high" | "medium" | "low",
            title: `Off-hours activity: ${row.count} tool calls outside business hours (${startHour}:00-${endHour}:00 ${timezone})`,
            details: { count: row.count, startHour, endHour, timezone },
          });
          created++;
        }
      }
    }
    return created;
  }

  // ---------------------------------------------------------------------------
  // Webhook delivery
  // ---------------------------------------------------------------------------

  /**
   * Send alert notification to configured webhook URL.
   */
  async deliverWebhook(
    alert: { id: string; title: string; severity: string; details: unknown },
    webhookUrl: string,
  ): Promise<boolean> {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "alert.triggered",
          alert: {
            id: alert.id,
            title: alert.title,
            severity: alert.severity,
            details: alert.details,
            timestamp: new Date().toISOString(),
          },
        }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
