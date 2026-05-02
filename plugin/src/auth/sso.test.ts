/**
 * Tests for the OIDC SSO browser-open flow.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildAuthorizationUrl, openBrowser } from "./sso.js";

// Mock child_process.exec for browser open tests
vi.mock("node:child_process", () => ({
  exec: vi.fn((cmd: string, cb: (err: Error | null) => void) => {
    // Default: succeed
    cb(null);
  }),
}));

describe("buildAuthorizationUrl", () => {
  it("builds a valid OIDC authorization URL with all required parameters", () => {
    const url = buildAuthorizationUrl({
      issuerUrl: "https://auth.example.com",
      clientId: "clawforge-client",
      codeChallenge: "test-challenge",
      state: "test-state",
      redirectUri: "http://localhost:19832/clawforge/callback",
    });

    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://auth.example.com");
    expect(parsed.pathname).toBe("/authorize");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("client_id")).toBe("clawforge-client");
    expect(parsed.searchParams.get("redirect_uri")).toBe("http://localhost:19832/clawforge/callback");
    expect(parsed.searchParams.get("scope")).toBe("openid email profile");
    expect(parsed.searchParams.get("code_challenge")).toBe("test-challenge");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("state")).toBe("test-state");
  });
});

describe("openBrowser", () => {
  let execMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const cp = await import("node:child_process");
    execMock = cp.exec as unknown as ReturnType<typeof vi.fn>;
    execMock.mockReset();
  });

  it("returns true when browser opens successfully", async () => {
    execMock.mockImplementation((_cmd: string, cb: (err: Error | null) => void) => {
      cb(null);
    });

    const result = await openBrowser("https://example.com");
    expect(result).toBe(true);
  });

  it("returns false when browser open fails", async () => {
    execMock.mockImplementation((_cmd: string, cb: (err: Error | null) => void) => {
      cb(new Error("xdg-open not found"));
    });

    const result = await openBrowser("https://example.com");
    expect(result).toBe(false);
  });

  it("uses platform-appropriate command", async () => {
    execMock.mockImplementation((_cmd: string, cb: (err: Error | null) => void) => {
      cb(null);
    });

    await openBrowser("https://example.com/login");

    const calledCommand = execMock.mock.calls[0][0] as string;
    expect(calledCommand).toContain("https://example.com/login");

    // Should use one of the platform commands
    const platform = process.platform;
    if (platform === "darwin") {
      expect(calledCommand).toMatch(/^open /);
    } else if (platform === "win32") {
      expect(calledCommand).toMatch(/^start /);
    } else {
      expect(calledCommand).toMatch(/^xdg-open /);
    }
  });

  it("properly quotes URLs with special characters", async () => {
    execMock.mockImplementation((_cmd: string, cb: (err: Error | null) => void) => {
      cb(null);
    });

    await openBrowser("https://auth.example.com/authorize?client_id=abc&state=xyz");

    const calledCommand = execMock.mock.calls[0][0] as string;
    // URL should be within quotes to prevent shell interpretation
    expect(calledCommand).toContain('"https://auth.example.com/authorize?client_id=abc&state=xyz"');
  });
});
