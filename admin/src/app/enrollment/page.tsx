"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "@/components/sidebar";
import { Card, CardTitle } from "@/components/card";
import { Badge } from "@/components/badge";
import { CardSkeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { getAuth } from "@/lib/auth";
import {
  getEnrollmentTokens,
  createEnrollmentToken,
  revokeEnrollmentToken,
} from "@/lib/api";
import type { EnrollmentToken } from "@/lib/api";

export default function EnrollmentPage() {
  const router = useRouter();
  const toast = useToast();
  const [tokens, setTokens] = useState<EnrollmentToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [label, setLabel] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [expiresIn, setExpiresIn] = useState("");
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadTokens();
  }, [router]);

  function loadTokens() {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }
    setLoading(true);
    getEnrollmentTokens(auth.orgId, auth.accessToken)
      .then((data) => setTokens(data.tokens))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  async function handleCreate() {
    const auth = getAuth();
    if (!auth) return;
    setCreating(true);
    try {
      const body: { label?: string; expiresAt?: string; maxUses?: number } = {};
      if (label.trim()) body.label = label.trim();
      if (maxUses) body.maxUses = parseInt(maxUses, 10);
      if (expiresIn) {
        const hours = parseInt(expiresIn, 10);
        body.expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
      }
      const result = await createEnrollmentToken(auth.orgId, auth.accessToken, body);
      setNewToken(result.token);
      setShowCreate(false);
      setLabel("");
      setMaxUses("");
      setExpiresIn("");
      toast.success("Enrollment token created.");
      loadTokens();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create token");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(tokenId: string) {
    const auth = getAuth();
    if (!auth) return;
    if (!confirm("Revoke this enrollment token? It will no longer accept new enrollments.")) return;
    try {
      await revokeEnrollmentToken(auth.orgId, tokenId, auth.accessToken);
      toast.success("Token revoked.");
      loadTokens();
    } catch {
      toast.error("Failed to revoke token.");
    }
  }

  function copyToken() {
    if (newToken) {
      navigator.clipboard.writeText(newToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="flex min-h-screen bg-base-200">
      <Sidebar />
      <main className="flex-1 p-4 lg:p-8 pt-16 lg:pt-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">Enrollment Tokens</h2>
            <p className="text-sm text-base-content/50 mt-1">Generate tokens to onboard new agent clients</p>
          </div>
          <button
            onClick={() => { setShowCreate(true); setNewToken(null); }}
            className="btn btn-primary btn-sm gap-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Create Token
          </button>
        </div>

        <AnimatePresence>
          {newToken && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-6"
            >
              <Card className="border-success/30 bg-success/5">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-success/15 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm mb-1">New Token Created</h3>
                    <p className="text-xs text-base-content/50 mb-2">
                      Copy this token now. It will not be shown again in full.
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-base-200 px-3 py-2 rounded-lg text-xs font-mono break-all border border-base-300/50">
                        {newToken}
                      </code>
                      <button
                        onClick={copyToken}
                        className={`btn btn-sm shrink-0 ${copied ? "btn-success" : "btn-primary"}`}
                      >
                        {copied ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showCreate && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mb-6"
            >
              <Card>
                <CardTitle>Create Enrollment Token</CardTitle>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="form-control">
                    <label className="label"><span className="label-text text-xs font-medium">Label (optional)</span></label>
                    <input
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder="e.g. Engineering team"
                      className="input input-bordered input-sm w-full"
                    />
                  </div>
                  <div className="form-control">
                    <label className="label"><span className="label-text text-xs font-medium">Max Uses (optional)</span></label>
                    <input
                      type="number"
                      value={maxUses}
                      onChange={(e) => setMaxUses(e.target.value)}
                      placeholder="Unlimited"
                      className="input input-bordered input-sm w-full"
                    />
                  </div>
                  <div className="form-control">
                    <label className="label"><span className="label-text text-xs font-medium">Expires In Hours (optional)</span></label>
                    <input
                      type="number"
                      value={expiresIn}
                      onChange={(e) => setExpiresIn(e.target.value)}
                      placeholder="Never"
                      className="input input-bordered input-sm w-full"
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={handleCreate}
                    disabled={creating}
                    className="btn btn-primary btn-sm"
                  >
                    {creating && <span className="loading loading-spinner loading-xs" />}
                    {creating ? "Creating..." : "Create"}
                  </button>
                  <button
                    onClick={() => setShowCreate(false)}
                    className="btn btn-ghost btn-sm"
                  >
                    Cancel
                  </button>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {loading ? (
          <CardSkeleton />
        ) : tokens.length === 0 ? (
          <div className="text-center py-16 text-base-content/40">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
            </svg>
            <p className="text-sm">No active enrollment tokens</p>
            <p className="text-xs mt-1">Create one to onboard employees</p>
          </div>
        ) : (
          <Card>
            <div className="overflow-x-auto -mx-5">
              <table className="table table-sm">
                <thead>
                  <tr className="text-base-content/40 text-xs uppercase">
                    <th>Label</th>
                    <th>Token</th>
                    <th>Usage</th>
                    <th>Expires</th>
                    <th>Created</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((t, i) => {
                    const isExpired = t.expiresAt && new Date(t.expiresAt) < new Date();
                    const isMaxed = t.maxUses !== null && t.maxUses !== undefined && t.usedCount >= t.maxUses;
                    return (
                      <motion.tr
                        key={t.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.03 }}
                        className="table-row-hover"
                      >
                        <td className="font-medium">{t.label || "-"}</td>
                        <td className="font-mono text-xs text-base-content/40">
                          {t.token.slice(0, 12)}...
                        </td>
                        <td>
                          <Badge variant={isMaxed ? "danger" : "default"}>
                            {t.usedCount}{t.maxUses != null ? `/${t.maxUses}` : ""} used
                          </Badge>
                        </td>
                        <td>
                          {t.expiresAt ? (
                            <Badge variant={isExpired ? "danger" : "default"}>
                              {isExpired ? "Expired" : new Date(t.expiresAt).toLocaleDateString()}
                            </Badge>
                          ) : (
                            <span className="text-base-content/40 text-sm">Never</span>
                          )}
                        </td>
                        <td className="text-base-content/50 text-sm">
                          {new Date(t.createdAt).toLocaleDateString()}
                        </td>
                        <td>
                          <button
                            onClick={() => handleRevoke(t.id)}
                            className="btn btn-ghost btn-xs text-error hover:bg-error/10"
                          >
                            Revoke
                          </button>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
