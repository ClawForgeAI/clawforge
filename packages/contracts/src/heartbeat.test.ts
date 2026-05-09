import { describe, expect, it } from "vitest";
import { HeartbeatResponse, OfflineMode } from "./heartbeat.js";

describe("HeartbeatResponse", () => {
  it("accepts a minimal response", () => {
    const result = HeartbeatResponse.safeParse({
      policyVersion: 1,
      killSwitch: false,
      refreshPolicyNow: false,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a kill-switch-active response with message", () => {
    const result = HeartbeatResponse.safeParse({
      policyVersion: 7,
      killSwitch: true,
      killSwitchMessage: "Incident in progress",
      refreshPolicyNow: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing required field", () => {
    const result = HeartbeatResponse.safeParse({ policyVersion: 1, killSwitch: false });
    expect(result.success).toBe(false);
  });
});

describe("OfflineMode", () => {
  it("accepts the three legal modes", () => {
    expect(OfflineMode.safeParse("block").success).toBe(true);
    expect(OfflineMode.safeParse("allow").success).toBe(true);
    expect(OfflineMode.safeParse("cached").success).toBe(true);
  });

  it("rejects unknown modes", () => {
    expect(OfflineMode.safeParse("default").success).toBe(false);
  });
});
