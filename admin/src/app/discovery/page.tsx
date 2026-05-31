"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Card, CardTitle } from "@/components/card";
import { CardSkeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { getAuth } from "@/lib/auth";
import {
  listShadowAgents,
  setShadowAgentNotes,
  setShadowAgentStatus,
  type ShadowAgent,
  type ShadowAgentStatus,
} from "@/lib/api";

const STATUS_COLOR: Record<ShadowAgentStatus, string> = {
  unknown: "badge-warning",
  investigating: "badge-info",
  known: "badge-success",
  quarantined: "badge-error",
};

const STATUS_FILTERS: { label: string; value?: ShadowAgentStatus }[] = [
  { label: "All" },
  { label: "Unknown", value: "unknown" },
  { label: "Investigating", value: "investigating" },
  { label: "Known", value: "known" },
  { label: "Quarantined", value: "quarantined" },
];

function StatusPill({ status }: { status: ShadowAgentStatus }) {
  return <span className={`badge ${STATUS_COLOR[status]} badge-sm capitalize`}>{status}</span>;
}

export default function DiscoveryPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ShadowAgent[]>([]);
  const [filter, setFilter] = useState<ShadowAgentStatus | undefined>();
  const [busyId, setBusyId] = useState<string | undefined>();
  const [editingNotes, setEditingNotes] = useState<{ id: string; value: string } | undefined>();

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }
    void refresh(filter);
  }, [router, filter]);

  async function refresh(status?: ShadowAgentStatus) {
    const auth = getAuth();
    if (!auth) return;
    setLoading(true);
    try {
      const res = await listShadowAgents(auth.accessToken, { status });
      setRows(res.shadowAgents);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load shadow agents");
    } finally {
      setLoading(false);
    }
  }

  async function changeStatus(id: string, status: ShadowAgentStatus) {
    const auth = getAuth();
    if (!auth) return;
    setBusyId(id);
    try {
      const updated = await setShadowAgentStatus(auth.accessToken, id, status);
      setRows((prev) => prev.map((r) => (r.id === id ? updated : r)));
      toast.success(`Marked as ${status}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setBusyId(undefined);
    }
  }

  async function saveNotes(id: string, notes: string) {
    const auth = getAuth();
    if (!auth) return;
    setBusyId(id);
    try {
      const updated = await setShadowAgentNotes(auth.accessToken, id, notes);
      setRows((prev) => prev.map((r) => (r.id === id ? updated : r)));
      setEditingNotes(undefined);
      toast.success("Notes saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save notes");
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <div className="flex min-h-screen bg-base-200">
      <Sidebar />
      <main className="flex-1 p-4 lg:p-8 pt-16 lg:pt-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">Discovery</h2>
            <p className="text-sm text-base-content/50 mt-1">
              Unenrolled agent runtimes detected in your environment. Promote, investigate, or quarantine each
              fingerprint as you triage.
            </p>
          </div>
          <div className="join">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.label}
                onClick={() => setFilter(f.value)}
                className={`btn btn-sm join-item ${filter === f.value ? "btn-primary" : "btn-ghost"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : rows.length === 0 ? (
          <Card>
            <CardTitle>No shadow agents</CardTitle>
            <p className="text-sm text-base-content/60">
              {filter
                ? `No agents with status “${filter}”. Try a different filter.`
                : "Nothing detected yet — the control plane will populate this list as runtimes report in via POST /api/v1/shadow-agents."}
            </p>
          </Card>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="table table-zebra text-sm">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Fingerprint</th>
                    <th>Runtime</th>
                    <th>DID hint</th>
                    <th>Capabilities</th>
                    <th>First seen</th>
                    <th>Last seen</th>
                    <th>Notes</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <StatusPill status={r.status} />
                      </td>
                      <td className="font-mono text-xs break-all">{r.fingerprint}</td>
                      <td className="font-mono text-xs">{r.runtime ?? "—"}</td>
                      <td className="font-mono text-xs break-all">{r.did ?? "—"}</td>
                      <td>
                        <span className="font-mono text-xs">
                          {r.capabilities.length === 0
                            ? "—"
                            : r.capabilities.slice(0, 3).join(", ") + (r.capabilities.length > 3 ? "…" : "")}
                        </span>
                      </td>
                      <td className="font-mono text-xs whitespace-nowrap">{new Date(r.firstSeen).toLocaleString()}</td>
                      <td className="font-mono text-xs whitespace-nowrap">{new Date(r.lastSeen).toLocaleString()}</td>
                      <td>
                        {editingNotes?.id === r.id ? (
                          <div className="flex flex-col gap-1">
                            <textarea
                              value={editingNotes.value}
                              onChange={(e) => setEditingNotes({ id: r.id, value: e.target.value })}
                              rows={2}
                              className="textarea textarea-bordered textarea-xs w-48"
                            />
                            <div className="flex gap-1">
                              <button
                                disabled={busyId === r.id}
                                onClick={() => saveNotes(r.id, editingNotes.value)}
                                className="btn btn-xs btn-primary"
                              >
                                Save
                              </button>
                              <button onClick={() => setEditingNotes(undefined)} className="btn btn-xs btn-ghost">
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setEditingNotes({ id: r.id, value: r.notes ?? "" })}
                            className="link link-hover text-xs text-base-content/70"
                          >
                            {r.notes ?? <em className="text-base-content/40">add notes</em>}
                          </button>
                        )}
                      </td>
                      <td className="text-right space-x-1">
                        {r.status !== "investigating" && (
                          <button
                            disabled={busyId === r.id}
                            onClick={() => changeStatus(r.id, "investigating")}
                            className="btn btn-xs btn-info"
                          >
                            Investigate
                          </button>
                        )}
                        {r.status !== "known" && (
                          <button
                            disabled={busyId === r.id}
                            onClick={() => changeStatus(r.id, "known")}
                            className="btn btn-xs btn-success"
                          >
                            Mark known
                          </button>
                        )}
                        {r.status !== "quarantined" && (
                          <button
                            disabled={busyId === r.id}
                            onClick={() => changeStatus(r.id, "quarantined")}
                            className="btn btn-xs btn-error"
                          >
                            Quarantine
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
