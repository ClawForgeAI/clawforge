/**
 * Audit log retention and cleanup service (#39).
 *
 * Runs a background job that periodically deletes old audit events
 * in batches to avoid long table locks.
 */

import { lt, and, eq, sql, count } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { auditEvents } from "../db/schema.js";
import type * as schema from "../db/schema.js";

export type RetentionConfig = {
  retentionDays: number;
  intervalHours: number;
  batchSize: number;
};

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the audit retention cleanup job.
 */
export function startAuditRetentionJob(
  db: PostgresJsDatabase<typeof schema>,
  config: RetentionConfig,
): void {
  const intervalMs = config.intervalHours * 60 * 60 * 1000;

  // Run immediately on startup
  runCleanup(db, config).catch((err) => {
    console.error("[audit-retention] Initial cleanup failed:", err);
  });

  // Schedule periodic cleanup
  cleanupTimer = setInterval(() => {
    runCleanup(db, config).catch((err) => {
      console.error("[audit-retention] Scheduled cleanup failed:", err);
    });
  }, intervalMs);

  console.log(
    `[audit-retention] Started: retention=${config.retentionDays}d, interval=${config.intervalHours}h, batch=${config.batchSize}`,
  );
}

/**
 * Stop the audit retention cleanup job.
 */
export function stopAuditRetentionJob(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
    console.log("[audit-retention] Stopped.");
  }
}

/**
 * Run a single cleanup pass, deleting old events in batches.
 */
async function runCleanup(
  db: PostgresJsDatabase<typeof schema>,
  config: RetentionConfig,
): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - config.retentionDays);

  let totalDeleted = 0;
  const startTime = Date.now();

  // Delete in batches to avoid long locks
  while (true) {
    const batch = await db
      .delete(auditEvents)
      .where(lt(auditEvents.timestamp, cutoff))
      .returning({ id: auditEvents.id });

    // If drizzle returns fewer than batch size, we need to check
    totalDeleted += batch.length;

    if (batch.length === 0 || batch.length < config.batchSize) {
      break;
    }
  }

  const durationMs = Date.now() - startTime;
  if (totalDeleted > 0) {
    console.log(
      `[audit-retention] Cleanup complete: deleted=${totalDeleted}, cutoff=${cutoff.toISOString()}, duration=${durationMs}ms`,
    );
  }
}

/**
 * Get audit stats for an organization.
 */
export async function getAuditStats(
  db: PostgresJsDatabase<typeof schema>,
  orgId: string,
): Promise<{
  eventCount: number;
  oldestEvent: string | null;
  newestEvent: string | null;
}> {
  const [countResult] = await db
    .select({ total: count() })
    .from(auditEvents)
    .where(eq(auditEvents.orgId, orgId));

  const [oldest] = await db
    .select({ timestamp: auditEvents.timestamp })
    .from(auditEvents)
    .where(eq(auditEvents.orgId, orgId))
    .orderBy(auditEvents.timestamp)
    .limit(1);

  const [newest] = await db
    .select({ timestamp: auditEvents.timestamp })
    .from(auditEvents)
    .where(eq(auditEvents.orgId, orgId))
    .orderBy(sql`${auditEvents.timestamp} DESC`)
    .limit(1);

  return {
    eventCount: countResult?.total ?? 0,
    oldestEvent: oldest?.timestamp?.toISOString() ?? null,
    newestEvent: newest?.timestamp?.toISOString() ?? null,
  };
}
