/**
 * Re-export shim — the real built-in rule library lives in
 * `@clawforgeai/tool-governance` as of Phase 1 PR #4. PR #8 deletes this file.
 *
 * @deprecated Import from `@clawforgeai/tool-governance` instead.
 */
export { BUILTIN_DLP_RULES, getBuiltinCategories, getBuiltinRulesByCategory } from "@clawforgeai/tool-governance";
