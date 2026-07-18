import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { load } from "js-yaml";
import { parsePolicyYaml, parsePolicyYamlOrThrow, PolicyParseError, serializePolicy } from "./yaml.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(HERE, "__fixtures__", name), "utf8");

describe("parsePolicyYaml — AGT fixtures", () => {
  it("parses agt-default.yaml (real AGT example)", () => {
    const result = parsePolicyYaml(fixture("agt-default.yaml"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.policy.name).toBe("default");
    expect(result.policy.rules.length).toBe(3);
    expect(result.policy.defaults?.action).toBe("allow");
  });

  it("parses agt-strict.yaml (real AGT example)", () => {
    const result = parsePolicyYaml(fixture("agt-strict.yaml"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.policy.name).toBe("strict");
    expect(result.policy.rules.length).toBe(6);
    expect(result.policy.defaults?.action).toBe("deny");
    const auditRule = result.policy.rules.find((r) => r.name === "audit_all_tool_calls");
    expect(auditRule?.action).toBe("audit");
  });

  it("parses minimal.yaml (defaults filled in)", () => {
    const result = parsePolicyYaml(fixture("minimal.yaml"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.policy.version).toBe("1.0");
    expect(result.policy.description).toBe("");
    expect(result.policy.rules).toEqual([]);
  });

  it("parses with-a2a.yaml including a2a_conversation_policy", () => {
    const result = parsePolicyYaml(fixture("with-a2a.yaml"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.policy.a2a_conversation_policy?.enabled).toBe(true);
    expect(result.policy.a2a_conversation_policy?.on_offensive_detected).toBe("quarantine");
    expect(result.policy.a2a_conversation_policy?.audit?.retention_days).toBe(365);
  });
});

describe("parsePolicyYaml — error paths", () => {
  it("rejects malformed YAML syntax", () => {
    // Unterminated double-quoted string — js-yaml hard-rejects this.
    const result = parsePolicyYaml('name: "unterminated string\nrules: []');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(PolicyParseError);
    expect(result.error.message).toContain("YAML parse error");
  });

  it("rejects an unknown action enum value", () => {
    const result = parsePolicyYaml(fixture("bad-action.yaml"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.zodError).toBeDefined();
  });

  it("rejects unknown top-level keys (strict mode)", () => {
    const result = parsePolicyYaml(fixture("extra-key.yaml"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.zodError).toBeDefined();
  });

  it("parsePolicyYamlOrThrow throws on invalid input", () => {
    expect(() => parsePolicyYamlOrThrow(fixture("bad-action.yaml"))).toThrow(PolicyParseError);
  });
});

describe("round-trip — parse → serialize → parse", () => {
  for (const name of ["agt-default.yaml", "agt-strict.yaml", "with-a2a.yaml"] as const) {
    it(`is lossless for ${name}`, () => {
      const first = parsePolicyYaml(fixture(name));
      expect(first.ok).toBe(true);
      if (!first.ok) return;

      const yaml = serializePolicy(first.policy);
      const second = parsePolicyYaml(yaml);
      expect(second.ok).toBe(true);
      if (!second.ok) return;

      expect(second.policy).toEqual(first.policy);
    });
  }
});

describe("structural compatibility with AGT raw YAML", () => {
  it("agt-default.yaml's raw js-yaml parse matches our parsed policy after defaults are stripped", () => {
    const raw = load(fixture("agt-default.yaml")) as Record<string, unknown>;
    const ours = parsePolicyYamlOrThrow(fixture("agt-default.yaml"));

    // Our parser fills in optional defaults; the raw YAML doesn't carry them.
    // Verify the structural fields the YAML does carry are equal.
    expect(ours.name).toBe(raw.name);
    expect(ours.version).toBe(raw.version);
    expect(ours.description).toBe(raw.description);
    expect(ours.rules.length).toBe((raw.rules as unknown[]).length);
  });
});
