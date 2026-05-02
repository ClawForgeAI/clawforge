"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "@/components/sidebar";
import { Card, CardTitle } from "@/components/card";
import { Badge } from "@/components/badge";
import { CardSkeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { getAuth } from "@/lib/auth";
import { getWebhooks, createWebhook, updateWebhook, deleteWebhook, testWebhook, getWebhookDeliveries } from "@/lib/api";
import type { Webhook, WebhookDelivery } from "@/lib/api";

const STATUS_VARIANTS: Record<string, "success" | "danger" | "warning" | "default"> = {
  success: "success",
  failed: "danger",
  pending: "warning",
};

export default function WebhooksPage() {
  const router = useRouter();
  const toast = useToast();
  const [webhooksList, setWebhooksList] = useState<Webhook[]>([]);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deliveriesWebhookId, setDeliveriesWebhookId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formSecret, setFormSecret] = useState("");
  const [formEvents, setFormEvents] = useState<string[]>([]);
  const [formEnabled, setFormEnabled] = useState(true);

  const resetForm = () => {
    setFormName("");
    setFormUrl("");
    setFormSecret("");
    setFormEvents([]);
    setFormEnabled(true);
  };

  const loadData = useCallback(async () => {
    const auth = getAuth();
    if (!auth) return;
    setLoading(true);
    try {
      const res = await getWebhooks(auth.orgId, auth.accessToken);
      setWebhooksList(res.webhooks);
      setEventTypes(res.eventTypes);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load webhooks");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }
    loadData();
  }, [router, loadData]);

  async function handleCreate() {
    const auth = getAuth();
    if (!auth || !formName.trim() || !formUrl.trim() || !formSecret.trim() || formEvents.length === 0) {
      toast.error("Please fill in all required fields");
      return;
    }
    try {
      await createWebhook(auth.orgId, auth.accessToken, {
        name: formName,
        url: formUrl,
        secret: formSecret,
        events: formEvents,
        enabled: formEnabled,
      });
      toast.success("Webhook created");
      setShowCreate(false);
      resetForm();
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create webhook");
    }
  }

  async function handleUpdate(webhookId: string) {
    const auth = getAuth();
    if (!auth) return;
    try {
      const body: Record<string, unknown> = {};
      if (formName.trim()) body.name = formName;
      if (formUrl.trim()) body.url = formUrl;
      if (formSecret.trim()) body.secret = formSecret;
      if (formEvents.length > 0) body.events = formEvents;
      body.enabled = formEnabled;

      await updateWebhook(auth.orgId, webhookId, auth.accessToken, body);
      toast.success("Webhook updated");
      setEditingId(null);
      resetForm();
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update webhook");
    }
  }

  async function handleDelete(webhookId: string) {
    const auth = getAuth();
    if (!auth) return;
    try {
      await deleteWebhook(auth.orgId, webhookId, auth.accessToken);
      toast.success("Webhook deleted");
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete webhook");
    }
  }

  async function handleTest(webhookId: string) {
    const auth = getAuth();
    if (!auth) return;
    setTestingId(webhookId);
    try {
      const result = await testWebhook(auth.orgId, webhookId, auth.accessToken);
      if (result.success) {
        toast.success(`Test delivered (${result.statusCode}, ${result.latencyMs}ms)`);
      } else {
        toast.error(`Test failed (HTTP ${result.statusCode ?? "N/A"})`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test failed");
    } finally {
      setTestingId(null);
    }
  }

  async function handleToggle(webhook: Webhook) {
    const auth = getAuth();
    if (!auth) return;
    try {
      await updateWebhook(auth.orgId, webhook.id, auth.accessToken, { enabled: !webhook.enabled });
      toast.success(`Webhook ${webhook.enabled ? "disabled" : "enabled"}`);
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to toggle webhook");
    }
  }

  async function handleViewDeliveries(webhookId: string) {
    if (deliveriesWebhookId === webhookId) {
      setDeliveriesWebhookId(null);
      setDeliveries([]);
      return;
    }
    const auth = getAuth();
    if (!auth) return;
    setDeliveriesWebhookId(webhookId);
    setDeliveriesLoading(true);
    try {
      const res = await getWebhookDeliveries(auth.orgId, webhookId, auth.accessToken);
      setDeliveries(res.deliveries);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load deliveries");
    } finally {
      setDeliveriesLoading(false);
    }
  }

  function startEdit(webhook: Webhook) {
    setEditingId(webhook.id);
    setFormName(webhook.name);
    setFormUrl(webhook.url);
    setFormSecret(webhook.secret);
    setFormEvents(webhook.events);
    setFormEnabled(webhook.enabled);
  }

  function toggleEvent(eventType: string) {
    setFormEvents((prev) => (prev.includes(eventType) ? prev.filter((e) => e !== eventType) : [...prev, eventType]));
  }

  return (
    <div className="flex min-h-screen bg-base-200">
      <Sidebar />
      <main className="flex-1 p-4 lg:p-8 pt-16 lg:pt-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">Webhooks</h2>
            <p className="text-sm text-base-content/50 mt-1">
              External alerting for Slack, PagerDuty, and SIEM integration
            </p>
          </div>
          <button
            className="btn btn-primary btn-sm gap-2"
            onClick={() => {
              setShowCreate(!showCreate);
              setEditingId(null);
              resetForm();
            }}
          >
            {showCreate ? (
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
                Add Webhook
              </>
            )}
          </button>
        </div>

        {loading ? (
          <div className="space-y-4">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : (
          <>
            {/* Create form */}
            <AnimatePresence>
              {showCreate && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden mb-6"
                >
                  <Card>
                    <CardTitle>New Webhook</CardTitle>
                    <WebhookForm
                      formName={formName}
                      formUrl={formUrl}
                      formSecret={formSecret}
                      formEvents={formEvents}
                      formEnabled={formEnabled}
                      eventTypes={eventTypes}
                      onNameChange={setFormName}
                      onUrlChange={setFormUrl}
                      onSecretChange={setFormSecret}
                      onToggleEvent={toggleEvent}
                      onEnabledChange={setFormEnabled}
                    />
                    <div className="flex justify-end mt-4">
                      <button className="btn btn-sm btn-primary" onClick={handleCreate}>
                        Create Webhook
                      </button>
                    </div>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Webhook list */}
            {webhooksList.length === 0 && !showCreate ? (
              <div className="text-center py-16 text-base-content/40">
                <svg
                  className="w-12 h-12 mx-auto mb-3 opacity-30"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                <p className="text-sm">No webhooks configured</p>
                <p className="text-xs mt-1">Add one to start receiving external alerts</p>
              </div>
            ) : (
              <div className="space-y-4">
                {webhooksList.map((webhook, i) => (
                  <motion.div
                    key={webhook.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Card>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-1">
                            <h3 className="font-semibold text-sm">{webhook.name}</h3>
                            <Badge variant={webhook.enabled ? "success" : "default"} size="xs">
                              {webhook.enabled ? "Active" : "Disabled"}
                            </Badge>
                          </div>
                          <p className="text-xs text-base-content/50 font-mono truncate max-w-md">{webhook.url}</p>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {webhook.events.map((evt) => (
                              <span key={evt} className="badge badge-ghost badge-xs font-mono">
                                {evt}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button
                            className="btn btn-xs btn-ghost"
                            onClick={() => handleTest(webhook.id)}
                            disabled={testingId === webhook.id}
                          >
                            {testingId === webhook.id ? (
                              <span className="loading loading-spinner loading-xs" />
                            ) : (
                              "Test"
                            )}
                          </button>
                          <button className="btn btn-xs btn-ghost" onClick={() => handleViewDeliveries(webhook.id)}>
                            {deliveriesWebhookId === webhook.id ? "Hide" : "Deliveries"}
                          </button>
                          <button
                            className={`btn btn-xs ${webhook.enabled ? "btn-ghost" : "btn-success btn-outline"}`}
                            onClick={() => handleToggle(webhook)}
                          >
                            {webhook.enabled ? "Disable" : "Enable"}
                          </button>
                          <button
                            className="btn btn-xs btn-ghost"
                            onClick={() => {
                              if (editingId === webhook.id) {
                                setEditingId(null);
                                resetForm();
                              } else {
                                startEdit(webhook);
                                setShowCreate(false);
                              }
                            }}
                          >
                            {editingId === webhook.id ? "Cancel" : "Edit"}
                          </button>
                          <button className="btn btn-xs btn-ghost text-error" onClick={() => handleDelete(webhook.id)}>
                            Delete
                          </button>
                        </div>
                      </div>

                      {/* Edit form */}
                      <AnimatePresence>
                        {editingId === webhook.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden mt-4 pt-4 border-t border-base-300/50"
                          >
                            <WebhookForm
                              formName={formName}
                              formUrl={formUrl}
                              formSecret={formSecret}
                              formEvents={formEvents}
                              formEnabled={formEnabled}
                              eventTypes={eventTypes}
                              onNameChange={setFormName}
                              onUrlChange={setFormUrl}
                              onSecretChange={setFormSecret}
                              onToggleEvent={toggleEvent}
                              onEnabledChange={setFormEnabled}
                            />
                            <div className="flex justify-end mt-4">
                              <button className="btn btn-sm btn-primary" onClick={() => handleUpdate(webhook.id)}>
                                Save Changes
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Delivery history */}
                      <AnimatePresence>
                        {deliveriesWebhookId === webhook.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden mt-4 pt-4 border-t border-base-300/50"
                          >
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-base-content/40 mb-3">
                              Delivery History
                            </h4>
                            {deliveriesLoading ? (
                              <div className="flex justify-center py-4">
                                <span className="loading loading-spinner loading-sm" />
                              </div>
                            ) : deliveries.length === 0 ? (
                              <p className="text-xs text-base-content/40 text-center py-4">No deliveries yet</p>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="table table-xs">
                                  <thead>
                                    <tr className="text-base-content/40 text-xs uppercase">
                                      <th>Event</th>
                                      <th>Status</th>
                                      <th>Code</th>
                                      <th>Latency</th>
                                      <th>Attempt</th>
                                      <th>Time</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {deliveries.map((d) => (
                                      <tr key={d.id}>
                                        <td className="font-mono text-xs">{d.eventType}</td>
                                        <td>
                                          <Badge variant={STATUS_VARIANTS[d.status] ?? "default"} size="xs">
                                            {d.status}
                                          </Badge>
                                        </td>
                                        <td className="text-xs">{d.responseCode ?? "-"}</td>
                                        <td className="text-xs">{d.latencyMs != null ? `${d.latencyMs}ms` : "-"}</td>
                                        <td className="text-xs">{d.attempt}</td>
                                        <td className="text-xs text-base-content/50 whitespace-nowrap">
                                          {new Date(d.createdAt).toLocaleString()}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function WebhookForm({
  formName,
  formUrl,
  formSecret,
  formEvents,
  formEnabled,
  eventTypes,
  onNameChange,
  onUrlChange,
  onSecretChange,
  onToggleEvent,
  onEnabledChange,
}: {
  formName: string;
  formUrl: string;
  formSecret: string;
  formEvents: string[];
  formEnabled: boolean;
  eventTypes: string[];
  onNameChange: (v: string) => void;
  onUrlChange: (v: string) => void;
  onSecretChange: (v: string) => void;
  onToggleEvent: (event: string) => void;
  onEnabledChange: (v: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-base-content/50 uppercase tracking-wider">Name</label>
          <input
            type="text"
            className="input input-bordered input-sm w-full mt-1"
            value={formName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g., Slack Alerts"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-base-content/50 uppercase tracking-wider">URL</label>
          <input
            type="url"
            className="input input-bordered input-sm w-full mt-1"
            value={formUrl}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="https://hooks.slack.com/..."
          />
        </div>
        <div>
          <label className="text-xs font-medium text-base-content/50 uppercase tracking-wider">
            Secret (HMAC signing)
          </label>
          <input
            type="text"
            className="input input-bordered input-sm w-full mt-1"
            value={formSecret}
            onChange={(e) => onSecretChange(e.target.value)}
            placeholder="Minimum 16 characters"
          />
        </div>
        <div className="flex items-center gap-2 pt-5">
          <input
            type="checkbox"
            className="toggle toggle-sm toggle-primary"
            checked={formEnabled}
            onChange={(e) => onEnabledChange(e.target.checked)}
          />
          <span className="text-sm">Enabled</span>
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-base-content/50 uppercase tracking-wider mb-2 block">
          Event Types
        </label>
        <div className="flex flex-wrap gap-2">
          {eventTypes.map((evt) => (
            <label
              key={evt}
              className={`cursor-pointer badge badge-sm gap-1.5 ${
                formEvents.includes(evt) ? "badge-primary" : "badge-ghost"
              }`}
            >
              <input
                type="checkbox"
                className="checkbox checkbox-xs"
                checked={formEvents.includes(evt)}
                onChange={() => onToggleEvent(evt)}
              />
              <span className="font-mono">{evt}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
