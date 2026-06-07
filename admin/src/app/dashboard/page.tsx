"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Sidebar } from "@/components/sidebar";
import { Card, CardTitle, StatCard } from "@/components/card";
import { Badge } from "@/components/badge";
import { StatSkeleton, TableSkeleton } from "@/components/skeleton";
import { getAuth } from "@/lib/auth";
import { getUsers, getConnectedClients } from "@/lib/api";
import { getDashboardStats, listAgtAuditEntries, type AgtAuditEntry } from "@/lib/agt-api";

const POLL_INTERVAL_MS = 30_000;

export default function DashboardPage() {
  const router = useRouter();
  const [recentEntries, setRecentEntries] = useState<AgtAuditEntry[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [userCount, setUserCount] = useState(0);
  const [toolCallsAllowed, setToolCallsAllowed] = useState(0);
  const [toolCallsBlocked, setToolCallsBlocked] = useState(0);
  const [onlineClients, setOnlineClients] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("dashboard-live") !== "false";
    }
    return true;
  });
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  function toggleLive() {
    setIsLive((prev) => {
      const next = !prev;
      localStorage.setItem("dashboard-live", String(next));
      return next;
    });
  }

  const loadData = useCallback(async () => {
    const auth = getAuth();
    if (!auth) return;
    const { orgId, accessToken } = auth;

    // AGT-only sources (per Cut 2a §A21 — hard cut from legacy tables).
    // Active Users / Clients Online keep their legacy queries because no AGT
    // equivalent exists yet (Cut 2b adds identity tracking via `identities`).
    const [statsData, recentData, usersData, clientsData] = await Promise.allSettled([
      getDashboardStats(accessToken),
      listAgtAuditEntries(accessToken, orgId, { limit: 20 }),
      getUsers(orgId, accessToken),
      getConnectedClients(orgId, accessToken),
    ]);

    if (statsData.status === "fulfilled") {
      setToolCallsAllowed(statsData.value.allowedCount);
      setToolCallsBlocked(statsData.value.deniedCount);
      setPendingCount(statsData.value.pendingApprovals);
    }
    if (recentData.status === "fulfilled") setRecentEntries(recentData.value.entries);
    if (usersData.status === "fulfilled") setUserCount(usersData.value.users.length);
    if (clientsData.status === "fulfilled") setOnlineClients(clientsData.value.summary.online);

    setLoading(false);
    setLastUpdated(new Date());
  }, []);

  // Initial load
  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }
    loadData();
  }, [router, loadData]);

  // Polling
  useEffect(() => {
    if (!isLive) return;

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        loadData();
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isLive, loadData]);

  return (
    <div className="flex min-h-screen bg-base-200">
      <Sidebar />
      <main className="flex-1 p-4 lg:p-8 pt-16 lg:pt-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">Dashboard</h2>
            <p className="text-sm text-base-content/50 mt-1">Overview of your organization&apos;s governance status</p>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-base-content/40">Updated {lastUpdated.toLocaleTimeString()}</span>
            )}
            <button onClick={toggleLive} className={`btn btn-sm gap-2 ${isLive ? "btn-success" : "btn-ghost"}`}>
              <span
                className={`w-2 h-2 rounded-full ${isLive ? "bg-success-content animate-pulse" : "bg-base-content/30"}`}
              />
              {isLive ? "Live" : "Paused"}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <StatSkeleton key={i} />
              ))}
            </div>
            <TableSkeleton />
          </div>
        ) : (
          <>
            {/* Kill switch banner — moves to /kill-switch panel in Cut 2b
                (the new `kill_switch_scopes` table is org-wide rather than
                embedded in the policy row, so the banner needs a different
                data source than the legacy `policy.killSwitch.active`). */}

            {/* Stats row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
              <StatCard label="Active Users" value={userCount} icon={<UsersSmIcon />} />
              <StatCard label="Clients Online" value={onlineClients} icon={<MonitorSmIcon />} />
              <StatCard label="Calls Allowed" value={toolCallsAllowed} variant="success" icon={<CheckSmIcon />} />
              <StatCard label="Calls Blocked" value={toolCallsBlocked} variant="danger" icon={<XSmIcon />} />
              <StatCard label="Pending Reviews" value={pendingCount} variant="warning" icon={<ClockSmIcon />} />
            </div>

            {/* Recent audit entries (AGT chain) */}
            <Card>
              <div className="flex items-center justify-between mb-1">
                <CardTitle className="mb-0">Recent Activity</CardTitle>
                <button onClick={() => router.push("/audit")} className="btn btn-ghost btn-xs text-primary">
                  View all
                </button>
              </div>
              {recentEntries.length === 0 ? (
                <div className="text-center py-10 text-base-content/40">
                  <p className="text-sm">No recent activity</p>
                  <p className="text-xs mt-1">Agent runs land here via the AGT audit pipeline.</p>
                </div>
              ) : (
                <div className="overflow-x-auto -mx-5">
                  <table className="table table-sm">
                    <thead>
                      <tr className="text-base-content/40 text-xs uppercase">
                        <th>Time</th>
                        <th>Agent</th>
                        <th>Action</th>
                        <th>Rule</th>
                        <th>Decision</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentEntries.slice(0, 10).map((entry, i) => (
                        <motion.tr
                          key={entry.chainSeq}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.03 }}
                          className="table-row-hover"
                        >
                          <td className="text-base-content/50 whitespace-nowrap text-xs">
                            {new Date(entry.timestamp).toLocaleTimeString()}
                          </td>
                          <td className="font-mono text-xs" title={entry.agentId}>
                            {entry.agentId.length > 24 ? entry.agentId.slice(0, 24) + "…" : entry.agentId}
                          </td>
                          <td className="text-sm">{entry.action}</td>
                          <td className="font-mono text-xs text-base-content/50">{entry.matchedRule ?? "-"}</td>
                          <td>
                            <Badge
                              variant={
                                entry.decision === "allow"
                                  ? "success"
                                  : entry.decision === "deny"
                                    ? "danger"
                                    : "warning"
                              }
                            >
                              {entry.decision}
                            </Badge>
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </main>
    </div>
  );
}

function UsersSmIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
    </svg>
  );
}

function MonitorSmIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

function CheckSmIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
    </svg>
  );
}

function XSmIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function ClockSmIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}
