"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "@/components/sidebar";
import { Card, CardTitle } from "@/components/card";
import { Badge } from "@/components/badge";
import { CardSkeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { getAuth } from "@/lib/auth";
import { getPolicy, updatePolicy } from "@/lib/api";

// --- Business-friendly capability definitions ---

type RiskLevel = "low" | "medium" | "high" | "critical";

type Capability = {
  id: string;
  label: string;
  description: string;
  risk: RiskLevel;
  tools: string[];
  icon: React.ReactNode;
};

const CAPABILITIES: Capability[] = [
  {
    id: "group:fs",
    label: "File Access",
    description: "Read, write, and edit files on the user's machine",
    risk: "medium",
    tools: ["read", "write", "edit", "apply_patch"],
    icon: <FolderIcon />,
  },
  {
    id: "group:web",
    label: "Internet & Web",
    description: "Search the web and fetch content from URLs",
    risk: "medium",
    tools: ["web_search", "web_fetch"],
    icon: <GlobeIcon />,
  },
  {
    id: "group:runtime",
    label: "Code Execution",
    description: "Run shell commands, scripts, and system processes",
    risk: "critical",
    tools: ["exec", "process", "bash"],
    icon: <TerminalIcon />,
  },
  {
    id: "group:memory",
    label: "Memory & Knowledge",
    description: "Access and search the AI's stored knowledge and context",
    risk: "low",
    tools: ["memory_search", "memory_get"],
    icon: <BrainIcon />,
  },
  {
    id: "group:ui",
    label: "Browser & UI",
    description: "Automate browser interactions and visual canvas operations",
    risk: "high",
    tools: ["browser", "canvas"],
    icon: <LayoutIcon />,
  },
  {
    id: "group:media",
    label: "Media & Perception",
    description: "Understand images, generate speech, and process multimedia content",
    risk: "medium",
    tools: ["image", "tts"],
    icon: <MediaIcon />,
  },
  {
    id: "group:messaging",
    label: "Communication",
    description: "Send messages on behalf of the user through connected channels",
    risk: "high",
    tools: ["message"],
    icon: <MessageIcon />,
  },
  {
    id: "group:automation",
    label: "Scheduled Tasks",
    description: "Create automated schedules and manage gateway integrations",
    risk: "high",
    tools: ["cron", "gateway"],
    icon: <ClockIcon />,
  },
  {
    id: "group:sessions",
    label: "Multi-Agent Coordination",
    description: "Manage AI sessions, spawn sub-agents, and coordinate tasks",
    risk: "medium",
    tools: ["sessions_list", "sessions_history", "sessions_send", "sessions_spawn", "subagents", "session_status"],
    icon: <NetworkIcon />,
  },
  {
    id: "group:agents",
    label: "Agent Management",
    description: "List and inspect AI agents running across the organization",
    risk: "low",
    tools: ["agents_list"],
    icon: <AgentsIcon />,
  },
  {
    id: "group:nodes",
    label: "Infrastructure",
    description: "Manage and interact with infrastructure nodes and devices",
    risk: "critical",
    tools: ["nodes"],
    icon: <ServerIcon />,
  },
  {
    id: "group:plugins",
    label: "Plugin Tools",
    description: "Tools provided by installed plugins and third-party extensions",
    risk: "high",
    tools: [],
    icon: <PluginIcon />,
  },
];

const ALL_INDIVIDUAL_TOOLS = CAPABILITIES.flatMap((c) => c.tools);

const RISK_CONFIG: Record<RiskLevel, { label: string; color: string; badgeVariant: "success" | "warning" | "danger" | "info" }> = {
  low: { label: "Low Risk", color: "text-success", badgeVariant: "success" },
  medium: { label: "Medium Risk", color: "text-info", badgeVariant: "info" },
  high: { label: "High Risk", color: "text-warning", badgeVariant: "warning" },
  critical: { label: "Critical Risk", color: "text-error", badgeVariant: "danger" },
};

type PolicyMode = "permissive" | "restrictive";

type Preset = {
  id: string;
  label: string;
  description: string;
  mode: PolicyMode;
  enabledCapabilities: string[];
};

const PRESETS: Preset[] = [
  {
    id: "permissive",
    label: "Full Access",
    description: "All capabilities enabled. Best for trusted developer teams.",
    mode: "permissive",
    enabledCapabilities: CAPABILITIES.map((c) => c.id),
  },
  {
    id: "standard",
    label: "Standard",
    description: "Blocks code execution, infrastructure, and plugin tools. Good default for most teams.",
    mode: "permissive",
    enabledCapabilities: CAPABILITIES.filter((c) => c.risk !== "critical" && c.risk !== "high").map((c) => c.id),
  },
  {
    id: "readonly",
    label: "Read Only",
    description: "Only file reading, memory, web search, and agents. Safest option.",
    mode: "restrictive",
    enabledCapabilities: ["group:fs", "group:memory", "group:web", "group:agents"],
  },
  {
    id: "custom",
    label: "Custom",
    description: "Configure each capability individually.",
    mode: "permissive",
    enabledCapabilities: [],
  },
];

const AUDIT_LEVELS = [
  {
    value: "full",
    label: "Comprehensive",
    description: "Records all events including full AI conversations. Required for compliance audits.",
    icon: <ShieldCheckIcon />,
    recommended: true,
  },
  {
    value: "metadata",
    label: "Standard",
    description: "Records tool usage events without conversation content. Balances visibility with privacy.",
    icon: <ListIcon />,
    recommended: false,
  },
  {
    value: "off",
    label: "Disabled",
    description: "No audit logging. Not recommended for production use.",
    icon: <EyeOffIcon />,
    recommended: false,
  },
];

// --- Helpers ---

function capabilitiesToPolicy(
  mode: PolicyMode,
  enabledCaps: Set<string>,
  expandedOverrides: Map<string, Set<string>>,
) {
  const allow: string[] = [];
  const deny: string[] = [];

  if (mode === "permissive") {
    for (const cap of CAPABILITIES) {
      if (!enabledCaps.has(cap.id)) {
        if (cap.tools.length > 0) {
          deny.push(...cap.tools);
        } else {
          deny.push(cap.id);
        }
      } else {
        const overrides = expandedOverrides.get(cap.id);
        if (overrides) {
          for (const tool of cap.tools) {
            if (!overrides.has(tool)) {
              deny.push(tool);
            }
          }
        }
      }
    }
  } else {
    for (const cap of CAPABILITIES) {
      if (enabledCaps.has(cap.id)) {
        const overrides = expandedOverrides.get(cap.id);
        if (overrides) {
          for (const tool of cap.tools) {
            if (overrides.has(tool)) {
              allow.push(tool);
            }
          }
        } else if (cap.tools.length > 0) {
          allow.push(...cap.tools);
        } else {
          allow.push(cap.id);
        }
      }
    }
  }

  return { allow, deny };
}

function policyToCapabilities(
  allowList: string[],
  denyList: string[],
): { mode: PolicyMode; enabledCaps: Set<string>; overrides: Map<string, Set<string>> } {
  const denied = new Set(denyList);
  const allowed = new Set(allowList);
  const isAllowMode = allowList.length > 0;

  const enabledCaps = new Set<string>();
  const overrides = new Map<string, Set<string>>();

  if (isAllowMode) {
    for (const cap of CAPABILITIES) {
      const enabledTools = cap.tools.filter((t) => allowed.has(t));
      if (enabledTools.length > 0) {
        enabledCaps.add(cap.id);
        if (enabledTools.length !== cap.tools.length) {
          overrides.set(cap.id, new Set(enabledTools));
        }
      }
    }
    return { mode: "restrictive", enabledCaps, overrides };
  }

  for (const cap of CAPABILITIES) {
    const blockedTools = cap.tools.filter((t) => denied.has(t));
    if (blockedTools.length === 0) {
      enabledCaps.add(cap.id);
    } else if (blockedTools.length < cap.tools.length) {
      enabledCaps.add(cap.id);
      const enabledTools = cap.tools.filter((t) => !denied.has(t));
      overrides.set(cap.id, new Set(enabledTools));
    }
  }

  return { mode: "permissive", enabledCaps, overrides };
}

function getEffectiveCounts(mode: PolicyMode, enabledCaps: Set<string>, overrides: Map<string, Set<string>>) {
  let allowed = 0;
  let blocked = 0;

  for (const cap of CAPABILITIES) {
    const capOverrides = overrides.get(cap.id);
    if (enabledCaps.has(cap.id)) {
      if (capOverrides) {
        allowed += capOverrides.size;
        blocked += cap.tools.length - capOverrides.size;
      } else {
        allowed += cap.tools.length;
      }
    } else {
      blocked += cap.tools.length;
    }
  }

  return { allowed, blocked, total: ALL_INDIVIDUAL_TOOLS.length };
}

// --- Component ---

export default function PoliciesPage() {
  const router = useRouter();
  const toast = useToast();

  const [mode, setMode] = useState<PolicyMode>("permissive");
  const [enabledCaps, setEnabledCaps] = useState<Set<string>>(new Set(CAPABILITIES.map((c) => c.id)));
  const [overrides, setOverrides] = useState<Map<string, Set<string>>>(new Map());
  const [auditLevel, setAuditLevel] = useState("metadata");
  const [profile, setProfile] = useState("");
  const [version, setVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [expandedCap, setExpandedCap] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }

    getPolicy(auth.orgId, auth.accessToken)
      .then((policy) => {
        const { mode: m, enabledCaps: ec, overrides: ov } = policyToCapabilities(
          policy.tools.allow ?? [],
          policy.tools.deny ?? [],
        );
        setMode(m);
        setEnabledCaps(ec);
        setOverrides(ov);
        setProfile(policy.tools.profile ?? "");
        setAuditLevel(policy.auditLevel);
        setVersion(policy.version);
        detectPreset(m, ec);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

  function detectPreset(m: PolicyMode, caps: Set<string>) {
    for (const preset of PRESETS) {
      if (preset.id === "custom") continue;
      if (preset.mode !== m) continue;
      const presetSet = new Set(preset.enabledCapabilities);
      if (caps.size === presetSet.size && [...caps].every((c) => presetSet.has(c))) {
        setActivePreset(preset.id);
        return;
      }
    }
    setActivePreset("custom");
  }

  function applyPreset(preset: Preset) {
    const newCaps = new Set(preset.enabledCapabilities);
    setMode(preset.mode);
    setEnabledCaps(newCaps);
    setOverrides(new Map());
    setActivePreset(preset.id);
    setHasChanges(true);
  }

  function toggleCapability(capId: string) {
    const next = new Set(enabledCaps);
    if (next.has(capId)) {
      next.delete(capId);
      const newOverrides = new Map(overrides);
      newOverrides.delete(capId);
      setOverrides(newOverrides);
    } else {
      next.add(capId);
    }
    setEnabledCaps(next);
    detectPreset(mode, next);
    setHasChanges(true);
  }

  function toggleTool(capId: string, tool: string) {
    const cap = CAPABILITIES.find((c) => c.id === capId)!;
    const currentOverrides = overrides.get(capId) ?? new Set(enabledCaps.has(capId) ? cap.tools : []);
    const next = new Set(currentOverrides);

    if (next.has(tool)) {
      next.delete(tool);
    } else {
      next.add(tool);
    }

    const newOverrides = new Map(overrides);
    const newCaps = new Set(enabledCaps);

    if (next.size === 0) {
      newCaps.delete(capId);
      newOverrides.delete(capId);
    } else if (next.size === cap.tools.length) {
      newCaps.add(capId);
      newOverrides.delete(capId);
    } else {
      newCaps.add(capId);
      newOverrides.set(capId, next);
    }

    setEnabledCaps(newCaps);
    setOverrides(newOverrides);
    detectPreset(mode, newCaps);
    setHasChanges(true);
  }

  async function handleSave() {
    const auth = getAuth();
    if (!auth) return;

    setSaving(true);

    try {
      const { allow, deny } = capabilitiesToPolicy(mode, enabledCaps, overrides);
      await updatePolicy(auth.orgId, auth.accessToken, {
        toolsConfig: {
          deny: deny.length > 0 ? deny : undefined,
          allow: allow.length > 0 ? allow : undefined,
          profile: profile || undefined,
        },
        auditLevel,
      });
      setVersion((v) => v + 1);
      setHasChanges(false);
      toast.success("Policy saved and will be applied to all connected agents.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const counts = useMemo(
    () => getEffectiveCounts(mode, enabledCaps, overrides),
    [mode, enabledCaps, overrides],
  );

  return (
    <div className="flex min-h-screen bg-base-200">
      <Sidebar />
      <main className="flex-1 p-4 lg:p-8 pt-16 lg:pt-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">AI Permissions</h2>
            <p className="text-sm text-base-content/50 mt-1">
              Control what your organization's AI assistants can and cannot do
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="info">v{version}</Badge>
            {hasChanges && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-xs text-warning font-medium"
              >
                Unsaved changes
              </motion.span>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
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
            {/* Policy Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="bg-success/5 border-success/20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-success/15 flex items-center justify-center">
                    <svg className="w-5 h-5 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-success">{counts.allowed}</p>
                    <p className="text-xs text-base-content/50">Tools Allowed</p>
                  </div>
                </div>
              </Card>
              <Card className="bg-error/5 border-error/20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-error/15 flex items-center justify-center">
                    <svg className="w-5 h-5 text-error" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-error">{counts.blocked}</p>
                    <p className="text-xs text-base-content/50">Tools Blocked</p>
                  </div>
                </div>
              </Card>
              <Card className={`border-base-300/50 ${mode === "restrictive" ? "bg-warning/5 border-warning/20" : ""}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${mode === "restrictive" ? "bg-warning/15" : "bg-primary/15"}`}>
                    <svg className={`w-5 h-5 ${mode === "restrictive" ? "text-warning" : "text-primary"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-bold capitalize">{mode === "restrictive" ? "Restrictive" : "Permissive"}</p>
                    <p className="text-xs text-base-content/50">
                      {mode === "restrictive"
                        ? "Only selected tools are allowed"
                        : "All tools allowed unless blocked"}
                    </p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Quick Presets */}
            <Card>
              <CardTitle>Quick Setup</CardTitle>
              <p className="text-sm text-base-content/50 -mt-2 mb-4">
                Choose a starting point, then customize individual capabilities below
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => preset.id !== "custom" && applyPreset(preset)}
                    className={`text-left p-4 rounded-xl border-2 transition-all duration-150 ${
                      activePreset === preset.id
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-base-300/50 hover:border-base-300 bg-base-100"
                    } ${preset.id === "custom" ? "opacity-60 cursor-default" : "cursor-pointer"}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold">{preset.label}</span>
                      {activePreset === preset.id && (
                        <div className="w-2 h-2 rounded-full bg-primary" />
                      )}
                    </div>
                    <p className="text-xs text-base-content/50 leading-relaxed">{preset.description}</p>
                  </button>
                ))}
              </div>
            </Card>

            {/* Capabilities */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold">AI Capabilities</h3>
                  <p className="text-sm text-base-content/50">
                    {mode === "permissive"
                      ? "Toggle off capabilities you want to block"
                      : "Toggle on capabilities you want to allow"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-base-content/40">Mode:</span>
                  <select
                    value={mode}
                    onChange={(e) => {
                      const m = e.target.value as PolicyMode;
                      setMode(m);
                      if (m === "restrictive") {
                        setEnabledCaps(new Set());
                        setOverrides(new Map());
                      } else {
                        setEnabledCaps(new Set(CAPABILITIES.map((c) => c.id)));
                        setOverrides(new Map());
                      }
                      setActivePreset("custom");
                      setHasChanges(true);
                    }}
                    className="select select-bordered select-xs"
                  >
                    <option value="permissive">Permissive (allow all, block some)</option>
                    <option value="restrictive">Restrictive (block all, allow some)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {CAPABILITIES.map((cap) => {
                  const isEnabled = enabledCaps.has(cap.id);
                  const capOverrides = overrides.get(cap.id);
                  const isPartial = !!capOverrides;
                  const isExpanded = expandedCap === cap.id;
                  const risk = RISK_CONFIG[cap.risk];

                  return (
                    <motion.div
                      key={cap.id}
                      layout
                      className={`card bg-base-100 shadow-sm border-2 transition-colors duration-150 ${
                        isEnabled
                          ? isPartial
                            ? "border-warning/30"
                            : "border-success/30"
                          : "border-base-300/30 opacity-75"
                      }`}
                    >
                      <div className="card-body p-4">
                        {/* Capability header */}
                        <div className="flex items-start gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                            isEnabled ? "bg-primary/10 text-primary" : "bg-base-200 text-base-content/30"
                          }`}>
                            {cap.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-semibold text-sm">{cap.label}</span>
                              <Badge variant={risk.badgeVariant} size="xs">{risk.label}</Badge>
                              {isPartial && (
                                <Badge variant="warning" size="xs">Partial</Badge>
                              )}
                            </div>
                            <p className="text-xs text-base-content/50 leading-relaxed">{cap.description}</p>
                            <p className="text-[10px] text-base-content/30 mt-1 font-mono">
                              {cap.tools.length > 0
                                ? `${cap.tools.length} tool${cap.tools.length !== 1 ? "s" : ""}${isPartial && capOverrides ? ` (${capOverrides.size} active)` : ""}`
                                : "Dynamic (varies by installed plugins)"}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {cap.tools.length > 0 && (
                              <button
                                onClick={() => setExpandedCap(isExpanded ? null : cap.id)}
                                className="btn btn-ghost btn-xs btn-square"
                                title="Show individual tools"
                              >
                                <svg className={`w-4 h-4 text-base-content/40 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M6 9l6 6 6-6" />
                                </svg>
                              </button>
                            )}
                            <input
                              type="checkbox"
                              className={`toggle ${isEnabled ? "toggle-primary" : ""}`}
                              checked={isEnabled}
                              onChange={() => toggleCapability(cap.id)}
                            />
                          </div>
                        </div>

                        {/* Expanded tool list */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="mt-3 pt-3 border-t border-base-200 space-y-1.5">
                                <p className="text-xs text-base-content/40 mb-2">Individual tools in this category:</p>
                                {cap.tools.map((tool) => {
                                  const toolEnabled = capOverrides
                                    ? capOverrides.has(tool)
                                    : isEnabled;
                                  return (
                                    <label
                                      key={tool}
                                      className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-base-200/50 cursor-pointer transition-colors"
                                    >
                                      <input
                                        type="checkbox"
                                        className="checkbox checkbox-xs checkbox-primary"
                                        checked={toolEnabled}
                                        onChange={() => toggleTool(cap.id, tool)}
                                      />
                                      <span className={`font-mono text-xs ${toolEnabled ? "text-base-content" : "text-base-content/40 line-through"}`}>
                                        {tool}
                                      </span>
                                      <span className="text-[10px] text-base-content/30 ml-auto">
                                        {TOOL_DESCRIPTIONS[tool] ?? ""}
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Audit Level */}
            <Card>
              <CardTitle>Audit & Monitoring</CardTitle>
              <p className="text-sm text-base-content/50 -mt-2 mb-4">
                Choose how much activity data to record for compliance and troubleshooting
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {AUDIT_LEVELS.map((level) => (
                  <button
                    key={level.value}
                    onClick={() => {
                      setAuditLevel(level.value);
                      setHasChanges(true);
                    }}
                    className={`text-left p-4 rounded-xl border-2 transition-all duration-150 ${
                      auditLevel === level.value
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-base-300/50 hover:border-base-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        auditLevel === level.value ? "bg-primary/15 text-primary" : "bg-base-200 text-base-content/40"
                      }`}>
                        {level.icon}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{level.label}</span>
                        {level.recommended && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-success/10 text-success font-medium">
                            Recommended
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-base-content/50 leading-relaxed">{level.description}</p>
                  </button>
                ))}
              </div>
            </Card>

            {/* Advanced Settings */}
            <Card>
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center justify-between w-full text-left"
              >
                <CardTitle className="mb-0">Advanced Settings</CardTitle>
                <svg className={`w-5 h-5 text-base-content/40 transition-transform duration-200 ${showAdvanced ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              <AnimatePresence>
                {showAdvanced && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-4 space-y-4">
                      <div>
                        <label className="text-sm font-medium text-base-content/70 block mb-1.5">Tool Profile</label>
                        <p className="text-xs text-base-content/40 mb-2">
                          Optional label to tag this policy configuration (e.g., "engineering", "support")
                        </p>
                        <input
                          value={profile}
                          onChange={(e) => {
                            setProfile(e.target.value);
                            setHasChanges(true);
                          }}
                          placeholder="e.g. engineering, support, contractor"
                          className="input input-bordered input-sm w-full max-w-md"
                        />
                      </div>
                      <div className="divider my-2" />
                      <div>
                        <label className="text-sm font-medium text-base-content/70 block mb-1.5">Raw Policy Preview</label>
                        <p className="text-xs text-base-content/40 mb-2">
                          The actual allow/deny lists that will be sent to agents
                        </p>
                        <RawPolicyPreview mode={mode} enabledCaps={enabledCaps} overrides={overrides} />
                      </div>
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

// --- Raw Policy Preview Sub-Component ---

function RawPolicyPreview({
  mode,
  enabledCaps,
  overrides,
}: {
  mode: PolicyMode;
  enabledCaps: Set<string>;
  overrides: Map<string, Set<string>>;
}) {
  const { allow, deny } = capabilitiesToPolicy(mode, enabledCaps, overrides);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="bg-base-200 rounded-lg p-3">
        <p className="text-xs font-medium text-success mb-2">Allow List ({allow.length})</p>
        <div className="flex flex-wrap gap-1">
          {allow.length > 0 ? allow.map((t) => (
            <span key={t} className="badge badge-success badge-outline badge-xs font-mono">{t}</span>
          )) : (
            <span className="text-xs text-base-content/30">
              {mode === "permissive" ? "Not used (permissive mode)" : "Empty"}
            </span>
          )}
        </div>
      </div>
      <div className="bg-base-200 rounded-lg p-3">
        <p className="text-xs font-medium text-error mb-2">Deny List ({deny.length})</p>
        <div className="flex flex-wrap gap-1">
          {deny.length > 0 ? deny.map((t) => (
            <span key={t} className="badge badge-error badge-outline badge-xs font-mono">{t}</span>
          )) : (
            <span className="text-xs text-base-content/30">
              {mode === "restrictive" ? "Not used (restrictive mode)" : "Empty"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Tool Descriptions ---

const TOOL_DESCRIPTIONS: Record<string, string> = {
  read: "Read file contents",
  write: "Create or overwrite files",
  edit: "Modify parts of a file",
  apply_patch: "Apply code patches",
  exec: "Execute shell commands",
  process: "Manage system processes",
  bash: "Run bash scripts",
  web_search: "Search the internet",
  web_fetch: "Download web page content",
  memory_search: "Search stored knowledge",
  memory_get: "Retrieve stored knowledge",
  browser: "Automate web browser",
  canvas: "Visual canvas operations",
  image: "Understand and analyze images",
  tts: "Convert text to speech audio",
  message: "Send messages to channels",
  cron: "Schedule recurring tasks",
  gateway: "Manage gateway integrations",
  sessions_list: "List active sessions",
  sessions_history: "View session history",
  sessions_send: "Send to a session",
  sessions_spawn: "Create new sessions",
  subagents: "Manage sub-agents",
  session_status: "Check session status",
  agents_list: "List running AI agents",
  nodes: "Manage infrastructure nodes",
};

// --- Icons ---

function FolderIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

function BrainIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z" />
      <line x1="10" y1="22" x2="14" y2="22" />
    </svg>
  );
}

function LayoutIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="9" y1="21" x2="9" y2="9" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function NetworkIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="6" rx="1" />
      <rect x="2" y="16" width="6" height="6" rx="1" />
      <rect x="16" y="16" width="6" height="6" rx="1" />
      <path d="M12 8v4m-7 4V12h14v4" />
    </svg>
  );
}

function ServerIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="8" rx="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  );
}

function MediaIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

function AgentsIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="5" />
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="8" r="1" />
    </svg>
  );
}

function PluginIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v6m0 8v6M2 12h6m8 0h6" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

function ShieldCheckIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
