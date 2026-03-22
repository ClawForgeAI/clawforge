"use client";

import { useState, useEffect, useCallback } from "react";
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
import { Card, StatCard } from "@/components/card";
import { Badge } from "@/components/badge";
import { useToast } from "@/components/toast";

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
  const { success, error: showError } = useToast();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [stats, setStats] = useState<AlertStats | null>(null);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"alerts" | "rules">("alerts");
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);
  const [showCreateRule, setShowCreateRule] = useState(false);

  // New rule form state
  const [newRuleName, setNewRuleName] = useState("");
  const [newRuleType, setNewRuleType] = useState("denied_tool_burst");
  const [newRuleSeverity, setNewRuleSeverity] = useState("medium");
  const [newRuleThreshold, setNewRuleThreshold] = useState("10");
  const [newRuleWindow, setNewRuleWindow] = useState("5");

  const auth = getAuth();

  const loadData = useCallback(async () => {
    if (!auth) return;
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;

      const [alertsRes, statsRes, rulesRes] = await Promise.all([
        getAlerts(auth.orgId, auth.accessToken, params),
        getAlertStats(auth.orgId, auth.accessToken),
        getAlertRules(auth.orgId, auth.accessToken),
      ]);
      setAlerts(alertsRes.alerts);
      setStats(statsRes);
      setRules(rulesRes.rules);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }, [auth, statusFilter, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAcknowledge = async (alertId: string) => {
    if (!auth) return;
    try {
      await acknowledgeAlert(auth.orgId, alertId, auth.accessToken);
      success("Alert acknowledged");
      loadData();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to acknowledge alert");
    }
  };

  const handleResolve = async (alertId: string) => {
    if (!auth) return;
    try {
      await resolveAlert(auth.orgId, alertId, auth.accessToken);
      success("Alert resolved");
      loadData();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to resolve alert");
    }
  };

  const handleEvaluateRules = async () => {
    if (!auth) return;
    try {
      const result = await evaluateAlertRules(auth.orgId, auth.accessToken);
      success(`Rule evaluation complete: ${result.alertsCreated} new alert(s)`);
      loadData();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to evaluate rules");
    }
  };

  const handleCreateRule = async () => {
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
      success("Alert rule created");
      setShowCreateRule(false);
      setNewRuleName("");
      loadData();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to create rule");
    }
  };

  const handleToggleRule = async (rule: AlertRule) => {
    if (!auth) return;
    try {
      await updateAlertRule(auth.orgId, rule.id, auth.accessToken, { enabled: !rule.enabled });
      success(`Rule ${rule.enabled ? "disabled" : "enabled"}`);
      loadData();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to update rule");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Alerts</h1>
          <p className="text-base-content/60 text-sm mt-1">Anomaly detection and security alerts</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={handleEvaluateRules}>
          Run Detection
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Open" value={stats.open} variant={stats.open > 0 ? "danger" : "default"} />
          <StatCard label="Acknowledged" value={stats.acknowledged} variant="warning" />
          <StatCard label="Critical" value={stats.critical} variant={stats.critical > 0 ? "danger" : "default"} />
          <StatCard label="Resolved" value={stats.resolved} variant="success" />
        </div>
      )}

      {/* Tabs */}
      <div className="tabs tabs-bordered">
        <button
          className={`tab ${activeTab === "alerts" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("alerts")}
        >
          Alerts {stats && stats.open > 0 && <Badge variant="danger" size="xs">{stats.open}</Badge>}
        </button>
        <button
          className={`tab ${activeTab === "rules" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("rules")}
        >
          Rules ({rules.length})
        </button>
      </div>

      {activeTab === "alerts" && (
        <div className="space-y-4">
          {/* Filter */}
          <div className="flex gap-2">
            {["open", "acknowledged", "resolved", ""].map((status) => (
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
          {loading ? (
            <div className="flex justify-center py-12">
              <span className="loading loading-spinner loading-md" />
            </div>
          ) : alerts.length === 0 ? (
            <Card>
              <div className="text-center py-8 text-base-content/50">
                No alerts found
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <Card key={alert.id}>
                  <div
                    className="flex items-start justify-between cursor-pointer"
                    onClick={() => setExpandedAlertId(expandedAlertId === alert.id ? null : alert.id)}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={SEVERITY_VARIANTS[alert.severity] ?? "default"} size="xs">
                          {alert.severity}
                        </Badge>
                        <Badge
                          variant={
                            alert.status === "open"
                              ? "danger"
                              : alert.status === "acknowledged"
                                ? "warning"
                                : "success"
                          }
                          size="xs"
                        >
                          {alert.status}
                        </Badge>
                        <span className="text-xs text-base-content/50">
                          {new Date(alert.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="font-medium text-sm">{alert.title}</p>
                    </div>
                    <div className="flex gap-2">
                      {alert.status === "open" && (
                        <button
                          className="btn btn-xs btn-outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAcknowledge(alert.id);
                          }}
                        >
                          Acknowledge
                        </button>
                      )}
                      {alert.status !== "resolved" && (
                        <button
                          className="btn btn-xs btn-outline btn-success"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleResolve(alert.id);
                          }}
                        >
                          Resolve
                        </button>
                      )}
                    </div>
                  </div>
                  {expandedAlertId === alert.id && alert.details && (
                    <div className="mt-3 pt-3 border-t border-base-300/50">
                      <pre className="text-xs bg-base-200 rounded p-3 overflow-auto max-h-40">
                        {JSON.stringify(alert.details, null, 2)}
                      </pre>
                      {alert.userId && (
                        <p className="text-xs text-base-content/50 mt-2">User: {alert.userId}</p>
                      )}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "rules" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              className="btn btn-sm btn-primary"
              onClick={() => setShowCreateRule(!showCreateRule)}
            >
              {showCreateRule ? "Cancel" : "Create Rule"}
            </button>
          </div>

          {/* Create rule form */}
          {showCreateRule && (
            <Card>
              <h3 className="font-semibold mb-4">New Alert Rule</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label text-sm font-medium">Name</label>
                  <input
                    type="text"
                    className="input input-bordered input-sm w-full"
                    value={newRuleName}
                    onChange={(e) => setNewRuleName(e.target.value)}
                    placeholder="e.g., High denial rate"
                  />
                </div>
                <div>
                  <label className="label text-sm font-medium">Rule Type</label>
                  <select
                    className="select select-bordered select-sm w-full"
                    value={newRuleType}
                    onChange={(e) => setNewRuleType(e.target.value)}
                  >
                    {Object.entries(RULE_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-base-content/50 mt-1">
                    {RULE_TYPE_DESCRIPTIONS[newRuleType]}
                  </p>
                </div>
                <div>
                  <label className="label text-sm font-medium">Severity</label>
                  <select
                    className="select select-bordered select-sm w-full"
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
                  <label className="label text-sm font-medium">Threshold</label>
                  <input
                    type="number"
                    className="input input-bordered input-sm w-full"
                    value={newRuleThreshold}
                    onChange={(e) => setNewRuleThreshold(e.target.value)}
                    min="1"
                  />
                </div>
                <div>
                  <label className="label text-sm font-medium">Window (minutes)</label>
                  <input
                    type="number"
                    className="input input-bordered input-sm w-full"
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
          )}

          {/* Rules list */}
          {loading ? (
            <div className="flex justify-center py-12">
              <span className="loading loading-spinner loading-md" />
            </div>
          ) : rules.length === 0 ? (
            <Card>
              <div className="text-center py-8 text-base-content/50">
                No alert rules configured. Create one to start monitoring.
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => (
                <Card key={rule.id}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{rule.name}</span>
                        <Badge variant={SEVERITY_VARIANTS[rule.severity] ?? "default"} size="xs">
                          {rule.severity}
                        </Badge>
                        <Badge variant={rule.enabled ? "success" : "default"} size="xs">
                          {rule.enabled ? "Active" : "Disabled"}
                        </Badge>
                      </div>
                      <p className="text-xs text-base-content/60">
                        {RULE_TYPE_LABELS[rule.ruleType] ?? rule.ruleType}
                      </p>
                      {rule.description && (
                        <p className="text-xs text-base-content/50 mt-1">{rule.description}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <label className="swap">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={() => handleToggleRule(rule)}
                        />
                        <span className="swap-on btn btn-xs btn-success">Enabled</span>
                        <span className="swap-off btn btn-xs btn-ghost">Disabled</span>
                      </label>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
