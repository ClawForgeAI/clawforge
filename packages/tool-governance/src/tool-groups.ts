/**
 * Tool name normalization, group expansion, and shell-bypass detection.
 *
 * Moved verbatim from `plugin/src/policy/tool-enforcer.ts` so the same logic
 * works in plugin enforcement, server policy preview, and admin policy UI.
 * Behavior must remain identical — tested against the plugin's existing
 * test suite.
 */

const TOOL_NAME_ALIASES: Record<string, string> = {
  bash: "exec",
  "apply-patch": "apply_patch",
};

export function normalizeToolName(name: string): string {
  const normalized = name.trim().toLowerCase();
  return TOOL_NAME_ALIASES[normalized] ?? normalized;
}

/** Well-known tool groups, mirroring `src/agents/tool-policy.ts` in OpenClaw. */
export const TOOL_GROUPS: Record<string, string[]> = {
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

export function expandGroups(list: string[]): Set<string> {
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
 * Shell commands that perform filesystem read operations. When `group:fs` is
 * denied, exec calls using these commands are also blocked to prevent
 * bypassing filesystem restrictions via shell.
 */
export const FS_READ_COMMANDS: ReadonlySet<string> = new Set([
  "ls",
  "cat",
  "head",
  "tail",
  "less",
  "more",
  "find",
  "locate",
  "tree",
  "stat",
  "file",
  "du",
  "wc",
  "od",
  "xxd",
  "hexdump",
  "strings",
  "readlink",
  "realpath",
  "basename",
  "dirname",
  "diff",
  "cmp",
  "md5sum",
  "sha256sum",
  "shasum",
]);

/** Shell commands that perform filesystem write operations. */
export const FS_WRITE_COMMANDS: ReadonlySet<string> = new Set([
  "cp",
  "mv",
  "rm",
  "mkdir",
  "rmdir",
  "touch",
  "chmod",
  "chown",
  "chgrp",
  "ln",
  "install",
  "mktemp",
  "truncate",
  "shred",
  "tar",
  "zip",
  "unzip",
  "gzip",
  "gunzip",
  "bzip2",
]);

/** All filesystem-related shell commands. */
export const FS_ALL_COMMANDS: ReadonlySet<string> = new Set([...FS_READ_COMMANDS, ...FS_WRITE_COMMANDS]);

/**
 * Extract the leading command name(s) from a shell command string.
 * Handles env vars, sudo prefixes, and piped/chained commands.
 *
 * Examples:
 *   "ls -la"                          -> ["ls"]
 *   "FOO=bar sudo cat /tmp/x"         -> ["cat"]
 *   "rm /tmp/x && echo done"          -> ["rm", "echo"]
 *   "ls | head"                       -> ["ls", "head"]
 */
export function extractCommandNames(command: string): string[] {
  const names: string[] = [];
  const segments = command
    .split(/[|;&]/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const segment of segments) {
    const tokens = segment.split(/\s+/);
    for (const token of tokens) {
      if (token.includes("=") || token === "sudo" || token === "env" || token === "nohup") {
        continue;
      }
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
 * Check if an `exec` call should be blocked because it uses filesystem
 * commands while `group:fs` is denied in the policy.
 *
 * Caller passes the already-expanded deny set (after `expandGroups`).
 */
export function isExecBlockedByFsDeny(denySet: Set<string>, params: Record<string, unknown>): boolean {
  const fsToolsDenied = denySet.has("read") || denySet.has("write") || denySet.has("edit");
  if (!fsToolsDenied) return false;

  const command = (params.command ?? params.cmd ?? "") as string;
  if (!command) return false;

  const commandNames = extractCommandNames(command);
  return commandNames.some((name) => FS_ALL_COMMANDS.has(name));
}
