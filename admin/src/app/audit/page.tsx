"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "@/components/sidebar";
import { Card, CardTitle } from "@/components/card";
import { Badge } from "@/components/badge";
import { CardSkeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { getAuth } from "@/lib/auth";
import { queryAudit, deleteAuditRetention } from "@/lib/api";
import type { AuditEvent } from "@/lib/api";

export default function AuditPage() {
  const router = useRouter();
  const toast = useToast();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Retention
  const [retentionDays, setRetentionDays] = useState(90);
  const [purging, setPurging] = useState(false);

  // Filters
  const [filterUser, setFilterUser] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterTool, setFilterTool] = useState("");
  const [filterOutcome, setFilterOutcome] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const buildParams = useCallback(() => {
    const params: Record<string, string> = { limit: "100" };
    if (filterUser) params.userId = filterUser;
    if (filterType) params.eventType = filterType;
    if (filterTool) params.toolName = filterTool;
    if (filterOutcome) params.outcome = filterOutcome;
    if (filterFrom) params.from = filterFrom;
    if (filterTo) params.to = filterTo;
    return params;
  }, [filterUser, filterType, filterTool, filterOutcome, filterFrom, filterTo]);

  const loadEvents = useCallback(async () => {
    const auth = getAuth();
    if (!auth) return;

    setLoading(true);
    const params = buildParams();

    try {
      const data = await queryAudit(auth.orgId, auth.accessToken, params);
      setEvents(data.events);
      setTotal(data.total);
      setNextCursor(data.nextCursor);
    } catch {
      // leave events as-is
    }
    setLoading(false);
  }, [buildParams]);

  const loadMore = useCallback(async () => {
    if (!nextCursor) return;
    const auth = getAuth();
    if (!auth) return;

    setLoadingMore(true);
    const params = buildParams();
    params.cursor = nextCursor;

    try {
      const data = await queryAudit(auth.orgId, auth.accessToken, params);
      setEvents((prev) => [...prev, ...data.events]);
      setNextCursor(data.nextCursor);
    } catch {
      // leave events as-is
    }
    setLoadingMore(false);
  }, [nextCursor, buildParams]);

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }
    loadEvents();
  }, [router, loadEvents]);

  function applyAdminFilter() {
    setFilterType("admin_action");
  }

  useEffect(() => {
    if (filterType === "admin_action") {
      loadEvents();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType]);

  async function handlePurge() {
    const auth = getAuth();
    if (!auth) return;

    setPurging(true);
    try {
      const result = await deleteAuditRetention(auth.orgId, auth.accessToken, retentionDays);
      toast.success(
        `Deleted ${result.deleted.toLocaleString()} events older than ${new Date(result.cutoffDate).toLocaleDateString()}.`,
      );
      await loadEvents();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Purge failed");
    }
    setPurging(false);
  }

  function exportCSV() {
    const header = "ID,Timestamp,User,EventType,Tool,Outcome,Session\n";
    const rows = events.map((e) =>
      [e.id, e.timestamp, e.userId, e.eventType, e.toolName ?? "", e.outcome, e.sessionKey ?? ""].join(","),
    );
    const blob = new Blob([header + rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-${total}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex min-h-screen bg-base-200">
      <Sidebar />
      <main className="flex-1 p-4 lg:p-8 pt-16 lg:pt-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">Audit Logs</h2>
            <p className="text-sm text-base-content/50 mt-1">Track and investigate all governance events</p>
          </div>
          <button onClick={exportCSV} className="btn btn-ghost btn-sm gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export CSV
          </button>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardTitle>Filters</CardTitle>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <input
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              placeholder="User ID"
              className="input input-bordered input-sm w-full"
            />
            <input
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              placeholder="Event type"
              className="input input-bordered input-sm w-full"
            />
            <input
              value={filterTool}
              onChange={(e) => setFilterTool(e.target.value)}
              placeholder="Tool name"
              className="input input-bordered input-sm w-full"
            />
            <select
              value={filterOutcome}
              onChange={(e) => setFilterOutcome(e.target.value)}
              className="select select-bordered select-sm w-full"
            >
              <option value="">All outcomes</option>
              <option value="allowed">Allowed</option>
              <option value="blocked">Blocked</option>
            </select>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className="input input-bordered input-sm w-full"
            />
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className="input input-bordered input-sm w-full"
            />
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={loadEvents} className="btn btn-primary btn-sm">
              Apply Filters
            </button>
            <button
              onClick={applyAdminFilter}
              className={`btn btn-sm ${filterType === "admin_action" ? "btn-primary" : "btn-ghost"}`}
            >
              Admin Actions
            </button>
          </div>
        </Card>

        {/* Events table */}
        <Card className="mb-6">
          {loading ? (
            <div className="space-y-3">
              <CardSkeleton />
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-12 text-base-content/40">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
              <p className="text-sm">No audit events found</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-5">
              <table className="table table-sm">
                <thead>
                  <tr className="text-base-content/40 text-xs uppercase">
                    <th>Timestamp</th>
                    <th>User</th>
                    <th>Event</th>
                    <th>Tool</th>
                    <th>Outcome</th>
                    <th>Session</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <AnimatePresence key={event.id}>
                      <tr
                        className="table-row-hover cursor-pointer"
                        onClick={() => setExpandedEventId(expandedEventId === event.id ? null : event.id)}
                      >
                        <td className="text-base-content/50 whitespace-nowrap text-xs">
                          {new Date(event.timestamp).toLocaleString()}
                        </td>
                        <td className="font-mono text-xs">{event.userId.slice(0, 12)}...</td>
                        <td className="text-sm">{event.eventType}</td>
                        <td className="font-mono text-xs text-base-content/50">{event.toolName ?? "-"}</td>
                        <td>
                          <Badge variant={event.outcome === "allowed" ? "success" : event.eventType === "admin_action" ? "default" : "danger"}>
                            {event.outcome}
                          </Badge>
                        </td>
                        <td className="font-mono text-xs text-base-content/40">
                          {event.sessionKey?.slice(0, 8) ?? "-"}
                        </td>
                      </tr>
                      {expandedEventId === event.id && (
                        <motion.tr
                          key={`${event.id}-detail`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                        >
                          <td colSpan={6} className="py-3 px-4 bg-base-200/50">
                            <div className="space-y-2 text-xs">
                              <div><span className="font-semibold">ID:</span> <span className="font-mono">{event.id}</span></div>
                              <div><span className="font-semibold">User ID:</span> <span className="font-mono">{event.userId}</span></div>
                              {event.agentId && <div><span className="font-semibold">Agent ID:</span> <span className="font-mono">{event.agentId}</span></div>}
                              {event.sessionKey && <div><span className="font-semibold">Session Key:</span> <span className="font-mono">{event.sessionKey}</span></div>}
                              {event.metadata && (
                                <div>
                                  <span className="font-semibold">Metadata:</span>
                                  <pre className="mt-1 p-3 bg-base-100 rounded-lg overflow-x-auto text-xs font-mono border border-base-300/50">
                                    {JSON.stringify(event.metadata, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                      )}
                    </AnimatePresence>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-between mt-4 px-4">
                <p className="text-xs text-base-content/40">
                  Showing {events.length.toLocaleString()} of {total.toLocaleString()} events
                </p>
                {nextCursor && (
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="btn btn-ghost btn-sm"
                  >
                    {loadingMore && <span className="loading loading-spinner loading-xs" />}
                    {loadingMore ? "Loading..." : "Load More"}
                  </button>
                )}
              </div>
            </div>
          )}
        </Card>

        {/* Retention Policy */}
        <Card>
          <CardTitle>Retention Policy</CardTitle>
          <p className="text-sm text-base-content/50 mb-4">
            Purge audit events older than a specified number of days. This action is irreversible.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium">Delete events older than</span>
            <input
              type="number"
              min={1}
              max={3650}
              value={retentionDays}
              onChange={(e) => setRetentionDays(parseInt(e.target.value, 10) || 90)}
              className="input input-bordered input-sm w-24"
            />
            <span className="text-sm text-base-content/50">days</span>
            <button
              onClick={handlePurge}
              disabled={purging}
              className="btn btn-error btn-sm"
            >
              {purging && <span className="loading loading-spinner loading-xs" />}
              {purging ? "Purging..." : "Purge Old Events"}
            </button>
          </div>
        </Card>
      </main>
    </div>
  );
}
