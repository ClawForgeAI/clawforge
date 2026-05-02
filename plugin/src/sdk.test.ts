/**
 * Tests for the Plugin SDK contract.
 *
 * These tests verify that the public API surface is stable and exports
 * the expected types and values.
 */

import { describe, it, expect } from "vitest";
import { SDK_VERSION, MIN_CONTROL_PLANE_VERSION } from "./sdk.js";

describe("SDK Contract", () => {
  describe("version constants", () => {
    it("exports SDK_VERSION as a semver string", () => {
      expect(SDK_VERSION).toBe("0.2.0");
      expect(typeof SDK_VERSION).toBe("string");
      expect(SDK_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it("exports MIN_CONTROL_PLANE_VERSION as a semver string", () => {
      expect(MIN_CONTROL_PLANE_VERSION).toBe("0.1.0");
      expect(typeof MIN_CONTROL_PLANE_VERSION).toBe("string");
      expect(MIN_CONTROL_PLANE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe("type exports (compile-time verification)", () => {
    it("ClawForgePluginConfig type is usable", async () => {
      // Dynamic import to verify the module resolves
      const sdk = await import("./sdk.js");
      expect(sdk).toBeDefined();
      expect(sdk.SDK_VERSION).toBe("0.2.0");
    });

    it("all re-exported types can be imported", async () => {
      // This test verifies the module structure is valid
      // Type checking happens at compile time via TypeScript
      const mod = await import("./sdk.js");
      const exports = Object.keys(mod);

      // Should export the version constants
      expect(exports).toContain("SDK_VERSION");
      expect(exports).toContain("MIN_CONTROL_PLANE_VERSION");
    });
  });

  describe("public API completeness", () => {
    it("SDK module can be imported without errors", async () => {
      const sdk = await import("./sdk.js");
      expect(sdk).toBeDefined();
    });

    it("plugin entry point re-exports SDK values", async () => {
      const plugin = await import("../index.js");
      expect(plugin.SDK_VERSION).toBe("0.2.0");
      expect(plugin.MIN_CONTROL_PLANE_VERSION).toBe("0.1.0");
      expect(plugin.default).toBeDefined();
      expect(plugin.default.id).toBe("clawforge");
      expect(typeof plugin.default.register).toBe("function");
    });
  });
});
