import { describe, expect, it } from "vitest";
import { RuntimeCapabilityError } from "./runtime-adapter.js";

describe("RuntimeCapabilityError", () => {
  it("includes the capability name in the message", () => {
    const err = new RuntimeCapabilityError("pre_tool_hook");
    expect(err.message).toContain("pre_tool_hook");
    expect(err.name).toBe("RuntimeCapabilityError");
  });

  it("includes the runtime kind in the message when provided", () => {
    const err = new RuntimeCapabilityError("artifacts", "claude-code");
    expect(err.message).toContain("claude-code");
    expect(err.message).toContain("artifacts");
  });
});
