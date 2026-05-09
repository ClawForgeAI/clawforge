import { z } from "zod";
import { OrgId, UserId } from "./common.js";
import { OrgPolicy } from "./policy.js";

/**
 * On-disk session shape persisted by the plugin at
 * `~/.openclaw/clawforge/session.json` (mode 0o600). Returned by
 * `POST /api/v1/auth/exchange|login|enroll`.
 */
export const SessionTokens = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  expiresAt: z.number().int().optional(),
  userId: UserId,
  orgId: OrgId,
  email: z.string().optional(),
  roles: z.array(z.string()).optional(),
});
export type SessionTokens = z.infer<typeof SessionTokens>;

/**
 * Plugin-side wrapper used by the on-disk policy cache at
 * `~/.openclaw/clawforge/org-policy.json`.
 */
export const CachedPolicy = z.object({
  policy: OrgPolicy,
  fetchedAt: z.number().int(),
  ttlMs: z.number().int(),
});
export type CachedPolicy = z.infer<typeof CachedPolicy>;
