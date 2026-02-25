import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import DashboardPage from "./page";

const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: mockReplace,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

describe("DashboardPage", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    localStorage.clear();
  });

  it("redirects to login when not authenticated", async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/login");
    });
  });

  it("renders the dashboard heading", () => {
    localStorage.setItem(
      "clawforge_auth",
      JSON.stringify({
        accessToken: "mock-token-123",
        orgId: "org-1",
        userId: "user-1",
        email: "admin@example.com",
        role: "admin",
      }),
    );

    render(<DashboardPage />);
    // The heading is an h2; "Dashboard" also appears in the sidebar nav link
    const heading = screen.getByRole("heading", { level: 2, name: "Dashboard" });
    expect(heading).toBeInTheDocument();
  });

  it("shows loading skeletons initially", () => {
    localStorage.setItem(
      "clawforge_auth",
      JSON.stringify({
        accessToken: "mock-token-123",
        orgId: "org-1",
        userId: "user-1",
        email: "admin@example.com",
        role: "admin",
      }),
    );

    const { container } = render(<DashboardPage />);
    // The skeleton uses animate-pulse class
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders stat cards when data loads", async () => {
    localStorage.setItem(
      "clawforge_auth",
      JSON.stringify({
        accessToken: "mock-token-123",
        orgId: "org-1",
        userId: "user-1",
        email: "admin@example.com",
        role: "admin",
      }),
    );

    render(<DashboardPage />);

    // Wait for API data to load and stats to render
    await waitFor(() => {
      expect(screen.getByText("Active Users")).toBeInTheDocument();
    });

    expect(screen.getByText("Clients Online")).toBeInTheDocument();
    expect(screen.getByText("Tool Calls Allowed")).toBeInTheDocument();
    expect(screen.getByText("Tool Calls Blocked")).toBeInTheDocument();
    expect(screen.getByText("Pending Reviews")).toBeInTheDocument();
  });

  it("renders stat values from API data", async () => {
    localStorage.setItem(
      "clawforge_auth",
      JSON.stringify({
        accessToken: "mock-token-123",
        orgId: "org-1",
        userId: "user-1",
        email: "admin@example.com",
        role: "admin",
      }),
    );

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Active Users")).toBeInTheDocument();
    });

    // From MSW handlers: 2 users, 3 online clients, 1 allowed, 1 blocked, 1 pending
    expect(screen.getByText("2")).toBeInTheDocument(); // Active Users
    expect(screen.getByText("3")).toBeInTheDocument(); // Clients Online
    // "1" appears three times (allowed, blocked, pending) so use getAllByText
    const ones = screen.getAllByText("1");
    expect(ones.length).toBe(3);
  });

  it("renders the Recent Activity section", async () => {
    localStorage.setItem(
      "clawforge_auth",
      JSON.stringify({
        accessToken: "mock-token-123",
        orgId: "org-1",
        userId: "user-1",
        email: "admin@example.com",
        role: "admin",
      }),
    );

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Recent Activity")).toBeInTheDocument();
    });

    // Event table headers
    expect(screen.getByText("Time")).toBeInTheDocument();
    expect(screen.getByText("User")).toBeInTheDocument();
    expect(screen.getByText("Event")).toBeInTheDocument();
    expect(screen.getByText("Tool")).toBeInTheDocument();
    expect(screen.getByText("Outcome")).toBeInTheDocument();
  });

  it("renders audit event data from the API", async () => {
    localStorage.setItem(
      "clawforge_auth",
      JSON.stringify({
        accessToken: "mock-token-123",
        orgId: "org-1",
        userId: "user-1",
        email: "admin@example.com",
        role: "admin",
      }),
    );

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("file_read")).toBeInTheDocument();
    });

    expect(screen.getByText("exec_cmd")).toBeInTheDocument();
    expect(screen.getByText("allowed")).toBeInTheDocument();
    expect(screen.getByText("blocked")).toBeInTheDocument();
  });
});
