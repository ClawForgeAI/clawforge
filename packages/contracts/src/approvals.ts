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
