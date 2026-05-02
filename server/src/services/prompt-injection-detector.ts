/**
 * Deterministic prompt-injection detector for audit events.
 */

import type { AuditEventInput } from "./audit-service.js";

type PromptInjectionSignal = {
  ruleId: string;
  pattern: RegExp;
  weight: number;
};

export type PromptInjectionAssessment = {
  detected: boolean;
  confidence: number;
  signals: string[];
};

const SUPPORTED_EVENT_TYPES = new Set(["tool_call", "tool_call_attempt", "tool_use", "prompt_submission"]);

const SIGNALS: PromptInjectionSignal[] = [
  {
    ruleId: "instruction_override",
    pattern: /ignore\s+(all\s+)?(previous|prior|earlier)\s+(instructions|rules|policy)/i,
    weight: 34,
  },
  {
    ruleId: "prompt_exfiltration",
    pattern: /(reveal|print|show|leak|expose).{0,24}(system\s+prompt|hidden\s+instructions|developer\s+message)/i,
    weight: 30,
  },
  {
    ruleId: "policy_bypass",
    pattern: /(bypass|disable|override).{0,24}(policy|safety|guardrails?|restrictions?)/i,
    weight: 32,
  },
  {
    ruleId: "role_escalation",
    pattern: /act\s+as\s+(system|developer|admin|root)/i,
    weight: 24,
  },
  {
    ruleId: "secret_exfiltration",
    pattern: /(secret|token|credential|api\s*key|password).{0,24}(export|send|exfiltrate|leak)/i,
    weight: 28,
  },
  {
    ruleId: "command_and_control",
    pattern: /(curl|wget|powershell|bash).{0,40}(https?:\/\/|ftp:\/\/)/i,
    weight: 18,
  },
];

function extractStrings(value: unknown, acc: string[] = []): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) acc.push(trimmed.slice(0, 1000));
    return acc;
  }

  if (Array.isArray(value)) {
    for (const item of value) extractStrings(item, acc);
    return acc;
  }

  if (value && typeof value === "object") {
    for (const val of Object.values(value)) extractStrings(val, acc);
  }

  return acc;
}

function isSupportedEventType(eventType: string): boolean {
  return SUPPORTED_EVENT_TYPES.has(eventType) || eventType.includes("tool") || eventType.includes("prompt");
}

export function assessPromptInjection(event: Pick<AuditEventInput, "eventType" | "metadata">): PromptInjectionAssessment {
  if (!isSupportedEventType(event.eventType)) {
    return { detected: false, confidence: 0, signals: [] };
  }

  const content = extractStrings(event.metadata).join("\n");
  if (!content) {
    return { detected: false, confidence: 0, signals: [] };
  }

  const matchedSignals = SIGNALS.filter((signal) => signal.pattern.test(content));
  if (matchedSignals.length === 0) {
    return { detected: false, confidence: 8, signals: [] };
  }

  const score = matchedSignals.reduce((sum, signal) => sum + signal.weight, 0);
  const confidence = Math.min(99, Math.max(20, score));

  return {
    detected: confidence >= 40,
    confidence,
    signals: matchedSignals.map((signal) => signal.ruleId),
  };
}
