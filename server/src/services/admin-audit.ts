/**
 * Helper for logging admin actions to the audit trail.
 */
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { auditEvents } from "../db/schema.js";
import type * as schema from "../db/schema.js";

export type AdminAction = {
  orgId: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
};

export async function logAdminAction(db: PostgresJsDatabase<typeof schema>, action: AdminAction) {
  await db.insert(auditEvents).values({
    orgId: action.orgId,
    userId: action.userId,
    eventType: "admin_action",
    toolName: null,
    outcome: action.action,
    agentId: null,
    sessionKey: null,
    metadata: {
      resourceType: action.resourceType,
      resourceId: action.resourceId,
      ...action.details,
    },
    timestamp: new Date(),
  });
}
