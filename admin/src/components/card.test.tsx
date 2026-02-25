import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card, CardTitle, StatCard } from "./card";

describe("Card", () => {
  it("renders children", () => {
    render(<Card><p>Card content</p></Card>);
    expect(screen.getByText("Card content")).toBeInTheDocument();
  });

  it("applies base card styles", () => {
    render(<Card><span>test</span></Card>);
    const card = screen.getByText("test").parentElement!;
    expect(card.className).toContain("bg-card");
    expect(card.className).toContain("rounded-lg");
    expect(card.className).toContain("border");
    expect(card.className).toContain("shadow-sm");
  });

  it("applies additional className", () => {
    render(<Card className="mt-4"><span>test</span></Card>);
    const card = screen.getByText("test").parentElement!;
    expect(card.className).toContain("mt-4");
  });

  it("renders without extra className by default", () => {
    const { container } = render(<Card>content</Card>);
    const card = container.firstChild as HTMLElement;
    // Should still have the base classes
    expect(card.className).toContain("bg-card");
  });
});

describe("CardTitle", () => {
  it("renders children as heading text", () => {
    render(<CardTitle>My Title</CardTitle>);
    const heading = screen.getByText("My Title");
    expect(heading).toBeInTheDocument();
    expect(heading.tagName).toBe("H3");
  });

  it("applies title styles", () => {
    render(<CardTitle>Title</CardTitle>);
    const heading = screen.getByText("Title");
    expect(heading.className).toContain("text-lg");
    expect(heading.className).toContain("font-semibold");
  });
});

describe("StatCard", () => {
  it("renders label and value", () => {
    render(<StatCard label="Active Users" value={42} />);
    expect(screen.getByText("Active Users")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders string value", () => {
    render(<StatCard label="Status" value="OK" />);
    expect(screen.getByText("OK")).toBeInTheDocument();
  });

  it("applies default variant color", () => {
    render(<StatCard label="Count" value={10} />);
    const value = screen.getByText("10");
    expect(value.className).toContain("text-foreground");
  });

  it("applies success variant color", () => {
    render(<StatCard label="Allowed" value={5} variant="success" />);
    const value = screen.getByText("5");
    expect(value.className).toContain("text-green-600");
  });

  it("applies danger variant color", () => {
    render(<StatCard label="Blocked" value={3} variant="danger" />);
    const value = screen.getByText("3");
    expect(value.className).toContain("text-red-600");
  });

  it("applies warning variant color", () => {
    render(<StatCard label="Pending" value={1} variant="warning" />);
    const value = screen.getByText("1");
    expect(value.className).toContain("text-amber-600");
  });

  it("wraps value in a Card component", () => {
    const { container } = render(<StatCard label="Test" value={0} />);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain("bg-card");
    expect(card.className).toContain("rounded-lg");
  });
});
