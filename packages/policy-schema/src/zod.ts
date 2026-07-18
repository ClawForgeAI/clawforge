import { z } from "zod";

// AGT JSON Schema enums (canonical for policy YAML)
export const PolicyOperator = z.enum(["eq", "ne", "gt", "lt", "gte", "lte", "in", "not_in", "matches", "contains"]);
export type PolicyOperator = z.infer<typeof PolicyOperator>;

export const PolicyAction = z.enum(["allow", "deny", "audit", "block"]);
export type PolicyAction = z.infer<typeof PolicyAction>;

export const PolicyCondition = z.strictObject({
  field: z.string(),
  operator: PolicyOperator,
  value: z.unknown(),
});
export type PolicyCondition = z.infer<typeof PolicyCondition>;

export const PolicyRule = z.strictObject({
  name: z.string(),
  condition: PolicyCondition,
  action: PolicyAction,
  priority: z.number().int().default(0),
  message: z.string().default(""),
});
export type PolicyRule = z.infer<typeof PolicyRule>;

export const PolicyDefaults = z.strictObject({
  action: PolicyAction.default("allow"),
  max_tokens: z.number().int().default(4096),
  max_tool_calls: z.number().int().default(10),
  confidence_threshold: z.number().min(0).max(1).default(0.8),
});
export type PolicyDefaults = z.infer<typeof PolicyDefaults>;

export const A2AConversationAction = z.enum(["warn", "pause", "break", "quarantine"]);
export type A2AConversationAction = z.infer<typeof A2AConversationAction>;

export const A2AHumanApprovalTrigger = z.enum([
  "escalation_above_threshold",
  "offensive_intent_detected",
  "feedback_loop_detected",
]);
export type A2AHumanApprovalTrigger = z.infer<typeof A2AHumanApprovalTrigger>;

export const A2AConversationAuditConfig = z.strictObject({
  capture_full_transcript: z.boolean().default(true),
  retention_days: z.number().int().min(30).default(180),
});
export type A2AConversationAuditConfig = z.infer<typeof A2AConversationAuditConfig>;

export const A2AConversationPolicy = z.strictObject({
  enabled: z.boolean().default(true),
  escalation_score_threshold: z.number().min(0).max(1).default(0.6),
  escalation_warn_threshold: z.number().min(0).max(1).default(0.4),
  offensive_score_threshold: z.number().min(0).max(1).default(0.5),
  offensive_critical_threshold: z.number().min(0).max(1).default(0.8),
  max_retry_cycles: z.number().int().min(1).default(3),
  max_conversation_turns: z.number().int().min(1).default(30),
  on_escalation_detected: A2AConversationAction.default("warn"),
  on_offensive_detected: A2AConversationAction.default("break"),
  on_feedback_loop: A2AConversationAction.default("break"),
  require_human_approval_on: z.array(A2AHumanApprovalTrigger).default([]),
  audit: A2AConversationAuditConfig.optional(),
});
export type A2AConversationPolicy = z.infer<typeof A2AConversationPolicy>;

// Top-level AGT Policy document — canonical YAML wire shape
export const Policy = z.strictObject({
  version: z.string().default("1.0"),
  name: z.string().default("unnamed"),
  description: z.string().default(""),
  rules: z.array(PolicyRule).default([]),
  defaults: PolicyDefaults.optional(),
  a2a_conversation_policy: A2AConversationPolicy.optional(),
});
export type Policy = z.infer<typeof Policy>;

// Runtime types (from AGT TS SDK — not the YAML JSON Schema)
//
// AGT's TS SDK uses a richer PolicyAction at runtime than the YAML schema does.
// Runtime decisions can carry warn/require_approval/log; YAML rules cannot author
// those today. Keep the two enums separate so the validator rejects unknown YAML
// actions while the client can still surface richer runtime decisions.

export const RuntimePolicyAction = z.enum(["allow", "deny", "warn", "require_approval", "log"]);
export type RuntimePolicyAction = z.infer<typeof RuntimePolicyAction>;

export const LegacyPolicyDecision = z.enum(["allow", "deny", "review"]);
export type LegacyPolicyDecision = z.infer<typeof LegacyPolicyDecision>;

export const PolicyDecisionResult = z.strictObject({
  allowed: z.boolean(),
  action: RuntimePolicyAction,
  matchedRule: z.string().optional(),
  policyName: z.string().optional(),
  reason: z.string().optional(),
  approvers: z.array(z.string()),
  rateLimited: z.boolean(),
  evaluatedAt: z.coerce.date(),
  evaluationMs: z.number().optional(),
});
export type PolicyDecisionResult = z.infer<typeof PolicyDecisionResult>;

// AuditEntry — AGT hash-chained record
export const AuditEntry = z.strictObject({
  timestamp: z.iso.datetime(),
  agentId: z.string(),
  action: z.string(),
  decision: LegacyPolicyDecision,
  hash: z.string(),
  previousHash: z.string(),
});
export type AuditEntry = z.infer<typeof AuditEntry>;

// Identity
export const IdentityStatus = z.enum(["active", "suspended", "revoked"]);
export type IdentityStatus = z.infer<typeof IdentityStatus>;

export const AgentIdentityJSON = z.strictObject({
  did: z.string(),
  publicKey: z.string(),
  privateKey: z.string().optional(),
  capabilities: z.array(z.string()),
  name: z.string().optional(),
  description: z.string().optional(),
  sponsor: z.string().optional(),
  organization: z.string().optional(),
  status: IdentityStatus.optional(),
  parentDid: z.string().optional(),
  delegationDepth: z.number().int().optional(),
  createdAt: z.string().optional(),
  expiresAt: z.string().optional(),
});
export type AgentIdentityJSON = z.infer<typeof AgentIdentityJSON>;

// Trust
export const TrustTier = z.enum(["Untrusted", "Provisional", "Trusted", "Verified"]);
export type TrustTier = z.infer<typeof TrustTier>;

export const TrustScore = z.strictObject({
  overall: z.number(),
  dimensions: z.record(z.string(), z.number()),
  tier: TrustTier,
});
export type TrustScore = z.infer<typeof TrustScore>;
