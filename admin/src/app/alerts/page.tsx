"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "@/components/sidebar";
import { Card, CardTitle, StatCard } from "@/components/card";
import { Badge } from "@/components/badge";
import { StatSkeleton, CardSkeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { getAuth } from "@/lib/auth";
import {
  getAlerts,
  getAlertStats,
  getAlertRules,
  createAlertRule,
  updateAlertRule,
  acknowledgeAlert,
  resolveAlert,
  evaluateAlertRules,
} from "@/lib/api";
import type { Alert, AlertRule, AlertStats } from "@/lib/api";

const RULE_TYPE_LABELS: Record<string, string> = {
  denied_tool_burst: "Denied Tool Burst",
  dlp_violation_burst: "DLP Violation Burst",
  off_hours_activity: "Off-Hours Activity",
  sensitive_tool_access: "Sensitive Tool Access",
  session_anomaly: "Session Anomaly",
  blocked_tool_persistence: "Blocked Tool Persistence",
};

const RULE_TYPE_DESCRIPTIONS: Record<string, string> = {
  denied_tool_burst: "Triggers when a user has too many denied tool calls in a short time window",
  dlp_violation_burst: "Triggers when a user has too many DLP violations in a short time window",
  off_hours_activity: "Triggers when tool calls happen outside configured business hours",
  sensitive_tool_access: "Triggers on first-time access to tools in a watchlist",
  session_anomaly: "Triggers when a session duration exceeds a threshold",
  blocked_tool_persistence: "Triggers when the same tool is blocked repeatedly in a session",
};

const SEVERITY_VARIANTS: Record<string, "danger" | "warning" | "info" | "default"> = {
  critical: "danger",
  high: "warning",
  medium: "info",
  low: "default",
};

export default function AlertsPage() {
  const router = useRouter();
  const toast = useToast();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [stats, setStats] = useState<AlertStats | null>(null);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"alerts" | "rules">("alerts");
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);
  const [showCreateRule, setShowCreateRule] = useState(false);
  const [evaluating, setEvaluating] = useState(false);

  // New rule form state
  const [newRuleName, setNewRuleName] = useState("");
  const [newRuleType, setNewRuleType] = useState("denied_tool_burst");
  const [newRuleSeverity, setNewRuleSeverity] = useState("medium");
  const [newRuleThreshold, setNewRuleThreshold] = useState("10");
  const [newRuleWindow, setNewRuleWindow] = useState("5");

  const loadData = useCallback(async () => {
    const auth = getAuth();
    if (!auth) return;
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;

      const [alertsRes, statsRes, rulesRes] = await Promise.allSettled([
        getAlerts(auth.orgId, auth.accessToken, params),
        getAlertStats(auth.orgId, auth.accessToken),
        getAlertRules(auth.orgId, auth.accessToken),
      ]);
      if (alertsRes.status === "fulfilled") setAlerts(alertsRes.value.alerts);
      if (statsRes.status === "fulfilled") setStats(statsRes.value);
      if (rulesRes.status === "fulfilled") setRules(rulesRes.value.rules);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, toast]);

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }
    loadData();
  }, [router, loadData]);

  async function handleAcknowledge(alertId: string) {
    const auth = getAuth();
    if (!auth) return;
    try {
      await acknowledgeAlert(auth.orgId, alertId, auth.accessToken);
      toast.success("Alert acknowledged");
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to acknowledge alert");
    }
  }

  async function handleResolve(alertId: string) {
    const auth = getAuth();
    if (!auth) return;
    try {
      await resolveAlert(auth.orgId, alertId, auth.accessToken);
      toast.success("Alert resolved");
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resolve alert");
    }
  }

  async function handleEvaluateRules() {
    const auth = getAuth();
    if (!auth) return;
    setEvaluating(true);
    try {
      const result = await evaluateAlertRules(auth.orgId, auth.accessToken);
      toast.success(`Rule evaluation complete: ${result.alertsCreated} new alert(s)`);
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to evaluate rules");
    } finally {
      setEvaluating(false);
    }
  }

  async function handleCreateRule() {
    const auth = getAuth();
    if (!auth || !newRuleName.trim()) return;
    try {
      await createAlertRule(auth.orgId, auth.accessToken, {
        name: newRuleName,
        ruleType: newRuleType,
        severity: newRuleSeverity,
        config: {
          threshold: parseInt(newRuleThreshold, 10),
          windowMinutes: parseInt(newRuleWindow, 10),
        },
      });
      toast.success("Alert rule created");
      setShowCreateRule(false);
      setNewRuleName("");
      setNewRuleType("denied_tool_burst");
      setNewRuleSeverity("medium");
      setNewRuleThreshold("10");
      setNewRuleWindow("5");
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create rule");
    }
  }

  async function handleToggleRule(rule: AlertRule) {
    const auth = getAuth();
    if (!auth) return;
    try {
      await updateAlertRule(auth.orgId, rule.id, auth.accessToken, { enabled: !rule.enabled });
      toast.success(`Rule ${rule.enabled ? "disabled" : "enabled"}`);
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update rule");
    }
  }

  const tabs = [
    { key: "alerts" as const, label: "Alerts", count: stats?.open ?? 0 },
    { key: "rules" as const, label: "Rules", count: rules.length },
  ];

  return (
    <div className="flex min-h-screen bg-base-200">
      <Sidebar />
      <main className="flex-1 p-4 lg:p-8 pt-16 lg:pt-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">Alerts</h2>
            <p className="text-sm text-base-content/50 mt-1">Anomaly detection and security alerts</p>
          </div>
          <button className="btn btn-primary btn-sm gap-2" onClick={handleEvaluateRules} disabled={evaluating}>
            {evaluating && <span className="loading loading-spinner loading-xs" />}
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 16h5v5" />
            </svg>
            Run Detection
          </button>
        </div>

        {loading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <StatSkeleton key={i} />
              ))}
            </div>
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : (
          <>
            {/* Stats row */}
            {stats && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <StatCard
                  label="Open"
                  value={stats.open}
                  variant={stats.open > 0 ? "danger" : "default"}
                  icon={<AlertCircleIcon />}
                />
                <StatCard label="Acknowledged" value={stats.acknowledged} variant="warning" icon={<EyeIcon />} />
                <StatCard
                  label="Critical"
                  value={stats.critical}
                  variant={stats.critical > 0 ? "danger" : "default"}
                  icon={<ZapIcon />}
                />
                <StatCard label="Resolved" value={stats.resolved} variant="success" icon={<CheckCircleIcon />} />
              </div>
            )}

            {/* Tabs */}
            <div className="tabs tabs-boxed bg-base-100 p-1 mb-6 w-fit border border-base-300/50">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`tab tab-sm gap-2 ${tab === t.key ? "tab-active" : ""}`}
                >
                  {t.label}
                  <span className="badge badge-sm badge-ghost">{t.count}</span>
                </button>
              ))}
            </div>

            {tab === "alerts" && (
              <>
                {/* Status filter */}
                <div className="flex gap-2 mb-4">
                  {(["open", "acknowledged", "resolved", ""] as const).map((status) => (
                    <button
                      key={status || "all"}
                      className={`btn btn-xs ${statusFilter === status ? "btn-primary" : "btn-ghost"}`}
                      onClick={() => setStatusFilter(status)}
                    >
                      {status || "All"}
                    </button>
                  ))}
                </div>

                {/* Alert list */}
                {alerts.length === 0 ? (
                  <div className="text-center py-16 text-base-content/40">
                    <svg
                      className="w-12 h-12 mx-auto mb-3 opacity-30"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <p className="text-sm">No alerts found</p>
                  </div>
                ) : (
                  <Card>
                    <div className="overflow-x-auto -mx-5">
                      <table className="table table-sm">
                        <thead>
                          <tr className="text-base-content/40 text-xs uppercase">
                            <th>Severity</th>
                            <th>Status</th>
                            <th>Title</th>
                            <th>Time</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          <AnimatePresence>
                            {alerts.map((alert, i) => (
                              <AlertRow
                                key={alert.id}
                                alert={alert}
                                index={i}
                                expanded={expandedAlertId === alert.id}
                                onToggle={() =>
                                  setExpandedAlertId(expandedAlertId === alert.id ? null : alert.id)
                                }
                                onAcknowledge={() => handleAcknowledge(alert.id)}
                                onResolve={() => handleResolve(alert.id)}
                              />
                            ))}
                          </AnimatePresence>
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center justify-between mt-4 px-0">
                      <p className="text-xs text-base-content/40">
                        Showing {alerts.length} alert{alerts.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </Card>
                )}
              </>
            )}

            {tab === "rules" && (
              <>
                <div className="flex justify-end mb-4">
                  <button
                    className="btn btn-sm btn-primary gap-2"
                    onClick={() => setShowCreateRule(!showCreateRule)}
                  >
                    {showCreateRule ? (
                      "Cancel"
                    ) : (
                      <>
                        <svg
                          className="w-4 h-4"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        Create Rule
                      </>
                    )}
                  </button>
                </div>

                {/* Create rule form */}
                <AnimatePresence>
                  {showCreateRule && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden mb-4"
                    >
                      <Card>
                        <CardTitle>New Alert Rule</CardTitle>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          <div>
                            <label className="text-xs font-medium text-base-content/50 uppercase tracking-wider">
                              Name
                            </label>
                            <input
                              type="text"
                              className="input input-bordered input-sm w-full mt-1"
                              value={newRuleName}
                              onChange={(e) => setNewRuleName(e.target.value)}
                              placeholder="e.g., High denial rate"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-base-content/50 uppercase tracking-wider">
                              Rule Type
                            </label>
                            <select
                              className="select select-bordered select-sm w-full mt-1"
                              value={newRuleType}
                              onChange={(e) => setNewRuleType(e.target.value)}
                            >
                              {Object.entries(RULE_TYPE_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </select>
                            <p className="text-xs text-base-content/40 mt-1">
                              {RULE_TYPE_DESCRIPTIONS[newRuleType]}
                            </p>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-base-content/50 uppercase tracking-wider">
                              Severity
                            </label>
                            <select
                              className="select select-bordered select-sm w-full mt-1"
                              value={newRuleSeverity}
                              onChange={(e) => setNewRuleSeverity(e.target.value)}
                            >
                              <option value="critical">Critical</option>
                              <option value="high">High</option>
                              <option value="medium">Medium</option>
                              <option value="low">Low</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-base-content/50 uppercase tracking-wider">
                              Threshold
                            </label>
                            <input
                              type="number"
                              className="input input-bordered input-sm w-full mt-1"
                              value={newRuleThreshold}
                              onChange={(e) => setNewRuleThreshold(e.target.value)}
                              min="1"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-base-content/50 uppercase tracking-wider">
                              Window (minutes)
                            </label>
                            <input
                              type="number"
                              className="input input-bordered input-sm w-full mt-1"
                              value={newRuleWindow}
                              onChange={(e) => setNewRuleWindow(e.target.value)}
                              min="1"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end mt-4">
                          <button className="btn btn-sm btn-primary" onClick={handleCreateRule}>
                            Create Rule
                          </button>
                        </div>
                      </Card>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Rules list */}
                {rules.length === 0 ? (
                  <div className="text-center py-16 text-base-content/40">
                    <svg
                      className="w-12 h-12 mx-auto mb-3 opacity-30"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    <p className="text-sm">No alert rules configured</p>
                    <p className="text-xs mt-1">Create one to start monitoring</p>
                  </div>
                ) : (
                  <Card>
                    <div className="overflow-x-auto -mx-5">
                      <table className="table table-sm">
                        <thead>
                          <tr className="text-base-content/40 text-xs uppercase">
                            <th>Name</th>
                            <th>Type</th>
                            <th>Severity</th>
                            <th>Status</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rules.map((rule, i) => (
                            <motion.tr
                              key={rule.id}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: i * 0.03 }}
                              className="table-row-hover"
                            >
                              <td>
                                <div>
                                  <span className="font-medium text-sm">{rule.name}</span>
                                  {rule.description && (
                                    <p className="text-xs text-base-content/40 mt-0.5">{rule.description}</p>
                                  )}
                                </div>
                              </td>
                              <td className="text-xs text-base-content/50">
                                {RULE_TYPE_LABELS[rule.ruleType] ?? rule.ruleType}
                              </td>
                              <td>
                                <Badge variant={SEVERITY_VARIANTS[rule.severity] ?? "default"} size="xs">
                                  {rule.severity}
                                </Badge>
                              </td>
                              <td>
                                <Badge variant={rule.enabled ? "success" : "default"} size="xs">
                                  {rule.enabled ? "Active" : "Disabled"}
                                </Badge>
                              </td>
                              <td>
                                <button
                                  onClick={() => handleToggleRule(rule)}
                                  className={`btn btn-xs ${rule.enabled ? "btn-ghost" : "btn-success btn-outline"}`}
                                >
                                  {rule.enabled ? "Disable" : "Enable"}
                                </button>
                              </td>
                            </motion.tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function AlertRow({
  alert,
  index,
  expanded,
  onToggle,
  onAcknowledge,
  onResolve,
}: {
  alert: Alert;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onAcknowledge: () => void;
  onResolve: () => void;
}) {
  return (
    <>
      <motion.tr
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: index * 0.03 }}
        className="table-row-hover cursor-pointer"
        onClick={onToggle}
      >
        <td>
          <Badge variant={SEVERITY_VARIANTS[alert.severity] ?? "default"} size="xs">
            {alert.severity}
          </Badge>
        </td>
        <td>
          <Badge
            variant={
              alert.status === "open" ? "danger" : alert.status === "acknowledged" ? "warning" : "success"
            }
            size="xs"
          >
            {alert.status}
          </Badge>
        </td>
        <td className="text-sm">{alert.title}</td>
        <td className="text-base-content/50 whitespace-nowrap text-xs">
          {new Date(alert.createdAt).toLocaleString()}
        </td>
        <td>
          <div className="flex gap-2">
            {alert.status === "open" && (
              <button
                className="btn btn-xs btn-ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  onAcknowledge();
                }}
              >
                Acknowledge
              </button>
            )}
            {alert.status !== "resolved" && (
              <button
                className="btn btn-xs btn-success btn-outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onResolve();
                }}
              >
                Resolve
              </button>
            )}
          </div>
        </td>
      </motion.tr>
      {expanded && (
        <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <td colSpan={5} className="py-3 px-4 bg-base-200/50">
            <div className="space-y-2 text-xs">
              {alert.userId && (
                <div>
                  <span className="font-semibold">User ID:</span>{" "}
                  <span className="font-mono">{alert.userId}</span>
                </div>
              )}
              {alert.details && (
                <div>
                  <span className="font-semibold">Details:</span>
                  <pre className="mt-1 p-3 bg-base-100 rounded-lg overflow-x-auto text-xs font-mono border border-base-300/50 max-h-40">
                    {JSON.stringify(alert.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </td>
        </motion.tr>
      )}
    </>
  );
}

function AlertCircleIcon() {
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
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function EyeIcon() {
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
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ZapIcon() {
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
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function CheckCircleIcon() {
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
