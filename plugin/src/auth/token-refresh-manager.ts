/**
 * Proactive token refresh manager for ClawForge.
 *
 * Checks token expiry every 60 seconds and refreshes the access token
 * 5 minutes before it expires. Persists the new session to disk and
 * notifies consumers via a callback so all components stay up-to-date.
 *
 * Follows the same start()/stop() lifecycle as KillSwitchManager.
 */

import type { SessionTokens } from "../types.js";
import { refreshSessionToken } from "../policy/org-policy-client.js";
import { saveSession } from "./token-store.js";

const CHECK_INTERVAL_MS = 60_000;
const REFRESH_BUFFER_MS = 5 * 60_000; // refresh 5 minutes before expiry
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 5_000;

export type TokenRefreshLogger = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
};

export class TokenRefreshManager {
  private timer: ReturnType<typeof setInterval> | null = null;
  private refreshing = false;

  private readonly controlPlaneUrl: string;
  private session: SessionTokens;
  private readonly onTokenRefreshed?: (session: SessionTokens) => void;
  private readonly logger?: TokenRefreshLogger;

  constructor(params: {
    controlPlaneUrl: string;
    session: SessionTokens;
    onTokenRefreshed?: (session: SessionTokens) => void;
    logger?: TokenRefreshLogger;
  }) {
    this.controlPlaneUrl = params.controlPlaneUrl;
    this.session = params.session;
    this.onTokenRefreshed = params.onTokenRefreshed;
    this.logger = params.logger;
  }

  start(): void {
    if (this.timer) return;

    if (!this.controlPlaneUrl || !this.session.refreshToken) {
      this.logger?.info(
        "TokenRefreshManager: skipping (no controlPlaneUrl or refreshToken)",
      );
      return;
    }

    this.timer = setInterval(() => {
      this.checkAndRefresh().catch((err) => {
        this.logger?.warn(`TokenRefreshManager: check error: ${String(err)}`);
      });
    }, CHECK_INTERVAL_MS);

    if (this.timer.unref) {
      this.timer.unref();
    }

    this.logger?.info("TokenRefreshManager: started");
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async checkAndRefresh(): Promise<void> {
    if (this.refreshing) return;

    const { expiresAt } = this.session;
    if (!expiresAt) return;

    const now = Date.now();
    const msUntilExpiry = expiresAt - now;

    if (msUntilExpiry > REFRESH_BUFFER_MS) {
      return; // token is still fresh
    }

    this.logger?.info(
      `TokenRefreshManager: token expires in ${Math.round(msUntilExpiry / 1000)}s, refreshing...`,
    );

    this.refreshing = true;
    try {
      await this.refreshWithRetry();
    } finally {
      this.refreshing = false;
    }
  }

  private async refreshWithRetry(): Promise<void> {
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const newSession = await refreshSessionToken({
          controlPlaneUrl: this.controlPlaneUrl,
          refreshToken: this.session.refreshToken!,
        });

        // Persist to disk (rolling refresh token)
        saveSession(newSession);

        // Update internal state
        this.session = newSession;

        // Notify consumers
        this.onTokenRefreshed?.(newSession);

        this.logger?.info("TokenRefreshManager: access token refreshed successfully");
        return;
      } catch (err) {
        lastError = err;
        const delayMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
        this.logger?.warn(
          `TokenRefreshManager: refresh attempt ${attempt + 1}/${MAX_RETRIES} failed: ${String(err)}. Retrying in ${delayMs / 1000}s...`,
        );

        if (attempt < MAX_RETRIES - 1) {
          await this.sleep(delayMs);
        }
      }
    }

    this.logger?.error(
      `TokenRefreshManager: all ${MAX_RETRIES} refresh attempts failed: ${String(lastError)}`,
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
