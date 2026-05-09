import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "./index.js";

describe("@clawforgeai/tool-governance", () => {
  it("exports PACKAGE_NAME", () => {
    expect(PACKAGE_NAME).toBe("@clawforgeai/tool-governance");
  });
});
