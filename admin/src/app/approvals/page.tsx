"use client";

/**
 * Generalized approvals queue (Cut 1 step 9 — addendum §A18 Tier 1).
 *
 * AGT approval model — `action_type` lets the same queue carry skill
 * approvals, policy changes, tool-call approvals, and delegation requests.
 * Decisions go through `PUT /api/v1/approvals/:id/decision`.
 *
 * Cut 2b §A21 step 2.16 layout pass — wrapped in the shared Sidebar /
 * Card shell so this page matches the rest of the admin UI.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Card, CardTitle } from "@/components/card";
import { CardSkeleton } from "@/components/skeleton";
import { getAuth } from "@/lib/auth";
import { decideAgtApproval, listAgtApprovals, type AgtApproval } from "@/lib/agt-api";

const ACTION_TYPES = ["skill_load", "policy_change", "tool_call", "delegation"] as const;
const STATUSES = ["pending", "approved", "denied", "expired"] as const;

const STATUS_BADGE: Record<(typeof STATUSES)[number], string> = {
  pending: "badge-info",
  approved: "badge-success",
  denied: "badge-error",
  expired: "badge-warning",
};

export default function ApprovalsPage() {
  const router = useRouter();
  const [auth, setAuth] = useState<ReturnType<typeof getAuth>>(null);
  const [items, setItems] = useState<AgtApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<(typeof STATUSES)[number]>("pending");
  const [actionTypeFilter, setActionTypeFilter] = useState<"all" | (typeof ACTION_TYPES)[number]>("all");

  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const a = getAuth();
    if (!a) {
      router.replace("/login");
      return;
    }
    setAuth(a);
  }, [router]);

  const refresh = useCallback(async () => {
    if (!auth) return;
    setLoading(true);
    setError(null);
    try {
      const res = await listAgtApprovals(auth.accessToken, {
        status: statusFilter,
        actionType: actionTypeFilter === "all" ? undefined : actionTypeFilter,
      });
      setItems(res.approvals);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [auth, statusFilter, actionTypeFilter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const decide = async (id: string, decision: "approved" | "denied") => {
    if (!auth) return;
    setBusyId(id);
    setError(null);
    try {
      await decideAgtApproval(auth.accessToken, id, {
        decision,
        comment: commentDraft[id]?.trim() || undefined,
      });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex min-h-screen bg-base-200">
      <Sidebar />
      <main className="flex-1 p-4 lg:p-8 pt-16 lg:pt-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Approvals</h2>
          <p className="text-sm text-base-content/50 mt-1">
            Generalized queue: skill loads, policy changes, tool calls, and delegations all flow through the AGT{" "}
            <code className="px-1 py-0.5 bg-base-300 rounded text-xs">require_approval</code> shape.
          </p>
        </div>

        {error && (
          <div className="alert alert-error mb-4 text-sm">
            <span>{error}</span>
          </div>
        )}

        {!auth ? (
          <div className="space-y-4">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : (
          <div className="space-y-6">
            {/* --- Filter bar --- */}
            <Card>
              <div className="flex items-end gap-4 flex-wrap">
                <div className="form-control">
                  <label className="label py-1">
                    <span className="label-text text-xs">Status</span>
                  </label>
                  <select
                    className="select select-bordered select-sm capitalize"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as (typeof STATUSES)[number])}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-control">
                  <label className="label py-1">
                    <span className="label-text text-xs">Action type</span>
                  </label>
                  <select
                    className="select select-bordered select-sm"
                    value={actionTypeFilter}
                    onChange={(e) => setActionTypeFilter(e.target.value as "all" | (typeof ACTION_TYPES)[number])}
                  >
                    <option value="all">all</option>
                    {ACTION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="ml-auto text-xs text-base-content/50">
                  {loading ? "Loading…" : `${items.length} approval${items.length === 1 ? "" : "s"}`}
                </div>
              </div>
            </Card>

            {/* --- Approval list --- */}
            {loading ? (
              <div className="space-y-4">
                <CardSkeleton />
                <CardSkeleton />
              </div>
            ) : items.length === 0 ? (
              <Card>
                <CardTitle>Nothing pending</CardTitle>
                <p className="text-sm text-base-content/60">
                  No approvals match the current filters. Try widening the status or action-type filter above.
                </p>
              </Card>
            ) : (
              <div className="space-y-4">
                {items.map((a) => {
                  const isPending = a.status === "pending";
                  return (
                    <Card key={a.id}>
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="badge badge-outline badge-sm">{a.actionType}</span>
                            <span className={`badge ${STATUS_BADGE[a.status]} badge-sm capitalize`}>{a.status}</span>
                            {a.agentDid && (
                              <code className="text-xs text-base-content/60 font-mono break-all">{a.agentDid}</code>
                            )}
                          </div>
                          {a.target && (
                            <div className="text-sm">
                              target: <code className="font-mono text-xs">{a.target}</code>
                            </div>
                          )}
                          <div className="text-xs text-base-content/50">
                            requested {new Date(a.requestedAt).toLocaleString()}
                          </div>
                        </div>
                        {isPending && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <input
                              className="input input-bordered input-sm w-48"
                              placeholder="optional comment"
                              value={commentDraft[a.id] ?? ""}
                              onChange={(e) => setCommentDraft((prev) => ({ ...prev, [a.id]: e.target.value }))}
                            />
                            <button
                              className="btn btn-success btn-sm"
                              disabled={busyId === a.id}
                              onClick={() => decide(a.id, "approved")}
                            >
                              Approve
                            </button>
                            <button
                              className="btn btn-error btn-sm"
                              disabled={busyId === a.id}
                              onClick={() => decide(a.id, "denied")}
                            >
                              Deny
                            </button>
                          </div>
                        )}
                      </div>

                      {Object.keys(a.payload).length > 0 && (
                        <details className="mt-3">
                          <summary className="text-xs cursor-pointer text-base-content/60">payload</summary>
                          <pre className="text-xs bg-base-200 p-2 rounded mt-1 overflow-auto max-h-48">
                            {JSON.stringify(a.payload, null, 2)}
                          </pre>
                        </details>
                      )}

                      {a.decisions.length > 0 && (
                        <div className="mt-3 space-y-1 border-t border-base-300/50 pt-2">
                          {a.decisions.map((d, i) => (
                            <div key={i} className="text-xs text-base-content/60">
                              <span
                                className={`badge badge-xs mr-1 ${
                                  d.decision === "approved" ? "badge-success" : "badge-error"
                                }`}
                              >
                                {d.decision}
                              </span>
                              by <code className="font-mono">{d.decidedBy}</code> at{" "}
                              {new Date(d.decidedAt).toLocaleString()}
                              {d.comment ? ` — ${d.comment}` : ""}
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
