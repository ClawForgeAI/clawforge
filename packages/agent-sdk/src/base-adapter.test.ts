import type { OrgPolicy } from "@clawforgeai/contracts";
import { describe, expect, it, vi } from "vitest";
import { BaseRuntimeAdapter } from "./base-adapter.js";
import type { BaseAdapterOptions } from "./base-adapter.js";

class TestAdapter extends BaseRuntimeAdapter {
  // Expose protected hooks for verification in tests.
  getPolicy() {
    return this.policy;
  }
  isPendingInit() {
    return this.pendingInit;
  }
}

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

function makeAdapter(overrides?: Partial<BaseAdapterOptions>): {
  adapter: TestAdapter;
  transport: ReturnType<typeof vi.fn>;
} {
  const transport = vi.fn(async () => true);
  const adapter = new TestAdapter({
    identity: { userId: "u1", orgId: "o1" },
    auditTransport: transport,
    auditLevel: "full",
    ...overrides,
  });
  return { adapter, transport };
}

describe("BaseRuntimeAdapter", () => {
  describe("state management", () => {
    it("starts in pending-init with no policy", () => {
      const { adapter } = makeAdapter();
      expect(adapter.getPolicy()).toBeNull();
      expect(adapter.isPendingInit()).toBe(true);
    });

    it("setPolicy clears pending-init and stores the policy", () => {
      const { adapter } = makeAdapter();
      const policy = makePolicy();
      adapter.setPolicy(policy);
      expect(adapter.getPolicy()).toBe(policy);
      expect(adapter.isPendingInit()).toBe(false);
    });

    it("markInitialized clears pending-init without setting a policy", () => {
      const { adapter } = makeAdapter();
      adapter.markInitialized();
      expect(adapter.isPendingInit()).toBe(false);
      expect(adapter.getPolicy()).toBeNull();
    });
  });

  describe("evaluateTool", () => {
    it("blocks during pending-init when no policy is loaded", () => {
      const { adapter } = makeAdapter();
      const decision = adapter.evaluateTool({ rawToolName: "read", params: {} });
      expect(decision.outcome).toBe("deny");
      expect(decision.reason).toBe("pending_init");
    });

    it("applies kill switch state set via setKillSwitch", () => {
      const { adapter } = makeAdapter();
      adapter.markInitialized();
      adapter.setKillSwitch(true, "shutdown");
      const decision = adapter.evaluateTool({ rawToolName: "read", params: {} });
      expect(decision).toMatchObject({ outcome: "deny", reason: "kill_switch", blockMessage: "shutdown" });
    });

    it("applies the latest policy after setPolicy", () => {
      const { adapter } = makeAdapter();
      adapter.setPolicy(makePolicy({ tools: { deny: ["exec"] } }));
      const decision = adapter.evaluateTool({ rawToolName: "exec", params: {} });
      expect(decision.outcome).toBe("deny");
      expect(decision.reason).toBe("deny_list");
    });

    it("applies offline override set via setOfflineOverride", () => {
      const { adapter } = makeAdapter();
      adapter.setPolicy(makePolicy({ tools: { deny: ["exec"] } }));
      adapter.setOfflineOverride("allow");
      const decision = adapter.evaluateTool({ rawToolName: "exec", params: {} });
      expect(decision.outcome).toBe("allow");
      expect(decision.reason).toBe("offline_allow_mode");
    });
  });

  describe("audit", () => {
    it("emitEvent buffers events that flush ships to the transport", async () => {
      const { adapter, transport } = makeAdapter();
      adapter.emitEvent({ eventType: "tool_call_attempt", outcome: "allowed", toolName: "read" });
      adapter.emitEvent({ eventType: "tool_call_attempt", outcome: "blocked", toolName: "exec" });
      await adapter.flushAudit();
      expect(transport).toHaveBeenCalledTimes(1);
      expect(transport.mock.calls[0]?.[0]).toHaveLength(2);
    });
  });
});
