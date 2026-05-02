import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AuditPage from "./page";

const mockReplace = vi.fn();
const mockQueryAudit = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/audit",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

vi.mock("@/lib/auth", () => ({
  getAuth: () => ({
    orgId: "org-1",
    accessToken: "token-1",
  }),
}));

vi.mock("@/lib/api", () => ({
  queryAudit: (...args: unknown[]) => mockQueryAudit(...args),
  deleteAuditRetention: vi.fn(),
  exportAudit: vi.fn(),
}));

vi.mock("@/components/toast", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

describe("AuditPage", () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockQueryAudit.mockReset();
    mockQueryAudit.mockResolvedValue({
      events: [
        {
          id: "evt-1",
          userId: "user-1",
          eventType: "tool_call",
          toolName: "read",
          outcome: "allowed",
          promptInjectionDetected: false,
          promptInjectionConfidence: 8,
          promptInjectionSignals: [],
          timestamp: new Date().toISOString(),
        },
      ],
      total: 1,
      nextCursor: undefined,
    });
  });

  it("sends prompt-injection filter to the query API", async () => {
    render(<AuditPage />);

    await waitFor(() => {
      expect(mockQueryAudit).toHaveBeenCalledTimes(1);
    });

    const select = screen.getByTestId("prompt-injection-filter") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "true" } });
    expect(select.value).toBe("true");
    fireEvent.click(screen.getByText("Apply Filters"));

    await waitFor(() => {
      expect(
        mockQueryAudit.mock.calls.some(
          (call) =>
            call[0] === "org-1" &&
            call[1] === "token-1" &&
            typeof call[2] === "object" &&
            call[2] !== null &&
            "promptInjectionDetected" in (call[2] as Record<string, unknown>) &&
            (call[2] as Record<string, unknown>).promptInjectionDetected === "true",
        ),
      ).toBe(true);
    });
  });
});
