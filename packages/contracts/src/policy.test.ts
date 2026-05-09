import { describe, expect, it } from "vitest";
import { ApprovedSkill, DlpRule, EffectivePolicy, OrgPolicy } from "./policy.js";

const FIXTURE_POLICY = {
  version: 7,
  tools: {
    allow: ["read", "write"],
    deny: ["exec", "group:web"],
    profile: "standard",
  },
  skills: {
    approved: [
      { name: "web-search", key: "web-search@1.2.3", scope: "org" },
      { name: "scratch", key: "scratch@0.1.0", scope: "self" },
    ],
    requireApproval: true,
  },
  killSwitch: { active: false },
  auditLevel: "metadata",
  dlpRules: [
    {
      name: "block-aws-keys",
      pattern: "AKIA[0-9A-Z]{16}",
      action: "block",
      severity: "critical",
      category: "Secrets",
      enabled: true,
      message: "AWS access key detected",
    },
  ],
} as const;

describe("OrgPolicy", () => {
  it("accepts a fully populated effective policy fixture", () => {
    const result = OrgPolicy.safeParse(FIXTURE_POLICY);
    expect(result.success).toBe(true);
  });

  it("accepts a policy with active kill switch and message", () => {
    const result = OrgPolicy.safeParse({
      ...FIXTURE_POLICY,
      killSwitch: { active: true, message: "Maintenance window" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a policy with no DLP rules and no tool lists", () => {
    const result = OrgPolicy.safeParse({
      version: 1,
      tools: {},
      skills: { approved: [], requireApproval: false },
      killSwitch: { active: false },
      auditLevel: "off",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid auditLevel", () => {
    const result = OrgPolicy.safeParse({ ...FIXTURE_POLICY, auditLevel: "verbose" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing version", () => {
    const { version: _v, ...rest } = FIXTURE_POLICY;
    void _v;
    const result = OrgPolicy.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("EffectivePolicy is a server-side alias for OrgPolicy", () => {
    expect(EffectivePolicy).toBe(OrgPolicy);
  });
});

describe("ApprovedSkill", () => {
  it("accepts both org and self scopes", () => {
    expect(ApprovedSkill.safeParse({ name: "a", key: "a@1", scope: "org" }).success).toBe(true);
    expect(ApprovedSkill.safeParse({ name: "b", key: "b@1", scope: "self" }).success).toBe(true);
  });

  it("rejects an unknown scope", () => {
    const result = ApprovedSkill.safeParse({ name: "a", key: "a@1", scope: "fleet" });
    expect(result.success).toBe(false);
  });
});

describe("DlpRule", () => {
  it("accepts a minimal rule (no optional fields)", () => {
    const result = DlpRule.safeParse({
      name: "min",
      pattern: "secret",
      action: "warn",
      severity: "info",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid action", () => {
    const result = DlpRule.safeParse({
      name: "x",
      pattern: ".",
      action: "kill",
      severity: "critical",
    });
    expect(result.success).toBe(false);
  });
});
