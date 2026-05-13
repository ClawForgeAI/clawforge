/**
 * DLP (Data Loss Prevention) scanner for tool call arguments.
 *
 * Moved from `plugin/src/dlp/dlp-scanner.ts`. Behavior is byte-identical:
 * regex cache, ReDoS protection via length cap + timeout warning, deepest
 * traversal of object/array params, one violation per rule per scan, most
 * restrictive `effectiveAction`.
 */

import type { DlpAction, DlpRule, DlpScanResult, DlpViolation } from "@clawforgeai/contracts";

/** Maximum length of a single field value to scan (prevents excessive processing). */
const MAX_FIELD_LENGTH = 100_000;

/** Maximum time (ms) to spend on a single regex match before logging a warning. */
const REGEX_TIMEOUT_MS = 50;

/** Context chars to include around a match in the redacted snippet. */
const REDACT_CONTEXT_CHARS = 20;

/** DLP action severity ordering for determining the effective action. */
const ACTION_PRIORITY: Record<DlpAction, number> = {
  block: 3,
  warn: 2,
  log: 1,
};

/**
 * Pre-compiled regex cache to avoid re-compiling on every scan.
 * Maps pattern string -> compiled RegExp (or null if invalid).
 */
const regexCache = new Map<string, RegExp | null>();

function safeCompileRegex(pattern: string): RegExp | null {
  const cached = regexCache.get(pattern);
  if (cached !== undefined) return cached;

  try {
    const regex = new RegExp(pattern, "g");
    regexCache.set(pattern, regex);
    return regex;
  } catch {
    regexCache.set(pattern, null);
    return null;
  }
}

function safeRegexTest(regex: RegExp, input: string): RegExpExecArray | null {
  const truncated = input.length > MAX_FIELD_LENGTH ? input.slice(0, MAX_FIELD_LENGTH) : input;
  regex.lastIndex = 0;

  const start = performance.now();
  const match = regex.exec(truncated);
  const elapsed = performance.now() - start;

  if (elapsed > REGEX_TIMEOUT_MS) {
    // eslint-disable-next-line no-console
    console.warn(`DLP: regex pattern took ${elapsed.toFixed(1)}ms (threshold: ${REGEX_TIMEOUT_MS}ms)`);
  }

  return match;
}

function redactMatch(input: string, matchIndex: number, matchLength: number): string {
  const start = Math.max(0, matchIndex - REDACT_CONTEXT_CHARS);
  const end = Math.min(input.length, matchIndex + matchLength + REDACT_CONTEXT_CHARS);

  const prefix = start > 0 ? "..." : "";
  const suffix = end < input.length ? "..." : "";

  const before = input.slice(start, matchIndex);
  const redacted = "*".repeat(Math.min(matchLength, 10));
  const after = input.slice(matchIndex + matchLength, end);

  return `${prefix}${before}${redacted}${after}${suffix}`;
}

function extractStringValues(params: Record<string, unknown>): string[] {
  const values: string[] = [];

  function walk(value: unknown): void {
    if (typeof value === "string") {
      values.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        walk(item);
      }
    } else if (value && typeof value === "object") {
      for (const v of Object.values(value)) {
        walk(v);
      }
    }
  }

  walk(params);
  return values;
}

/**
 * Scan tool call arguments against a set of DLP rules.
 *
 * @param rules — Active DLP rules from the org policy
 * @param params — Tool call arguments to scan
 * @returns Scan result with violations and effective action (most restrictive wins)
 */
export function scanToolArguments(rules: DlpRule[], params: Record<string, unknown>): DlpScanResult {
  const violations: DlpViolation[] = [];
  const activeRules = rules.filter((r) => r.enabled !== false);

  if (activeRules.length === 0) {
    return { violations: [], effectiveAction: null, scannedFields: 0 };
  }

  const stringValues = extractStringValues(params);

  for (const rule of activeRules) {
    const regex = safeCompileRegex(rule.pattern);
    if (!regex) continue;

    for (const value of stringValues) {
      const match = safeRegexTest(regex, value);
      if (match) {
        violations.push({
          ruleName: rule.name,
          action: rule.action,
          severity: rule.severity,
          redactedContext: redactMatch(value, match.index, match[0].length),
          category: rule.category,
        });
        break;
      }
    }
  }

  let effectiveAction: DlpAction | null = null;
  for (const v of violations) {
    if (!effectiveAction || ACTION_PRIORITY[v.action] > ACTION_PRIORITY[effectiveAction]) {
      effectiveAction = v.action;
    }
  }

  return {
    violations,
    effectiveAction,
    scannedFields: stringValues.length,
  };
}

/** Clear the compiled regex cache (useful for testing). */
export function clearRegexCache(): void {
  regexCache.clear();
}
