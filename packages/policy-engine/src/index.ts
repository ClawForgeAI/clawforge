export const PACKAGE_NAME = "@clawforgeai/policy-engine";

// Legacy OrgPolicy-shaped evaluator. Still used by plugin/ and agent-sdk/.
// Will be removed in Cut 1 step 10 once consumers move to the AGT-backed API.
export * from "./types.js";
export { evaluateToolCall } from "./evaluate.js";

// AGT-backed evaluator (the canonical path going forward).
export { ClawforgeEvaluator } from "./agt-evaluator.js";
export { convertPolicyToLegacyRules, convertRule, type AgtLegacyRule } from "./policy-loader.js";
