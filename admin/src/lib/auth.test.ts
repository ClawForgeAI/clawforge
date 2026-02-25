import { describe, it, expect, beforeEach } from "vitest";
import { getAuth, setAuth, clearAuth, type AuthState } from "./auth";

const mockAuth: AuthState = {
  accessToken: "token-abc",
  orgId: "org-1",
  userId: "user-1",
  email: "admin@example.com",
  role: "admin",
};

describe("auth", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("getAuth", () => {
    it("returns null when no auth is stored", () => {
      expect(getAuth()).toBeNull();
    });

    it("returns the stored auth state", () => {
      localStorage.setItem("clawforge_auth", JSON.stringify(mockAuth));
      const result = getAuth();
      expect(result).toEqual(mockAuth);
    });

    it("returns null when stored value is invalid JSON", () => {
      localStorage.setItem("clawforge_auth", "not-json");
      expect(getAuth()).toBeNull();
    });
  });

  describe("setAuth", () => {
    it("stores auth state in localStorage", () => {
      setAuth(mockAuth);
      const stored = localStorage.getItem("clawforge_auth");
      expect(stored).not.toBeNull();
      expect(JSON.parse(stored!)).toEqual(mockAuth);
    });

    it("overwrites previous auth state", () => {
      setAuth(mockAuth);
      const updatedAuth: AuthState = {
        ...mockAuth,
        accessToken: "new-token",
      };
      setAuth(updatedAuth);
      const stored = JSON.parse(localStorage.getItem("clawforge_auth")!);
      expect(stored.accessToken).toBe("new-token");
    });
  });

  describe("clearAuth", () => {
    it("removes auth state from localStorage", () => {
      setAuth(mockAuth);
      expect(getAuth()).not.toBeNull();
      clearAuth();
      expect(getAuth()).toBeNull();
    });

    it("does not throw when no auth is stored", () => {
      expect(() => clearAuth()).not.toThrow();
    });
  });
});
