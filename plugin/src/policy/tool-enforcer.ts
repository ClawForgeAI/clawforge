/**
 * Tool policy enforcer for ClawForge.
 * Implements the before_tool_call hook that blocks denied tools and enforces
 * org policy allow/deny lists and the kill switch.
 *
 * Supports offline mode overrides:
 * - 'allow' — Allow all tools when offline
 * - 'cached' — Use last cached policy even if stale
 * - undefined — Normal enforcement (or block-all when kill switch is active)
 */

import type {
  PluginHookBeforeToolCallEvent,
  PluginHookBeforeToolCallResult,
  PluginHookToolContext,
} from "openclaw/plugin-sdk";
import type { OrgPolicy } from "../types.js";
import type { AuditLogger } from "../audit/audit-logger.js";
import type { ConnectionStateManager } from "../connection/connection-state.js";

/**
 * Normalize a tool name for comparison (lowercase, trim, resolve aliases).
 * Mirrors the normalizeToolName logic from src/agents/tool-policy.ts.
 */
const TOOL_NAME_ALIASES: Record<string, string> = {
  bash: "exec",
  "apply-patch": "apply_patch",
};

function normalizeToolName(name: string): string {
  const normalized = name.trim().toLowerCase();
  return TOOL_NAME_ALIASES[normalized] ?? normalized;
}

/**
 * Well-known tool groups, mirroring src/agents/tool-policy.ts.
 */
const TOOL_GROUPS: Record<string, string[]> = {
  "group:memory": ["memory_search", "memory_get"],
  "group:web": ["web_search", "web_fetch"],
  "group:fs": ["read", "write", "edit", "apply_patch"],
  "group:runtime": ["exec", "process"],
  "group:sessions": [
    "sessions_list",
    "sessions_history",
    "sessions_send",
    "sessions_spawn",
    "subagents",
    "session_status",
  ],
  "group:ui": ["browser", "canvas"],
  "group:media": ["image", "tts"],
  "group:automation": ["cron", "gateway"],
  "group:messaging": ["message"],
  "group:agents": ["agents_list"],
  "group:nodes": ["nodes"],
};

function expandGroups(list: string[]): Set<string> {
  const expanded = new Set<string>();
  for (const entry of list) {
    const normalized = normalizeToolName(entry);
    const group = TOOL_GROUPS[normalized];
    if (group) {
      for (const tool of group) {
        expanded.add(tool);
      }
    } else {
      expanded.add(normalized);
    }
  }
  return expanded;
}

/**
 * Shell commands that perform filesystem read operations.
 * When group:fs is denied, exec calls using these commands are also blocked
 * to prevent bypassing filesystem restrictions via shell.
 */
const FS_READ_COMMANDS = new Set([
  "ls", "cat", "head", "tail", "less", "more", "find", "locate",
  "tree", "stat", "file", "du", "wc", "od", "xxd", "hexdump",
  "strings", "readlink", "realpath", "basename", "dirname",
  "diff", "cmp", "md5sum", "sha256sum", "shasum",
]);

/**
 * Shell commands that perform filesystem write operations.
 * When group:fs is denied, exec calls using these commands are also blocked.
 */
const FS_WRITE_COMMANDS = new Set([
  "cp", "mv", "rm", "mkdir", "rmdir", "touch", "chmod", "chown",
  "chgrp", "ln", "install", "mktemp", "truncate", "shred",
  "tar", "zip", "unzip", "gzip", "gunzip", "bzip2",
]);

/** All filesystem-related shell commands. */
const FS_ALL_COMMANDS = new Set([...FS_READ_COMMANDS, ...FS_WRITE_COMMANDS]);

/**
 * Extract the leading command name from a shell command string.
 * Handles env vars, sudo prefixes, and piped/chained commands.
 */
function extractCommandNames(command: string): string[] {
  const names: string[] = [];
  // Split on pipes, &&, ||, and ; to get individual commands
  const segments = command.split(/[|;&]/).map((s) => s.trim()).filter(Boolean);
  for (const segment of segments) {
    // Strip leading env vars (FOO=bar), sudo, env, etc.
    const tokens = segment.split(/\s+/);
    for (const token of tokens) {
      if (token.includes("=") || token === "sudo" || token === "env" || token === "nohup") {
        continue;
      }
      // Get just the binary name (strip path)
      const bin = token.split("/").pop() ?? token;
      if (bin) {
        names.push(bin.toLowerCase());
      }
      break;
    }
  }
  return names;
}

/**
 * Check if an exec call should be blocked because it uses filesystem commands
 * while group:fs is denied in the policy.
 */
function isExecBlockedByFsDeny(
  denySet: Set<string>,
  params: Record<string, unknown>,
): boolean {
  // Only apply if filesystem tools are denied (group:fs was expanded into these)
  const fsToolsDenied = denySet.has("read") || denySet.has("write") || denySet.has("edit");
  if (!fsToolsDenied) return false;

  const command = (params.command ?? params.cmd ?? "") as string;
  if (!command) return false;

  const commandNames = extractCommandNames(command);
  return commandNames.some((name) => FS_ALL_COMMANDS.has(name));
}

export type ToolEnforcerState = {
  policy: OrgPolicy | null;
  killSwitchActive: boolean;
  killSwitchMessage?: string;
  /**
   * Offline override set by the KillSwitchManager when the failure threshold is reached.
   * - 'allow' — bypass all policy checks and allow all tools
   * - 'cached' — use the cached policy for enforcement (even if stale)
   * - undefined — normal enforcement
   */
  offlineOverride?: "allow" | "cached";
};

/**
 * Create the before_tool_call hook handler for org policy enforcement.
 */
export function createToolEnforcerHook(
  state: ToolEnforcerState,
  auditLogger: AuditLogger,
  connectionStateManager?: ConnectionStateManager,
): (
  event: PluginHookBeforeToolCallEvent,
  ctx: PluginHookToolContext,
) => PluginHookBeforeToolCallResult | undefined {
  return (
    event: PluginHookBeforeToolCallEvent,
    ctx: PluginHookToolContext,
  ): PluginHookBeforeToolCallResult | undefined => {
    const toolName = normalizeToolName(event.toolName);

    // Check offline override before kill switch.
    if (state.offlineOverride === "allow") {
      auditLogger.enqueue({
        eventType: "tool_call_attempt",
        toolName,
        outcome: "allowed",
        agentId: ctx.agentId,
        sessionKey: ctx.sessionKey,
        metadata: { reason: "offline_allow_mode" },
      });
      return undefined;
    }

    if (state.offlineOverride === "cached") {
      // Use cached policy for enforcement; skip the kill switch check
      // since we are intentionally operating with stale data.
      return enforcePolicy(state.policy, toolName, event, ctx, auditLogger, "offline_cached_mode");
    }

    // 1. Kill switch check
    if (state.killSwitchActive) {
      const reason =
        state.killSwitchMessage ?? "ClawForge: All tool calls blocked by organization kill switch";
      auditLogger.enqueue({
        eventType: "tool_call_attempt",
        toolName,
        outcome: "blocked",
        agentId: ctx.agentId,
        sessionKey: ctx.sessionKey,
        metadata: { reason: "kill_switch" },
      });
      return { block: true, blockReason: reason };
    }

    return enforcePolicy(state.policy, toolName, event, ctx, auditLogger);
  };
}

/**
 * Enforce policy allow/deny lists on a tool call.
 */
function enforcePolicy(
  policy: OrgPolicy | null,
  toolName: string,
  event: PluginHookBeforeToolCallEvent,
  ctx: PluginHookToolContext,
  auditLogger: AuditLogger,
  modeReason?: string,
): PluginHookBeforeToolCallResult | undefined {
  if (!policy) {
    // No policy loaded - allow by default
    auditLogger.enqueue({
      eventType: "tool_call_attempt",
      toolName,
      outcome: "allowed",
      agentId: ctx.agentId,
      sessionKey: ctx.sessionKey,
      metadata: { reason: modeReason ?? "no_policy" },
    });
    return undefined;
  }

  // Deny list check
  if (policy.tools.deny && policy.tools.deny.length > 0) {
    const denySet = expandGroups(policy.tools.deny);
    if (denySet.has(toolName)) {
      auditLogger.enqueue({
        eventType: "tool_call_attempt",
        toolName,
        outcome: "blocked",
        agentId: ctx.agentId,
        sessionKey: ctx.sessionKey,
        metadata: { reason: modeReason ? `deny_list (${modeReason})` : "deny_list" },
      });
      return {
        block: true,
        blockReason: `ClawForge: Tool "${event.toolName}" is blocked by organization policy`,
      };
    }

    // When filesystem tools are denied, also block exec calls that run
    // filesystem commands (ls, cat, find, etc.) to prevent policy bypass.
    if (toolName === "exec" && isExecBlockedByFsDeny(denySet, event.params)) {
      const command = (event.params.command ?? event.params.cmd ?? "") as string;
      auditLogger.enqueue({
        eventType: "tool_call_attempt",
        toolName,
        outcome: "blocked",
        agentId: ctx.agentId,
        sessionKey: ctx.sessionKey,
        metadata: { reason: modeReason ? `fs_deny_exec (${modeReason})` : "fs_deny_exec", command },
      });
      return {
        block: true,
        blockReason: `ClawForge: Shell command blocked — filesystem access is denied by organization policy`,
      };
    }
  }

  // Allow list check
  if (policy.tools.allow && policy.tools.allow.length > 0) {
    const allowSet = expandGroups(policy.tools.allow);
    if (!allowSet.has(toolName)) {
      auditLogger.enqueue({
        eventType: "tool_call_attempt",
        toolName,
        outcome: "blocked",
        agentId: ctx.agentId,
        sessionKey: ctx.sessionKey,
        metadata: { reason: modeReason ? `not_in_allowlist (${modeReason})` : "not_in_allowlist" },
      });
      return {
        block: true,
        blockReason: `ClawForge: Tool "${event.toolName}" is not in the organization's allowed tools list`,
      };
    }
  }

  // Allowed
  auditLogger.enqueue({
    eventType: "tool_call_attempt",
    toolName,
    outcome: "allowed",
    agentId: ctx.agentId,
    sessionKey: ctx.sessionKey,
    metadata: modeReason ? { reason: modeReason } : undefined,
  });

  return undefined;
}
