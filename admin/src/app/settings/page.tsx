"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Sidebar } from "@/components/sidebar";
import { Card, CardTitle } from "@/components/card";
import { Badge } from "@/components/badge";
import { CardSkeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { getAuth } from "@/lib/auth";
import { getOrganization, updateOrganization, changePassword, getOrgSettings, updateOrgSettings } from "@/lib/api";
import type { OrgSettings } from "@/lib/api";

export default function SettingsPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [issuerUrl, setIssuerUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [audience, setAudience] = useState("");
  const [orgId, setOrgId] = useState("");
  const [createdAt, setCreatedAt] = useState("");

  // Org settings state (#45)
  const [orgSettings, setOrgSettings] = useState<OrgSettings>({});
  const [savingSettings, setSavingSettings] = useState(false);

  // Change password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }
    setOrgId(auth.orgId);

    getOrganization(auth.orgId, auth.accessToken)
      .then((data) => {
        const org = data.organization;
        setOrgName(org.name);
        setCreatedAt(org.createdAt);
        if (org.ssoConfig) {
          setSsoEnabled(true);
          setIssuerUrl(org.ssoConfig.issuerUrl);
          setClientId(org.ssoConfig.clientId);
          setAudience(org.ssoConfig.audience ?? "");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    getOrgSettings(auth.orgId, auth.accessToken)
      .then((data) => setOrgSettings(data.settings))
      .catch(() => {});
  }, [router]);

  async function handleSave() {
    const auth = getAuth();
    if (!auth) return;
    setSaving(true);

    try {
      const body: {
        name?: string;
        ssoConfig?: { issuerUrl: string; clientId: string; audience?: string } | null;
      } = {};

      body.name = orgName;

      if (ssoEnabled && issuerUrl && clientId) {
        body.ssoConfig = {
          issuerUrl,
          clientId,
          audience: audience || undefined,
        };
      } else if (!ssoEnabled) {
        body.ssoConfig = null;
      }

      await updateOrganization(auth.orgId, auth.accessToken, body);
      toast.success("Settings saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSettings() {
    const auth = getAuth();
    if (!auth) return;
    setSavingSettings(true);
    try {
      const result = await updateOrgSettings(auth.orgId, auth.accessToken, orgSettings);
      setOrgSettings(result.settings);
      toast.success("Organization settings saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters.");
      return;
    }

    const auth = getAuth();
    if (!auth) return;

    setChangingPassword(true);

    try {
      await changePassword(auth.accessToken, {
        currentPassword,
        newPassword,
      });
      toast.success("Password changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-base-200">
      <Sidebar />
      <main className="flex-1 p-4 lg:p-8 pt-16 lg:pt-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">Organization Settings</h2>
            <p className="text-sm text-base-content/50 mt-1">Manage your organization profile and security</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !orgName}
            className="btn btn-primary btn-sm"
          >
            {saving && <span className="loading loading-spinner loading-xs" />}
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>

        {loading ? (
          <div className="space-y-4">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : (
          <div className="space-y-6 max-w-3xl">
            {/* General */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <Card>
                <CardTitle>General</CardTitle>
                <div className="space-y-4">
                  <div className="form-control">
                    <label className="label"><span className="label-text text-xs font-medium">Organization Name</span></label>
                    <input
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      className="input input-bordered input-sm w-full max-w-md"
                    />
                  </div>
                  <div className="flex items-center gap-6 text-sm text-base-content/50">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-base-content/40">Org ID</span>
                      <code className="font-mono text-xs bg-base-200 px-2 py-0.5 rounded">{orgId}</code>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-base-content/40">Created</span>
                      <span className="text-xs">{createdAt ? new Date(createdAt).toLocaleDateString() : "-"}</span>
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>

            {/* SSO / OIDC Configuration */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <Card>
                <div className="flex items-center justify-between mb-1">
                  <CardTitle className="mb-0">SSO / OIDC Configuration</CardTitle>
                  <Badge variant={ssoEnabled ? "success" : "default"}>
                    {ssoEnabled ? "Configured" : "Not Configured"}
                  </Badge>
                </div>
                <div className="space-y-4 mt-4">
                  <label className="flex items-center gap-3 cursor-pointer w-fit">
                    <input
                      type="checkbox"
                      checked={ssoEnabled}
                      onChange={(e) => setSsoEnabled(e.target.checked)}
                      className="toggle toggle-primary toggle-sm"
                    />
                    <span className="text-sm font-medium">Enable SSO (OIDC)</span>
                  </label>

                  {ssoEnabled && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="grid grid-cols-1 md:grid-cols-2 gap-4"
                    >
                      <div className="form-control">
                        <label className="label"><span className="label-text text-xs font-medium">Issuer URL *</span></label>
                        <input
                          value={issuerUrl}
                          onChange={(e) => setIssuerUrl(e.target.value)}
                          placeholder="https://your-org.okta.com"
                          className="input input-bordered input-sm w-full"
                        />
                      </div>
                      <div className="form-control">
                        <label className="label"><span className="label-text text-xs font-medium">Client ID *</span></label>
                        <input
                          value={clientId}
                          onChange={(e) => setClientId(e.target.value)}
                          placeholder="0oa1234567890"
                          className="input input-bordered input-sm w-full"
                        />
                      </div>
                      <div className="form-control md:col-span-2">
                        <label className="label"><span className="label-text text-xs font-medium">Audience (optional)</span></label>
                        <input
                          value={audience}
                          onChange={(e) => setAudience(e.target.value)}
                          placeholder="api://clawforge"
                          className="input input-bordered input-sm w-full max-w-md"
                        />
                      </div>
                    </motion.div>
                  )}
                </div>
              </Card>
            </motion.div>

            {/* Governance Settings (#45) */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <Card>
                <div className="flex items-center justify-between mb-1">
                  <CardTitle className="mb-0">Governance Settings</CardTitle>
                  <button onClick={handleSaveSettings} disabled={savingSettings} className="btn btn-primary btn-xs">
                    {savingSettings && <span className="loading loading-spinner loading-xs" />}
                    {savingSettings ? "Saving..." : "Save"}
                  </button>
                </div>
                <div className="space-y-4 mt-4">
                  <div className="form-control">
                    <label className="label"><span className="label-text text-xs font-medium">Audit Retention (days)</span></label>
                    <input
                      type="number"
                      value={orgSettings.auditRetentionDays ?? ""}
                      onChange={(e) => setOrgSettings({ ...orgSettings, auditRetentionDays: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                      placeholder="90"
                      className="input input-bordered input-sm w-full max-w-xs"
                      min={1}
                      max={3650}
                    />
                    <label className="label"><span className="label-text-alt text-xs text-base-content/40">How long to retain audit logs before cleanup</span></label>
                  </div>
                  <div className="form-control">
                    <label className="label"><span className="label-text text-xs font-medium">Default Role for New Users</span></label>
                    <select
                      value={orgSettings.defaultNewUserRole ?? "user"}
                      onChange={(e) => setOrgSettings({ ...orgSettings, defaultNewUserRole: e.target.value as "admin" | "viewer" | "user" })}
                      className="select select-bordered select-sm w-full max-w-xs"
                    >
                      <option value="user">User</option>
                      <option value="viewer">Viewer</option>
                      <option value="admin">Admin</option>
                    </select>
                    <label className="label"><span className="label-text-alt text-xs text-base-content/40">Role assigned to newly enrolled users</span></label>
                  </div>
                  <div className="form-control">
                    <label className="label"><span className="label-text text-xs font-medium">Kill Switch Default Message</span></label>
                    <input
                      type="text"
                      value={orgSettings.killSwitchDefaultMessage ?? ""}
                      onChange={(e) => setOrgSettings({ ...orgSettings, killSwitchDefaultMessage: e.target.value || undefined })}
                      placeholder="All agent tool calls are currently blocked."
                      className="input input-bordered input-sm w-full max-w-md"
                    />
                    <label className="label"><span className="label-text-alt text-xs text-base-content/40">Default message shown when kill switch is activated</span></label>
                  </div>
                </div>
              </Card>
            </motion.div>

            {/* Heartbeat Thresholds (#45) */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Card>
                <CardTitle>Heartbeat Thresholds</CardTitle>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="form-control">
                    <label className="label"><span className="label-text text-xs font-medium">Online Threshold (minutes)</span></label>
                    <input
                      type="number"
                      value={orgSettings.heartbeatOnlineThresholdMs ? orgSettings.heartbeatOnlineThresholdMs / 60000 : ""}
                      onChange={(e) => setOrgSettings({ ...orgSettings, heartbeatOnlineThresholdMs: e.target.value ? parseFloat(e.target.value) * 60000 : undefined })}
                      placeholder="5"
                      className="input input-bordered input-sm w-full"
                      min={0.5}
                      step={0.5}
                    />
                    <label className="label"><span className="label-text-alt text-xs text-base-content/40">Client is considered online within this window</span></label>
                  </div>
                  <div className="form-control">
                    <label className="label"><span className="label-text text-xs font-medium">Offline Threshold (minutes)</span></label>
                    <input
                      type="number"
                      value={orgSettings.heartbeatOfflineThresholdMs ? orgSettings.heartbeatOfflineThresholdMs / 60000 : ""}
                      onChange={(e) => setOrgSettings({ ...orgSettings, heartbeatOfflineThresholdMs: e.target.value ? parseFloat(e.target.value) * 60000 : undefined })}
                      placeholder="10"
                      className="input input-bordered input-sm w-full"
                      min={1}
                      step={0.5}
                    />
                    <label className="label"><span className="label-text-alt text-xs text-base-content/40">Client is considered offline after this window</span></label>
                  </div>
                </div>
              </Card>
            </motion.div>

            {/* Change Password */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <Card>
                <CardTitle>Change Password</CardTitle>
                <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                  <div className="form-control">
                    <label className="label"><span className="label-text text-xs font-medium">Current Password</span></label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                      className="input input-bordered input-sm w-full"
                      placeholder="Enter current password"
                    />
                  </div>

                  <div className="form-control">
                    <label className="label"><span className="label-text text-xs font-medium">New Password</span></label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={6}
                      className="input input-bordered input-sm w-full"
                      placeholder="Enter new password (min 6 characters)"
                    />
                  </div>

                  <div className="form-control">
                    <label className="label"><span className="label-text text-xs font-medium">Confirm New Password</span></label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                      className="input input-bordered input-sm w-full"
                      placeholder="Confirm new password"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
                    className="btn btn-primary btn-sm"
                  >
                    {changingPassword && <span className="loading loading-spinner loading-xs" />}
                    {changingPassword ? "Changing..." : "Change Password"}
                  </button>
                </form>
              </Card>
            </motion.div>
          </div>
        )}
      </main>
    </div>
  );
}
