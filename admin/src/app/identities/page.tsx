"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Card, CardTitle } from "@/components/card";
import { CardSkeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { getAuth } from "@/lib/auth";
import { listAgtIdentities, setAgtIdentityStatus, type AgtIdentity, type AgtIdentityStatus } from "@/lib/api";

function StatusPill({ status }: { status: AgtIdentityStatus }) {
  const colors: Record<AgtIdentityStatus, string> = {
    active: "badge-success",
    suspended: "badge-warning",
    revoked: "badge-error",
  };
  return <span className={`badge ${colors[status]} badge-sm capitalize`}>{status}</span>;
}

export default function IdentitiesPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [identities, setIdentities] = useState<AgtIdentity[]>([]);
  const [busyDid, setBusyDid] = useState<string | undefined>();

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }
    void refresh();
  }, [router]);

  async function refresh() {
    const auth = getAuth();
    if (!auth) return;
    setLoading(true);
    try {
      const res = await listAgtIdentities(auth.accessToken);
      setIdentities(res.identities);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load identities");
    } finally {
      setLoading(false);
    }
  }

  async function changeStatus(did: string, status: AgtIdentityStatus) {
    const auth = getAuth();
    if (!auth) return;
    setBusyDid(did);
    try {
      await setAgtIdentityStatus(auth.accessToken, did, status);
      setIdentities((prev) => prev.map((i) => (i.did === did ? { ...i, status } : i)));
      toast.success(`Identity ${status}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setBusyDid(undefined);
    }
  }

  return (
    <div className="flex min-h-screen bg-base-200">
      <Sidebar />
      <main className="flex-1 p-4 lg:p-8 pt-16 lg:pt-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Identities</h2>
          <p className="text-sm text-base-content/50 mt-1">
            DID-anchored agent identities, their capabilities, and current status.
          </p>
        </div>

        {loading ? (
          <div className="space-y-4">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : identities.length === 0 ? (
          <Card>
            <CardTitle>No identities</CardTitle>
            <p className="text-sm text-base-content/60">
              No agent identities have been registered yet. Agents enroll via{" "}
              <code className="px-1 py-0.5 bg-base-300 rounded text-xs">POST /api/v1/identities</code>.
            </p>
          </Card>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="table table-zebra text-sm">
                <thead>
                  <tr>
                    <th>DID</th>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Capabilities</th>
                    <th>Parent</th>
                    <th>Depth</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {identities.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <Link
                          className="link link-primary font-mono text-xs"
                          href={`/identities/${encodeURIComponent(i.did)}`}
                        >
                          {i.did}
                        </Link>
                      </td>
                      <td>{i.name ?? <span className="text-base-content/40">—</span>}</td>
                      <td>
                        <StatusPill status={i.status} />
                      </td>
                      <td>
                        <span className="font-mono text-xs">
                          {i.capabilities.length === 0 ? (
                            <span className="text-base-content/40">—</span>
                          ) : (
                            i.capabilities.slice(0, 3).join(", ") + (i.capabilities.length > 3 ? "…" : "")
                          )}
                        </span>
                      </td>
                      <td>
                        {i.parentDid ? (
                          <span className="font-mono text-xs">{i.parentDid}</span>
                        ) : (
                          <span className="text-base-content/40">—</span>
                        )}
                      </td>
                      <td>{i.delegationDepth}</td>
                      <td className="text-right space-x-1">
                        {i.status === "active" && (
                          <button
                            disabled={busyDid === i.did}
                            onClick={() => changeStatus(i.did, "suspended")}
                            className="btn btn-xs btn-warning"
                          >
                            Suspend
                          </button>
                        )}
                        {i.status === "suspended" && (
                          <button
                            disabled={busyDid === i.did}
                            onClick={() => changeStatus(i.did, "active")}
                            className="btn btn-xs btn-success"
                          >
                            Resume
                          </button>
                        )}
                        {i.status !== "revoked" && (
                          <button
                            disabled={busyDid === i.did}
                            onClick={() => changeStatus(i.did, "revoked")}
                            className="btn btn-xs btn-error"
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
