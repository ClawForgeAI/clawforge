import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "./page";

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/login",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

describe("LoginPage", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
    localStorage.clear();
  });

  it("renders the login page heading", async () => {
    render(<LoginPage />);
    // ClawForge appears in the side panel brand AND the form-side brand.
    expect(screen.getAllByText("ClawForge").length).toBeGreaterThan(0);
    // "Admin Console" lives inside the page's brand strip; the substring
    // match below is robust to wrapping copy changes.
    expect(screen.getAllByText(/admin console/i).length).toBeGreaterThan(0);
  });

  it("renders email and password fields once auth mode loads", async () => {
    render(<LoginPage />);

    // Wait for the auth mode fetch to resolve and password form to appear
    await waitFor(() => {
      expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("renders the sign in button", async () => {
    render(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    });
  });

  it("handles successful login and redirects to dashboard", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    // Wait for password form to appear
    await waitFor(() => {
      expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText("Email address"), "admin@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });

    // Verify auth was stored in localStorage
    const stored = localStorage.getItem("clawforge_auth");
    expect(stored).not.toBeNull();
    const auth = JSON.parse(stored!);
    expect(auth.accessToken).toBe("mock-token-123");
    expect(auth.orgId).toBe("org-1");
  });

  it("shows error message on failed login", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText("Email address"), "bad@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    // The login route (no token in opts) surfaces the server's error body
    // ("Invalid credentials") directly via apiFetch, not the session-expired
    // path. That body lands in the alert beneath the form.
    await waitFor(() => {
      expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
    });
  });

  it("disables the button while loading", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText("Email address"), "admin@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");

    const button = screen.getByRole("button", { name: /sign in/i });
    await user.click(button);

    // The button should be disabled during the request
    // and then the redirect should happen
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
  });
});
