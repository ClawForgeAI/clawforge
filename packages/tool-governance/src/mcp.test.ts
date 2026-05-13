import { describe, expect, it } from "vitest";
import { resolveMcpAccess } from "./mcp.js";

const tool = { serverName: "github", toolName: "create_issue" };

describe("resolveMcpAccess", () => {
  it("defaults to allow when no rules apply", () => {
    expect(resolveMcpAccess(tool, {})).toBe("allow");
  });

  it("denies via string server match", () => {
    expect(resolveMcpAccess(tool, { deny: ["github"] })).toBe("deny");
  });

  it("denies via 'server:tool' pinpoint", () => {
    expect(resolveMcpAccess(tool, { deny: ["github:create_issue"] })).toBe("deny");
  });

  it("does not deny when 'server:other_tool' is denied", () => {
    expect(resolveMcpAccess(tool, { deny: ["github:list_issues"] })).toBe("allow");
  });

  it("requires approval when matched and not denied", () => {
    expect(resolveMcpAccess(tool, { requireApproval: ["github"] })).toBe("require_approval");
  });

  it("when allowlist exists but tool not in it, denies", () => {
    expect(resolveMcpAccess(tool, { allow: ["other-server"] })).toBe("deny");
  });

  it("when allowlist contains the tool, allows", () => {
    expect(resolveMcpAccess(tool, { allow: ["github"] })).toBe("allow");
  });

  it("deny wins over allow and require_approval", () => {
    expect(resolveMcpAccess(tool, { deny: ["github"], allow: ["github"], requireApproval: ["github"] })).toBe("deny");
  });

  it("accepts object form rules", () => {
    expect(resolveMcpAccess(tool, { deny: [{ serverName: "github", toolName: "create_issue" }] })).toBe("deny");
  });
});
