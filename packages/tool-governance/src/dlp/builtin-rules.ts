/**
 * Built-in DLP rule library with common patterns for PCI, HIPAA, PII, and
 * secrets detection. Moved verbatim from `plugin/src/dlp/builtin-rules.ts`.
 *
 * Patterns are intentionally conservative to minimize false positives while
 * catching the most common sensitive-data formats.
 */

import type { DlpRule } from "@clawforgeai/contracts";

export const BUILTIN_DLP_RULES: readonly DlpRule[] = [
  // --- PCI-DSS ---
  {
    name: "credit_card_visa",
    pattern: "\\b4\\d{3}[- ]?\\d{4}[- ]?\\d{4}[- ]?\\d{4}\\b",
    action: "block",
    severity: "critical",
    category: "PCI",
    message: "Credit card number (Visa) detected in tool arguments",
  },
  {
    name: "credit_card_mastercard",
    pattern: "\\b5[1-5]\\d{2}[- ]?\\d{4}[- ]?\\d{4}[- ]?\\d{4}\\b",
    action: "block",
    severity: "critical",
    category: "PCI",
    message: "Credit card number (Mastercard) detected in tool arguments",
  },
  {
    name: "credit_card_amex",
    pattern: "\\b3[47]\\d{2}[- ]?\\d{6}[- ]?\\d{5}\\b",
    action: "block",
    severity: "critical",
    category: "PCI",
    message: "Credit card number (Amex) detected in tool arguments",
  },

  // --- HIPAA / PII ---
  {
    name: "ssn",
    pattern: "\\b\\d{3}-\\d{2}-\\d{4}\\b",
    action: "block",
    severity: "critical",
    category: "PII",
    message: "Social Security Number (SSN) detected in tool arguments",
  },
  {
    name: "email_address",
    pattern: "\\b[\\w.+-]+@[\\w-]+\\.[\\w.]+\\b",
    action: "log",
    severity: "info",
    category: "PII",
    message: "Email address detected in tool arguments",
  },
  {
    name: "phone_us",
    pattern: "\\b(?:\\+1[- ]?)?\\(?\\d{3}\\)?[- ]?\\d{3}[- ]?\\d{4}\\b",
    action: "warn",
    severity: "medium",
    category: "PII",
    message: "US phone number detected in tool arguments",
  },

  // --- Secrets ---
  {
    name: "aws_access_key",
    pattern: "\\bAKIA[0-9A-Z]{16}\\b",
    action: "block",
    severity: "critical",
    category: "Secrets",
    message: "AWS Access Key ID detected in tool arguments",
  },
  {
    name: "generic_api_key",
    pattern: "\\b(?:sk-|api[_-]?key[=: ]+|token[=: ]+)[a-zA-Z0-9_-]{20,}\\b",
    action: "warn",
    severity: "high",
    category: "Secrets",
    message: "Possible API key or token detected in tool arguments",
  },
  {
    name: "private_key_header",
    pattern: "-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----",
    action: "block",
    severity: "critical",
    category: "Secrets",
    message: "Private key detected in tool arguments",
  },
  {
    name: "github_pat",
    pattern: "\\bghp_[a-zA-Z0-9]{36}\\b",
    action: "block",
    severity: "critical",
    category: "Secrets",
    message: "GitHub Personal Access Token detected in tool arguments",
  },
  {
    name: "generic_secret",
    pattern: "(?i)(?:password|passwd|secret|credential)[\\s]*[=:][\\s]*['\"]?[^\\s'\"]{8,}",
    action: "warn",
    severity: "high",
    category: "Secrets",
    message: "Possible hardcoded secret detected in tool arguments",
  },
] as const;

/** Get a subset of built-in rules by category. */
export function getBuiltinRulesByCategory(category: string): DlpRule[] {
  return BUILTIN_DLP_RULES.filter((r) => r.category === category);
}

/** Get all distinct categories from built-in rules. */
export function getBuiltinCategories(): string[] {
  return [...new Set(BUILTIN_DLP_RULES.map((r) => r.category).filter(Boolean) as string[])];
}
