/**
 * @deprecated Cut 1 step 4: legacy approval shapes. The AGT-canonical
 * approval shape is modeled on the `require_approval` policy action — see
 * the new `approvals` table and `/api/v1/approvals` routes landing in
 * Cut 1 steps 6 and 7. These types are removed in Cut 1 step 10.
 */
import { z } from "zod";
import { Iso, OrgId, UserId, Uuid } from "./common.js";

export const ApprovalRequest = z.object({
  approvalId: Uuid,
  runId: Uuid,
  actionId: Uuid,
  orgId: OrgId,
  requestedBy: UserId,
  reason: z.string().optional(),
  expiresAt: Iso.optional(),
  createdAt: Iso,
});
export type ApprovalRequest = z.infer<typeof ApprovalRequest>;

export const ApprovalDecisionKind = z.enum(["approved", "denied", "expired"]);
export type ApprovalDecisionKind = z.infer<typeof ApprovalDecisionKind>;

export const ApprovalDecision = z.object({
  approvalId: Uuid,
  decidedBy: UserId,
  decision: ApprovalDecisionKind,
  comment: z.string().optional(),
  decidedAt: Iso,
});
export type ApprovalDecision = z.infer<typeof ApprovalDecision>;
