"use client";

/**
 * Generalized approvals queue (Cut 1 step 9 — addendum §A18 Tier 1).
 *
 * AGT approval model — `action_type` lets the same queue carry skill
 * approvals, policy changes, tool-call approvals, and delegation requests.
 * Decisions go through `PUT /api/v1/approvals/:id/decision`.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { decideAgtApproval, listAgtApprovals, type AgtApproval } from "@/lib/agt-api";

const ACTION_TYPES = ["skill_load", "policy_change", "tool_call", "delegation"] as const;
const STATUSES = ["pending", "approved", "denied", "expired"] as const;

export default function ApprovalsPage() {
  const router = useRouter();
  const [auth, setAuth] = useState<ReturnType<typeof getAuth>>(null);
  const [items, setItems] = useState<AgtApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<(typeof STATUSES)[number]>("pending");
  const [actionTypeFilter, setActionTypeFilter] = useState<"all" | (typeof ACTION_TYPES)[number]>(
    "all",
  );

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

  if (!auth) return <main className="p-8">Loading…</main>;

  return (
    <main className="p-8 max-w-7xl mx-auto space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Approvals</h1>
        <p className="text-base-content/70">
          Generalized queue: skill loads, policy changes, tool calls, and delegations all flow through
          the AGT <code className="text-xs">require_approval</code> shape.
        </p>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      <section className="card bg-base-100 shadow-lg">
        <div className="card-body flex-row items-center gap-3 flex-wrap">
          <label className="form-control">
            <span className="label-text">Status</span>
            <select
              className="select select-bordered"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as (typeof STATUSES)[number])}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="form-control">
            <span className="label-text">Action type</span>
            <select
              className="select select-bordered"
              value={actionTypeFilter}
              onChange={(e) =>
                setActionTypeFilter(e.target.value as "all" | (typeof ACTION_TYPES)[number])
              }
            >
              <option value="all">all</option>
              {ACTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="space-y-4">
        {loading ? (
          <div>Loading…</div>
        ) : items.length === 0 ? (
          <div className="text-base-content/60">No approvals matching the current filters.</div>
        ) : (
          items.map((a) => {
            const isPending = a.status === "pending";
            return (
              <div key={a.id} className="card bg-base-100 shadow">
                <div className="card-body">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="badge badge-outline">{a.actionType}</span>
                        <span
                          className={`badge ${
                            a.status === "approved"
                              ? "badge-success"
                              : a.status === "denied"
                                ? "badge-error"
                                : a.status === "expired"
                                  ? "badge-warning"
                                  : "badge-info"
                          }`}
                        >
                          {a.status}
                        </span>
                        {a.agentDid && (
                          <code className="text-xs text-base-content/70">{a.agentDid}</code>
                        )}
                      </div>
                      {a.target && (
                        <div className="text-sm">
                          target: <code className="text-xs">{a.target}</code>
                        </div>
                      )}
                      <div className="text-xs text-base-content/70">
                        requested {new Date(a.requestedAt).toLocaleString()}
                      </div>
                    </div>
                    {isPending && (
                      <div className="flex items-center gap-2">
                        <input
                          className="input input-bordered input-sm w-48"
                          placeholder="optional comment"
                          value={commentDraft[a.id] ?? ""}
                          onChange={(e) =>
                            setCommentDraft((prev) => ({ ...prev, [a.id]: e.target.value }))
                          }
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
                    <details className="mt-2">
                      <summary className="text-xs cursor-pointer">payload</summary>
                      <pre className="text-xs bg-base-200 p-2 rounded mt-1 overflow-auto">
                        {JSON.stringify(a.payload, null, 2)}
                      </pre>
                    </details>
                  )}
                  {a.decisions.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {a.decisions.map((d, i) => (
                        <div key={i} className="text-xs text-base-content/70">
                          <span
                            className={`badge badge-xs mr-1 ${d.decision === "approved" ? "badge-success" : "badge-error"}`}
                          >
                            {d.decision}
                          </span>
                          by <code>{d.decidedBy}</code> at {new Date(d.decidedAt).toLocaleString()}
                          {d.comment ? ` — ${d.comment}` : ""}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </section>
    </main>
  );
}
