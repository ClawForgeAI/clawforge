"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "@/components/sidebar";
import { Card, CardTitle } from "@/components/card";
import { Badge } from "@/components/badge";
import { CardSkeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { getAuth } from "@/lib/auth";
import { getPolicy, updatePolicy } from "@/lib/api";

const TOOL_GROUPS: Record<string, string[]> = {
  "group:fs": ["read", "write", "edit", "apply_patch"],
  "group:web": ["web_search", "web_fetch"],
  "group:runtime": ["exec", "process"],
  "group:memory": ["memory_search", "memory_get"],
  "group:sessions": ["sessions_list", "sessions_history", "sessions_send", "sessions_spawn", "subagents", "session_status"],
  "group:ui": ["browser", "canvas"],
  "group:automation": ["cron", "gateway"],
  "group:messaging": ["message"],
  "group:nodes": ["nodes"],
};

const ALL_TOOLS = [
  "read", "write", "edit", "apply_patch", "glob", "grep",
  "exec", "process", "bash",
  "web_search", "web_fetch",
  "memory_search", "memory_get",
  "browser", "canvas",
  "message", "cron", "gateway", "nodes",
  "sessions_list", "sessions_history", "sessions_send",
  "sessions_spawn", "subagents", "session_status",
  ...Object.keys(TOOL_GROUPS),
];

type Conflict = { tool: string; reason: string };

function getConflicts(allowList: string[], denyList: string[]): Conflict[] {
  const conflicts: Conflict[] = [];

  function expand(name: string): string[] {
    return TOOL_GROUPS[name] ? TOOL_GROUPS[name] : [name];
  }

  for (const item of allowList) {
    if (denyList.includes(item)) {
      conflicts.push({ tool: item, reason: `"${item}" appears in both allow and deny lists` });
    }
  }

  for (const denyItem of denyList) {
    if (TOOL_GROUPS[denyItem]) {
      const groupTools = TOOL_GROUPS[denyItem];
      for (const tool of groupTools) {
        if (allowList.includes(tool)) {
          conflicts.push({ tool, reason: `"${tool}" is allowed individually but denied via ${denyItem}` });
        }
      }
    }
  }

  for (const allowItem of allowList) {
    if (TOOL_GROUPS[allowItem]) {
      const groupTools = TOOL_GROUPS[allowItem];
      for (const tool of groupTools) {
        if (denyList.includes(tool)) {
          conflicts.push({ tool, reason: `"${tool}" is denied individually but allowed via ${allowItem}` });
        }
      }
    }
  }

  for (const denyItem of denyList) {
    if (TOOL_GROUPS[denyItem]) {
      for (const allowItem of allowList) {
        if (TOOL_GROUPS[allowItem] && denyItem !== allowItem) {
          const overlap = TOOL_GROUPS[denyItem].filter((t) => TOOL_GROUPS[allowItem].includes(t));
          for (const tool of overlap) {
            if (!conflicts.some((c) => c.tool === tool)) {
              conflicts.push({ tool, reason: `"${tool}" is in both ${allowItem} (allow) and ${denyItem} (deny)` });
            }
          }
        }
      }
    }
  }

  const seen = new Set<string>();
  return conflicts.filter((c) => {
    if (seen.has(c.tool)) return false;
    seen.add(c.tool);
    return true;
  });
}

function getEffectivePolicy(allowList: string[], denyList: string[]) {
  function expand(name: string): string[] {
    return TOOL_GROUPS[name] ? TOOL_GROUPS[name] : [name];
  }

  const allIndividualTools = ALL_TOOLS.filter((t) => !t.startsWith("group:"));
  const blocked = new Set(denyList.flatMap(expand));
  const allowed = new Set(allowList.flatMap(expand));

  const blockedTools = allIndividualTools.filter((t) => blocked.has(t));
  const allowedTools = allowList.length > 0
    ? allIndividualTools.filter((t) => allowed.has(t) && !blocked.has(t))
    : allIndividualTools.filter((t) => !blocked.has(t));
  const implicitlyBlocked = allowList.length > 0
    ? allIndividualTools.filter((t) => !allowed.has(t) && !blocked.has(t))
    : [];

  return { blockedTools, allowedTools, implicitlyBlocked };
}

export default function PoliciesPage() {
  const router = useRouter();
  const toast = useToast();
  const [denyList, setDenyList] = useState<string[]>([]);
  const [allowList, setAllowList] = useState<string[]>([]);
  const [auditLevel, setAuditLevel] = useState("metadata");
  const [profile, setProfile] = useState("");
  const [newDeny, setNewDeny] = useState("");
  const [newAllow, setNewAllow] = useState("");
  const [version, setVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showCatalog, setShowCatalog] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }

    getPolicy(auth.orgId, auth.accessToken).then((policy) => {
      setDenyList(policy.tools.deny ?? []);
      setAllowList(policy.tools.allow ?? []);
      setProfile(policy.tools.profile ?? "");
      setAuditLevel(policy.auditLevel);
      setVersion(policy.version);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [router]);

  function addItem(list: string[], setList: (v: string[]) => void, value: string, setInput: (v: string) => void) {
    const trimmed = value.trim();
    if (trimmed && !list.includes(trimmed)) {
      setList([...list, trimmed]);
    }
    setInput("");
  }

  function removeItem(list: string[], setList: (v: string[]) => void, index: number) {
    setList(list.filter((_, i) => i !== index));
  }

  function expandGroup(name: string): string[] {
    return TOOL_GROUPS[name] ?? [name];
  }

  function addToCatalog(tool: string, target: "allow" | "deny") {
    if (target === "allow" && !allowList.includes(tool)) {
      setAllowList([...allowList, tool]);
    } else if (target === "deny" && !denyList.includes(tool)) {
      setDenyList([...denyList, tool]);
    }
  }

  async function handleSave() {
    const auth = getAuth();
    if (!auth) return;

    setSaving(true);

    try {
      await updatePolicy(auth.orgId, auth.accessToken, {
        toolsConfig: {
          deny: denyList.length > 0 ? denyList : undefined,
          allow: allowList.length > 0 ? allowList : undefined,
          profile: profile || undefined,
        },
        auditLevel,
      });
      setVersion((v) => v + 1);
      toast.success("Policy saved successfully.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const conflicts = getConflicts(allowList, denyList);
  const effective = getEffectivePolicy(allowList, denyList);

  return (
    <div className="flex min-h-screen bg-base-200">
      <Sidebar />
      <main className="flex-1 p-4 lg:p-8 pt-16 lg:pt-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">Policy Editor</h2>
            <p className="text-sm text-base-content/50 mt-1">Configure tool access rules for your organization</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="info">v{version}</Badge>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn btn-primary btn-sm"
            >
              {saving && <span className="loading loading-spinner loading-xs" />}
              {saving ? "Saving..." : "Save Policy"}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Deny List */}
            <Card>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-error" />
                <CardTitle className="mb-0">Denied Tools</CardTitle>
              </div>
              <p className="text-sm text-base-content/50 mb-4">
                Tools in this list will be blocked for all users. Supports group names (e.g. group:fs).
              </p>
              <div className="join w-full mb-4">
                <input
                  value={newDeny}
                  onChange={(e) => setNewDeny(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addItem(denyList, setDenyList, newDeny, setNewDeny))}
                  placeholder="e.g. bash, group:exec"
                  className="input input-bordered input-sm join-item flex-1 focus:input-primary"
                />
                <button
                  onClick={() => addItem(denyList, setDenyList, newDeny, setNewDeny)}
                  className="btn btn-sm btn-primary join-item"
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <AnimatePresence mode="popLayout">
                  {denyList.map((item, i) => (
                    <motion.span
                      key={item}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="badge badge-error badge-outline gap-1 py-3"
                    >
                      <span className="font-mono text-xs">{item}</span>
                      {TOOL_GROUPS[item] && (
                        <span className="opacity-60 text-[10px]">({expandGroup(item).join(", ")})</span>
                      )}
                      <button onClick={() => removeItem(denyList, setDenyList, i)} className="ml-0.5 hover:opacity-70">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12" /></svg>
                      </button>
                    </motion.span>
                  ))}
                </AnimatePresence>
                {denyList.length === 0 && <span className="text-sm text-base-content/30">No denied tools</span>}
              </div>
            </Card>

            {/* Conflict Warning */}
            {conflicts.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="alert alert-warning"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <div>
                  <h3 className="font-bold text-sm">Policy Conflicts Detected ({conflicts.length})</h3>
                  <ul className="mt-1 space-y-0.5">
                    {conflicts.map((c, i) => (
                      <li key={i} className="text-xs opacity-80">
                        <span className="font-mono font-medium">{c.tool}</span>: {c.reason}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs opacity-60 mt-1">Deny rules take precedence over allow rules.</p>
                </div>
              </motion.div>
            )}

            {/* Allow List */}
            <Card>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-success" />
                <CardTitle className="mb-0">Allowed Tools</CardTitle>
              </div>
              <p className="text-sm text-base-content/50 mb-4">
                If set, only these tools will be permitted. Leave empty to allow all (except denied).
              </p>
              <div className="join w-full mb-4">
                <input
                  value={newAllow}
                  onChange={(e) => setNewAllow(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addItem(allowList, setAllowList, newAllow, setNewAllow))}
                  placeholder="e.g. read, write, group:fs"
                  className="input input-bordered input-sm join-item flex-1 focus:input-primary"
                />
                <button
                  onClick={() => addItem(allowList, setAllowList, newAllow, setNewAllow)}
                  className="btn btn-sm btn-primary join-item"
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <AnimatePresence mode="popLayout">
                  {allowList.map((item, i) => (
                    <motion.span
                      key={item}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="badge badge-success badge-outline gap-1 py-3"
                    >
                      <span className="font-mono text-xs">{item}</span>
                      {TOOL_GROUPS[item] && (
                        <span className="opacity-60 text-[10px]">({expandGroup(item).join(", ")})</span>
                      )}
                      <button onClick={() => removeItem(allowList, setAllowList, i)} className="ml-0.5 hover:opacity-70">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12" /></svg>
                      </button>
                    </motion.span>
                  ))}
                </AnimatePresence>
                {allowList.length === 0 && <span className="text-sm text-base-content/30">All tools allowed (except denied)</span>}
              </div>
            </Card>

            {/* Audit Level & Profile */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardTitle>Audit Level</CardTitle>
                <select
                  value={auditLevel}
                  onChange={(e) => setAuditLevel(e.target.value)}
                  className="select select-bordered select-sm w-full"
                >
                  <option value="full">Full (all events + LLM I/O)</option>
                  <option value="metadata">Metadata (events only)</option>
                  <option value="off">Off</option>
                </select>
              </Card>

              <Card>
                <CardTitle>Tool Profile</CardTitle>
                <input
                  value={profile}
                  onChange={(e) => setProfile(e.target.value)}
                  placeholder="e.g. developer, readonly"
                  className="input input-bordered input-sm w-full"
                />
              </Card>
            </div>

            {/* Tool Reference */}
            <Card>
              <button
                onClick={() => setShowCatalog(!showCatalog)}
                className="flex items-center justify-between w-full text-left"
              >
                <CardTitle className="mb-0">Tool Reference</CardTitle>
                <svg className={`w-5 h-5 text-base-content/40 transition-transform duration-200 ${showCatalog ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              <AnimatePresence>
                {showCatalog && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-4 overflow-x-auto">
                      <table className="table table-sm table-zebra">
                        <thead>
                          <tr className="text-base-content/40 text-xs uppercase">
                            <th>Name</th>
                            <th>Type</th>
                            <th>Expands To</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(TOOL_GROUPS).map(([group, tools]) => (
                            <tr key={group} className="table-row-hover">
                              <td className="font-mono text-xs font-medium">{group}</td>
                              <td><Badge variant="info">group</Badge></td>
                              <td className="text-xs text-base-content/50">{tools.join(", ")}</td>
                              <td>
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => addToCatalog(group, "allow")}
                                    className="btn btn-success btn-outline btn-xs"
                                  >
                                    +Allow
                                  </button>
                                  <button
                                    onClick={() => addToCatalog(group, "deny")}
                                    className="btn btn-error btn-outline btn-xs"
                                  >
                                    +Deny
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {ALL_TOOLS.filter((t) => !t.startsWith("group:")).map((tool) => (
                            <tr key={tool} className="table-row-hover">
                              <td className="font-mono text-xs font-medium">{tool}</td>
                              <td><Badge>tool</Badge></td>
                              <td className="text-xs text-base-content/50">-</td>
                              <td>
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => addToCatalog(tool, "allow")}
                                    className="btn btn-success btn-outline btn-xs"
                                  >
                                    +Allow
                                  </button>
                                  <button
                                    onClick={() => addToCatalog(tool, "deny")}
                                    className="btn btn-error btn-outline btn-xs"
                                  >
                                    +Deny
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>

            {/* Effective Policy Preview */}
            <Card>
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="flex items-center justify-between w-full text-left"
              >
                <CardTitle className="mb-0">Preview Effective Policy</CardTitle>
                <svg className={`w-5 h-5 text-base-content/40 transition-transform duration-200 ${showPreview ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              <AnimatePresence>
                {showPreview && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-4 space-y-4">
                      <div>
                        <h4 className="text-sm font-medium text-error mb-2 flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-error" />
                          Blocked Tools ({effective.blockedTools.length})
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {effective.blockedTools.length > 0 ? effective.blockedTools.map((t) => (
                            <span key={t} className="badge badge-error badge-outline badge-sm font-mono">{t}</span>
                          )) : (
                            <span className="text-sm text-base-content/30">None</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-success mb-2 flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-success" />
                          Allowed Tools ({effective.allowedTools.length})
                          {allowList.length === 0 && " - All (except blocked)"}
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {effective.allowedTools.map((t) => (
                            <span key={t} className="badge badge-success badge-outline badge-sm font-mono">{t}</span>
                          ))}
                        </div>
                      </div>
                      {effective.implicitlyBlocked.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-warning mb-2 flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-warning" />
                            Implicitly Blocked ({effective.implicitlyBlocked.length})
                          </h4>
                          <p className="text-xs text-base-content/40 mb-2">
                            Not in the allow list, so these tools are blocked by omission.
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {effective.implicitlyBlocked.map((t) => (
                              <span key={t} className="badge badge-warning badge-outline badge-sm font-mono">{t}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
