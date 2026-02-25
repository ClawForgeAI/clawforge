/**
 * Local cache for org policies, providing offline resilience.
 * Caches to ~/.ClawForgeAI/clawforge/org-policy.json with a configurable TTL.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { CachedPolicy, OrgPolicy } from "../types.js";

const CLAWFORGE_DIR = path.join(os.homedir(), ".openclaw", "clawforge");
const CACHE_FILE = path.join(CLAWFORGE_DIR, "org-policy.json");
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

function ensureDir(): void {
  fs.mkdirSync(CLAWFORGE_DIR, { recursive: true });
}

export function loadCachedPolicy(ttlMs?: number): OrgPolicy | null {
  try {
    const raw = fs.readFileSync(CACHE_FILE, "utf-8");
    const cached = JSON.parse(raw) as CachedPolicy;
    const ttl = ttlMs ?? cached.ttlMs ?? DEFAULT_TTL_MS;
    if (Date.now() - cached.fetchedAt > ttl) {
      return null; // Cache expired
    }
    return cached.policy;
  } catch {
    return null;
  }
}

export function saveCachedPolicy(policy: OrgPolicy, ttlMs?: number): void {
  ensureDir();
  const cached: CachedPolicy = {
    policy,
    fetchedAt: Date.now(),
    ttlMs: ttlMs ?? DEFAULT_TTL_MS,
  };
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cached, null, 2), { mode: 0o600 });
}

/**
 * Load cached policy without TTL check (for use as fallback when fetch fails).
 */
export function loadCachedPolicyFallback(): OrgPolicy | null {
  try {
    const raw = fs.readFileSync(CACHE_FILE, "utf-8");
    const cached = JSON.parse(raw) as CachedPolicy;
    return cached.policy;
  } catch {
    return null;
  }
}
