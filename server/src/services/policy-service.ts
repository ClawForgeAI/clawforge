/**
 * Policy service for managing org policies.
 *
 * Supports multiple named policies per org (#23).
 */

import { eq, and, isNull, desc } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { policies, approvedSkills, policyAssignments } from "../db/schema.js";
import type * as schema from "../db/schema.js";

export type EffectivePolicy = {
  version: number;
  tools: {
    allow?: string[];
    deny?: string[];
    profile?: string;
  };
  skills: {
    approved: Array<{ name: string; key: string; scope: "org" | "self" }>;
    requireApproval: boolean;
  };
  killSwitch: {
    active: boolean;
    message?: string;
  };
  auditLevel: "full" | "metadata" | "off";
};

export class PolicyService {
  constructor(private db: PostgresJsDatabase<typeof schema>) {}

  /**
   * Resolve the effective policy for a user.
   *
   * Resolution order:
   *   1. Direct user-policy assignment
   *   2. Role-based assignment
   *   3. Default policy for the org
   *   4. Any policy for the org (last resort)
   */
  async getEffectivePolicy(orgId: string, userId: string, userRole?: string): Promise<EffectivePolicy | null> {
    // 1. Check for direct user-policy assignment
    const [userAssignment] = await this.db
      .select({ policyId: policyAssignments.policyId })
      .from(policyAssignments)
      .where(and(
        eq(policyAssignments.orgId, orgId),
        eq(policyAssignments.userId, userId),
      ))
      .orderBy(desc(policyAssignments.priority))
      .limit(1);

    let policy;

    if (userAssignment) {
      [policy] = await this.db
        .select()
        .from(policies)
        .where(eq(policies.id, userAssignment.policyId))
        .limit(1);
    }

    // 2. If no user assignment, check role-based assignment
    if (!policy && userRole) {
      const [roleAssignment] = await this.db
        .select({ policyId: policyAssignments.policyId })
        .from(policyAssignments)
        .where(and(
          eq(policyAssignments.orgId, orgId),
          eq(policyAssignments.role, userRole),
          isNull(policyAssignments.userId),
        ))
        .orderBy(desc(policyAssignments.priority))
        .limit(1);

      if (roleAssignment) {
        [policy] = await this.db
          .select()
          .from(policies)
          .where(eq(policies.id, roleAssignment.policyId))
          .limit(1);
      }
    }

    // 3. Fall back to default policy
    if (!policy) {
      [policy] = await this.db
        .select()
        .from(policies)
        .where(and(eq(policies.orgId, orgId), eq(policies.isDefault, true)))
        .limit(1);
    }

    // 4. Last resort: any policy for this org
    if (!policy) {
      [policy] = await this.db
        .select()
        .from(policies)
        .where(eq(policies.orgId, orgId))
        .limit(1);
    }

    if (!policy) {
      return null;
    }

    // Fetch approved skills (org-wide + user-specific), excluding revoked.
    const approved = await this.db
      .select()
      .from(approvedSkills)
      .where(and(eq(approvedSkills.orgId, orgId), isNull(approvedSkills.revokedAt)));

    const filteredApproved = approved.filter(
      (s) => s.scope === "org" || s.approvedForUser === userId,
    );

    return {
      version: policy.version,
      tools: policy.toolsConfig ?? {},
      skills: {
        approved: filteredApproved.map((s) => ({
          name: s.skillName,
          key: s.skillKey,
          scope: s.scope as "org" | "self",
        })),
        requireApproval: policy.skillsConfig?.requireApproval ?? false,
      },
      killSwitch: {
        active: policy.killSwitch,
        message: policy.killSwitchMessage ?? undefined,
      },
      auditLevel: policy.auditLevel as "full" | "metadata" | "off",
    };
  }

  /**
   * Get a specific policy by id, or the default/first policy for the org.
   */
  async getOrgPolicy(orgId: string, policyId?: string) {
    if (policyId) {
      const [policy] = await this.db
        .select()
        .from(policies)
        .where(and(eq(policies.id, policyId), eq(policies.orgId, orgId)))
        .limit(1);
      return policy ?? null;
    }
    // Return default or first policy
    const [defaultPolicy] = await this.db
      .select()
      .from(policies)
      .where(and(eq(policies.orgId, orgId), eq(policies.isDefault, true)))
      .limit(1);
    if (defaultPolicy) return defaultPolicy;

    const [anyPolicy] = await this.db
      .select()
      .from(policies)
      .where(eq(policies.orgId, orgId))
      .limit(1);
    return anyPolicy ?? null;
  }

  /**
   * List all policies for an org.
   */
  async listOrgPolicies(orgId: string) {
    return this.db
      .select()
      .from(policies)
      .where(eq(policies.orgId, orgId))
      .orderBy(policies.name);
  }

  /**
   * Create a new named policy.
   */
  async createPolicy(orgId: string, data: {
    name: string;
    isDefault?: boolean;
    toolsConfig?: { allow?: string[]; deny?: string[]; profile?: string };
    skillsConfig?: { requireApproval: boolean; approved: Array<{ name: string; key: string; scope: "org" | "self" }> };
    auditLevel?: "full" | "metadata" | "off";
  }) {
    // If setting as default, unset other defaults
    if (data.isDefault) {
      await this.db
        .update(policies)
        .set({ isDefault: false })
        .where(eq(policies.orgId, orgId));
    }

    const [created] = await this.db
      .insert(policies)
      .values({
        orgId,
        name: data.name,
        isDefault: data.isDefault ?? false,
        toolsConfig: data.toolsConfig,
        skillsConfig: data.skillsConfig,
        auditLevel: data.auditLevel ?? "metadata",
      })
      .returning();
    return created;
  }

  /**
   * Clone an existing policy with a new name.
   */
  async clonePolicy(orgId: string, sourcePolicyId: string, newName: string) {
    const source = await this.getOrgPolicy(orgId, sourcePolicyId);
    if (!source) throw new Error("Source policy not found");

    const [cloned] = await this.db
      .insert(policies)
      .values({
        orgId,
        name: newName,
        isDefault: false,
        toolsConfig: source.toolsConfig,
        skillsConfig: source.skillsConfig,
        auditLevel: source.auditLevel,
      })
      .returning();
    return cloned;
  }

  async upsertOrgPolicy(
    orgId: string,
    data: {
      toolsConfig?: { allow?: string[]; deny?: string[]; profile?: string };
      skillsConfig?: {
        requireApproval: boolean;
        approved: Array<{ name: string; key: string; scope: "org" | "self" }>;
      };
      auditLevel?: "full" | "metadata" | "off";
    },
  ) {
    const existing = await this.getOrgPolicy(orgId);

    if (existing) {
      const [updated] = await this.db
        .update(policies)
        .set({
          toolsConfig: data.toolsConfig ?? existing.toolsConfig,
          skillsConfig: data.skillsConfig ?? existing.skillsConfig,
          auditLevel: data.auditLevel ?? existing.auditLevel,
          version: existing.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(policies.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await this.db
      .insert(policies)
      .values({
        orgId,
        name: "Default Policy",
        isDefault: true,
        toolsConfig: data.toolsConfig,
        skillsConfig: data.skillsConfig,
        auditLevel: data.auditLevel ?? "metadata",
      })
      .returning();
    return created;
  }

  async setKillSwitch(orgId: string, active: boolean, message?: string) {
    const existing = await this.getOrgPolicy(orgId);
    if (!existing) {
      // Create a policy if none exists.
      const [created] = await this.db
        .insert(policies)
        .values({
          orgId,
          name: "Default Policy",
          isDefault: true,
          killSwitch: active,
          killSwitchMessage: message ?? null,
        })
        .returning();
      return created;
    }

    const [updated] = await this.db
      .update(policies)
      .set({
        killSwitch: active,
        killSwitchMessage: message ?? null,
        version: existing.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(policies.id, existing.id))
      .returning();
    return updated;
  }

  // ---------------------------------------------------------------------------
  // Policy Assignments (#23)
  // ---------------------------------------------------------------------------

  /**
   * Assign a policy to a specific user.
   */
  async assignPolicyToUser(orgId: string, policyId: string, userId: string) {
    // Remove existing user assignment for this org
    await this.db
      .delete(policyAssignments)
      .where(and(
        eq(policyAssignments.orgId, orgId),
        eq(policyAssignments.userId, userId),
      ));

    const [assignment] = await this.db
      .insert(policyAssignments)
      .values({ orgId, policyId, userId })
      .returning();
    return assignment;
  }

  /**
   * Assign a policy to a role.
   */
  async assignPolicyToRole(orgId: string, policyId: string, role: string) {
    // Remove existing role assignment for this org+role
    await this.db
      .delete(policyAssignments)
      .where(and(
        eq(policyAssignments.orgId, orgId),
        eq(policyAssignments.role, role),
        isNull(policyAssignments.userId),
      ));

    const [assignment] = await this.db
      .insert(policyAssignments)
      .values({ orgId, policyId, role })
      .returning();
    return assignment;
  }

  /**
   * Get all assignments for a policy.
   */
  async getPolicyAssignments(orgId: string, policyId: string) {
    return this.db
      .select()
      .from(policyAssignments)
      .where(and(
        eq(policyAssignments.orgId, orgId),
        eq(policyAssignments.policyId, policyId),
      ));
  }

  /**
   * Remove a policy assignment.
   */
  async removePolicyAssignment(assignmentId: string) {
    await this.db
      .delete(policyAssignments)
      .where(eq(policyAssignments.id, assignmentId));
  }
}
