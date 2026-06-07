"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Card, CardTitle } from "@/components/card";
import { CardSkeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { getAuth } from "@/lib/auth";
import { getAgtMetricsSummary, listAgtMetrics, type AgtMetric, type AgtMetricsSummary } from "@/lib/api";

const WINDOW_OPTIONS = [
  { label: "Last 1h", minutes: 60 },
  { label: "Last 24h", minutes: 24 * 60 },
  { label: "Last 7d", minutes: 7 * 24 * 60 },
];

function StatCard({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <Card>
      <div className="text-xs uppercase text-base-content/50">{label}</div>
      <div className="text-3xl font-bold mt-1">{value}</div>
      {hint && <div className="text-xs text-base-content/40 mt-1">{hint}</div>}
    </Card>
  );
}

export default function MetricsPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<AgtMetricsSummary | undefined>();
  const [recent, setRecent] = useState<AgtMetric[]>([]);
  const [windowMinutes, setWindowMinutes] = useState(60);

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }
    void load(windowMinutes);
  }, [router, windowMinutes]);

  async function load(minutes: number) {
    const auth = getAuth();
    if (!auth) return;
    setLoading(true);
    try {
      const [summaryRes, listRes] = await Promise.all([
        getAgtMetricsSummary(auth.accessToken),
        listAgtMetrics(auth.accessToken, { sinceMinutes: minutes, limit: 100 }),
      ]);
      setSummary(summaryRes);
      setRecent(listRes.metrics);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load metrics");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-base-200">
      <Sidebar />
      <main className="flex-1 p-4 lg:p-8 pt-16 lg:pt-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">Metrics</h2>
            <p className="text-sm text-base-content/50 mt-1">
              Agent-submitted runtime snapshots — useful for telemetry, trust signals, and capacity planning.
            </p>
          </div>
          <div className="join">
            {WINDOW_OPTIONS.map((o) => (
              <button
                key={o.minutes}
                onClick={() => setWindowMinutes(o.minutes)}
                className={`btn btn-sm join-item ${windowMinutes === o.minutes ? "btn-primary" : "btn-ghost"}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {loading || !summary ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <StatCard label="Total snapshots" value={summary.total} />
              <StatCard label="Distinct agents" value={summary.distinctAgents} />
              <StatCard
                label="Last 24h"
                value={summary.last24h.total}
                hint={`${summary.last24h.distinctAgents} agents`}
              />
              <StatCard label="Last hour" value={summary.lastHour.total} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
              <Card className="lg:col-span-1">
                <CardTitle>Top agents (24h)</CardTitle>
                {summary.topAgents.length === 0 ? (
                  <p className="text-sm text-base-content/40">No submissions yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {summary.topAgents.map((a, idx) => (
                      <li key={`${a.agentDid ?? "anon"}-${idx}`} className="flex items-center justify-between text-sm">
                        <span className="font-mono text-xs break-all">{a.agentDid ?? <em>(anonymous)</em>}</span>
                        <span className="badge badge-neutral">{a.total}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card className="lg:col-span-2">
                <CardTitle>Recent snapshots</CardTitle>
                {recent.length === 0 ? (
                  <p className="text-sm text-base-content/40">No snapshots in this window.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="table table-xs">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Agent DID</th>
                          <th>Snapshot</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recent.slice(0, 25).map((m) => (
                          <tr key={m.id}>
                            <td className="font-mono text-xs whitespace-nowrap">
                              {new Date(m.recordedAt).toLocaleString()}
                            </td>
                            <td className="font-mono text-xs break-all">
                              {m.agentDid ?? <em className="text-base-content/40">—</em>}
                            </td>
                            <td>
                              <code className="text-xs whitespace-pre-wrap break-all">
                                {JSON.stringify(m.snapshot)}
                              </code>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
