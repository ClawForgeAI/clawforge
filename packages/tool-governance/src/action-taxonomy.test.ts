import { describe, expect, it } from "vitest";
import { classifyRisk, compareRiskTier, DEFAULT_ACTION_RISK, RISK_TIER_ORDER } from "./action-taxonomy.js";

describe("DEFAULT_ACTION_RISK", () => {
  it("classifies secret_access as critical", () => {
    expect(DEFAULT_ACTION_RISK.secret_access).toBe("critical");
  });

  it("classifies shell_exec and repo_push as high", () => {
    expect(DEFAULT_ACTION_RISK.shell_exec).toBe("high");
    expect(DEFAULT_ACTION_RISK.repo_push).toBe("high");
  });

  it("classifies file_read and tool_call as low", () => {
    expect(DEFAULT_ACTION_RISK.file_read).toBe("low");
    expect(DEFAULT_ACTION_RISK.tool_call).toBe("low");
  });
});

describe("classifyRisk", () => {
  it("returns the default tier when no override", () => {
    expect(classifyRisk("shell_exec")).toBe("high");
  });

  it("respects the override", () => {
    expect(classifyRisk("shell_exec", "critical")).toBe("critical");
  });
});

describe("compareRiskTier", () => {
  it("orders low < medium < high < critical", () => {
    expect(RISK_TIER_ORDER).toEqual(["low", "medium", "high", "critical"]);
    expect(compareRiskTier("low", "medium")).toBeLessThan(0);
    expect(compareRiskTier("critical", "high")).toBeGreaterThan(0);
    expect(compareRiskTier("medium", "medium")).toBe(0);
  });
});
