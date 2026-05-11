import { describe, expect, it } from "vitest";
import {
  expandGroups,
  extractCommandNames,
  FS_ALL_COMMANDS,
  FS_READ_COMMANDS,
  FS_WRITE_COMMANDS,
  isExecBlockedByFsDeny,
  normalizeToolName,
  TOOL_GROUPS,
} from "./tool-groups.js";

describe("normalizeToolName", () => {
  it("lowercases and trims input", () => {
    expect(normalizeToolName("  READ  ")).toBe("read");
  });

  it("resolves aliases (bash -> exec)", () => {
    expect(normalizeToolName("bash")).toBe("exec");
    expect(normalizeToolName("Bash")).toBe("exec");
  });

  it("resolves apply-patch -> apply_patch", () => {
    expect(normalizeToolName("apply-patch")).toBe("apply_patch");
  });

  it("passes unknown names through unchanged", () => {
    expect(normalizeToolName("web_fetch")).toBe("web_fetch");
  });
});

describe("TOOL_GROUPS and expandGroups", () => {
  it("includes the 11 strategy-doc groups", () => {
    const expected = [
      "group:memory",
      "group:web",
      "group:fs",
      "group:runtime",
      "group:sessions",
      "group:ui",
      "group:media",
      "group:automation",
      "group:messaging",
      "group:agents",
      "group:nodes",
    ];
    for (const g of expected) {
      expect(TOOL_GROUPS[g]).toBeDefined();
    }
  });

  it("expands group:fs into its 4 tools", () => {
    const expanded = expandGroups(["group:fs"]);
    expect([...expanded].sort()).toEqual(["apply_patch", "edit", "read", "write"]);
  });

  it("expands group:runtime", () => {
    const expanded = expandGroups(["group:runtime"]);
    expect([...expanded].sort()).toEqual(["exec", "process"]);
  });

  it("passes non-group entries through normalized", () => {
    const expanded = expandGroups(["Bash", "read"]);
    expect([...expanded].sort()).toEqual(["exec", "read"]);
  });

  it("deduplicates when a group overlaps with an explicit entry", () => {
    const expanded = expandGroups(["group:fs", "read"]);
    // Already includes read; should not duplicate.
    expect([...expanded].filter((t) => t === "read")).toHaveLength(1);
  });
});

describe("FS_*_COMMANDS sets", () => {
  it("FS_ALL_COMMANDS is the union of read and write sets", () => {
    for (const cmd of FS_READ_COMMANDS) expect(FS_ALL_COMMANDS.has(cmd)).toBe(true);
    for (const cmd of FS_WRITE_COMMANDS) expect(FS_ALL_COMMANDS.has(cmd)).toBe(true);
  });

  it("includes core read commands", () => {
    expect(FS_READ_COMMANDS.has("cat")).toBe(true);
    expect(FS_READ_COMMANDS.has("ls")).toBe(true);
  });

  it("includes core write commands", () => {
    expect(FS_WRITE_COMMANDS.has("rm")).toBe(true);
    expect(FS_WRITE_COMMANDS.has("mv")).toBe(true);
  });
});

describe("extractCommandNames", () => {
  it("extracts a simple command", () => {
    expect(extractCommandNames("ls -la")).toEqual(["ls"]);
  });

  it("strips env vars and sudo prefixes", () => {
    expect(extractCommandNames("FOO=bar sudo cat /tmp/x")).toEqual(["cat"]);
    expect(extractCommandNames("env nohup ls")).toEqual(["ls"]);
  });

  it("splits piped commands", () => {
    expect(extractCommandNames("ls | head")).toEqual(["ls", "head"]);
  });

  it("splits && and ;", () => {
    expect(extractCommandNames("rm /tmp/x && echo done")).toEqual(["rm", "echo"]);
    expect(extractCommandNames("cd /tmp; ls")).toEqual(["cd", "ls"]);
  });

  it("strips path components from the binary", () => {
    expect(extractCommandNames("/usr/bin/cat foo")).toEqual(["cat"]);
  });
});

describe("isExecBlockedByFsDeny", () => {
  it("returns false when no fs tools are denied", () => {
    expect(isExecBlockedByFsDeny(new Set(["exec"]), { command: "rm /tmp/x" })).toBe(false);
  });

  it("blocks rm when read+write+edit are denied", () => {
    const deny = new Set(["read", "write", "edit"]);
    expect(isExecBlockedByFsDeny(deny, { command: "rm /tmp/x" })).toBe(true);
  });

  it("blocks even when only one of read/write/edit is denied (read)", () => {
    const deny = new Set(["read"]);
    expect(isExecBlockedByFsDeny(deny, { command: "cat /etc/passwd" })).toBe(true);
  });

  it("blocks through env vars and sudo", () => {
    const deny = new Set(["read", "write", "edit"]);
    expect(isExecBlockedByFsDeny(deny, { command: "FOO=1 sudo cat /etc/passwd" })).toBe(true);
  });

  it("does not block non-fs commands", () => {
    const deny = new Set(["read", "write", "edit"]);
    expect(isExecBlockedByFsDeny(deny, { command: "curl https://example.com" })).toBe(false);
  });

  it("handles missing command param", () => {
    expect(isExecBlockedByFsDeny(new Set(["read"]), {})).toBe(false);
  });

  it("accepts cmd as well as command", () => {
    expect(isExecBlockedByFsDeny(new Set(["read"]), { cmd: "ls /etc" })).toBe(true);
  });
});
