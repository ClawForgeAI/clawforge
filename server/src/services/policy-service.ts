/**
 * Policy service for managing org policies.
 */

import { eq, and, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { policies, approvedSkills } from "../db/schema.js";
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

  async getEffectivePolicy(orgId: string, userId: string): Promise<EffectivePolicy | null> {
    const [policy] = await this.db.select().from(policies).where(eq(policies.orgId, orgId)).limit(1);

    if (!policy) {
      return null;
    }

    // Fetch approved skills (org-wide + user-specific), excluding revoked.
    const approved = await this.db
      .select()
      .from(approvedSkills)
      .where(and(eq(approvedSkills.orgId, orgId), isNull(approvedSkills.revokedAt)));

    const filteredApproved = approved.filter((s) => s.scope === "org" || s.approvedForUser === userId);

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

  async getOrgPolicy(orgId: string) {
    const [policy] = await this.db.select().from(policies).where(eq(policies.orgId, orgId)).limit(1);
    return policy ?? null;
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
        .where(eq(policies.orgId, orgId))
        .returning();
      return updated;
    }

    const [created] = await this.db
      .insert(policies)
      .values({
        orgId,
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
      .where(eq(policies.orgId, orgId))
      .returning();
    return updated;
  }
}
