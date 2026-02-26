"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { setAuth } from "@/lib/auth";
import { login } from "@/lib/api";
import { motion } from "framer-motion";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";

type AuthMode = { methods: string[] };

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [authMethods, setAuthMethods] = useState<string[]>([]);

  const expired = searchParams.get("expired") === "1";

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/auth/mode`)
      .then((res) => res.json())
      .then((data: AuthMode) => setAuthMethods(data.methods ?? []))
      .catch(() => setAuthMethods(["password"]));
  }, []);

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await login(email, password);

      setAuth({
        accessToken: data.accessToken,
        orgId: data.orgId,
        userId: data.userId,
        email: data.email ?? email,
        role: data.roles?.[0] ?? "admin",
      });

      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSsoLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grantType: "id_token",
          idToken: "dev-token",
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Login failed (${res.status}): ${text}`);
      }

      const data = await res.json();
      setAuth({
        accessToken: data.accessToken,
        orgId: data.orgId,
        userId: data.userId,
        email: data.email ?? email,
        role: data.role ?? "admin",
      });

      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  const showPasswordLogin = authMethods.includes("password");

  return (
    <div className="min-h-screen flex bg-base-100">
      {/* Left panel -- branding */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[560px] bg-neutral flex-col justify-between p-10 relative overflow-hidden">
        {/* Gradient blobs */}
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-gradient-to-br from-blue-500/20 to-cyan-400/10 blur-3xl animate-pulse" />
        <div className="absolute -bottom-48 -right-48 w-[500px] h-[500px] rounded-full bg-gradient-to-tr from-indigo-500/15 to-purple-400/5 blur-3xl animate-pulse" />

        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative z-10 flex items-center gap-3 mb-3"
        >
          <div className="w-11 h-11 rounded-lg bg-primary/20 flex items-center justify-center text-2xl">
            🛡
          </div>
          <span className="text-2xl font-bold text-neutral-content tracking-tight">
            ClawForge
          </span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="relative z-10 space-y-8"
        >
          <blockquote className="text-neutral-content text-lg leading-relaxed opacity-70">
            One dashboard to govern all your AI assistants. Manage policies, audit trails, and kill switches across your entire OpenClaw fleet.
          </blockquote>

          <div className="flex flex-wrap items-center gap-4">
            {["Policy Enforcement", "Audit Logging", "Kill Switch"].map((feature) => (
              <div key={feature} className="flex items-center gap-2 text-neutral-content text-sm opacity-50">
                <div className="w-1.5 h-1.5 rounded-full bg-success" />
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </motion.div>

        <div className="relative z-10 text-neutral-content text-xs opacity-30">
          ClawForge Admin Console
        </div>
      </div>

      {/* Right panel -- login form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="w-full max-w-[400px]"
        >
          {/* Mobile logo */}
          <div className="lg:hidden mb-10 flex items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center text-2xl">
              🛡
            </div>
            <span className="text-2xl font-bold text-base-content tracking-tight">
              ClawForge
            </span>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-base-content">
              Sign in
            </h1>
            <p className="text-sm mt-1 opacity-50">
              Enter your credentials to access the admin console.
            </p>
          </div>

          {expired && (
            <div className="alert alert-warning mb-6 text-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span>Session expired. Please sign in again.</span>
            </div>
          )}

          {showPasswordLogin ? (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div className="form-control">
                <label className="label" htmlFor="email">
                  <span className="label-text font-medium text-sm">Email address</span>
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoFocus
                  className="input input-bordered w-full"
                  placeholder="admin@example.com"
                />
              </div>

              <div className="form-control">
                <label className="label" htmlFor="password">
                  <span className="label-text font-medium text-sm">Password</span>
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="input input-bordered w-full"
                  placeholder="Enter your password"
                />
              </div>

              {error && (
                <div className="alert alert-error text-sm py-3">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary w-full"
              >
                {loading && <span className="loading loading-spinner loading-sm" />}
                {loading ? "Signing in..." : "Sign in"}
              </button>

              {authMethods.includes("sso") && (
                <>
                  <div className="divider text-xs opacity-30">or</div>
                  <button
                    type="button"
                    onClick={handleSsoLogin as unknown as () => void}
                    disabled={loading}
                    className="btn btn-outline w-full"
                  >
                    Sign in with SSO
                  </button>
                </>
              )}
            </form>
          ) : (
            <form onSubmit={handleSsoLogin} className="space-y-4">
              <div className="form-control">
                <label className="label" htmlFor="email">
                  <span className="label-text font-medium text-sm">Email address</span>
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoFocus
                  className="input input-bordered w-full"
                  placeholder="admin@example.com"
                />
              </div>

              {error && (
                <div className="alert alert-error text-sm py-3">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary w-full"
              >
                {loading && <span className="loading loading-spinner loading-sm" />}
                {loading ? "Signing in..." : "Sign in with SSO"}
              </button>
            </form>
          )}
        </motion.div>
      </div>
    </div>
  );
}
