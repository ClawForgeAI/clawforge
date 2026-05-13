import { describe, expect, it } from "vitest";
import { BUILTIN_DLP_RULES, getBuiltinCategories, getBuiltinRulesByCategory } from "./builtin-rules.js";

describe("BUILTIN_DLP_RULES", () => {
  it("covers PCI, PII, and Secrets categories", () => {
    const categories = new Set(BUILTIN_DLP_RULES.map((r) => r.category));
    expect(categories.has("PCI")).toBe(true);
    expect(categories.has("PII")).toBe(true);
    expect(categories.has("Secrets")).toBe(true);
  });

  it("getBuiltinRulesByCategory(PCI) returns 3 credit-card rules", () => {
    const pci = getBuiltinRulesByCategory("PCI");
    expect(pci.length).toBeGreaterThanOrEqual(3);
    expect(pci.every((r) => r.category === "PCI")).toBe(true);
  });

  it("getBuiltinCategories returns the distinct category list", () => {
    const cats = getBuiltinCategories();
    expect(cats).toContain("PCI");
    expect(cats).toContain("PII");
    expect(cats).toContain("Secrets");
    expect(new Set(cats).size).toBe(cats.length);
  });
});
