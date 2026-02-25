"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Sidebar } from "@/components/sidebar";
import { Card, CardTitle, StatCard } from "@/components/card";
import { Badge } from "@/components/badge";
import { StatSkeleton, TableSkeleton } from "@/components/skeleton";
import { getAuth } from "@/lib/auth";
import { getPolicy, queryAudit, getPendingSkills, getUsers, getConnectedClients } from "@/lib/api";
import type { EffectivePolicy, AuditEvent } from "@/lib/api";

export default function DashboardPage() {
  const router = useRouter();
  const [policy, setPolicy] = useState<EffectivePolicy | null>(null);
  const [recentEvents, setRecentEvents] = useState<AuditEvent[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [userCount, setUserCount] = useState(0);
  const [toolCallsAllowed, setToolCallsAllowed] = useState(0);
  const [toolCallsBlocked, setToolCallsBlocked] = useState(0);
  const [onlineClients, setOnlineClients] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }

    async function load() {
      const auth = getAuth()!;
      const { orgId, accessToken } = auth;

      const [policyData, auditData, skillsData, usersData, clientsData] = await Promise.allSettled([
        getPolicy(orgId, accessToken),
        queryAudit(orgId, accessToken, { limit: "20" }),
        getPendingSkills(orgId, accessToken),
        getUsers(orgId, accessToken),
        getConnectedClients(orgId, accessToken),
      ]);

      if (policyData.status === "fulfilled") setPolicy(policyData.value);
      if (auditData.status === "fulfilled") {
        const events = auditData.value.events;
        setRecentEvents(events);
        setToolCallsAllowed(events.filter((e) => e.outcome === "allowed").length);
        setToolCallsBlocked(events.filter((e) => e.outcome === "blocked").length);
      }
      if (skillsData.status === "fulfilled") setPendingCount(skillsData.value.submissions.length);
      if (usersData.status === "fulfilled") setUserCount(usersData.value.users.length);
      if (clientsData.status === "fulfilled") setOnlineClients(clientsData.value.summary.online);

      setLoading(false);
    }

    load();
  }, [router]);

  return (
    <div className="flex min-h-screen bg-base-200">
      <Sidebar />
      <main className="flex-1 p-4 lg:p-8 pt-16 lg:pt-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Dashboard</h2>
          <p className="text-sm text-base-content/50 mt-1">Overview of your organization&apos;s governance status</p>
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
            {/* Kill switch banner */}
            {policy?.killSwitch.active && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="alert alert-error mb-6 shadow-md"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10" />
                </svg>
                <div>
                  <h3 className="font-bold">Kill Switch Active</h3>
                  <p className="text-sm opacity-80">
                    {policy.killSwitch.message ?? "All agent tool calls are currently blocked."}
                  </p>
                </div>
              </motion.div>
            )}

            {/* Stats row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
              <StatCard
                label="Active Users"
                value={userCount}
                icon={<UsersSmIcon />}
              />
              <StatCard
                label="Clients Online"
                value={onlineClients}
                icon={<MonitorSmIcon />}
              />
              <StatCard
                label="Calls Allowed"
                value={toolCallsAllowed}
                variant="success"
                icon={<CheckSmIcon />}
              />
              <StatCard
                label="Calls Blocked"
                value={toolCallsBlocked}
                variant="danger"
                icon={<XSmIcon />}
              />
              <StatCard
                label="Pending Reviews"
                value={pendingCount}
                variant="warning"
                icon={<ClockSmIcon />}
              />
            </div>

            {/* Recent audit events */}
            <Card>
              <div className="flex items-center justify-between mb-1">
                <CardTitle className="mb-0">Recent Activity</CardTitle>
                <button
                  onClick={() => router.push("/audit")}
                  className="btn btn-ghost btn-xs text-primary"
                >
                  View all
                </button>
              </div>
              {recentEvents.length === 0 ? (
                <div className="text-center py-10 text-base-content/40">
                  <p className="text-sm">No recent events</p>
                </div>
              ) : (
                <div className="overflow-x-auto -mx-5">
                  <table className="table table-sm">
                    <thead>
                      <tr className="text-base-content/40 text-xs uppercase">
                        <th>Time</th>
                        <th>User</th>
                        <th>Event</th>
                        <th>Tool</th>
                        <th>Outcome</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentEvents.slice(0, 10).map((event, i) => (
                        <motion.tr
                          key={event.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.03 }}
                          className="table-row-hover"
                        >
                          <td className="text-base-content/50 whitespace-nowrap text-xs">
                            {new Date(event.timestamp).toLocaleTimeString()}
                          </td>
                          <td className="font-mono text-xs">{event.userId.slice(0, 8)}...</td>
                          <td className="text-sm">{event.eventType}</td>
                          <td className="font-mono text-xs text-base-content/50">{event.toolName ?? "-"}</td>
                          <td>
                            <Badge variant={event.outcome === "allowed" ? "success" : "danger"}>
                              {event.outcome}
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
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
    </svg>
  );
}

function MonitorSmIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" />
    </svg>
  );
}

function CheckSmIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
    </svg>
  );
}

function XSmIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function ClockSmIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
    </svg>
  );
}
