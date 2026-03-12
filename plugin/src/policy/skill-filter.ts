/**
 * Skill filtering based on org policy.
 * Populates skills.enterprise config from the org policy.
 */

import type { OrgPolicy } from "../types.js";

/**
 * Build the skills.enterprise config section from org policy.
 * This is merged into the OpenClaw config on startup so that
 * shouldIncludeSkill() in src/agents/skills/config.ts picks up
 * the org-approved skill list.
 */
export function buildSkillsEnterpriseConfig(policy: OrgPolicy):
  | {
      requireApproval: boolean;
      approvedSkills: string[];
    }
  | undefined {
  if (!policy.skills.requireApproval) {
    return undefined;
  }

  const approvedSkills = policy.skills.approved.map((s) => s.key || s.name);

  return {
    requireApproval: true,
    approvedSkills,
  };
}
