/**
 * ClawForge enterprise governance plugin.
 *
 * Registers hooks for:
 * - SSO authentication on plugin load (CLI, TUI, and gateway modes)
 * - Org policy fetch and caching
 * - Tool policy enforcement (before_tool_call)
 * - Audit logging (before_tool_call, after_tool_call, session lifecycle)
 * - Kill switch heartbeat
 * - Skill filtering via config population
 * - Connection state tracking and graceful degradation
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { ClawForgePluginConfig, OrgPolicy } from "./types.js";
import { loadSession, isSessionValid, saveSession } from "./auth/token-store.js";
import { fetchEffectivePolicy, refreshSessionToken } from "./policy/org-policy-client.js";
import { loadCachedPolicy, saveCachedPolicy, loadCachedPolicyFallback } from "./policy/org-policy-cache.js";
import { createToolEnforcerHook, type ToolEnforcerState } from "./policy/tool-enforcer.js";
import { buildSkillsEnterpriseConfig } from "./policy/skill-filter.js";
import { AuditLogger } from "./audit/audit-logger.js";
import { KillSwitchManager } from "./heartbeat/kill-switch.js";
import { ConnectionStateManager, type ConnectionStatus } from "./connection/connection-state.js";
import { SSEClient } from "./events/sse-client.js";
import { TokenRefreshManager } from "./auth/token-refresh-manager.js";
import { createPullRequestAutomationScheduler, runPullRequestAutomation } from "./automation/pr-automation.js";

/**
 * Shared state used by the status command handler.
 */
let sharedConnectionStateManager: ConnectionStateManager | null = null;
let sharedAuditLogger: AuditLogger | null = null;
let sharedEnforcerState: ToolEnforcerState | null = null;

/**
 * Initialize the ClawForge plugin: authenticate, fetch policy, set up hooks.
 */
async function initializeClawForge(
  api: OpenClawPluginApi,
  pluginConfig: ClawForgePluginConfig,
  enforcerState: ToolEnforcerState,
  onAuditLoggerReady: (logger: AuditLogger) => void,
): Promise<void> {
  const logger = api.logger;

  // --- 1. Authenticate ---
  let session = loadSession();
  if (!isSessionValid(session)) {
    if (session?.refreshToken && pluginConfig.controlPlaneUrl) {
      try {
        logger.info("Refreshing ClawForge session...");
        session = await refreshSessionToken({
          controlPlaneUrl: pluginConfig.controlPlaneUrl,
          refreshToken: session.refreshToken,
        });
        saveSession(session);
      } catch (err) {
        logger.warn(`Session refresh failed: ${String(err)}. Use /clawforge-login to re-authenticate.`);
        session = null;
      }
    } else {
      logger.warn("No valid ClawForge session. Use /clawforge-login to authenticate.");
      session = null;
    }
  }

  if (!session) {
    logger.info("ClawForge running in unauthenticated mode (policy enforcement disabled)");
    enforcerState.pendingInit = false;
    // Create a connection state manager in unauthenticated state.
    const connState = new ConnectionStateManager({
      failureThreshold: pluginConfig.heartbeatFailureThreshold ?? 10,
      logger,
    });
    connState.setUnauthenticated();
    sharedConnectionStateManager = connState;
    return;
  }

  const orgId = session.orgId || pluginConfig.orgId || "";

  // --- 2. Fetch policy ---
  let policy: OrgPolicy | null = null;
  const cacheTtl = pluginConfig.policyCacheTtlMs;
  let policyFetchedAt: number | null = null;

  // Try cache first.
  policy = loadCachedPolicy(cacheTtl);

  if (!policy && pluginConfig.controlPlaneUrl) {
    try {
      logger.info("Fetching org policy from control plane...");
      policy = await fetchEffectivePolicy({
        controlPlaneUrl: pluginConfig.controlPlaneUrl,
        orgId,
        userId: session.userId,
        accessToken: session.accessToken,
      });
      saveCachedPolicy(policy, cacheTtl);
      policyFetchedAt = Date.now();
    } catch (err) {
      logger.warn(`Policy fetch failed: ${String(err)}`);
      // Fall back to expired cache.
      policy = loadCachedPolicyFallback();
      if (policy) {
        logger.info("Using cached policy (may be stale)");
      }
    }
  } else if (policy) {
    policyFetchedAt = Date.now();
  }

  // --- 3. Apply skill filter ---
  if (policy) {
    const enterprise = buildSkillsEnterpriseConfig(policy);
    if (enterprise) {
      // Merge into the config so shouldIncludeSkill() picks it up.
      const config = api.config;
      if (!config.skills) {
        (config as Record<string, unknown>).skills = {};
      }
      (config.skills as Record<string, unknown>).enterprise = enterprise;
    }

    // Check kill switch from policy.
    if (policy.killSwitch?.active) {
      logger.warn(`Kill switch is active: ${policy.killSwitch.message ?? "No message"}`);
    }
  }

  // --- 4. Populate enforcer state (created synchronously in register()) ---
  enforcerState.policy = policy;
  enforcerState.killSwitchActive = policy?.killSwitch?.active ?? false;
  enforcerState.killSwitchMessage = policy?.killSwitch?.message;

  // --- 5. Set up audit logger ---
  const auditLogger = new AuditLogger({
    config: pluginConfig,
    session,
    auditLevel: policy?.auditLevel,
    logger,
  });
  auditLogger.start();
  sharedAuditLogger = auditLogger;
  onAuditLoggerReady(auditLogger);

  // --- 5b. Set up connection state manager ---
  const connectionStateManager = new ConnectionStateManager({
    failureThreshold: pluginConfig.heartbeatFailureThreshold ?? 10,
    auditLogger,
    cachedPolicyFetchedAt: policyFetchedAt,
    logger,
  });
  sharedConnectionStateManager = connectionStateManager;

  // --- 6. (before_tool_call hook already registered synchronously in register()) ---

  // --- 7. Register after_tool_call hook for audit ---
  api.on("after_tool_call", (event, ctx) => {
    auditLogger.enqueue({
      eventType: "tool_call_result",
      toolName: event.toolName,
      outcome: event.error ? "error" : "success",
      agentId: ctx.agentId,
      sessionKey: ctx.sessionKey,
      metadata: {
        durationMs: event.durationMs,
        ...(event.error ? { error: event.error } : {}),
      },
    });
  });

  // --- 8. Register session lifecycle hooks ---
  api.on("session_start", (event, ctx) => {
    auditLogger.enqueue({
      eventType: "session_start",
      outcome: "success",
      agentId: ctx.agentId,
      sessionKey: event.sessionKey ?? ctx.sessionKey,
    });
  });

  api.on("session_end", (event, ctx) => {
    auditLogger.enqueue({
      eventType: "session_end",
      outcome: "success",
      agentId: ctx.agentId,
      sessionKey: event.sessionKey ?? ctx.sessionKey,
      metadata: {
        messageCount: event.messageCount,
        durationMs: event.durationMs,
      },
    });
  });

  // --- 9. Register LLM hooks ---
  // AuditLogger.enqueue() handles level gating: "off" skips entirely,
  // "metadata" strips metadata, "full" includes everything.
  api.on("llm_input", (event, ctx) => {
    auditLogger.enqueue({
      eventType: "llm_input",
      outcome: "success",
      agentId: ctx.agentId,
      sessionKey: ctx.sessionKey,
      metadata: {
        provider: event.provider,
        model: event.model,
        imagesCount: event.imagesCount,
      },
    });
  });

  api.on("llm_output", (event, ctx) => {
    auditLogger.enqueue({
      eventType: "llm_output",
      outcome: "success",
      agentId: ctx.agentId,
      sessionKey: ctx.sessionKey,
      metadata: {
        provider: event.provider,
        model: event.model,
        usage: event.usage,
      },
    });
  });

  // --- 10. Start heartbeat / kill switch manager ---
  const refreshPolicy = async () => {
    if (!pluginConfig.controlPlaneUrl) return;
    try {
      const fresh = await fetchEffectivePolicy({
        controlPlaneUrl: pluginConfig.controlPlaneUrl,
        orgId,
        userId: session!.userId,
        accessToken: session!.accessToken,
      });
      saveCachedPolicy(fresh, cacheTtl);
      enforcerState.policy = fresh;
      enforcerState.killSwitchActive = fresh.killSwitch?.active ?? false;
      enforcerState.killSwitchMessage = fresh.killSwitch?.message;
      auditLogger.updateAuditLevel(fresh.auditLevel);
      connectionStateManager.updateCachedPolicyFetchedAt(Date.now());
      logger.info("Policy refreshed via heartbeat");
    } catch (err) {
      logger.warn(`Heartbeat-triggered policy refresh failed: ${String(err)}`);
    }
  };

  // Background refresh on cache hit.
  if (policy && pluginConfig.controlPlaneUrl) {
    fetchEffectivePolicy({
      controlPlaneUrl: pluginConfig.controlPlaneUrl,
      orgId,
      userId: session.userId,
      accessToken: session.accessToken,
    })
      .then((fresh) => {
        saveCachedPolicy(fresh, cacheTtl);
        enforcerState.policy = fresh;
        enforcerState.killSwitchActive = fresh.killSwitch?.active ?? false;
        enforcerState.killSwitchMessage = fresh.killSwitch?.message;
        auditLogger.updateAuditLevel(fresh.auditLevel);
        connectionStateManager.updateCachedPolicyFetchedAt(Date.now());
        logger.info("Org policy refreshed in background");
      })
      .catch((err) => {
        logger.warn(`Background policy refresh failed: ${String(err)}`);
      });
  }

  const killSwitchMgr = new KillSwitchManager({
    config: pluginConfig,
    session,
    enforcerState,
    connectionStateManager,
    onPolicyRefreshNeeded: () => {
      refreshPolicy().catch(() => {});
    },
    logger,
  });
  killSwitchMgr.start();

  // --- 10b. Start SSE client for real-time push (if enabled) ---
  const sseEnabled = pluginConfig.sseEnabled !== false; // default true
  let sseClient: SSEClient | null = null;

  if (sseEnabled && pluginConfig.controlPlaneUrl) {
    sseClient = new SSEClient({
      config: pluginConfig,
      session,
      enforcerState,
      onPolicyRefreshNeeded: () => {
        refreshPolicy().catch(() => {});
      },
      logger,
    });
    sseClient.start();
    logger.info("SSE real-time event stream enabled");
  }

  // --- 10c. Start proactive token refresh manager ---
  const tokenRefreshMgr = new TokenRefreshManager({
    controlPlaneUrl: pluginConfig.controlPlaneUrl ?? "",
    session,
    onTokenRefreshed: (newSession) => {
      session = newSession;
      killSwitchMgr.updateAccessToken(newSession.accessToken);
      auditLogger.updateAccessToken(newSession.accessToken);
      sseClient?.updateAccessToken(newSession.accessToken);
    },
    logger,
  });
  tokenRefreshMgr.start();

  // --- 11. Register cleanup for both gateway and CLI/TUI modes ---
  let cleanedUp = false;
  const cleanup = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    tokenRefreshMgr.stop();
    killSwitchMgr.stop();
    sseClient?.stop();
    await auditLogger.stop();
    logger.info("ClawForge shutdown: audit events flushed, heartbeat stopped, SSE disconnected");
  };

  api.on("gateway_stop", () => cleanup());
  process.on("beforeExit", () => {
    cleanup().catch(() => {});
  });

  // Mark initialization complete — the before_tool_call hook will now use real policy data
  // instead of the conservative "block all" default.
  enforcerState.pendingInit = false;

  logger.info(
    `ClawForge initialized (org=${orgId}, policy v${policy?.version ?? "none"}, audit=${policy?.auditLevel ?? "off"}, offlineMode=${pluginConfig.offlineMode ?? "block"})`,
  );
}

/**
 * Format a duration in milliseconds to a human-readable string.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

/**
 * Plugin registration entry point.
 */
export function register(api: OpenClawPluginApi): void {
  const pluginConfig = (api.pluginConfig ?? {}) as ClawForgePluginConfig;

  // Register the /clawforge-login command for manual SSO login.
  api.registerCommand({
    name: "clawforge-login",
    description: "Authenticate with your organization's SSO via ClawForge",
    acceptsArgs: false,
    handler: async () => {
      try {
        const { performSsoLogin } = await import("./auth/sso.js");
        const session = await performSsoLogin(pluginConfig);
        return { text: `Logged in as ${session.email ?? session.userId} (org: ${session.orgId})` };
      } catch (err) {
        return { text: `Login failed: ${String(err)}` };
      }
    },
  });

  // Register the /clawforge-enroll command for enrollment token auth.
  api.registerCommand({
    name: "clawforge-enroll",
    description: "Enroll this client with an enrollment token",
    acceptsArgs: true,
    handler: async (ctx) => {
      const args = ctx.args?.trim();
      if (!args) {
        return { text: "Usage: /clawforge-enroll <token> <email> [name]" };
      }

      const parts = args.split(/\s+/);
      if (parts.length < 2) {
        return { text: "Usage: /clawforge-enroll <token> <email> [name]" };
      }

      const [token, email, ...nameParts] = parts;
      const name = nameParts.length > 0 ? nameParts.join(" ") : undefined;

      if (!pluginConfig.controlPlaneUrl) {
        return { text: "ClawForge: controlPlaneUrl not configured in plugin settings." };
      }

      try {
        const res = await fetch(`${pluginConfig.controlPlaneUrl}/api/v1/auth/enroll`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, email, name }),
        });

        if (!res.ok) {
          const body = await res.text();
          return { text: `Enrollment failed (${res.status}): ${body}` };
        }

        const data = (await res.json()) as {
          accessToken: string;
          refreshToken: string;
          expiresAt: number;
          userId: string;
          orgId: string;
          email: string;
          roles: string[];
        };

        saveSession({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          expiresAt: data.expiresAt,
          userId: data.userId,
          orgId: data.orgId,
          email: data.email,
          roles: data.roles,
        });

        return { text: `Enrolled as ${data.email} (org: ${data.orgId}). Restart to activate policy enforcement.` };
      } catch (err) {
        return { text: `Enrollment failed: ${String(err)}` };
      }
    },
  });

  // Register the /clawforge-submit command for skill submission.
  api.registerCommand({
    name: "clawforge-submit",
    description: "Submit a skill for organization approval (provide skill name or path)",
    acceptsArgs: true,
    handler: async (ctx) => {
      const skillNameOrPath = ctx.args?.trim();
      if (!skillNameOrPath) {
        return { text: "Usage: /clawforge-submit <skill-name-or-path>" };
      }

      const session = loadSession();
      if (!isSessionValid(session)) {
        return { text: "ClawForge: Not authenticated. Use /clawforge-login first." };
      }

      if (!pluginConfig.controlPlaneUrl) {
        return { text: "ClawForge: controlPlaneUrl not configured." };
      }

      try {
        const { bundleSkillForSubmission, submitSkillToControlPlane, formatScanSummary } =
          await import("./skills/submit-command.js");

        const bundle = await bundleSkillForSubmission(skillNameOrPath, api.config.skills?.load?.extraDirs?.[0]);

        const scanSummary = formatScanSummary(bundle.scanResults);

        const result = await submitSkillToControlPlane({
          controlPlaneUrl: pluginConfig.controlPlaneUrl,
          orgId: session!.orgId || pluginConfig.orgId || "",
          accessToken: session!.accessToken,
          bundle,
        });

        const lines = [
          `Skill "${bundle.skillName}" submitted for review.`,
          `Submission ID: ${result.id}`,
          `Status: ${result.status}`,
          ``,
          `Security scan:`,
          scanSummary,
        ];

        if (bundle.scanResults.critical > 0) {
          lines.push("", "Note: Critical security issues were found. The admin will see these during review.");
        }

        return { text: lines.join("\n") };
      } catch (err) {
        return { text: `Skill submission failed: ${String(err)}` };
      }
    },
  });

  // Register the /clawforge-status command.
  api.registerCommand({
    name: "clawforge-status",
    description: "Show ClawForge enterprise governance status",
    acceptsArgs: false,
    handler: () => {
      const session = loadSession();
      if (!isSessionValid(session)) {
        const connStatus = sharedConnectionStateManager?.getStatus();
        const lines = [
          `ClawForge Status:`,
          `  Connection: ${connStatus?.state ?? "unauthenticated"}`,
          `  Not authenticated. Use /clawforge-login to connect.`,
        ];
        return { text: lines.join("\n") };
      }

      const cached = loadCachedPolicy(pluginConfig.policyCacheTtlMs);
      const livePolicy = sharedEnforcerState?.policy;
      const connStatus = sharedConnectionStateManager?.getStatus();
      const auditBufferSize = sharedAuditLogger?.bufferSize ?? 0;
      const auditBufferCapacity = sharedAuditLogger?.bufferCapacity ?? 0;

      // Use live enforcer state for kill switch (updated via heartbeat/SSE),
      // falling back to cached policy only if enforcer state is unavailable.
      const killSwitchActive = sharedEnforcerState?.killSwitchActive ?? cached?.killSwitch?.active ?? false;
      const killSwitchMessage = sharedEnforcerState?.killSwitchMessage;
      const policyVersion = livePolicy?.version ?? cached?.version;
      const auditLevel = livePolicy?.auditLevel ?? cached?.auditLevel;

      const lines = [
        `ClawForge Status:`,
        `  User: ${session!.email ?? session!.userId}`,
        `  Org: ${session!.orgId}`,
        `  Connection: ${connStatus?.state ?? "unknown"}`,
        `  Last Heartbeat: ${connStatus?.lastSuccessfulHeartbeat ? connStatus.lastSuccessfulHeartbeat.toISOString() : "never"}`,
        `  Heartbeat Failures: ${connStatus?.consecutiveFailures ?? 0}`,
        `  Policy: ${policyVersion ? `v${policyVersion}` : "not loaded"}`,
        `  Cached Policy Age: ${connStatus?.cachedPolicyAge != null ? formatDuration(connStatus.cachedPolicyAge) : "n/a"}`,
        `  Kill Switch: ${killSwitchActive ? `ACTIVE${killSwitchMessage ? ` — ${killSwitchMessage}` : ""}` : "inactive"}`,
        `  Audit Level: ${auditLevel ?? "unknown"}`,
        `  Audit Buffer: ${auditBufferSize} / ${auditBufferCapacity}`,
        `  Offline Mode: ${pluginConfig.offlineMode ?? "block"}`,
      ];
      return { text: lines.join("\n") };
    },
  });

  api.registerCommand({
    name: "clawforge-pr-merge-run",
    description: "Run ClawForge PR automation once (dry-run or merge)",
    acceptsArgs: true,
    handler: async (ctx) => {
      const modeArg = ctx.args?.trim().toLowerCase();
      const forceMode = modeArg === "merge" ? "merge" : modeArg === "dry-run" || modeArg === "dryrun" ? "dry-run" : undefined;
      try {
        const result = await runPullRequestAutomation(api, pluginConfig, { forceMode });
        const merged = result.merged
          ? `Selected PR #${result.merged.number} — ${result.merged.title}`
          : "No eligible PR was selected.";
        return {
          text: [
            `PR automation completed (${result.mode}) for ${result.repository}.`,
            merged,
            result.skippedReasons.length ? `Skipped: ${result.skippedReasons.join(" | ")}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        };
      } catch (err) {
        return { text: `PR automation failed: ${String(err)}` };
      }
    },
  });

  // --- Synchronous hook registration ---
  // Create enforcer state with conservative defaults (block-all until init completes).
  // initializeClawForge() will populate this with real policy data.
  const enforcerState: ToolEnforcerState = {
    policy: null,
    killSwitchActive: false,
    pendingInit: true,
  };
  sharedEnforcerState = enforcerState;

  // Create a no-op audit logger placeholder; replaced by the real one during init.
  let activeAuditLogger: AuditLogger | null = null;
  const auditProxy: Pick<AuditLogger, "enqueue"> = {
    enqueue: (event) => activeAuditLogger?.enqueue(event),
  };

  // Register before_tool_call hook SYNCHRONOUSLY so it's in registry.typedHooks
  // before the first tool call, regardless of async init timing.
  const toolEnforcerHook = createToolEnforcerHook(enforcerState, auditProxy);
  api.on("before_tool_call", toolEnforcerHook, { priority: 1000 });

  // Fire-and-forget async init.
  let initialized = false;
  const doInit = async () => {
    if (initialized) return;
    initialized = true;
    try {
      await initializeClawForge(api, pluginConfig, enforcerState, (logger) => {
        activeAuditLogger = logger;
      });
    } catch (err) {
      api.logger.error(`ClawForge initialization failed: ${String(err)}`);
    }
  };

  doInit();

  let stopPrAutomationScheduler: (() => void) | null = null;

  // Also listen for gateway_start as a fallback (ensures init if register
  // runs before config is fully resolved in some edge cases).
  api.on("gateway_start", () => {
    doInit();
    if (!stopPrAutomationScheduler) {
      stopPrAutomationScheduler = createPullRequestAutomationScheduler(api, pluginConfig);
    }
  });

  api.on("gateway_stop", () => {
    stopPrAutomationScheduler?.();
    stopPrAutomationScheduler = null;
  });
}
