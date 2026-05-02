"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Sidebar } from "@/components/sidebar";
import { Card, StatCard } from "@/components/card";
import { Badge } from "@/components/badge";
import { StatSkeleton, TableSkeleton } from "@/components/skeleton";
import { getAuth } from "@/lib/auth";
import { getConnectedClients, updateClientMetadata } from "@/lib/api";
import type { ConnectedClient, ClientsSummary, ClientFacets } from "@/lib/api";

export default function ConnectedClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<ConnectedClient[]>([]);
  const [summary, setSummary] = useState<ClientsSummary>({ total: 0, online: 0, offline: 0 });
  const [facets, setFacets] = useState<ClientFacets>({ tags: [], groups: [] });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "online" | "offline">("all");
  const [selectedTag, setSelectedTag] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");

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
      const data = await getConnectedClients(auth.orgId, auth.accessToken, {
        status: filter === "all" ? undefined : filter,
        tag: selectedTag || undefined,
        group: selectedGroup || undefined,
      });
      setClients(data.clients);
      setSummary(data.summary);
      setFacets(data.facets);
    } catch {
      // ignore
    }
    setLoading(false);
  }

  const groupedClients = clients.reduce<Record<string, ConnectedClient[]>>((acc, client) => {
    const groupKey = client.groupName?.trim() || "Ungrouped";
    if (!acc[groupKey]) acc[groupKey] = [];
    acc[groupKey].push(client);
    return acc;
  }, {});

  function formatLastSeen(ts: string) {
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  }

  async function editClientMetadata(client: ConnectedClient) {
    const auth = getAuth();
    if (!auth) return;

    const currentTags = client.tags.join(", ");
    const nextTags = window.prompt("Set comma-separated tags for this instance.", currentTags);
    if (nextTags === null) return;
    const nextGroup = window.prompt("Set group name for this instance (leave empty to clear).", client.groupName ?? "");
    if (nextGroup === null) return;

    const tags = nextTags
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
    await updateClientMetadata(auth.orgId, client.userId, auth.accessToken, {
      groupName: nextGroup.trim() ? nextGroup.trim() : null,
      tags,
    });
    await loadClients();
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

            {/* Fleet filters */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <div className="tabs tabs-boxed bg-base-100 p-1 w-fit border border-base-300/50">
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
              <select
                className="select select-sm select-bordered"
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(e.target.value)}
              >
                <option value="">All groups</option>
                {facets.groups.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
              <select
                className="select select-sm select-bordered"
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value)}
              >
                <option value="">All tags</option>
                {facets.tags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
              <button className="btn btn-sm btn-ghost" onClick={() => void loadClients()}>
                Apply filters
              </button>
            </div>

            {/* Grouped fleet table */}
            <Card>
              {clients.length === 0 ? (
                <div className="text-center py-10 text-base-content/40">
                  <p className="text-sm">No clients found</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {Object.entries(groupedClients)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([groupName, groupClients]) => (
                      <div key={groupName}>
                        <div className="mb-2 text-sm font-semibold text-base-content/70">
                          {groupName}{" "}
                          <span className="text-xs font-normal text-base-content/40">({groupClients.length})</span>
                        </div>
                        <div className="overflow-x-auto -mx-5">
                          <table className="table table-sm">
                            <thead>
                              <tr className="text-base-content/40 text-xs uppercase">
                                <th>Status</th>
                                <th>User</th>
                                <th>Email</th>
                                <th>Role</th>
                                <th>Tags</th>
                                <th>Client Version</th>
                                <th>Last Seen</th>
                                <th />
                              </tr>
                            </thead>
                            <tbody>
                              {groupClients.map((client, i) => (
                                <motion.tr
                                  key={client.userId}
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  transition={{ delay: i * 0.03 }}
                                  className="table-row-hover"
                                >
                                  <td>
                                    <div className="flex items-center gap-2">
                                      <div
                                        className={`w-2 h-2 rounded-full ${
                                          client.status === "online" ? "bg-success animate-pulse" : "bg-base-content/20"
                                        }`}
                                      />
                                      <Badge variant={client.status === "online" ? "success" : "default"}>
                                        {client.status}
                                      </Badge>
                                    </div>
                                  </td>
                                  <td className="font-medium">{client.name ?? "-"}</td>
                                  <td className="text-base-content/50">{client.email}</td>
                                  <td>
                                    <Badge variant={client.role === "admin" ? "info" : "default"}>{client.role}</Badge>
                                  </td>
                                  <td>
                                    <div className="flex flex-wrap gap-1">
                                      {client.tags.length === 0 ? (
                                        <span className="text-xs text-base-content/40">—</span>
                                      ) : (
                                        client.tags.map((tag) => (
                                          <Badge key={tag} variant="default">
                                            {tag}
                                          </Badge>
                                        ))
                                      )}
                                    </div>
                                  </td>
                                  <td className="font-mono text-xs text-base-content/50">
                                    {client.clientVersion ?? "-"}
                                  </td>
                                  <td className="text-base-content/50 text-sm">
                                    {formatLastSeen(client.lastHeartbeatAt)}
                                  </td>
                                  <td className="text-right">
                                    <button
                                      className="btn btn-xs btn-ghost"
                                      onClick={() => void editClientMetadata(client)}
                                    >
                                      Edit
                                    </button>
                                  </td>
                                </motion.tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
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
