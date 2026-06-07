import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadCachedPolicy, saveCachedPolicy, loadCachedPolicyFallback } from "./org-policy-cache.js";
import type { OrgPolicy } from "../types.js";

const CLAWFORGE_DIR = path.join(os.homedir(), ".openclaw", "clawforge");
const CACHE_FILE = path.join(CLAWFORGE_DIR, "org-policy.json");

function makePolicy(): OrgPolicy {
  return {
    version: 3,
    tools: { allow: ["read", "write"], deny: ["exec"] },
    skills: { approved: [], requireApproval: false },
    killSwitch: { active: false },
    auditLevel: "metadata",
  };
}

describe("org-policy-cache", () => {
  let originalContent: string | null = null;

  beforeEach(() => {
    // Preserve any existing cache file.
    try {
      originalContent = fs.readFileSync(CACHE_FILE, "utf-8");
    } catch {
      originalContent = null;
    }
  });

  afterEach(() => {
    // Restore original state.
    if (originalContent !== null) {
      fs.writeFileSync(CACHE_FILE, originalContent);
    } else {
      try {
        fs.unlinkSync(CACHE_FILE);
      } catch {
        // Ignore.
      }
    }
  });

  it("returns null when no cache file exists", () => {
    try {
      fs.unlinkSync(CACHE_FILE);
    } catch {
      // Ignore.
    }
    expect(loadCachedPolicy()).toBeNull();
  });

  it("saves and loads a policy from cache", () => {
    const policy = makePolicy();
    saveCachedPolicy(policy, 60_000);
    const loaded = loadCachedPolicy(60_000);
    expect(loaded).toEqual(policy);
  });

  it("returns null when cache has expired", () => {
    const policy = makePolicy();
    saveCachedPolicy(policy, 1); // 1ms TTL
    // Wait for expiry.
    const start = Date.now();
    while (Date.now() - start < 5) {
      // Busy-wait.
    }
    expect(loadCachedPolicy(1)).toBeNull();
  });

  it("loadCachedPolicyFallback ignores TTL", () => {
    const policy = makePolicy();
    saveCachedPolicy(policy, 1); // 1ms TTL
    const start = Date.now();
    while (Date.now() - start < 5) {
      // Busy-wait.
    }
    // Regular load returns null.
    expect(loadCachedPolicy(1)).toBeNull();
    // Fallback still returns the policy.
    expect(loadCachedPolicyFallback()).toEqual(policy);
  });
});
