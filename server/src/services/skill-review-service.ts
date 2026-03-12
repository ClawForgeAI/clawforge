/**
 * Skill review service for managing skill submissions and approvals.
 */

import { eq, and, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { skillSubmissions, approvedSkills } from "../db/schema.js";
import type * as schema from "../db/schema.js";

export class SkillReviewService {
  constructor(private db: PostgresJsDatabase<typeof schema>) {}

  async submitSkill(params: {
    orgId: string;
    submittedBy: string;
    skillName: string;
    skillKey?: string;
    metadata?: Record<string, unknown>;
    manifestContent?: string;
    scanResults?: {
      scannedFiles: number;
      critical: number;
      warn: number;
      info: number;
      findings: Array<{
        ruleId: string;
        severity: string;
        file: string;
        line: number;
        message: string;
        evidence: string;
      }>;
    };
  }) {
    const [submission] = await this.db
      .insert(skillSubmissions)
      .values({
        orgId: params.orgId,
        submittedBy: params.submittedBy,
        skillName: params.skillName,
        skillKey: params.skillKey,
        metadata: params.metadata,
        manifestContent: params.manifestContent,
        scanResults: params.scanResults,
      })
      .returning();
    return submission;
  }

  async listPending(orgId: string) {
    return this.db
      .select()
      .from(skillSubmissions)
      .where(and(eq(skillSubmissions.orgId, orgId), eq(skillSubmissions.status, "pending")))
      .orderBy(skillSubmissions.createdAt);
  }

  async getSubmission(id: string) {
    const [submission] = await this.db.select().from(skillSubmissions).where(eq(skillSubmissions.id, id)).limit(1);
    return submission ?? null;
  }

  async reviewSubmission(params: {
    id: string;
    status: "approved-org" | "approved-self" | "rejected";
    reviewedBy: string;
    reviewNotes?: string;
    approvedForUser?: string;
  }) {
    const submission = await this.getSubmission(params.id);
    if (!submission) {
      return null;
    }

    // Update submission status.
    const [updated] = await this.db
      .update(skillSubmissions)
      .set({
        status: params.status,
        reviewedBy: params.reviewedBy,
        reviewNotes: params.reviewNotes,
        updatedAt: new Date(),
      })
      .where(eq(skillSubmissions.id, params.id))
      .returning();

    // If approved, add to approved_skills.
    if (params.status === "approved-org" || params.status === "approved-self") {
      await this.db.insert(approvedSkills).values({
        orgId: submission.orgId,
        skillName: submission.skillName,
        skillKey: submission.skillKey ?? submission.skillName,
        scope: params.status === "approved-org" ? "org" : "self",
        approvedForUser: params.status === "approved-self" ? (params.approvedForUser ?? submission.submittedBy) : null,
      });
    }

    return updated;
  }

  async listApproved(orgId: string) {
    return this.db
      .select()
      .from(approvedSkills)
      .where(and(eq(approvedSkills.orgId, orgId), isNull(approvedSkills.revokedAt)));
  }

  async revokeApproval(skillId: string, revokedBy: string) {
    const [revoked] = await this.db
      .update(approvedSkills)
      .set({ revokedAt: new Date(), revokedBy })
      .where(and(eq(approvedSkills.id, skillId), isNull(approvedSkills.revokedAt)))
      .returning();
    return revoked ?? null;
  }

  async listAllApproved(orgId: string) {
    // Including revoked, for full history
    return this.db
      .select()
      .from(approvedSkills)
      .where(eq(approvedSkills.orgId, orgId))
      .orderBy(approvedSkills.createdAt);
  }

  async resubmitForReview(submissionId: string) {
    // Reset a rejected/approved submission back to pending for re-review
    const [updated] = await this.db
      .update(skillSubmissions)
      .set({
        status: "pending",
        reviewedBy: null,
        reviewNotes: null,
        updatedAt: new Date(),
      })
      .where(eq(skillSubmissions.id, submissionId))
      .returning();
    return updated ?? null;
  }
}
