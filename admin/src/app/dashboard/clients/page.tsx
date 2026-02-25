"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Sidebar } from "@/components/sidebar";
import { Card, StatCard } from "@/components/card";
import { Badge } from "@/components/badge";
import { StatSkeleton, TableSkeleton } from "@/components/skeleton";
import { getAuth } from "@/lib/auth";
import { getConnectedClients } from "@/lib/api";
import type { ConnectedClient, ClientsSummary } from "@/lib/api";

export default function ConnectedClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<ConnectedClient[]>([]);
  const [summary, setSummary] = useState<ClientsSummary>({ total: 0, online: 0, offline: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "online" | "offline">("all");

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }
    loadClients();
    const interval = setInterval(loadClients, 30000);
    return () => clearInterval(interval);
  }, [router]);

  async function loadClients() {
    const auth = getAuth();
    if (!auth) return;
    try {
      const data = await getConnectedClients(auth.orgId, auth.accessToken);
      setClients(data.clients);
      setSummary(data.summary);
    } catch {
      // ignore
    }
    setLoading(false);
  }

  const filtered = filter === "all" ? clients : clients.filter((c) => c.status === filter);

  function formatLastSeen(ts: string) {
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  }

  return (
    <div className="flex min-h-screen bg-base-200">
      <Sidebar />
      <main className="flex-1 p-4 lg:p-8 pt-16 lg:pt-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Connected Clients</h2>
          <p className="text-sm text-base-content/50 mt-1">Monitor active agent connections across your organization</p>
        </div>

        {loading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <StatSkeleton key={i} />
              ))}
            </div>
            <TableSkeleton />
          </div>
        ) : (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <StatCard label="Total Clients" value={summary.total} />
              <StatCard label="Online" value={summary.online} variant="success" />
              <StatCard label="Offline" value={summary.offline} variant="danger" />
            </div>

            {/* Filter tabs */}
            <div className="tabs tabs-boxed bg-base-100 p-1 mb-6 w-fit border border-base-300/50">
              {(["all", "online", "offline"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`tab tab-sm gap-2 capitalize ${filter === f ? "tab-active" : ""}`}
                >
                  {f}
                  <span className="badge badge-sm badge-ghost">
                    {f === "all" ? summary.total : f === "online" ? summary.online : summary.offline}
                  </span>
                </button>
              ))}
            </div>

            {/* Clients table */}
            <Card>
              {filtered.length === 0 ? (
                <div className="text-center py-10 text-base-content/40">
                  <p className="text-sm">No clients found</p>
                </div>
              ) : (
                <div className="overflow-x-auto -mx-5">
                  <table className="table table-sm">
                    <thead>
                      <tr className="text-base-content/40 text-xs uppercase">
                        <th>Status</th>
                        <th>User</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Client Version</th>
                        <th>Last Seen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((client, i) => (
                        <motion.tr
                          key={client.userId}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.03 }}
                          className="table-row-hover"
                        >
                          <td>
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${
                                client.status === "online" ? "bg-success animate-pulse" : "bg-base-content/20"
                              }`} />
                              <Badge variant={client.status === "online" ? "success" : "default"}>
                                {client.status}
                              </Badge>
                            </div>
                          </td>
                          <td className="font-medium">{client.name ?? "-"}</td>
                          <td className="text-base-content/50">{client.email}</td>
                          <td>
                            <Badge variant={client.role === "admin" ? "info" : "default"}>
                              {client.role}
                            </Badge>
                          </td>
                          <td className="font-mono text-xs text-base-content/50">
                            {client.clientVersion ?? "-"}
                          </td>
                          <td className="text-base-content/50 text-sm">
                            {formatLastSeen(client.lastHeartbeatAt)}
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex items-center gap-2 mt-3 text-xs text-base-content/30">
                <span className="loading loading-dots loading-xs" />
                Auto-refreshes every 30 seconds
              </div>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
