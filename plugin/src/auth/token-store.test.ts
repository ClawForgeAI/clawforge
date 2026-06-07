import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadSession, saveSession, clearSession, isSessionValid } from "./token-store.js";
import type { SessionTokens } from "../types.js";

const CLAWFORGE_DIR = path.join(os.homedir(), ".openclaw", "clawforge");
const SESSION_FILE = path.join(CLAWFORGE_DIR, "session.json");

function makeSession(overrides?: Partial<SessionTokens>): SessionTokens {
  return {
    accessToken: "test-access-token",
    refreshToken: "test-refresh-token",
    expiresAt: Date.now() + 60 * 60 * 1000,
    userId: "user-123",
    orgId: "org-456",
    email: "test@example.com",
    roles: ["user"],
    ...overrides,
  };
}

describe("token-store", () => {
  let originalContent: string | null = null;

  beforeEach(() => {
    try {
      originalContent = fs.readFileSync(SESSION_FILE, "utf-8");
    } catch {
      originalContent = null;
    }
  });

  afterEach(() => {
    if (originalContent !== null) {
      fs.writeFileSync(SESSION_FILE, originalContent);
    } else {
      try {
        fs.unlinkSync(SESSION_FILE);
      } catch {
        // Ignore.
      }
    }
  });

  it("returns null when no session file exists", () => {
    clearSession();
    expect(loadSession()).toBeNull();
  });

  it("saves and loads a session", () => {
    const session = makeSession();
    saveSession(session);
    const loaded = loadSession();
    expect(loaded).toEqual(session);
  });

  it("clears a session", () => {
    saveSession(makeSession());
    clearSession();
    expect(loadSession()).toBeNull();
  });

  describe("isSessionValid", () => {
    it("returns false for null", () => {
      expect(isSessionValid(null)).toBe(false);
    });

    it("returns false for missing accessToken", () => {
      expect(isSessionValid(makeSession({ accessToken: "" }))).toBe(false);
    });

    it("returns false for expired session", () => {
      expect(isSessionValid(makeSession({ expiresAt: Date.now() - 1000 }))).toBe(false);
    });

    it("returns true for valid session", () => {
      expect(isSessionValid(makeSession())).toBe(true);
    });

    it("returns true when expiresAt is not set", () => {
      expect(isSessionValid(makeSession({ expiresAt: undefined }))).toBe(true);
    });
  });
});
