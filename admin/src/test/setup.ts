import "@testing-library/jest-dom/vitest";
import { createElement } from "react";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { server } from "./handlers";

// Start MSW server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));

// Reset handlers and clean up DOM after each test
afterEach(() => {
  server.resetHandlers();
  cleanup();
});

// Close MSW server after all tests
afterAll(() => server.close());

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
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

// Mock next/link to render a plain anchor
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: Record<string, unknown>) => {
    return createElement("a", { href, ...props }, children);
  },
}));
