import { PolicyEngine } from "@microsoft/agent-governance-sdk";
import type { Policy, PolicyDecisionResult } from "@clawforgeai/policy-schema";
import { convertPolicyToLegacyRules } from "./policy-loader.js";

/**
 * AGT-backed evaluator that wraps `@microsoft/agent-governance-sdk`'s
 * `PolicyEngine`. Owns a single long-lived engine instance; callers replace
 * the loaded policy via `loadPolicy(...)` and evaluate via `evaluate(...)`.
 *
 * For Cut 1, structured-condition policies (the AGT JSON Schema canonical
 * form) are translated to the AGT TS legacy rule form on load — see
 * `policy-loader.ts` for the mapping.
 */
export class ClawforgeEvaluator {
  private engine: PolicyEngine;
  private currentPolicyName?: string;

  constructor() {
    this.engine = new PolicyEngine();
  }

  /** Load (or replace) the active policy. Resets the underlying AGT engine. */
  loadPolicy(policy: Policy): void {
    this.engine = new PolicyEngine();
    const rules = convertPolicyToLegacyRules(policy).map((r) => ({
      name: r.name,
      condition: r.condition,
      effect: r.effect,
      priority: r.priority,
    }));
    const agtPolicy = {
      name: policy.name,
      apiVersion: "governance.toolkit/v1",
      scope: "global",
      rules,
      default_action: "allow" as const,
    };
    this.engine.loadPolicy(agtPolicy as never);
    this.currentPolicyName = policy.name;
  }

  /** Whether a policy has been loaded since construction. */
  hasPolicy(): boolean {
    return this.currentPolicyName !== undefined;
  }

  /** Name of the currently loaded policy, if any. */
  get policyName(): string | undefined {
    return this.currentPolicyName;
  }

  /** Evaluate a tool action against the loaded policy. */
  evaluate(action: string, context: Record<string, unknown> = {}): PolicyDecisionResult {
    const result = this.engine.evaluatePolicy("did:clawforge:local", {
      tool_name: action,
      action,
      ...context,
    });
    return {
      allowed: result.allowed,
      action: result.action,
      matchedRule: result.matchedRule,
      policyName: result.policyName ?? this.currentPolicyName,
      reason: result.reason,
      approvers: result.approvers,
      rateLimited: result.rateLimited,
      evaluatedAt: result.evaluatedAt,
      evaluationMs: result.evaluationMs,
    };
  }

  /** Escape hatch — the underlying AGT `PolicyEngine` instance. */
  get agt(): PolicyEngine {
    return this.engine;
  }
}
