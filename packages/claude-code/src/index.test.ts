import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "./index.js";

describe("@clawforgeai/claude-code", () => {
  it("exports PACKAGE_NAME", () => {
    expect(PACKAGE_NAME).toBe("@clawforgeai/claude-code");
  });
});
