import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TokenRefreshManager } from "./token-refresh-manager.js";
import type { SessionTokens } from "../types.js";

vi.mock("./token-store.js", () => ({
  saveSession: vi.fn(),
}));

vi.mock("../policy/org-policy-client.js", () => ({
  refreshSessionToken: vi.fn(),
}));

import { saveSession } from "./token-store.js";
import { refreshSessionToken } from "../policy/org-policy-client.js";

const mockedRefreshSessionToken = vi.mocked(refreshSessionToken);
const mockedSaveSession = vi.mocked(saveSession);

function makeSession(overrides?: Partial<SessionTokens>): SessionTokens {
  return {
    accessToken: "old-access-token",
    refreshToken: "old-refresh-token",
    expiresAt: Date.now() + 60 * 60_000, // 1 hour from now
    userId: "user-1",
    orgId: "org-123",
    ...overrides,
  };
}

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe("TokenRefreshManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedRefreshSessionToken.mockReset();
    mockedSaveSession.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not refresh when token is still fresh", async () => {
    const session = makeSession({ expiresAt: Date.now() + 30 * 60_000 }); // 30 min left
    const onTokenRefreshed = vi.fn();

    const mgr = new TokenRefreshManager({
      controlPlaneUrl: "https://clawforge.example.com",
      session,
      onTokenRefreshed,
      logger: makeLogger(),
    });

    mgr.start();
    await vi.advanceTimersByTimeAsync(60_000); // one check interval
    mgr.stop();

    expect(mockedRefreshSessionToken).not.toHaveBeenCalled();
    expect(onTokenRefreshed).not.toHaveBeenCalled();
  });

  it("refreshes when token is within the 5-minute buffer window", async () => {
    const session = makeSession({ expiresAt: Date.now() + 4 * 60_000 }); // 4 min left (< 5 min buffer)
    const onTokenRefreshed = vi.fn();

    const newSession: SessionTokens = {
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
      expiresAt: Date.now() + 60 * 60_000,
      userId: "user-1",
      orgId: "org-123",
    };

    mockedRefreshSessionToken.mockResolvedValueOnce(newSession);

    const mgr = new TokenRefreshManager({
      controlPlaneUrl: "https://clawforge.example.com",
      session,
      onTokenRefreshed,
      logger: makeLogger(),
    });

    mgr.start();
    await vi.advanceTimersByTimeAsync(60_000);
    mgr.stop();

    expect(mockedRefreshSessionToken).toHaveBeenCalledWith({
      controlPlaneUrl: "https://clawforge.example.com",
      refreshToken: "old-refresh-token",
    });
    expect(mockedSaveSession).toHaveBeenCalledWith(newSession);
    expect(onTokenRefreshed).toHaveBeenCalledWith(newSession);
  });

  it("retries up to 3 times with exponential backoff on failure", async () => {
    const session = makeSession({ expiresAt: Date.now() + 2 * 60_000 }); // 2 min left
    const logger = makeLogger();

    const newSession: SessionTokens = {
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
      expiresAt: Date.now() + 60 * 60_000,
      userId: "user-1",
      orgId: "org-123",
    };

    mockedRefreshSessionToken
      .mockRejectedValueOnce(new Error("network error"))
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce(newSession);

    const onTokenRefreshed = vi.fn();

    const mgr = new TokenRefreshManager({
      controlPlaneUrl: "https://clawforge.example.com",
      session,
      onTokenRefreshed,
      logger,
    });

    mgr.start();

    // First check at 60s triggers refresh, first attempt fails
    // Then waits 5s, second attempt fails, waits 10s, third attempt succeeds
    // Total: 60s (check) + 5s (retry1 delay) + 10s (retry2 delay) = 75s
    await vi.advanceTimersByTimeAsync(60_000 + 5_000 + 10_000 + 100);
    mgr.stop();

    expect(mockedRefreshSessionToken).toHaveBeenCalledTimes(3);
    expect(onTokenRefreshed).toHaveBeenCalledWith(newSession);
  });

  it("logs error after all retry attempts fail", async () => {
    const session = makeSession({ expiresAt: Date.now() + 2 * 60_000 });
    const logger = makeLogger();

    mockedRefreshSessionToken
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockRejectedValueOnce(new Error("fail 3"));

    const onTokenRefreshed = vi.fn();

    const mgr = new TokenRefreshManager({
      controlPlaneUrl: "https://clawforge.example.com",
      session,
      onTokenRefreshed,
      logger,
    });

    mgr.start();
    // 60s check + 5s retry1 + 10s retry2 = enough for all 3 attempts
    await vi.advanceTimersByTimeAsync(60_000 + 5_000 + 10_000 + 100);
    mgr.stop();

    expect(mockedRefreshSessionToken).toHaveBeenCalledTimes(3);
    expect(onTokenRefreshed).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("all 3 refresh attempts failed"),
    );
  });

  it("does nothing without controlPlaneUrl", async () => {
    const session = makeSession({ expiresAt: Date.now() + 2 * 60_000 });
    const logger = makeLogger();

    const mgr = new TokenRefreshManager({
      controlPlaneUrl: "",
      session,
      logger,
    });

    mgr.start();
    await vi.advanceTimersByTimeAsync(120_000);
    mgr.stop();

    expect(mockedRefreshSessionToken).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("skipping"),
    );
  });

  it("does nothing without refreshToken", async () => {
    const session = makeSession({ expiresAt: Date.now() + 2 * 60_000, refreshToken: undefined });
    const logger = makeLogger();

    const mgr = new TokenRefreshManager({
      controlPlaneUrl: "https://clawforge.example.com",
      session,
      logger,
    });

    mgr.start();
    await vi.advanceTimersByTimeAsync(120_000);
    mgr.stop();

    expect(mockedRefreshSessionToken).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("skipping"),
    );
  });

  it("does nothing when expiresAt is not set", async () => {
    const session = makeSession({ expiresAt: undefined });

    const mgr = new TokenRefreshManager({
      controlPlaneUrl: "https://clawforge.example.com",
      session,
      logger: makeLogger(),
    });

    mgr.start();
    await vi.advanceTimersByTimeAsync(120_000);
    mgr.stop();

    expect(mockedRefreshSessionToken).not.toHaveBeenCalled();
  });

  it("stop() clears the timer", () => {
    const session = makeSession();

    const mgr = new TokenRefreshManager({
      controlPlaneUrl: "https://clawforge.example.com",
      session,
      logger: makeLogger(),
    });

    mgr.start();
    mgr.stop();

    // Calling stop again should be safe
    mgr.stop();
  });
});
