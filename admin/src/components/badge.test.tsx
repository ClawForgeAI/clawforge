import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "./badge";

describe("Badge", () => {
  it("renders children text", () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders as a span element", () => {
    render(<Badge>Status</Badge>);
    const badge = screen.getByText("Status");
    expect(badge.tagName).toBe("SPAN");
  });

  it("applies default variant styles when no variant is specified", () => {
    render(<Badge>Default</Badge>);
    const badge = screen.getByText("Default");
    expect(badge.className).toContain("bg-secondary");
    expect(badge.className).toContain("text-secondary-foreground");
  });

  it("applies success variant styles", () => {
    render(<Badge variant="success">Allowed</Badge>);
    const badge = screen.getByText("Allowed");
    expect(badge.className).toContain("bg-green-100");
    expect(badge.className).toContain("text-green-800");
  });

  it("applies danger variant styles", () => {
    render(<Badge variant="danger">Blocked</Badge>);
    const badge = screen.getByText("Blocked");
    expect(badge.className).toContain("bg-red-100");
    expect(badge.className).toContain("text-red-800");
  });

  it("applies warning variant styles", () => {
    render(<Badge variant="warning">Pending</Badge>);
    const badge = screen.getByText("Pending");
    expect(badge.className).toContain("bg-amber-100");
    expect(badge.className).toContain("text-amber-800");
  });

  it("applies info variant styles", () => {
    render(<Badge variant="info">Info</Badge>);
    const badge = screen.getByText("Info");
    expect(badge.className).toContain("bg-blue-100");
    expect(badge.className).toContain("text-blue-800");
  });

  it("always includes base badge classes", () => {
    render(<Badge variant="success">Test</Badge>);
    const badge = screen.getByText("Test");
    expect(badge.className).toContain("inline-flex");
    expect(badge.className).toContain("rounded-full");
    expect(badge.className).toContain("text-xs");
    expect(badge.className).toContain("font-medium");
  });
});
