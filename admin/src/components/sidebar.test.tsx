import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sidebar } from "./sidebar";

// Override the default usePathname mock per test
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

  it("renders all navigation links", () => {
    render(<Sidebar />);
    const expectedLabels = [
      "Dashboard",
      "Clients",
      "Policy Editor",
      "Skill Review",
      "Audit Logs",
      "Kill Switch",
      "Users",
      "Enrollment",
      "Settings",
    ];
    for (const label of expectedLabels) {
      // Desktop + mobile both render NavContent, but mobile is hidden by default (open=false)
      // Only the desktop version should be present
      const links = screen.getAllByText(label);
      expect(links.length).toBeGreaterThanOrEqual(1);
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

  it("highlights the active Policy Editor link when pathname is /policies", () => {
    mockUsePathname.mockReturnValue("/policies");
    render(<Sidebar />);
    const policyLinks = screen.getAllByText("Policy Editor");
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

  it("links have correct href attributes", () => {
    render(<Sidebar />);
    const dashboardLink = screen.getAllByText("Dashboard")[0].closest("a")!;
    expect(dashboardLink).toHaveAttribute("href", "/dashboard");

    const auditLink = screen.getAllByText("Audit Logs")[0].closest("a")!;
    expect(auditLink).toHaveAttribute("href", "/audit");

    const clientsLink = screen.getAllByText("Clients")[0].closest("a")!;
    expect(clientsLink).toHaveAttribute("href", "/dashboard/clients");
  });

  it("renders the hamburger menu button for mobile", () => {
    render(<Sidebar />);
    const menuButton = screen.getByLabelText("Open menu");
    expect(menuButton).toBeInTheDocument();
  });
});
