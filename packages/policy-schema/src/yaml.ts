import { dump, load, YAMLException } from "js-yaml";
import { z } from "zod";
import { Policy } from "./zod.js";

export class PolicyParseError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PolicyParseError";
  }
}

export interface ParseSuccess {
  ok: true;
  policy: Policy;
}
export interface ParseFailure {
  ok: false;
  error: PolicyParseError;
  zodError?: z.ZodError;
}
export type ParseResult = ParseSuccess | ParseFailure;

export function parsePolicyYaml(yaml: string): ParseResult {
  let raw: unknown;
  try {
    raw = load(yaml);
  } catch (err) {
    return {
      ok: false,
      error: new PolicyParseError(
        err instanceof YAMLException ? `YAML parse error: ${err.message}` : "YAML parse error",
        err,
      ),
    };
  }

  const result = Policy.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      error: new PolicyParseError("Policy schema validation failed", result.error),
      zodError: result.error,
    };
  }

  return { ok: true, policy: result.data };
}

export function parsePolicyYamlOrThrow(yaml: string): Policy {
  const result = parsePolicyYaml(yaml);
  if (!result.ok) throw result.error;
  return result.policy;
}

export function serializePolicy(policy: Policy): string {
  const validated = Policy.parse(policy);
  return dump(validated, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });
}
