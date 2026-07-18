import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card, CardTitle, StatCard } from "./card";

/**
 * Cut 2b step 2.17 — these assertions match the current DaisyUI-based
 * Card / CardTitle / StatCard. The wrapper now uses `card bg-base-100`
 * and DaisyUI status colors (`text-success`, `text-error`, etc.).
 */
describe("Card", () => {
  it("renders children", () => {
    render(
      <Card>
        <p>Card content</p>
      </Card>,
    );
    expect(screen.getByText("Card content")).toBeInTheDocument();
  });

  it("applies base card styles", () => {
    const { container } = render(
      <Card>
        <span>test</span>
      </Card>,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("card");
    expect(root.className).toContain("bg-base-100");
    expect(root.className).toContain("border");
    expect(root.className).toContain("shadow-sm");
  });

  it("applies additional className to the wrapper", () => {
    const { container } = render(
      <Card className="mt-4">
        <span>test</span>
      </Card>,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("mt-4");
  });
});

describe("CardTitle", () => {
  it("renders children as an H3", () => {
    render(<CardTitle>My Title</CardTitle>);
    const heading = screen.getByText("My Title");
    expect(heading).toBeInTheDocument();
    expect(heading.tagName).toBe("H3");
  });

  it("applies semantic title styles", () => {
    render(<CardTitle>Title</CardTitle>);
    const heading = screen.getByText("Title");
    expect(heading.className).toContain("text-base");
    expect(heading.className).toContain("font-semibold");
    expect(heading.className).toContain("text-base-content");
  });
});

describe("StatCard", () => {
  it("renders label and value", () => {
    render(<StatCard label="Active Users" value={42} />);
    expect(screen.getByText("Active Users")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders string value untouched", () => {
    render(<StatCard label="Status" value="OK" />);
    expect(screen.getByText("OK")).toBeInTheDocument();
  });

  it("formats numeric values with toLocaleString separators", () => {
    render(<StatCard label="Count" value={12345} />);
    expect(screen.getByText("12,345")).toBeInTheDocument();
  });

  it("uses text-base-content for the default variant", () => {
    render(<StatCard label="Count" value={10} />);
    expect(screen.getByText("10").className).toContain("text-base-content");
  });

  it("uses text-success for the success variant", () => {
    render(<StatCard label="Allowed" value={5} variant="success" />);
    expect(screen.getByText("5").className).toContain("text-success");
  });

  it("uses text-error for the danger variant", () => {
    render(<StatCard label="Blocked" value={3} variant="danger" />);
    expect(screen.getByText("3").className).toContain("text-error");
  });

  it("uses text-warning for the warning variant", () => {
    render(<StatCard label="Pending" value={1} variant="warning" />);
    expect(screen.getByText("1").className).toContain("text-warning");
  });

  it("wraps the value in a card-style div", () => {
    const { container } = render(<StatCard label="Test" value={0} />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("card");
    expect(root.className).toContain("bg-base-100");
  });
});
