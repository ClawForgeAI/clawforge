"use client";

/**
 * AGT-canonical audit timeline (Cut 1 step 9 — addendum §A18 Tier 1).
 *
 * Streams AuditEntry rows from `GET /api/v1/audit/:orgId/entries`, shows a
 * per-page chain-integrity badge computed via `POST /:orgId/verify`, and
 * supports basic filtering by agent DID.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { listAgtAuditEntries, verifyAgtAuditChain, type AgtAuditEntry } from "@/lib/agt-api";

const PAGE_SIZE = 50;

export default function AgtAuditPage() {
  const router = useRouter();
  const [auth, setAuth] = useState<ReturnType<typeof getAuth>>(null);
  const [entries, setEntries] = useState<AgtAuditEntry[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [agentDid, setAgentDid] = useState("");

  const [verifyState, setVerifyState] = useState<
    null | { valid: boolean; entriesChecked: number; breakAt?: string }
  >(null);
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

  if (!auth) return <main className="p-8">Loading…</main>;

  return (
    <main className="p-8 max-w-7xl mx-auto space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">AGT Audit Timeline</h1>
        <p className="text-base-content/70">
          Hash-chained audit records from the AGT canonical stream.{" "}
          <code className="text-xs">/api/v1/audit/{auth.orgId}/entries</code>
        </p>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      <section className="card bg-base-100 shadow-lg">
        <div className="card-body flex-row items-center gap-4 flex-wrap">
          <label className="form-control flex-1 min-w-[20rem]">
            <span className="label-text">Filter by agent DID</span>
            <input
              className="input input-bordered w-full"
              placeholder="did:mesh:checkout-7"
              value={agentDid}
              onChange={(e) => setAgentDid(e.target.value)}
            />
          </label>
          <button className="btn" onClick={handleFilter}>
            Apply
          </button>
          <button className="btn btn-outline" onClick={handleVerify} disabled={verifyLoading}>
            {verifyLoading ? "Verifying…" : "Verify chain integrity"}
          </button>
        </div>
        {verifyState && (
          <div className="px-6 pb-4">
            {verifyState.valid ? (
              <span className="badge badge-success">
                chain integrity ✓ ({verifyState.entriesChecked} entries)
              </span>
            ) : (
              <span className="badge badge-error">
                chain break at seq {verifyState.breakAt} ({verifyState.entriesChecked} entries)
              </span>
            )}
          </div>
        )}
      </section>

      <section className="card bg-base-100 shadow-lg">
        <div className="card-body">
          {loading && entries.length === 0 ? (
            <div>Loading…</div>
          ) : entries.length === 0 ? (
            <div className="text-base-content/60">
              No AGT audit entries yet. Connect an agent via{" "}
              <code className="text-xs">@clawforgeai/client</code> to start streaming.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-zebra">
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
                        <code className="text-xs">{e.chainSeq}</code>
                      </td>
                      <td className="text-xs">{new Date(e.timestamp).toLocaleString()}</td>
                      <td>
                        <code className="text-xs">{e.agentId}</code>
                      </td>
                      <td>{e.action}</td>
                      <td>
                        <span
                          className={`badge ${
                            e.decision === "allow"
                              ? "badge-success"
                              : e.decision === "deny"
                                ? "badge-error"
                                : "badge-warning"
                          }`}
                        >
                          {e.decision}
                        </span>
                      </td>
                      <td className="text-xs">
                        {e.policyName ? (
                          <span>
                            {e.policyName}
                            {e.matchedRule ? `/${e.matchedRule}` : ""}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="text-xs font-mono" title={e.hash}>
                        {e.hash.slice(0, 12)}…
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {nextBefore && (
            <div className="card-actions justify-center mt-3">
              <button className="btn btn-outline" onClick={() => load(nextBefore)} disabled={loading}>
                {loading ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
