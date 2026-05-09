import { describe, expect, it } from "vitest";
import { ClawForgePluginConfig } from "./plugin-config.js";

describe("ClawForgePluginConfig", () => {
  it("accepts an empty config", () => {
    const result = ClawForgePluginConfig.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts the full plugin manifest shape", () => {
    const result = ClawForgePluginConfig.safeParse({
      controlPlaneUrl: "http://localhost:4100",
      orgId: "o1",
      sso: { issuerUrl: "https://idp", clientId: "abc" },
      policyCacheTtlMs: 3_600_000,
      heartbeatIntervalMs: 30_000,
      heartbeatFailureThreshold: 10,
      auditBatchSize: 100,
      auditFlushIntervalMs: 30_000,
      offlineMode: "block",
      maxAuditBufferSize: 10_000,
      sseEnabled: true,
    });
    expect(result.success).toBe(true);
  });

  it("tolerates unknown fields (passthrough)", () => {
    const result = ClawForgePluginConfig.safeParse({
      controlPlaneUrl: "http://localhost:4100",
      futureFlag: { hello: 1 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).futureFlag).toEqual({ hello: 1 });
    }
  });

  it("rejects an invalid offlineMode", () => {
    const result = ClawForgePluginConfig.safeParse({ offlineMode: "default" });
    expect(result.success).toBe(false);
  });
});
