import type { Policy, PolicyRule } from "@clawforgeai/policy-schema";

/**
 * AGT TS's PolicyEngine consumes the *legacy flat* rule form (action-as-name-pattern
 * plus optional condition expressed as a string DSL or a flat key/value record).
 * The AGT JSON Schema canonical YAML uses the *structured* form
 * `{field, operator, value}`. This converter bridges the two so policies
 * authored in canonical YAML can be evaluated by AGT TS for free in Cut 1.
 *
 * Operators eq/ne/gt/lt/gte/lte/in/not_in map cleanly to AGT TS's DSL.
 * `matches`/`contains` have no direct DSL form and fall back to a permissive
 * wildcard — full structured-condition support arrives in a future revision.
 */
export interface AgtLegacyRule {
  name?: string;
  action?: string;
  condition?: string | Record<string, unknown>;
  effect?: "allow" | "deny";
  priority?: number;
}

function mapEffect(action: Policy["rules"][number]["action"]): "allow" | "deny" {
  switch (action) {
    case "allow":
    case "audit":
      // YAML `audit` is "pass through but record it". Audit emission happens
      // unconditionally for every governance decision, so this is equivalent
      // to `allow` at runtime today. A future revision may emit `log` to
      // preserve the distinction in the decision record.
      return "allow";
    case "deny":
    case "block":
      return "deny";
  }
}

function literal(value: unknown): string {
  if (typeof value === "string") return `'${value.replace(/'/g, "\\'")}'`;
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  return `'${String(value)}'`;
}

export function convertRule(rule: PolicyRule): AgtLegacyRule {
  const { field, operator, value } = rule.condition;
  const effect = mapEffect(rule.action);
  const base: AgtLegacyRule = { name: rule.name, effect, priority: rule.priority };

  const dslOps: Record<string, string> = {
    eq: "==",
    ne: "!=",
    gt: ">",
    lt: "<",
    gte: ">=",
    lte: "<=",
  };
  if (operator in dslOps) {
    return { ...base, condition: `${field} ${dslOps[operator]} ${literal(value)}` };
  }
  if (operator === "in" || operator === "not_in") {
    const list = Array.isArray(value) ? value.map(literal).join(", ") : "";
    const opWord = operator === "in" ? "in" : "not in";
    return { ...base, condition: `${field} ${opWord} [${list}]` };
  }

  // matches / contains — no DSL equivalent in AGT TS today.
  return { ...base };
}

export function convertPolicyToLegacyRules(policy: Policy): AgtLegacyRule[] {
  return policy.rules.map(convertRule);
}
