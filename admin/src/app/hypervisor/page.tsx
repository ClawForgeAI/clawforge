"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Card, CardTitle } from "@/components/card";
import { CardSkeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { getAuth } from "@/lib/auth";
import {
  listHypervisorAgents,
  pauseHypervisorAgent,
  resumeHypervisorAgent,
  terminateHypervisorAgent,
  type AgentRuntime,
  type HypervisorAgent,
  type HypervisorSummary,
} from "@/lib/api";
import { subscribeOrgEvents } from "@/lib/sse";

const RUNTIME_BADGE: Record<AgentRuntime, string> = {
  live: "badge-success",
  idle: "badge-warning",
  offline: "badge-ghost",
};

const STATUS_BADGE: Record<HypervisorAgent["status"], string> = {
  active: "badge-success",
  suspended: "badge-warning",
  revoked: "badge-error",
};

function StatCard({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <Card className={className}>
      <div className="text-xs uppercase text-base-content/50">{label}</div>
      <div className="text-3xl font-bold mt-1">{value}</div>
    </Card>
  );
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return `${Math.floor(diff / 1_000)}s ago`;
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 24 * 60 * 60_000) return `${Math.floor(diff / (60 * 60_000))}h ago`;
  return `${Math.floor(diff / (24 * 60 * 60_000))}d ago`;
}

export default function HypervisorPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<HypervisorAgent[]>([]);
  const [summary, setSummary] = useState<HypervisorSummary | undefined>();
  const [orgKillSwitch, setOrgKillSwitch] = useState(false);
  const [busyDid, setBusyDid] = useState<string | undefined>();
  const [confirming, setConfirming] = useState<{ did: string; action: "terminate" } | undefined>();
  const unsubRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }
    void refresh();
    unsubRef.current = subscribeOrgEvents(auth.orgId, auth.accessToken, (event) => {
      if (event.event === "identity_changed" || event.event === "kill_switch") {
        void refresh();
      }
    });
    return () => unsubRef.current?.();
  }, [router]);

  async function refresh() {
    const auth = getAuth();
    if (!auth) return;
    setLoading(true);
    try {
      const res = await listHypervisorAgents(auth.accessToken);
      setAgents(res.agents);
      setSummary(res.summary);
      setOrgKillSwitch(res.orgKillSwitch);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load hypervisor data");
    } finally {
      setLoading(false);
    }
  }

  async function pause(did: string) {
    const auth = getAuth();
    if (!auth) return;
    setBusyDid(did);
    try {
      await pauseHypervisorAgent(auth.accessToken, did);
      toast.success("Agent paused");
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to pause agent");
    } finally {
      setBusyDid(undefined);
    }
  }

  async function resume(did: string) {
    const auth = getAuth();
    if (!auth) return;
    setBusyDid(did);
    try {
      await resumeHypervisorAgent(auth.accessToken, did);
      toast.success("Agent resumed");
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resume agent");
    } finally {
      setBusyDid(undefined);
    }
  }

  async function terminate(did: string) {
    const auth = getAuth();
    if (!auth) return;
    setBusyDid(did);
    try {
      await terminateHypervisorAgent(auth.accessToken, did);
      toast.success("Agent terminated");
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to terminate agent");
    } finally {
      setBusyDid(undefined);
      setConfirming(undefined);
    }
  }

  return (
    <div className="flex min-h-screen bg-base-200">
      <Sidebar />
      <main className="flex-1 p-4 lg:p-8 pt-16 lg:pt-8">
        <div className="mb-6 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">Agent Hypervisor</h2>
            <p className="text-sm text-base-content/50 mt-1">
              Live runtime overview of every enrolled agent: heartbeat band, kill-switch state, and direct lifecycle
              controls.
            </p>
          </div>
          <button onClick={() => void refresh()} className="btn btn-ghost btn-sm">
            Refresh
          </button>
        </div>

        {orgKillSwitch && (
          <div className="alert alert-error mb-4">
            <span>Org-wide kill switch is active — all agents are blocked regardless of individual runtime state.</span>
          </div>
        )}

        {loading || !summary ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <StatCard label="Total" value={summary.total} />
              <StatCard label="Live" value={summary.live} className="border-success/30" />
              <StatCard label="Idle" value={summary.idle} className="border-warning/30" />
              <StatCard label="Offline" value={summary.offline} className="border-base-300" />
              <StatCard label="Kill-switched" value={summary.killSwitched} className="border-error/30" />
            </div>

            {agents.length === 0 ? (
              <Card>
                <CardTitle>No agents enrolled</CardTitle>
                <p className="text-sm text-base-content/60">
                  Register agents under{" "}
                  <a href="/identities" className="link link-primary">
                    Identities
                  </a>{" "}
                  first.
                </p>
              </Card>
            ) : (
              <Card>
                <div className="overflow-x-auto">
                  <table className="table table-zebra text-sm">
                    <thead>
                      <tr>
                        <th>Agent</th>
                        <th>Status</th>
                        <th>Runtime</th>
                        <th>Kill switch</th>
                        <th>Last seen</th>
                        <th>Capabilities</th>
                        <th className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agents.map((a) => (
                        <tr key={a.did}>
                          <td>
                            <div className="font-semibold">
                              {a.name ?? <em className="text-base-content/40">unnamed</em>}
                            </div>
                            <div className="font-mono text-[10px] text-base-content/50 break-all">{a.did}</div>
                          </td>
                          <td>
                            <span className={`badge ${STATUS_BADGE[a.status]} badge-sm capitalize`}>{a.status}</span>
                          </td>
                          <td>
                            <span className={`badge ${RUNTIME_BADGE[a.runtime]} badge-sm capitalize`}>{a.runtime}</span>
                          </td>
                          <td>
                            {a.killSwitchActive ? (
                              <span className="badge badge-error badge-sm">active</span>
                            ) : (
                              <span className="text-base-content/40 text-xs">—</span>
                            )}
                          </td>
                          <td className="font-mono text-xs whitespace-nowrap">{timeAgo(a.lastSeenAt)}</td>
                          <td>
                            <span className="font-mono text-xs">
                              {a.capabilities.length === 0
                                ? "—"
                                : a.capabilities.slice(0, 2).join(", ") + (a.capabilities.length > 2 ? "…" : "")}
                            </span>
                          </td>
                          <td className="text-right space-x-1">
                            {a.status === "active" && (
                              <button
                                disabled={busyDid === a.did}
                                onClick={() => pause(a.did)}
                                className="btn btn-xs btn-warning"
                              >
                                Pause
                              </button>
                            )}
                            {a.status === "suspended" && (
                              <button
                                disabled={busyDid === a.did}
                                onClick={() => resume(a.did)}
                                className="btn btn-xs btn-success"
                              >
                                Resume
                              </button>
                            )}
                            {a.status !== "revoked" && (
                              <button
                                disabled={busyDid === a.did}
                                onClick={() => setConfirming({ did: a.did, action: "terminate" })}
                                className="btn btn-xs btn-error"
                              >
                                Terminate
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
          </>
        )}

        {confirming && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
            onClick={() => setConfirming(undefined)}
          >
            <div
              className="card bg-base-100 shadow-xl border border-base-300 max-w-md w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="card-body">
                <h3 className="text-lg font-bold">Terminate agent?</h3>
                <p className="text-sm text-base-content/60 mt-1">
                  This will revoke the identity and open an agent-scoped kill switch. The agent will be blocked
                  immediately and cannot resume without re-enrollment.
                </p>
                <p className="text-xs font-mono text-base-content/50 mt-2 break-all">{confirming.did}</p>
                <div className="card-actions justify-end mt-4">
                  <button onClick={() => setConfirming(undefined)} className="btn btn-ghost btn-sm">
                    Cancel
                  </button>
                  <button onClick={() => terminate(confirming.did)} className="btn btn-error btn-sm">
                    Terminate
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
