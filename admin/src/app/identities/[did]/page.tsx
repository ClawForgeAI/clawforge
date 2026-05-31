"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/sidebar";
import { Card, CardTitle } from "@/components/card";
import { CardSkeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { getAuth } from "@/lib/auth";
import {
  getAgtIdentity,
  listAgtIdentityDelegations,
  setAgtIdentityStatus,
  type AgtDelegation,
  type AgtIdentity,
  type AgtIdentityStatus,
} from "@/lib/api";

function StatusPill({ status }: { status: AgtIdentityStatus }) {
  const colors: Record<AgtIdentityStatus, string> = {
    active: "badge-success",
    suspended: "badge-warning",
    revoked: "badge-error",
  };
  return <span className={`badge ${colors[status]} capitalize`}>{status}</span>;
}

function DelegationTable({ rows, perspective }: { rows: AgtDelegation[]; perspective: "issuer" | "subject" }) {
  if (rows.length === 0) return <p className="text-sm text-base-content/40">None.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="table table-xs">
        <thead>
          <tr>
            <th>{perspective === "issuer" ? "Subject" : "Issuer"}</th>
            <th>Granted</th>
            <th>Denied</th>
            <th>Depth</th>
            <th>Expires</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => {
            const counterparty = perspective === "issuer" ? d.subjectDid : d.issuerDid;
            return (
              <tr key={d.id}>
                <td>
                  <Link
                    className="link link-primary font-mono text-xs"
                    href={`/identities/${encodeURIComponent(counterparty)}`}
                  >
                    {counterparty}
                  </Link>
                </td>
                <td className="font-mono text-xs">{d.grantedCapabilities.join(", ") || "—"}</td>
                <td className="font-mono text-xs">{d.deniedCapabilities.join(", ") || "—"}</td>
                <td>{d.depth}</td>
                <td className="font-mono text-xs">{d.expiresAt ? new Date(d.expiresAt).toLocaleString() : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function IdentityDetailPage() {
  const router = useRouter();
  const params = useParams<{ did: string }>();
  const did = decodeURIComponent(params.did);
  const toast = useToast();
  const [identity, setIdentity] = useState<AgtIdentity | undefined>();
  const [outgoing, setOutgoing] = useState<AgtDelegation[]>([]);
  const [incoming, setIncoming] = useState<AgtDelegation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }
    void load();
  }, [did]);

  async function load() {
    const auth = getAuth();
    if (!auth) return;
    setLoading(true);
    try {
      const [identityRes, delegationsRes] = await Promise.all([
        getAgtIdentity(auth.accessToken, did),
        listAgtIdentityDelegations(auth.accessToken, did),
      ]);
      setIdentity(identityRes);
      setOutgoing(delegationsRes.outgoing);
      setIncoming(delegationsRes.incoming);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load identity");
    } finally {
      setLoading(false);
    }
  }

  async function changeStatus(status: AgtIdentityStatus) {
    const auth = getAuth();
    if (!auth || !identity) return;
    setBusy(true);
    try {
      const updated = await setAgtIdentityStatus(auth.accessToken, identity.did, status);
      setIdentity(updated);
      toast.success(`Identity ${status}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-base-200">
      <Sidebar />
      <main className="flex-1 p-4 lg:p-8 pt-16 lg:pt-8">
        <div className="mb-2">
          <Link href="/identities" className="link link-hover text-sm text-base-content/60">
            ← Identities
          </Link>
        </div>

        {loading ? (
          <div className="space-y-4">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : !identity ? (
          <Card>
            <CardTitle>Not found</CardTitle>
            <p className="text-sm text-base-content/60">No identity matches this DID.</p>
          </Card>
        ) : (
          <div className="space-y-6 max-w-4xl">
            <Card>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold">{identity.name ?? identity.did}</h2>
                  <p className="text-xs font-mono text-base-content/60 mt-1 break-all">{identity.did}</p>
                  {identity.description && <p className="text-sm text-base-content/70 mt-2">{identity.description}</p>}
                </div>
                <StatusPill status={identity.status} />
              </div>
              <div className="divider my-3" />
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-xs text-base-content/50 uppercase">Sponsor</div>
                  <div className="font-mono text-xs">{identity.sponsor ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-base-content/50 uppercase">Parent DID</div>
                  <div className="font-mono text-xs break-all">{identity.parentDid ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-base-content/50 uppercase">Delegation depth</div>
                  <div>{identity.delegationDepth}</div>
                </div>
                <div>
                  <div className="text-xs text-base-content/50 uppercase">Expires</div>
                  <div className="font-mono text-xs">
                    {identity.expiresAt ? new Date(identity.expiresAt).toLocaleString() : "—"}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                {identity.status === "active" && (
                  <button disabled={busy} onClick={() => changeStatus("suspended")} className="btn btn-sm btn-warning">
                    Suspend
                  </button>
                )}
                {identity.status === "suspended" && (
                  <button disabled={busy} onClick={() => changeStatus("active")} className="btn btn-sm btn-success">
                    Resume
                  </button>
                )}
                {identity.status !== "revoked" && (
                  <button disabled={busy} onClick={() => changeStatus("revoked")} className="btn btn-sm btn-error">
                    Revoke
                  </button>
                )}
              </div>
            </Card>

            <Card>
              <CardTitle>Capabilities</CardTitle>
              {identity.capabilities.length === 0 ? (
                <p className="text-sm text-base-content/40">None.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {identity.capabilities.map((c) => (
                    <span key={c} className="badge badge-neutral font-mono text-xs">
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <CardTitle>Outgoing delegations</CardTitle>
              <p className="text-xs text-base-content/50 mb-2">Authority this identity has granted to others.</p>
              <DelegationTable rows={outgoing} perspective="issuer" />
            </Card>

            <Card>
              <CardTitle>Incoming delegations</CardTitle>
              <p className="text-xs text-base-content/50 mb-2">Authority this identity has received from others.</p>
              <DelegationTable rows={incoming} perspective="subject" />
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
