import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sidebar } from "./sidebar";

/**
 * Cut 2b step 2.17 — labels updated to match the post-AGT navigation:
 * "Policies" (was "Policy Editor"), plus the new sections added by
 * steps 2.10–2.15 (Identities, Discovery, Trust, Compliance, Metrics,
 * Hypervisor).
 */

const mockUsePathname = vi.fn(() => "/dashboard");

vi.mock("next/navigation", async () => {
  return {
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    }),
    usePathname: () => mockUsePathname(),
    useSearchParams: () => new URLSearchParams(),
    useParams: () => ({}),
    redirect: vi.fn(),
    notFound: vi.fn(),
  };
});

describe("Sidebar", () => {
  it("renders the ClawForge brand", () => {
    render(<Sidebar />);
    expect(screen.getAllByText("ClawForge").length).toBeGreaterThan(0);
  });

  it("renders the current nav labels", () => {
    render(<Sidebar />);
    const expectedLabels = [
      "Dashboard",
      "Hypervisor",
      "Clients",
      "Policies",
      "Identities",
      "Discovery",
      "Trust",
      "Compliance",
      "Kill Switch",
      "Users",
      "Audit Logs",
      "Metrics",
      "Settings",
    ];
    for (const label of expectedLabels) {
      expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1);
    }
  });

  it("renders a Sign out button", () => {
    render(<Sidebar />);
    const signOutLinks = screen.getAllByText("Sign out");
    expect(signOutLinks.length).toBeGreaterThanOrEqual(1);
    expect(signOutLinks[0].closest("button")).toBeInTheDocument();
  });

  it("highlights the active Dashboard link when pathname is /dashboard", () => {
    mockUsePathname.mockReturnValue("/dashboard");
    render(<Sidebar />);
    const dashboardLinks = screen.getAllByText("Dashboard");
    const activeLink = dashboardLinks[0].closest("a")!;
    expect(activeLink.className).toContain("bg-primary");
    expect(activeLink.className).toContain("font-medium");
  });

  it("highlights the active Policies link when pathname is /policies", () => {
    mockUsePathname.mockReturnValue("/policies");
    render(<Sidebar />);
    const policyLinks = screen.getAllByText("Policies");
    const activeLink = policyLinks[0].closest("a")!;
    expect(activeLink.className).toContain("bg-primary");
  });

  it("does not highlight non-active links", () => {
    mockUsePathname.mockReturnValue("/dashboard");
    render(<Sidebar />);
    const usersLinks = screen.getAllByText("Users");
    const usersLink = usersLinks[0].closest("a")!;
    expect(usersLink.className).not.toContain("bg-primary");
    expect(usersLink.className).toContain("hover:bg-white/5");
  });

  it("links have the expected href attributes", () => {
    render(<Sidebar />);
    expect(screen.getAllByText("Dashboard")[0].closest("a")).toHaveAttribute("href", "/dashboard");
    expect(screen.getAllByText("Audit Logs")[0].closest("a")).toHaveAttribute("href", "/audit");
    expect(screen.getAllByText("Clients")[0].closest("a")).toHaveAttribute("href", "/dashboard/clients");
    expect(screen.getAllByText("Hypervisor")[0].closest("a")).toHaveAttribute("href", "/hypervisor");
  });

  it("renders the hamburger menu button for mobile", () => {
    render(<Sidebar />);
    expect(screen.getByLabelText("Open menu")).toBeInTheDocument();
  });
});
