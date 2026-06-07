import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import DashboardPage from "./page";

/**
 * Cut 2b step 2.17 — assertions updated for the AGT-aware dashboard:
 *   - StatCard labels: "Calls Allowed" / "Calls Blocked" (was "Tool Calls …")
 *   - Recent Activity columns: Time / Agent / Action / Rule / Decision
 *     (was Time / User / Event / Tool / Outcome)
 *   - Row data: agent DIDs + actions from the AGT audit chain mock
 */

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

function seedAuth() {
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
}

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
    seedAuth();
    render(<DashboardPage />);
    const heading = screen.getByRole("heading", { level: 2, name: "Dashboard" });
    expect(heading).toBeInTheDocument();
  });

  it("shows loading skeletons initially", () => {
    seedAuth();
    const { container } = render(<DashboardPage />);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders stat cards when data loads", async () => {
    seedAuth();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Active Users")).toBeInTheDocument();
    });

    expect(screen.getByText("Clients Online")).toBeInTheDocument();
    expect(screen.getByText("Calls Allowed")).toBeInTheDocument();
    expect(screen.getByText("Calls Blocked")).toBeInTheDocument();
    expect(screen.getByText("Pending Reviews")).toBeInTheDocument();
  });

  it("renders stat values from API data", async () => {
    seedAuth();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Active Users")).toBeInTheDocument();
    });

    // From MSW handlers: 2 users, 3 online clients, 1 allowed, 1 denied, 1 pending.
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    // Three stat cards each render "1"; activity rows or timestamps may
    // contain stray "1"s on certain locales, so assert ≥ 3 instead of ===.
    expect(screen.getAllByText("1").length).toBeGreaterThanOrEqual(3);
  });

  it("renders the Recent Activity table with AGT columns", async () => {
    seedAuth();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Recent Activity")).toBeInTheDocument();
    });

    expect(screen.getByText("Time")).toBeInTheDocument();
    expect(screen.getByText("Agent")).toBeInTheDocument();
    expect(screen.getByText("Action")).toBeInTheDocument();
    expect(screen.getByText("Rule")).toBeInTheDocument();
    expect(screen.getByText("Decision")).toBeInTheDocument();
  });

  it("renders AGT audit entry rows", async () => {
    seedAuth();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("file_read")).toBeInTheDocument();
    });

    expect(screen.getByText("exec_cmd")).toBeInTheDocument();
    expect(screen.getByText("allow")).toBeInTheDocument();
    expect(screen.getByText("deny")).toBeInTheDocument();
  });
});
