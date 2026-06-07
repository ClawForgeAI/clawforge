import { describe, it, expect } from "vitest";
import { buildSkillsEnterpriseConfig } from "./skill-filter.js";
import type { OrgPolicy } from "../types.js";

function makePolicy(overrides?: Partial<OrgPolicy>): OrgPolicy {
  return {
    version: 1,
    tools: {},
    skills: { approved: [], requireApproval: false },
    killSwitch: { active: false },
    auditLevel: "metadata",
    ...overrides,
  };
}

describe("buildSkillsEnterpriseConfig", () => {
  it("returns undefined when requireApproval is false", () => {
    const policy = makePolicy({ skills: { approved: [], requireApproval: false } });
    const result = buildSkillsEnterpriseConfig(policy);
    expect(result).toBeUndefined();
  });

  it("returns config when requireApproval is true", () => {
    const policy = makePolicy({
      skills: {
        requireApproval: true,
        approved: [
          { name: "github", key: "github", scope: "org" },
          { name: "spotify", key: "spotify-player", scope: "self" },
        ],
      },
    });
    const result = buildSkillsEnterpriseConfig(policy);
    expect(result).toEqual({
      requireApproval: true,
      approvedSkills: ["github", "spotify-player"],
    });
  });

  it("uses name as fallback when key is empty", () => {
    const policy = makePolicy({
      skills: {
        requireApproval: true,
        approved: [{ name: "my-tool", key: "", scope: "org" }],
      },
    });
    const result = buildSkillsEnterpriseConfig(policy);
    expect(result?.approvedSkills).toEqual(["my-tool"]);
  });

  it("returns empty approvedSkills array when no skills approved", () => {
    const policy = makePolicy({
      skills: { requireApproval: true, approved: [] },
    });
    const result = buildSkillsEnterpriseConfig(policy);
    expect(result).toEqual({
      requireApproval: true,
      approvedSkills: [],
    });
  });
});
