import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConnectionStateManager, type ConnectionStateManagerParams } from "./connection-state.js";

function createManager(overrides: Partial<ConnectionStateManagerParams> = {}) {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const auditLogger = {
    enqueue: vi.fn(),
  } as unknown as ConnectionStateManagerParams["auditLogger"];

  const params: ConnectionStateManagerParams = {
    failureThreshold: 3,
    auditLogger,
    cachedPolicyFetchedAt: null,
    logger,
    ...overrides,
  };

  return {
    manager: new ConnectionStateManager(params),
    logger,
    auditLogger,
  };
}

describe("ConnectionStateManager", () => {
  describe("initial state", () => {
    it("starts in connected state", () => {
      const { manager } = createManager();
      expect(manager.state).toBe("connected");
    });

    it("has zero consecutive failures initially", () => {
      const { manager } = createManager();
      expect(manager.consecutiveFailures).toBe(0);
    });

    it("has null last successful heartbeat initially", () => {
      const { manager } = createManager();
      expect(manager.lastSuccessfulHeartbeat).toBeNull();
    });
  });

  describe("recordSuccess", () => {
    it("sets state to connected", () => {
      const { manager } = createManager();
      manager.recordFailure(); // go to degraded
      manager.recordSuccess();
      expect(manager.state).toBe("connected");
    });

    it("resets consecutive failures to zero", () => {
      const { manager } = createManager();
      manager.recordFailure();
      manager.recordFailure();
      manager.recordSuccess();
      expect(manager.consecutiveFailures).toBe(0);
    });

    it("updates lastSuccessfulHeartbeat", () => {
      const { manager } = createManager();
      const before = new Date();
      manager.recordSuccess();
      const after = new Date();
      expect(manager.lastSuccessfulHeartbeat).not.toBeNull();
      expect(manager.lastSuccessfulHeartbeat!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(manager.lastSuccessfulHeartbeat!.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it("emits audit event when transitioning from degraded to connected", () => {
      const { manager, auditLogger } = createManager();
      manager.recordFailure(); // degraded
      (auditLogger as any).enqueue.mockClear();
      manager.recordSuccess();
      expect((auditLogger as any).enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "kill_switch_activated",
          outcome: "success",
          metadata: expect.objectContaining({
            transitionType: "connection_state_change",
            from: "degraded",
            to: "connected",
          }),
        }),
      );
    });

    it("does not emit audit event when already connected", () => {
      const { manager, auditLogger } = createManager();
      (auditLogger as any).enqueue.mockClear();
      manager.recordSuccess();
      expect((auditLogger as any).enqueue).not.toHaveBeenCalled();
    });
  });

  describe("recordFailure", () => {
    it("transitions to degraded on first failure", () => {
      const { manager } = createManager();
      manager.recordFailure();
      expect(manager.state).toBe("degraded");
    });

    it("increments consecutive failures", () => {
      const { manager } = createManager();
      manager.recordFailure();
      expect(manager.consecutiveFailures).toBe(1);
      manager.recordFailure();
      expect(manager.consecutiveFailures).toBe(2);
    });

    it("transitions to offline when threshold is reached", () => {
      const { manager } = createManager({ failureThreshold: 3 });
      manager.recordFailure();
      manager.recordFailure();
      expect(manager.state).toBe("degraded");
      manager.recordFailure();
      expect(manager.state).toBe("offline");
    });

    it("stays offline after threshold is exceeded", () => {
      const { manager } = createManager({ failureThreshold: 2 });
      manager.recordFailure();
      manager.recordFailure();
      manager.recordFailure();
      expect(manager.state).toBe("offline");
    });

    it("emits audit event on state transitions", () => {
      const { manager, auditLogger } = createManager({ failureThreshold: 2 });
      (auditLogger as any).enqueue.mockClear();

      // connected -> degraded
      manager.recordFailure();
      expect((auditLogger as any).enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            from: "connected",
            to: "degraded",
          }),
        }),
      );

      (auditLogger as any).enqueue.mockClear();

      // degraded -> offline
      manager.recordFailure();
      expect((auditLogger as any).enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            from: "degraded",
            to: "offline",
          }),
        }),
      );
    });
  });

  describe("setUnauthenticated", () => {
    it("transitions to unauthenticated state", () => {
      const { manager } = createManager();
      manager.setUnauthenticated();
      expect(manager.state).toBe("unauthenticated");
    });

    it("emits audit event on transition", () => {
      const { manager, auditLogger } = createManager();
      (auditLogger as any).enqueue.mockClear();
      manager.setUnauthenticated();
      expect((auditLogger as any).enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            from: "connected",
            to: "unauthenticated",
          }),
        }),
      );
    });

    it("does not emit audit event if already unauthenticated", () => {
      const { manager, auditLogger } = createManager();
      manager.setUnauthenticated();
      (auditLogger as any).enqueue.mockClear();
      manager.setUnauthenticated();
      expect((auditLogger as any).enqueue).not.toHaveBeenCalled();
    });
  });

  describe("cachedPolicyAge", () => {
    it("returns null when no cached policy timestamp", () => {
      const { manager } = createManager({ cachedPolicyFetchedAt: null });
      expect(manager.cachedPolicyAge).toBeNull();
    });

    it("returns age in ms when timestamp is set", () => {
      const fetchedAt = Date.now() - 5000;
      const { manager } = createManager({ cachedPolicyFetchedAt: fetchedAt });
      const age = manager.cachedPolicyAge!;
      expect(age).toBeGreaterThanOrEqual(5000);
      expect(age).toBeLessThan(6000);
    });

    it("updates when updateCachedPolicyFetchedAt is called", () => {
      const { manager } = createManager({ cachedPolicyFetchedAt: null });
      expect(manager.cachedPolicyAge).toBeNull();
      manager.updateCachedPolicyFetchedAt(Date.now());
      expect(manager.cachedPolicyAge).not.toBeNull();
      expect(manager.cachedPolicyAge!).toBeLessThan(1000);
    });
  });

  describe("getStatus", () => {
    it("returns a snapshot of current status", () => {
      const { manager } = createManager({ cachedPolicyFetchedAt: Date.now() - 1000 });
      manager.recordSuccess();
      const status = manager.getStatus();
      expect(status.state).toBe("connected");
      expect(status.lastSuccessfulHeartbeat).not.toBeNull();
      expect(status.consecutiveFailures).toBe(0);
      expect(status.cachedPolicyAge).not.toBeNull();
    });
  });

  describe("full lifecycle", () => {
    it("transitions through connected -> degraded -> offline -> connected", () => {
      const { manager } = createManager({ failureThreshold: 2 });

      expect(manager.state).toBe("connected");

      manager.recordFailure();
      expect(manager.state).toBe("degraded");

      manager.recordFailure();
      expect(manager.state).toBe("offline");

      manager.recordSuccess();
      expect(manager.state).toBe("connected");
      expect(manager.consecutiveFailures).toBe(0);
    });
  });
});
