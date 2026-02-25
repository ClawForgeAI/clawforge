import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { KillSwitchManager } from "./kill-switch.js";
import { ConnectionStateManager } from "../connection/connection-state.js";
import type { ToolEnforcerState } from "../policy/tool-enforcer.js";
import type { ClawForgePluginConfig, SessionTokens } from "../types.js";

function makeConfig(overrides?: Partial<ClawForgePluginConfig>): ClawForgePluginConfig {
  return {
    controlPlaneUrl: "https://clawforge.example.com",
    orgId: "org-123",
    heartbeatIntervalMs: 100,
    heartbeatFailureThreshold: 3,
    ...overrides,
  };
}

function makeSession(): SessionTokens {
  return {
    accessToken: "test-token",
    userId: "user-1",
    orgId: "org-123",
  };
}

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe("KillSwitchManager", () => {
  let state: ToolEnforcerState;

  beforeEach(() => {
    state = {
      policy: null,
      killSwitchActive: false,
      killSwitchMessage: undefined,
    };
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("activates kill switch when heartbeat returns killSwitch=true", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        policyVersion: 1,
        killSwitch: true,
        killSwitchMessage: "Shutdown now",
        refreshPolicyNow: false,
      }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const mockLogger = makeLogger();
    const connState = new ConnectionStateManager({ failureThreshold: 3, logger: mockLogger });
    const mgr = new KillSwitchManager({
      config: makeConfig(),
      session: makeSession(),
      enforcerState: state,
      connectionStateManager: connState,
      logger: mockLogger,
    });

    mgr.start();
    await vi.advanceTimersByTimeAsync(150);
    mgr.stop();

    expect(state.killSwitchActive).toBe(true);
    expect(state.killSwitchMessage).toBe("Shutdown now");
  });

  it("deactivates kill switch when heartbeat returns killSwitch=false", async () => {
    state.killSwitchActive = true;
    state.killSwitchMessage = "Was active";

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        policyVersion: 1,
        killSwitch: false,
        refreshPolicyNow: false,
      }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const mockLogger = makeLogger();
    const connState = new ConnectionStateManager({ failureThreshold: 3, logger: mockLogger });
    const mgr = new KillSwitchManager({
      config: makeConfig(),
      session: makeSession(),
      enforcerState: state,
      connectionStateManager: connState,
      logger: mockLogger,
    });

    mgr.start();
    await vi.advanceTimersByTimeAsync(150);
    mgr.stop();

    expect(state.killSwitchActive).toBe(false);
    expect(state.killSwitchMessage).toBeUndefined();
  });

  it("calls onPolicyRefreshNeeded when heartbeat signals refresh", async () => {
    const onRefresh = vi.fn();
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        policyVersion: 2,
        killSwitch: false,
        refreshPolicyNow: true,
      }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const mockLogger = makeLogger();
    const connState = new ConnectionStateManager({ failureThreshold: 3, logger: mockLogger });
    const mgr = new KillSwitchManager({
      config: makeConfig(),
      session: makeSession(),
      enforcerState: state,
      connectionStateManager: connState,
      onPolicyRefreshNeeded: onRefresh,
      logger: mockLogger,
    });

    mgr.start();
    await vi.advanceTimersByTimeAsync(150);
    mgr.stop();

    expect(onRefresh).toHaveBeenCalled();
  });

  it("does nothing when no controlPlaneUrl configured", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const mgr = new KillSwitchManager({
      config: makeConfig({ controlPlaneUrl: undefined }),
      session: makeSession(),
      enforcerState: state,
    });

    mgr.start();
    await vi.advanceTimersByTimeAsync(150);
    mgr.stop();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  describe("connection state tracking", () => {
    it("records success in connection state manager on successful heartbeat", async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          policyVersion: 1,
          killSwitch: false,
          refreshPolicyNow: false,
        }),
      });
      vi.stubGlobal("fetch", fetchSpy);

      const mockLogger = makeLogger();
      const connState = new ConnectionStateManager({ failureThreshold: 3, logger: mockLogger });
      const mgr = new KillSwitchManager({
        config: makeConfig(),
        session: makeSession(),
        enforcerState: state,
        connectionStateManager: connState,
        logger: mockLogger,
      });

      mgr.start();
      await vi.advanceTimersByTimeAsync(150);
      mgr.stop();

      expect(connState.state).toBe("connected");
      expect(connState.lastSuccessfulHeartbeat).not.toBeNull();
    });

    it("records failure and transitions to degraded on failed heartbeat", async () => {
      const fetchSpy = vi.fn().mockRejectedValue(new Error("network error"));
      vi.stubGlobal("fetch", fetchSpy);

      const mockLogger = makeLogger();
      const connState = new ConnectionStateManager({ failureThreshold: 10, logger: mockLogger });
      const mgr = new KillSwitchManager({
        config: makeConfig({ heartbeatFailureThreshold: 10 }),
        session: makeSession(),
        enforcerState: state,
        connectionStateManager: connState,
        logger: mockLogger,
      });

      mgr.start();
      await vi.advanceTimersByTimeAsync(150);
      mgr.stop();

      expect(connState.state).toBe("degraded");
      expect(connState.consecutiveFailures).toBeGreaterThan(0);
    });
  });

  describe("offline mode: block", () => {
    it("activates kill switch when failure threshold is reached", async () => {
      const fetchSpy = vi.fn().mockRejectedValue(new Error("network error"));
      vi.stubGlobal("fetch", fetchSpy);

      const mockLogger = makeLogger();
      const connState = new ConnectionStateManager({ failureThreshold: 2, logger: mockLogger });
      const mgr = new KillSwitchManager({
        config: makeConfig({ heartbeatFailureThreshold: 2, offlineMode: "block" }),
        session: makeSession(),
        enforcerState: state,
        connectionStateManager: connState,
        logger: mockLogger,
      });

      mgr.start();
      // Advance enough for 2+ heartbeats
      await vi.advanceTimersByTimeAsync(250);
      mgr.stop();

      expect(state.killSwitchActive).toBe(true);
      expect(state.killSwitchMessage).toContain("offline mode: block");
    });
  });

  describe("offline mode: allow", () => {
    it("sets offlineOverride to allow when threshold is reached", async () => {
      const fetchSpy = vi.fn().mockRejectedValue(new Error("network error"));
      vi.stubGlobal("fetch", fetchSpy);

      const mockLogger = makeLogger();
      const connState = new ConnectionStateManager({ failureThreshold: 2, logger: mockLogger });
      const mgr = new KillSwitchManager({
        config: makeConfig({ heartbeatFailureThreshold: 2, offlineMode: "allow" }),
        session: makeSession(),
        enforcerState: state,
        connectionStateManager: connState,
        logger: mockLogger,
      });

      mgr.start();
      await vi.advanceTimersByTimeAsync(250);
      mgr.stop();

      expect(state.offlineOverride).toBe("allow");
    });
  });

  describe("offline mode: cached", () => {
    it("sets offlineOverride to cached when threshold is reached", async () => {
      const fetchSpy = vi.fn().mockRejectedValue(new Error("network error"));
      vi.stubGlobal("fetch", fetchSpy);

      const mockLogger = makeLogger();
      const connState = new ConnectionStateManager({ failureThreshold: 2, logger: mockLogger });
      const mgr = new KillSwitchManager({
        config: makeConfig({ heartbeatFailureThreshold: 2, offlineMode: "cached" }),
        session: makeSession(),
        enforcerState: state,
        connectionStateManager: connState,
        logger: mockLogger,
      });

      mgr.start();
      await vi.advanceTimersByTimeAsync(250);
      mgr.stop();

      expect(state.offlineOverride).toBe("cached");
    });
  });

  describe("reconnection", () => {
    it("clears offlineOverride when heartbeat succeeds after offline", async () => {
      let callCount = 0;
      const fetchSpy = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.reject(new Error("network error"));
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            policyVersion: 1,
            killSwitch: false,
            refreshPolicyNow: false,
          }),
        });
      });
      vi.stubGlobal("fetch", fetchSpy);

      const mockLogger = makeLogger();
      const connState = new ConnectionStateManager({ failureThreshold: 2, logger: mockLogger });
      const mgr = new KillSwitchManager({
        config: makeConfig({ heartbeatFailureThreshold: 2, offlineMode: "allow" }),
        session: makeSession(),
        enforcerState: state,
        connectionStateManager: connState,
        logger: mockLogger,
      });

      mgr.start();

      // First 2 heartbeats fail -> offline
      await vi.advanceTimersByTimeAsync(250);
      expect(state.offlineOverride).toBe("allow");

      // Third heartbeat succeeds -> connected
      await vi.advanceTimersByTimeAsync(150);
      mgr.stop();

      expect(state.offlineOverride).toBeUndefined();
      expect(connState.state).toBe("connected");
    });
  });
});
