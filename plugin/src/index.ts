/**
 * ClawForge enterprise governance plugin.
 *
 * Registers hooks for:
 * - SSO authentication on gateway start
 * - Org policy fetch and caching
 * - Tool policy enforcement (before_tool_call)
 * - Audit logging (before_tool_call, after_tool_call, session lifecycle)
 * - Kill switch heartbeat
 * - Skill filtering via config population
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { ClawForgePluginConfig, OrgPolicy } from "./types.js";
import { loadSession, isSessionValid, saveSession } from "./auth/token-store.js";
import { fetchEffectivePolicy, refreshSessionToken } from "./policy/org-policy-client.js";
import {
  loadCachedPolicy,
  saveCachedPolicy,
  loadCachedPolicyFallback,
} from "./policy/org-policy-cache.js";
import { createToolEnforcerHook, type ToolEnforcerState } from "./policy/tool-enforcer.js";
import { buildSkillsEnterpriseConfig } from "./policy/skill-filter.js";
import { AuditLogger } from "./audit/audit-logger.js";
import { KillSwitchManager } from "./heartbeat/kill-switch.js";
import { SSEClient } from "./events/sse-client.js";

/**
 * Initialize the ClawForge plugin: authenticate, fetch policy, set up hooks.
 */
async function initializeClawForge(
  api: OpenClawPluginApi,
  pluginConfig: ClawForgePluginConfig,
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
        logger.warn?.(`Session refresh failed: ${String(err)}. Use /clawforge-login to re-authenticate.`);
        session = null;
      }
    } else {
      logger.warn?.("No valid ClawForge session. Use /clawforge-login to authenticate.");
      session = null;
    }
  }

  if (!session) {
    logger.info("ClawForge running in unauthenticated mode (policy enforcement disabled)");
    return;
  }

  const orgId = session.orgId || pluginConfig.orgId || "";

  // --- 2. Fetch policy ---
  let policy: OrgPolicy | null = null;
  const cacheTtl = pluginConfig.policyCacheTtlMs;

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
    } catch (err) {
      logger.warn?.(`Policy fetch failed: ${String(err)}`);
      // Fall back to expired cache.
      policy = loadCachedPolicyFallback();
      if (policy) {
        logger.info("Using cached policy (may be stale)");
      }
    }
  } else if (policy) {
    // Cache hit; async refresh in background.
    if (pluginConfig.controlPlaneUrl) {
      fetchEffectivePolicy({
        controlPlaneUrl: pluginConfig.controlPlaneUrl,
        orgId,
        userId: session.userId,
        accessToken: session.accessToken,
      })
        .then((fresh) => {
          saveCachedPolicy(fresh, cacheTtl);
          enforcerState.policy = fresh;
          auditLogger.updateAuditLevel(fresh.auditLevel);
          logger.info("Org policy refreshed in background");
        })
        .catch((err) => {
          logger.warn?.(`Background policy refresh failed: ${String(err)}`);
        });
    }
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
      logger.warn?.(`Kill switch is active: ${policy.killSwitch.message ?? "No message"}`);
    }
  }

  // --- 4. Set up enforcer state ---
  const enforcerState: ToolEnforcerState = {
    policy,
    killSwitchActive: policy?.killSwitch?.active ?? false,
    killSwitchMessage: policy?.killSwitch?.message,
  };

  // --- 5. Set up audit logger ---
  const auditLogger = new AuditLogger({
    config: pluginConfig,
    session,
    auditLevel: policy?.auditLevel,
    logger,
  });
  auditLogger.start();

  // --- 6. Register before_tool_call hook (high priority) ---
  const toolEnforcerHook = createToolEnforcerHook(enforcerState, auditLogger);
  api.on("before_tool_call", toolEnforcerHook, { priority: 1000 });

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
      sessionKey: event.sessionId,
    });
  });

  api.on("session_end", (event, ctx) => {
    auditLogger.enqueue({
      eventType: "session_end",
      outcome: "success",
      agentId: ctx.agentId,
      sessionKey: event.sessionId,
      metadata: {
        messageCount: event.messageCount,
        durationMs: event.durationMs,
      },
    });
  });

  // --- 9. Register LLM hooks when auditLevel is "full" ---
  if (policy?.auditLevel === "full") {
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
  }

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
      auditLogger.updateAuditLevel(fresh.auditLevel);
      logger.info("Policy refreshed via heartbeat");
    } catch (err) {
      logger.warn?.(`Heartbeat-triggered policy refresh failed: ${String(err)}`);
    }
  };

  const killSwitchMgr = new KillSwitchManager({
    config: pluginConfig,
    session,
    enforcerState,
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

  // --- 11. Register gateway_stop hook to flush audit ---
  api.on("gateway_stop", async () => {
    killSwitchMgr.stop();
    sseClient?.stop();
    await auditLogger.stop();
    logger.info("ClawForge shutdown: audit events flushed, heartbeat stopped, SSE disconnected");
  });

  logger.info(
    `ClawForge initialized (org=${orgId}, policy v${policy?.version ?? "none"}, audit=${policy?.auditLevel ?? "off"})`,
  );
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
        return { text: "ClawForge: Not authenticated. Use /clawforge-login to connect." };
      }
      const cached = loadCachedPolicy(pluginConfig.policyCacheTtlMs);
      const lines = [
        `ClawForge Status:`,
        `  User: ${session!.email ?? session!.userId}`,
        `  Org: ${session!.orgId}`,
        `  Policy: ${cached ? `v${cached.version}` : "not loaded"}`,
        `  Kill Switch: ${cached?.killSwitch?.active ? "ACTIVE" : "inactive"}`,
        `  Audit Level: ${cached?.auditLevel ?? "unknown"}`,
      ];
      return { text: lines.join("\n") };
    },
  });

  // Initialize on gateway_start.
  api.on("gateway_start", async () => {
    try {
      await initializeClawForge(api, pluginConfig);
    } catch (err) {
      api.logger.error(`ClawForge initialization failed: ${String(err)}`);
    }
  });
}
