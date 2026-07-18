"use client";

/**
 * AGT-canonical audit timeline (Cut 1 step 9 — addendum §A18 Tier 1).
 *
 * Streams AuditEntry rows from `GET /api/v1/audit/:orgId/entries`, shows a
 * per-page chain-integrity badge computed via `POST /:orgId/verify`, and
 * supports basic filtering by agent DID.
 *
 * Cut 2b §A21 step 2.16 layout pass — wrapped in the shared Sidebar /
 * Card shell so this page matches the rest of the admin UI.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Card, CardTitle } from "@/components/card";
import { CardSkeleton, TableSkeleton } from "@/components/skeleton";
import { getAuth } from "@/lib/auth";
import { listAgtAuditEntries, verifyAgtAuditChain, type AgtAuditEntry } from "@/lib/agt-api";

const PAGE_SIZE = 50;

const DECISION_BADGE: Record<string, string> = {
  allow: "badge-success",
  deny: "badge-error",
  review: "badge-warning",
};

export default function AgtAuditPage() {
  const router = useRouter();
  const [auth, setAuth] = useState<ReturnType<typeof getAuth>>(null);
  const [entries, setEntries] = useState<AgtAuditEntry[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [agentDid, setAgentDid] = useState("");

  const [verifyState, setVerifyState] = useState<null | { valid: boolean; entriesChecked: number; breakAt?: string }>(
    null,
  );
  const [verifyLoading, setVerifyLoading] = useState(false);

  useEffect(() => {
    const a = getAuth();
    if (!a) {
      router.replace("/login");
      return;
    }
    setAuth(a);
  }, [router]);

  const load = useCallback(
    async (before?: string | null) => {
      if (!auth) return;
      setLoading(true);
      setError(null);
      try {
        const res = await listAgtAuditEntries(auth.accessToken, auth.orgId, {
          limit: PAGE_SIZE,
          beforeSeq: before ?? undefined,
          agentDid: agentDid.trim() || undefined,
        });
        setEntries((prev) => (before ? [...prev, ...res.entries] : res.entries));
        setNextBefore(res.nextBeforeSeq);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [auth, agentDid],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const handleVerify = async () => {
    if (!auth) return;
    setVerifyState(null);
    setVerifyLoading(true);
    try {
      const res = await verifyAgtAuditChain(auth.accessToken, auth.orgId);
      setVerifyState(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleFilter = () => {
    setEntries([]);
    setNextBefore(null);
    void load();
  };

  return (
    <div className="flex min-h-screen bg-base-200">
      <Sidebar />
      <main className="flex-1 p-4 lg:p-8 pt-16 lg:pt-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Audit Logs</h2>
          <p className="text-sm text-base-content/50 mt-1">
            Hash-chained audit entries from the AGT canonical stream. Filter by agent DID and click{" "}
            <em>Verify chain integrity</em> to walk the chain and confirm no row has been tampered with.
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
            {/* --- Controls --- */}
            <Card>
              <div className="flex items-end gap-3 flex-wrap">
                <div className="form-control flex-1 min-w-[20rem]">
                  <label className="label py-1">
                    <span className="label-text text-xs">Filter by agent DID</span>
                  </label>
                  <input
                    className="input input-bordered input-sm font-mono text-xs"
                    placeholder="did:mesh:checkout-7"
                    value={agentDid}
                    onChange={(e) => setAgentDid(e.target.value)}
                  />
                </div>
                <button className="btn btn-sm" onClick={handleFilter}>
                  Apply
                </button>
                <button className="btn btn-outline btn-sm gap-2" onClick={handleVerify} disabled={verifyLoading}>
                  {verifyLoading && <span className="loading loading-spinner loading-xs" />}
                  {verifyLoading ? "Verifying…" : "Verify chain integrity"}
                </button>
              </div>

              {verifyState && (
                <div className="mt-3">
                  {verifyState.valid ? (
                    <span className="badge badge-success badge-sm">
                      chain integrity ✓ ({verifyState.entriesChecked} entries)
                    </span>
                  ) : (
                    <span className="badge badge-error badge-sm">
                      chain break at seq {verifyState.breakAt} ({verifyState.entriesChecked} entries)
                    </span>
                  )}
                </div>
              )}
            </Card>

            {/* --- Entries table --- */}
            {loading && entries.length === 0 ? (
              <TableSkeleton rows={6} />
            ) : entries.length === 0 ? (
              <Card>
                <CardTitle>No audit entries</CardTitle>
                <p className="text-sm text-base-content/60">
                  Connect an agent via{" "}
                  <code className="px-1 py-0.5 bg-base-300 rounded text-xs">@clawforgeai/client</code> to start
                  streaming. The example at{" "}
                  <code className="px-1 py-0.5 bg-base-300 rounded text-xs">examples/cut2b-smoke.mjs</code> seeds a
                  short chain for you.
                </p>
              </Card>
            ) : (
              <Card>
                <div className="overflow-x-auto">
                  <table className="table table-zebra text-sm">
                    <thead>
                      <tr>
                        <th>Seq</th>
                        <th>Timestamp</th>
                        <th>Agent</th>
                        <th>Action</th>
                        <th>Decision</th>
                        <th>Rule</th>
                        <th>Hash</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((e) => (
                        <tr key={e.chainSeq}>
                          <td>
                            <code className="font-mono text-xs">{e.chainSeq}</code>
                          </td>
                          <td className="text-xs whitespace-nowrap">{new Date(e.timestamp).toLocaleString()}</td>
                          <td>
                            <code className="font-mono text-xs break-all">{e.agentId}</code>
                          </td>
                          <td className="text-sm">{e.action}</td>
                          <td>
                            <span
                              className={`badge ${DECISION_BADGE[e.decision] ?? "badge-ghost"} badge-sm capitalize`}
                            >
                              {e.decision}
                            </span>
                          </td>
                          <td className="text-xs text-base-content/60">
                            {e.policyName ? (
                              <span>
                                {e.policyName}
                                {e.matchedRule ? `/${e.matchedRule}` : ""}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="font-mono text-xs" title={e.hash}>
                            {e.hash.slice(0, 12)}…
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {nextBefore && (
                  <div className="mt-4 flex justify-center">
                    <button className="btn btn-outline btn-sm" onClick={() => load(nextBefore)} disabled={loading}>
                      {loading ? "Loading…" : "Load more"}
                    </button>
                  </div>
                )}
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
