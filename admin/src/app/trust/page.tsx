"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Card, CardTitle } from "@/components/card";
import { CardSkeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { getAuth } from "@/lib/auth";
import { listTrustScores, type TrustScore, type TrustTier } from "@/lib/api";

const TIER_BADGE: Record<TrustTier, string> = {
  Untrusted: "badge-error",
  Provisional: "badge-warning",
  Trusted: "badge-info",
  Verified: "badge-success",
};

/**
 * Map a 0-100 score to a continuous red→amber→green background, with white
 * text on saturated cells. Uses HSL so we don't need a tailwind safelist.
 */
function heatStyle(score: number | undefined): { backgroundColor: string; color: string } {
  if (score === undefined || Number.isNaN(score)) {
    return { backgroundColor: "transparent", color: "inherit" };
  }
  const clamped = Math.max(0, Math.min(100, score));
  // 0 -> red (0deg), 100 -> green (120deg)
  const hue = (clamped / 100) * 120;
  return {
    backgroundColor: `hsl(${hue} 65% 78%)`,
    color: "rgb(20, 30, 20)",
  };
}

export default function TrustHeatmapPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<TrustScore[]>([]);
  const [dimensionKeys, setDimensionKeys] = useState<string[]>([]);

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }
    void load();
  }, [router]);

  async function load() {
    const auth = getAuth();
    if (!auth) return;
    setLoading(true);
    try {
      const res = await listTrustScores(auth.accessToken);
      setRows(res.trustScores);
      setDimensionKeys(res.dimensionKeys);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load trust scores");
    } finally {
      setLoading(false);
    }
  }

  const tierCounts = useMemo(() => {
    const counts: Record<TrustTier, number> = {
      Untrusted: 0,
      Provisional: 0,
      Trusted: 0,
      Verified: 0,
    };
    for (const r of rows) counts[r.tier] += 1;
    return counts;
  }, [rows]);

  return (
    <div className="flex min-h-screen bg-base-200">
      <Sidebar />
      <main className="flex-1 p-4 lg:p-8 pt-16 lg:pt-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Trust</h2>
          <p className="text-sm text-base-content/50 mt-1">
            Per-agent trust scores. Red cells flag risky dimensions, green cells confirm strong signal.
          </p>
        </div>

        {loading ? (
          <div className="space-y-4">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {(Object.keys(tierCounts) as TrustTier[]).map((t) => (
                <Card key={t}>
                  <div className="flex items-center justify-between">
                    <span className={`badge ${TIER_BADGE[t]} capitalize`}>{t}</span>
                    <span className="text-2xl font-bold">{tierCounts[t]}</span>
                  </div>
                </Card>
              ))}
            </div>

            {rows.length === 0 ? (
              <Card>
                <CardTitle>No trust signal yet</CardTitle>
                <p className="text-sm text-base-content/60">
                  No agents have reported a trust score. Score data lands in this view as agents emit trust-relevant
                  signals via <code className="px-1 py-0.5 bg-base-300 rounded text-xs">POST /api/v1/trust-scores</code>
                  .
                </p>
              </Card>
            ) : (
              <Card>
                <CardTitle>Heatmap</CardTitle>
                <div className="overflow-x-auto">
                  <table className="table table-xs">
                    <thead>
                      <tr>
                        <th className="sticky left-0 bg-base-100 z-10">Agent</th>
                        <th>Tier</th>
                        <th>Overall</th>
                        {dimensionKeys.map((k) => (
                          <th key={k} className="text-center capitalize">
                            {k.replace(/_/g, " ")}
                          </th>
                        ))}
                        <th className="text-right">Last updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id}>
                          <td className="sticky left-0 bg-base-100 z-10 font-mono text-xs break-all max-w-[16ch]">
                            {r.did}
                          </td>
                          <td>
                            <span className={`badge ${TIER_BADGE[r.tier]} badge-sm capitalize`}>{r.tier}</span>
                          </td>
                          <td className="font-mono text-xs text-center" style={heatStyle(r.overall)}>
                            {r.overall}
                          </td>
                          {dimensionKeys.map((k) => {
                            const v = r.dimensions[k];
                            return (
                              <td
                                key={k}
                                className="font-mono text-xs text-center"
                                style={heatStyle(v)}
                                title={v === undefined ? "no score" : `${k}: ${v}`}
                              >
                                {v === undefined ? "—" : v}
                              </td>
                            );
                          })}
                          <td className="font-mono text-xs whitespace-nowrap text-right">
                            {new Date(r.lastUpdated).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex items-center gap-2 text-xs text-base-content/60">
                  <span>Score legend</span>
                  <div className="flex flex-1 h-2 rounded overflow-hidden max-w-md">
                    {Array.from({ length: 20 }, (_, i) => i * 5).map((s) => (
                      <div key={s} className="flex-1" style={{ backgroundColor: heatStyle(s).backgroundColor }} />
                    ))}
                  </div>
                  <span>0</span>
                  <span className="text-base-content/40">→</span>
                  <span>100</span>
                </div>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
