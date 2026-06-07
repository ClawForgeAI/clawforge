/**
 * @deprecated Cut 1 step 4: legacy Clawforge policy shapes. New code should
 * import the AGT-canonical equivalents from `@clawforgeai/contracts` (e.g.
 * `Policy`, `PolicyRule`, `PolicyDecisionResult`) — sourced from
 * `@clawforgeai/policy-schema`. These types are removed in Cut 1 step 10
 * once `agent-sdk`, `policy-engine`, and `tool-governance` have migrated.
 */
import { z } from "zod";

export const DlpAction = z.enum(["block", "warn", "log"]);
export type DlpAction = z.infer<typeof DlpAction>;

export const DlpSeverity = z.enum(["critical", "high", "medium", "info"]);
export type DlpSeverity = z.infer<typeof DlpSeverity>;

export const DlpRule = z.object({
  name: z.string(),
  pattern: z.string(),
  action: DlpAction,
  severity: DlpSeverity,
  category: z.string().optional(),
  enabled: z.boolean().optional(),
  message: z.string().optional(),
});
export type DlpRule = z.infer<typeof DlpRule>;

export const DlpViolation = z.object({
  ruleName: z.string(),
  action: DlpAction,
  severity: DlpSeverity,
  redactedContext: z.string(),
  category: z.string().optional(),
});
export type DlpViolation = z.infer<typeof DlpViolation>;

export const DlpScanResult = z.object({
  violations: z.array(DlpViolation),
  effectiveAction: DlpAction.nullable(),
  scannedFields: z.number().int().nonnegative(),
});
export type DlpScanResult = z.infer<typeof DlpScanResult>;

export const ApprovedSkill = z.object({
  name: z.string(),
  key: z.string(),
  scope: z.enum(["org", "self"]),
});
export type ApprovedSkill = z.infer<typeof ApprovedSkill>;

export const AuditLevel = z.enum(["full", "metadata", "off"]);
export type AuditLevel = z.infer<typeof AuditLevel>;

export const KillSwitchState = z.object({
  active: z.boolean(),
  message: z.string().optional(),
});
export type KillSwitchState = z.infer<typeof KillSwitchState>;

/**
 * The effective policy projected for a single user. This is the wire shape
 * returned by `GET /api/v1/policies/:orgId/effective` and the shape persisted
 * by the plugin at `~/.openclaw/clawforge/org-policy.json`.
 */
export const OrgPolicy = z.object({
  version: z.number().int(),
  tools: z.object({
    allow: z.array(z.string()).optional(),
    deny: z.array(z.string()).optional(),
    profile: z.string().optional(),
  }),
  skills: z.object({
    approved: z.array(ApprovedSkill),
    requireApproval: z.boolean(),
  }),
  killSwitch: KillSwitchState,
  auditLevel: AuditLevel,
  dlpRules: z.array(DlpRule).optional(),
});
export type OrgPolicy = z.infer<typeof OrgPolicy>;

/** Server-side alias for OrgPolicy used by `policy-service.ts`. Same shape. */
export const EffectivePolicy = OrgPolicy;
export type EffectivePolicy = OrgPolicy;
