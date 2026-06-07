import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "./badge";

/**
 * Cut 2b step 2.17 — these assertions match the current DaisyUI-based Badge.
 * The component renders `badge badge-{variant}` rather than the old custom
 * Tailwind `bg-green-100` palette.
 */
describe("Badge", () => {
  it("renders children text", () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders as a span element", () => {
    render(<Badge>Status</Badge>);
    expect(screen.getByText("Status").tagName).toBe("SPAN");
  });

  it("applies the ghost variant when no variant is specified", () => {
    render(<Badge>Default</Badge>);
    const badge = screen.getByText("Default");
    expect(badge.className).toContain("badge-ghost");
  });

  it("applies the success variant", () => {
    render(<Badge variant="success">Allowed</Badge>);
    const badge = screen.getByText("Allowed");
    expect(badge.className).toContain("badge-success");
  });

  it("applies the danger variant via badge-error", () => {
    render(<Badge variant="danger">Blocked</Badge>);
    const badge = screen.getByText("Blocked");
    expect(badge.className).toContain("badge-error");
  });

  it("applies the warning variant", () => {
    render(<Badge variant="warning">Pending</Badge>);
    expect(screen.getByText("Pending").className).toContain("badge-warning");
  });

  it("applies the info variant", () => {
    render(<Badge variant="info">Info</Badge>);
    expect(screen.getByText("Info").className).toContain("badge-info");
  });

  it("always includes the base badge class and `font-medium`", () => {
    render(<Badge variant="success">Test</Badge>);
    const badge = screen.getByText("Test");
    expect(badge.className).toMatch(/\bbadge\b/);
    expect(badge.className).toContain("font-medium");
  });

  it("respects the size prop", () => {
    render(
      <Badge variant="success" size="xs">
        XS
      </Badge>,
    );
    expect(screen.getByText("XS").className).toContain("badge-xs");
  });
});
