/**
 * Client-side auth state management for the admin console.
 * Stores JWT in localStorage.
 */

export type AuthState = {
  accessToken: string;
  orgId: string;
  userId: string;
  email: string;
  role: string;
};

const AUTH_KEY = "clawforge_auth";

export function getAuth(): AuthState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthState;
  } catch {
    return null;
  }
}

export function setAuth(auth: AuthState): void {
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
}

export function clearAuth(): void {
  localStorage.removeItem(AUTH_KEY);
}
