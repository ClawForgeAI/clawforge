/**
 * Session token persistence for ClawForge.
 * Stores and retrieves session tokens at ~/.ClawForgeAI/clawforge/session.json.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { SessionTokens } from "../types.js";

const CLAWFORGE_DIR = path.join(os.homedir(), ".openclaw", "clawforge");
const SESSION_FILE = path.join(CLAWFORGE_DIR, "session.json");

function ensureDir(): void {
  fs.mkdirSync(CLAWFORGE_DIR, { recursive: true });
}

export function loadSession(): SessionTokens | null {
  try {
    const raw = fs.readFileSync(SESSION_FILE, "utf-8");
    return JSON.parse(raw) as SessionTokens;
  } catch {
    return null;
  }
}

export function saveSession(tokens: SessionTokens): void {
  ensureDir();
  fs.writeFileSync(SESSION_FILE, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

export function clearSession(): void {
  try {
    fs.unlinkSync(SESSION_FILE);
  } catch {
    // Ignore if file does not exist.
  }
}

export function isSessionValid(tokens: SessionTokens | null): boolean {
  if (!tokens?.accessToken) {
    return false;
  }
  if (tokens.expiresAt && Date.now() >= tokens.expiresAt) {
    return false;
  }
  return true;
}
