/**
 * MCP (Model Context Protocol) governance helpers.
 *
 * Placeholder surface for Phase 2 — the strategy doc treats MCP as a
 * first-class policy surface (per-runtime tool visibility, connector
 * overlays, auto-approve / human-gate decisions per tool/connector). For
 * now this module exposes the shape we'll fill in once at least one
 * adapter (Claude Code) actually talks to MCP servers.
 */

export type McpServerRef = {
  /** Stable name as it appears in the adapter's MCP config. */
  name: string;
  /** Free-form transport descriptor (stdio command, http url, etc.). */
  transport: string;
};

export type McpToolRef = {
  serverName: string;
  toolName: string;
};

export type McpAccessDecision = "allow" | "deny" | "require_approval";

/**
 * Resolve the access decision for a single MCP tool given an allow/deny
 * list and an approval-required list. Defaults to "allow" when no list
 * applies — Phase 2 will lift this default behind an org-level toggle.
 */
export function resolveMcpAccess(
  ref: McpToolRef,
  rules: {
    allow?: Array<string | McpToolRef>;
    deny?: Array<string | McpToolRef>;
    requireApproval?: Array<string | McpToolRef>;
  },
): McpAccessDecision {
  if (rules.deny && rules.deny.some((r) => matches(r, ref))) return "deny";
  if (rules.requireApproval && rules.requireApproval.some((r) => matches(r, ref))) return "require_approval";
  if (rules.allow && rules.allow.length > 0) {
    return rules.allow.some((r) => matches(r, ref)) ? "allow" : "deny";
  }
  return "allow";
}

function matches(rule: string | McpToolRef, ref: McpToolRef): boolean {
  if (typeof rule === "string") {
    // String form: "<server>" matches all tools on that server,
    // "<server>:<tool>" matches a single tool.
    if (!rule.includes(":")) return rule === ref.serverName;
    const [server, tool] = rule.split(":", 2);
    return server === ref.serverName && tool === ref.toolName;
  }
  return rule.serverName === ref.serverName && rule.toolName === ref.toolName;
}
