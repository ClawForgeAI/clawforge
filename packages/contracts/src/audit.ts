/**
 * @deprecated Cut 1 step 4: legacy Clawforge audit shape. New code should
 * import the AGT-canonical `AuditEntry` (hash-chained) from
 * `@clawforgeai/contracts` or `@clawforgeai/policy-schema`. These types
 * are removed in Cut 1 step 10 once `audit-events` and the plugin's audit
 * pipeline migrate to AGT entries.
 */
import { z } from "zod";
import { OrgId, Outcome, UserId } from "./common.js";

export const AuditEventType = z.enum([
  "tool_call_attempt",
  "tool_call_result",
  "session_start",
  "session_end",
  "llm_input",
  "llm_output",
  "kill_switch_activated",
  "policy_refresh",
  "dlp_violation",
  "agent_enrolled",
  "agent_crash",
  "agent_restart",
]);
export type AuditEventType = z.infer<typeof AuditEventType>;

/**
 * Wire shape used by both:
 *   - the plugin audit logger (uploaded to `POST /api/v1/audit/:orgId/events`)
 *   - the persisted JSONL buffer at `~/.openclaw/clawforge/audit-buffer.jsonl`
 *
 * Server-side ingestion (`AuditEventInput`) accepts the same fields plus
 * a less constrained `eventType: string` because the server table is open
 * to future event families. We expose `AuditEventInput` separately to
 * preserve that latitude.
 */
export const AuditEvent = z.object({
  userId: UserId,
  orgId: OrgId,
  agentId: z.string().optional(),
  sessionKey: z.string().optional(),
  eventType: AuditEventType,
  toolName: z.string().optional(),
  timestamp: z.number().int(),
  outcome: Outcome,
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type AuditEvent = z.infer<typeof AuditEvent>;

/**
 * Server-side ingestion shape. Looser than `AuditEvent` because the server
 * accepts new event families without a contracts release.
 */
export const AuditEventInput = z.object({
  userId: UserId,
  orgId: OrgId,
  eventType: z.string(),
  toolName: z.string().optional(),
  outcome: z.string(),
  agentId: z.string().optional(),
  sessionKey: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.number().int(),
});
export type AuditEventInput = z.infer<typeof AuditEventInput>;

export const PromptInjectionAssessment = z.object({
  detected: z.boolean(),
  confidence: z.number().int().min(0).max(100),
  signals: z.array(z.string()),
});
export type PromptInjectionAssessment = z.infer<typeof PromptInjectionAssessment>;
