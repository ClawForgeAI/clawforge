/**
 * AGT-shaped Zod schemas re-exported from `@clawforgeai/policy-schema`.
 *
 * Per addendum §A3 (the contracts fate matrix), policy / audit / approvals
 * shapes that used to live in this package have an AGT-canonical equivalent.
 * New code should import these AGT shapes; legacy `OrgPolicy`, `AuditEvent`,
 * `ApprovalRequest` etc. remain available alongside for the transition window
 * and are flagged `@deprecated`. Removal is tracked under Cut 1 step 10.
 */
export {
  A2AConversationAction,
  A2AConversationAuditConfig,
  A2AConversationPolicy,
  A2AHumanApprovalTrigger,
  AgentIdentityJSON,
  AuditEntry,
  IdentityStatus,
  LegacyPolicyDecision,
  Policy,
  PolicyAction,
  PolicyCondition,
  PolicyDecisionResult,
  PolicyDefaults,
  PolicyOperator,
  PolicyRule,
  RuntimePolicyAction,
  TrustScore,
  TrustTier,
} from "@clawforgeai/policy-schema";
