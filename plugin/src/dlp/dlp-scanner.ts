/**
 * Re-export shim — the real DLP scanner lives in `@clawforgeai/tool-governance`
 * as of Phase 1 PR #4. This file exists so internal plugin imports and the
 * existing test suite keep resolving during the migration; PR #8 deletes
 * this file entirely.
 *
 * @deprecated Import from `@clawforgeai/tool-governance` instead.
 */
export { scanToolArguments, clearRegexCache } from "@clawforgeai/tool-governance";
