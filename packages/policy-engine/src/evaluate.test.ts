import type { OrgPolicy } from "@clawforgeai/contracts";
import { describe, expect, it } from "vitest";
import { evaluateToolCall } from "./evaluate.js";
import type { PolicyEvaluationContext } from "./types.js";

function makePolicy(overrides?: Partial<OrgPolicy>): OrgPolicy {
  return {
    version: 1,
    tools: {},
    skills: { approved: [], requireApproval: false },
    killSwitch: { active: false },
    auditLevel: "metadata",
    ...overrides,
  };
}

function makeCtx(overrides?: Partial<PolicyEvaluationContext>): PolicyEvaluationContext {
  return {
    policy: null,
    killSwitchActive: false,
    ...overrides,
  };
}

describe("evaluateToolCall", () => {
  describe("kill switch", () => {
    it("denies any tool with the configured message", () => {
      const ctx = makeCtx({ killSwitchActive: true, killSwitchMessage: "Emergency shutdown" });
      const decision = evaluateToolCall(ctx, { rawToolName: "exec", params: {} });

      expect(decision).toMatchObject({
        outcome: "deny",
        reason: "kill_switch",
        blockMessage: "Emergency shutdown",
      });
    });

    it("kill switch overrides offlineOverride='allow'", () => {
      const ctx = makeCtx({
        killSwitchActive: true,
        killSwitchMessage: "Emergency shutdown",
        offlineOverride: "allow",
      });
      const decision = evaluateToolCall(ctx, { rawToolName: "exec", params: {} });

      expect(decision.outcome).toBe("deny");
      expect(decision.reason).toBe("kill_switch");
    });

    it("kill switch overrides offlineOverride='cached'", () => {
      const ctx = makeCtx({
        killSwitchActive: true,
        killSwitchMessage: "Emergency shutdown",
        offlineOverride: "cached",
        policy: makePolicy(),
      });
      const decision = evaluateToolCall(ctx, { rawToolName: "read", params: {} });

      expect(decision.outcome).toBe("deny");
      expect(decision.reason).toBe("kill_switch");
    });

    it("uses default message when killSwitchMessage is undefined", () => {
      const ctx = makeCtx({ killSwitchActive: true });
      const decision = evaluateToolCall(ctx, { rawToolName: "read", params: {} });

      expect(decision.outcome).toBe("deny");
      expect(decision.blockMessage).toContain("kill switch");
    });
  });

  describe("pendingInit safe mode", () => {
    it("denies tools when pendingInit is true and no policy cached", () => {
      const ctx = makeCtx({ pendingInit: true });
      const decision = evaluateToolCall(ctx, { rawToolName: "read", params: {} });

      expect(decision).toMatchObject({
        outcome: "deny",
        reason: "pending_init",
        blockMessage: "ClawForge: Plugin is still initializing. Please try again shortly.",
      });
    });

    it("evaluates normally when pendingInit is true but a policy is loaded", () => {
      const ctx = makeCtx({ pendingInit: true, policy: makePolicy() });
      const decision = evaluateToolCall(ctx, { rawToolName: "read", params: {} });

      expect(decision.outcome).toBe("allow");
      expect(decision.reason).toBe("allowed");
    });
  });

  describe("offline modes", () => {
    it("offlineOverride='allow' short-circuits to allow without consulting policy", () => {
      const ctx = makeCtx({
        offlineOverride: "allow",
        policy: makePolicy({ tools: { deny: ["exec"] } }),
      });
      const decision = evaluateToolCall(ctx, { rawToolName: "exec", params: {} });

      expect(decision).toMatchObject({ outcome: "allow", reason: "offline_allow_mode" });
    });

    it("offlineOverride='cached' tags decision with mode but still enforces", () => {
      const ctx = makeCtx({
        offlineOverride: "cached",
        policy: makePolicy({ tools: { deny: ["exec"] } }),
      });
      const decision = evaluateToolCall(ctx, { rawToolName: "exec", params: {} });

      expect(decision).toMatchObject({
        outcome: "deny",
        reason: "deny_list",
        mode: "offline_cached_mode",
      });
    });
  });

  describe("no policy", () => {
    it("allows by default when policy is null", () => {
      const decision = evaluateToolCall(makeCtx(), { rawToolName: "exec", params: {} });
      expect(decision).toMatchObject({ outcome: "allow", reason: "no_policy" });
    });
  });

  describe("deny list", () => {
    it("denies a tool listed in deny", () => {
      const ctx = makeCtx({ policy: makePolicy({ tools: { deny: ["exec", "write"] } }) });
      const decision = evaluateToolCall(ctx, { rawToolName: "exec", params: {} });

      expect(decision).toMatchObject({
        outcome: "deny",
        reason: "deny_list",
        blockMessage: 'ClawForge: Tool "exec" is blocked by organization policy',
      });
    });

    it("allows a tool not in deny", () => {
      const ctx = makeCtx({ policy: makePolicy({ tools: { deny: ["exec"] } }) });
      const decision = evaluateToolCall(ctx, { rawToolName: "read", params: {} });

      expect(decision.outcome).toBe("allow");
    });

    it("expands tool groups in deny list", () => {
      const ctx = makeCtx({ policy: makePolicy({ tools: { deny: ["group:runtime"] } }) });

      expect(evaluateToolCall(ctx, { rawToolName: "exec", params: {} }).outcome).toBe("deny");
      expect(evaluateToolCall(ctx, { rawToolName: "process", params: {} }).outcome).toBe("deny");
      expect(evaluateToolCall(ctx, { rawToolName: "read", params: {} }).outcome).toBe("allow");
    });

    it("normalizes alias bash -> exec", () => {
      const ctx = makeCtx({ policy: makePolicy({ tools: { deny: ["exec"] } }) });
      const decision = evaluateToolCall(ctx, { rawToolName: "bash", params: {} });

      expect(decision.outcome).toBe("deny");
      // raw name preserved in user-facing message
      expect(decision.blockMessage).toContain('"bash"');
    });
  });

  describe("allow list", () => {
    it("allows tools in the allow list", () => {
      const ctx = makeCtx({ policy: makePolicy({ tools: { allow: ["read", "write"] } }) });
      expect(evaluateToolCall(ctx, { rawToolName: "read", params: {} }).outcome).toBe("allow");
    });

    it("denies tools not in the allow list", () => {
      const ctx = makeCtx({ policy: makePolicy({ tools: { allow: ["read", "write"] } }) });
      const decision = evaluateToolCall(ctx, { rawToolName: "exec", params: {} });

      expect(decision).toMatchObject({
        outcome: "deny",
        reason: "not_in_allowlist",
        blockMessage: 'ClawForge: Tool "exec" is not in the organization\'s allowed tools list',
      });
    });

    it("expands tool groups in allow list", () => {
      const ctx = makeCtx({ policy: makePolicy({ tools: { allow: ["group:fs"] } }) });

      expect(evaluateToolCall(ctx, { rawToolName: "read", params: {} }).outcome).toBe("allow");
      expect(evaluateToolCall(ctx, { rawToolName: "write", params: {} }).outcome).toBe("allow");
      expect(evaluateToolCall(ctx, { rawToolName: "edit", params: {} }).outcome).toBe("allow");
      expect(evaluateToolCall(ctx, { rawToolName: "exec", params: {} }).outcome).toBe("deny");
    });
  });

  describe("deny overrides allow", () => {
    it("denies a tool that appears in both allow and deny", () => {
      const ctx = makeCtx({
        policy: makePolicy({ tools: { allow: ["read", "exec"], deny: ["exec"] } }),
      });
      const decision = evaluateToolCall(ctx, { rawToolName: "exec", params: {} });

      expect(decision.outcome).toBe("deny");
      expect(decision.reason).toBe("deny_list");
    });
  });

  describe("fs deny blocks exec filesystem commands", () => {
    const ctx = makeCtx({ policy: makePolicy({ tools: { deny: ["group:fs"] } }) });

    it("blocks ls when group:fs is denied", () => {
      const decision = evaluateToolCall(ctx, { rawToolName: "exec", params: { command: "ls ~/Documents" } });
      expect(decision).toMatchObject({ outcome: "deny", reason: "fs_deny_exec" });
      expect(decision.blockMessage).toContain("filesystem access is denied");
    });

    it("blocks cat when 'read' is explicitly denied", () => {
      const localCtx = makeCtx({ policy: makePolicy({ tools: { deny: ["read"] } }) });
      const decision = evaluateToolCall(localCtx, { rawToolName: "exec", params: { command: "cat /etc/passwd" } });
      expect(decision.outcome).toBe("deny");
      expect(decision.reason).toBe("fs_deny_exec");
    });

    it("blocks find when group:fs is denied", () => {
      const decision = evaluateToolCall(ctx, { rawToolName: "exec", params: { command: "find / -name '*.txt'" } });
      expect(decision.outcome).toBe("deny");
    });

    it("blocks piped fs commands", () => {
      const decision = evaluateToolCall(ctx, {
        rawToolName: "exec",
        params: { command: "echo hello | cat > /tmp/test" },
      });
      expect(decision.outcome).toBe("deny");
    });

    it("blocks cp and mv", () => {
      expect(evaluateToolCall(ctx, { rawToolName: "exec", params: { command: "cp a b" } }).outcome).toBe("deny");
      expect(evaluateToolCall(ctx, { rawToolName: "exec", params: { command: "mv a b" } }).outcome).toBe("deny");
    });

    it("allows echo (non-fs command) when group:fs is denied", () => {
      const decision = evaluateToolCall(ctx, { rawToolName: "exec", params: { command: "echo hello" } });
      expect(decision.outcome).toBe("allow");
    });

    it("allows exec when only unrelated tools are denied", () => {
      const otherCtx = makeCtx({ policy: makePolicy({ tools: { deny: ["web_search"] } }) });
      const decision = evaluateToolCall(otherCtx, { rawToolName: "exec", params: { command: "ls /" } });
      expect(decision.outcome).toBe("allow");
    });

    it("blocks sudo-prefixed fs commands", () => {
      const decision = evaluateToolCall(ctx, { rawToolName: "exec", params: { command: "sudo ls /root" } });
      expect(decision.outcome).toBe("deny");
    });

    it("exposes the offending command via blockedCommand", () => {
      const decision = evaluateToolCall(ctx, { rawToolName: "exec", params: { command: "ls /" } });
      expect(decision.blockedCommand).toBe("ls /");
    });
  });

  describe("DLP", () => {
    const dlpPolicy = makePolicy({
      dlpRules: [
        {
          name: "ssn",
          pattern: "\\b\\d{3}-\\d{2}-\\d{4}\\b",
          action: "block",
          severity: "high",
        },
      ],
    });

    it("denies when a block-action rule matches", () => {
      const ctx = makeCtx({ policy: dlpPolicy });
      const decision = evaluateToolCall(ctx, {
        rawToolName: "write",
        params: { content: "user ssn 123-45-6789" },
      });

      expect(decision).toMatchObject({
        outcome: "deny",
        reason: "dlp_block",
      });
      expect(decision.blockMessage).toContain("sensitive data detected");
      expect(decision.dlp?.violations).toHaveLength(1);
      expect(decision.dlp?.effectiveAction).toBe("block");
    });

    it("allows but reports violations for warn-only rules", () => {
      const warnPolicy = makePolicy({
        dlpRules: [
          {
            name: "phone",
            pattern: "\\b\\d{3}-\\d{3}-\\d{4}\\b",
            action: "warn",
            severity: "medium",
          },
        ],
      });
      const ctx = makeCtx({ policy: warnPolicy });
      const decision = evaluateToolCall(ctx, {
        rawToolName: "write",
        params: { content: "call 555-123-4567" },
      });

      expect(decision).toMatchObject({
        outcome: "allow",
        reason: "dlp_violation_allowed",
      });
      expect(decision.dlp?.violations).toHaveLength(1);
      expect(decision.dlp?.effectiveAction).toBe("warn");
    });

    it("DLP runs after allow-list passes, not before", () => {
      const restrictivePolicy = makePolicy({
        tools: { allow: ["read"] },
        dlpRules: [
          {
            name: "ssn",
            pattern: "\\d{3}-\\d{2}-\\d{4}",
            action: "block",
            severity: "high",
          },
        ],
      });
      const ctx = makeCtx({ policy: restrictivePolicy });
      // write is not in allow list — should fail with not_in_allowlist, not dlp_block.
      const decision = evaluateToolCall(ctx, {
        rawToolName: "write",
        params: { content: "123-45-6789" },
      });

      expect(decision.reason).toBe("not_in_allowlist");
    });
  });

  describe("offline_cached mode tagging", () => {
    it("tags `mode` on no_policy outcomes", () => {
      const ctx = makeCtx({ offlineOverride: "cached" });
      const decision = evaluateToolCall(ctx, { rawToolName: "exec", params: {} });

      expect(decision.outcome).toBe("allow");
      expect(decision.reason).toBe("no_policy");
      expect(decision.mode).toBe("offline_cached_mode");
    });

    it("tags `mode` on allowed outcomes", () => {
      const ctx = makeCtx({ offlineOverride: "cached", policy: makePolicy() });
      const decision = evaluateToolCall(ctx, { rawToolName: "read", params: {} });

      expect(decision.outcome).toBe("allow");
      expect(decision.mode).toBe("offline_cached_mode");
    });

    it("tags `mode` on fs_deny_exec outcomes", () => {
      const ctx = makeCtx({
        offlineOverride: "cached",
        policy: makePolicy({ tools: { deny: ["group:fs"] } }),
      });
      const decision = evaluateToolCall(ctx, { rawToolName: "exec", params: { command: "ls /" } });

      expect(decision.reason).toBe("fs_deny_exec");
      expect(decision.mode).toBe("offline_cached_mode");
    });

    it("tags `mode` on not_in_allowlist outcomes", () => {
      const ctx = makeCtx({
        offlineOverride: "cached",
        policy: makePolicy({ tools: { allow: ["read"] } }),
      });
      const decision = evaluateToolCall(ctx, { rawToolName: "exec", params: {} });

      expect(decision.reason).toBe("not_in_allowlist");
      expect(decision.mode).toBe("offline_cached_mode");
    });
  });
});
