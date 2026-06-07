import { describe, it, expect, beforeEach } from "vitest";
import type { DlpRule } from "@clawforgeai/contracts";
import { clearRegexCache, scanToolArguments } from "./scanner.js";

beforeEach(() => {
  clearRegexCache();
});

const creditCardRule: DlpRule = {
  name: "credit_card",
  pattern: "\\b4\\d{3}[- ]?\\d{4}[- ]?\\d{4}[- ]?\\d{4}\\b",
  action: "block",
  severity: "critical",
  category: "PCI",
};

const ssnRule: DlpRule = {
  name: "ssn",
  pattern: "\\b\\d{3}-\\d{2}-\\d{4}\\b",
  action: "block",
  severity: "critical",
  category: "PII",
};

const emailRule: DlpRule = {
  name: "email",
  pattern: "\\b[\\w.+-]+@[\\w-]+\\.[\\w.]+\\b",
  action: "log",
  severity: "info",
  category: "PII",
};

const apiKeyRule: DlpRule = {
  name: "api_key",
  pattern: "\\bsk-[a-zA-Z0-9]{20,}\\b",
  action: "warn",
  severity: "high",
  category: "Secrets",
};

const awsKeyRule: DlpRule = {
  name: "aws_key",
  pattern: "\\bAKIA[0-9A-Z]{16}\\b",
  action: "block",
  severity: "critical",
  category: "Secrets",
};

const allRules: DlpRule[] = [creditCardRule, ssnRule, emailRule, apiKeyRule, awsKeyRule];

describe("DLP Scanner", () => {
  describe("scanToolArguments", () => {
    it("returns no violations for clean input", () => {
      const result = scanToolArguments(allRules, {
        command: "echo hello world",
        path: "/tmp/output.txt",
      });
      expect(result.violations).toHaveLength(0);
      expect(result.effectiveAction).toBeNull();
      expect(result.scannedFields).toBe(2);
    });

    it("detects credit card numbers", () => {
      const result = scanToolArguments([creditCardRule], {
        content: "Please process card 4111-1111-1111-1111 for the order",
      });
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].ruleName).toBe("credit_card");
      expect(result.violations[0].action).toBe("block");
      expect(result.violations[0].severity).toBe("critical");
      expect(result.effectiveAction).toBe("block");
    });

    it("detects credit card numbers without separators", () => {
      const result = scanToolArguments([creditCardRule], {
        url: "https://api.example.com/charge?card=4111111111111111",
      });
      expect(result.violations).toHaveLength(1);
    });

    it("detects SSNs", () => {
      const result = scanToolArguments([ssnRule], { content: "User SSN: 123-45-6789" });
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].ruleName).toBe("ssn");
      expect(result.effectiveAction).toBe("block");
    });

    it("detects email addresses", () => {
      const result = scanToolArguments([emailRule], { body: "Contact john@example.com for details" });
      expect(result.violations).toHaveLength(1);
      expect(result.effectiveAction).toBe("log");
    });

    it("detects API keys", () => {
      const result = scanToolArguments([apiKeyRule], {
        command: "curl -H 'Authorization: Bearer sk-abcdefghijklmnopqrstuvwxyz1234' https://api.example.com",
      });
      expect(result.violations).toHaveLength(1);
      expect(result.effectiveAction).toBe("warn");
    });

    it("detects AWS access keys", () => {
      const result = scanToolArguments([awsKeyRule], { content: "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE" });
      expect(result.violations).toHaveLength(1);
    });

    it("detects multiple violations across rules", () => {
      const result = scanToolArguments(allRules, { content: "Card: 4111-1111-1111-1111, SSN: 123-45-6789" });
      const ruleNames = result.violations.map((v) => v.ruleName);
      expect(ruleNames).toContain("credit_card");
      expect(ruleNames).toContain("ssn");
    });

    it("returns the most restrictive action as effectiveAction (block > warn > log)", () => {
      const result = scanToolArguments([emailRule, apiKeyRule, creditCardRule], {
        content: "john@example.com sent card 4111111111111111 with sk-abcdefghijklmnopqrstuvwxyz1234",
      });
      expect(result.effectiveAction).toBe("block");
    });

    it("skips disabled rules", () => {
      const disabled: DlpRule = { ...creditCardRule, enabled: false };
      const result = scanToolArguments([disabled], { content: "Card: 4111-1111-1111-1111" });
      expect(result.violations).toHaveLength(0);
    });

    it("handles empty rules and empty params", () => {
      expect(scanToolArguments([], { content: "4111-1111-1111-1111" }).violations).toHaveLength(0);
      expect(scanToolArguments(allRules, {}).scannedFields).toBe(0);
    });

    it("scans nested object values", () => {
      const result = scanToolArguments([ssnRule], { data: { user: { info: { ssn: "123-45-6789" } } } });
      expect(result.violations).toHaveLength(1);
    });

    it("scans array values", () => {
      const result = scanToolArguments([ssnRule], { records: ["Alice: 123-45-6789", "Bob: 987-65-4321"] });
      expect(result.violations).toHaveLength(1);
    });

    it("redacts sensitive data in context", () => {
      const result = scanToolArguments([ssnRule], { content: "User SSN is 123-45-6789 on file" });
      const ctx = result.violations[0].redactedContext;
      expect(ctx).not.toContain("123-45-6789");
      expect(ctx).toContain("***");
    });

    it("handles invalid regex patterns gracefully", () => {
      const bad: DlpRule = { name: "bad", pattern: "[invalid", action: "block", severity: "critical" };
      expect(scanToolArguments([bad], { content: "some text" }).violations).toHaveLength(0);
    });

    it("handles non-string values in params", () => {
      const result = scanToolArguments([ssnRule], {
        count: 42,
        flag: true,
        nothing: null,
        content: "SSN: 123-45-6789",
      });
      expect(result.violations).toHaveLength(1);
    });

    it("includes category in violations", () => {
      const result = scanToolArguments([creditCardRule], { content: "4111111111111111" });
      expect(result.violations[0].category).toBe("PCI");
    });

    it("reports scannedFields count correctly", () => {
      const result = scanToolArguments(allRules, {
        a: "hello",
        b: "world",
        c: { d: "nested" },
        e: ["arr1", "arr2"],
      });
      expect(result.scannedFields).toBe(5);
    });
  });
});
